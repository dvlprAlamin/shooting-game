import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { attachSocketIO } from '../src/socketio.js';

// Just enough of Socket.IO for the adapter: connections, per-socket handlers and emits.
function fakeIO() {
    const received = [];
    let onConnection;
    const io = { on: (event, cb) => { if (event === 'connection') onConnection = cb; } };
    const connect = (id) => {
        const handlers = {};
        const record = (volatile) => (event, data) => received.push({ to: id, event, data, volatile });
        const socket = {
            id,
            data: {},
            on: (event, fn) => { handlers[event] = fn; },
            emit: record(false),
            volatile: { emit: record(true) },
            client: (event, data) => handlers[event]?.(data),
        };
        onConnection(socket);
        return socket;
    };
    const notifications = (id) => received.filter((e) => e.to === id && e.event === 'notification').map((e) => e.data.message);
    return { io, connect, received, notifications };
}

// Fake setInterval so the room timer can be driven by hand.
let timers;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
beforeEach(() => {
    timers = new Map();
    let next = 1;
    globalThis.setInterval = (fn) => { timers.set(next, fn); return next++; };
    globalThis.clearInterval = (id) => { timers.delete(id); };
});
afterEach(() => {
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
});
const tick = () => [...timers.values()].forEach((fn) => fn());

const quiet = (fn) => {
    const log = console.log;
    console.log = () => {};
    try { return fn(); } finally { console.log = log; }
};

test('joinRoom checks the room id, existing membership and that the room exists', () => quiet(() => {
    const f = fakeIO();
    const { rooms } = attachSocketIO(f.io);
    const a = f.connect('A');
    a.client('joinRoom', null);
    a.client('joinRoom', undefined);
    a.client('joinRoom', { roomId: '   ' });
    a.client('joinRoom', { roomId: 'r1', playerName: 'Alice' });
    assert.deepEqual(f.notifications('A'), ['Invalid room id!', 'Invalid room id!', 'Invalid room id!', 'Room not exist!']);
    assert.equal(rooms.size, 0);

    a.client('joinRoom', { roomId: ' r1 ', playerName: 'Alice', isCreate: true, duration: '10', playersLimit: '10' });
    assert.equal(a.data.roomId, 'r1');
    assert.equal(rooms.get('r1').room.duration, 600);
    a.client('joinRoom', { roomId: 'r2', playerName: 'Alice', isCreate: true });
    assert.equal(f.notifications('A').at(-1), 'Already in a room!');
    assert.equal(rooms.size, 1);
}));

test('game messages reach the room the socket joined', () => quiet(() => {
    const f = fakeIO();
    attachSocketIO(f.io);
    const a = f.connect('A');
    const b = f.connect('B');
    a.client('joinRoom', { roomId: 'r1', playerName: 'Alice', isCreate: true });
    b.client('joinRoom', { roomId: 'r1', playerName: 'Bob' });
    f.received.length = 0;

    a.client('move', { t: 1, p: [0, 0, 0] });
    assert.deepEqual(f.received.map((e) => [e.to, e.event, e.volatile]), [['B', 'playerMoved', true]]);

    // Sockets outside any room are ignored.
    const c = f.connect('C');
    f.received.length = 0;
    c.client('move', { t: 1, p: [0, 0, 0] });
    c.client('shoot', { o: { x: 0, y: 0, z: 0 }, d: { x: 1, y: 0, z: 0 } });
    c.client('respawn');
    assert.deepEqual(f.received, []);
}));

test('the timer ticks once a second and stops when the match ends', () => quiet(() => {
    const f = fakeIO();
    const { rooms } = attachSocketIO(f.io);
    const a = f.connect('A');
    a.client('joinRoom', { roomId: 'r1', playerName: 'Alice', isCreate: true });
    const room = rooms.get('r1').room;
    room.duration = 2;
    tick();
    tick();
    assert.equal(room.ended, true);
    assert.equal(timers.size, 0);
    assert.ok(f.received.some((e) => e.event === 'gameOver' && e.data === undefined));
}));

test('the room is removed and its timer stopped when the last player disconnects', () => quiet(() => {
    const f = fakeIO();
    const { rooms } = attachSocketIO(f.io);
    const a = f.connect('A');
    const b = f.connect('B');
    a.client('joinRoom', { roomId: 'r1', playerName: 'Alice', isCreate: true });
    b.client('joinRoom', { roomId: 'r1', playerName: 'Bob' });

    a.client('disconnect');
    assert.equal(rooms.size, 1);
    assert.ok(f.received.some((e) => e.to === 'B' && e.event === 'playerDisconnected' && e.data === 'A'));
    b.client('disconnect');
    assert.equal(rooms.size, 0);
    assert.equal(timers.size, 0);
}));
