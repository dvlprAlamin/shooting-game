package com.dvlpralamin.rimfire.lan;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.SocketFactory;

/**
 * Listens on 127.0.0.1 and pipes every connection made to it, byte for byte, to another device's game. The page
 * is served from https://localhost, so it may open ws:// to this phone only (another address would be mixed
 * content); the tunnel takes it the rest of the way.
 */
final class TcpTunnel implements Closeable {

    private static final int CONNECT_TIMEOUT_MS = 3000;

    private final ServerSocket server;
    private final InetSocketAddress target;
    private final SocketFactory sockets;
    private final Set<Socket> open = ConcurrentHashMap.newKeySet();

    /** @param sockets makes the sockets to the target: the factory of the network the target is on */
    TcpTunnel(InetSocketAddress target, SocketFactory sockets) throws IOException {
        this.target = target;
        this.sockets = sockets;
        server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        Thread accept = new Thread(this::accept, "lan-tunnel-" + server.getLocalPort());
        accept.setDaemon(true);
        accept.start();
    }

    int port() {
        return server.getLocalPort();
    }

    @Override
    public void close() {
        quietly(server);
        for (Socket s : open) quietly(s);
    }

    private void accept() {
        while (!server.isClosed()) {
            try {
                Socket local = server.accept();
                Thread t = new Thread(() -> connect(local), "lan-tunnel-conn");
                t.setDaemon(true);
                t.start();
            } catch (IOException e) {
                return; // closed
            }
        }
    }

    private void connect(Socket local) {
        Socket remote = null;
        try {
            remote = sockets.createSocket();
            open.add(local);
            open.add(remote);
            local.setTcpNoDelay(true);
            remote.setTcpNoDelay(true);
            remote.connect(target, CONNECT_TIMEOUT_MS);
            Socket r = remote;
            Thread up = new Thread(() -> pipe(local, r), "lan-tunnel-up");
            up.setDaemon(true);
            up.start();
            pipe(r, local);
        } catch (IOException e) {
            quietly(local);
            if (remote != null) quietly(remote);
        }
    }

    // Copies until either side closes, then closes both (so the other pipe ends too).
    private void pipe(Socket from, Socket to) {
        byte[] buffer = new byte[16 * 1024];
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            for (int n; (n = in.read(buffer)) != -1; ) {
                out.write(buffer, 0, n);
                out.flush();
            }
        } catch (IOException e) {
            // One side went away.
        } finally {
            quietly(from);
            quietly(to);
            open.remove(from);
            open.remove(to);
        }
    }

    private static void quietly(Closeable c) {
        try {
            c.close();
        } catch (IOException e) {
            // Already closed.
        }
    }
}
