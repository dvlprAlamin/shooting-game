import * as THREE from 'three';
import shotUrl from '@/assets/sounds/single-shoot-ak47.mp3';
import dryFireUrl from '@/assets/sounds/shoot-without-bullet.mp3';
import reloadUrl from '@/assets/sounds/ak47-reload-sound.mp3';
import damageUrl from '@/assets/sounds/damage-sound-male.mp3';
import deathUrl from '@/assets/sounds/death-sound-male.mp3';

// Small Web Audio wrapper. Buffers are decoded once up front, so playing a sound never
// suspends a React tree (the old <PositionalAudio url={...}> swap did, flashing "Loading...").

const URLS = {
  shot: shotUrl,
  dryFire: dryFireUrl,
  reload: reloadUrl,
  damage: damageUrl,
  death: deathUrl,
};

let listener = null;
const buffers = {};

export function initAudio(camera) {
  if (!listener) {
    listener = new THREE.AudioListener();
    const loader = new THREE.AudioLoader();
    for (const [name, url] of Object.entries(URLS)) {
      loader.load(url, (buffer) => (buffers[name] = buffer));
    }
  }
  if (listener.parent !== camera) camera.add(listener);
  return listener;
}

// Browsers keep the AudioContext suspended until a user gesture.
export function resumeAudio() {
  const ctx = listener?.context;
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function source(name, { volume = 1, detune = 0 }) {
  const buffer = buffers[name];
  if (!listener || !buffer) return null;
  const ctx = listener.context;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.detune.value = detune;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain);
  return { ctx, src, gain };
}

/** Non-positional sound (local player's own weapon, damage). */
export function playSound(name, opts = {}) {
  const s = source(name, opts);
  if (!s) return;
  s.gain.connect(listener.getInput());
  s.src.start();
}

/** 3D sound at a world position (remote gunshots). */
export function playSoundAt(name, position, opts = {}) {
  const s = source(name, opts);
  if (!s) return;
  const panner = s.ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 4;
  panner.maxDistance = 250;
  panner.rolloffFactor = 1.1;
  if (panner.positionX) {
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
  } else {
    panner.setPosition(position.x, position.y, position.z);
  }
  s.gain.connect(panner).connect(listener.getInput());
  s.src.start();
}

/** Short synthesized tick for hit markers (no asset needed). */
export function playHitTick() {
  if (!listener) return;
  const ctx = listener.context;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 1800;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
  osc.connect(gain).connect(listener.getInput());
  osc.start();
  osc.stop(ctx.currentTime + 0.07);
}
