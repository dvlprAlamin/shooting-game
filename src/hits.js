import { MAX_SHOT_DISTANCE, PLAYER_CENTER_TO_FEET, PLAYER_RADIUS } from '../shared/gameplay.js';
import rayIntersectsBox from './rayIntersectsBox.js';

// Player hitbox around the body centre (capsule radius 0.35, 1.8 m tall).
const HITBOX_HALF_WIDTH = PLAYER_RADIUS;
const HITBOX_HALF_HEIGHT = PLAYER_CENTER_TO_FEET;
// Extra slack when validating client-side hits: covers interpolation delay and latency.
const HIT_TOLERANCE = 0.6;

// Distance along the ray to the box around `p`, or null on a miss.
const rayToBox = (origin, direction, p, hw, hh) =>
    rayIntersectsBox(
        origin,
        direction,
        { x: p.x - hw, y: p.y - hh, z: p.z - hw },
        { x: p.x + hw, y: p.y + hh, z: p.z + hw }
    );

// Did the shot ray pass through the target at any point in the recent past?
// Clients detect hits against what they see (interpolated, slightly in the past),
// so we accept a hit if any recent position matches within tolerance.
export const validateHit = (origin, direction, target, now) => {
    const samples = target.history.length
        ? target.history
        : [{ t: now, x: target.position.x, y: target.position.y, z: target.position.z }];
    const hw = HITBOX_HALF_WIDTH + HIT_TOLERANCE;
    const hh = HITBOX_HALF_HEIGHT + HIT_TOLERANCE;
    for (const p of samples) {
        const t = rayToBox(origin, direction, p, hw, hh);
        if (t !== null && t <= MAX_SHOT_DISTANCE) return true;
    }
    return false;
};

// Fallback for clients that don't report a target: nearest player hit by the ray.
export const findTarget = (players, shooterId, origin, direction, maxDistance) => {
    let best = null;
    let bestT = Infinity;
    for (const id in players) {
        const target = players[id];
        if (id === shooterId || target.isDead) continue;
        const t = rayToBox(origin, direction, target.position, HITBOX_HALF_WIDTH, HITBOX_HALF_HEIGHT);
        if (t !== null && t < bestT && t <= maxDistance) {
            best = target;
            bestT = t;
        }
    }
    return best;
};
