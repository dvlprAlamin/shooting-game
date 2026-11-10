// Spawn points on the current map (capsule centre positions).
export const SPAWN_POINTS = [
    { x: -45.62518310546875, y: -8.443558692932129, z: 21.901233673095703 },
    { x: -27.604557037353516, y: -7.8375468254089355, z: 6.595322132110596 },
    { x: 1.2871710062026978, y: -5.710155487060547, z: -15.965947151184082 },
    { x: 23.793689727783203, y: -1.4231683015823364, z: -23.991069793701172 },
    { x: -6.467380046844482, y: 3.295560121536255, z: -22.08796501159668 },
    { x: 5.820116996765137, y: -10.840858459472656, z: -3.90596866607666 },
];

// A safe spawn is one of this many spawn points farthest from the enemies: picking at random among
// them keeps spawns hard to predict (and camp).
const SAFE_CHOICES = 2;

const distanceSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

export const randomSpawn = (random = Math.random) => ({
    ...SPAWN_POINTS[Math.floor(random() * SPAWN_POINTS.length)],
});

/** A spawn point away from `enemies` (positions): one of the SAFE_CHOICES farthest from the nearest enemy. */
export const safeSpawn = (enemies, random = Math.random) => {
    if (!enemies.length) return randomSpawn(random);
    const ranked = SPAWN_POINTS.map((point) => ({
        point,
        nearest: Math.min(...enemies.map((e) => distanceSq(point, e))),
    })).sort((a, b) => b.nearest - a.nearest);
    return { ...ranked[Math.floor(random() * SAFE_CHOICES)].point };
};
