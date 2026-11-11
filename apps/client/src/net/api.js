import { SERVER_URL } from '@/config';

// The game server's HTTP side (the game itself runs over the room WebSocket, see socket.js).

const BASE = SERVER_URL.replace(/\/+$/, '');
const TIMEOUT_MS = 8000;

const request = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status });
  return res.json();
};

/** Quick play: the id of a public room with a free slot (or a new one). Join it with `quick: true`. */
export const quickPlay = async () => (await request('/quickplay', { method: 'POST' })).roomId;

/** Your profile's totals ({ name, kills, deaths, matches, wins, bestStreak, seconds }), or null if it has none
 *  yet. Throws if the server can't say (it may have no profiles set up). */
export const fetchProfile = async (id) => {
  try {
    return await request(`/profile/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
};
