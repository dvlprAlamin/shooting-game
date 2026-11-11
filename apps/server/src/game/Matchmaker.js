import { QUICK_PLAY } from '@shooter/shared';

// Quick play never sends anyone into a match with less time left than this (s).
export const MIN_TIME_LEFT = 90;
// A slot handed out stays taken until the room reports a new player, or for this long (ms) if nobody comes, so
// players asking at the same moment don't all get the last slot.
export const RESERVATION_MS = 10_000;
// Rooms report at least this often while open (RoomHost.REPORT_EVERY); one silent for longer has gone (ms).
export const STALE_MS = 40_000;
// A room handed out but never opened is forgotten after this long (ms).
const PENDING_MS = 20_000;
const MAX_ROOMS = 1000;

const randomId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);

/**
 * Quick play's list of public rooms, and the choice of one to send a player to. The Lobby Durable Object holds
 * one; public rooms report to it (RoomHost's onReport) whenever their player count or state changes.
 *
 * pick() fills the fullest room that has a free slot and time left, so players meet instead of spreading thin.
 * With none, it names a new room, which the first player to join creates with QUICK_PLAY settings.
 */
export class Matchmaker {
    constructor({ now = Date.now, newId = randomId } = {}) {
        this.now = now;
        this.newId = newId;
        this.rooms = new Map(); // room id -> { players, limit, ended, secondsLeft, at, pending, reserved: [times] }
    }

    /** A public room's state: { players, limit, ended, secondsLeft }, or null when it has closed. */
    report(roomId, state) {
        if (!state) {
            this.rooms.delete(roomId);
            return;
        }
        const now = this.now();
        const known = this.rooms.get(roomId);
        // Each new player in the count fills the oldest slot handed out.
        const joined = Math.max(0, (state.players | 0) - (known?.players ?? 0));
        const reserved = (known?.reserved ?? []).slice(joined);
        this.rooms.set(roomId, {
            players: state.players | 0,
            limit: state.limit | 0,
            ended: !!state.ended,
            secondsLeft: state.secondsLeft | 0,
            at: now,
            pending: false,
            reserved,
        });
    }

    /** The room to send a quick-play player to. */
    pick() {
        const now = this.now();
        let best = null;
        let bestId = null;
        for (const [id, room] of this.rooms) {
            if (now - room.at > (room.pending ? PENDING_MS : STALE_MS)) {
                this.rooms.delete(id);
                continue;
            }
            room.reserved = room.reserved.filter((t) => now - t < RESERVATION_MS);
            const taken = room.players + room.reserved.length;
            if (room.ended || room.secondsLeft < MIN_TIME_LEFT || taken >= room.limit) continue;
            const bestTaken = best && best.players + best.reserved.length;
            if (!best || taken > bestTaken || (taken === bestTaken && room.secondsLeft > best.secondsLeft)) {
                best = room;
                bestId = id;
            }
        }
        if (!best) {
            if (this.rooms.size >= MAX_ROOMS) this.rooms.delete(this.rooms.keys().next().value);
            do bestId = this.newId();
            while (this.rooms.has(bestId));
            best = {
                players: 0,
                limit: QUICK_PLAY.playersLimit,
                ended: false,
                secondsLeft: QUICK_PLAY.duration * 60,
                at: now,
                pending: true,
                reserved: [],
            };
            this.rooms.set(bestId, best);
        }
        best.reserved.push(now);
        return bestId;
    }
}
