import { create } from 'zustand';

// The player's settings (the Settings dialog in the menu). Kept on this device: a button layout made for one screen
// doesn't suit another.

/** The on-screen buttons (components/controls.js). */
export type ControlId = 'fire' | 'fireLeft' | 'aim' | 'jump' | 'reload' | 'weapon' | 'medkit';
const CONTROL_IDS: ControlId[] = ['fire', 'fireLeft', 'aim', 'jump', 'reload', 'weapon', 'medkit'];

/** How one button differs from its default: its centre as a share (0..1) of the screen inside the safe areas, its
 *  size as a scale, or hidden. What's left out is as the stylesheet has it. */
export interface IPlacement {
  x?: number;
  y?: number;
  size?: number;
  hidden?: boolean;
}

export type Layout = Partial<Record<ControlId, IPlacement>>;

export interface ISettings {
  /** Times the normal look speed, for touch and mouse alike. */
  lookSpeed: number;
  /** Of the on-screen buttons; 1 is as designed. */
  buttonOpacity: number;
  layout: Layout;
}

export interface ISettingsStore extends ISettings {
  change: (changes: Partial<ISettings>) => void;
}

export const LOOK_SPEED = { min: 0.2, max: 3, step: 0.1 };
export const BUTTON_OPACITY = { min: 0.3, max: 1, step: 0.05 };
export const BUTTON_SIZE = { min: 0.6, max: 1.5, step: 0.05 };
const SHARE = { min: 0, max: 1 };

export const DEFAULT_SETTINGS: ISettings = { lookSpeed: 1, buttonOpacity: 1, layout: {} };

const KEY = 'settings';

const inRange = (value: unknown, { min, max }: { min: number; max: number }): value is number =>
  typeof value === 'number' && value >= min && value <= max;

// What was saved, keeping only values that make sense, so an old or broken save can't break the controls. The main
// fire button is never hidden.
const load = (): ISettings => {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? {};
    const layout: Layout = {};
    for (const id of CONTROL_IDS) {
      const p = saved.layout?.[id];
      if (!p) continue;
      const place: IPlacement = {};
      if (inRange(p.x, SHARE) && inRange(p.y, SHARE)) Object.assign(place, { x: p.x, y: p.y });
      if (inRange(p.size, BUTTON_SIZE)) place.size = p.size;
      if (p.hidden === true && id !== 'fire') place.hidden = true;
      layout[id] = place;
    }
    return {
      lookSpeed: inRange(saved.lookSpeed, LOOK_SPEED) ? saved.lookSpeed : DEFAULT_SETTINGS.lookSpeed,
      buttonOpacity: inRange(saved.buttonOpacity, BUTTON_OPACITY) ? saved.buttonOpacity : DEFAULT_SETTINGS.buttonOpacity,
      layout,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const useSettingsStore = create<ISettingsStore>()((set, get) => ({
  ...load(),
  change: (changes) => {
    set(() => changes);
    const { lookSpeed, buttonOpacity, layout } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ lookSpeed, buttonOpacity, layout }));
    } catch {
      // Private mode: kept for this visit only.
    }
  },
}));
