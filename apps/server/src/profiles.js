// Player profiles in D1: what each profile has done over all its matches. A profile is just an id the client
// makes and keeps (no account); GameRoom hands over each player's results (GameRoom.reportResults) and the
// Room Durable Object saves them here.
//
// The table is created on first use, so a new database needs no migration step.

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

const ready = new WeakMap(); // database -> promise of its table existing

const ensureTable = (db) => {
    let p = ready.get(db);
    if (!p) {
        p = db.prepare(SCHEMA).run();
        ready.set(db, p);
        p.catch(() => ready.delete(db)); // try again next time
    }
    return p;
};

/** Adds results ({ profileId, name, kills, deaths, matches, wins, bestStreak, seconds }) to their profiles. */
export async function saveResults(db, results, now = Date.now()) {
    if (!results.length) return;
    await ensureTable(db);
    const save = db.prepare(SAVE);
    await db.batch(
        results.map((r) =>
            save.bind(r.profileId, r.name, r.kills, r.deaths, r.matches, r.wins, r.bestStreak, r.seconds, now)
        )
    );
}

/** A profile's totals, or null if it has no results yet. */
export async function getProfile(db, id) {
    await ensureTable(db);
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
