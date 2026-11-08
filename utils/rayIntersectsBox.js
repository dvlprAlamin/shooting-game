// Slab test. Returns the distance along the (normalized) ray to the box, or null on a miss.
// Handles axis-parallel rays (direction component 0) without producing NaN.
const rayIntersectsBox = (rayOrigin, rayDirection, boxMin, boxMax) => {
    let tmin = -Infinity;
    let tmax = Infinity;

    for (const axis of ['x', 'y', 'z']) {
        const o = rayOrigin[axis];
        const d = rayDirection[axis];
        const min = boxMin[axis];
        const max = boxMax[axis];

        if (Math.abs(d) < 1e-9) {
            // Parallel to this slab: must already be inside it.
            if (o < min || o > max) return null;
            continue;
        }

        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
    }

    if (tmax < 0) return null; // box is behind the ray
    return tmin >= 0 ? tmin : 0; // origin inside the box
};

module.exports = rayIntersectsBox;
