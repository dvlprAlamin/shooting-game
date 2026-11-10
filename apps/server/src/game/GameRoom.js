import {
    DAMAGE,
    FIRE_INTERVAL,
    MAX_HEALTH,
    MAX_SHOT_DISTANCE,
    PLAYER_LIMITS,
    ROOM_DURATIONS,
} from '@shooter/shared';
import { findTarget, validateHit } from './hits.js';
import { randomSpawn } from './spawns.js';

const MIN_FIRE_INTERVAL = FIRE_INTERVAL - 20; // allow some jitter
const HISTORY_MS = 1000;
const MAX_NAME_LENGTH = 24;
// How long a player whose connection dropped is kept in the room, waiting for them to come back.
export const RECONNECT_GRACE_MS = 10_000;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isVec3 = (v) => v && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z);
// One of the offered options, or the default (first) one.
const option = (options, value) => (options.includes(Number(value)) ? Number(value) : options[0]);

// The public view of a player (what other clients receive).
const publicPlayer = (p) => ({
    id: p.id,
    playerName: p.playerName,
    position: p.position,
    rotation: p.rotation,
    health: p.health,
    deaths: p.deaths,
    kills: p.kills,
    isDead: p.isDead,
});

const pushHistory = (player, now) => {
    player.history.push({ t: now, x: player.position.x, y: player.position.y, z: player.position.z });
    while (player.history.length && now - player.history[0].t > HISTORY_MS) player.history.shift();
};

/**
 * One match: its players, scores, timer and rules.
 *
 * It knows nothing about sockets. A transport passes client messages in (join, move, shoot,
 * respawn, leave), calls tick() once a second, and delivers whatever the room hands to `send`.
 * That keeps the rules apart from the transport (RoomHost.js) and testable without one.
 *
 * Reconnecting: a transport that can tell a dropped connection from a deliberate leave calls
 * drop() instead of leave(). The player stays in the match for RECONNECT_GRACE_MS; joining again
 * with the same key (playerIdForKey + resume) gives them their player back, score and all.
 */
export class GameRoom {
    /**
     * @param {object} options
     * @param {(playerId: string, event: string, data?: unknown, volatile?: boolean) => void} options.send
     *   Delivers one event to one player. `volatile` events may be dropped under load.
     * @param {number|string} [options.duration] match length in minutes, one of ROOM_DURATIONS
     * @param {number|string} [options.playersLimit] one of PLAYER_LIMITS
     * @param {() => number} [options.now] clock in ms
     * @param {() => number} [options.random] random number in [0, 1)
     */
    constructor({ send, duration, playersLimit, now = Date.now, random = Math.random }) {
        this.send = send;
        this.now = now;
        this.random = random;
        this.players = {};
        this.playersLimit = option(PLAYER_LIMITS, playersLimit);
        this.duration = option(ROOM_DURATIONS, duration) * 60; // seconds left
        this.ended = false;
    }

    get isEmpty() {
        return Object.keys(this.players).length === 0;
    }

    /**
     * Adds a player. `key` is the client's secret reconnect key (never sent to anyone else).
     * Returns an error message for the client, or null on success.
     */
    join(id, playerName, key = null) {
        if (this.players[id]) return 'Already in a room!';
        if (this.ended) return 'That match is already over.';
        if (this.playersLimit <= Object.keys(this.players).length) return 'That room is full.';

        this.send(id, 'joinedRoom', { message: 'Joined Room Successful!', id });
        const player = {
            id,
            playerName: String(playerName || '').trim().slice(0, MAX_NAME_LENGTH) || 'Player',
            position: randomSpawn(this.random),
            rotation: { x: 0, y: 0, z: 0 },
            health: MAX_HEALTH,
            deaths: 0,
            kills: 0,
            isDead: false,
            lastShotAt: 0,
            history: [],
            key,
            droppedAt: null,
        };
        this.players[id] = player;
        pushHistory(player, this.now());

        // The newcomer gets the room as it is, everyone else gets the newcomer.
        this.send(id, 'currentPlayers', this.publicPlayers());
        if (this.duration > 0) this.send(id, 'timerUpdate', this.duration);
        this.broadcast('newPlayer', publicPlayer(player), id);
        this.broadcastLeaderboard();
        return null;
    }

    /** The player who joined with this reconnect key, if they're still in the room. */
    playerIdForKey(key) {
        if (!key) return null;
        for (const id in this.players) if (this.players[id].key === key) return id;
        return null;
    }

    /** The player's connection dropped: keep them for RECONNECT_GRACE_MS in case they come back. */
    drop(id) {
        const player = this.players[id];
        if (player) player.droppedAt = this.now();
    }

    /** The player is back on a new connection: send them the room as it is now. */
    resume(id) {
        const player = this.players[id];
        if (!player) return;
        player.droppedAt = null;
        this.send(id, 'joinedRoom', { message: 'Joined Room Successful!', id });
        this.send(id, 'currentPlayers', this.publicPlayers());
        if (this.duration > 0) this.send(id, 'timerUpdate', this.duration);
        this.send(id, 'leaderboardAllPlayers', this.publicPlayers());
        if (this.ended) this.send(id, 'gameOver');
    }

    leave(id) {
        if (!this.players[id]) return;
        delete this.players[id];
        this.broadcast('playerDisconnected', id);
        this.broadcastLeaderboard();
    }

    // Movement: { t, p: [x, y, z], yaw, pitch, f }
    // `t` is the sender's clock; receivers use it to interpolate without jitter.
    move(id, data) {
        const player = this.players[id];
        if (!player || !data || !Array.isArray(data.p)) return;
        const [x, y, z] = data.p;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return;
        const yaw = isFiniteNumber(data.yaw) ? data.yaw : 0;
        const pitch = isFiniteNumber(data.pitch) ? data.pitch : 0;

        if (!player.isDead) {
            player.position = { x, y, z };
            player.rotation = { x: pitch, y: yaw, z: 0 };
            pushHistory(player, this.now());
        }

        // Volatile: a late movement packet is useless, so it's better to drop it than to queue it up.
        this.broadcast(
            'playerMoved',
            { id, t: isFiniteNumber(data.t) ? data.t : 0, p: [x, y, z], yaw, pitch, f: data.f | 0 },
            id,
            true
        );
    }

    // Shot: { o: origin, d: direction, target?: playerId | null, dist?: number }
    shoot(id, data) {
        const shooter = this.players[id];
        if (!shooter || shooter.isDead || this.ended || !data) return;
        if (!isVec3(data.o) || !isVec3(data.d)) return;

        const now = this.now();
        if (now - shooter.lastShotAt < MIN_FIRE_INTERVAL) return;
        shooter.lastShotAt = now;

        const len = Math.hypot(data.d.x, data.d.y, data.d.z);
        if (len < 1e-6) return;
        const direction = { x: data.d.x / len, y: data.d.y / len, z: data.d.z / len };

        // Let everyone else hear/see the shot.
        this.broadcast('playerShot', { id, o: data.o, d: direction }, id);

        // The client names who it hit (null for a miss); the server checks the claim.
        // Older clients send no target at all, so the server looks for one itself.
        let target = null;
        if (typeof data.target === 'string') {
            const candidate = this.players[data.target];
            if (candidate && !candidate.isDead && candidate.id !== id &&
                validateHit(data.o, direction, candidate, now)) {
                target = candidate;
            }
        } else if (data.target === undefined) {
            target = findTarget(this.players, id, data.o, direction,
                isFiniteNumber(data.dist) ? data.dist : MAX_SHOT_DISTANCE);
        }
        if (!target) return;

        target.health = Math.max(0, target.health - DAMAGE);
        this.send(target.id, 'hit', { health: target.health, from: data.o, shooter: id });
        this.send(id, 'hitConfirmed', { id: target.id, health: target.health });

        if (target.health <= 0) {
            target.isDead = true;
            shooter.kills += 1;
            this.broadcast('playerDead', {
                id: target.id,
                shooter: id,
                playerName: target.playerName,
                shooterName: shooter.playerName,
            });
            this.broadcast('playerKilled', { id, kills: shooter.kills });
            this.broadcastLeaderboard();
        }
    }

    respawn(id) {
        const player = this.players[id];
        if (!player || !player.isDead || this.ended) return;
        player.position = randomSpawn(this.random);
        player.health = MAX_HEALTH;
        player.deaths += 1;
        player.isDead = false;
        player.history = [];

        this.broadcast('playerRespawned', { ...publicPlayer(player), rotation: { x: 0, y: 0, z: 0 } });
        this.broadcastLeaderboard();
    }

    /** Call once a second: removes players who didn't come back in time, counts the match down. */
    tick() {
        const now = this.now();
        for (const id in this.players) {
            const { droppedAt } = this.players[id];
            if (droppedAt !== null && now - droppedAt >= RECONNECT_GRACE_MS) this.leave(id);
        }
        if (this.ended) return;
        this.duration -= 1;
        this.broadcast('timerUpdate', this.duration);
        if (this.duration <= 0) {
            this.ended = true;
            this.broadcast('gameOver');
        }
    }

    publicPlayers() {
        const out = {};
        for (const id in this.players) out[id] = publicPlayer(this.players[id]);
        return out;
    }

    broadcast(event, data, exceptId = null, volatile = false) {
        for (const id in this.players) {
            if (id !== exceptId) this.send(id, event, data, volatile);
        }
    }

    broadcastLeaderboard() {
        this.broadcast('leaderboardAllPlayers', this.publicPlayers());
    }
}
