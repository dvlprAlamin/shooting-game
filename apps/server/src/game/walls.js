import rayIntersectsBox from './rayIntersectsBox.js';

// Ray tests against a map's boxes. Each box is tested in its own frame: the ray is turned by the inverse
// of the box's rotation (which keeps distances), then it's a plain axis-aligned box test.

const cache = new Map(); // map id -> its boxes, prepared for ray tests

const conjugate = ([x, y, z, w]) => [-x, -y, -z, w];

// v turned by unit quaternion q (same formula as maps/build.js).
const rotate = (v, [qx, qy, qz, qw]) => {
    const tx = 2 * (qy * v.z - qz * v.y);
    const ty = 2 * (qz * v.x - qx * v.z);
    const tz = 2 * (qx * v.y - qy * v.x);
    return {
        x: v.x + qw * tx + (qy * tz - qz * ty),
        y: v.y + qw * ty + (qz * tx - qx * tz),
        z: v.z + qw * tz + (qx * ty - qy * tx),
    };
};

const prepare = (map) => {
    let walls = cache.get(map.id);
    if (!walls) {
        walls = map.boxes.map(({ c, s, q }) => ({
            centre: { x: c[0], y: c[1], z: c[2] },
            max: { x: s[0] / 2, y: s[1] / 2, z: s[2] / 2 },
            min: { x: -s[0] / 2, y: -s[1] / 2, z: -s[2] / 2 },
            inverse: q ? conjugate(q) : null,
        }));
        cache.set(map.id, walls);
    }
    return walls;
};

/**
 * Distance along the ray (direction normalized) to the first of the map's boxes, or Infinity if it hits none
 * within `maxDistance`. A ray that starts inside a box hits it at 0.
 */
export const firstWallHit = (map, origin, direction, maxDistance = Infinity) => {
    let nearest = Infinity;
    for (const wall of prepare(map)) {
        let o = { x: origin.x - wall.centre.x, y: origin.y - wall.centre.y, z: origin.z - wall.centre.z };
        let d = direction;
        if (wall.inverse) {
            o = rotate(o, wall.inverse);
            d = rotate(d, wall.inverse);
        }
        const t = rayIntersectsBox(o, d, wall.min, wall.max);
        if (t !== null && t < nearest && t <= maxDistance) nearest = t;
    }
    return nearest;
};

/** Is there a box between points a and b? */
export const wallBetween = (map, a, b) => {
    if (!map.boxes.length) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) return false;
    return firstWallHit(map, a, { x: dx / length, y: dy / length, z: dz / length }, length) < length;
};
