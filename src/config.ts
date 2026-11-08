// Runtime configuration from Vite env vars, with sane defaults so the game works without a .env file.
const env = import.meta.env;

const int = (value: string | undefined, fallback: number) => {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const SERVER_URL: string =
  env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3000`;
export const SHOOT_BUTTON = int(env.VITE_SHOOT_BUTTON, 0);
export const AIM_BUTTON = int(env.VITE_AIM_BUTTON, 2);
export const RELOAD_BUTTON_CODE: string = env.VITE_RELOAD_BUTTON_CODE || 'KeyR';
export const RELOAD_BUTTON_NAME: string = env.VITE_RELOAD_BUTTON_NAME || 'R';
