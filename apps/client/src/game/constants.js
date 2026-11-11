// Client-side gameplay tuning. Numbers the server also needs (hitbox, ...) live in @rimfire/shared
// (packages/shared/gameplay.js); each gun's (damage, fire rate, magazine, reload, spread, ...) in
// @rimfire/shared/weapons.
export {
  EYE_HEIGHT,
  HEAD_HEIGHT,
  MAX_SHOT_DISTANCE,
  PLAYER_CENTER_TO_FEET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '@rimfire/shared';

// Movement (m/s)
export const WALK_SPEED = 4.5;
export const SPRINT_SPEED = 7;
export const ADS_SPEED = 2.6;
export const GROUND_ACCEL = 14;
export const AIR_ACCEL = 2.5;
export const JUMP_VELOCITY = 5.2;

// Camera
export const WORLD_FOV = 60;
export const VIEWMODEL_FOV = 55;
export const VIEWMODEL_ADS_FOV = 42;
export const TOUCH_LOOK_SPEED = 0.005; // radians per CSS pixel of drag

// Networking
export const NET_SEND_INTERVAL = 50; // ms (20 Hz)
export const INTERP_DELAY = 100; // ms behind the newest snapshot

// Movement flags sent with each snapshot
export const FLAG_GROUNDED = 1;
export const FLAG_SPRINT = 2;
export const FLAG_AIM = 4;
export const FLAG_RELOAD = 8;
