import { test } from 'node:test';
import assert from 'node:assert/strict';
import rayIntersectsBox from '../src/rayIntersectsBox.js';

const min = { x: -1, y: -1, z: -1 };
const max = { x: 1, y: 1, z: 1 };

test('returns the distance to the box along the ray', () => {
    assert.equal(rayIntersectsBox({ x: -5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, min, max), 4);
});

test('misses: beside the box, behind the ray, parallel outside a slab', () => {
    assert.equal(rayIntersectsBox({ x: -5, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, min, max), null);
    assert.equal(rayIntersectsBox({ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, min, max), null);
    assert.equal(rayIntersectsBox({ x: 0, y: 2, z: -5 }, { x: 0, y: 0, z: 1 }, min, max), null);
});

test('a ray starting inside the box hits at distance 0', () => {
    assert.equal(rayIntersectsBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, min, max), 0);
});
