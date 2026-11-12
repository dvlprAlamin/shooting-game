import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccount, deleteProfile, getProfile, saveResults, signIn } from '../src/profiles.js';
import { d1, skipD1 as skip } from './d1.js';

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

// Sign-in. Device ids are what each device has been playing as; GOOGLE is an account.
const PHONE = 'phone-0000-0000-0000-000000000001';
const TABLET = 'tablet-000-0000-0000-000000000002';
const GOOGLE = { provider: 'google', subject: '109876543210987654321' };
const fresh = (() => {
    let n = 0;
    return () => `new-profile-${String(++n).padStart(8, '0')}`;
})();
const played = (db, profileId, extra) => saveResults(db, [result({ profileId, ...extra })]);

test('a first sign-in keeps the record the device has so far', { skip }, async () => {
    const db = d1();
    await played(db, PHONE, { name: 'Phone' });
    assert.equal(await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh), PHONE);
    assert.equal((await getProfile(db, PHONE)).kills, 4);
    // Signing in again on the same device changes nothing.
    assert.equal(await signIn(db, { ...GOOGLE, profileId: PHONE }, 2, fresh), PHONE);
    assert.equal((await getProfile(db, PHONE)).kills, 4);
});

test("another device's guest record is added to the account's, and that guest profile goes", { skip }, async () => {
    const db = d1();
    await played(db, PHONE, { name: 'Phone', kills: 4, deaths: 2, bestStreak: 3, matches: 1, wins: 1, seconds: 300 });
    await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh);
    await played(db, TABLET, { name: 'Tablet', kills: 10, deaths: 1, bestStreak: 8, matches: 2, wins: 0, seconds: 60 });

    assert.equal(await signIn(db, { ...GOOGLE, profileId: TABLET }, 2, fresh), PHONE);
    assert.deepEqual(await getProfile(db, PHONE), {
        name: 'Phone', // the account's name stays
        kills: 14,
        deaths: 3,
        matches: 3,
        wins: 1,
        bestStreak: 8,
        seconds: 360,
    });
    assert.equal(await getProfile(db, TABLET), null);
});

test('an account that never played takes the record of the device it signs in from', { skip }, async () => {
    const db = d1();
    // A device that never played signs in: the account has no totals yet.
    assert.equal(await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh), PHONE);
    assert.equal(await getProfile(db, PHONE), null);
    // Then a device that has played signs in to it: its record moves over.
    await played(db, TABLET);
    assert.equal(await signIn(db, { ...GOOGLE, profileId: TABLET }, 2, fresh), PHONE);
    assert.equal((await getProfile(db, PHONE)).name, 'Alice');
    assert.equal(await getProfile(db, TABLET), null);
});

test("a device still holding one account's profile can't hand it to another account", { skip }, async () => {
    const db = d1();
    await played(db, PHONE);
    await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh);

    const other = { provider: 'google', subject: 'someone-else' };
    const id = await signIn(db, { ...other, profileId: PHONE }, 2, fresh);
    assert.match(id, /^new-profile-/);
    assert.equal((await getProfile(db, PHONE)).kills, 4); // still the first account's
    assert.equal(await signIn(db, { ...GOOGLE, profileId: TABLET }, 3, fresh), PHONE);

    // Nor merge it into an account that has a profile already.
    await played(db, id, { kills: 1 });
    assert.equal(await signIn(db, { ...other, profileId: PHONE }, 4, fresh), id);
    assert.equal((await getProfile(db, id)).kills, 1);
    assert.equal((await getProfile(db, PHONE)).kills, 4);
});

test('deleting a profile clears its record and its account link', { skip }, async () => {
    const db = d1();
    await played(db, PHONE);
    await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh);
    await deleteProfile(db, PHONE);
    assert.equal(await getProfile(db, PHONE), null);
    assert.deepEqual(db.all('SELECT * FROM accounts'), []);

    // Signing in again starts over, from the device's new profile.
    assert.equal(await signIn(db, { ...GOOGLE, profileId: TABLET }, 2, fresh), TABLET);
    await deleteProfile(db, 'never-existed-0000'); // fine too
});

test("deleting an account's record clears it and the link, and says whether there was one", { skip }, async () => {
    const db = d1();
    assert.equal(await deleteAccount(db, GOOGLE), false);
    await played(db, PHONE);
    await signIn(db, { ...GOOGLE, profileId: PHONE }, 1, fresh);
    await played(db, TABLET); // someone else's, never signed in
    assert.equal(await deleteAccount(db, GOOGLE), true);
    assert.equal(await getProfile(db, PHONE), null);
    assert.deepEqual(db.all('SELECT * FROM accounts'), []);
    assert.equal((await getProfile(db, TABLET)).kills, 4);
    assert.equal(await deleteAccount(db, GOOGLE), false);
});
