// The maps, as data both sides read: the client builds the level from it (meshes and Rapier colliders),
// the server picks spawn points from it and checks that shots don't go through its boxes.
// Types: maps.d.ts.
import { canyon } from './canyon.js';
import { depot } from './depot.js';
import { outpost } from './outpost.js';

// Offered when creating a room, in this order. The first is the default.
export const MAPS = [canyon, depot, outpost];
export const DEFAULT_MAP = MAPS[0].id;

/** The map with this id, or the default one. */
export const getMap = (id) => MAPS.find((map) => map.id === id) ?? MAPS[0];
