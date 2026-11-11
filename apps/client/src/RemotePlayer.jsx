import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import FlashShoot from '@/assets/textures/flash_shoot_256x256.png';
import { DEFAULT_WEAPON } from '@shooter/shared/weapons';
import { getRemoteWeapon, isProtected, sampleRemote, setShotListener } from '@/net/remotePlayers';
import { createSoldierRig, getMuzzleWorld, GUN_MUZZLE } from '@/game/soldierRig';
import { playSoundAt } from '@/game/audio';
import { SOUNDS } from '@/weapons/items';
import { thirdPersonModel, toThirdPerson } from '@/weapons/models';
import {
  FLAG_GROUNDED,
  PLAYER_CENTER_TO_FEET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '@/game/constants';

const SOLDIER_URL = '/models/soldier.glb';
const RIFLE_URL = '/models/weapon_tp.glb';

const _muzzle = new THREE.Vector3();
const SHIELD_COLOR = '#47c6cb'; // --teal in index.scss

// Where each gun's muzzle is and where the left hand holds it, gun-local (see game/soldierRig.js). The
// rifle and the marksman rifle are the third-person AKS-74U; the others come from weapons/models.js.
const HOLDS = {
  rifle: { muzzle: GUN_MUZZLE },
  marksman: { muzzle: GUN_MUZZLE },
  smg: { muzzle: toThirdPerson({ x: 0, y: 0, z: -0.37 }), grip: new THREE.Vector3(0, 0.005, 0.27) },
  pistol: { muzzle: toThirdPerson({ x: 0, y: -0.012, z: -0.028 }), grip: new THREE.Vector3(0.015, -0.03, 0.02) },
};

function makeNameTag(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 32px "Barlow Semi Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(name, 128, 32, 240);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128, 32, 240);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const RemotePlayer = ({ id, isDead, playerName = '', initialPosition = { x: 0, y: 0, z: 0 } }) => {
  const soldier = useGLTF(SOLDIER_URL);
  const rifle = useGLTF(RIFLE_URL);
  const flashTexture = useLoader(THREE.TextureLoader, FlashShoot);
  const bodyRef = useRef();
  const rootRef = useRef();
  const tiltRef = useRef();
  const shieldRef = useRef();

  const visual = useMemo(() => {
    const model = cloneSkinned(soldier.scene);
    // Every gun, in one holder the hands follow; the one in hand is shown.
    const gun = new THREE.Group();
    const scoped = new THREE.Group();
    scoped.add(rifle.scene.clone(true), thirdPersonModel('scope'));
    const guns = {
      rifle: rifle.scene.clone(true),
      marksman: scoped,
      smg: thirdPersonModel('smg'),
      pistol: thirdPersonModel('pistol'),
    };
    for (const item of Object.values(guns)) {
      item.visible = false;
      gun.add(item);
    }
    for (const obj of [model, gun]) {
      obj.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
    }
    const rig = createSoldierRig(model, gun);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        color: new THREE.Color(1, 0.85, 0.6),
      })
    );
    flash.position.copy(GUN_MUZZLE).add(new THREE.Vector3(0, 0, 0.06));
    flash.visible = false;
    gun.add(flash);

    return { model, gun, guns, rig, flash, shown: null };
  }, [soldier, rifle, flashTexture]);

  const nameTag = useMemo(() => makeNameTag(playerName), [playerName]);
  useEffect(() => () => nameTag.dispose(), [nameTag]);

  const motion = useMemo(
    () => ({
      sample: { x: initialPosition.x, y: initialPosition.y, z: initialPosition.z, yaw: 0, pitch: 0, f: FLAG_GROUNDED },
      last: new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z),
      vel: new THREE.Vector3(),
      flashUntil: 0,
      started: false,
    }),
    []
  );

  useEffect(() => {
    setShotListener(id, (shot) => {
      motion.flashUntil = performance.now() + 50;
      visual.flash.visible = true;
      visual.flash.material.rotation = Math.random() * Math.PI * 2;
      visual.flash.scale.setScalar(0.3 + Math.random() * 0.15);
      const hold = HOLDS[visual.shown] ?? HOLDS.rifle;
      const sound = SOUNDS[shot?.w] ?? SOUNDS[visual.shown] ?? SOUNDS.rifle;
      playSoundAt('shot', getMuzzleWorld(visual.gun, _muzzle, hold.muzzle), {
        volume: Math.min(1, sound.volume * 1.65),
        detune: sound.detune + (Math.random() - 0.5) * 120,
      });
    });
    return () => setShotListener(id, null);
  }, [id, visual]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = motion.sample;
    if (!isDead) sampleRemote(id, s);

    // The gun the server says they hold.
    const weapon = getRemoteWeapon(id) ?? DEFAULT_WEAPON;
    if (visual.shown !== weapon && visual.guns[weapon]) {
      for (const [gunId, item] of Object.entries(visual.guns)) item.visible = gunId === weapon;
      const hold = HOLDS[weapon];
      visual.rig.setLeftGrip(hold.grip);
      visual.flash.position.copy(hold.muzzle).add(new THREE.Vector3(0, 0, 0.06));
      visual.shown = weapon;
    }

    // Velocity from the interpolated positions drives the walk cycle.
    if (motion.started && dt > 0) {
      const k = 1 - Math.exp(-12 * dt);
      motion.vel.x += ((s.x - motion.last.x) / dt - motion.vel.x) * k;
      motion.vel.z += ((s.z - motion.last.z) / dt - motion.vel.z) * k;
    }
    motion.started = true;
    motion.last.set(s.x, s.y, s.z);

    const root = rootRef.current;
    if (root) {
      root.position.set(s.x, s.y - PLAYER_CENTER_TO_FEET, s.z);
      root.rotation.y = s.yaw + Math.PI; // model faces +Z, cameras look down -Z
    }

    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    visual.rig.update({
      dt,
      forward: -motion.vel.x * sin - motion.vel.z * cos,
      side: motion.vel.x * cos - motion.vel.z * sin,
      pitch: s.pitch,
      grounded: (s.f & FLAG_GROUNDED) !== 0,
      dead: !!isDead,
      body: tiltRef.current,
    });

    if (visual.flash.visible && performance.now() > motion.flashUntil) visual.flash.visible = false;

    // A pulsing see-through shell while spawn protection lasts.
    const shield = shieldRef.current;
    if (shield) {
      shield.visible = !isDead && isProtected(id);
      if (shield.visible) shield.material.opacity = 0.3 + 0.1 * Math.sin(performance.now() * 0.008);
    }

    if (!isDead) bodyRef.current?.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="kinematicPosition"
        colliders={false}
        position={[initialPosition.x, initialPosition.y, initialPosition.z]}
        userData={{ playerId: id }}
      >
        {!isDead && <CapsuleCollider args={[PLAYER_HALF_HEIGHT, PLAYER_RADIUS]} />}
      </RigidBody>
      <group ref={rootRef} position={[initialPosition.x, initialPosition.y - PLAYER_CENTER_TO_FEET, initialPosition.z]}>
        <group ref={tiltRef}>
          <primitive object={visual.model} />
        </group>
        <sprite position={[0, 2.05, 0]} scale={[1.1, 0.275, 1]} visible={!isDead}>
          <spriteMaterial map={nameTag} transparent depthWrite={false} />
        </sprite>
        <mesh ref={shieldRef} position={[0, PLAYER_CENTER_TO_FEET, 0]} visible={false}>
          <capsuleGeometry args={[PLAYER_RADIUS + 0.12, PLAYER_HALF_HEIGHT * 2, 4, 12]} />
          <meshBasicMaterial color={SHIELD_COLOR} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
};

useGLTF.preload(SOLDIER_URL);
useGLTF.preload(RIFLE_URL);
