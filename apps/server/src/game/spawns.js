// A safe spawn is one of this many spawn points farthest from the enemies: picking at random among
// them keeps spawns hard to predict (and camp).
const SAFE_CHOICES = 2;

const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

export const randomSpawn = (points, random = Math.random) => ({
    ...points[Math.floor(random() * points.length)],
});

/** One of the map's spawn `points` away from `enemies` (positions): one of the SAFE_CHOICES farthest from the nearest enemy. */
export const safeSpawn = (points, enemies, random = Math.random) => {
    if (!enemies.length) return randomSpawn(points, random);
    const ranked = points
        .map((point) => ({
            point,
            nearest: Math.min(...enemies.map((e) => distanceSq(point, e))),
        }))
        .sort((a, b) => b.nearest - a.nearest);
    return { ...ranked[Math.floor(random() * Math.min(SAFE_CHOICES, ranked.length))].point };
};
