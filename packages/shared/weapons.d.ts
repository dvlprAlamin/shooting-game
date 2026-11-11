// Types for weapons.js. Keep in step with weapons.js.
export interface Weapon {
  id: string;
  name: string;
  damage: number;
  headDamage: number;
  /** [from, to, least]: full damage up to `from` m, `least` times that from `to` m on. */
  falloff: [number, number, number] | null;
  fireInterval: number;
  auto: boolean;
  magSize: number;
  reloadTime: number;
  reloadEmptyTime: number;
  drawTime: number;
  spread: { stand: number; move: number; air: number; aim: number };
  recoil: { kick: number; kickRandom: number; yaw: number };
  speed: number;
  aimFov: number;
  scope?: boolean;
}

export declare const WEAPONS: Weapon[];
export declare const DEFAULT_WEAPON: string;
export declare function findWeapon(id: unknown): Weapon | undefined;
export declare function getWeapon(id: unknown): Weapon;
export declare function damageAt(weapon: Weapon, distance: number, head?: boolean): number;
export declare const MEDKIT: { heal: number; useTime: number; perLife: number };
