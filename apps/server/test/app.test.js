import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE } from '@rimfire/game';
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

test('/auth/google/delete deletes the record of the account the token is for', { skip: skipD1 }, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ keys: [GOOGLE_KEY.jwk] }, { headers: { 'Cache-Control': 'max-age=3600' } }));
    const db = d1();
    const withAuth = { ...env, DB: db, GOOGLE_CLIENT_ID: CLIENT };
    const idToken = await signToken(GOOGLE_KEY, googleClaims(CLIENT, Date.now()));
    const remove = (body) => app.request('/auth/google/delete', signInRequest(body), withAuth);

    assert.deepEqual(await (await remove({ idToken })).json(), { deleted: false }); // never signed in
    await saveResults(db, [{ profileId: PROFILE, name: 'Alice', kills: 3, deaths: 1, matches: 1, wins: 1, bestStreak: 2, seconds: 60 }]);
    await app.request('/auth/google', signInRequest({ idToken, profileId: PROFILE }), withAuth);
    const res = await remove({ idToken });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(await res.json(), { deleted: true });
    assert.equal(await getProfile(db, PROFILE), null);

    const forged = await signToken(await signingKey('test-key'), googleClaims(CLIENT, Date.now()));
    assert.equal((await remove({ idToken: forged })).status, 401);
    assert.equal((await remove({})).status, 400);
    assert.equal((await remove({ idToken: 'x'.repeat(5000) })).status, 400);
    const off = await app.request('/auth/google/delete', signInRequest({ idToken }), { ...env, DB: db });
    assert.equal(off.status, 503);
});

test('the old privacy and deletion page addresses go to the website', async () => {
    const site = { ...env, SITE_URL: 'https://rimfire.example/' };
    for (const path of ['/privacy', '/delete-account']) {
        const res = await app.request(path, {}, site);
        assert.equal(res.status, 301);
        assert.equal(res.headers.get('Location'), `https://rimfire.example${path}`);
    }
});

test("the website's deletion page may call the delete endpoint from its own origin", async () => {
    const res = await app.request(
        '/auth/google/delete',
        {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://rimfire.example',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        },
        env,
    );
    assert.ok(res.status === 204 || res.status === 200, `preflight status ${res.status}`);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
    assert.match(res.headers.get('Access-Control-Allow-Headers'), /content-type/i);
});

// A rate limiting binding stand-in: lets `allow` requests per key through, then refuses. `seen` lists the keys.
const limiter = (allow) => {
    const counts = new Map();
    const seen = [];
    return {
        seen,
        limit: async ({ key }) => {
            seen.push(key);
            counts.set(key, (counts.get(key) ?? 0) + 1);
            return { success: counts.get(key) <= allow };
        },
    };
};

test('spam protection: past its limit an address gets a 429 the app can read, and other addresses carry on', async () => {
    const LIMIT_QUICKPLAY = limiter(2);
    const ask = (ip) =>
        app.request('/quickplay', { method: 'POST', headers: { Origin: 'https://localhost', 'CF-Connecting-IP': ip } }, {
            ...env,
            LIMIT_QUICKPLAY,
        });
    assert.equal((await ask('203.0.113.1')).status, 200);
    assert.equal((await ask('203.0.113.1')).status, 200);
    const refused = await ask('203.0.113.1');
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('Retry-After'), '60');
    assert.equal(refused.headers.get('Access-Control-Allow-Origin'), '*'); // or the browser hides the status
    assert.equal((await ask('203.0.113.2')).status, 200);
    assert.deepEqual(LIMIT_QUICKPLAY.seen, ['203.0.113.1', '203.0.113.1', '203.0.113.1', '203.0.113.2']);
});

test('spam protection: CORS preflights are not counted', async () => {
    const LIMIT_AUTH = limiter(0);
    const preflight = await app.request('/auth/google', {
        method: 'OPTIONS',
        headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST' },
    }, { ...env, LIMIT_AUTH });
    assert.equal(preflight.status, 204);
    assert.deepEqual(LIMIT_AUTH.seen, []);
    const res = await app.request('/auth/google', signInRequest({ idToken: 'x', profileId: PROFILE }), { ...env, LIMIT_AUTH });
    assert.equal(res.status, 429);
});

test('spam protection: a room WebSocket past the limit is closed with RATE_LIMITED and never reaches a room', async () => {
    // Node has neither the Workers' WebSocketPair nor a Response that takes status 101.
    const closed = [];
    const { WebSocketPair: realPair, Response: RealResponse } = globalThis;
    globalThis.WebSocketPair = function () {
        return { 0: { side: 'client' }, 1: { accept() {}, close: (code, reason) => closed.push([code, reason]) } };
    };
    globalThis.Response = class extends RealResponse {
        constructor(body, init) {
            super(body, init?.status === 101 ? { ...init, status: 200 } : init);
            if (init?.status === 101) this.webSocket = init.webSocket;
        }
    };
    try {
        const limited = { ...env, LIMIT_ROOMS: limiter(1) };
        const join = { headers: { ...upgrade.headers, 'CF-Connecting-IP': '203.0.113.9' } };
        assert.equal(await (await app.request('/rooms/abc', join, limited)).text(), 'room abc: /rooms/abc');
        const refused = await app.request('/rooms/abc', join, limited);
        assert.equal(refused.webSocket.side, 'client');
        assert.deepEqual(closed, [[CLOSE.RATE_LIMITED, 'Too many connections']]);
        // Anything else past the limit gets a plain 429.
        assert.equal((await app.request('/rooms/abc', { headers: { 'CF-Connecting-IP': '203.0.113.9' } }, limited)).status, 429);
    } finally {
        globalThis.WebSocketPair = realPair;
        globalThis.Response = RealResponse;
    }
});

// Crash reports come as text/plain (navigator.sendBeacon), from any origin.
const errorReport = (body) => ({ method: 'POST', headers: { Origin: 'https://localhost' }, body });

test('POST /errors keeps a crash report', { skip: skipD1 }, async () => {
    const db = d1();
    const body = JSON.stringify({ message: 'Boom', stack: 'Error: Boom\n    at x', version: '1.0 (3)', platform: 'web' });
    const res = await app.request('/errors', errorReport(body), { ...env, DB: db });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(db.all('SELECT message, platform, count FROM errors').map((r) => ({ ...r })), [
        { message: 'Boom', platform: 'web', count: 1 },
    ]);
});

test('POST /errors refuses what is not a report, or too big, and says when there is no database', async () => {
    const withDb = { ...env, DB: fakeDb() };
    for (const body of ['nope', '{}', JSON.stringify({ message: '' })]) {
        assert.equal((await app.request('/errors', errorReport(body), withDb)).status, 400, body);
    }
    const huge = JSON.stringify({ message: 'x', stack: 's'.repeat(20000) });
    assert.equal((await app.request('/errors', errorReport(huge), withDb)).status, 413);
    assert.equal((await app.request('/errors', errorReport(JSON.stringify({ message: 'x' })), env)).status, 503);
});
