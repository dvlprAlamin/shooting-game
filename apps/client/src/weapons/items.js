import { WEAPONS } from '@rimfire/shared/weapons';

// What the client shows and plays for each gun, on top of the shared rules in @rimfire/shared/weapons.
// Every gun fires the AK recording: `detune` (cents) and `volume` set how it sounds, near and far.
export const SOUNDS = {
  rifle: { detune: 0, volume: 0.55 },
  smg: { detune: 330, volume: 0.42 },
  marksman: { detune: -420, volume: 0.8 },
  pistol: { detune: 560, volume: 0.45 },
};

// The slot bar: the guns in their key order, then the medkit.
export const SLOTS = [...WEAPONS.map((w) => ({ id: w.id, name: w.name })), { id: 'medkit', name: 'Medkit' }];

// Guns whose sights don't line up when aiming, so the crosshair stays.
export const KEEPS_CROSSHAIR = new Set(['pistol']);
