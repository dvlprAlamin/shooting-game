import { block, box, mirrorZ, perimeter, ramp, spawn, turnedBlock } from './build.js';

// A freight yard, 64 m square, in three lanes: shipping containers in the west, an open yard with a
// loading dock in the middle, a roofed warehouse in the east. North and south mirror each other.
//
// Containers are 2.45 m wide and 2.6 m tall, 6.1 or 12.2 m long; crates are 1.2 m.

const RUST = '#a5462c';
const BLUE = '#2f5f8a';
const GREEN = '#4f6b3a';
const OCHRE = '#b8863b';
const WHITE = '#c9c6bd';
const SHED = '#b9b2a6';

const H = 2.6; // container height

// Defined once, on the z = 0 line.
const middle = [
    box([-33, -1, -33], [33, 0, 33], 'asphalt'),
    ...perimeter(32, 32, 8, 1, 'concrete'),

    // West lane: a long container splits it from the yard, with a second one stacked on its middle.
    block(-17, 0, 2.45, 12.2, H, 'metal', BLUE),
    block(-17, 0, 2.45, 6.1, H, 'metal', WHITE, H),
    // High ground against the west wall, with a ramp at each end (the ramps are in `north`).
    block(-28.6, 0, 2.45, 6.1, H, 'metal', GREEN),

    // The loading dock in the middle of the yard, a container on top of it.
    block(0, 0, 12, 8, 1.2, 'concrete'),
    ...ramp([9.5, 0, 0], [6, 1.2, 0], 3, 'concrete'),
    block(1.5, 0, 6.1, 2.45, H, 'metal', GREEN, 1.2),
    block(-4.6, 0, 1.2, 1.2, 1.2, 'wood', undefined, 1.2),

    // Warehouse: its east wall is the perimeter. Doors in the west wall are in `north`.
    box([16, 0, -4.5], [16.5, 6, 4.5], 'concrete', SHED),
    box([16, 6, -12], [32, 6.4, 12], 'roof'),
    block(24, 0, 2.4, 2.4, 1.2, 'wood'),
    block(24.6, 0.6, 1.2, 1.2, 1.2, 'wood', undefined, 1.2),
];

// The north half; mirrored for the south.
const north = [
    // West lane
    block(-17, -20, 2.45, 12.2, H, 'metal', RUST),
    ...ramp([-28.6, 0, -9.05], [-28.6, H, -3.05], 2.4, 'steel'),
    block(-24.5, -12, 6.1, 2.45, H, 'metal', OCHRE),
    block(-21, -22, 1.2, 1.2, 2.4, 'wood'),
    block(-26.4, -24.5, 1.2, 1.2, 1.2, 'wood'),
    block(-27.6, -24.5, 1.2, 1.2, 1.2, 'wood'),
    turnedBlock(-22.5, -6.5, 1.2, 1.2, 1.2, 0.4, 'wood'),

    // Yard
    ...ramp([-3.5, 0, -7.5], [-3.5, 1.2, -4], 3, 'concrete'),
    block(-7, -17, 6.1, 2.45, H, 'metal', OCHRE),
    block(6, -21, 2.45, 6.1, H, 'metal', WHITE),
    block(0, -11, 4, 0.6, 1.1, 'concrete'),
    block(-10.5, -8, 0.6, 3, 1.1, 'concrete'),
    block(11, -8.5, 0.6, 3, 1.1, 'concrete'),
    block(2.5, -25, 1.2, 1.2, 1.2, 'wood'),

    // Warehouse walls: a door in the west wall and a wide one in the north wall.
    box([16, 0, -12], [16.5, 6, -7.5], 'concrete', SHED),
    box([16, 3, -7.5], [16.5, 6, -4.5], 'concrete', SHED),
    box([16, 0, -12], [21, 6, -11.5], 'concrete', SHED),
    box([27, 0, -12], [32, 6, -11.5], 'concrete', SHED),
    box([21, 4, -12], [27, 6, -11.5], 'concrete', SHED),
    // Inside: shelving and crates.
    block(21, -5, 1.2, 5, 3, 'shelf'),
    block(28, -4, 5, 1.2, 3, 'shelf'),
    block(30.4, -10, 1.2, 1.2, 1.2, 'wood'),
    block(18, -10.2, 1.2, 1.2, 2.4, 'wood'),

    // The yard north of the warehouse
    block(24, -21, 6.1, 2.45, H, 'metal', BLUE),
    block(29.5, -17, 2.45, 6.1, H, 'metal', RUST),
    block(19, -27, 1.2, 1.2, 1.2, 'wood'),
];

const northSpawns = [
    [-26, -28.5],
    [-8, -27.5],
    [10, -28],
    [24, -28],
];

export const depot = {
    id: 'depot',
    name: 'Depot',
    blurb: 'Container lanes and a warehouse',
    bounds: 33,
    boxes: [...middle, ...north, ...mirrorZ(north)],
    spawns: [
        ...northSpawns.map(([x, z]) => spawn(x, z)),
        ...northSpawns.map(([x, z]) => spawn(x, -z)),
        spawn(-23.5, 0),
        spawn(29.5, 0),
    ],
    fall: { y: -10 }, // walled in, so only a bug drops you out; you come back at the first spawn point
    light: {
        sun: [60, 100, 35],
        sunIntensity: 1.9,
        ambient: 0.35,
        hemisphere: { sky: '#dfe9f2', ground: '#8f8170', intensity: 0.85 },
    },
};
