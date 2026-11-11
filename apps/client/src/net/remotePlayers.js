import { INTERP_DELAY } from '@/game/constants';

// Snapshot interpolation for remote players.
//
// Movement packets arrive at ~20 Hz with network jitter. Instead of snapping to each packet
// (which looks choppy), every remote player is rendered INTERP_DELAY ms in the past, smoothly
// interpolated between the two snapshots around that time. Snapshots carry the sender's clock,
// so arrival jitter doesn't leak into the motion.
//
// This lives outside React on purpose: 20 Hz x N players of state updates would otherwise
// re-render the whole scene.

const MAX_SNAPSHOTS = 40;
const MAX_EXTRAPOLATION = 120; // ms

const players = new Map(); // id -> { snaps: [], offset: number | null, onShot, protectedUntil, weapon }

const entry = (id) => {
  let e = players.get(id);
  if (!e) {
    e = { snaps: [], offset: null, onShot: null, protectedUntil: 0, weapon: null };
    players.set(id, e);
  }
  return e;
};

const now = () => performance.now();

/** Seed/reset a player at a fixed position (join, respawn). */
export function resetRemote(id, position, yaw = 0) {
  const e = entry(id);
  e.snaps = [];
  e.offset = null;
  e.fixed = { t: 0, x: position.x, y: position.y, z: position.z, yaw, pitch: 0, f: 1 };
}

export function pushSnapshot(id, { t, p, yaw, pitch, f }) {
  const e = entry(id);
  const local = now();
  // Clock offset = local receive time - sender time. Track the minimum (least delayed packet),
  // creeping upwards slowly so a single lucky packet doesn't pin it forever.
  const sample = local - t;
  if (e.offset === null || sample < e.offset) e.offset = sample;
  else e.offset += (sample - e.offset) * 0.002;

  const last = e.snaps[e.snaps.length - 1];
  if (last && t <= last.t) return; // out of order / duplicate
  e.snaps.push({ t, x: p[0], y: p[1], z: p[2], yaw, pitch, f });
  if (e.snaps.length > MAX_SNAPSHOTS) e.snaps.shift();
  e.fixed = null;
}

export function removeRemote(id) {
  players.delete(id);
}

export function clearRemotes() {
  players.clear();
}

const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * Interpolated state of a remote player, written into `out`.
 * Returns false when nothing is known about the player yet.
 */
export function sampleRemote(id, out) {
  const e = players.get(id);
  if (!e) return false;
  if (e.fixed && !e.snaps.length) {
    Object.assign(out, e.fixed);
    return true;
  }
  const snaps = e.snaps;
  if (!snaps.length) return false;

  const renderTime = now() - e.offset - INTERP_DELAY;

  // Find the pair of snapshots around renderTime.
  let i = snaps.length - 1;
  while (i > 0 && snaps[i - 1].t > renderTime) i--;
  const b = snaps[i];
  const a = i > 0 ? snaps[i - 1] : b;

  if (renderTime >= b.t) {
    // Past the newest snapshot: extrapolate briefly along the last velocity, then hold.
    const prev = snaps.length > 1 ? snaps[snaps.length - 2] : b;
    const dt = b.t - prev.t;
    const ahead = Math.min(renderTime - b.t, MAX_EXTRAPOLATION);
    const k = dt > 0 ? ahead / dt : 0;
    out.x = b.x + (b.x - prev.x) * k;
    out.y = b.y + (b.y - prev.y) * k;
    out.z = b.z + (b.z - prev.z) * k;
    out.yaw = b.yaw;
    out.pitch = b.pitch;
    out.f = b.f;
    return true;
  }

  const span = b.t - a.t;
  const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - a.t) / span)) : 1;
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  out.yaw = lerpAngle(a.yaw, b.yaw, t);
  out.pitch = a.pitch + (b.pitch - a.pitch) * t;
  out.f = t < 0.5 ? a.f : b.f;
  return true;
}

/** Spawn protection: the server says how many ms are left (0 when it ended early). Timed on this clock. */
export function setProtection(id, ms) {
  entry(id).protectedUntil = ms > 0 ? now() + ms : 0;
}

export function isProtected(id) {
  return (players.get(id)?.protectedUntil ?? 0) > now();
}

/** Remote shot events (muzzle flash + sound) are routed to the RemotePlayer component. */
export function setShotListener(id, fn) {
  if (fn) entry(id).onShot = fn;
  else if (players.has(id)) players.get(id).onShot = null;
}

export function dispatchShot(id, data) {
  players.get(id)?.onShot?.(data);
}

/** The gun a remote player holds (a weapon id), read by RemotePlayer every frame. */
export function setRemoteWeapon(id, weapon) {
  if (weapon) entry(id).weapon = weapon;
}

export function getRemoteWeapon(id) {
  return players.get(id)?.weapon ?? null;
}
