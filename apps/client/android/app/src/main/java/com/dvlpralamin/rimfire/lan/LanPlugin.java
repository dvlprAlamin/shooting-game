package com.dvlpralamin.rimfire.lan;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.RouteInfo;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import javax.net.SocketFactory;

/**
 * Nearby games over Wi-Fi or a phone's hotspot, no internet needed (src/net/lan in the web app).
 *
 * Hosting: startHost opens LanServer on every interface and advertises it on the network (NSD, service type
 * _rimfire._tcp); the page runs the room and connects to it as the room's channel. Joining: startDiscovery
 * reports games advertised nearby ("found" / "lost" events), gateways lists the hotspots this phone is on (the
 * phone sharing one is the likely host), and openTunnel gives the page a loopback port that leads to a game
 * (see TcpTunnel).
 */
@CapacitorPlugin(name = "Lan")
public class LanPlugin extends Plugin {

    private static final String TAG = "Lan";
    private static final String SERVICE_TYPE = "_rimfire._tcp";
    // The list shows each game's name from /info; NSD numbers the others with this name ("RimFire game (2)").
    private static final String SERVICE_NAME = "RimFire game";
    private static final int PORTS_TO_TRY = 10;
    // Interfaces a nearby player could reach this phone on: Wi-Fi, the hotspot it shares, USB/Bluetooth tethering.
    // Not mobile data, VPNs or the system's own.
    private static final String[] LOCAL_INTERFACES = { "wlan", "swlan", "ap", "softap", "eth", "rndis", "bt-pan" };

    private LanServer server;
    private NsdManager.RegistrationListener registration;
    private NsdManager.DiscoveryListener discovery;
    private WifiManager.MulticastLock multicastLock;
    private final ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>();
    private boolean resolving;
    private final Map<Integer, TcpTunnel> tunnels = new ConcurrentHashMap<>();

    // ---- Hosting

    /**
     * Starts hosting: { port, info } -> { port, token, addresses }. `port` is the one to try first (the
     * next few are tried after it), `info` what /info answers besides the player count, `token` what the room's
     * channel must show, and `addresses` this phone's addresses others can join it on.
     */
    @PluginMethod
    public void startHost(PluginCall call) {
        stopHosting();
        int first = call.getInt("port", 7350);
        JSObject info = call.getObject("info", new JSObject());
        String token = newToken();
        try {
            for (int port = first; port < first + PORTS_TO_TRY && server == null; port++) {
                LanServer s = new LanServer(new InetSocketAddress(port), token, info.toString());
                if (s.startAndWait()) server = s;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (server == null) {
            call.reject("No free port to host on");
            return;
        }
        advertise(server.getPort());
        JSArray addresses = new JSArray();
        for (String a : localAddresses()) addresses.put(a);
        JSObject result = new JSObject();
        result.put("port", server.getPort());
        result.put("token", token);
        result.put("addresses", addresses);
        call.resolve(result);
    }

    @PluginMethod
    public void stopHost(PluginCall call) {
        stopHosting();
        call.resolve();
    }

    private synchronized void stopHosting() {
        if (registration != null) {
            try {
                nsd().unregisterService(registration);
            } catch (IllegalArgumentException e) {
                // It never got registered.
            }
            registration = null;
        }
        if (server != null) {
            server.stopQuietly();
            server = null;
        }
    }

    private void advertise(int port) {
        NsdServiceInfo service = new NsdServiceInfo();
        service.setServiceName(SERVICE_NAME);
        service.setServiceType(SERVICE_TYPE);
        service.setPort(port);
        registration = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo s) {}

            @Override
            public void onRegistrationFailed(NsdServiceInfo s, int error) {
                // Players can still join by address.
                Log.w(TAG, "Couldn't advertise the game: " + error);
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo s) {}

            @Override
            public void onUnregistrationFailed(NsdServiceInfo s, int error) {}
        };
        nsd().registerService(service, NsdManager.PROTOCOL_DNS_SD, registration);
    }

    // IPv4 addresses of this phone on the interfaces nearby players can reach, Wi-Fi first.
    private static List<String> localAddresses() {
        List<String> addresses = new ArrayList<>();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || !isLocalInterface(nif.getName())) continue;
                for (InetAddress a : Collections.list(nif.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLinkLocalAddress()) continue;
                    if (nif.getName().startsWith("wlan")) addresses.add(0, a.getHostAddress());
                    else addresses.add(a.getHostAddress());
                }
            }
        } catch (IOException e) {
            Log.w(TAG, "Couldn't list addresses", e);
        }
        return addresses;
    }

    private static boolean isLocalInterface(String name) {
        for (String prefix : LOCAL_INTERFACES) if (name.startsWith(prefix)) return true;
        return false;
    }

    private static String newToken() {
        byte[] bytes = new byte[16];
        new SecureRandom().nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    // ---- Finding games

    /** Looks for games on the network until stopDiscovery: "found" { name, host, port } and "lost" { name }. */
    @PluginMethod
    public void startDiscovery(PluginCall call) {
        stopDiscovering();
        WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            // Some phones drop the multicast packets discovery listens for unless an app holds this.
            multicastLock = wifi.createMulticastLock("rimfire-nearby");
            multicastLock.setReferenceCounted(false);
            multicastLock.acquire();
        }
        discovery = new NsdManager.DiscoveryListener() {
            @Override
            public void onServiceFound(NsdServiceInfo s) {
                resolve(s);
            }

            @Override
            public void onServiceLost(NsdServiceInfo s) {
                JSObject lost = new JSObject();
                lost.put("name", s.getServiceName());
                notifyListeners("lost", lost);
            }

            @Override
            public void onDiscoveryStarted(String type) {}

            @Override
            public void onDiscoveryStopped(String type) {}

            @Override
            public void onStartDiscoveryFailed(String type, int error) {
                Log.w(TAG, "Discovery failed: " + error);
            }

            @Override
            public void onStopDiscoveryFailed(String type, int error) {}
        };
        nsd().discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
        call.resolve();
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopDiscovering();
        call.resolve();
    }

    private synchronized void stopDiscovering() {
        if (discovery != null) {
            try {
                nsd().stopServiceDiscovery(discovery);
            } catch (IllegalArgumentException e) {
                // Discovery never started.
            }
            discovery = null;
        }
        if (multicastLock != null) {
            multicastLock.release();
            multicastLock = null;
        }
        toResolve.clear();
    }

    // Before Android 14 NSD resolves one service at a time, so they queue.
    private synchronized void resolve(NsdServiceInfo service) {
        toResolve.add(service);
        resolveNext();
    }

    @SuppressWarnings("deprecation") // resolveService and getHost: their replacements need Android 14
    private synchronized void resolveNext() {
        if (resolving || toResolve.isEmpty()) return;
        resolving = true;
        nsd().resolveService(toResolve.poll(), new NsdManager.ResolveListener() {
            @Override
            public void onServiceResolved(NsdServiceInfo s) {
                InetAddress host = s.getHost();
                if (Build.VERSION.SDK_INT >= 34) {
                    for (InetAddress a : s.getHostAddresses()) if (a instanceof Inet4Address) host = a;
                }
                if (host != null) {
                    JSObject found = new JSObject();
                    found.put("name", s.getServiceName());
                    found.put("host", host.getHostAddress());
                    found.put("port", s.getPort());
                    notifyListeners("found", found);
                }
                resolved();
            }

            @Override
            public void onResolveFailed(NsdServiceInfo s, int error) {
                resolved();
            }
        });
    }

    private synchronized void resolved() {
        resolving = false;
        resolveNext();
    }

    /** { gateways }: the routers of the Wi-Fi networks this phone is on. On a hotspot, that's the phone sharing it. */
    @PluginMethod
    public void gateways(PluginCall call) {
        JSArray gateways = new JSArray();
        ConnectivityManager cm = connectivity();
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(n);
            LinkProperties link = cm.getLinkProperties(n);
            if (caps == null || link == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) continue;
            for (RouteInfo route : link.getRoutes()) {
                if (route.isDefaultRoute() && route.getGateway() instanceof Inet4Address) {
                    gateways.put(route.getGateway().getHostAddress());
                }
            }
        }
        JSObject result = new JSObject();
        result.put("gateways", gateways);
        call.resolve(result);
    }

    // ---- Tunnels

    /** { host, port } -> { port }: a port on 127.0.0.1 that leads to host:port. */
    @PluginMethod
    public void openTunnel(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port");
        if (host == null || port == null || port < 1 || port > 65535) {
            call.reject("Needs a host and a port");
            return;
        }
        try {
            InetAddress address = InetAddress.getByName(host);
            TcpTunnel tunnel = new TcpTunnel(new InetSocketAddress(address, port), socketsFor(address));
            tunnels.put(tunnel.port(), tunnel);
            JSObject result = new JSObject();
            result.put("port", tunnel.port());
            call.resolve(result);
        } catch (IOException e) {
            call.reject("Can't reach " + host);
        }
    }

    @PluginMethod
    public void closeTunnel(PluginCall call) {
        TcpTunnel tunnel = tunnels.remove(call.getInt("port", -1));
        if (tunnel != null) tunnel.close();
        call.resolve();
    }

    // Sockets on the network the address is on. A hotspot without internet isn't the phone's default network while
    // mobile data is on, and sockets go out on the default network unless told otherwise.
    private SocketFactory socketsFor(InetAddress address) {
        ConnectivityManager cm = connectivity();
        for (Network n : cm.getAllNetworks()) {
            LinkProperties link = cm.getLinkProperties(n);
            if (link == null) continue;
            for (LinkAddress la : link.getLinkAddresses()) {
                if (sameSubnet(la, address)) return n.getSocketFactory();
            }
        }
        return SocketFactory.getDefault();
    }

    private static boolean sameSubnet(LinkAddress link, InetAddress address) {
        byte[] a = link.getAddress().getAddress();
        byte[] b = address.getAddress();
        if (a.length != b.length) return false;
        int bits = link.getPrefixLength();
        for (int i = 0; i < a.length && bits > 0; i++, bits -= 8) {
            int mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
            if ((a[i] & mask) != (b[i] & mask)) return false;
        }
        return true;
    }

    // ---- Lifecycle

    @Override
    protected void handleOnDestroy() {
        // Stopping the server waits for its thread, so not on the main thread.
        new Thread(() -> {
            stopHosting();
            stopDiscovering();
            for (TcpTunnel tunnel : tunnels.values()) tunnel.close();
            tunnels.clear();
        }, "lan-shutdown").start();
    }

    private NsdManager nsd() {
        return (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
    }

    private ConnectivityManager connectivity() {
        return (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
    }
}
