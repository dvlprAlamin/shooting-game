import { create } from 'zustand';

// One-shot HUD feedback. Components key their CSS animations on the counters, so the
// store only changes on events, never per frame.
export interface IHudStore {
  hitMarker: number;
  killMarker: number;
  damageFlash: number;
  isReloading: boolean;
  showHitMarker: (kill?: boolean) => void;
  showDamage: () => void;
  setReloading: (value: boolean) => void;
}

export const useHudStore = create<IHudStore>()((set) => ({
  hitMarker: 0,
  killMarker: 0,
  damageFlash: 0,
  isReloading: false,
  showHitMarker: (kill = false) =>
    set((s) => (kill ? { killMarker: s.killMarker + 1 } : { hitMarker: s.hitMarker + 1 })),
  showDamage: () => set((s) => ({ damageFlash: s.damageFlash + 1 })),
  setReloading: (value) => set(() => ({ isReloading: value })),
}));
