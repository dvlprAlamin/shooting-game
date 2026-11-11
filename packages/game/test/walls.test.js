import { test } from 'node:test';
import assert from 'node:assert/strict';
import { box, mirrorZ, quarterTurn, ramp, turnedBlock } from '@rimfire/shared/maps/build';
import { firstWallHit, wallBetween } from '../src/walls.js';

let n = 0;
const mapOf = (boxes) => ({ id: `test-${++n}`, boxes });
const DOWN = { x: 0, y: -1, z: 0 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('the first box along the ray is the one that counts', () => {
    const map = mapOf([box([4, 0, -1], [5, 3, 1], 'concrete'), box([8, 0, -1], [9, 3, 1], 'concrete')]);
    close(firstWallHit(map, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }), 4);
    assert.equal(firstWallHit(map, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }), Infinity);
    assert.equal(firstWallHit(map, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 3), Infinity, 'past maxDistance');
    assert.equal(wallBetween(map, { x: 0, y: 1, z: 0 }, { x: 3.9, y: 1, z: 0 }), false);
    assert.equal(wallBetween(map, { x: 0, y: 1, z: 0 }, { x: 4.1, y: 1, z: 0 }), true);
});

test('a ramp is hit on its slope, up and down its whole length', () => {
    // Rises 2 m over 5 m going north (-z): the top surface is at 2 * (-z / 5).
    const map = mapOf(ramp([0, 0, 0], [0, 2, -5], 2, 'concrete'));
    for (const z of [-0.5, -2.5, -4.5]) {
        close(firstWallHit(map, { x: 0, y: 10, z }, DOWN), 10 - (2 * -z) / 5);
        close(firstWallHit(map, { x: 0.9, y: 10, z }, DOWN), 10 - (2 * -z) / 5);
    }
    assert.equal(firstWallHit(map, { x: 1.1, y: 10, z: -2.5 }, DOWN), Infinity, 'beside the ramp');
});

test('a tall ramp has a block under its high end', () => {
    const [slab, support] = ramp([0, 0, 0], [6, 2.6, 0], 2.4, 'steel');
    assert.ok(slab && support);
    const map = mapOf([support]);
    // Rays along the ground under the ramp: blocked under the top half only.
    assert.equal(firstWallHit(map, { x: 4.5, y: 0.5, z: -5 }, { x: 0, y: 0, z: 1 }) < 10, true);
    assert.equal(firstWallHit(map, { x: 1.5, y: 0.5, z: -5 }, { x: 0, y: 0, z: 1 }), Infinity);
});

test('turned, mirrored and rotated boxes stay where they should', () => {
    // A 4 x 1 wall turned 90° is a 1 x 4 wall.
    const map = mapOf([turnedBlock(0, 0, 4, 1, 2, Math.PI / 2, 'concrete')]);
    close(firstWallHit(map, { x: 0, y: 1, z: 5 }, { x: 0, y: 0, z: -1 }), 3);
    close(firstWallHit(map, { x: 5, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }), 4.5);

    // Mirroring a ramp that rises to the north gives one rising to the south.
    const south = mapOf(mirrorZ(ramp([0, 0, 0], [0, 2, -5], 2, 'concrete')));
    close(firstWallHit(south, { x: 0, y: 10, z: 4.5 }, DOWN), 10 - 1.8);

    // A quarter turn takes the box at +x to -z.
    const [turned] = quarterTurn([box([9, 0, -1], [10, 1, 1], 'concrete')]);
    assert.deepEqual(turned.c, [0, 0.5, -9.5]);
    assert.deepEqual(turned.s, [2, 1, 1]);
    const turnedRamp = mapOf(quarterTurn(ramp([0, 0, 0], [0, 2, -5], 2, 'concrete')));
    // The north ramp, turned, rises to the west (-x).
    close(firstWallHit(turnedRamp, { x: -4.5, y: 10, z: 0 }, DOWN), 10 - 1.8);
});
