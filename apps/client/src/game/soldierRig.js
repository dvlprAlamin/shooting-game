import * as THREE from 'three';

// Procedural animation for the auto-rigged soldier model (public/models/soldier.glb).
// The model faces +Z in bind pose, bones have identity bind rotations, and the
// character's left side is +X.

// Rifle placement in Chest-bone space, plus the weapon-local grip points (weapon_tp.glb is
// baked in meters, muzzle along +Z, origin at the pistol grip).
const GUN_POSITION = new THREE.Vector3(-0.11, 0.05, 0.23);
const GUN_GRIP_R = new THREE.Vector3(0, 0, 0);
const GUN_GRIP_L = new THREE.Vector3(0, -0.005, 0.25);
export const GUN_MUZZLE = new THREE.Vector3(0, 0.07, 0.41);
const HAND_OFFSET = 0.07; // wrist joint sits behind the palm

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e = new THREE.Euler();

function bonePos(bone) {
  return bone.position.clone();
}

// Analytic two-bone IK in the parent space of `upper` (all bind rotations are identity,
// so rest directions can be taken straight from the bone offsets).
function solveArm(upper, lower, hand, target, pole) {
  const shoulder = bonePos(upper);
  const upperRest = bonePos(lower).normalize();
  const lowerRest = bonePos(hand).normalize();
  const a = lower.position.length();
  const b = hand.position.length();

  const toTarget = _v1.subVectors(target, shoulder);
  const d = THREE.MathUtils.clamp(toTarget.length(), 0.05, a + b - 1e-4);
  const dir = toTarget.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const bend = _v2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = shoulder.clone().addScaledVector(dir, along).addScaledVector(bend, h);
  const wrist = shoulder.clone().addScaledVector(dir, d);

  const upperQ = new THREE.Quaternion().setFromUnitVectors(
    upperRest,
    _v3.subVectors(elbow, shoulder).normalize()
  );
  const lowerDir = _v3.subVectors(wrist, elbow).normalize().applyQuaternion(_q1.copy(upperQ).invert());
  const lowerQ = new THREE.Quaternion().setFromUnitVectors(lowerRest, lowerDir);
  return { upperQ, lowerQ };
}

export function createSoldierRig(root, gun) {
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  const b = (name) => bones[name];

  // Gun lives in chest space so it follows torso pitch and walk sway.
  gun.position.copy(GUN_POSITION);
  b('Chest').add(gun);

  // Hand targets in chest space -> convert into UpperArm parent space (Chest).
  const gripR = GUN_GRIP_R.clone().add(GUN_POSITION).add(new THREE.Vector3(0, -0.04, -HAND_OFFSET));
  const right = solveArm(b('R_UpperArm'), b('R_Forearm'), b('R_Hand'), gripR, new THREE.Vector3(-1, -1.2, -0.2));
  const leftFor = (grip) => {
    const target = grip.clone().add(GUN_POSITION).add(new THREE.Vector3(0.02, -0.04, -HAND_OFFSET));
    return solveArm(b('L_UpperArm'), b('L_Forearm'), b('L_Hand'), target, new THREE.Vector3(0.6, -1, 0));
  };
  const left = leftFor(GUN_GRIP_L);

  const pose = {
    R_UpperArm: right.upperQ,
    R_Forearm: right.lowerQ,
    L_UpperArm: left.upperQ,
    L_Forearm: left.lowerQ,
  };
  // Hands follow the forearm, slightly rolled to grip.
  pose.R_Hand = new THREE.Quaternion().setFromEuler(_e.set(0, 0, -0.6));
  pose.L_Hand = new THREE.Quaternion().setFromEuler(_e.set(0, 0, 0.8));
  // Limp arms (spread, slightly lowered) used when the soldier dies.
  const limp = {
    R_UpperArm: new THREE.Quaternion().setFromEuler(_e.set(0, 0.3, 0.5)),
    L_UpperArm: new THREE.Quaternion().setFromEuler(_e.set(0, -0.3, -0.5)),
  };
  const IDENTITY = new THREE.Quaternion();

  const hipsRest = b('Hips').position.clone();
  let phase = 0;
  let stride = 0; // 0 idle .. 1 walking .. 1.6 running
  let deathT = 0;

  /**
   * @param {object} s
   * @param {number} s.dt
   * @param {number} s.forward  local forward speed (m/s)
   * @param {number} s.side     local right speed (m/s)
   * @param {number} s.pitch    camera pitch (radians, + looks up)
   * @param {boolean} s.grounded
   * @param {boolean} s.dead
   * @param {THREE.Object3D} s.body  the object to tip over on death
   */
  function update({ dt, forward, side, pitch, grounded, dead, body }) {
    const speed = Math.hypot(forward, side);
    const targetStride = speed < 0.3 ? 0 : THREE.MathUtils.clamp(speed / 4.5, 0, 1.6);
    stride = THREE.MathUtils.damp(stride, targetStride, 8, dt);
    // Steps per second scales with speed (about 1.8 strides/s when walking).
    phase += dt * (speed < 0.3 ? 0 : 3.4 + speed * 0.9);

    const dirF = speed > 0.01 ? forward / speed : 1;
    const dirS = speed > 0.01 ? side / speed : 0;
    const back = dirF < -0.2 ? -1 : 1;
    const amp = Math.min(stride, 1.3);
    const swing = Math.sin(phase) * 0.55 * amp;
    const lift = Math.max(0, Math.cos(phase)) * 0.9 * amp;
    const liftOpp = Math.max(0, -Math.cos(phase)) * 0.9 * amp;
    const air = grounded ? 0 : 1;

    // Legs: X-axis swing for forward/back, Z-axis for strafing.
    const fw = Math.abs(dirF) * back;
    const sw = dirS;
    b('L_Thigh').rotation.set(-swing * fw - air * 0.5, 0, swing * sw * 0.6);
    b('R_Thigh').rotation.set(swing * fw - air * 0.3, 0, swing * sw * 0.6);
    b('L_Shin').rotation.set(liftOpp + air * 0.9, 0, 0);
    b('R_Shin').rotation.set(lift + air * 0.6, 0, 0);
    b('L_Foot').rotation.set(-swing * fw * 0.3, 0, 0);
    b('R_Foot').rotation.set(swing * fw * 0.3, 0, 0);

    // Hips bob, torso counter-sway and lean into running.
    const bob = Math.abs(Math.cos(phase)) * 0.03 * amp;
    b('Hips').position.set(hipsRest.x, hipsRest.y - bob - air * 0.05, hipsRest.z);
    b('Hips').rotation.set(0, Math.sin(phase) * 0.08 * amp, 0);
    const lean = Math.max(0, stride - 1) * 0.35 * Math.sign(dirF || 1);
    const p = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    b('Spine').rotation.set(lean - p * 0.35, -Math.sin(phase) * 0.06 * amp, 0);
    b('Chest').rotation.set(-p * 0.45, 0, 0);
    b('Neck').rotation.set(-p * 0.1, 0, 0);
    b('Head').rotation.set(-p * 0.1, 0, 0);

    // Death: tip over backwards around the feet, arms go limp and the rifle drops.
    deathT = dead ? Math.min(1, deathT + dt * 2.2) : 0;
    const t = deathT * deathT;
    for (const [name, q] of Object.entries(pose)) {
      b(name).quaternion.slerpQuaternions(q, limp[name] || IDENTITY, t);
    }
    gun.visible = deathT < 0.35;
    if (body) {
      body.rotation.x = -t * (Math.PI / 2) * 0.96;
      body.position.y = t * 0.08;
    }
  }

  /** Moves the left hand to `grip` (gun-local, like GUN_GRIP_L): each gun is held at its own handguard. */
  function setLeftGrip(grip = GUN_GRIP_L) {
    const { upperQ, lowerQ } = leftFor(grip);
    pose.L_UpperArm.copy(upperQ);
    pose.L_Forearm.copy(lowerQ);
  }

  return { bones, update, setLeftGrip };
}

// Muzzle position of a remote soldier in world space (for flashes/sound). `muzzle` is gun-local.
export function getMuzzleWorld(gun, out = new THREE.Vector3(), muzzle = GUN_MUZZLE) {
  return gun.localToWorld(out.copy(muzzle));
}

