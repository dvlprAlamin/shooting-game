import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile, saveResults } from '../src/profiles.js';

// node:sqlite needs Node 22.5 or newer; on older versions these tests are skipped.
const { DatabaseSync } = await import('node:sqlite').catch(() => ({}));
const skip = DatabaseSync ? false : 'needs node:sqlite (Node 22.5+)';

// D1's API over an in-memory SQLite database (D1 is SQLite), enough for profiles.js.
function d1() {
    const sqlite = new DatabaseSync(':memory:');
    const statement = (sql, args = []) => ({
        bind: (...values) => statement(sql, values),
        run: async () => sqlite.prepare(sql).run(...args),
        first: async () => sqlite.prepare(sql).get(...args) ?? null,
    });
    return {
        prepare: (sql) => statement(sql),
        batch: async (statements) => Promise.all(statements.map((s) => s.run())),
    };
}

const ID = 'b6f0c2d4-1a2b-4c3d-8e9f-0123456789ab';
const result = (extra) => ({
    profileId: ID,
    name: 'Alice',
    kills: 4,
    deaths: 2,
    bestStreak: 3,
    matches: 1,
    wins: 0,
    seconds: 300,
    ...extra,
});

test('results add up on a profile, made on first use', { skip }, async () => {
    const db = d1();
    assert.equal(await getProfile(db, ID), null);
    await saveResults(db, [result()], 1000);
    await saveResults(db, [result({ name: 'Ally', kills: 6, bestStreak: 2, wins: 1, seconds: 120 })], 2000);
    await saveResults(db, [result({ name: 'Ally', matches: 0, kills: 1, deaths: 0, bestStreak: 7, seconds: 30 })], 3000);
    assert.deepEqual(await getProfile(db, ID), {
        name: 'Ally',
        kills: 11,
        deaths: 4,
        matches: 2,
        wins: 1,
        bestStreak: 7,
        seconds: 450,
    });
});

test('several players are saved in one batch', { skip }, async () => {
    const db = d1();
    const other = '0123456789abcdef0123';
    await saveResults(db, [result(), result({ profileId: other, name: 'Bob', kills: 0 })]);
    assert.equal((await getProfile(db, other)).name, 'Bob');
    assert.equal((await getProfile(db, ID)).kills, 4);
});
