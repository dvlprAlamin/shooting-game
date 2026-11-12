// Player profiles in D1: what each profile has done over all its matches. A profile is just an id the client
// makes and keeps; GameRoom hands over each player's results (GameRoom.reportResults) and the Room Durable
// Object saves them here. Whoever has the id plays as that profile, so the id is never shown to anyone.
//
// Signing in (optional) links a profile to an account, such as a Google account, so the record can be had back
// on any device: signIn hands the device the account's profile id.
//
// The tables are created on first use, so a new database needs no migration step.

const SCHEMA = `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kills INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    seconds INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)`;

// Which profile each signed-in account plays as. `provider` is 'google' (later 'apple'); `subject` is that
// provider's id for the account (the ID token's `sub`). Nothing else about the account is kept.
const ACCOUNTS = `CREATE TABLE IF NOT EXISTS accounts (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (provider, subject)
)`;
const ACCOUNTS_BY_PROFILE = 'CREATE INDEX IF NOT EXISTS accounts_by_profile ON accounts (profile_id)';

// Adds one match's results to a profile, creating it if it's new. The name is the latest one used.
const SAVE = `INSERT INTO profiles (id, name, kills, deaths, matches, wins, best_streak, seconds, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
ON CONFLICT (id) DO UPDATE SET
    name = excluded.name,
    kills = kills + excluded.kills,
    deaths = deaths + excluded.deaths,
    matches = matches + excluded.matches,
    wins = wins + excluded.wins,
    best_streak = max(best_streak, excluded.best_streak),
    seconds = seconds + excluded.seconds,
    updated_at = excluded.updated_at`;

const LOAD = 'SELECT name, kills, deaths, matches, wins, best_streak, seconds FROM profiles WHERE id = ?1';

const FIND_ACCOUNT = 'SELECT profile_id FROM accounts WHERE provider = ?1 AND subject = ?2';
const IS_LINKED = 'SELECT 1 AS linked FROM accounts WHERE profile_id = ?1 LIMIT 1';
const LINK = `INSERT INTO accounts (provider, subject, profile_id, created_at) VALUES (?1, ?2, ?3, ?4)
ON CONFLICT DO NOTHING`;
// Adds profile ?1's totals to profile ?2 (made if need be). The name stays ?2's.
const MERGE = `INSERT INTO profiles (id, name, kills, deaths, matches, wins, best_streak, seconds, created_at, updated_at)
SELECT ?2, name, kills, deaths, matches, wins, best_streak, seconds, created_at, ?3 FROM profiles WHERE id = ?1
ON CONFLICT (id) DO UPDATE SET
    kills = kills + excluded.kills,
    deaths = deaths + excluded.deaths,
    matches = matches + excluded.matches,
    wins = wins + excluded.wins,
    best_streak = max(best_streak, excluded.best_streak),
    seconds = seconds + excluded.seconds,
    created_at = min(created_at, excluded.created_at),
    updated_at = excluded.updated_at`;
const DROP = 'DELETE FROM profiles WHERE id = ?1';
const UNLINK = 'DELETE FROM accounts WHERE profile_id = ?1';

const ready = new WeakMap(); // database -> promise of its tables existing

const ensureTables = (db) => {
    let p = ready.get(db);
    if (!p) {
        p = db.batch([SCHEMA, ACCOUNTS, ACCOUNTS_BY_PROFILE].map((sql) => db.prepare(sql)));
        ready.set(db, p);
        p.catch(() => ready.delete(db)); // try again next time
    }
    return p;
};

/** Adds results ({ profileId, name, kills, deaths, matches, wins, bestStreak, seconds }) to their profiles. */
export async function saveResults(db, results, now = Date.now()) {
    if (!results.length) return;
    await ensureTables(db);
    const save = db.prepare(SAVE);
    await db.batch(
        results.map((r) =>
            save.bind(r.profileId, r.name, r.kills, r.deaths, r.matches, r.wins, r.bestStreak, r.seconds, now)
        )
    );
}

/** A profile's totals, or null if it has no results yet. */
export async function getProfile(db, id) {
    await ensureTables(db);
    const row = await db.prepare(LOAD).bind(id).first();
    if (!row) return null;
    return {
        name: row.name,
        kills: row.kills,
        deaths: row.deaths,
        matches: row.matches,
        wins: row.wins,
        bestStreak: row.best_streak,
        seconds: row.seconds,
    };
}

/**
 * Signs a device in to the account `provider`/`subject` and returns the profile id it should play as from
 * now on: the account's. `profileId` is the one the device has been using.
 *
 * - A new account takes the device's profile, so the record so far is kept. If that profile is already another
 *   account's (the device didn't sign out), the account gets a new profile instead.
 * - An account that already has a profile gets the device's record added to it, and the device's profile is
 *   deleted, unless that one belongs to another account too.
 */
export async function signIn(db, { provider, subject, profileId }, now = Date.now(), newId = () => crypto.randomUUID()) {
    await ensureTables(db);
    const linked = async (id) => Boolean(await db.prepare(IS_LINKED).bind(id).first());
    const find = () => db.prepare(FIND_ACCOUNT).bind(provider, subject).first();

    let account = await find();
    if (!account) {
        const id = (await linked(profileId)) ? newId() : profileId;
        await db.prepare(LINK).bind(provider, subject, id, now).run();
        account = await find(); // another device signing in to the same account at once may have won
        if (account.profile_id === id) return id;
    }
    const target = account.profile_id;
    if (target !== profileId && !(await linked(profileId))) {
        await db.batch([db.prepare(MERGE).bind(profileId, target, now), db.prepare(DROP).bind(profileId)]);
    }
    return target;
}

/** Deletes a profile's record and unlinks its accounts: signing in again starts from nothing. */
export async function deleteProfile(db, id) {
    await ensureTables(db);
    await db.batch([db.prepare(DROP).bind(id), db.prepare(UNLINK).bind(id)]);
}

/** Deletes the record of the account `provider`/`subject`, as deleteProfile does. False if it has none. */
export async function deleteAccount(db, { provider, subject }) {
    await ensureTables(db);
    const account = await db.prepare(FIND_ACCOUNT).bind(provider, subject).first();
    if (!account) return false;
    await deleteProfile(db, account.profile_id);
    return true;
}
