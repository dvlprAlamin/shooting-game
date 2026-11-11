/**
 * Serves a RoomHost through a relay: one channel that carries every player's connection, for a host that can't
 * accept connections itself. A phone hosting a nearby game is one. The app's native code (LanServer on Android)
 * runs the WebSocket server players connect to and passes their frames to the page over a single WebSocket;
 * the room runs in the page (src/net/lan/hostWorker.js in the client).
 *
 * The channel's frames are text:
 *   relay -> room   `o<id>` a player connected, `m<id>:<text>` their message, `c<id>` their connection closed
 *   room -> relay   `s<id>:<text>` send them a message, `x<id>:<code>:<reason>` close their connection
 * Ids are the relay's (any text without a ':').
 *
 * @param {import('./RoomHost.js').RoomHost} host
 * @param {{ send(text: string): void }} channel
 * @returns {(frame: string) => void} call with each frame that comes from the relay
 */
export function serveRelay(host, channel) {
    const conns = new Map(); // relay id -> RoomHost connection
    const socket = (id) => ({
        send: (text) => channel.send(`s${id}:${text}`),
        close: (code = 1000, reason = '') => channel.send(`x${id}:${code}:${reason}`),
    });

    return (frame) => {
        if (typeof frame !== 'string') return;
        const colon = frame.indexOf(':');
        const id = colon < 0 ? frame.slice(1) : frame.slice(1, colon);
        const conn = conns.get(id);
        switch (frame[0]) {
            case 'o':
                if (!conn) conns.set(id, host.connect(socket(id)));
                break;
            case 'm':
                if (conn && colon >= 0) host.message(conn, frame.slice(colon + 1));
                break;
            case 'c':
                if (conn) {
                    conns.delete(id);
                    host.closed(conn);
                }
                break;
        }
    };
}
