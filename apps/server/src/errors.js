// Crash reports from the apps (POST /errors, sent by apps/client/src/net/crashReports.ts), in D1. Reports of
// the same error from the same build are one row with a count, so a flood of repeats stays one row. Nothing ties a
// report to a player: no profile id, no address. Rows not seen for KEEP_DAYS are deleted.
//
// `pnpm errors` lists the latest; one's stack: `wrangler d1 execute shooting-game --remote --command "SELECT stack
// FROM errors WHERE fingerprint = '...'"` from apps/server, or the D1 console in the Cloudflare dashboard.

export const KEEP_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// The longest each field is kept; longer ones are cut.
export const LIMITS = { message: 500, stack: 4096, version: 64, platform: 16, device: 300, url: 200 };

const SCHEMA = `CREATE TABLE IF NOT EXISTS errors (
    fingerprint TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    stack TEXT NOT NULL,
    version TEXT NOT NULL,
    platform TEXT NOT NULL,
    device TEXT NOT NULL,
    url TEXT NOT NULL,
    count INTEGER NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
)`;
const BY_LAST_SEEN = 'CREATE INDEX IF NOT EXISTS errors_by_last_seen ON errors (last_seen)';

// The device, platform and page are the latest report's.
const SAVE = `INSERT INTO errors (fingerprint, message, stack, version, platform, device, url, count, first_seen, last_seen)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)
ON CONFLICT (fingerprint) DO UPDATE SET
    count = count + 1,
    platform = excluded.platform,
    device = excluded.device,
    url = excluded.url,
    last_seen = excluded.last_seen`;
const EXPIRE = 'DELETE FROM errors WHERE last_seen < ?1';

const ready = new WeakMap(); // database -> promise of its table existing

const ensureTable = (db) => {
    let p = ready.get(db);
    if (!p) {
        p = db.batch([SCHEMA, BY_LAST_SEEN].map((sql) => db.prepare(sql)));
        ready.set(db, p);
        p.catch(() => ready.delete(db)); // try again next time
    }
    return p;
};

const cut = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

/** A report as it's stored ({ message, stack, version, platform, device, url }, each cut to LIMITS), or null if
 *  `body` isn't one (it needs a message). */
export function parseReport(body) {
    if (!body || typeof body !== 'object' || typeof body.message !== 'string' || !body.message.trim()) return null;
    return Object.fromEntries(Object.entries(LIMITS).map(([key, max]) => [key, cut(body[key], max)]));
}

// Which error it is: the build, the message and the top of the stack (deeper frames can differ by caller).
const fingerprint = async ({ version, message, stack }) => {
    const top = stack.split('\n').slice(0, 4).join('\n');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${version}\n${message}\n${top}`));
    return [...new Uint8Array(digest).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** Saves a report from parseReport, and deletes the reports no one has sent for KEEP_DAYS. */
export async function saveError(db, report, now = Date.now()) {
    await ensureTable(db);
    const r = report;
    await db.batch([
        db.prepare(SAVE).bind(await fingerprint(r), r.message, r.stack, r.version, r.platform, r.device, r.url, now),
        db.prepare(EXPIRE).bind(now - KEEP_DAYS * DAY),
    ]);
}
