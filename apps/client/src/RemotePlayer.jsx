import * as THREE from 'three';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';
import FlashShoot from '@/assets/textures/flash_shoot_256x256.png';
import { DEFAULT_WEAPON } from '@rimfire/shared/weapons';
import { getRemoteWeapon, isProtected, sampleRemote, setShotListener } from '@/net/remotePlayers';
import { CLIPS_URL, createSoldier, SKINS, skinFor, skinUrl } from '@/game/soldier';
import { playSoundAt } from '@/game/audio';
import { TEAM_INFO } from '@/game/teams';
import { SOUNDS } from '@/weapons/items';
import { thirdPersonModel, toThirdPerson } from '@/weapons/models';
import {
  FLAG_AIM,
  FLAG_GROUNDED,
  PLAYER_CENTER_TO_FEET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
} from '@/game/constants';

const RIFLE_URL = '/models/rifle_tp.glb'; // the first-person AK, cut down (scripts/build-models.mjs)

const _muzzle = new THREE.Vector3();
const SHIELD_COLOR = '#47c6cb'; // --teal in index.scss
const TAG_SCALE = [1.1, 0.275, 1];
// Teammates' tags keep one size on screen (a normal tag's at about 5.5 m), so they can be found at any range.
const ALLY_TAG_SCALE = [0.2, 0.05, 1];

// Where each gun's muzzle is, gun-local (grip at the origin, muzzle along +Z). The rifle and the marksman rifle are
// the AK (its muzzle is AK_MUZZLE in ViewModel.jsx); the others come from weapons/models.js.
const RIFLE_MUZZLE = toThirdPerson({ x: 0, y: 0, z: -0.5235 });
const MUZZLES = {
  rifle: RIFLE_MUZZLE,
  marksman: RIFLE_MUZZLE,
  smg: toThirdPerson({ x: 0, y: 0, z: -0.37 }),
  pistol: toThirdPerson({ x: 0, y: -0.012, z: -0.028 }),
};

// Far and off-screen soldiers animate less often (their clips still advance by the time skipped): every frame up
// close, every 2nd past 12 m, every 3rd past 30 m, every 4th past 60 m, every 6th out of view.
const animationStride = (distance, inView) =>
  !inView ? 6 : distance < 12 ? 1 : distance < 30 ? 2 : distance < 60 ? 3 : 4;
const _frustum = new THREE.Frustum();
const _viewProjection = new THREE.Matrix4();
const _feet = new THREE.Sphere(new THREE.Vector3(), 1.2);
let frustumFrame = -1;

// The camera's view, worked out once per frame for every soldier.
function inView(camera, frame, position) {
  if (frustumFrame !== frame) {
    frustumFrame = frame;
    _viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_viewProjection);
  }
  _feet.center.set(position.x, position.y, position.z);
  return _frustum.intersectsSphere(_feet);
}

function makeNameTag(name, color = '#ffffff') {
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
  ctx.fillStyle = color;
  ctx.fillText(name, 128, 32, 240);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// In a team match `team` is theirs and `myTeam` yours: name tags take the team's colour, and teammates' show
// through walls so you can find them.
export const RemotePlayer = memo(function RemotePlayer({
  id,
  isDead,
  playerName = '',
  initialPosition = { x: 0, y: 0, z: 0 },
  team = null,
  myTeam = null,
}) {
  const skin = skinFor(id, team);
  const soldierGltf = useGLTF(skinUrl(skin));
  const clipsGltf = useGLTF(CLIPS_URL);
  const rifle = useGLTF(RIFLE_URL);
  const flashTexture = useLoader(THREE.TextureLoader, FlashShoot);
  const bodyRef = useRef();
  const rootRef = useRef();
  const shieldRef = useRef();

  const visual = useMemo(() => {
    // Every gun, in one holder in the right hand; the one in hand is shown.
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
    gun.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

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
    gun.add(flash);

    // Different soldiers start their death clips at different places in the list.
    const seed = [...String(id)].reduce((h, c) => h + c.charCodeAt(0), 0);
    const soldier = createSoldier({ gltf: soldierGltf, clipsGltf, skin, gun, seed });
    return { soldier, gun, guns, flash, seed, shown: null };
  }, [id, skin, soldierGltf, clipsGltf, rifle, flashTexture]);

  const ally = !!team && team === myTeam;
  const nameTag = useMemo(() => makeNameTag(playerName, TEAM_INFO[team]?.color), [playerName, team]);
  useEffect(() => () => nameTag.dispose(), [nameTag]);

  const motion = useMemo(
    () => ({
      sample: { x: initialPosition.x, y: initialPosition.y, z: initialPosition.z, yaw: 0, pitch: 0, f: FLAG_GROUNDED },
      last: new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z),
      vel: new THREE.Vector3(),
      flashUntil: 0,
      started: false,
      frame: 0,
      pending: 0, // animation time not played yet (far soldiers skip frames)
    }),
    []
  );

  useEffect(() => {
    setShotListener(id, (shot) => {
      motion.flashUntil = performance.now() + 50;
      visual.soldier.shot();
      visual.flash.visible = true;
      visual.flash.material.rotation = Math.random() * Math.PI * 2;
      visual.flash.scale.setScalar(0.3 + Math.random() * 0.15);
      const sound = SOUNDS[shot?.w] ?? SOUNDS[visual.shown] ?? SOUNDS.rifle;
      const muzzle = visual.gun.localToWorld(_muzzle.copy(MUZZLES[visual.shown] ?? RIFLE_MUZZLE));
      playSoundAt('shot', muzzle, {
        volume: Math.min(1, sound.volume * 1.65),
        detune: sound.detune + (Math.random() - 0.5) * 120,
      });
    });
    return () => setShotListener(id, null);
  }, [id, visual]);

  useFrame(({ camera, gl }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = motion.sample;
    if (!isDead) sampleRemote(id, s);

    // The gun the server says they hold.
    const weapon = getRemoteWeapon(id) ?? DEFAULT_WEAPON;
    if (visual.shown !== weapon && visual.guns[weapon]) {
      for (const [gunId, item] of Object.entries(visual.guns)) item.visible = gunId === weapon;
      visual.soldier.setWeapon(weapon);
      visual.flash.position.copy(MUZZLES[weapon]).add(new THREE.Vector3(0, 0, 0.06));
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

    motion.pending += dt;
    const stride = animationStride(
      camera.position.distanceTo(motion.last),
      inView(camera, gl.info.render.frame, motion.last)
    );
    if ((++motion.frame + visual.seed) % stride === 0) {
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      visual.soldier.update({
        dt: motion.pending,
        forward: -motion.vel.x * sin - motion.vel.z * cos,
        side: motion.vel.x * cos - motion.vel.z * sin,
        pitch: s.pitch,
        grounded: (s.f & FLAG_GROUNDED) !== 0,
        aiming: (s.f & FLAG_AIM) !== 0,
        dead: !!isDead,
      });
      motion.pending = 0;
    }

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
        <primitive object={visual.soldier.model} />
        <sprite
          position={[0, 2.05, 0]}
          scale={ally ? ALLY_TAG_SCALE : TAG_SCALE}
          visible={!isDead}
          renderOrder={ally ? 10 : 0}
        >
          <spriteMaterial map={nameTag} transparent depthWrite={false} depthTest={!ally} sizeAttenuation={!ally} />
        </sprite>
        <mesh ref={shieldRef} position={[0, PLAYER_CENTER_TO_FEET, 0]} visible={false}>
          <capsuleGeometry args={[PLAYER_RADIUS + 0.12, PLAYER_HALF_HEIGHT * 2, 4, 12]} />
          <meshBasicMaterial color={SHIELD_COLOR} transparent depthWrite={false} />
        </mesh>
      </group>
    </>
  );
});

for (const skin of SKINS) useGLTF.preload(skinUrl(skin));
useGLTF.preload(CLIPS_URL);
useGLTF.preload(RIFLE_URL);
