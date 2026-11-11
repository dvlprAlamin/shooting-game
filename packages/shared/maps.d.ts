// Types for maps/index.js. Keep in step with maps/build.js.
export type Vec3 = [number, number, number];

/** A solid box: centre, full size, optional rotation (quaternion x, y, z, w), material and colour. */
export interface MapBox {
  c: Vec3;
  s: Vec3;
  q?: [number, number, number, number];
  m: string;
  tint?: string;
}

/** Capsule centre. `yaw` is the way to face; without it you keep facing the way you were. */
export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw?: number;
}

export interface GameMap {
  id: string;
  name: string;
  blurb: string;
  /** Block maps: half the width of the square they fill, for drawing their plan. */
  bounds?: number;
  /** Maps modelled in Blender instead of built from boxes. */
  glb?: { physics: string; visual: string; position: Vec3; scale: number };
  boxes: MapBox[];
  spawns: SpawnPoint[];
  /** Below `y` you've fallen out of the map: you're put back at `reset`, or the first spawn point. */
  fall: { y: number; reset?: { x: number; y: number; z: number } };
  light: {
    sun: Vec3;
    sunIntensity: number;
    ambient: number;
    hemisphere?: { sky: string; ground: string; intensity: number };
  };
}

export declare const MAPS: GameMap[];
export declare const DEFAULT_MAP: string;
export declare function getMap(id: unknown): GameMap;
