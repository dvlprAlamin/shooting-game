import { DurableObject } from 'cloudflare:workers';
import { RoomHost } from './game/RoomHost.js';
import { lobbyOf } from './lobbyOf.js';
import { saveResults } from './profiles.js';

/**
 * One game room. It uses plain (not hibernating) WebSockets, so the room stays in memory while
 * anyone is connected and all state lives in the RoomHost. It's billed for the time players are
 * connected, which during a match is all the time anyway.
 *
 * A quick-play room reports to the Lobby; players' results go to their profiles in D1 (if the
 * DB binding is set up).
 */
export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.roomId = null; // from the first request's URL (/rooms/<roomId>)
        this.host = new RoomHost({
            onReport: (state) => this.report(state),
            onResults: (results) => this.save(results),
        });
    }

    report(state) {
        if (!this.roomId || !this.env.LOBBY) return;
        lobbyOf(this.env)
            .report(this.roomId, state)
            .catch((e) => console.error('lobby report failed', e));
    }

    save(results) {
        if (!this.env.DB) return;
        this.ctx.waitUntil(saveResults(this.env.DB, results).catch((e) => console.error('saving results failed', e)));
    }

    async fetch(request) {
        this.roomId ??= decodeURIComponent(new URL(request.url).pathname.split('/').pop());
        const { 0: client, 1: server } = new WebSocketPair();
        server.accept();
        const conn = this.host.connect({
            send: (text) => server.send(text),
            close: (code, reason) => server.close(code, reason),
        });
        server.addEventListener('message', (event) => this.host.message(conn, event.data));
        server.addEventListener('close', () => {
            this.host.closed(conn);
            try {
                server.close(1000, 'Closed'); // complete the closing handshake
            } catch {
                // Already closed.
            }
        });
        server.addEventListener('error', () => this.host.closed(conn));
        return new Response(null, { status: 101, webSocket: client });
    }
}
