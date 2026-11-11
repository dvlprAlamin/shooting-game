import { create } from 'zustand';
import { DEFAULT_WEAPON, MEDKIT, WEAPONS, getWeapon } from '@rimfire/shared/weapons';

const fullMagazines = () => Object.fromEntries(WEAPONS.map((w) => [w.id, w.magSize]));

// Your guns: which one is in hand, what's left in each magazine, and your medkit. Changes on events only
// (a shot, a switch, a reload), never per frame. The server keeps its own count and has the last word.
export interface IWeaponStore {
  weapon: string;
  rounds: Record<string, number>;
  medkits: number;
  /** The medkit is in use. */
  healing: boolean;
  setWeapon: (id: string) => void;
  /** One round from the gun in hand. */
  useRound: () => void;
  /** The gun in hand's magazine is full again. */
  refill: () => void;
  /** A new life: full magazines and a medkit. The gun in hand stays. */
  rearm: () => void;
  setHealing: (value: boolean) => void;
  useMedkit: () => void;
}

export const useWeaponStore = create<IWeaponStore>()((set) => ({
  weapon: DEFAULT_WEAPON,
  rounds: fullMagazines(),
  medkits: MEDKIT.perLife,
  healing: false,
  setWeapon: (id) => set(() => ({ weapon: getWeapon(id).id })),
  useRound: () => set((s) => ({ rounds: { ...s.rounds, [s.weapon]: Math.max(0, s.rounds[s.weapon] - 1) } })),
  refill: () => set((s) => ({ rounds: { ...s.rounds, [s.weapon]: getWeapon(s.weapon).magSize } })),
  rearm: () => set(() => ({ rounds: fullMagazines(), medkits: MEDKIT.perLife, healing: false })),
  setHealing: (value) => set(() => ({ healing: value })),
  useMedkit: () => set((s) => ({ medkits: Math.max(0, s.medkits - 1), healing: true })),
}));
