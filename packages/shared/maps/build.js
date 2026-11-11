// Helpers for writing block maps. They run once when the map module loads; what comes out is plain data.
//
// A box: { c: [x, y, z] centre, s: [w, h, d] full size, q?: [x, y, z, w] rotation, m: material, tint?: '#rrggbb' }.
// Boxes are solid on both client (Rapier cuboids) and server (shots through them don't count).
// `m` and `tint` only matter to the client, which draws each material with its own texture.

import { PLAYER_CENTER_TO_FEET } from '../gameplay.js';

const SPAWN_LIFT = 0.05; // spawn a little above the floor, so the capsule never starts inside it

/** Quaternion product a * b, as [x, y, z, w]. */
export const multiply = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
];

/** Rotates vector v by unit quaternion q. */
export const rotate = ([x, y, z], [qx, qy, qz, qw]) => {
    // v + 2w(q × v) + 2 q × (q × v)
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    return [
        x + qw * tx + (qy * tz - qz * ty),
        y + qw * ty + (qz * tx - qx * tz),
        z + qw * tz + (qx * ty - qy * tx),
    ];
};

const aroundY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const aroundX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];

const withTint = (b, tint) => (tint ? { ...b, tint } : b);

/** A box between two corners. */
export const box = ([x0, y0, z0], [x1, y1, z1], m, tint) =>
    withTint(
        {
            c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
            s: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
            m,
        },
        tint
    );

/** A box standing on the floor at `base`, centred on (x, z): w along x, d along z, h tall. */
export const block = (x, z, w, d, h, m, tint, base = 0) => box([x - w / 2, base, z - d / 2], [x + w / 2, base + h, z + d / 2], m, tint);

/** Like block(), turned by `yaw` radians around its vertical axis. */
export const turnedBlock = (x, z, w, d, h, yaw, m, tint, base = 0) =>
    withTint({ c: [x, base + h / 2, z], s: [w, h, d], q: aroundY(yaw), m }, tint);

/**
 * A ramp whose top surface runs from `from` (bottom edge, middle) to `to` (top edge, middle). Ramps rising
 * more than 1.5 m get a block under their upper half, so the space under the high end isn't hollow.
 * Returns a list of boxes.
 */
export const ramp = (from, to, width, m, tint, thickness = 0.4) => {
    const [dx, dy, dz] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const run = Math.hypot(dx, dz);
    const length = Math.hypot(run, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.atan2(dy, run);
    // Local +z runs up the slope, local +y is the top surface's normal.
    const q = multiply(aroundY(yaw), aroundX(-pitch));
    const n = rotate([0, 1, 0], q);
    const top = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
    const slab = withTint(
        {
            c: [top[0] - (n[0] * thickness) / 2, top[1] - (n[1] * thickness) / 2, top[2] - (n[2] * thickness) / 2],
            s: [width, thickness, length],
            q,
            m,
        },
        tint
    );
    if (dy <= 1.5) return [slab];
    // Under the upper half: from halfway up the run to the top end, kept a little below the slab.
    const half = [from[0] + dx / 2, from[1], from[2] + dz / 2];
    const support = turnedBlock(
        (half[0] + to[0]) / 2,
        (half[2] + to[2]) / 2,
        width - 0.1,
        run / 2,
        dy / 2 - 0.3,
        yaw,
        m,
        tint,
        from[1]
    );
    return [slab, support];
};

/** Mirror boxes across the z = 0 plane. (A box is symmetric, so its mirror image is just a box turned the other way.) */
export const mirrorZ = (boxes) =>
    boxes.map((b) => ({
        ...b,
        c: [b.c[0], b.c[1], -b.c[2]],
        ...(b.q && { q: [-b.q[0], -b.q[1], b.q[2], b.q[3]] }),
    }));

/** Turn boxes a quarter turn (counter-clockwise seen from above) `times` times around the vertical axis. */
export const quarterTurn = (boxes, times = 1) => {
    let out = boxes;
    for (let i = 0; i < times; i++) {
        out = out.map((b) => {
            // (x, z) -> (z, -x) is +90° around y.
            const turned = { ...b, c: [b.c[2], b.c[1], -b.c[0]] };
            if (b.q) turned.q = multiply(aroundY(Math.PI / 2), b.q);
            else turned.s = [b.s[2], b.s[1], b.s[0]];
            return turned;
        });
    }
    return out;
};

/** Every rotation of `boxes` in quarter turns: the map is the same seen from all four sides. */
export const fourWay = (boxes) => [0, 1, 2, 3].flatMap((t) => quarterTurn(boxes, t));

/**
 * A spawn point (capsule centre) standing on the floor at height `floor`. By default the player faces
 * the middle of the map.
 */
export const spawn = (x, z, floor = 0, yaw = Math.atan2(x, z)) => ({
    x,
    y: Math.round((floor + PLAYER_CENTER_TO_FEET + SPAWN_LIFT) * 1000) / 1000,
    z,
    yaw: Math.round(yaw * 1000) / 1000,
});

/** Perimeter walls around [-hx, hx] x [-hz, hz], `h` tall and `t` thick, outside that area. */
export const perimeter = (hx, hz, h, t, m, tint) => [
    box([-hx - t, 0, -hz - t], [hx + t, h, -hz], m, tint),
    box([-hx - t, 0, hz], [hx + t, h, hz + t], m, tint),
    box([-hx - t, 0, -hz], [-hx, h, hz], m, tint),
    box([hx, 0, -hz], [hx + t, h, hz], m, tint),
];
