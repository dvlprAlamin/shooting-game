import { SERVER_URL } from '@/config';

// The game server's HTTP side (the game itself runs over the room WebSocket, see socket.js).

const BASE = SERVER_URL.replace(/\/+$/, '');
const TIMEOUT_MS = 8000;

const request = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw Object.assign(new Error(`${path}: ${res.status}`), { status: res.status });
  return res.status === 204 ? null : res.json();
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

/** Signs this device in with a Google ID token. Returns `{ profileId, profile }`: the profile to play as from now
 *  on (the account's, with the record so far added to it) and its totals, or null if it has none yet. */
export const exchangeGoogleToken = (idToken, profileId) =>
  request('/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, profileId }),
  });

/** Deletes a profile's record, and its link to an account. */
export const deleteProfile = (id) => request(`/profile/${encodeURIComponent(id)}`, { method: 'DELETE' });
