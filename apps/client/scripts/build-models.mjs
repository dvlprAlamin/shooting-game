/**
 * Builds the optimized runtime models in public/models from the source GLBs in assets-src/.
 *
 *   fps_ak.glb  -> public/models/viewmodel_ak.glb  (first-person arms + AK-74M, 7 animation clips)
 *   ONLY=rifle: public/models/viewmodel_ak.glb's AK -> public/models/rifle_tp.glb (the rifle other players hold)
 *   ONLY=characters: the Mixamo soldiers, from scripts/build-characters.py's output (see buildCharacters)
 *
 * Requirements (install anywhere, e.g. a temp folder):
 *   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp draco3dgltf three
 * Usage:
 *   node scripts/build-models.mjs <srcDir> <outDir>
 */
import fs from 'fs/promises';
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
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import * as THREE from 'three';

const [srcDir = 'assets-src', outDir = 'public/models'] = process.argv.slice(2);

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
// Third-person rifle carried by other players: the first-person AK (from viewmodel_ak.glb, built above) as one
// static mesh in the third-person gun frame of src/weapons/models.js (metres, muzzle +Z, origin at the pistol
// grip), cut down for distance.
// ---------------------------------------------------------------------------

// From weapons/models.js's model frame to the rig's gun bone (MODEL_TO_BONE in src/ViewModel.jsx).
const MODEL_SCALE = 1.47;
const MODEL_TO_BONE = new THREE.Matrix4().set(
  -MODEL_SCALE, 0, 0, 0,
  0, 0, -MODEL_SCALE, -0.0195,
  0, -MODEL_SCALE, 0, 0.0019,
  0, 0, 0, 1,
);
// From the model frame to the third-person frame (thirdPersonModel / toThirdPerson in weapons/models.js).
const MODEL_TO_THIRD_PERSON = new THREE.Matrix4()
  .makeRotationY(Math.PI)
  .multiply(new THREE.Matrix4().makeTranslation(0, 0.06, -0.15));
const RIFLE_TRIANGLES = 3500; // the first-person AK has about 23,000

async function buildThirdPersonRifle() {
  const doc = await io.read(path.join(outDir, 'viewmodel_ak.glb'));
  const root = doc.getRoot();
  const node = root.listNodes().find((n) => n.getName() === 'Object_97'); // the AK; Object_99 is the spare magazine
  const skin = node.getSkin();
  const gunJoint = skin.listJoints().findIndex((j) => j.getName() === 'PBody_058');
  // Skinned vertices are stored assembled in the bind pose, so the gun bone's inverse bind matrix takes every part
  // (magazine, bolt, trigger, safety too) into the gun bone's space.
  const toGun = new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(gunJoint, []));
  const matrix = MODEL_TO_THIRD_PERSON.clone().multiply(MODEL_TO_BONE.clone().invert()).multiply(toGun);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);

  const source = node.getMesh().listPrimitives()[0];
  const count = source.getAttribute('POSITION').getCount();
  const triangles = source.getIndices().getCount() / 3;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const v = new THREE.Vector3();
  const el = [];
  for (let i = 0; i < count; i++) {
    v.fromArray(source.getAttribute('POSITION').getElement(i, el)).applyMatrix4(matrix).toArray(position, i * 3);
    v.fromArray(source.getAttribute('NORMAL').getElement(i, el)).applyMatrix3(normalMatrix).normalize();
    v.toArray(normal, i * 3);
    uv.set(source.getAttribute('TEXCOORD_0').getElement(i, [0, 0]), i * 2);
  }
  const buffer = root.listBuffers()[0];
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const sourceMaterial = source.getMaterial();
  // No metal/roughness map at this size: a flat, slightly metallic finish.
  const material = doc
    .createMaterial('rifle')
    .setBaseColorTexture(sourceMaterial.getBaseColorTexture())
    .setMetallicFactor(0.35)
    .setRoughnessFactor(0.6);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', position))
    .setAttribute('NORMAL', accessor('VEC3', normal))
    .setAttribute('TEXCOORD_0', accessor('VEC2', uv))
    .setIndices(accessor('SCALAR', new Uint32Array(source.getIndices().getArray())))
    .setMaterial(material);

  for (const n of root.listNodes()) n.dispose();
  for (const m of root.listMeshes()) m.dispose();
  for (const a of root.listAnimations()) {
    // Samplers outlive their animation (and keep their keyframes) unless disposed themselves.
    for (const part of [...a.listChannels(), ...a.listSamplers()]) part.dispose();
    a.dispose();
  }
  for (const s of root.listSkins()) s.dispose();
  root.listScenes()[0].addChild(doc.createNode('Rifle').setMesh(doc.createMesh('rifle').addPrimitive(prim)));

  await doc.transform(
    prune(),
    dedup(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: RIFLE_TRIANGLES / triangles, error: 0.002 }),
    webp(/^baseColor/, 85, [512, 512]),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(outDir, 'rifle_tp.glb'), doc);
}

// ---------------------------------------------------------------------------
// Mixamo soldiers: compresses what scripts/build-characters.py made (run it first; srcDir is its output).
//   soldier_<id>.glb   -> public/models/soldier_<id>.glb  (atlas cut to CHARACTER_CELL px per source material)
//   soldier_clips.glb  -> public/models/soldier_clips.glb (rotations + hips travel only)
//   soldier_clips.json -> src/game/soldierClips.json
// ---------------------------------------------------------------------------
const CHARACTERS = ['ch15', 'ch35'];
const CHARACTER_CELL = 512;

async function buildCharacters() {
  for (const id of CHARACTERS) {
    const doc = await io.read(path.join(srcDir, `soldier_${id}.glb`));
    await doc.transform(
      prune(),
      dedup(),
      webp(/^baseColor/, 85, [CHARACTER_CELL * 4, CHARACTER_CELL]),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await io.write(path.join(outDir, `soldier_${id}.glb`), doc);
  }

  // Bone translations other than the hips' are the source rig's bone lengths, and every scale is 1: the soldiers
  // keep their own proportions if both go.
  const doc = await io.read(path.join(srcDir, 'soldier_clips.glb'));
  for (const anim of doc.getRoot().listAnimations()) {
    for (const channel of anim.listChannels()) {
      const keep =
        channel.getTargetPath() === 'rotation' ||
        (channel.getTargetPath() === 'translation' && channel.getTargetNode().getName() === 'mixamorig:Hips');
      if (keep) continue;
      const sampler = channel.getSampler();
      channel.dispose();
      sampler.dispose(); // prune() keeps samplers that are still listed on the animation
    }
  }
  // No resample(): it gives every channel its own key times, and the JSON for those accessors outweighs the keys it
  // saves. Without it dedup() shares one time accessor per clip.
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(outDir, 'soldier_clips.glb'), doc);
  await fs.copyFile(
    path.join(srcDir, 'soldier_clips.json'),
    path.join(import.meta.dirname, '../src/game/soldierClips.json'),
  );
}

const which = process.env.ONLY;
if (!which || which === 'ak') await buildViewModel();
if (!which || which === 'rifle') await buildThirdPersonRifle();
if (!which || which === 'characters') await buildCharacters();
console.log('done');
