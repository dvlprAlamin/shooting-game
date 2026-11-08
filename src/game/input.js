import { usePointerLockControlsStore } from '@/store/PointerLockControlStore';
import { useAimingStore } from '@/store/AimingStore';
import { AIM_BUTTON, RELOAD_BUTTON_CODE, SHOOT_BUTTON } from '@/config';

// Keyboard/mouse/touch state read every frame inside useFrame. Kept outside React so key
// presses don't trigger re-renders.
export const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  fire: false,
  aim: false,
  reload: false, // edge-triggered, consumed by the player
  firePressed: false, // edge-triggered, consumed by the player
  // Touch controls (see components/TouchControls.jsx)
  moveX: 0, // analog stick, -1 (left) .. 1 (right)
  moveY: 0, // analog stick, -1 (back) .. 1 (forward)
  stickSprint: false, // stick pushed all the way forward
  lookX: 0, // accumulated drag in CSS pixels, consumed by the player
  lookY: 0,
};

const KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

export const setAim = (value) => {
  input.aim = value;
  if (useAimingStore.getState().isAiming !== value) useAimingStore.getState().setIsAiming(value);
};

export const releaseAll = () => {
  for (const k of Object.values(KEYS)) input[k] = false;
  input.fire = false;
  input.moveX = input.moveY = 0;
  input.stickSprint = false;
  input.lookX = input.lookY = 0;
  setAim(false);
};

let installs = 0;

const onKeyDown = (e) => {
  if (e.code === RELOAD_BUTTON_CODE) {
    if (!e.repeat) input.reload = true;
    return;
  }
  const field = KEYS[e.code];
  if (!field) return;
  if (e.code === 'Space') e.preventDefault();
  input[field] = true;
};

const onKeyUp = (e) => {
  const field = KEYS[e.code];
  if (field) input[field] = false;
};

const onMouseDown = (e) => {
  if (!usePointerLockControlsStore.getState().isLock) return;
  if (e.button === SHOOT_BUTTON) {
    input.fire = true;
    input.firePressed = true;
  } else if (e.button === AIM_BUTTON) {
    setAim(true);
  }
};

const onMouseUp = (e) => {
  if (e.button === SHOOT_BUTTON) input.fire = false;
  else if (e.button === AIM_BUTTON) setAim(false);
};

const onContextMenu = (e) => e.preventDefault();

const onPointerLockChange = () => {
  if (!document.pointerLockElement) releaseAll();
};

/** Installs the global listeners (ref-counted, safe under StrictMode). Returns an uninstaller. */
export function installInput() {
  if (installs++ === 0) {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', releaseAll);
  }
  return () => {
    if (--installs === 0) {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
    }
  };
}
