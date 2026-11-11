import { PLAYER_RADIUS } from '@shooter/shared';
import { wallBetween } from '../walls.js';

// Where bots can walk on a block map, worked out from its boxes: a grid of points CELL metres apart, each one a
// spot with a floor under it and room to stand, and the moves between neighbouring points. Floors are the tops
// of boxes, so platforms, stacked containers and ramps all count, each at its own height.
//
// Maps without boxes (Canyon) have no grid: buildNav returns null and bots don't play there.

const CELL = 1;
const HEADROOM = 1.9; // a player is 1.8 m tall
const STEP = 0.6; // highest step between neighbouring points (a 30° ramp rises 0.58 m per metre)
const EDGE = PLAYER_RADIUS - 0.05; // a point needs floor this far around it, so bots keep off edges and walls
const KNEE = 0.7; // moves are checked for walls at this height above the floor

const cache = new Map(); // map id -> nav (or null)

// [min, max] of t where the line o + t·d is inside the box from min to max, or null. Like the slab test, but for
// a whole line.
const lineInterval = (o, d, min, max) => {
    let lo = -Infinity;
    let hi = Infinity;
    for (const axis of ['x', 'y', 'z']) {
        if (Math.abs(d[axis]) < 1e-9) {
            if (o[axis] < min[axis] || o[axis] > max[axis]) return null;
            continue;
        }
        let t1 = (min[axis] - o[axis]) / d[axis];
        let t2 = (max[axis] - o[axis]) / d[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        lo = Math.max(lo, t1);
        hi = Math.min(hi, t2);
        if (lo > hi) return null;
    }
    return [lo, hi];
};

const rotate = (v, [qx, qy, qz, qw]) => {
    const tx = 2 * (qy * v.z - qz * v.y);
    const ty = 2 * (qz * v.x - qx * v.z);
    const tz = 2 * (qx * v.y - qy * v.x);
    return {
        x: v.x + qw * tx + (qy * tz - qz * ty),
        y: v.y + qw * ty + (qz * tx - qx * tz),
        z: v.z + qw * tz + (qx * ty - qy * tx),
    };
};

const UP = { x: 0, y: 1, z: 0 };

// Solid spans [bottom, top] on the vertical line through (x, z), merged and sorted bottom first.
const spans = (solids, x, z) => {
    const out = [];
    for (const s of solids) {
        if (x < s.reach.x0 || x > s.reach.x1 || z < s.reach.z0 || z > s.reach.z1) continue;
        let o = { x: x - s.centre.x, y: -s.centre.y, z: z - s.centre.z };
        let d = UP;
        if (s.inverse) {
            o = rotate(o, s.inverse);
            d = rotate(UP, s.inverse);
        }
        const hit = lineInterval(o, d, s.min, s.max);
        if (hit) out.push(hit);
    }
    out.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [lo, hi] of out) {
        const last = merged[merged.length - 1];
        if (last && lo <= last[1] + 0.02) last[1] = Math.max(last[1], hi);
        else merged.push([lo, hi]);
    }
    return merged;
};

// Heights of the floors on the line through (x, z) with headroom over them.
const floorsAt = (solids, x, z) => {
    const s = spans(solids, x, z);
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const top = s[i][1];
        const ceiling = i + 1 < s.length ? s[i + 1][0] : Infinity;
        if (ceiling - top >= HEADROOM) out.push(top);
    }
    return out;
};

// A floor within `slack` of height y on the line through (x, z).
const floorNear = (solids, x, z, y, slack) => floorsAt(solids, x, z).some((f) => Math.abs(f - y) <= slack);

/**
 * The bot grid for `map`: { nodes: [{ x, y, z }] (y = floor height), links: [[node index]], cell, at(x, z, y) }, or
 * null for a map with no boxes. Built once per map.
 */
export function buildNav(map) {
    if (cache.has(map.id)) return cache.get(map.id);
    if (!map.boxes.length || !map.bounds) {
        cache.set(map.id, null);
        return null;
    }
    const solids = map.boxes.map(({ c, s, q }) => {
        const r = q ? Math.hypot(s[0], s[1], s[2]) / 2 : 0; // a turned box reaches at most this far from its centre
        const hx = q ? r : s[0] / 2;
        const hz = q ? r : s[2] / 2;
        return {
            centre: { x: c[0], y: c[1], z: c[2] },
            min: { x: -s[0] / 2, y: -s[1] / 2, z: -s[2] / 2 },
            max: { x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 },
            inverse: q ? [-q[0], -q[1], -q[2], q[3]] : null,
            reach: { x0: c[0] - hx, x1: c[0] + hx, z0: c[2] - hz, z1: c[2] + hz },
        };
    });

    const size = Math.floor((2 * map.bounds) / CELL);
    const origin = -map.bounds + CELL / 2;
    const nodes = [];
    const grid = new Map(); // "i,j" -> indices of the nodes in that cell (one per floor)
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const x = origin + i * CELL;
            const z = origin + j * CELL;
            for (const y of floorsAt(solids, x, z)) {
                // Room for the whole capsule: the same floor (give or take a ramp) all around.
                const around = [[EDGE, 0], [-EDGE, 0], [0, EDGE], [0, -EDGE]];
                if (!around.every(([dx, dz]) => floorNear(solids, x + dx, z + dz, y, 0.3))) continue;
                const key = `${i},${j}`;
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push(nodes.length);
                nodes.push({ x, y, z, i, j });
            }
        }
    }

    const links = nodes.map(() => []);
    const near = (i, j, y) => (grid.get(`${i},${j}`) ?? []).find((n) => Math.abs(nodes[n].y - y) <= STEP);
    nodes.forEach((a, ia) => {
        for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
            const ib = near(a.i + di, a.j + dj, a.y);
            if (ib === undefined) continue;
            const b = nodes[ib];
            // No cutting corners: a diagonal move needs both squares beside it.
            if (di && dj && (near(a.i + di, a.j, a.y) === undefined || near(a.i, a.j + dj, a.y) === undefined)) continue;
            const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 };
            if (!floorNear(solids, mid.x, mid.z, mid.y, 0.3)) continue;
            if (wallBetween(map, { x: a.x, y: a.y + KNEE, z: a.z }, { x: b.x, y: b.y + KNEE, z: b.z })) continue;
            links[ia].push(ib);
            links[ib].push(ia);
        }
    });

    // Keep only the biggest connected area, so a bot never picks a spot it can't reach.
    const area = new Int32Array(nodes.length).fill(-1);
    let best = -1;
    let bestSize = 0;
    for (let start = 0; start < nodes.length; start++) {
        if (area[start] !== -1) continue;
        const stack = [start];
        area[start] = start;
        let count = 0;
        while (stack.length) {
            const n = stack.pop();
            count++;
            for (const m of links[n]) {
                if (area[m] === -1) {
                    area[m] = start;
                    stack.push(m);
                }
            }
        }
        if (count > bestSize) {
            bestSize = count;
            best = start;
        }
    }
    const keep = nodes.map((_, n) => area[n] === best);
    const renumber = new Int32Array(nodes.length).fill(-1);
    const kept = [];
    nodes.forEach((n, k) => {
        if (keep[k]) {
            renumber[k] = kept.length;
            kept.push({ x: n.x, y: n.y, z: n.z });
        }
    });
    const keptLinks = kept.map(() => []);
    links.forEach((list, k) => {
        if (keep[k]) keptLinks[renumber[k]] = list.filter((m) => keep[m]).map((m) => renumber[m]);
    });
    const cells = new Map(); // "i,j" -> kept node indices
    nodes.forEach((n, k) => {
        if (!keep[k]) return;
        const key = `${n.i},${n.j}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(renumber[k]);
    });

    const nav = {
        nodes: kept,
        links: keptLinks,
        cell: CELL,
        /** The node nearest to (x, z) on the floor nearest to height y (feet), searching outwards a few cells. */
        at(x, z, y) {
            const ci = Math.round((x - origin) / CELL);
            const cj = Math.round((z - origin) / CELL);
            let found = -1;
            let bestD = Infinity;
            for (let r = 0; r <= 4 && found === -1; r++) {
                for (let i = ci - r; i <= ci + r; i++) {
                    for (let j = cj - r; j <= cj + r; j++) {
                        for (const n of cells.get(`${i},${j}`) ?? []) {
                            const p = kept[n];
                            const d = (p.x - x) ** 2 + (p.z - z) ** 2 + 4 * (p.y - y) ** 2;
                            if (d < bestD) {
                                bestD = d;
                                found = n;
                            }
                        }
                    }
                }
            }
            return found;
        },
    };
    cache.set(map.id, nav);
    return nav;
}

/** The shortest path from node `from` to node `to` (A*), as node indices after `from`, or null. */
export function findPath(nav, from, to) {
    if (from === to) return [];
    const { nodes, links } = nav;
    const h = (n) => Math.hypot(nodes[n].x - nodes[to].x, nodes[n].z - nodes[to].z);
    const g = new Map([[from, 0]]);
    const came = new Map();
    const open = [[h(from), from]]; // small binary heap of [f, node]
    const push = (item) => {
        open.push(item);
        for (let i = open.length - 1; i > 0; ) {
            const p = (i - 1) >> 1;
            if (open[p][0] <= open[i][0]) break;
            [open[p], open[i]] = [open[i], open[p]];
            i = p;
        }
    };
    const pop = () => {
        const top = open[0];
        const last = open.pop();
        if (open.length) {
            open[0] = last;
            for (let i = 0; ; ) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < open.length && open[l][0] < open[m][0]) m = l;
                if (r < open.length && open[r][0] < open[m][0]) m = r;
                if (m === i) break;
                [open[m], open[i]] = [open[i], open[m]];
                i = m;
            }
        }
        return top;
    };
    const closed = new Set();
    while (open.length) {
        const [, n] = pop();
        if (n === to) {
            const path = [];
            for (let k = to; k !== from; k = came.get(k)) path.push(k);
            return path.reverse();
        }
        if (closed.has(n)) continue;
        closed.add(n);
        for (const m of links[n]) {
            const step = Math.hypot(nodes[m].x - nodes[n].x, nodes[m].y - nodes[n].y, nodes[m].z - nodes[n].z);
            const cost = g.get(n) + step;
            if (cost < (g.get(m) ?? Infinity)) {
                g.set(m, cost);
                came.set(m, n);
                push([cost + h(m), m]);
            }
        }
    }
    return null;
}
