import { Capacitor } from '@capacitor/core';

// Runtime configuration from Vite env vars, with sane defaults so the game works without a .env file.
const env = import.meta.env;

const int = (value: string | undefined, fallback: number) => {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Running inside the Capacitor Android/iOS app (not a browser). */
export const IS_NATIVE = Capacitor.isNativePlatform();

// Touch controls on phones/tablets and in the native app. `?touch=1` / `?touch=0` overrides for testing.
const touchOverride = new URLSearchParams(window.location.search).get('touch');
export const IS_TOUCH: boolean =
  touchOverride != null ? touchOverride !== '0' : IS_NATIVE || window.matchMedia('(pointer: coarse)').matches;

// Low graphics on phones: render at 1x pixel ratio and skip shadow maps, the two biggest GPU costs
// (together ~2.5x the frame rate in testing). `?quality=low` / `?quality=high` overrides for testing.
const qualityOverride = new URLSearchParams(window.location.search).get('quality');
export const LOW_QUALITY: boolean = qualityOverride != null ? qualityOverride === 'low' : IS_TOUCH;

// The native app is served from capacitor://localhost or https://localhost, so it can't derive the
// server from its own address: native builds must set VITE_SERVER_URL.
if (IS_NATIVE && !env.VITE_SERVER_URL) {
  console.error('VITE_SERVER_URL is not set; the app cannot reach the game server.');
}
export const SERVER_URL: string =
  env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
export const SHOOT_BUTTON = int(env.VITE_SHOOT_BUTTON, 0);
export const AIM_BUTTON = int(env.VITE_AIM_BUTTON, 2);
export const RELOAD_BUTTON_CODE: string = env.VITE_RELOAD_BUTTON_CODE || 'KeyR';
export const RELOAD_BUTTON_NAME: string = env.VITE_RELOAD_BUTTON_NAME || 'R';
