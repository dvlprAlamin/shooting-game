package com.dvlpralamin.rimfire.lan;

import java.net.InetSocketAddress;
import java.util.Collections;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.protocols.IProtocol;
import org.java_websocket.protocols.Protocol;
import org.java_websocket.server.WebSocketServer;

/**
 * The WebSocket server of a nearby game this phone hosts. The room itself runs in the page (a Web Worker, see
 * src/net/lan in the web app): this only relays. Paths:
 *
 *   /host?token=...  the room's channel. Only from this phone, with the token LanPlugin handed the page, and
 *                    one at a time. Frames: packages/game/src/relay.js.
 *   /rooms/...       players, this phone's own included. Each is relayed over the room's channel.
 *   /info            answers one text frame (the game's info and how many players are connected), then closes.
 */
final class LanServer extends WebSocketServer {

    private static final int MAX_FRAME = 64 * 1024;
    // Connections, not the room's player limit (the room has that): enough for its biggest option and then some.
    private static final int MAX_PLAYERS = 32;
    private static final Object ROOM = new Object(); // the room channel's attachment; players' is their id
    private static final String HOST_PATH = "/host?token=";
    private static final String GONE =
        "{\"e\":\"notification\",\"d\":{\"message\":\"The host left, so the game is over.\"}}";
    private static final String FULL = "{\"e\":\"notification\",\"d\":{\"message\":\"That game is full.\"}}";
    private static final int ROOM_CLOSED = 4004; // CLOSE.ROOM_CLOSED in packages/game/src/RoomHost.js
    private static final int JOIN_FAILED = 4000; // CLOSE.JOIN_FAILED

    private final String token;
    private final String info; // a JSON object
    private final AtomicInteger nextId = new AtomicInteger(1);
    private final ConcurrentHashMap<String, WebSocket> players = new ConcurrentHashMap<>();
    private final CountDownLatch started = new CountDownLatch(1);
    private volatile WebSocket room;
    private volatile boolean failed;

    LanServer(InetSocketAddress address, String token, String info) {
        super(address, Collections.singletonList(
            new Draft_6455(Collections.emptyList(), Collections.<IProtocol>singletonList(new Protocol("")), MAX_FRAME)));
        this.token = token;
        this.info = info;
        setReuseAddr(true);
        setTcpNoDelay(true);
        setConnectionLostTimeout(10); // seconds without a pong before a connection counts as dropped
    }

    /** Starts listening; false if it couldn't (the port is taken). */
    boolean startAndWait() throws InterruptedException {
        start();
        boolean done = started.await(3, TimeUnit.SECONDS);
        if (done && !failed) return true;
        stopQuietly();
        return false;
    }

    void stopQuietly() {
        try {
            stop(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public void onStart() {
        started.countDown();
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        String path = handshake.getResourceDescriptor();
        if (path.startsWith(HOST_PATH)) {
            boolean local = conn.getRemoteSocketAddress().getAddress().isLoopbackAddress();
            if (!local || !token.equals(path.substring(HOST_PATH.length())) || room != null) {
                conn.close(1008, "Not allowed");
                return;
            }
            conn.setAttachment(ROOM);
            room = conn;
        } else if (path.equals("/info")) {
            // The players count goes in front of the info's own fields.
            String fields = info.length() > 2 ? "," + info.substring(1) : "}";
            conn.send("{\"players\":" + players.size() + fields);
            conn.close(1000, "");
        } else if (path.startsWith("/rooms/")) {
            WebSocket r = room;
            if (r == null || players.size() >= MAX_PLAYERS) {
                conn.send(r == null ? GONE : FULL);
                conn.close(r == null ? ROOM_CLOSED : JOIN_FAILED, "");
                return;
            }
            String id = Integer.toString(nextId.getAndIncrement());
            conn.setAttachment(id);
            players.put(id, conn);
            send(r, "o" + id);
        } else {
            conn.close(1008, "Not found");
        }
    }

    @Override
    public void onMessage(WebSocket conn, String text) {
        Object who = conn.getAttachment();
        if (who == ROOM) fromRoom(text);
        else if (who instanceof String) send(room, "m" + who + ":" + text);
    }

    // `s<id>:<text>` sends a player a message, `x<id>:<code>:<reason>` closes their connection.
    private void fromRoom(String frame) {
        int colon = frame.indexOf(':');
        if (frame.length() < 2 || colon < 0) return;
        WebSocket player = players.get(frame.substring(1, colon));
        if (player == null) return;
        String rest = frame.substring(colon + 1);
        if (frame.charAt(0) == 's') {
            send(player, rest);
        } else if (frame.charAt(0) == 'x') {
            int c = rest.indexOf(':');
            try {
                player.close(Integer.parseInt(c < 0 ? rest : rest.substring(0, c)), c < 0 ? "" : rest.substring(c + 1));
            } catch (IllegalArgumentException e) {
                player.close(1011, "");
            }
        }
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        Object who = conn.getAttachment();
        if (who == ROOM) {
            if (room == conn) room = null;
            // The room has gone without closing its players (the page was closed, or crashed): say why.
            for (WebSocket player : players.values()) {
                send(player, GONE);
                player.close(ROOM_CLOSED, "");
            }
        } else if (who instanceof String && players.remove(who) != null) {
            send(room, "c" + who);
        }
    }

    @Override
    public void onError(WebSocket conn, Exception e) {
        if (conn == null) {
            // The server itself: it couldn't start (the port is taken), or it stopped.
            failed = true;
            started.countDown();
        }
    }

    private static void send(WebSocket to, String text) {
        if (to == null) return;
        try {
            to.send(text);
        } catch (WebsocketNotConnectedException e) {
            // Closing already; its onClose cleans up.
        }
    }
}
