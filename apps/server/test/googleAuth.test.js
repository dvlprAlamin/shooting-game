import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleTokenVerifier } from '../src/googleAuth.js';
import { googleClaims, signToken, signingKey } from './jwt.js';

const NOW = 1_800_000_000_000;
const AUD = 'web-client.apps.googleusercontent.com';
const claims = (extra) => googleClaims(AUD, NOW, extra);

const k1 = await signingKey('k1');
const k2 = await signingKey('k2');

// Google's key endpoint, counting fetches. `keys` is what it publishes right now.
const google = (keys, maxAge = 3600) => {
    const g = { keys, fetches: 0 };
    g.fetch = async () => {
        g.fetches++;
        return { keys: g.keys.map((k) => k.jwk), maxAge };
    };
    return g;
};

test('a Google ID token for our client gives its claims', async () => {
    const verify = googleTokenVerifier(google([k1, k2]).fetch);
    const got = await verify(await signToken(k2, claims()), [AUD], NOW);
    assert.equal(got.sub, '109876543210987654321');
    assert.equal(got.email, 'player@example.com');

    // Either issuer spelling, and an audience among several.
    const plain = await signToken(k1, claims({ iss: 'accounts.google.com' }));
    assert.ok(await verify(plain, ['ios-client', AUD], NOW));
});

test('tokens for another client, from another issuer, or out of date are refused', async () => {
    const verify = googleTokenVerifier(google([k1]).fetch);
    const t = NOW / 1000;
    const refused = [
        claims({ aud: 'someone-elses-client' }),
        claims({ iss: 'https://evil.example.com' }),
        claims({ exp: t - 120 }), // expired beyond the clock skew
        claims({ iat: t + 600 }), // issued in the future
        claims({ sub: '' }),
        claims({ sub: undefined }),
        claims({ exp: undefined }),
    ];
    for (const c of refused) assert.equal(await verify(await signToken(k1, c), [AUD], NOW), null, JSON.stringify(c));

    // Within the 60 s skew is fine.
    assert.ok(await verify(await signToken(k1, claims({ exp: t - 30 })), [AUD], NOW));
});

test("anything not signed by one of Google's keys is refused", async () => {
    const verify = googleTokenVerifier(google([k1]).fetch);
    const stranger = await signingKey('k1'); // claims to be k1
    assert.equal(await verify(await signToken(stranger, claims()), [AUD], NOW), null);
    assert.equal(await verify(await signToken(k2, claims()), [AUD], NOW), null); // a key Google doesn't publish

    // A good token with its claims swapped for others.
    const [header, , signature] = (await signToken(k1, claims())).split('.');
    const forged = Buffer.from(JSON.stringify(claims({ sub: 'someone-else' }))).toString('base64url');
    assert.equal(await verify(`${header}.${forged}.${signature}`, [AUD], NOW), null);

    // Unsigned or with another algorithm.
    const none = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url');
    assert.equal(await verify(`${none}.${forged}.`, [AUD], NOW), null);
    assert.equal(await verify(await signToken(k1, claims(), { alg: 'HS256', kid: 'k1' }), [AUD], NOW), null);

    for (const junk of ['', 'a.b', 'a.b.c', '...', 'not a token', null, 42]) {
        assert.equal(await verify(junk, [AUD], NOW), null, String(junk));
    }
});

test("Google's keys are kept as long as Google says, and fetched again for a new key id", async () => {
    const g = google([k1], 600);
    const verify = googleTokenVerifier(g.fetch);
    const token1 = await signToken(k1, claims());
    assert.ok(await verify(token1, [AUD], NOW));
    assert.ok(await verify(token1, [AUD], NOW + 1000));
    assert.equal(g.fetches, 1);

    // Google rotates: k2 appears. The first token with k2 fetches the keys again.
    g.keys = [k1, k2];
    assert.ok(await verify(await signToken(k2, claims()), [AUD], NOW + 70_000));
    assert.equal(g.fetches, 2);

    // Made-up key ids don't fetch on every request: at most once a minute.
    const bogus = await signToken(k1, claims(), { alg: 'RS256', kid: 'made-up' });
    assert.equal(await verify(bogus, [AUD], NOW + 71_000), null);
    assert.equal(await verify(bogus, [AUD], NOW + 72_000), null);
    assert.equal(g.fetches, 2);
    assert.equal(await verify(bogus, [AUD], NOW + 140_000), null);
    assert.equal(g.fetches, 3);

    // After max-age (600 s from the last fetch) they're fetched again even for a known key.
    assert.ok(await verify(token1, [AUD], NOW + 140_000 + 601_000));
    assert.equal(g.fetches, 4);
});

test("it throws when Google's keys can't be had, so the server can say so", async () => {
    const verify = googleTokenVerifier(async () => {
        throw new Error('offline');
    });
    await assert.rejects(verify(await signToken(k1, claims()), [AUD], NOW), /offline/);
});
