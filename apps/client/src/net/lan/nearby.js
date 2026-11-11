import { LAN_PORT, Lan, NEARBY_VERSION, TUNNELS } from './native';

const LOOK_EVERY = 3000; // ms between checks on the games found
const PROBE_TIMEOUT = 2500;

// Loopback ports that lead to other phones' games (LanPlugin's tunnels), by "host:port". Each is opened once.
const tunnels = new Map();

const keyOf = (host, port) => `${host}:${port}`;

// A port on 127.0.0.1 that leads to host:port, on Android.
function tunnelTo(host, port) {
  const key = keyOf(host, port);
  if (!tunnels.has(key)) {
    const opening = Lan.openTunnel({ host, port }).then((r) => r.port);
    opening.catch(() => tunnels.delete(key));
    tunnels.set(key, opening);
  }
  return tunnels.get(key);
}

/** The ws:// address to connect to for the game at host:port: through a tunnel on Android. */
export async function serverAt(host, port) {
  return TUNNELS ? `ws://127.0.0.1:${await tunnelTo(host, port)}` : `ws://${host}:${port}`;
}

/** Closes the tunnels, but the one to `keep` ("host:port"). */
export function closeTunnels(keep = null) {
  for (const [key, opening] of tunnels) {
    if (key === keep) continue;
    tunnels.delete(key);
    opening.then((port) => Lan.closeTunnel({ port })).catch(() => {});
  }
}

/** "192.168.1.5" or "192.168.1.5:7351" -> { host, port }; null if it isn't an address. */
export function parseAddress(text) {
  const m = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const port = m[2] ? Number(m[2]) : LAN_PORT;
  return port >= 1 && port <= 65535 ? { host: m[1], port } : null;
}

/**
 * The game at host:port, as a list entry: { key, host, port, name, map, mode, players, limit, sameVersion }.
 * Null if nothing answers there.
 */
export async function probe(host, port) {
  const server = await serverAt(host, port).catch(() => null);
  if (!server) return null;
  const info = await new Promise((resolve) => {
    const ws = new WebSocket(`${server}/info`);
    const done = (value) => {
      clearTimeout(timer);
      ws.onmessage = ws.onclose = null;
      ws.close();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), PROBE_TIMEOUT);
    ws.onmessage = (e) => {
      try {
        done(JSON.parse(e.data));
      } catch {
        done(null);
      }
    };
    ws.onclose = () => done(null);
  });
  if (info?.game !== 'rimfire') return null;
  return {
    key: keyOf(host, port),
    host,
    port,
    name: String(info.name ?? ''),
    map: info.map,
    mode: info.mode,
    players: info.players | 0,
    limit: info.limit | 0,
    sameVersion: info.v === NEARBY_VERSION,
  };
}

/**
 * Looks for games on the networks this phone is on, until the returned function is called: ones advertised
 * nearby (NSD or Bonjour), and one on the gateway of a hotspot this phone joined (the phone sharing it is the
 * likely host).
 * `onChange` gets the list, in the order they were found, whenever it changes. `onBlocked` gets whether the phone
 * keeps the app off the local network (on iOS, while Local Network access is off for it in Settings).
 */
export function watchNearby(onChange, onBlocked = () => {}) {
  const places = new Map(); // key -> { host, port, name }: where to look; name is NSD's, null for a gateway
  const games = new Map(); // key -> list entry
  let live = true;
  let looking = false;

  const emit = () => live && onChange([...games.values()]);

  const look = async () => {
    if (looking || !live) return;
    looking = true;
    try {
      const { gateways = [] } = await Lan.gateways().catch(() => ({}));
      for (const host of gateways) {
        const key = keyOf(host, LAN_PORT);
        if (!places.has(key)) places.set(key, { host, port: LAN_PORT, name: null });
      }
      const found = await Promise.all([...places].map(async ([key, p]) => [key, await probe(p.host, p.port)]));
      for (const [key, game] of found) {
        if (game && places.has(key)) games.set(key, game);
        else games.delete(key);
      }
      emit();
    } finally {
      looking = false;
    }
  };

  const listeners = [
    Lan.addListener('found', ({ name, host, port }) => {
      places.set(keyOf(host, port), { host, port, name });
      look();
    }),
    Lan.addListener('lost', ({ name }) => {
      for (const [key, p] of places) {
        if (p.name !== name) continue;
        places.delete(key);
        games.delete(key);
      }
      emit();
    }),
    Lan.addListener('blocked', ({ blocked }) => live && onBlocked(!!blocked)),
  ];
  Lan.startDiscovery().catch(() => {}); // the gateway and typed addresses still work
  look();
  const timer = setInterval(look, LOOK_EVERY);

  return () => {
    live = false;
    clearInterval(timer);
    for (const listener of listeners) Promise.resolve(listener).then((l) => l.remove());
    Lan.stopDiscovery().catch(() => {});
  };
}
