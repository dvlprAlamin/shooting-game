import * as THREE from 'three';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Hud, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import FlashShoot from '@/assets/textures/flash_shoot_256x256.png';
import { VIEWMODEL_ADS_FOV, VIEWMODEL_FOV, WALK_SPEED } from '@/game/constants';

const MODEL_URL = '/models/viewmodel_ak.glb';

// Places the rig's authored camera (fps_ak.glb "Camera" node) at our camera.
const RIG_POSITION = [0, -0.2367, -0.0792];
const RIG_QUATERNION = [0, 1, 0, 0];
const RIG_SCALE = 0.502;

// Hip-fire framing: nudged right/down from the authored framing.
const HIP_POSITION = new THREE.Vector3(0.06, -0.022, 0.015);
const HIP_QUATERNION = new THREE.Quaternion();

// Iron sights in the gun bone's (PBody) local space: barrel along +Y, up is -Z.
// The eye sits on the line through the rear notch and front post tip.
const GUN_BONE = 'PBody_058';
const SIGHT_EYE = new THREE.Vector3(0, -0.26, -0.0712);
const MUZZLE = new THREE.Vector3(0, 0.75, 0.002);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

let envTexture = null;
function getEnvironment(gl) {
  if (!envTexture) {
    const pmrem = new THREE.PMREMGenerator(gl);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return envTexture;
}

/**
 * First-person arms + AK. Rendered in its own pass on top of the world (drei <Hud>), so the
 * gun never clips into walls and can use its own field of view.
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

  const rig = useMemo(() => {
    const root = gltf.scene;
    let gunBone = null;
    root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false; // skinned bounds don't follow the animation
      if (o.name === GUN_BONE) gunBone = o;
    });

    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flashTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        color: new THREE.Color(1, 0.85, 0.6),
      })
    );
    flash.position.copy(MUZZLE);
    flash.visible = false;

    return { root, gunBone, mixer, actions, flash };
  }, [gltf, flashTexture]);

  // The glTF scene is cached and reused across respawns, so attach/detach per mount.
  useEffect(() => {
    rig.gunBone?.add(rig.flash);
    return () => {
      rig.gunBone?.remove(rig.flash);
    };
  }, [rig]);

  // Animation/procedural state
  const anim = useMemo(
    () => ({
      current: null,
      once: false,
      adsPosition: new THREE.Vector3(),
      adsQuaternion: new THREE.Quaternion(),
      sway: new THREE.Vector3(),
      swayVel: new THREE.Vector3(),
      landing: 0,
      bobPhase: 0,
      time: 0,
      flashUntil: 0,
    }),
    []
  );

  const play = (name, fade, once = false) => {
    const next = rig.actions[name];
    if (!next || (anim.current === next && !once)) return;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().play();
    if (anim.current && anim.current !== next) anim.current.crossFadeTo(next, fade, false);
    anim.current = next;
    anim.once = once;
  };

  useEffect(() => {
    scene.environment = getEnvironment(gl);
    scene.environmentIntensity = 0.6;

    // Work out the aim-down-sights transform once from the static Idle pose: the wrap
    // transform that puts SIGHT_EYE at the camera, looking down the sight line.
    const wrap = wrapRef.current;
    wrap.position.set(0, 0, 0);
    wrap.quaternion.identity();
    rig.mixer.stopAllAction();
    rig.actions.Idle.reset().play();
    rig.mixer.update(0);
    wrap.updateMatrixWorld(true);
    if (rig.gunBone) {
      const bone = _m.copy(wrap.matrixWorld).invert().multiply(rig.gunBone.matrixWorld);
      const sight = new THREE.Matrix4()
        .makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))
        .setPosition(SIGHT_EYE);
      bone.multiply(sight).invert().decompose(anim.adsPosition, anim.adsQuaternion, _v);
    }
    rig.actions.Idle.stop();
    anim.current = null;
    play('Draw', 0, true);

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
      rig.flash.scale.setScalar(0.16 + Math.random() * 0.08);
      if (flashLightRef.current) flashLightRef.current.intensity = 2.5;
    },
    reload(empty) {
      play(empty ? 'ReloadEmpty' : 'Reload', 0.12, true);
    },
  }));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const wrap = wrapRef.current;
    if (!wrap) return;
    anim.time += dt;
    wrap.visible = visible;

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

    if (rig.flash.visible && performance.now() > anim.flashUntil) {
      rig.flash.visible = false;
      if (flashLightRef.current) flashLightRef.current.intensity = 0;
    }

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

    // Lower the gun when dead.
    const lower = player.isDead ? 0.3 : 0;

    wrap.position.lerpVectors(HIP_POSITION, anim.adsPosition, ads);
    wrap.position.x += (anim.sway.x + breatheX) * calm + bobX;
    wrap.position.y += (anim.sway.y + breatheY) * calm + bobY + anim.landing * calm - lower;
    wrap.quaternion.slerpQuaternions(HIP_QUATERNION, anim.adsQuaternion, ads);
    _q.setFromEuler(_e.set(anim.sway.y * 1.5 * calm, anim.sway.x * 1.5 * calm, anim.sway.x * 2.5 * calm));
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
      <ambientLight intensity={1} />
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
