import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/app.js';
import { getProfile, saveResults } from '../src/profiles.js';
import { d1, skipD1 } from './d1.js';
import { googleClaims, signToken, signingKey } from './jwt.js';

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
    batch: async () => [],
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

test('DELETE /profile/<id> deletes the record, and other origins may ask', { skip: skipD1 }, async () => {
    const db = d1();
    await saveResults(db, [{ profileId: PROFILE, name: 'Alice', kills: 1, deaths: 0, matches: 1, wins: 0, bestStreak: 1, seconds: 9 }]);
    const res = await app.request(`/profile/${PROFILE}`, { method: 'DELETE' }, { ...env, DB: db });
    assert.equal(res.status, 204);
    assert.equal(await getProfile(db, PROFILE), null);

    const preflight = await app.request(`/profile/${PROFILE}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'DELETE' },
    }, env);
    assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /DELETE/);
    assert.equal((await app.request('/profile/short', { method: 'DELETE' }, { ...env, DB: db })).status, 400);
    assert.equal((await app.request(`/profile/${PROFILE}`, { method: 'DELETE' }, env)).status, 503);
});

// Sign in with Google. Google's key endpoint is stood in for by `fetch`, publishing GOOGLE_KEY.
const CLIENT = 'web-client.apps.googleusercontent.com';
const GOOGLE_KEY = await signingKey('test-key');
const signInRequest = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// First of the sign-in tests: the server keeps Google's keys once it has them, so later ones wouldn't fetch.
test("/auth/google says so when Google can't be reached", async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('down', { status: 500 }));
    const idToken = await signToken(GOOGLE_KEY, googleClaims(CLIENT, Date.now()), { alg: 'RS256', kid: 'unseen' });
    const res = await app.request('/auth/google', signInRequest({ idToken, profileId: PROFILE }), {
        ...env,
        DB: fakeDb(),
        GOOGLE_CLIENT_ID: CLIENT,
    });
    assert.equal(res.status, 502);
});

test('/auth/google signs the device in and hands back the profile to play as', { skip: skipD1 }, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ keys: [GOOGLE_KEY.jwk] }, { headers: { 'Cache-Control': 'max-age=3600' } }));
    const db = d1();
    const withAuth = { ...env, DB: db, GOOGLE_CLIENT_ID: `ios-client, ${CLIENT}` };
    await saveResults(db, [{ profileId: PROFILE, name: 'Alice', kills: 3, deaths: 1, matches: 1, wins: 1, bestStreak: 2, seconds: 60 }]);

    const idToken = await signToken(GOOGLE_KEY, googleClaims(CLIENT, Date.now()));
    const res = await app.request('/auth/google', signInRequest({ idToken, profileId: PROFILE }), withAuth);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(await res.json(), {
        profileId: PROFILE,
        profile: { name: 'Alice', kills: 3, deaths: 1, matches: 1, wins: 1, bestStreak: 2, seconds: 60 },
    });

    // The same account from another device gets the same profile.
    const other = '0123456789abcdef0123';
    const again = await app.request('/auth/google', signInRequest({ idToken, profileId: other }), withAuth);
    assert.equal((await again.json()).profileId, PROFILE);

    // A token for some other app, or a forged one, is refused.
    const foreign = await signToken(GOOGLE_KEY, googleClaims('another-app', Date.now()));
    assert.equal((await app.request('/auth/google', signInRequest({ idToken: foreign, profileId: other }), withAuth)).status, 401);
    const forged = await signToken(await signingKey('test-key'), googleClaims(CLIENT, Date.now()));
    assert.equal((await app.request('/auth/google', signInRequest({ idToken: forged, profileId: other }), withAuth)).status, 401);
});

test('/auth/google refuses bad requests, and says when sign-in is off', async () => {
    const withAuth = { ...env, DB: fakeDb(), GOOGLE_CLIENT_ID: CLIENT };
    for (const body of [{}, { idToken: 'x' }, { idToken: 'x', profileId: 'short' }, { idToken: 7, profileId: PROFILE }]) {
        assert.equal((await app.request('/auth/google', signInRequest(body), withAuth)).status, 400, JSON.stringify(body));
    }
    const notJson = { method: 'POST', body: 'nope' };
    assert.equal((await app.request('/auth/google', notJson, withAuth)).status, 400);

    const valid = signInRequest({ idToken: 'x.y.z', profileId: PROFILE });
    assert.equal((await app.request('/auth/google', valid, { ...env, DB: fakeDb() })).status, 503); // no client id
    assert.equal((await app.request('/auth/google', valid, { ...env, DB: fakeDb(), GOOGLE_CLIENT_ID: '' })).status, 503);
    assert.equal((await app.request('/auth/google', valid, { ...env, GOOGLE_CLIENT_ID: CLIENT })).status, 503); // no DB
});
