// The original map: a canyon valley modelled in Blender, loaded from two GLBs (one with collision meshes).
// It has no boxes, so the server can't check its walls; it only checks that shots start where the shooter is.
export const canyon = {
    id: 'canyon',
    name: 'Canyon',
    blurb: 'Open valley, long sight lines',
    glb: {
        physics: '/physics-scene.glb',
        visual: '/physicsless-scene.glb',
        position: [0, -10, 0],
        scale: 1.2,
    },
    boxes: [],
    // Capsule centres. No yaw: you keep facing the way you were.
    spawns: [
        { x: -45.62518310546875, y: -8.443558692932129, z: 21.901233673095703 },
        { x: -27.604557037353516, y: -7.8375468254089355, z: 6.595322132110596 },
        { x: 1.2871710062026978, y: -5.710155487060547, z: -15.965947151184082 },
        { x: 23.793689727783203, y: -1.4231683015823364, z: -23.991069793701172 },
        { x: -6.467380046844482, y: 3.295560121536255, z: -22.08796501159668 },
        { x: 5.820116996765137, y: -10.840858459472656, z: -3.90596866607666 },
    ],
    // Fell through the terrain: drop back in from above the valley.
    fall: { y: -15, reset: { x: -10, y: 40, z: 15 } },
    light: { sun: [100, 100, 0], sunIntensity: 1.5, ambient: 1.5 },
};
