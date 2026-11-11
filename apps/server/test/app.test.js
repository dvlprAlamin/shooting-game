import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';

// Stand-ins for the Durable Object namespaces: ROOMS says which room got the request, LOBBY always picks 'q1'.
const env = {
    ROOMS: {
        idFromName: (name) => ({ name }),
        get: (id) => ({ fetch: (request) => new Response(`room ${id.name}: ${new URL(request.url).pathname}`) }),
    },
    LOBBY: {
        idFromName: (name) => ({ name }),
        get: (id) => ({ quickPlay: async () => (id.name === 'lobby' ? 'q1' : 'wrong lobby') }),
    },
};

// A D1 stand-in holding one profile row.
const fakeDb = (rows = {}) => ({
    prepare: (sql) => ({
        run: async () => ({}),
        bind: (...args) => ({ first: async () => (sql.startsWith('SELECT') ? rows[args[0]] ?? null : null) }),
    }),
});
const PROFILE = 'b6f0c2d4-1a2b-4c3d-8e9f-0123456789ab';
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

test('/quickplay names the room the lobby picked, and other origins may ask', async () => {
    const res = await app.request('/quickplay', { method: 'POST', headers: { Origin: 'capacitor://localhost' } }, env);
    assert.deepEqual(await res.json(), { roomId: 'q1' });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('/profile/<id> returns the totals, or says why not', async () => {
    const row = { name: 'Alice', kills: 12, deaths: 3, matches: 2, wins: 1, best_streak: 5, seconds: 900 };
    const withDb = { ...env, DB: fakeDb({ [PROFILE]: row }) };
    const res = await app.request(`/profile/${PROFILE}`, {}, withDb);
    assert.deepEqual(await res.json(), { name: 'Alice', kills: 12, deaths: 3, matches: 2, wins: 1, bestStreak: 5, seconds: 900 });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

    assert.equal((await app.request(`/profile/${'0'.repeat(32)}`, {}, withDb)).status, 404);
    assert.equal((await app.request('/profile/short', {}, withDb)).status, 400);
    assert.equal((await app.request(`/profile/${PROFILE}`, {}, env)).status, 503);
});
