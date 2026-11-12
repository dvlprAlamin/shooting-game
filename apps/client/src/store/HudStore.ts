import { create } from 'zustand';

// One-shot HUD feedback. Components key their CSS animations on the counters, so the
// store only changes on events, never per frame.
export type MarkerKind = 'hit' | 'head' | 'kill';

export interface ICallout {
  n: number;
  title: string;
  detail?: string;
}

export interface IHudStore {
  marker: { n: number; kind: MarkerKind };
  damageFlash: number;
  isReloading: boolean;
  /** How long the current reload takes (ms), for the bar under the crosshair. */
  reloadTime: number;
  /** Aiming through the marksman rifle's scope: the scope view replaces the gun. */
  scoped: boolean;
  /** performance.now() time your spawn protection runs out; 0 when you have none. */
  protectedUntil: number;
  /** Big text over the crosshair for your own streaks and headshot kills. */
  callout: ICallout | null;
  /**
   * You moved, aimed, fired or looked around since you last spawned. Respawn comes on its own after a death only
   * then: someone who did none of that may have put the game down.
   */
  activeThisLife: boolean;
  showHitMarker: (kind?: MarkerKind) => void;
  showDamage: () => void;
  setReloading: (value: boolean, time?: number) => void;
  setScoped: (value: boolean) => void;
  /** `ms` of protection left, as the server says; 0 ends it. */
  setProtection: (ms: number) => void;
  showCallout: (title: string, detail?: string) => void;
  setActiveThisLife: (value: boolean) => void;
}

export const useHudStore = create<IHudStore>()((set) => ({
  marker: { n: 0, kind: 'hit' },
  damageFlash: 0,
  isReloading: false,
  reloadTime: 0,
  scoped: false,
  protectedUntil: 0,
  callout: null,
  activeThisLife: false,
  showHitMarker: (kind = 'hit') => set((s) => ({ marker: { n: s.marker.n + 1, kind } })),
  showDamage: () => set((s) => ({ damageFlash: s.damageFlash + 1 })),
  setReloading: (value, time = 0) => set(() => ({ isReloading: value, reloadTime: time })),
  setScoped: (value) => set(() => ({ scoped: value })),
  setProtection: (ms) => set(() => ({ protectedUntil: ms > 0 ? performance.now() + ms : 0 })),
  showCallout: (title, detail) => set((s) => ({ callout: { n: (s.callout?.n ?? 0) + 1, title, detail } })),
  setActiveThisLife: (value) => set(() => ({ activeThisLife: value })),
}));
