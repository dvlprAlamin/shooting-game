import { GameRoom } from './GameRoom.js';

// Close codes the client acts on (4000-4999 are free for applications). After any of these the
// client doesn't try to reconnect.
export const CLOSE = {
    JOIN_FAILED: 4000, // a notification said why (room full, doesn't exist, ...)
    LIMIT: 4001, // too many or too large messages
    JOIN_TIMEOUT: 4002, // connected but never asked to join
    REPLACED: 4003, // the same player connected again on another connection
};

const JOIN_TIMEOUT_MS = 10_000;
const MAX_MESSAGE_LENGTH = 4096;
// A normal client sends 20 moves plus up to 10 shots a second.
const MAX_MESSAGES_PER_SECOND = 60;
const MAX_KEY_LENGTH = 64;
const GAME_EVENTS = new Set(['move', 'shoot', 'respawn']);

const randomId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

/**
 * Hosts one room for WebSocket clients. Messages are JSON text frames: {"e": event, "d": data}.
 *
 * GameRoom has the rules; this class has everything about connections: creating the room on the
 * first join, reconnecting with the client's key, the once-a-second timer, and per-connection
 * limits. A Durable Object holds one RoomHost; tests drive it with fake sockets.
 *
 * A socket is anything with send(text) and close(code, reason). Call connect(socket) when it
 * opens, message(conn, text) for each frame, and closed(conn) when it closes.
 */
export class RoomHost {
    /**
     * @param {object} [options]
     * @param {() => number} [options.now]
     * @param {{ setTimeout, clearTimeout, setInterval, clearInterval }} [options.timers]
     * @param {() => string} [options.newId] player id generator
     */
    constructor({ now = Date.now, timers = globalThis, newId = randomId } = {}) {
        this.now = now;
        this.timers = timers;
        this.newId = newId;
        this.game = null; // GameRoom while the room exists
        this.interval = null;
        this.connections = new Map(); // player id -> its current connection
    }

    connect(socket) {
        const conn = { socket, playerId: null, closed: false, windowStart: this.now(), count: 0 };
        conn.joinTimer = this.timers.setTimeout(() => {
            if (!conn.playerId) this.close(conn, CLOSE.JOIN_TIMEOUT, 'Join timeout');
        }, JOIN_TIMEOUT_MS);
        return conn;
    }

    message(conn, text) {
        if (conn.closed) return;
        if (typeof text !== 'string' || text.length > MAX_MESSAGE_LENGTH) {
            return this.close(conn, CLOSE.LIMIT, 'Message too large');
        }
        const now = this.now();
        if (now - conn.windowStart >= 1000) {
            conn.windowStart = now;
            conn.count = 0;
        }
        if (++conn.count > MAX_MESSAGES_PER_SECOND) return this.close(conn, CLOSE.LIMIT, 'Too many messages');

        let msg;
        try {
            msg = JSON.parse(text);
        } catch {
            return;
        }
        if (msg?.e === 'joinRoom') this.join(conn, msg.d);
        else if (conn.playerId && GAME_EVENTS.has(msg?.e)) this.game?.[msg.e](conn.playerId, msg.d);
    }

    /** The socket closed (the client left, or the network dropped). */
    closed(conn) {
        if (conn.closed) return;
        conn.closed = true;
        this.release(conn);
    }

    join(conn, data) {
        if (conn.playerId) return this.notify(conn, 'Already in a room!');
        const { playerName, isCreate, duration, playersLimit, playerKey } = data || {};
        const key = typeof playerKey === 'string' && playerKey.length <= MAX_KEY_LENGTH ? playerKey : null;

        if (!this.game) {
            if (!isCreate) return this.reject(conn, 'No room has that code. Check it with whoever made the room.');
            this.game = new GameRoom({
                duration,
                playersLimit,
                now: this.now,
                send: (id, event, payload) => this.send(id, event, payload),
            });
            this.interval = this.timers.setInterval(() => this.tick(), 1000);
        }

        // Same key as a player already here: it's them coming back.
        const existing = this.game.playerIdForKey(key);
        if (existing) {
            const previous = this.connections.get(existing);
            this.bind(conn, existing);
            if (previous) this.close(previous, CLOSE.REPLACED, 'Connected again elsewhere');
            this.game.resume(existing);
            return;
        }

        let id;
        do id = this.newId();
        while (this.game.players[id]);
        this.bind(conn, id); // before join(), which already sends to the new player
        const error = this.game.join(id, playerName, key);
        if (error) {
            this.connections.delete(id);
            conn.playerId = null;
            this.reject(conn, error);
        }
    }

    tick() {
        this.game.tick();
        this.cleanup();
    }

    send(id, event, data) {
        const conn = this.connections.get(id);
        if (conn && !conn.closed) this.write(conn, event, data);
    }

    write(conn, event, data) {
        try {
            conn.socket.send(JSON.stringify(data === undefined ? { e: event } : { e: event, d: data }));
        } catch {
            // The socket is already closing; its close event cleans up.
        }
    }

    notify(conn, message) {
        this.write(conn, 'notification', { message });
    }

    reject(conn, message) {
        this.notify(conn, message);
        this.close(conn, CLOSE.JOIN_FAILED, message);
    }

    bind(conn, id) {
        conn.playerId = id;
        this.timers.clearTimeout(conn.joinTimer);
        this.connections.set(id, conn);
    }

    close(conn, code, reason) {
        if (conn.closed) return;
        conn.closed = true;
        try {
            conn.socket.close(code, reason);
        } catch {
            // Already closed.
        }
        this.release(conn);
    }

    release(conn) {
        this.timers.clearTimeout(conn.joinTimer);
        const id = conn.playerId;
        // A connection replaced by a newer one for the same player no longer speaks for them.
        if (id && this.connections.get(id) === conn) {
            this.connections.delete(id);
            this.game?.drop(id);
        }
        this.cleanup();
    }

    // The room ends when the last player has left (dropped players count until their grace runs out).
    cleanup() {
        if (!this.game?.isEmpty) return;
        this.timers.clearInterval(this.interval);
        this.interval = null;
        this.game = null;
    }
}
