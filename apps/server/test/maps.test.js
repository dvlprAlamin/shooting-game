import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_CENTER_TO_FEET, PLAYER_RADIUS } from '@shooter/shared';
import { DEFAULT_MAP, MAPS, getMap } from '@shooter/shared/maps';
import { rotate } from '@shooter/shared/maps/build';
import { firstWallHit } from '../src/game/walls.js';

const BLOCK_MAPS = MAPS.filter((map) => map.boxes.length);
const MAX_SLOPE = 30; // degrees: steeper and the player can't walk up it
const DOWN = { x: 0, y: -1, z: 0 };

// Is point p inside the box (in its own frame, with `grow` added on every side)?
const inside = (p, { c, s, q }, grow = 0) => {
    let local = [p.x - c[0], p.y - c[1], p.z - c[2]];
    if (q) local = rotate(local, [-q[0], -q[1], -q[2], q[3]]);
    return local.every((v, i) => Math.abs(v) < s[i] / 2 + grow);
};

// Points on and in a player's capsule standing at `spawn`, with a little room to spare.
const capsulePoints = ({ x, y, z }) => {
    const points = [{ x, y, z }];
    const r = PLAYER_RADIUS + 0.1;
    for (let h = -PLAYER_CENTER_TO_FEET + PLAYER_RADIUS; h <= PLAYER_CENTER_TO_FEET - PLAYER_RADIUS; h += 0.25) {
        for (let a = 0; a < 16; a++) {
            const angle = (a / 16) * Math.PI * 2;
            points.push({ x: x + Math.cos(angle) * r, y: y + h, z: z + Math.sin(angle) * r });
        }
    }
    points.push({ x, y: y - PLAYER_CENTER_TO_FEET + 0.02, z }, { x, y: y + PLAYER_CENTER_TO_FEET + 0.1, z });
    return points;
};

test('map ids are unique and unknown ids get the default map', () => {
    assert.equal(new Set(MAPS.map((m) => m.id)).size, MAPS.length);
    assert.equal(getMap('nope').id, DEFAULT_MAP);
    assert.equal(getMap(undefined).id, DEFAULT_MAP);
    assert.equal(getMap('outpost').id, 'outpost');
});

for (const map of BLOCK_MAPS) {
    test(`${map.id}: every spawn point has room to stand and a floor under it`, () => {
        assert.ok(map.spawns.length >= 8, 'enough spawn points for a full room to spread out');
        for (const spawn of map.spawns) {
            const where = `spawn (${spawn.x}, ${spawn.z})`;
            for (const point of capsulePoints(spawn)) {
                const box = map.boxes.find((b) => inside(point, b));
                assert.equal(box, undefined, `${where} overlaps the box at ${box?.c}`);
            }
            const drop = firstWallHit(map, spawn, DOWN);
            assert.ok(drop >= PLAYER_CENTER_TO_FEET && drop < PLAYER_CENTER_TO_FEET + 0.1, `${where} floats ${drop} m up`);
            assert.ok(Math.abs(spawn.x) < map.bounds && Math.abs(spawn.z) < map.bounds, `${where} is outside the map`);
        }
    });

    test(`${map.id}: spawn points face the middle and are spread out`, () => {
        for (const spawn of map.spawns) {
            const forward = [-Math.sin(spawn.yaw), -Math.cos(spawn.yaw)];
            assert.ok(forward[0] * -spawn.x + forward[1] * -spawn.z > 0, `spawn (${spawn.x}, ${spawn.z}) faces outwards`);
        }
        for (const a of map.spawns) {
            for (const b of map.spawns) {
                if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 8, `spawns (${a.x}, ${a.z}) and (${b.x}, ${b.z}) are close`);
            }
        }
    });

    test(`${map.id}: ramps are gentle enough to walk up`, () => {
        for (const { c, q } of map.boxes) {
            if (!q) continue;
            const up = rotate([0, 1, 0], q);
            const slope = (Math.acos(Math.min(1, Math.abs(up[1]))) * 180) / Math.PI;
            assert.ok(slope <= MAX_SLOPE, `the box at ${c} slopes ${slope.toFixed(1)}°`);
        }
    });

    test(`${map.id}: walled in, with no way to see or walk out`, () => {
        for (const spawn of map.spawns) {
            for (const height of [0, 2, 4]) {
                for (let a = 0; a < 24; a++) {
                    const angle = (a / 24) * Math.PI * 2;
                    const from = { x: spawn.x, y: spawn.y + height, z: spawn.z };
                    const hit = firstWallHit(map, from, { x: Math.cos(angle), y: 0, z: Math.sin(angle) });
                    assert.ok(hit < map.bounds * 3, `nothing stops a ray from (${spawn.x}, ${spawn.z}) at ${a * 15}°`);
                }
            }
        }
    });

    test(`${map.id}: boxes are well formed`, () => {
        for (const b of map.boxes) {
            assert.equal(b.c.length, 3);
            assert.ok(b.s.every((v) => v > 0), `the box at ${b.c} has no size`);
            assert.equal(typeof b.m, 'string');
            if (b.q) assert.ok(Math.abs(Math.hypot(...b.q) - 1) < 1e-9, 'unit quaternion');
        }
    });
}
