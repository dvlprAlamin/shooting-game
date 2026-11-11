// D1's API over an in-memory SQLite database (D1 is SQLite), enough for profiles.js.
// node:sqlite needs Node 22.5 or newer; on older versions the tests that use it are skipped (`skipD1`).
const { DatabaseSync } = await import('node:sqlite').catch(() => ({}));

export const skipD1 = DatabaseSync ? false : 'needs node:sqlite (Node 22.5+)';

export function d1() {
    const sqlite = new DatabaseSync(':memory:');
    const statement = (sql, args = []) => ({
        bind: (...values) => statement(sql, values),
        run: async () => sqlite.prepare(sql).run(...args),
        first: async () => sqlite.prepare(sql).get(...args) ?? null,
    });
    return {
        prepare: (sql) => statement(sql),
        batch: async (statements) => Promise.all(statements.map((s) => s.run())),
        /** All rows of a query, for checking what's in the tables. */
        all: (sql, ...args) => sqlite.prepare(sql).all(...args),
    };
}
