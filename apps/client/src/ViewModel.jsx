import * as THREE from 'three';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Hud, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getWeapon } from '@rimfire/shared/weapons';
import FlashShoot from '@/assets/textures/flash_shoot_256x256.png';
import { VIEWMODEL_ADS_FOV, VIEWMODEL_FOV, WALK_SPEED } from '@/game/constants';
import { LOW_QUALITY } from '@/config';
import { buildMedkit, buildPistol, buildScope, buildSmg } from '@/weapons/models';

const MODEL_URL = '/models/viewmodel_ak.glb';

// Places the rig's authored camera (fps_ak.glb "Camera" node) at our camera.
const RIG_POSITION = new THREE.Vector3(0, -0.2367, -0.0792);
const RIG_QUATERNION = new THREE.Quaternion(0, 1, 0, 0);
const RIG_SCALE = 0.502;

// Hip-fire framing: nudged right/down from the authored framing.
const HIP = { position: new THREE.Vector3(0.06, -0.022, 0.015), quaternion: new THREE.Quaternion() };

// Bones and meshes of the rig. The gun bone's (PBody) space has the barrel along +Y and up along -Z.
const GUN_BONE = 'PBody_058';
const MAG_BONE = 'Pmag_062'; // the magazine in the gun
const NEW_MAG_BONE = 'Pmag2_063'; // the one the left hand brings in when reloading
const BOLT_BONE = 'Rif_059';
const ARMS = 'Object_11';
const AK_MESHES = ['Object_97', 'Object_99']; // the AK (with its magazine), and the new magazine

// From the model frame of weapons/models.js (metres, +x right, +y up, -z forward, origin on the AK's bore
// above its magazine) to the gun bone's space.
const MODEL_SCALE = 1.47;
const MODEL_TO_BONE = new THREE.Matrix4().set(
  -MODEL_SCALE, 0, 0, 0,
  0, 0, -MODEL_SCALE, -0.0195,
  0, -MODEL_SCALE, 0, 0.0019,
  0, 0, 0, 1
);

// The AK's iron sights in the model frame: the eye on the line through the rear notch and the front post tip.
const AK_SIGHT = { eye: new THREE.Vector3(0, 0.0497, 0.1636), forward: new THREE.Vector3(0, 0, -1) };
const AK_MUZZLE = new THREE.Vector3(0, 0, -0.5235);

// The rig's clips last longer than the rifle's reload and draw; other guns play them faster or slower.
const RIFLE = getWeapon('rifle');
const DRAW_CLIP = 0.65; // s

const pose = ([x, y, z], [rx, ry, rz]) => ({
  position: new THREE.Vector3(x, y, z),
  quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
});

/**
 * How each item looks in hand. `model`: built in code and fixed to the gun bone (the rifle is the rig's own
 * AK). `hidesAk`: the AK is put away. `oneHanded`: the left arm is hidden. `hip` / `aim`: hand-placed
 * framings, instead of the default hip framing and aiming down the model's sight line (the pistol's sights
 * can't line up with this rig's right hand, so it aims with the crosshair). `dipReload`: the gun dips out of
 * view to reload instead of using the AK's reload clips.
 */
const VIEWS = {
  rifle: {},
  smg: { model: buildSmg, hidesAk: true },
  marksman: { model: buildScope },
  pistol: {
    model: buildPistol,
    hidesAk: true,
    oneHanded: true,
    dipReload: true,
    hip: pose([0.05, 0.1, -0.16], [0, 0.08, 0]),
    aim: pose([0.025, 0.115, -0.2], [-0.03, 0.08, 0]),
  },
  medkit: { model: buildMedkit, hidesAk: true, oneHanded: true, hip: pose([0.03, 0.1, -0.12], [0.15, 0.2, 0]) },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const FORWARD = new THREE.Vector3(0, 0, -1);

// Low quality: Phong in place of the PBR materials, and no room environment (a stronger ambient light makes up
// for it). Shading the arms and gun, a big part of the screen, with them cost about 6% of the frame rate on a
// low-end phone; Phong keeps a highlight on the metal.
const VIEW_AMBIENT = LOW_QUALITY ? 1.8 : 1;
const phongCopies = new WeakMap();
function toPhong(m) {
  if (!m.isMeshStandardMaterial) return m;
  let phong = phongCopies.get(m);
  if (!phong) {
    phong = new THREE.MeshPhongMaterial({
      name: m.name,
      color: m.color,
      map: m.map,
      normalMap: m.normalMap,
      normalScale: m.normalScale,
      aoMap: m.aoMap,
      aoMapIntensity: m.aoMapIntensity,
      emissive: m.emissive,
      emissiveMap: m.emissiveMap,
      transparent: m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      side: m.side,
      // Smooth metal gets a small, bright highlight; rough cloth a dull, wide one.
      shininess: 4 + 40 * (1 - m.roughness),
      specular: new THREE.Color().setScalar(0.08 + 0.5 * m.metalness),
    });
    phongCopies.set(m, phong);
  }
  return phong;
}

let envTexture = null;
function getEnvironment(gl) {
  if (!envTexture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envTexture;
}

// The arms without the left one: the triangles whose corners all belong to right-side or shared bones.
function rightArmIndex(arms) {
  const { index, attributes } = arms.geometry;
  const bones = arms.skeleton.bones.map((b) => /_L_|L_0|L0/.test(b.name) && !/_R/.test(b.name));
  const left = new Uint8Array(attributes.skinIndex.count);
  for (let i = 0; i < left.length; i++) {
    let best = 0;
    let weight = -1;
    for (let k = 0; k < 4; k++) {
      const w = attributes.skinWeight.getComponent(i, k);
      if (w > weight) {
        weight = w;
        best = attributes.skinIndex.getComponent(i, k);
      }
    }
    left[i] = bones[best] ? 1 : 0;
  }
  const keep = [];
  const a = index.array;
  for (let i = 0; i < a.length; i += 3) {
    if (!left[a[i]] && !left[a[i + 1]] && !left[a[i + 2]]) keep.push(a[i], a[i + 1], a[i + 2]);
  }
  return new THREE.BufferAttribute(left.length > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1);
}

// Where the wrap goes so that `sight` (model frame) is at the camera, looking down it. Worked out from the
// static Idle pose, with the rig as the wrap holds it.
function sightPose(gunBoneInRig, sight) {
  const rig = _m.compose(RIG_POSITION, RIG_QUATERNION, _v.setScalar(RIG_SCALE));
  const bone = new THREE.Matrix4().multiplyMatrices(rig, gunBoneInRig);
  const eye = new THREE.Matrix4().compose(
    sight.eye,
    new THREE.Quaternion().setFromUnitVectors(FORWARD, sight.forward),
    new THREE.Vector3().setScalar(1 / MODEL_SCALE)
  );
  const out = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  bone.multiply(MODEL_TO_BONE).multiply(eye).invert().decompose(out.position, out.quaternion, _v);
  return out;
}

// The rig with every item fixed to its bones, built once per loaded model: the glTF scene is cached and
// reused across respawns, so items are attached once and then only shown and hidden.
const rigs = new WeakMap();
function getRig(gltf, flashTexture) {
  let rig = rigs.get(gltf.scene);
  if (rig) return rig;

  const root = gltf.scene;
  const nodes = {};
  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow the animation
    nodes[o.name] = o;
  });
  const gunBone = nodes[GUN_BONE];
  const arms = nodes[ARMS];

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

  // Attach in the Idle pose, so parts keep their place on the bones they follow.
  actions.Idle.reset().play();
  mixer.update(0);
  root.updateMatrixWorld(true);

  const views = {};
  for (const [id, view] of Object.entries(VIEWS)) {
    const v = { ...view, parts: [], sight: AK_SIGHT, muzzle: AK_MUZZLE, holder: null };
    if (view.model) {
      const built = view.model();
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(MODEL_TO_BONE);
      holder.add(built.group);
      gunBone.add(holder);
      root.updateMatrixWorld(true);
      v.holder = holder;
      v.parts.push(holder);
      if (built.mag) {
        holder.add(built.mag);
        holder.updateMatrixWorld(true);
        nodes[MAG_BONE].attach(built.mag);
        // The new magazine sits on its bone as the old one sits on its own.
        const next = built.mag.clone();
        nodes[NEW_MAG_BONE].add(next);
        next.position.copy(built.mag.position);
        next.quaternion.copy(built.mag.quaternion);
        next.scale.copy(built.mag.scale);
        v.parts.push(built.mag, next);
      }
      if (built.bolt) {
        holder.add(built.bolt);
        holder.updateMatrixWorld(true);
        nodes[BOLT_BONE].attach(built.bolt);
        v.parts.push(built.bolt);
      }
      if (built.sight) v.sight = built.sight;
      if (built.muzzle) v.muzzle = built.muzzle;
      v.dot = built.dot ?? null;
      for (const part of v.parts) {
        part.visible = false;
        part.traverse((o) => {
          if (o.isMesh) o.frustumCulled = false;
        });
      }
    }
    if (id === 'rifle') v.muzzle = AK_MUZZLE;
    views[id] = v;
  }
  for (const v of Object.values(views)) {
    v.aimPose = v.aim ?? sightPose(gunBone.matrixWorld, v.sight);
    v.hipPose = v.hip ?? HIP;
  }

  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flashTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      color: new THREE.Color(1, 0.85, 0.6),
    })
  );
  flash.visible = false;
  // The flash lives in the model frame, at the muzzle of whatever is in hand.
  const flashHolder = new THREE.Group();
  flashHolder.matrixAutoUpdate = false;
  flashHolder.matrix.copy(MODEL_TO_BONE);
  flashHolder.add(flash);
  gunBone.add(flashHolder);

  actions.Idle.stop();
  if (LOW_QUALITY) {
    root.traverse((o) => {
      if (o.isMesh) o.material = toPhong(o.material);
    });
  }
  rig = {
    root,
    nodes,
    arms,
    fullIndex: arms.geometry.index,
    rightIndex: rightArmIndex(arms),
    mixer,
    actions,
    views,
    flash,
  };
  rigs.set(gltf.scene, rig);
  return rig;
}

/**
 * First-person arms and whatever is in hand (the AK, the guns from weapons/models.js, the medkit). Rendered in
 * its own pass on top of the world (drei <Hud>), so the gun never clips into walls and can use its own field
 * of view. It follows `player` (the Player's per-frame state): what's equipped, drawing, reloading, healing.
 */
export const ViewModel = forwardRef(function ViewModel(props, ref) {
  return (
    <Hud renderPriority={1}>
      <ViewModelScene ref={ref} {...props} />
    </Hud>
  );
});

const ViewModelScene = forwardRef(function ViewModelScene({ player, visible }, ref) {
  const { gl, scene } = useThree(); // the Hud's scene
  const gltf = useGLTF(MODEL_URL);
  const flashTexture = useLoader(THREE.TextureLoader, FlashShoot);
  const cameraRef = useRef();
  const wrapRef = useRef();
  const flashLightRef = useRef();

  const rig = useMemo(() => getRig(gltf, flashTexture), [gltf, flashTexture]);

  // Animation/procedural state
  const anim = useMemo(
    () => ({
      current: null,
      once: false,
      shown: null, // the item on screen
      reloading: false,
      sway: new THREE.Vector3(),
      swayVel: new THREE.Vector3(),
      landing: 0,
      bobPhase: 0,
      time: 0,
      flashUntil: 0,
    }),
    []
  );

  const play = (name, fade, once = false, timeScale = 1) => {
    const next = rig.actions[name];
    if (!next || (anim.current === next && !once)) return;
    next.enabled = true;
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().play();
    if (anim.current && anim.current !== next) anim.current.crossFadeTo(next, fade, false);
    anim.current = next;
    anim.once = once;
  };

  // Puts `id` in hand: its parts, the AK or not, one arm or two, the flash at its muzzle.
  const show = (id) => {
    const view = rig.views[id];
    anim.shown = id;
    for (const [other, v] of Object.entries(rig.views)) for (const part of v.parts) part.visible = other === id;
    for (const name of AK_MESHES) rig.nodes[name].visible = !view.hidesAk;
    const index = view.oneHanded ? rig.rightIndex : rig.fullIndex;
    if (rig.arms.geometry.index !== index) rig.arms.geometry.setIndex(index);
    rig.flash.position.copy(view.muzzle);
  };

  useEffect(() => {
    if (!LOW_QUALITY) {
      scene.environment = getEnvironment(gl);
      scene.environmentIntensity = 0.6;
    }
    anim.current = null;
    anim.shown = null;
    anim.reloading = false;

    const onFinished = (e) => {
      if (e.action === anim.current) anim.once = false;
    };
    rig.mixer.addEventListener('finished', onFinished);
    return () => {
      rig.mixer.removeEventListener('finished', onFinished);
      rig.mixer.stopAllAction();
    };
  }, [rig]);

  useImperativeHandle(ref, () => ({
    shot() {
      play('Shot', 0.03, true);
      anim.flashUntil = performance.now() + 45;
      rig.flash.visible = true;
      rig.flash.material.rotation = Math.random() * Math.PI * 2;
      rig.flash.scale.setScalar((0.16 + Math.random() * 0.08) / MODEL_SCALE);
      if (flashLightRef.current) flashLightRef.current.intensity = 2.5;
    },
  }));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const wrap = wrapRef.current;
    if (!wrap) return;
    const now = performance.now();
    anim.time += dt;
    wrap.visible = visible && !player.scoped;

    // A new item in hand: draw it (the medkit comes up with the same clip).
    if (player.equipped && player.equipped !== anim.shown) {
      show(player.equipped);
      const time = player.equipped === 'medkit' ? 0.4 : (player.drawUntil - player.drawStart) / 1000;
      play('Draw', 0, true, DRAW_CLIP / Math.max(time, 0.1));
      anim.reloading = false;
    }
    const view = rig.views[anim.shown] ?? rig.views.rifle;

    // A reload started: the AK's clips, timed to this gun's reload, unless this gun dips out of view instead.
    if (player.reloading && !anim.reloading && !view.dipReload) {
      const empty = player.reloadEmpty;
      const time = player.reloadUntil - player.reloadStart;
      play(empty ? 'ReloadEmpty' : 'Reload', 0.12, true, (empty ? RIFLE.reloadEmptyTime : RIFLE.reloadTime) / time);
    }
    anim.reloading = player.reloading;

    // Locomotion clips (unless a one-shot like Shot/Reload/Draw is playing).
    if (!anim.once) {
      const moving = player.grounded && player.speed > 0.6;
      let clip = 'Idle';
      if (moving && player.sprinting) clip = 'Run';
      else if (moving && player.ads < 0.5) clip = 'Walk';
      play(clip, 0.25);
      if (clip === 'Walk') {
        rig.actions.Walk.setEffectiveTimeScale(THREE.MathUtils.clamp(player.speed / WALK_SPEED, 0.6, 1.3));
      }
    }
    rig.mixer.update(dt);

    if (rig.flash.visible && now > anim.flashUntil) {
      rig.flash.visible = false;
      if (flashLightRef.current) flashLightRef.current.intensity = 0;
    }
    // The reflex sight's dot only shows when you look through it.
    if (view.dot) view.dot.visible = player.ads > 0.5;

    // --- procedural offsets -----------------------------------------------------
    const ads = player.ads;
    const calm = 1 - ads * 0.8;

    // Weapon lags behind mouse movement (spring).
    const target = _v.set(
      THREE.MathUtils.clamp(-player.yawVel * 0.006, -0.03, 0.03),
      THREE.MathUtils.clamp(-player.pitchVel * 0.006, -0.03, 0.03),
      0
    );
    anim.swayVel.addScaledVector(target.sub(anim.sway), 180 * dt);
    anim.swayVel.multiplyScalar(Math.exp(-18 * dt));
    anim.sway.addScaledVector(anim.swayVel, dt);

    // Breathing (the Idle clip is a static pose).
    const breatheX = Math.sin(anim.time * 0.9) * 0.0012;
    const breatheY = Math.sin(anim.time * 1.8) * 0.0016;

    // Footstep bob while aiming (hip-fire bob comes from the Walk/Run clips).
    if (player.grounded && player.speed > 0.6) anim.bobPhase += dt * player.speed * 2.2;
    const bobAmount = ads * Math.min(player.speed / WALK_SPEED, 1) * 0.0025;
    const bobX = Math.sin(anim.bobPhase) * bobAmount;
    const bobY = -Math.abs(Math.cos(anim.bobPhase)) * bobAmount;

    // Dip on jump/landing.
    const landingTarget = THREE.MathUtils.clamp(-player.verticalSpeed * 0.004, -0.02, 0.025);
    anim.landing += (landingTarget - anim.landing) * (1 - Math.exp(-10 * dt));

    // Lower the gun when dead; dip it out of view for a code-animated reload; lift the medkit while using it.
    let lower = player.isDead ? 0.3 : 0;
    let tilt = 0;
    if (view.dipReload && player.reloading) {
      const t = THREE.MathUtils.clamp((now - player.reloadStart) / (player.reloadUntil - player.reloadStart), 0, 1);
      const dip = Math.sin(Math.PI * t) ** 0.6;
      lower += dip * 0.14;
      tilt += dip * 0.7;
    }
    let lift = 0;
    if (anim.shown === 'medkit' && player.healUntil) {
      const t = THREE.MathUtils.clamp((now - player.healStart) / (player.healUntil - player.healStart), 0, 1);
      lift = Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 0.5 * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    }

    wrap.position.lerpVectors(view.hipPose.position, view.aimPose.position, ads);
    wrap.position.x += (anim.sway.x + breatheX) * calm + bobX - lift * 0.04;
    wrap.position.y += (anim.sway.y + breatheY) * calm + bobY + anim.landing * calm - lower + lift * 0.05;
    wrap.position.z -= lift * 0.03;
    wrap.quaternion.slerpQuaternions(view.hipPose.quaternion, view.aimPose.quaternion, ads);
    _q.setFromEuler(_e.set(anim.sway.y * 1.5 * calm - tilt, anim.sway.x * 1.5 * calm + lift * 0.3, anim.sway.x * 2.5 * calm));
    wrap.quaternion.multiply(_q);

    const cam = cameraRef.current;
    if (cam) {
      const fov = THREE.MathUtils.lerp(VIEWMODEL_FOV, VIEWMODEL_ADS_FOV, ads);
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault ref={cameraRef} fov={VIEWMODEL_FOV} near={0.01} far={20} />
      <ambientLight intensity={VIEW_AMBIENT} />
      <directionalLight position={[1, 2, 1]} intensity={1.5} />
      <pointLight
        ref={flashLightRef}
        position={[0.05, -0.05, -0.75]}
        intensity={0}
        distance={2.5}
        decay={2}
        color="#ffb066"
      />
      <group ref={wrapRef}>
        <group position={RIG_POSITION} quaternion={RIG_QUATERNION} scale={RIG_SCALE}>
          <primitive object={rig.root} />
        </group>
      </group>
    </>
  );
});

useGLTF.preload(MODEL_URL);
