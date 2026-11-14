import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEEP_DAYS, LIMITS, parseReport, saveError } from '../src/errors.js';
import { d1, skipD1 as skip } from './d1.js';

const DAY = 24 * 60 * 60 * 1000;
const report = (extra) =>
    parseReport({
        message: "TypeError: Cannot read properties of undefined (reading 'x')",
        stack: 'TypeError: ...\n    at a (https://localhost/assets/index-1.js:1:200)\n    at b (https://localhost/assets/index-1.js:1:900)',
        version: '1.0 (3) c6de29e',
        platform: 'android',
        device: 'itel P673L',
        url: 'https://localhost/',
        ...extra,
    });

test('a report needs a message; other fields are cut to size, and missing ones are empty', () => {
    for (const body of [null, 'oops', [], {}, { message: 7 }, { message: '  ' }]) {
        assert.equal(parseReport(body), null, JSON.stringify(body));
    }
    const long = parseReport({ message: 'x'.repeat(9000), stack: 's'.repeat(9000), device: 42, extra: 'ignored' });
    assert.equal(long.message.length, LIMITS.message);
    assert.equal(long.stack.length, LIMITS.stack);
    assert.deepEqual(
        { ...long, message: '', stack: '' },
        { message: '', stack: '', version: '', platform: '', device: '', url: '' }
    );
});

test('the same error from the same version is one row with a count; the latest device is kept', { skip }, async () => {
    const db = d1();
    await saveError(db, report(), 1000);
    await saveError(db, report({ device: 'Pixel 8', platform: 'android' }), 2000);
    await saveError(db, report({ version: '1.0 (4) abc1234' }), 3000);
    await saveError(db, report({ message: 'Another error' }), 4000);

    const rows = db.all('SELECT message, version, device, count, first_seen, last_seen FROM errors ORDER BY first_seen');
    assert.equal(rows.length, 3);
    assert.deepEqual({ ...rows[0] }, {
        message: report().message,
        version: '1.0 (3) c6de29e',
        device: 'Pixel 8',
        count: 2,
        first_seen: 1000,
        last_seen: 2000,
    });
    assert.equal(rows[1].version, '1.0 (4) abc1234');
    assert.equal(rows[2].message, 'Another error');
});

test('errors not seen for KEEP_DAYS are deleted when a report comes in', { skip }, async () => {
    const db = d1();
    await saveError(db, report({ message: 'old' }), 0);
    await saveError(db, report({ message: 'recent' }), 10 * DAY);
    await saveError(db, report({ message: 'new' }), (KEEP_DAYS + 1) * DAY);
    assert.deepEqual(db.all('SELECT message FROM errors ORDER BY last_seen').map((r) => r.message), ['recent', 'new']);
});
