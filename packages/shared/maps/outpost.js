import { block, box, fourWay, perimeter, ramp, spawn } from './build.js';

// A ruined sandstone compound, 40 m square: a raised platform in the middle with a ramp on each side,
// roofless huts in the corners, low walls between. The same from all four sides.

const SANDSTONE = '#d2a878';
const DARK = '#b98b5e';

const middle = [
    box([-21, -1, -21], [21, 0, 21], 'sand'),
    ...perimeter(20, 20, 7, 1, 'stone', SANDSTONE),
    // The platform, 2 m up, with a pillar to hide behind.
    block(0, 0, 8, 8, 2, 'stone', DARK),
    block(0, 0, 1.4, 1.4, 3, 'stone', DARK, 2),
];

// One quarter (the north side and the north-east corner), turned four times.
const quarter = [
    ...ramp([1.75, 0, -9], [1.75, 2, -4], 2.5, 'stone', DARK),
    // Parapet along the platform's north edge, open where the ramp arrives.
    box([-4, 2, -4], [0.5, 3, -3.6], 'stone', DARK),
    box([3, 2, -4], [4, 3, -3.6], 'stone', DARK),

    // Hut in the corner: doors on the two sides facing the middle.
    box([11, 0, -18], [18, 3, -17.5], 'stone', SANDSTONE),
    box([17.5, 0, -18], [18, 3, -11], 'stone', SANDSTONE),
    box([11, 0, -18], [11.5, 3, -15.5], 'stone', SANDSTONE),
    box([11, 0, -13.5], [11.5, 3, -11], 'stone', SANDSTONE),
    box([11, 0, -11.5], [13.5, 3, -11], 'stone', SANDSTONE),
    box([15.5, 0, -11.5], [18, 3, -11], 'stone', SANDSTONE),
    block(16.4, -16.4, 1.2, 1.2, 1.2, 'wood'),

    // Between the huts
    box([-4.5, 0, -14.3], [0.5, 1.2, -13.7], 'stone', SANDSTONE),
    block(6.5, -7.5, 1, 3, 3, 'stone', SANDSTONE),
    block(7.5, -15, 1.2, 1.2, 1.2, 'wood'),
];

// Spawn points in one quarter, as (x, z); turned like the boxes.
const quarterSpawns = [
    [14.5, -14.5],
    [-2, -17.5],
];
const turn = ([x, z], times) => {
    for (let i = 0; i < times; i++) [x, z] = [z, -x];
    return [x, z];
};

export const outpost = {
    id: 'outpost',
    name: 'Outpost',
    blurb: 'Small compound, close range',
    bounds: 21,
    boxes: [...middle, ...fourWay(quarter)],
    spawns: [0, 1, 2, 3].flatMap((t) => quarterSpawns.map((p) => spawn(...turn(p, t)))),
    fall: { y: -10 }, // walled in, so only a bug drops you out; you come back at the first spawn point
    light: {
        sun: [-50, 90, 60],
        sunIntensity: 2,
        ambient: 0.35,
        hemisphere: { sky: '#e6ecf0', ground: '#a07c58', intensity: 0.85 },
    },
};
