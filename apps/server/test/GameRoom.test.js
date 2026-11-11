import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    GAME_OVER_TTL_MS,
    GameRoom,
    REGEN_DELAY_MS,
    REGEN_PER_TICK,
    REMATCH_WAIT,
    TIMING_SLACK,
} from '../src/game/GameRoom.js';
import {
    MAX_HEALTH,
    PLAYER_LIMITS,
    ROOM_DURATIONS,
    SPAWN_PROTECTION,
} from '@shooter/shared';
import { DEFAULT_MAP, getMap } from '@shooter/shared/maps';
import { MEDKIT, damageAt, getWeapon } from '@shooter/shared/weapons';

const SPAWN_POINTS = getMap(DEFAULT_MAP).spawns;
// Everyone starts with the rifle; most tests use it at 10 m, inside its full-damage range.
const RIFLE = getWeapon('rifle');
const { damage: DAMAGE, headDamage: HEAD_DAMAGE, fireInterval: FIRE_INTERVAL } = RIFLE;

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
const TOWARDS_B = { x: 0, y: -0.07, z: -1 }; // from EYE to the centre of a player standing at (0, 0, -10)
const TOWARDS_B_HEAD = { x: 0, y: 0.005, z: -1 }; // 0.75 m above that centre
const KILL_SHOTS = MAX_HEALTH / DAMAGE;

// A at the origin, B 10 m in front of A, both past their spawn protection.
function twoPlayers() {
    const s = setup();
    s.room.join('A', 'Alice');
    s.room.join('B', 'Bob');
    s.clock.t += SPAWN_PROTECTION;
    placeB(s);
    placeA(s);
    s.take();
    return s;
}

const placeA = (s) => s.room.move('A', { t: 1, p: [0, 0, 0], yaw: 0, pitch: 0, f: 1 });
const placeB = (s) => s.room.move('B', { t: 1, p: [0, 0, -10], yaw: 0, pitch: 0, f: 1 });

const shootB = (s, extra = {}) => {
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B', ...extra });
};

const killB = (s) => {
    for (let i = 0; i < KILL_SHOTS; i++) shootB(s);
};

// B back where A can shoot them, unprotected.
const respawnB = (s) => {
    s.room.respawn('B');
    s.clock.t += SPAWN_PROTECTION;
    placeB(s);
};

const squaredDistance = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
// Spawn points sorted farthest first from `p`.
const farthestFrom = (p) => [...SPAWN_POINTS].sort((a, b) => squaredDistance(b, p) - squaredDistance(a, p));

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
    assert.deepEqual(sent[1].data, { health: MAX_HEALTH - DAMAGE, from: EYE, shooter: 'A', headshot: false });
});

test('a headshot does more damage, but only if the ray really went through the head', () => {
    const s = twoPlayers();
    shootB(s, { d: TOWARDS_B_HEAD, head: true });
    assert.equal(s.room.players.B.health, MAX_HEALTH - HEAD_DAMAGE);
    const hit = s.take().find((e) => e.event === 'hit');
    assert.equal(hit.data.headshot, true);

    shootB(s, { head: true }); // claims the head, aimed at the chest
    assert.equal(s.room.players.B.health, MAX_HEALTH - HEAD_DAMAGE - DAMAGE);
    shootB(s, { d: TOWARDS_B_HEAD, head: 'yes' });
    assert.equal(s.room.players.B.health, MAX_HEALTH - HEAD_DAMAGE - 2 * DAMAGE);
});

test('a player who just spawned cannot be hurt until the protection runs out or they fire', () => {
    const s = setup();
    s.room.join('A', 'Alice');
    s.room.join('B', 'Bob');
    const newcomer = s.sent.find((e) => e.event === 'newPlayer');
    assert.equal(newcomer.data.protection, SPAWN_PROTECTION);
    placeA(s);
    placeB(s);
    s.take();

    shootB(s);
    assert.equal(s.room.players.B.health, MAX_HEALTH);
    assert.ok(!s.sent.some((e) => e.event === 'hit'));

    // B fires: their protection is gone, and everyone hears about it once.
    s.room.shoot('B', { o: { x: 0, y: 0.7, z: -10 }, d: { x: 0, y: 0, z: 1 }, target: null });
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('B', { o: { x: 0, y: 0.7, z: -10 }, d: { x: 0, y: 0, z: 1 }, target: null });
    const ended = s.sent.filter((e) => e.event === 'protectionEnded' && e.data.id === 'B');
    assert.deepEqual(ended.map((e) => e.to), ['A', 'B']);
    shootB(s);
    assert.equal(s.room.players.B.health, MAX_HEALTH - DAMAGE);

    // Without firing, it simply runs out.
    const t = setup();
    t.room.join('A', 'Alice');
    t.room.join('B', 'Bob');
    t.clock.t += SPAWN_PROTECTION - FIRE_INTERVAL - 1;
    placeA(t);
    placeB(t);
    shootB(t);
    assert.equal(t.room.players.B.health, MAX_HEALTH);
    shootB(t);
    assert.equal(t.room.players.B.health, MAX_HEALTH - DAMAGE);
});

test('respawns pick a spawn point far from the living enemies', () => {
    const s = twoPlayers();
    killB(s);
    s.room.respawn('B');
    const [first, second] = farthestFrom(s.room.players.A.position);
    assert.deepEqual(s.room.players.B.position, first);

    s.clock.t += SPAWN_PROTECTION;
    placeB(s);
    killB(s);
    s.room.random = () => 0.99; // the other of the two safe choices
    s.room.respawn('B');
    assert.deepEqual(s.room.players.B.position, second);
});

// Depot's warehouse: its west wall is solid from x = 16 to 16.5 between z = -4.5 and 4.5, with a 3 m high
// door from z = -7.5 to -4.5.
function depotDuel(a, b) {
    const s = setup({ map: 'depot' });
    s.room.join('A', 'Alice');
    s.room.join('B', 'Bob');
    s.clock.t += SPAWN_PROTECTION;
    s.room.move('A', { t: 1, p: a, yaw: 0, pitch: 0, f: 1 });
    s.room.move('B', { t: 1, p: b, yaw: 0, pitch: 0, f: 1 });
    s.take();
    return s;
}

const eyeOf = (s, id) => ({ ...s.room.players[id].position, y: s.room.players[id].position.y + 0.7 });
const aimAt = (from, to) => {
    const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const length = Math.hypot(d.x, d.y, d.z);
    return { x: d.x / length, y: d.y / length, z: d.z / length };
};
// A fires at B's body from A's eyes.
const fireAtB = (s, extra = {}) => {
    s.clock.t += FIRE_INTERVAL;
    const o = eyeOf(s, 'A');
    s.room.shoot('A', { o, d: aimAt(o, s.room.players.B.position), target: 'B', ...extra });
};

test('a room plays on the map it was made with, and spawns face the way the map says', () => {
    const s = setup({ map: 'outpost' });
    s.room.join('A', 'Alice');
    assert.deepEqual(s.sent[0].data, { message: 'Joined Room Successful!', id: 'A', map: 'outpost', mode: 'ffa' });
    const a = s.room.players.A;
    const point = getMap('outpost').spawns.find((p) => p.x === a.position.x && p.z === a.position.z);
    assert.ok(point, 'spawned on one of the map\'s points');
    assert.deepEqual(Object.keys(a.position), ['x', 'y', 'z']);
    assert.equal(a.rotation.y, point.yaw);
    assert.equal(s.sent.find((e) => e.event === 'currentPlayers').data.A.rotation.y, point.yaw);

    assert.equal(setup({ map: 'nope' }).room.map.id, DEFAULT_MAP);
    assert.equal(setup().room.map.id, DEFAULT_MAP);
});

test('shots through a wall do no damage; through a doorway they do', () => {
    const behind = depotDuel([12, 0.95, 0], [20, 0.95, 0]);
    fireAtB(behind);
    fireAtB(behind, { target: undefined }); // older clients: the server looks for a target itself
    assert.equal(behind.room.players.B.health, MAX_HEALTH);
    assert.deepEqual(behind.events('B'), ['playerShot', 'playerShot'], 'B still hears the shots');

    // Standing right against the far side doesn't help either.
    const hugging = depotDuel([12, 0.95, 0], [16.9, 0.95, 0]);
    fireAtB(hugging);
    assert.equal(hugging.room.players.B.health, MAX_HEALTH);

    const door = depotDuel([12, 0.95, -6], [19.8, 0.95, -6]);
    fireAtB(door);
    fireAtB(door, { target: undefined });
    assert.equal(door.room.players.B.health, MAX_HEALTH - 2 * DAMAGE);
});

test('shots have to start at the shooter\'s eyes, on their side of any wall', () => {
    const s = depotDuel([15.5, 0.95, 0], [20, 0.95, 0]);
    const eye = eyeOf(s, 'A');
    const far = { ...eye, z: eye.z + 5 };
    const pastTheWall = { ...eye, x: 16.8 };
    for (const o of [far, pastTheWall]) {
        s.clock.t += FIRE_INTERVAL;
        s.room.shoot('A', { o, d: aimAt(o, s.room.players.B.position), target: 'B' });
    }
    assert.deepEqual(s.take(), [], 'ignored altogether');
    assert.equal(s.room.players.B.health, MAX_HEALTH);

    // A little off (the shooter moved since their last update) is fine.
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: { ...eye, z: eye.z + 1 }, d: { x: -1, y: 0, z: 0 }, target: null });
    assert.deepEqual(s.events('B'), ['playerShot']);
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
    killB(s);
    assert.equal(s.room.players.B.isDead, true);
    assert.equal(s.room.players.B.deaths, 1, 'counted when it happens, not at the respawn');
    assert.equal(s.room.players.A.kills, 1);
    assert.deepEqual(s.events('A').slice(-3), ['playerDead', 'playerKilled', 'leaderboardAllPlayers']);
    const dead = s.sent.find((e) => e.event === 'playerDead' && e.to === 'B');
    assert.deepEqual(dead.data, {
        id: 'B',
        shooter: 'A',
        playerName: 'Bob',
        shooterName: 'Alice',
        headshot: false,
        weapon: 'rifle',
        streak: 1,
        endedStreak: 0,
        team: null,
        shooterTeam: null,
    });

    // Dead players can't be hit and can't shoot.
    s.take();
    shootB(s);
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('B', { o: { x: 0, y: 0.7, z: -10 }, d: { x: 0, y: 0, z: 1 }, target: 'A' });
    assert.equal(s.room.players.A.health, MAX_HEALTH);
    assert.ok(!s.sent.some((e) => e.event === 'hit'));
});

test('only dead players can respawn, at full health', () => {
    const s = twoPlayers();
    s.room.respawn('B');
    assert.deepEqual(s.take(), []);

    killB(s);
    s.take();
    s.room.respawn('B');
    const b = s.room.players.B;
    assert.deepEqual([b.isDead, b.health, b.deaths], [false, MAX_HEALTH, 1]);
    assert.deepEqual(s.events('A'), ['playerRespawned', 'leaderboardAllPlayers']);
    assert.equal(s.sent[0].data.protection, SPAWN_PROTECTION);
});

test('kills in a row build a streak that the next death ends', () => {
    const s = twoPlayers();
    killB(s);
    respawnB(s);
    killB(s);
    const a = s.room.players.A;
    assert.deepEqual([a.streak, a.bestStreak], [2, 2]);
    assert.equal(s.sent.findLast((e) => e.event === 'playerDead').data.streak, 2);

    // Bob gets Alice: her streak of 2 ends, her best stays.
    respawnB(s);
    s.take();
    for (let i = 0; i < KILL_SHOTS; i++) {
        s.clock.t += FIRE_INTERVAL;
        s.room.shoot('B', { o: { x: 0, y: 0.7, z: -10 }, d: { x: 0, y: -0.07, z: 1 }, target: 'A' });
    }
    const dead = s.sent.find((e) => e.event === 'playerDead');
    assert.deepEqual([dead.data.id, dead.data.streak, dead.data.endedStreak], ['A', 1, 2]);
    assert.deepEqual([a.streak, a.bestStreak], [0, 2]);
});

test('health comes back a little every second once a player has not been hit for a while', () => {
    const s = twoPlayers();
    for (let i = 0; i < 3; i++) shootB(s);
    const healthEvents = () => s.take().filter((e) => e.event === 'health').map((e) => [e.to, e.data.health]);

    s.clock.t += REGEN_DELAY_MS - 1;
    s.room.tick();
    assert.deepEqual(healthEvents(), []);
    s.clock.t += 1;
    s.room.tick();
    assert.deepEqual(healthEvents(), [['B', MAX_HEALTH - 3 * DAMAGE + REGEN_PER_TICK]]);
    s.room.tick();
    s.room.tick();
    assert.equal(s.room.players.B.health, MAX_HEALTH);
    assert.deepEqual(healthEvents(), [['B', MAX_HEALTH]]);

    // A new hit restarts the wait.
    shootB(s);
    s.room.tick();
    assert.deepEqual(healthEvents(), []);
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

// Three players in a finished match.
function finishedMatch() {
    const s = setup();
    for (const id of ['A', 'B', 'C']) s.room.join(id, id);
    s.room.duration = 1;
    s.room.tick();
    s.take();
    return s;
}

const votesSeen = (s, to = 'A') =>
    s.take().filter((e) => e.event === 'rematchVotes' && e.to === to).map((e) => e.data);

test('a rematch starts when everyone wants one, with fresh scores and the full timer', () => {
    const s = finishedMatch();
    s.room.players.A.kills = 4;
    s.room.players.B.isDead = true;
    s.room.rematch('A');
    s.room.rematch('A');
    assert.deepEqual(votesSeen(s), [{ votes: ['A'], startsIn: null }]);
    s.room.rematch('B');
    assert.deepEqual(votesSeen(s), [{ votes: ['A', 'B'], startsIn: REMATCH_WAIT }]);

    s.room.rematch('C');
    const started = s.sent.filter((e) => e.event === 'matchStarted');
    assert.deepEqual(started.map((e) => e.to), ['A', 'B', 'C']);
    const { players, duration } = started[0].data;
    assert.equal(duration, ROOM_DURATIONS[0] * 60);
    assert.deepEqual([players.A.kills, players.B.isDead, players.C.protection], [0, false, SPAWN_PROTECTION]);
    assert.equal(s.room.ended, false);
    // Spread out: nobody spawns on top of anyone else.
    assert.equal(new Set(Object.values(players).map((p) => JSON.stringify(p.position))).size, 3);
});

test('once more than half want a rematch it starts after a countdown, voted or not', () => {
    const s = finishedMatch();
    s.room.rematch('A');
    s.room.rematch('B');
    s.take();
    for (let i = 1; i < REMATCH_WAIT; i++) s.room.tick();
    assert.deepEqual(votesSeen(s).map((v) => v.startsIn), [9, 8, 7, 6, 5, 4, 3, 2, 1].slice(0, REMATCH_WAIT - 1));
    s.room.tick();
    assert.ok(s.events('C').includes('matchStarted'));
    assert.equal(s.room.duration, ROOM_DURATIONS[0] * 60, 'the countdown did not run the match timer');
});

test('the rematch stops waiting for players who leave', () => {
    const s = finishedMatch();
    s.room.rematch('A');
    s.take();
    s.room.leave('C'); // 1 of 2 is not more than half
    assert.deepEqual(votesSeen(s), [{ votes: ['A'], startsIn: null }]);
    s.room.leave('B');
    assert.ok(s.events('A').includes('matchStarted'));
});

test('rematch votes only count after the match, and a finished room expires', () => {
    const s = twoPlayers();
    s.room.rematch('A');
    assert.deepEqual(s.take(), []);

    const over = finishedMatch();
    over.clock.t += GAME_OVER_TTL_MS - 1;
    assert.equal(over.room.expired, false);
    over.clock.t += 1;
    assert.equal(over.room.expired, true);
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

// Switches A to `weapon` and waits until it's drawn.
const arm = (s, weapon) => {
    s.room.switchWeapon('A', { w: weapon });
    s.clock.t += getWeapon(weapon).drawTime;
};

test('each gun does its own damage at its own rate', () => {
    for (const id of ['smg', 'marksman', 'pistol']) {
        const weapon = getWeapon(id);
        const s = twoPlayers();
        arm(s, id);
        s.take();
        s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
        assert.equal(s.room.players.B.health, MAX_HEALTH - weapon.damage, id);
        s.clock.t += weapon.fireInterval - 30; // too soon for this gun
        s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
        assert.equal(s.room.players.B.health, MAX_HEALTH - weapon.damage, `${id}: too soon`);
        s.clock.t += 30;
        s.room.shoot('A', { o: EYE, d: TOWARDS_B_HEAD, target: 'B', head: true });
        assert.equal(s.room.players.B.health, Math.max(0, MAX_HEALTH - weapon.damage - weapon.headDamage), id);
        assert.ok(s.sent.filter((e) => e.event === 'playerShot').every((e) => e.data.w === id));
    }

    // One marksman headshot kills, and the kill names the gun.
    const s = twoPlayers();
    arm(s, 'marksman');
    s.room.shoot('A', { o: EYE, d: TOWARDS_B_HEAD, target: 'B', head: true });
    assert.equal(s.room.players.B.isDead, true);
    assert.equal(s.sent.find((e) => e.event === 'playerDead').data.weapon, 'marksman');
});

test('damage falls off with range for the guns that say so', () => {
    const smg = getWeapon('smg');
    assert.equal(damageAt(smg, 10), smg.damage);
    assert.equal(damageAt(smg, 200), Math.round(smg.damage * smg.falloff[2]));
    assert.ok(damageAt(smg, 30) < smg.damage && damageAt(smg, 30) > damageAt(smg, 200));
    assert.equal(damageAt(getWeapon('marksman'), 200, true), getWeapon('marksman').headDamage);

    // B 40 m away: the SMG does its least damage, the marksman rifle its full.
    for (const [id, expected] of [['smg', damageAt(smg, 40)], ['marksman', getWeapon('marksman').damage]]) {
        const s = twoPlayers();
        s.clock.t += 1100; // past the lag compensation, so B was only ever seen at 40 m
        s.room.move('B', { t: 2, p: [0, 0, -40], yaw: 0, pitch: 0, f: 1 });
        arm(s, id);
        s.room.shoot('A', { o: EYE, d: { x: 0, y: -0.7 / 40, z: -1 }, target: 'B' });
        assert.equal(s.room.players.B.health, MAX_HEALTH - expected, id);
    }
});

test('a new gun fires only once it is drawn, and switching tells the others', () => {
    const s = twoPlayers();
    s.room.switchWeapon('A', { w: 'pistol' });
    assert.deepEqual(s.take().map((e) => [e.to, e.event, e.data]), [['B', 'playerWeapon', { id: 'A', weapon: 'pistol' }]]);
    s.room.switchWeapon('A', { w: 'pistol' }); // already in hand
    s.room.switchWeapon('A', { w: 'bazooka' });
    s.room.switchWeapon('A', null);
    assert.deepEqual(s.take(), []);

    const pistol = getWeapon('pistol');
    s.clock.t += pistol.drawTime - TIMING_SLACK - 1;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
    assert.equal(s.room.players.B.health, MAX_HEALTH, 'still drawing');
    s.clock.t += 1;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
    assert.equal(s.room.players.B.health, MAX_HEALTH - pistol.damage);

    // Everyone learns what you hold: in the player list, and it stays through a respawn.
    assert.equal(s.room.publicPlayers().A.weapon, 'pistol');
    s.room.players.A.isDead = true;
    s.room.respawn('A');
    assert.equal(s.room.players.A.weapon, 'pistol');
});

test('a magazine runs dry, and a reload fills it after the reload time', () => {
    const s = twoPlayers();
    arm(s, 'pistol');
    const pistol = getWeapon('pistol');
    const fire = () => {
        s.clock.t += pistol.fireInterval;
        s.room.shoot('A', { o: EYE, d: { x: 1, y: 0, z: 0 }, target: null });
    };
    const shots = () => s.take().filter((e) => e.event === 'playerShot').length;
    for (let i = 0; i < pistol.magSize + 3; i++) fire();
    assert.equal(shots(), pistol.magSize, 'nothing after the last round');

    s.room.reload('A');
    s.clock.t += pistol.reloadEmptyTime - TIMING_SLACK - pistol.fireInterval - 1;
    fire();
    assert.equal(shots(), 0, 'still reloading');
    s.clock.t += 1;
    fire();
    assert.equal(shots(), 1);
    assert.equal(s.room.players.A.rounds.pistol, pistol.magSize - 1);

    // A part-empty magazine reloads faster. Switching away stops the reload; each gun keeps its own count.
    s.room.reload('A');
    s.room.switchWeapon('A', { w: 'rifle' });
    s.clock.t += 10_000;
    s.room.tick();
    assert.equal(s.room.players.A.rounds.pistol, pistol.magSize - 1);
    assert.equal(s.room.players.A.rounds.rifle, RIFLE.magSize);
    s.room.reload('A'); // full already: nothing to do
    assert.equal(s.room.players.A.reloadAt, 0);

    // Dying refills everything.
    s.room.players.A.isDead = true;
    s.room.respawn('A');
    assert.equal(s.room.players.A.rounds.pistol, pistol.magSize);
});

test('a medkit heals once its use time has passed, once per life, with no shooting meanwhile', () => {
    const s = twoPlayers();
    s.room.players.A.health = 30;
    s.room.heal('A');
    s.room.heal('A'); // already in use
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'B' });
    assert.equal(s.room.players.B.health, MAX_HEALTH, 'no shooting while healing');

    s.clock.t = s.room.players.A.healAt - 1;
    placeA(s);
    assert.equal(s.room.players.A.health, 30);
    s.clock.t += 1;
    s.take();
    placeA(s); // finishes on the next message
    assert.equal(s.room.players.A.health, 30 + MEDKIT.heal);
    assert.deepEqual(s.take().filter((e) => e.to === 'A').map((e) => [e.event, e.data]), [['health', { health: 30 + MEDKIT.heal }]]);
    assert.equal(s.room.players.A.healAt, 0, 'done');

    s.room.players.A.health = 30;
    s.room.heal('A');
    assert.equal(s.room.players.A.healAt, 0, 'none left');

    // A fresh life brings a fresh medkit; full health has no use for it; switching away wastes it.
    s.room.players.A.isDead = true;
    s.room.respawn('A');
    s.room.heal('A');
    assert.equal(s.room.players.A.medkits, MEDKIT.perLife);
    s.room.players.A.health = 50;
    s.room.heal('A');
    s.room.switchWeapon('A', { w: 'smg' });
    s.clock.t += MEDKIT.useTime;
    placeA(s);
    assert.deepEqual([s.room.players.A.health, s.room.players.A.medkits], [50, MEDKIT.perLife - 1]);
});

test('coming back after a dropped connection fills the magazines', () => {
    const s = twoPlayers();
    for (let i = 0; i < 5; i++) shootB(s);
    s.room.reload('A');
    s.room.drop('A');
    s.room.resume('A');
    assert.deepEqual([s.room.players.A.rounds.rifle, s.room.players.A.reloadAt], [RIFLE.magSize, 0]);
});

// --- Team matches ---

const teamsOf = (room) => Object.fromEntries(Object.values(room.players).map((p) => [p.id, p.team]));

test('a room plays the mode it was made with; anything unknown is free-for-all', () => {
    assert.equal(setup({ mode: 'tdm' }).room.mode, 'tdm');
    assert.equal(setup({ mode: 'ctf' }).room.mode, 'ffa');
    const { room, sent } = setup();
    room.join('A', 'Alice');
    assert.equal(sent[0].data.mode, 'ffa');
    assert.equal(room.players.A.team, null);
    assert.equal(room.teamScores, null);
    assert.ok(!sent.some((e) => e.event === 'teamScores'));
});

test('newcomers join the smaller team, then the one behind, and are told the score', () => {
    const s = setup({ mode: 'tdm', playersLimit: 10 });
    s.room.join('A', 'Alice');
    assert.deepEqual(s.events('A'), ['joinedRoom', 'currentPlayers', 'teamScores', 'timerUpdate', 'leaderboardAllPlayers']);
    assert.deepEqual(s.sent.find((e) => e.event === 'teamScores').data, { a: 0, b: 0 });
    for (const id of ['B', 'C', 'D']) s.room.join(id, id);
    assert.deepEqual(teamsOf(s.room), { A: 'a', B: 'b', C: 'a', D: 'b' });
    assert.equal(s.sent.find((e) => e.event === 'currentPlayers' && e.to === 'D').data.C.team, 'a');

    // Level on players, but b is behind on kills.
    s.room.teamScores.a = 3;
    s.room.join('E', 'E');
    assert.equal(s.room.players.E.team, 'b');
    s.room.join('F', 'F');
    assert.equal(s.room.players.F.team, 'a');
});

// A (team a) at the origin, B (team b) 10 m in front, C (team a) beside B. All past their protection.
function teamDuel() {
    const s = setup({ mode: 'tdm' });
    for (const id of ['A', 'B', 'C']) s.room.join(id, id);
    s.clock.t += SPAWN_PROTECTION;
    placeA(s);
    placeB(s);
    s.room.move('C', { t: 1, p: [5, 0, -10], yaw: 0, pitch: 0, f: 1 });
    s.take();
    return s;
}

test('teammates cannot hurt each other; a teammate in the way stops the shot', () => {
    const s = teamDuel();
    s.room.move('C', { t: 2, p: [0, 0, -5], yaw: 0, pitch: 0, f: 1 }); // between A and B
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B, target: 'C' });
    s.clock.t += FIRE_INTERVAL;
    s.room.shoot('A', { o: EYE, d: TOWARDS_B }); // old client: the server finds C first
    assert.equal(s.room.players.C.health, MAX_HEALTH);
    assert.equal(s.room.players.B.health, MAX_HEALTH);
    assert.ok(!s.sent.some((e) => e.event === 'hit' || e.event === 'hitConfirmed'));
});

test('every kill scores for the killer\'s team, and everyone is told', () => {
    const s = teamDuel();
    killB(s);
    const dead = s.sent.find((e) => e.event === 'playerDead');
    assert.equal(dead.data.team, 'b');
    assert.equal(dead.data.shooterTeam, 'a');
    const scores = s.sent.filter((e) => e.event === 'teamScores');
    assert.deepEqual(scores.map((e) => e.to), ['A', 'B', 'C']);
    assert.deepEqual(scores[0].data, { a: 1, b: 0 });
});

test('respawns in a team match keep away from the other team, not from teammates', () => {
    const s = teamDuel();
    // B's teammate D stands on the spawn point farthest from team a (A and C, both at the origin), where B
    // should still come back.
    const [first] = farthestFrom(s.room.players.A.position);
    s.room.move('C', { t: 2, p: [0, 0, 0], yaw: 0, pitch: 0, f: 1 });
    s.room.join('D', 'D');
    assert.equal(s.room.players.D.team, 'b');
    s.room.move('D', { t: 1, p: [first.x, first.y, first.z], yaw: 0, pitch: 0, f: 1 });
    killB(s);
    s.room.respawn('B');
    assert.deepEqual(s.room.players.B.position, first);
});

test('lopsided teams are evened out as players respawn and at a rematch', () => {
    const s = setup({ mode: 'tdm' });
    for (const id of ['A', 'B', 'C', 'D', 'E']) s.room.join(id, id);
    s.room.leave('B');
    s.room.leave('D');
    assert.deepEqual(teamsOf(s.room), { A: 'a', C: 'a', E: 'a' });

    s.room.players.C.isDead = true;
    s.room.respawn('C');
    assert.equal(s.room.players.C.team, 'b');
    const back = s.sent.findLast((e) => e.event === 'playerRespawned');
    assert.equal(back.data.team, 'b');
    s.room.players.E.isDead = true;
    s.room.respawn('E'); // two against one is close enough
    assert.equal(s.room.players.E.team, 'a');

    // Three on one team after a leave: the rematch moves the latest joiner over and zeroes the score.
    s.room.join('F', 'F'); // b
    s.room.leave('C');
    s.room.teamScores.a = 7;
    assert.deepEqual(teamsOf(s.room), { A: 'a', E: 'a', F: 'b' });
    s.room.leave('F');
    s.room.duration = 1;
    s.room.tick();
    s.take();
    s.room.rematch('A');
    s.room.rematch('E');
    assert.deepEqual(teamsOf(s.room), { A: 'a', E: 'b' });
    const started = s.sent.find((e) => e.event === 'matchStarted');
    assert.deepEqual(started.data.teamScores, { a: 0, b: 0 });
    assert.equal(started.data.players.E.team, 'b');
});
