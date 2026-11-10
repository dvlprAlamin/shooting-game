// Gameplay numbers the client and the server must agree on. Both import this file as
// `@shooter/shared`. Types: gameplay.d.ts.

// Player capsule: 0.35 radius, 1.8 m tall. Positions sent over the network are the capsule centre.
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HALF_HEIGHT = 0.55; // half height of the capsule's cylinder part
export const PLAYER_CENTER_TO_FEET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;

export const MAX_HEALTH = 100;

// Weapon
export const DAMAGE = 10;
export const MAG_SIZE = 30;
export const FIRE_INTERVAL = 100; // ms (600 rpm)
export const MAX_SHOT_DISTANCE = 250;

// Options offered when creating a room. The first entry is the default.
export const ROOM_DURATIONS = [5, 10, 15, 20, 25, 30]; // minutes
export const PLAYER_LIMITS = [5, 10, 15];

// Room ids: letters, digits, '_' and '-' (what the client's generated ids use), up to 32 characters.
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
