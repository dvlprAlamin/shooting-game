import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_PLAY } from '@rimfire/shared';
import { MIN_TIME_LEFT, Matchmaker, RESERVATION_MS, STALE_MS } from '../src/game/Matchmaker.js';

function setup() {
    const clock = { t: 1_000_000 };
    let n = 0;
    const mm = new Matchmaker({ now: () => clock.t, newId: () => `new${++n}` });
    return { mm, clock };
}

const room = (players, extra = {}) => ({ players, limit: 10, ended: false, secondsLeft: 300, ...extra });

test('with no public rooms it names a new one, and fills it before naming another', () => {
    const { mm } = setup();
    assert.equal(mm.pick(), 'new1');
    assert.equal(mm.pick(), 'new1'); // the first player hasn't joined yet, but their slot is held
    for (let i = 2; i < QUICK_PLAY.playersLimit; i++) mm.pick();
    assert.equal(mm.pick(), 'new2', 'new1 is full with reservations');
});

test('it sends players to the fullest room with a free slot and time left', () => {
    const { mm } = setup();
    mm.report('quiet', room(2));
    mm.report('busy', room(7));
    mm.report('full', room(10));
    mm.report('over', room(8, { ended: true }));
    mm.report('ending', room(9, { secondsLeft: MIN_TIME_LEFT - 1 }));
    assert.equal(mm.pick(), 'busy');
    assert.equal(mm.pick(), 'busy');
    assert.equal(mm.pick(), 'busy'); // 7 + 3 held = full
    assert.equal(mm.pick(), 'quiet');
});

test('a player who joins fills their held slot; slots nobody came for open again', () => {
    const { mm, clock } = setup();
    mm.report('r', room(8));
    assert.equal(mm.pick(), 'r');
    mm.report('r', room(9)); // they joined: counted once, not twice
    assert.equal(mm.pick(), 'r');
    assert.notEqual(mm.pick(), 'r', '9 players and one slot held');

    // That one never came.
    clock.t += RESERVATION_MS;
    assert.equal(mm.pick(), 'r');
});

test('closed and silent rooms drop off the list', () => {
    const { mm, clock } = setup();
    mm.report('closed', room(5));
    mm.report('closed', null);
    mm.report('silent', room(5));
    clock.t += STALE_MS + 1;
    mm.report('alive', room(1));
    assert.equal(mm.pick(), 'alive');
    assert.deepEqual([...mm.rooms.keys()], ['alive']);
});
