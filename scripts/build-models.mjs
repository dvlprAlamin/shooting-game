/**
 * Builds the optimized runtime models in public/models from the source GLBs in assets-src/.
 *
 *   fps_ak.glb  -> public/models/viewmodel_ak.glb  (first-person arms + AK-74M, 7 animation clips)
 *   person.glb  -> public/models/soldier.glb       (auto-rigged remote player model)
 *   weapon.glb  -> public/models/weapon_tp.glb     (single-mesh rifle held by remote players)
 *
 * Requirements (install anywhere, e.g. a temp folder):
 *   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp draco3dgltf three
 * Usage:
 *   node scripts/build-models.mjs <srcDir> <outDir> <publicDir>
 */
import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  resample,
  meshopt,
  textureCompress,
  weld,
  simplify,
  transformMesh,
  joinPrimitives,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';

const [srcDir = 'assets-src', outDir = 'public/models', publicDir = 'public'] = process.argv.slice(2);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const webp = (slots, quality, resize) =>
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots, quality, resize });

// ---------------------------------------------------------------------------
// First-person viewmodel (arms + AK)
// ---------------------------------------------------------------------------
async function buildViewModel() {
  const doc = await io.read(path.join(srcDir, 'fps_ak.glb'));
  const root = doc.getRoot();

  const clipNames = {
    'Rig|AK_Idle': 'Idle',
    'Rig|AK_Draw': 'Draw',
    'Rig|AK_Walk': 'Walk',
    'Rig|AK_Run': 'Run',
    'Rig|AK_Shot': 'Shot',
    'Rig|AK_Reload': 'Reload',
    'Rig|AK_Reload_full': 'ReloadEmpty',
  };
  for (const anim of root.listAnimations()) {
    const name = clipNames[anim.getName()];
    if (name) anim.setName(name);
    else anim.dispose(); // AK_Reload_var2 is unused
  }

  // Specular extension only adds a subtle tint and an extra 1k texture.
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_materials_specular') ext.dispose();
  }

  // Every material samples TEXCOORD_0; the extra UV sets and tangents are dead weight
  // (three.js derives the tangent frame in the shader when TANGENT is absent).
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of ['TEXCOORD_1', 'TEXCOORD_2', 'TANGENT']) {
        const attr = prim.getAttribute(semantic);
        if (attr) {
          prim.setAttribute(semantic, null);
          if (attr.listParents().length === 1) attr.dispose();
        }
      }
    }
  }

  await doc.transform(
    prune({ keepLeaves: false }),
    dedup(),
    resample(),
    webp(/^(baseColor|metallicRoughness|occlusion)/, 82),
    webp(/^normal/, 90),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(outDir, 'viewmodel_ak.glb'), doc);
}

// ---------------------------------------------------------------------------
// Remote player model: bake to meters, merge, simplify, auto-rig
// ---------------------------------------------------------------------------

// Joint layout (meters, model faces +Z, character's left side is +X).
// Measured from person.glb; see the analysis printout when running with DEBUG=1.
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function computeLandmarks(pos) {
  const n = pos.length / 3;
  // Bounding-box centre of the vertices matching `pred` (robust to uneven vertex density).
  const slice = (pred) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let c = 0;
    for (let i = 0; i < n; i++) {
      const v = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      if (!pred(...v)) continue;
      c++;
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    }
    if (!c) return null;
    return { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2, c, maxAbsX: Math.max(Math.abs(min[0]), Math.abs(max[0])) };
  };
  const armAt = (ax) => slice((x, y) => x > ax - 0.02 && x < ax + 0.02 && y > 1.2);
  const legAt = (yy) => slice((x, y) => x > 0.005 && x < 0.2 && y > yy - 0.02 && y < yy + 0.02);
  const torsoAt = (yy) => slice((x, y) => Math.abs(x) < 0.12 && y > yy - 0.02 && y < yy + 0.02);
  return { armAt, legAt, torsoAt };
}

async function buildSoldier() {
  const doc = await io.read(path.join(srcDir, 'person.glb'));
  const root = doc.getRoot();
  const scene = root.listScenes()[0];

  // Replace the (no longer supported by three.js) spec/gloss material with metal/rough.
  // The source has glossinessFactor 0, i.e. it is a fully rough dielectric.
  const srcMat = root.listMaterials()[0];
  const sg = srcMat.getExtension('KHR_materials_pbrSpecularGlossiness');
  const diffuseTex = sg.getDiffuseTexture();
  const mat = doc
    .createMaterial('soldier')
    .setBaseColorTexture(diffuseTex)
    .setNormalTexture(srcMat.getNormalTexture())
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(false);

  // Bake every node transform into the geometry, in meters.
  const prims = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    m.premultiply(new THREE.Matrix4().makeScale(0.01, 0.01, 0.01));
    transformMesh(mesh, m.toArray());
    for (const p of mesh.listPrimitives()) prims.push(p);
  }
  const joined = joinPrimitives(prims);
  joined.setMaterial(mat);

  for (const node of root.listNodes()) node.dispose();
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_materials_pbrSpecularGlossiness') ext.dispose();
  }
  srcMat.dispose();

  const mesh = doc.createMesh('soldier').addPrimitive(joined);
  for (const semantic of ['TANGENT']) {
    const a = joined.getAttribute(semantic);
    if (a) joined.setAttribute(semantic, null);
  }

  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.55, error: 0.0008, lockBorder: true }),
  );

  // Ground the feet at y = 0.
  const posAttr = joined.getAttribute('POSITION');
  const pos = posAttr.getArray();
  let minY = Infinity;
  for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i]);
  for (let i = 1; i < pos.length; i += 3) pos[i] -= minY;
  posAttr.setArray(pos);

  const L = computeLandmarks(pos);
  if (process.env.DEBUG) {
    for (const ax of [0.15, 0.2, 0.25, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9]) console.log('arm', ax, L.armAt(ax));
    for (const yy of [0.05, 0.1, 0.3, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95]) console.log('leg', yy, L.legAt(yy));
    for (const yy of [0.95, 1.1, 1.3, 1.45, 1.5, 1.55, 1.6, 1.7]) console.log('torso', yy, L.torsoAt(yy));
  }

  // --- skeleton ---------------------------------------------------------
  const arm = (ax) => L.armAt(ax);
  const leg = (yy) => L.legAt(yy);
  const tor = (yy) => L.torsoAt(yy);
  const J = {}; // world positions
  J.Hips = [0, 0.95, tor(0.95).z];
  J.Spine = [0, 1.12, tor(1.1).z];
  J.Chest = [0, 1.32, tor(1.3).z];
  J.Neck = [0, 1.52, tor(1.52).z];
  J.Head = [0, 1.62, tor(1.62).z];
  const shoulderX = 0.18, elbowX = 0.46, wristX = 0.71;
  const sh = arm(0.22), el = arm(elbowX), wr = arm(wristX);
  const knee = leg(0.5), ank = leg(0.1), thighTop = leg(0.8);
  const hipX = thighTop.x, kneeY = 0.5, ankleY = 0.09;
  for (const [side, s] of [['L', 1], ['R', -1]]) {
    J[`${side}_UpperArm`] = [s * shoulderX, sh.y, sh.z];
    J[`${side}_Forearm`] = [s * elbowX, el.y, el.z];
    J[`${side}_Hand`] = [s * wristX, wr.y, wr.z];
    J[`${side}_Thigh`] = [s * hipX, 0.9, thighTop.z];
    J[`${side}_Shin`] = [s * knee.x, kneeY, knee.z];
    J[`${side}_Foot`] = [s * ank.x, ankleY, ank.z];
  }
  const parents = {
    Hips: null, Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck',
    L_UpperArm: 'Chest', L_Forearm: 'L_UpperArm', L_Hand: 'L_Forearm',
    R_UpperArm: 'Chest', R_Forearm: 'R_UpperArm', R_Hand: 'R_Forearm',
    L_Thigh: 'Hips', L_Shin: 'L_Thigh', L_Foot: 'L_Shin',
    R_Thigh: 'Hips', R_Shin: 'R_Thigh', R_Foot: 'R_Shin',
  };
  const names = Object.keys(parents);
  const index = Object.fromEntries(names.map((n, i) => [n, i]));

  // --- weights (region based, smooth blends across joints) --------------
  const n = pos.length / 3;
  const joints = new Uint8Array(n * 4);
  const weights = new Float32Array(n * 4);
  const spineChain = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'];
  const spineY = spineChain.map((b) => J[b][1]);

  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1];
    const ax = Math.abs(x);
    const side = x >= 0 ? 'L' : 'R';
    const w = {};
    const add = (b, v) => { if (v > 1e-4) w[b] = (w[b] || 0) + v; };

    const armW = smoothstep(0.14, 0.26, ax) * smoothstep(1.16, 1.27, y);
    const centerFade = 1 - smoothstep(0.7, 0.82, y) * (1 - smoothstep(0.0, 0.06, ax));
    const legW = (1 - armW) * (1 - smoothstep(0.78, 0.98, y)) * centerFade;
    const torsoW = 1 - armW - legW;

    if (armW > 0) {
      const fore = smoothstep(elbowX - 0.04, elbowX + 0.04, ax);
      const hand = smoothstep(wristX - 0.03, wristX + 0.02, ax);
      add(`${side}_UpperArm`, armW * (1 - fore));
      add(`${side}_Forearm`, armW * fore * (1 - hand));
      add(`${side}_Hand`, armW * hand);
    }
    if (legW > 0) {
      const shin = 1 - smoothstep(kneeY - 0.06, kneeY + 0.06, y);
      const foot = 1 - smoothstep(ankleY - 0.01, ankleY + 0.05, y);
      add(`${side}_Thigh`, legW * (1 - shin));
      add(`${side}_Shin`, legW * shin * (1 - foot));
      add(`${side}_Foot`, legW * foot);
    }
    if (torsoW > 0) {
      // Hat functions over the spine chain by height.
      if (y <= spineY[0]) add('Hips', torsoW);
      else if (y >= spineY[spineY.length - 1]) add('Head', torsoW);
      else {
        for (let k = 0; k < spineY.length - 1; k++) {
          if (y >= spineY[k] && y < spineY[k + 1]) {
            const t = smoothstep(spineY[k], spineY[k + 1], y);
            add(spineChain[k], torsoW * (1 - t));
            add(spineChain[k + 1], torsoW * t);
          }
        }
      }
    }
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, v]) => s + v, 0) || 1;
    top.forEach(([b, v], k) => {
      joints[i * 4 + k] = index[b];
      weights[i * 4 + k] = v / sum;
    });
    if (!top.length) { joints[i * 4] = index.Hips; weights[i * 4] = 1; }
  }

  const buffer = root.listBuffers()[0];
  joined.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
  joined.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));

  // Bones: identity rotations, translations relative to parent.
  const nodes = {};
  for (const name of names) {
    const p = parents[name];
    const t = p ? J[name].map((v, k) => v - J[p][k]) : J[name];
    nodes[name] = doc.createNode(name).setTranslation(t);
  }
  for (const name of names) if (parents[name]) nodes[parents[name]].addChild(nodes[name]);

  const ibm = new Float32Array(names.length * 16);
  names.forEach((name, k) => {
    new THREE.Matrix4().makeTranslation(-J[name][0], -J[name][1], -J[name][2]).toArray(ibm, k * 16);
  });
  const skin = doc
    .createSkin('soldier')
    .setSkeleton(nodes.Hips)
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
  names.forEach((name) => skin.addJoint(nodes[name]));

  const armature = doc.createNode('Soldier').addChild(nodes.Hips);
  const meshNode = doc.createNode('SoldierMesh').setMesh(mesh).setSkin(skin);
  armature.addChild(meshNode);
  scene.addChild(armature);

  await doc.transform(
    prune(),
    dedup(),
    webp(/^baseColor/, 82, [1024, 1024]),
    webp(/^normal/, 85, [512, 512]),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(outDir, 'soldier.glb'), doc);
}

// ---------------------------------------------------------------------------
// Third-person rifle carried by remote players: one mesh, meters, muzzle +Z,
// origin at the pistol grip (see GUN_* constants in src/game/soldierRig.js).
// ---------------------------------------------------------------------------
async function buildThirdPersonWeapon() {
  const doc = await io.read(path.join(publicDir, 'weapon.glb'));
  const root = doc.getRoot();
  const SCALE = 0.17;
  const GRIP = [0, -0.3, 0.49]; // source units
  const prims = [];
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    m.premultiply(new THREE.Matrix4().makeTranslation(-GRIP[0], -GRIP[1], -GRIP[2]))
      .premultiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE))
      .premultiply(new THREE.Matrix4().makeRotationY(Math.PI));
    transformMesh(mesh, m.toArray());
    for (const p of mesh.listPrimitives()) prims.push(p);
  }
  const material = prims[0].getMaterial();
  const joined = joinPrimitives(prims);
  joined.setMaterial(material);
  for (const node of root.listNodes()) node.dispose();
  for (const mesh of root.listMeshes()) mesh.dispose();
  const mesh = doc.createMesh('rifle').addPrimitive(joined);
  root.listScenes()[0].addChild(doc.createNode('Rifle').setMesh(mesh));
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
  }
  await doc.transform(
    prune(),
    dedup(),
    weld(),
    webp(/^baseColor/, 82, [512, 512]),
    webp(/^(normal|metallicRoughness|occlusion)/, 85, [512, 512]),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(outDir, 'weapon_tp.glb'), doc);
}

const which = process.env.ONLY;
if (!which || which === 'ak') await buildViewModel();
if (!which || which === 'soldier') await buildSoldier();
if (!which || which === 'weapon') await buildThirdPersonWeapon();
console.log('done');
