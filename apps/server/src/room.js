import { DurableObject } from 'cloudflare:workers';
import { RoomHost } from '../../src/RoomHost.js';

/**
 * One game room. It uses plain (not hibernating) WebSockets, so the room stays in memory while
 * anyone is connected and all state lives in the RoomHost. It's billed for the time players are
 * connected, which during a match is all the time anyway.
 */
export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.host = new RoomHost();
    }

    async fetch() {
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
