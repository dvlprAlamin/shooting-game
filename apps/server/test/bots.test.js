import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../src/game/GameRoom.js';
import { UPDATE_MS } from '../src/game/bots/BotDirector.js';
import { buildNav, findPath } from '../src/game/bots/nav.js';
import { firstWallHit, wallBetween } from '../src/game/walls.js';
import { getMap } from '@shooter/shared/maps';

// A room with bots, a fake clock and a seeded random, logging what it sends.
function setup(options = {}) {
    const clock = { t: 1_000_000 };
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sent = [];
    const room = new GameRoom({
        map: 'outpost',
        bots: 4,
        playersLimit: 10,
        now: () => clock.t,
        random,
        send: (to, event, data) => sent.push({ to, event, data }),
        ...options,
    });
    // Plays `ms` of the match: bots every UPDATE_MS, the room timer every second.
    const play = (ms) => {
        for (let t = 0; t < ms; t += UPDATE_MS) {
            clock.t += UPDATE_MS;
            room.updateBots();
            if (clock.t % 1000 < UPDATE_MS) room.tick();
        }
    };
    return { room, clock, sent, play };
}

const bots = (room) => Object.values(room.players).filter((p) => p.bot);

test('the nav grid covers the floor and the platform, linked by the ramps; maps without boxes have none', () => {
    const nav = buildNav(getMap('outpost'));
    const ground = nav.at(14, 14, 0);
    const platform = nav.at(0, 2, 2);
    assert.equal(nav.nodes[ground].y, 0);
    assert.equal(nav.nodes[platform].y, 2);
    const path = findPath(nav, ground, platform);
    assert.ok(path?.length > 10);
    // Every step of the way is clear of walls at knee height, and climbs no more than a step.
    let prev = nav.nodes[ground];
    for (const n of path) {
        const p = nav.nodes[n];
        assert.ok(Math.abs(p.y - prev.y) <= 0.6);
        assert.equal(wallBetween(getMap('outpost'), { ...prev, y: prev.y + 0.7 }, { ...p, y: p.y + 0.7 }), false);
        prev = p;
    }
    assert.equal(buildNav(getMap('canyon')), null);
});

test('bots fill the match up to the target and make way for people', () => {
    const { room, sent } = setup({ playersLimit: 5 });
    room.join('A', 'Alice');
    assert.equal(Object.keys(room.players).length, 4);
    assert.equal(bots(room).length, 3);
    assert.ok(sent.some((e) => e.event === 'newPlayer' && e.to === 'A' && e.data.bot === true));
    assert.equal(new Set(Object.values(room.players).map((p) => p.playerName)).size, 4, 'names are unique');

    room.join('B', 'Bob');
    assert.equal(bots(room).length, 2);
    for (const id of ['C', 'D']) room.join(id, id);
    assert.equal(bots(room).length, 0);
    assert.equal(room.join('E', 'E'), null, 'over the target but under the limit');
    assert.equal(room.join('F', 'F'), 'That room is full.');

    // People leave: bots come back.
    for (const id of ['B', 'C', 'D', 'E']) room.leave(id);
    assert.equal(bots(room).length, 3);
});

test('a bot makes way when a person joins a full room', () => {
    const { room } = setup({ bots: 5, playersLimit: 5 });
    room.join('A', 'Alice');
    assert.equal(Object.keys(room.players).length, 5);
    assert.equal(room.join('B', 'Bob'), null);
    assert.equal(bots(room).length, 3);
});

test('bots walk the map, fight by the same rules, and respawn', () => {
    const { room, sent, play } = setup();
    room.join('A', 'Alice');
    const start = Object.fromEntries(bots(room).map((b) => [b.id, { ...b.position }]));
    play(60_000);
    const moved = bots(room).filter((b) => Math.hypot(b.position.x - start[b.id].x, b.position.z - start[b.id].z) > 3);
    assert.ok(moved.length >= 3, 'bots get around');
    for (const b of bots(room)) {
        assert.ok(firstWallHit(room.map, b.position, { x: 0, y: 1, z: 0 }, 1e-4) > 0, `${b.playerName} is not inside a box`);
    }
    const kills = Object.values(room.players).reduce((n, p) => n + p.kills, 0);
    assert.ok(kills >= 3, `they fight (${kills} kills)`);
    assert.ok(sent.some((e) => e.event === 'playerRespawned' && e.data.bot), 'dead bots come back');
    assert.ok(sent.some((e) => e.event === 'playerMoved' && e.to === 'A' && e.data.id.startsWith('bot-')));
});

test('bots leave people alone until their game has loaded (their first move)', () => {
    const { room, play } = setup({ map: 'outpost', bots: 6 });
    room.join('A', 'Alice');
    room.players.A.protectedUntil = 0;
    play(40_000);
    assert.equal(room.players.A.deaths, 0);
    assert.equal(room.players.A.health, 100);

    const { position } = room.players.A;
    room.move('A', { t: 1, p: [position.x, position.y, position.z], yaw: 0, pitch: 0, f: 1 });
    for (let i = 0; i < 1200 && !room.players.A.deaths; i++) {
        play(UPDATE_MS);
        room.move('A', { t: 2 + i, p: [position.x, position.y, position.z], yaw: 0, pitch: 0, f: 1 });
    }
    assert.ok(room.players.A.deaths > 0, 'once in the game, they are fair game');
});

test('bots do not shoot teammates', () => {
    const { room, play } = setup({ mode: 'tdm' });
    room.join('A', 'Alice');
    const shots = [];
    const shoot = room.shoot.bind(room);
    room.shoot = (id, data) => {
        if (room.players[id]?.bot && typeof data.target === 'string') shots.push([id, data.target]);
        shoot(id, data);
    };
    play(30_000);
    assert.ok(shots.length > 0);
    for (const [from, to] of shots) assert.notEqual(room.players[from]?.team, room.players[to]?.team ?? 'gone');
});

test('bots do not vote, and a room with only bots left is empty', () => {
    const { room } = setup();
    room.join('A', 'Alice');
    room.join('B', 'Bob');
    room.duration = 1;
    room.tick();
    for (const b of bots(room)) room.rematch(b.id);
    assert.equal(room.votes.size, 0);
    room.rematch('A');
    room.rematch('B');
    assert.equal(room.ended, false, 'both people wanted it');

    room.leave('A');
    room.leave('B');
    assert.equal(room.isEmpty, true);
    assert.equal(room.humans, 0);
});

test('no bots on a map they cannot walk', () => {
    const { room } = setup({ map: 'canyon' });
    room.join('A', 'Alice');
    assert.equal(bots(room).length, 0);
});
