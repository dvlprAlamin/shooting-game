import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import META from './soldierClips.json';

// Other players' soldiers: Mixamo characters (public/models/soldier_<skin>.glb) playing recorded clips
// (public/models/soldier_clips.glb), both made by scripts/build-characters.py and build-models.mjs. Model space:
// Y up, the soldier faces +Z, its left is +X; the clips' travel directions in soldierClips.json use the same axes.

export const SKINS = ['ch15', 'ch35'];
export const skinUrl = (skin) => `/models/soldier_${skin}.glb`;
export const CLIPS_URL = '/models/soldier_clips.glb';

/** Which soldier a player wears: one per team in a team match, otherwise picked from their id. */
export function skinFor(id, team) {
  if (team) return team === 'a' ? 'ch15' : 'ch35';
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return SKINS[Math.abs(h) % SKINS.length];
}

// Locomotion clips per way of holding a gun: gaits from slowest to fastest, each a set of clips by direction.
// The pistol has no running strafe, so its walking one stands in.
const POSES = {
  rifle: {
    idle: 'rifle_idle',
    aim: 'rifle_aim',
    gaits: [
      ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr'].map((d) => `rifle_walk_${d}`),
      ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr'].map((d) => `rifle_run_${d}`),
      ['rifle_sprint_f', 'rifle_sprint_fl', 'rifle_sprint_fr'],
    ],
  },
  pistol: {
    idle: 'pistol_idle',
    aim: 'pistol_idle',
    gaits: [
      ['pistol_walk_f', 'pistol_strafe_l', 'pistol_walk_b', 'pistol_strafe_r'],
      ['pistol_run_f', 'pistol_strafe_l', 'pistol_run_b', 'pistol_strafe_r'],
    ],
  },
};
const JUMP = 'rifle_jump_loop';
const DEATHS = ['death_front', 'death_back', 'death_right', 'death_headshot'];
const GUN_POSE = { rifle: 'rifle', marksman: 'rifle', smg: 'rifle', pistol: 'pistol' };

// Blends that are nearly all one clip play just that clip: each clip playing costs a frame time.
const snap = (t) => (t < 0.12 ? 0 : t > 0.88 ? 1 : t);

const angleOf = (name) => Math.atan2(META.clips[name].dir[0], META.clips[name].dir[1]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Each gait's clips sorted by direction, for picking the two either side of the way a soldier moves.
for (const pose of Object.values(POSES)) {
  pose.gaits = pose.gaits.map((names) =>
    names.map((name) => ({ name, angle: angleOf(name), ...META.clips[name] })).sort((a, b) => a.angle - b.angle)
  );
}

/** The two clips of `gait` either side of `angle` with their weights, or null when the gait can't go that way. */
function blendDirection(gait, angle, out) {
  const n = gait.length;
  for (let i = 0; i < n; i++) {
    const a = gait[i];
    const b = gait[(i + 1) % n];
    const span = i + 1 < n ? b.angle - a.angle : b.angle + Math.PI * 2 - a.angle;
    if (span > Math.PI * 0.6) continue; // a gap (sprints only go forward)
    const along = wrap(angle - a.angle);
    if (along >= -1e-6 && along <= span + 1e-6) {
      const t = snap(span > 0 ? along / span : 0);
      out.a = a;
      out.b = b;
      out.t = t;
      out.speed = a.speed * (1 - t) + b.speed * t;
      out.duration = a.duration * (1 - t) + b.duration * t;
      return out;
    }
  }
  return null;
}

// The clips with the hips' travel scaled to the soldier's own leg length, once per skin.
const preparedClips = new WeakMap();
function clipsFor(animations, skin) {
  let bySkin = preparedClips.get(animations);
  if (!bySkin) preparedClips.set(animations, (bySkin = {}));
  if (!bySkin[skin]) {
    const k = META.characters[skin].hips[1] / META.clipHips[1];
    const clips = {};
    for (const source of animations) {
      const clip = source.clone();
      for (const track of clip.tracks) {
        if (track.name.endsWith('Hips.position')) track.values = track.values.map((v) => v * k);
      }
      clips[clip.name] = clip;
    }
    bySkin[skin] = clips;
  }
  return bySkin[skin];
}

const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();

const bone = (root, name) => root.getObjectByName(`mixamorig${name}`);

// Where a gun sits in the right hand for each way of holding it, found once per skin from the first frame of the
// aiming clips: grip in the palm, muzzle towards the left hand (rifle) or straight ahead (pistol), top up.
const holdsBySkin = {};
function holdsFor(skin, model, clips) {
  if (holdsBySkin[skin]) return holdsBySkin[skin];
  const mixer = new THREE.AnimationMixer(model);
  const palm = (side, out) => {
    const hand = bone(model, `${side}Hand`).getWorldPosition(out);
    const arm = bone(model, `${side}ForeArm`).getWorldPosition(_v3);
    return hand.add(_v3.subVectors(hand, arm).setLength(0.07));
  };
  const holds = {};
  for (const [pose, clip] of [
    ['rifle', 'rifle_aim'],
    ['pistol', 'pistol_idle'],
  ]) {
    const action = mixer.clipAction(clips[clip]).play();
    mixer.setTime(0);
    model.updateMatrixWorld(true);
    const grip = palm('Right', new THREE.Vector3());
    if (pose === 'rifle') _z.subVectors(palm('Left', _v2), grip);
    else _z.set(0, 0, 1).transformDirection(model.matrixWorld);
    _z.y = pose === 'rifle' ? _z.y : 0;
    _z.normalize();
    _x.crossVectors(_y.set(0, 1, 0), _z).normalize();
    _y.crossVectors(_z, _x);
    const gunWorld = new THREE.Matrix4().makeBasis(_x, _y, _z).setPosition(grip);
    const hand = bone(model, 'RightHand');
    holds[pose] = _m.copy(hand.matrixWorld).invert().multiply(gunWorld).clone();
    action.stop();
  }
  mixer.uncacheRoot(model);
  holdsBySkin[skin] = holds;
  return holds;
}

/**
 * One soldier. `gltf` is its skin's model, `clipsGltf` the shared clips, `gun` the group of guns it carries (gun
 * space: grip at the origin, muzzle along +Z); the soldier puts it in its right hand.
 */
export function createSoldier({ gltf, clipsGltf, skin, gun, seed = 0 }) {
  const model = cloneSkinned(gltf.scene);
  const clips = clipsFor(clipsGltf.animations, skin);
  // The soldier's left (model +X) in each spine bone's own space, from the bind pose: bending about it aims up and
  // down whatever pose the clips give the torso.
  model.updateMatrixWorld(true);
  const spine = ['Spine', 'Spine1', 'Spine2'].map((n) => {
    const b = bone(model, n);
    return { bone: b, axis: new THREE.Vector3(1, 0, 0).applyQuaternion(b.getWorldQuaternion(_q).invert()) };
  });
  const holds = holdsFor(skin, model, clips); // leaves the model posed
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      o.castShadow = true;
      // Culling bounds from a standing pose, with room for moving arms and a death falling a step away.
      o.skeleton.update();
      o.computeBoundingSphere();
      o.boundingSphere.radius *= 1.6;
    }
  });
  bone(model, 'RightHand').add(gun);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const action = (name) => (actions[name] ??= mixer.clipAction(clips[name]));
  const weights = {}; // name -> current weight
  const targets = {};
  const names = new Set([JUMP, ...DEATHS]);
  for (const pose of Object.values(POSES)) {
    names.add(pose.idle).add(pose.aim);
    for (const gait of pose.gaits) for (const c of gait) names.add(c.name);
  }
  const synced = new Set();
  for (const pose of Object.values(POSES)) for (const gait of pose.gaits) for (const c of gait) synced.add(c.name);

  let pose = POSES.rifle;
  let phase = 0;
  let airTime = 0;
  let death = null;
  let deathTime = 0;
  let deaths = seed;
  let kick = 0;
  const scratch = {};
  const lowerGait = {};
  const upperGait = {};
  const blend = { natural: 0, duration: 0, total: 0 }; // this frame's gaits, weighted

  // Adds a gait (`d` from blendDirection) at weight `w` to this frame's targets and blend.
  function addGait(d, w) {
    if (w <= 0) return;
    blend.natural += d.speed * w;
    blend.duration += d.duration * w;
    blend.total += w;
    targets[d.a.name] += w * (1 - d.t);
    targets[d.b.name] += w * d.t;
  }

  function setWeapon(weapon) {
    const kind = GUN_POSE[weapon] ?? 'rifle';
    pose = POSES[kind];
    holds[kind].decompose(gun.position, gun.quaternion, gun.scale);
  }

  function shot() {
    kick = 1;
  }

  /**
   * @param {object} s
   * @param {number} s.dt
   * @param {number} s.forward  local forward speed (m/s)
   * @param {number} s.side     local right speed (m/s)
   * @param {number} s.pitch    camera pitch (radians, + looks up)
   * @param {boolean} s.grounded
   * @param {boolean} s.aiming
   * @param {boolean} s.dead
   */
  function update({ dt, forward, side, pitch, grounded, aiming, dead }) {
    for (const name of names) targets[name] = 0;
    let rate = 12;

    if (dead) {
      if (!death) {
        death = DEATHS[deaths++ % DEATHS.length];
        deathTime = 0;
        action(death).reset().setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
      }
      deathTime += dt;
      // A body that has finished falling stays as it lies.
      if (deathTime > action(death).getClip().duration + 0.5) {
        gun.visible = false;
        return;
      }
      targets[death] = 1;
      rate = 18;
    } else {
      if (death) {
        // Back from the dead: start over standing.
        for (const name of names) weights[name] = 0;
        mixer.stopAllAction();
        death = null;
        weights[pose.idle] = 1;
      }
      airTime = grounded ? 0 : airTime + dt;
      const speed = Math.hypot(forward, side);
      if (airTime > 0.15) {
        targets[JUMP] = 1;
      } else if (speed < 0.2) {
        targets[aiming ? pose.aim : pose.idle] = 1;
      } else {
        // The gaits that can go this way, with their speeds that way.
        const angle = Math.atan2(-side, forward);
        let lower = null; // { speed, duration, a, b, t } of the gait just below `speed`, null = standing
        let upper = null;
        for (let g = 0; g < pose.gaits.length; g++) {
          const dir = blendDirection(pose.gaits[g], angle, scratch);
          if (!dir || (upper && dir.speed < upper.speed + 0.3)) continue;
          if (dir.speed <= speed) {
            lower = Object.assign(lowerGait, dir);
            upper = null;
          } else if (!upper) {
            upper = Object.assign(upperGait, dir);
          }
        }
        if (!upper && !lower) {
          targets[pose.idle] = 1;
        } else {
          // Blend the gaits either side of the speed, step at the rate that matches the ground speed.
          const lo = lower?.speed ?? 0;
          const t = upper ? snap((speed - lo) / (upper.speed - lo)) : 1;
          blend.natural = blend.duration = blend.total = 0;
          if (lower) addGait(lower, upper ? 1 - t : 1);
          else targets[pose.idle] = 1 - t;
          if (upper) addGait(upper, t);
          if (blend.total > 0) {
            const stepRate = THREE.MathUtils.clamp(speed / (blend.natural / blend.total), 0.5, 1.8);
            phase = (phase + (dt * stepRate) / (blend.duration / blend.total)) % 1;
          }
        }
      }
    }

    // Ease the weights towards their targets; they always add up to 1 (less would pull towards the bind pose).
    const k = 1 - Math.exp(-rate * dt);
    let sum = 0;
    for (const name of names) {
      let w = weights[name] ?? 0;
      w += (targets[name] - w) * k;
      if (w < 0.02 && targets[name] === 0) w = 0;
      weights[name] = w;
      sum += w;
    }
    for (const name of names) {
      const w = weights[name] / (sum || 1);
      const a = actions[name];
      if (w === 0) {
        if (a?.isRunning()) a.stop();
        continue;
      }
      const act = action(name);
      if (!act.isRunning()) act.play();
      act.setEffectiveWeight(w);
      if (synced.has(name)) {
        act.timeScale = 0;
        act.time = phase * act.getClip().duration;
      }
    }
    mixer.update(dt);

    // Aim up and down by bending the spine, and kick back on a shot.
    kick *= Math.exp(-14 * dt);
    if (!dead) {
      const bend = -THREE.MathUtils.clamp(pitch, -1.2, 1.2) / spine.length - kick * 0.05;
      for (const { bone: b, axis } of spine) b.quaternion.multiply(_q.setFromAxisAngle(axis, bend));
    }
    gun.visible = !dead || deathTime < 0.35;
  }

  return { model, update, setWeapon, shot };
}
