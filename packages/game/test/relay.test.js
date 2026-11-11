import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE, RoomHost } from '../src/RoomHost.js';
import { serveRelay } from '../src/relay.js';

// A room behind a relay channel, on hand-driven timers; `sent` is everything the room put on the channel.
function setup() {
    const timers = { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
    let ids = 0;
    const host = new RoomHost({ timers, newId: () => `p${++ids}` });
    const sent = [];
    const receive = serveRelay(host, { send: (text) => sent.push(text) });
    const say = (id, e, d) => receive(`m${id}:${JSON.stringify({ e, d })}`);
    // Messages the room sent one relay id, decoded.
    const to = (id) =>
        sent.filter((f) => f.startsWith(`s${id}:`)).map((f) => JSON.parse(f.slice(f.indexOf(':') + 1)));
    return { host, sent, receive, say, to };
}

test('players come and go through the channel under the relay\'s ids', () => {
    const { host, receive, say, to } = setup();
    receive('o1');
    say(1, 'joinRoom', { roomId: 'lan', playerName: 'Host', isCreate: true, playerKey: 'k1' });
    receive('o7');
    say(7, 'joinRoom', { roomId: 'lan', playerName: 'Guest', playerKey: 'k7' });
    assert.equal(to(1)[0].e, 'joinedRoom');
    assert.equal(to(7)[0].d.id, 'p2');
    assert.ok(to(1).some((m) => m.e === 'newPlayer' && m.d.playerName === 'Guest'));

    receive('c7');
    assert.notEqual(host.game.players.p2.droppedAt, null, 'held for a reconnect, like any dropped player');
    receive('m7:{"e":"respawn"}'); // after its close: ignored
    receive('c7'); // twice: ignored
});

test('messages may contain colons; frames for unknown ids or of unknown kinds are ignored', () => {
    const { host, receive, say, to } = setup();
    receive('m3:{"e":"joinRoom"}');
    receive('?1');
    receive('o1');
    say(1, 'joinRoom', { roomId: 'lan', playerName: 'A:B:C', isCreate: true });
    assert.equal(host.game.players.p1.playerName, 'A:B:C');
    assert.equal(to(1)[0].e, 'joinedRoom');
});

test('the room closes a player\'s connection through the channel', () => {
    const { receive, say, sent } = setup();
    receive('o1');
    say(1, 'joinRoom', { roomId: 'lan', playerName: 'Lost' }); // no room yet, and not creating one
    assert.equal(sent.at(-1), `x1:${CLOSE.JOIN_FAILED}:No room has that code. Check it with whoever made the room.`);
});
