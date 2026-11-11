import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE, REPORT_EVERY, RoomHost } from '../src/game/RoomHost.js';
import { QUICK_PLAY } from '@shooter/shared';
import { GAME_OVER_TTL_MS, RECONNECT_GRACE_MS } from '../src/game/GameRoom.js';

// A RoomHost on a fake clock with hand-driven timers, and fake sockets that record frames.
function setup(options = {}) {
    const clock = { t: 1_000_000 };
    const timeouts = new Map();
    const intervals = new Map();
    let next = 1;
    const timers = {
        setTimeout: (fn, ms) => (timeouts.set(next, { fn, at: clock.t + ms }), next++),
        clearTimeout: (id) => timeouts.delete(id),
        setInterval: (fn) => (intervals.set(next, fn), next++),
        clearInterval: (id) => intervals.delete(id),
    };
    let ids = 0;
    const host = new RoomHost({ now: () => clock.t, timers, newId: () => `p${++ids}`, ...options });

    // Advance the clock a second at a time, firing due timeouts and the room timer.
    const advance = (ms) => {
        for (let left = ms; left > 0; left -= 1000) {
            clock.t += Math.min(1000, left);
            for (const [id, t] of [...timeouts]) if (t.at <= clock.t) { timeouts.delete(id); t.fn(); }
            for (const fn of [...intervals.values()]) fn();
        }
    };

    const open = () => {
        const socket = {
            frames: [],
            closedWith: null,
            send(text) { this.frames.push(JSON.parse(text)); },
            close(code, reason) { this.closedWith = { code, reason }; },
        };
        const conn = host.connect(socket);
        socket.say = (e, d) => host.message(conn, JSON.stringify({ e, d }));
        socket.drop = () => host.closed(conn);
        socket.events = () => socket.frames.map((f) => f.e);
        socket.notes = () => socket.frames.filter((f) => f.e === 'notification').map((f) => f.d.message);
        return socket;
    };
    const join = (name, extra = {}) => {
        const s = open();
        s.say('joinRoom', { roomId: 'r1', playerName: name, playerKey: `key-${name}`, ...extra });
        return s;
    };
    return { host, clock, advance, open, join, intervals };
}

test('the first join creates the room; joining a room that does not exist is refused', () => {
    const { host, join } = setup();
    const lost = join('Lost');
    assert.deepEqual(lost.notes(), ['No room has that code. Check it with whoever made the room.']);
    assert.equal(lost.closedWith.code, CLOSE.JOIN_FAILED);
    assert.equal(host.game, null);

    const alice = join('Alice', { isCreate: true, duration: '10', playersLimit: '5' });
    assert.deepEqual(alice.events(), ['joinedRoom', 'currentPlayers', 'timerUpdate', 'leaderboardAllPlayers']);
    assert.deepEqual(alice.frames[0].d, { message: 'Joined Room Successful!', id: 'p1', map: 'canyon', mode: 'ffa' });
    assert.equal(host.game.duration, 600);

    const bob = join('Bob');
    assert.equal(bob.frames[0].d.id, 'p2');
    assert.ok(alice.events().includes('newPlayer'));
});

test('the room is on the map its creator picked, and everyone who joins is told which', () => {
    const { host, join } = setup();
    join('Alice', { isCreate: true, map: 'outpost' });
    const bob = join('Bob', { map: 'depot' });
    assert.equal(host.game.map.id, 'outpost');
    assert.equal(bob.frames[0].d.map, 'outpost');
});

test('the creator picks the mode too; joiners get the room\'s', () => {
    const { host, join } = setup();
    join('Alice', { isCreate: true, mode: 'tdm' });
    const bob = join('Bob', { mode: 'ffa' });
    assert.equal(host.game.mode, 'tdm');
    assert.equal(bob.frames[0].d.mode, 'tdm');
    assert.ok(bob.events().includes('teamScores'));
});

test('game messages go to the GameRoom under the player id the server assigned', () => {
    const { host, join } = setup();
    const alice = join('Alice', { isCreate: true });
    const bob = join('Bob');
    alice.say('move', { t: 1, p: [1, 2, 3], yaw: 0, pitch: 0, f: 1 });
    assert.deepEqual(host.game.players.p1.position, { x: 1, y: 2, z: 3 });
    assert.deepEqual(bob.frames.at(-1), { e: 'playerMoved', d: { id: 'p1', t: 1, p: [1, 2, 3], yaw: 0, pitch: 0, f: 1 } });

    // Weapons: switching, reloading and the medkit.
    alice.say('switchWeapon', { w: 'smg' });
    assert.deepEqual(bob.frames.at(-1), { e: 'playerWeapon', d: { id: 'p1', weapon: 'smg' } });
    host.game.players.p1.rounds.smg = 3;
    alice.say('reload');
    assert.ok(host.game.players.p1.reloadAt > 0);
    host.game.players.p1.health = 50;
    alice.say('heal');
    assert.ok(host.game.players.p1.healAt > 0);

    // Unknown events, bad JSON and game messages before joining are ignored.
    const before = bob.frames.length;
    alice.say('tick');
    alice.say('constructor');
    host.message(host.connections.get('p1'), '{nope');
    const stranger = setup().open();
    stranger.say('move', { p: [0, 0, 0] });
    assert.equal(bob.frames.length, before);
});

test('the reconnect key is never sent to other players', () => {
    const { join } = setup();
    const alice = join('Alice', { isCreate: true });
    join('Bob');
    assert.ok(!JSON.stringify(alice.frames).includes('key-'));
});

test('a dropped player who comes back within the grace period gets their player back', () => {
    const { host, advance, join } = setup();
    const alice = join('Alice', { isCreate: true });
    const bob = join('Bob');
    host.game.players.p2.kills = 3;

    bob.drop();
    advance(RECONNECT_GRACE_MS - 2000);
    assert.ok(!alice.events().includes('playerDisconnected'));

    const back = join('Bob'); // same key, new connection
    assert.equal(back.frames[0].d.id, 'p2');
    assert.deepEqual(back.events(), ['joinedRoom', 'currentPlayers', 'timerUpdate', 'leaderboardAllPlayers']);
    assert.equal(back.frames[1].d.p2.kills, 3);
    advance(RECONNECT_GRACE_MS);
    assert.ok(!alice.events().includes('playerDisconnected'));
    assert.equal(Object.keys(host.game.players).length, 2);
});

test('a dropped player who does not come back leaves after the grace period', () => {
    const { host, advance, join } = setup();
    const alice = join('Alice', { isCreate: true });
    join('Bob').drop();
    advance(RECONNECT_GRACE_MS);
    assert.ok(alice.events().includes('playerDisconnected'));
    assert.deepEqual(Object.keys(host.game.players), ['p1']);

    // Too late now: the key joins as a new player.
    assert.equal(join('Bob').frames[0].d.id, 'p3');
});

test('connecting again while the old connection is still open replaces it', () => {
    const { host, join } = setup();
    const alice = join('Alice', { isCreate: true });
    const bob = join('Bob');
    const bob2 = join('Bob');
    assert.equal(bob.closedWith.code, CLOSE.REPLACED);
    assert.equal(bob2.frames[0].d.id, 'p2');

    // The old connection's close event must not drop the player that now lives on bob2.
    bob.drop();
    alice.say('move', { t: 1, p: [0, 0, 0] });
    assert.equal(bob2.frames.at(-1).e, 'playerMoved');
    assert.equal(host.game.players.p2.droppedAt, null);
});

test('the room ends when the last player is gone, timer included', () => {
    const { host, advance, join, intervals } = setup();
    const alice = join('Alice', { isCreate: true });
    assert.equal(intervals.size, 1);
    alice.drop();
    assert.ok(host.game, 'kept while Alice may still come back');
    advance(RECONNECT_GRACE_MS);
    assert.equal(host.game, null);
    assert.equal(intervals.size, 0);
    assert.deepEqual(join('Late').notes(), ['No room has that code. Check it with whoever made the room.']);
});

test('full and finished rooms refuse new players but let dropped players back in', () => {
    const { host, join } = setup();
    join('P0', { isCreate: true, playersLimit: '5' });
    for (let i = 1; i < 5; i++) join('P' + i);
    const late = join('Late');
    assert.deepEqual(late.notes(), ['That room is full.']);
    assert.equal(late.closedWith.code, CLOSE.JOIN_FAILED);

    host.game.ended = true;
    assert.deepEqual(join('Later').notes(), ['That match is already over.']);
    const back = join('P1');
    assert.deepEqual(back.events().slice(-2), ['gameOver', 'rematchVotes']);
});

test('leaving on purpose removes the player at once', () => {
    const { host, join } = setup();
    const alice = join('Alice', { isCreate: true });
    const bob = join('Bob');
    bob.say('leave');
    assert.equal(bob.closedWith.code, 1000);
    assert.ok(alice.events().includes('playerDisconnected'));
    assert.deepEqual(Object.keys(host.game.players), ['p1']);

    alice.say('leave');
    assert.equal(host.game, null);
});

test('a finished match that nobody restarts closes the room', () => {
    const { host, advance, join, intervals } = setup();
    const alice = join('Alice', { isCreate: true });
    const bob = join('Bob');
    host.game.duration = 1;
    advance(1000);
    assert.ok(alice.events().includes('gameOver'));

    advance(GAME_OVER_TTL_MS);
    for (const s of [alice, bob]) {
        assert.equal(s.closedWith.code, CLOSE.ROOM_CLOSED);
        assert.deepEqual(s.notes(), ['The match is over and the room has closed.']);
    }
    assert.equal(host.game, null);
    assert.equal(intervals.size, 0);
});

test('joining twice on one connection is refused', () => {
    const { join } = setup();
    const alice = join('Alice', { isCreate: true });
    alice.say('joinRoom', { roomId: 'r1', playerName: 'Again' });
    assert.deepEqual(alice.notes(), ['Already in a room!']);
    assert.equal(alice.closedWith, null);
});

test('connections that flood, send huge frames or never join are closed', () => {
    const { advance, join, open } = setup();
    const alice = join('Alice', { isCreate: true }); // the join is message 1 of this second
    for (let i = 0; i < 59; i++) alice.say('move', { t: i, p: [0, 0, 0] });
    assert.equal(alice.closedWith, null, '60 messages in a second is allowed');
    alice.say('move', { t: 61, p: [0, 0, 0] });
    assert.equal(alice.closedWith.code, CLOSE.LIMIT);

    const big = join('Big');
    big.say('move', { pad: 'x'.repeat(5000) });
    assert.equal(big.closedWith.code, CLOSE.LIMIT);

    const idle = open();
    advance(10_000);
    assert.equal(idle.closedWith.code, CLOSE.JOIN_TIMEOUT);
});

test('a quick-play join opens a public room with the quick-play settings on a random map', () => {
    const reports = [];
    const { host, join } = setup({ random: () => 0.99, onReport: (s) => reports.push(s) });
    const alice = join('Alice', { quick: true, mode: 'tdm', duration: '30', map: 'canyon' });
    assert.equal(alice.frames[0].e, 'joinedRoom');
    assert.equal(host.game.mode, QUICK_PLAY.mode);
    assert.equal(host.game.matchLength, QUICK_PLAY.duration * 60);
    assert.equal(host.game.playersLimit, QUICK_PLAY.playersLimit);
    assert.equal(host.game.map.id, 'outpost'); // the last map, for random() = 0.99
    assert.deepEqual(reports, [{ players: 1, limit: QUICK_PLAY.playersLimit, ended: false, secondsLeft: 600 }]);

    // Friends can still join by code.
    join('Bob');
    assert.equal(reports.at(-1).players, 2);
});

test('a public room reports changes at once and its state every few seconds; null when it closes', () => {
    const reports = [];
    const { host, join, advance } = setup({ onReport: (s) => reports.push(s) });
    const alice = join('Alice', { quick: true });
    reports.length = 0;
    advance(1000);
    assert.equal(reports.length, 0, 'only the timer changed');
    advance((REPORT_EVERY - 1) * 1000);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].secondsLeft, QUICK_PLAY.duration * 60 - REPORT_EVERY);

    host.game.duration = 1;
    advance(1000);
    assert.equal(reports.at(-1).ended, true);
    alice.say('leave');
    assert.equal(reports.at(-1), null);
    assert.equal(host.game, null);
});

test('private rooms never report', () => {
    const reports = [];
    const { join, advance } = setup({ onReport: (s) => reports.push(s) });
    join('Alice', { isCreate: true });
    advance(REPORT_EVERY * 2000);
    assert.deepEqual(reports, []);
});

test('a valid profile id goes with the player; results are handed on', () => {
    const results = [];
    const { host, join } = setup({ onResults: (r) => results.push(...r) });
    join('Alice', { isCreate: true, profileId: 'b6f0c2d4-1a2b-4c3d-8e9f-0123456789ab' });
    join('Bob', { profileId: 'not valid!' });
    assert.deepEqual(Object.values(host.game.players).map((p) => p.profileId), ['b6f0c2d4-1a2b-4c3d-8e9f-0123456789ab', null]);
    host.game.duration = 1;
    host.game.tick();
    assert.deepEqual(results.map((r) => r.name), ['Alice']);
});
