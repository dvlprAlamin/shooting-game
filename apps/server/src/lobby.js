import { DurableObject } from 'cloudflare:workers';
import { Matchmaker } from './Matchmaker.js';

/**
 * Quick play's matchmaker: one of these for the whole game (named 'lobby', see lobbyOf.js). Public rooms report to it over RPC
 * and /quickplay asks it for a room. Its list lives in memory only: the rooms' regular reports keep it alive
 * while any public room is open, and rebuild the list within seconds if it ever restarts.
 */
export class Lobby extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.matchmaker = new Matchmaker();
    }

    /** A public room's state, or null when it has closed. */
    report(roomId, state) {
        this.matchmaker.report(roomId, state);
    }

    /** The id of the room to send a quick-play player to. */
    quickPlay() {
        return this.matchmaker.pick();
    }
}
