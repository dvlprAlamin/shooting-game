import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../src/game/GameRoom.js';
import { DAMAGE, FIRE_INTERVAL, MAX_HEALTH, ROOM_DURATIONS, PLAYER_LIMITS } from '@shooter/shared';

// A room with a fake clock and a log of everything it sends.
function setup(options = {}) {
    const sent = [];
    const clock = { t: 1_000_000 };
    const room = new GameRoom({
        send: (to, event, data, volatile = false) => sent.push({ to, event, data: structuredClone(data), volatile }),
        now: () => clock.t,
        random: () => 0,
        ...options,
    });
    const take = () => sent.splice(0);
    const events = (to) => sent.filter((e) => e.to === to).map((e) => e.event);
    return { room, sent, clock, take, events };
}

const EYE = { x: 0, y: 0.7, z: 0 };
const TOWARDS_B = { x: 0, y: -0.07, z: -1 }; // from EYE to a player standing at (0, 0, -10)

// A at the origin, B 10 m in front of A.
function twoPlayers() {
    const s = setup();
    s.room.join('A', 'Alice');
    s.room.join('B', 'Bob');
    s.room.move('A', { t: 1, p: [0, 0, 0], yaw: 0, pitch: 0, f: 1 });
    s.room.move('B', { t: 1, p: [0, 0, -10], yaw: 0, pitch: 0, f: 1 });
    s.take();
    return s;
}

const shootB = (s) => {
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
};

test('options outside the offered lists fall back to the defaults', () => {
    const { room } = setup({ duration: '999', playersLimit: -1 });
    assert.equal(room.duration, ROOM_DURATIONS[0] * 60);
    assert.equal(room.playersLimit, PLAYER_LIMITS[0]);
    const { room: custom } = setup({ duration: '10', playersLimit: '15' });
    assert.equal(custom.duration, 600);
    assert.equal(custom.playersLimit, 15);
});

test('joining sends the room to the newcomer and the newcomer to everyone else', () => {
    const { room, take, events } = setup();
    assert.equal(room.join('A', '  Alice  '), null);
    assert.deepEqual(events('A'), ['joinedRoom', 'currentPlayers', 'timerUpdate', 'leaderboardAllPlayers']);
    take();

    room.join('B', '');
    assert.deepEqual(events('A'), ['newPlayer', 'leaderboardAllPlayers']);
    assert.equal(room.players.A.playerName, 'Alice');
    assert.equal(room.players.B.playerName, 'Player');
});

test('a full or finished room turns players away', () => {
    const { room } = setup({ playersLimit: 5 });
    for (let i = 0; i < 5; i++) assert.equal(room.join('P' + i, 'P'), null);
    assert.equal(room.join('late', 'Late'), 'That room is full.');
    assert.equal(room.join('P0', 'again'), 'Already in a room!');

    const { room: over } = setup();
    over.join('A', 'Alice');
    over.ended = true;
    assert.equal(over.join('B', 'Bob'), 'That match is already over.');
});

test('movement is relayed to the others as a volatile event and ignored when malformed', () => {
    const { room, take } = setup();
    room.join('A', 'Alice');
    room.join('B', 'Bob');
    take();

    room.move('A', { t: 5, p: [1, 2, 3], yaw: 'bad', pitch: 0.2, f: 3.9 });
    assert.deepEqual(take(), [{
        to: 'B', event: 'playerMoved', volatile: true,
        data: { id: 'A', t: 5, p: [1, 2, 3], yaw: 0, pitch: 0.2, f: 3 },
    }]);
    assert.deepEqual(room.players.A.position, { x: 1, y: 2, z: 3 });

    for (const bad of [null, {}, { p: 'x' }, { p: [0, NaN, 0] }]) room.move('A', bad);
    room.move('nobody', { p: [0, 0, 0] });
    assert.deepEqual(take(), []);
});

test('a valid hit costs health and is confirmed to both players', () => {
    const s = twoPlayers();
    shootB(s);
    assert.equal(s.room.players.B.health, MAX_HEALTH - DAMAGE);
    const sent = s.take();
    assert.deepEqual(sent.map((e) => `${e.to}:${e.event}`), ['B:playerShot', 'B:hit', 'A:hitConfirmed']);
    assert.deepEqual(sent[1].data, { health: MAX_HEALTH - DAMAGE, from: EYE, shooter: 'A' });
});

test('the server rejects shots that are too fast, malformed, or claim a player the ray misses', () => {
    const s = twoPlayers();
    shootB(s);
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' }); // no time has passed
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: { x: 1, y: 0, z: 0 }, target: 'B' }); // points away from B
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'A' }); // itself
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: null }); // client says it missed
    for (const bad of [null, { o: EYE }, { o: { x: 0 }, d: TOWARDS_B }, { o: EYE, d: { x: 0, y: 0, z: 0 } }]) {
        s.clock.t += FIRE_INTERVAL;
        s.room.shoot('A', bad);
    }
    assert.equal(s.room.players.B.health, MAX_HEALTH - DAMAGE);
});

test('without a target field the server finds the player on the ray itself', () => {
    const s = twoPlayers();
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B });
    assert.equal(s.room.players.B.health, MAX_HEALTH - DAMAGE);
});

test('the killing shot announces the kill and updates the scores', () => {
    const s = twoPlayers();
    for (let i = 0; i < MAX_HEALTH / DAMAGE; i++) shootB(s);
    assert.equal(s.room.players.B.isDead, true);
    assert.equal(s.room.players.A.kills, 1);
    assert.deepEqual(s.events('A').slice(-3), ['playerDead', 'playerKilled', 'leaderboardAllPlayers']);
    const dead = s.sent.find((e) => e.event === 'playerDead' && e.to === 'B');
    assert.deepEqual(dead.data, { id: 'B', shooter: 'A', playerName: 'Bob', shooterName: 'Alice' });

    // Dead players can't be hit and can't shoot.
    s.take();
    shootB(s);
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('B', { o: { x: 0, y: 0.7, z: -10 }, d: { x: 0, y: 0, z: 1 }, target: 'A' });
    assert.equal(s.room.players.A.health, MAX_HEALTH);
    assert.ok(!s.sent.some((e) => e.event === 'hit'));
});

test('only dead players can respawn, at full health with one more death', () => {
    const s = twoPlayers();
    s.room.respawn('B');
    assert.deepEqual(s.take(), []);

    for (let i = 0; i < MAX_HEALTH / DAMAGE; i++) shootB(s);
    s.take();
    s.room.respawn('B');
    const b = s.room.players.B;
    assert.deepEqual([b.isDead, b.health, b.deaths], [false, MAX_HEALTH, 1]);
    assert.deepEqual(s.events('A'), ['playerRespawned', 'leaderboardAllPlayers']);
});

test('the timer counts down every tick and ends the match at zero', () => {
    const s = twoPlayers();
    s.room.duration = 2;
    s.room.tick();
    assert.deepEqual(s.take().filter((e) => e.to === 'A').map((e) => [e.event, e.data]), [['timerUpdate', 1]]);
    s.room.tick();
    assert.deepEqual(s.events('A'), ['timerUpdate', 'gameOver']);
    assert.equal(s.room.ended, true);

    // After the end: no more ticks, shots or respawns.
    s.take();
    s.room.tick();
    shootB(s);
    s.room.respawn('B');
    assert.deepEqual(s.take(), []);
});

test('leaving tells the others and empties the room', () => {
    const s = twoPlayers();
    s.room.leave('A');
    assert.deepEqual(s.events('B'), ['playerDisconnected', 'leaderboardAllPlayers']);
    assert.equal(s.room.isEmpty, false);
    s.room.leave('B');
    s.room.leave('B');
    assert.equal(s.room.isEmpty, true);
});
