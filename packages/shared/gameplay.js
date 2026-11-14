// Gameplay numbers the client and the server must agree on. Both import this file as
// `@rimfire/shared`. Types: gameplay.d.ts.

// Player capsule: 0.35 radius, 1.8 m tall. Positions sent over the network are the capsule centre.
export const PLAYER_RADIUS = 0.35;
export const PLAYER_HALF_HEIGHT = 0.55; // half height of the capsule's cylinder part
export const PLAYER_CENTER_TO_FEET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;
export const EYE_HEIGHT = 0.7; // camera height above the capsule centre; shots start here

export const MAX_HEALTH = 100;
// A player who just spawned can't be hurt for this long, or until they fire.
export const SPAWN_PROTECTION = 3000; // ms
// A player who died can come back this long after (the client unlocks Respawn then, and the server holds to it).
export const RESPAWN_DELAY = 5000; // ms

// Hits on the capsule higher than this above its centre are headshots (the soldiers' necks are
// 1.48 m above the feet, the capsule centre 0.9 m).
export const HEAD_HEIGHT = 0.6;
// No gun reaches farther. Per-gun numbers (damage, fire rate, magazine, ...) are in weapons.js.
export const MAX_SHOT_DISTANCE = 250;

// Options offered when creating a room. The first entry is the default.
// Modes: 'ffa' is everyone against everyone; 'tdm' is two teams (TEAMS), with no friendly fire, where the
// team with more kills wins.
export const MODES = ['ffa', 'tdm'];
export const TEAMS = ['a', 'b'];
export const ROOM_DURATIONS = [5, 10, 15, 20, 25, 30]; // minutes
export const PLAYER_LIMITS = [5, 10, 15];

// Quick play: public rooms anyone can be sent to. New ones get these settings and a random map that bots can
// play on; bots keep `bots` players in the match until people take their places. Practice rooms are the same,
// but private.
export const QUICK_PLAY = { mode: 'ffa', duration: 10, playersLimit: 10, bots: 6 };

// Room ids: letters, digits, '_' and '-' (what the client's generated ids use), up to 32 characters.
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
// Profile ids: made on the device (a random UUID) and kept there. Whoever has one can read that profile.
export const PROFILE_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
