import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

// A stand-in for the ROOMS Durable Object namespace that says which room got the request.
const env = {
    ROOMS: {
        idFromName: (name) => ({ name }),
        get: (id) => ({ fetch: (request) => new Response(`room ${id.name}: ${new URL(request.url).pathname}`) }),
    },
};
const upgrade = { headers: { Upgrade: 'websocket' } };

test('a room WebSocket is handed to the Durable Object named after the room', async () => {
    const res = await app.request('/rooms/Ab3_x-9', upgrade, env);
    assert.equal(await res.text(), 'room Ab3_x-9: /rooms/Ab3_x-9');
});

test('requests that are not WebSocket upgrades, or name a bad room id, are refused', async () => {
    assert.equal((await app.request('/rooms/abc', {}, env)).status, 426);
    assert.equal((await app.request('/rooms/bad%20id', upgrade, env)).status, 400);
    assert.equal((await app.request(`/rooms/${'x'.repeat(33)}`, upgrade, env)).status, 400);
    assert.equal((await app.request('/nope', upgrade, env)).status, 404);
});

test('/activate still answers ok', async () => {
    const res = await app.request('/activate', {}, env);
    assert.equal(await res.text(), 'ok');
});
