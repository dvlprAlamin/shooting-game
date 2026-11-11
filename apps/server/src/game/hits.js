import { HEAD_HEIGHT, MAX_SHOT_DISTANCE, PLAYER_CENTER_TO_FEET, PLAYER_RADIUS } from '@shooter/shared';
import rayIntersectsBox from './rayIntersectsBox.js';

// Player hitbox around the body centre (capsule radius 0.35, 1.8 m tall).
const HITBOX_HALF_WIDTH = PLAYER_RADIUS;
const HITBOX_HALF_HEIGHT = PLAYER_CENTER_TO_FEET;
// Extra slack when validating client-side hits: covers interpolation delay and latency.
const HIT_TOLERANCE = 0.6;
// Less slack up and down for headshots: positions are sampled 20 times a second, and even a jump
// moves a player only ~0.25 m between samples.
const HEAD_TOLERANCE = 0.25;

// Distance along the ray to the box around `p` (from `bottom` to `top` relative to its centre), or null on a miss.
const rayToBox = (origin, direction, p, hw, bottom, top) =>
    rayIntersectsBox(
        origin,
        direction,
        { x: p.x - hw, y: p.y + bottom, z: p.z - hw },
        { x: p.x + hw, y: p.y + top, z: p.z + hw }
    );

// Did the shot ray pass through the target (or, with `head`, through its head) at any point in the recent past?
// Clients detect hits against what they see (interpolated, slightly in the past),
// so we accept a hit if any recent position matches within tolerance.
// Returns how far along the ray the target's centre was (the nearest of the matching positions), or null.
export const hitDistance = (origin, direction, target, now, head = false) => {
    const samples = target.history.length
        ? target.history
        : [{ t: now, x: target.position.x, y: target.position.y, z: target.position.z }];
    const hw = HITBOX_HALF_WIDTH + HIT_TOLERANCE;
    const top = HITBOX_HALF_HEIGHT + (head ? HEAD_TOLERANCE : HIT_TOLERANCE);
    const bottom = head ? HEAD_HEIGHT - HEAD_TOLERANCE : -top;
    let nearest = null;
    for (const p of samples) {
        const t = rayToBox(origin, direction, p, hw, bottom, top);
        if (t === null || t > MAX_SHOT_DISTANCE) continue;
        const along = (p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y + (p.z - origin.z) * direction.z;
        if (nearest === null || along < nearest) nearest = along;
    }
    return nearest;
};

// Fallback for clients that don't report a target: nearest player hit by the ray.
export const findTarget = (players, shooterId, origin, direction, maxDistance) => {
    let best = null;
    let bestT = Infinity;
    for (const id in players) {
        const target = players[id];
        if (id === shooterId || target.isDead) continue;
        const t = rayToBox(origin, direction, target.position, HITBOX_HALF_WIDTH, -HITBOX_HALF_HEIGHT, HITBOX_HALF_HEIGHT);
        if (t !== null && t < bestT && t <= maxDistance) {
            best = target;
            bestT = t;
        }
    }
    return best;
};
