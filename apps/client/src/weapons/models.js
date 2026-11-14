import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The guns that aren't the AK (and the AK's scope, and the medkit), built from simple shapes in code like the
// block maps: nothing to download, and they drop into the AK's arm rig so they get its animations.
//
// Model frame: metres; +x right, +y up, -z forward (towards the muzzle). The origin is on the bore line above
// the middle of the magazine well, which is where the AK's magazine sits in the rig: a gun whose magazine is
// there reloads with the AK's hands. The AK's pistol grip is at z 0.12 to 0.19, from y -0.045 down to
// -0.145; its handguard (the left hand) at z -0.1 to -0.23.
//
// Each builder returns { group, mag?, bolt?, sight, muzzle, dot? }: the meshes, the parts that follow the
// rig's magazine and bolt bones, the sight line ({ eye, forward }: where the eye goes to aim), the muzzle
// (for the flash), and a reflex sight's dot (shown only while aiming).

let materials = null;

// Fine grain, so flat colours don't look like plastic.
function grainTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = Math.floor(170 + rand() * 85);
    ctx.fillStyle = `rgb(${v} ${v} ${v})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1 + Math.floor(rand() * 2), 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// The medkit's face: a white cross on red.
function crossTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b8231c';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(size * 0.4, size * 0.18, size * 0.2, size * 0.64);
  ctx.fillRect(size * 0.18, size * 0.4, size * 0.64, size * 0.2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getMaterials() {
  if (materials) return materials;
  const grain = grainTexture();
  const standard = (color, roughness, metalness, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, map: grain, roughnessMap: grain, ...extra });
  materials = {
    polymer: standard('#2b2d2f', 0.78, 0.05),
    steel: standard('#3d4145', 0.42, 0.75),
    anodized: standard('#1e1f21', 0.4, 0.55),
    dark: standard('#0d0d0e', 0.6, 0.3),
    glass: new THREE.MeshStandardMaterial({ color: '#16304a', roughness: 0.05, metalness: 0.9 }),
    reflex: new THREE.MeshStandardMaterial({
      color: '#9fd6ff',
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff2a1a', toneMapped: false }),
    fabric: standard('#a8241d', 0.95, 0),
    strap: standard('#1b1c1d', 0.9, 0),
    cross: new THREE.MeshStandardMaterial({ map: crossTexture(), roughness: 0.9 }),
  };
  return materials;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

// Shapes. Cylinders run along z.
const box = (w, h, d, r = 0.002) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const cyl = (r, length, segments = 18) => new THREE.CylinderGeometry(r, r, length, segments).rotateX(Math.PI / 2);
// A tapered cylinder: radius `front` at its -z end, `back` at its +z end.
const taper = (front, back, length, segments = 24) =>
  new THREE.CylinderGeometry(back, front, length, segments).rotateX(Math.PI / 2);
const ring = (r, tube, segments = 24) => new THREE.TorusGeometry(r, tube, 8, segments);

/** Collects shapes by material and merges them: one mesh (one draw call) per material. */
class Parts {
  constructor() {
    this.lists = new Map();
  }

  add(material, geometry, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), ONE));
    if (!this.lists.has(material)) this.lists.set(material, []);
    this.lists.get(material).push(g);
    return this;
  }

  build(name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, list] of this.lists) {
      const mesh = new THREE.Mesh(mergeGeometries(list), material);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

// Ribs along z, for rails and serrations.
function ribs(parts, material, { x = 0, y, z0, z1, w, h, step, d = step / 2 }) {
  for (let z = z0; z >= z1; z -= step) parts.add(material, box(w, h, d, 0.0005), [x, y, z]);
}

/** A compact SMG with a straight magazine and a reflex sight. */
export function buildSmg() {
  const m = getMaterials();
  const p = new Parts();

  // Upper receiver, rail on top, handguard with vents, barrel and muzzle brake.
  p.add(m.steel, box(0.046, 0.056, 0.29, 0.006), [0, 0.003, 0.02]);
  p.add(m.anodized, box(0.02, 0.008, 0.3, 0.001), [0, 0.034, -0.04]);
  ribs(p, m.anodized, { y: 0.039, z0: 0.1, z1: -0.18, w: 0.021, h: 0.003, step: 0.008 });
  p.add(m.polymer, box(0.054, 0.058, 0.17, 0.008), [0, -0.004, -0.17]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) p.add(m.dark, box(0.004, 0.012, 0.026, 0.002), [side * 0.0262, 0.002, -0.11 - i * 0.034]);
  }
  p.add(m.steel, cyl(0.0085, 0.08), [0, 0, -0.29]);
  p.add(m.anodized, cyl(0.0135, 0.05, 20), [0, 0, -0.335]);
  for (let i = 0; i < 3; i++) p.add(m.dark, box(0.03, 0.004, 0.006, 0.001), [0, 0.0118, -0.322 - i * 0.012]);

  // Lower: magazine well, trigger guard, trigger, pistol grip (where the AK's is).
  p.add(m.polymer, box(0.044, 0.03, 0.22, 0.005), [0, -0.036, 0.06]);
  p.add(m.polymer, box(0.036, 0.034, 0.05, 0.004), [0, -0.058, 0]);
  p.add(m.polymer, box(0.012, 0.006, 0.075, 0.002), [0, -0.077, 0.075]);
  p.add(m.polymer, box(0.012, 0.03, 0.007, 0.002), [0, -0.064, 0.038]);
  p.add(m.steel, box(0.006, 0.026, 0.006, 0.002), [0, -0.058, 0.085], [-0.25, 0, 0]);
  p.add(m.polymer, box(0.026, 0.11, 0.046, 0.009), [0, -0.098, 0.155], [-0.1, 0, 0]);
  ribs(p, m.dark, { x: 0, y: -0.1, z0: 0.18, z1: 0.18, w: 0.027, h: 0.07, step: 1, d: 0.004 });

  // Stock: a tube back to a butt pad (mostly behind the camera).
  p.add(m.steel, cyl(0.013, 0.24), [0, -0.004, 0.28]);
  p.add(m.polymer, box(0.04, 0.1, 0.05, 0.01), [0, -0.03, 0.41]);

  // Reflex sight: a base, a hood, the glass and its dot.
  const rz = -0.07; // the sight's middle
  p.add(m.anodized, box(0.026, 0.01, 0.045, 0.002), [0, 0.043, rz]);
  for (const side of [-1, 1]) p.add(m.anodized, box(0.004, 0.028, 0.032, 0.0012), [side * 0.0135, 0.06, rz]);
  p.add(m.anodized, box(0.031, 0.005, 0.032, 0.0015), [0, 0.0765, rz]);
  const group = p.build('smg');

  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.023, 0.026), m.reflex);
  lens.position.set(0, 0.061, rz - 0.008);
  group.add(lens);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 12), m.dot);
  dot.position.set(0, 0.061, rz - 0.0078);
  group.add(dot);

  // A slightly curved box magazine, and the charging knob on the right that the bolt bone pulls back.
  const mag = new Parts()
    .add(m.polymer, box(0.024, 0.13, 0.036, 0.004), [0, -0.09, 0])
    .add(m.polymer, box(0.024, 0.09, 0.036, 0.004), [0, -0.19, -0.006], [0.12, 0, 0])
    .add(m.anodized, box(0.028, 0.01, 0.042, 0.003), [0, -0.236, -0.009], [0.12, 0, 0])
    .build('smg-mag');
  const bolt = new Parts().add(m.steel, box(0.014, 0.01, 0.012, 0.003), [0.03, 0.014, -0.075]).build('smg-bolt');

  return {
    group,
    mag,
    bolt,
    dot,
    sight: { eye: new THREE.Vector3(0, 0.061, 0.16), forward: new THREE.Vector3(0, 0, -1) },
    muzzle: new THREE.Vector3(0, 0, -0.37),
  };
}

/** A polymer-frame pistol, its grip where the AK's is. */
export function buildPistol() {
  const m = getMaterials();
  const p = new Parts();
  const grip = 0.152; // z of the grip's middle, at its top

  // Slide with serrations and sights, barrel peeking out at the front.
  p.add(m.steel, box(0.026, 0.03, 0.19, 0.004), [0, -0.012, grip - 0.075]);
  for (let i = 0; i < 7; i++) p.add(m.dark, box(0.0275, 0.018, 0.0022, 0.0005), [0, -0.012, grip + 0.012 - i * 0.0055]);
  p.add(m.steel, cyl(0.0058, 0.012), [0, -0.012, grip - 0.172]);
  p.add(m.dark, cyl(0.0042, 0.0125), [0, -0.012, grip - 0.172]);
  p.add(m.anodized, box(0.02, 0.007, 0.01, 0.0015), [0, 0.0055, grip + 0.008]);
  p.add(m.dark, box(0.004, 0.005, 0.0105, 0.0005), [0, 0.0075, grip + 0.008]);
  p.add(m.anodized, box(0.0035, 0.007, 0.006, 0.001), [0, 0.0055, grip - 0.158]);
  // Frame: dust cover, trigger guard, trigger, grip with its magazine base.
  p.add(m.polymer, box(0.024, 0.018, 0.15, 0.004), [0, -0.034, grip - 0.07]);
  p.add(m.polymer, box(0.01, 0.006, 0.06, 0.002), [0, -0.058, grip - 0.06]);
  p.add(m.polymer, box(0.01, 0.026, 0.006, 0.002), [0, -0.047, grip - 0.088]);
  p.add(m.steel, box(0.005, 0.02, 0.005, 0.0015), [0, -0.048, grip - 0.045], [-0.2, 0, 0]);
  p.add(m.polymer, box(0.028, 0.105, 0.044, 0.008), [0, -0.09, grip + 0.006], [-0.3, 0, 0]);
  p.add(m.anodized, box(0.03, 0.008, 0.046, 0.003), [0, -0.143, grip + 0.023], [-0.3, 0, 0]);
  const group = p.build('pistol');

  return {
    group,
    sight: { eye: new THREE.Vector3(0, 0.0072, grip + 0.17), forward: new THREE.Vector3(0, 0, -1) },
    muzzle: new THREE.Vector3(0, -0.012, grip - 0.18),
  };
}

/** A rifle scope on a rail mount, sized for the AK (its dust cover tops out at y 0.04). */
export function buildScope() {
  const m = getMaterials();
  const p = new Parts();
  const y = 0.078; // the scope's axis
  const z = -0.09; // its middle

  p.add(m.anodized, cyl(0.0125, 0.16, 24), [0, y, z]);
  p.add(m.anodized, taper(0.022, 0.0125, 0.05), [0, y, z - 0.105]);
  p.add(m.anodized, cyl(0.022, 0.04, 28), [0, y, z - 0.15]);
  p.add(m.anodized, taper(0.0125, 0.0155, 0.035), [0, y, z + 0.097]);
  p.add(m.anodized, cyl(0.0155, 0.04, 24), [0, y, z + 0.134]);
  for (const dz of [0, 0.02]) p.add(m.dark, ring(0.0157, 0.001), [0, y, z + 0.124 + dz]);
  // Turrets on top and right, rings and a base clamped to the receiver.
  p.add(m.anodized, new THREE.CylinderGeometry(0.008, 0.0085, 0.018, 18), [0, y + 0.0175, z + 0.005]);
  p.add(m.dark, ring(0.0082, 0.0008), [0, y + 0.024, z + 0.005], [Math.PI / 2, 0, 0]);
  p.add(m.anodized, new THREE.CylinderGeometry(0.008, 0.0085, 0.018, 18), [0.0175, y, z + 0.005], [0, 0, -Math.PI / 2]);
  for (const dz of [-0.055, 0.06]) {
    p.add(m.steel, ring(0.0135, 0.003), [0, y, z + dz]);
    p.add(m.steel, box(0.02, 0.026, 0.012, 0.002), [0, y - 0.02, z + dz]);
  }
  p.add(m.steel, box(0.028, 0.01, 0.17, 0.002), [0, 0.046, z]);
  const group = p.build('scope');

  for (const [dz, r] of [[-0.1705, 0.0195], [0.1545, 0.0135]]) {
    const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 28), m.glass);
    lens.position.set(0, y, z + dz);
    if (dz < 0) lens.rotation.y = Math.PI;
    group.add(lens);
  }

  return {
    group,
    sight: { eye: new THREE.Vector3(0, y, z + 0.24), forward: new THREE.Vector3(0, 0, -1) },
  };
}

/** The medkit: a red pouch with a white cross, held in the right hand. */
export function buildMedkit() {
  const m = getMaterials();
  const p = new Parts();
  p.add(m.fabric, box(0.06, 0.11, 0.15, 0.015), [0, -0.04, 0.08]);
  p.add(m.strap, box(0.064, 0.02, 0.154, 0.006), [0, 0.0, 0.08]);
  p.add(m.strap, box(0.062, 0.114, 0.012, 0.004), [0, -0.04, 0.03]);
  const group = p.build('medkit');
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075), m.cross);
    face.position.set(side * 0.0306, -0.045, 0.1);
    face.rotation.y = (side * Math.PI) / 2;
    group.add(face);
  }
  return { group };
}

// Third-person copies for other players' soldiers (game/soldier.js holds them like rifle_tp.glb): muzzle
// along +z, origin at the pistol grip. Built once, then cloned (clones share geometry and materials).
const THIRD_PERSON_ORIGIN = new THREE.Vector3(0, -0.06, 0.15);
const BUILDERS = { smg: buildSmg, pistol: buildPistol, scope: buildScope };
const thirdPersonModels = {};

/** A third-person `id` ('smg', 'pistol' or 'scope', the scope placed for the AK). */
export function thirdPersonModel(id) {
  if (!thirdPersonModels[id]) {
    const built = BUILDERS[id]();
    const inner = built.group;
    if (built.mag) inner.add(built.mag);
    if (built.bolt) inner.add(built.bolt);
    if (built.dot) built.dot.visible = false;
    inner.position.copy(THIRD_PERSON_ORIGIN).negate();
    const outer = new THREE.Group();
    outer.rotation.y = Math.PI;
    outer.add(inner);
    thirdPersonModels[id] = outer;
  }
  return thirdPersonModels[id].clone(true);
}

/** A model-frame point in the third-person frame. */
export const toThirdPerson = (p) => new THREE.Vector3(-p.x, p.y - THIRD_PERSON_ORIGIN.y, -(p.z - THIRD_PERSON_ORIGIN.z));
