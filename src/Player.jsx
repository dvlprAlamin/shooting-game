import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { socket } from '@/net/socket';
import { input, installInput } from '@/game/input';
import { initAudio, playHitTick, playSound, resumeAudio } from '@/game/audio';
import { usePlayerStore } from '@/store/PlayersStore';
import { useRoundsStore } from '@/store/RoundsStore';
import { useHudStore } from '@/store/HudStore';
import { ViewModel } from '@/ViewModel';
import { Impacts } from '@/Impacts';
import {
  ADS_FOV,
  ADS_SPEED,
  AIR_ACCEL,
  DRAW_TIME,
  EYE_HEIGHT,
  FALL_RESET_Y,
  FIRE_INTERVAL,
  FLAG_AIM,
  FLAG_GROUNDED,
  FLAG_RELOAD,
  FLAG_SPRINT,
  GROUND_ACCEL,
  JUMP_VELOCITY,
  MAG_SIZE,
  MAX_SHOT_DISTANCE,
  NET_SEND_INTERVAL,
  PLAYER_CENTER_TO_FEET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
  RELOAD_EMPTY_TIME,
  RELOAD_TIME,
  SPRINT_SPEED,
  WALK_SPEED,
  WORLD_FOV,
} from '@/game/constants';

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _wish = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _point = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const round3 = (n) => Math.round(n * 1000) / 1000;
const dampFactor = (rate, dt) => 1 - Math.exp(-rate * dt);

export const Player = ({ initialPosition = { x: 0, y: 0, z: 0 }, isDead }) => {
  const bodyRef = useRef(); // Rapier rigid body
  const anchorRef = useRef(); // child of the RigidBody group, used to read the interpolated position
  const viewModelRef = useRef();
  const impactsRef = useRef();
  const { camera } = useThree();
  const controls = useThree((s) => s.controls);
  const { world, rapier } = useRapier();
  const updatePlayer = usePlayerStore((s) => s.updatePlayer);

  const downRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
  const shotRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }), [rapier]);

  // Per-frame state, shared with the view model (read-only there).
  const state = useMemo(
    () => ({
      vel: new THREE.Vector3(),
      speed: 0,
      verticalSpeed: 0,
      grounded: false,
      lastGrounded: 0,
      lastJump: 0,
      sprinting: false,
      ads: 0,
      yaw: 0,
      pitch: 0,
      yawVel: 0,
      pitchVel: 0,
      lastShot: 0,
      drawUntil: 0,
      reloading: false,
      reloadUntil: 0,
      recoilPending: 0,
      recoilYawPending: 0,
      nextSend: 0,
      deadT: 0,
      isDead: false,
    }),
    []
  );
  state.isDead = !!isDead;

  useEffect(() => {
    const uninstall = installInput();
    initAudio(camera);
    document.addEventListener('mousedown', resumeAudio);

    // Fresh spawn: full magazine, level camera, draw animation.
    useRoundsStore.getState().reloadRounds();
    useHudStore.getState().setReloading(false);
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    camera.quaternion.setFromEuler(_euler.set(0, _euler.y, 0, 'YXZ'));
    state.drawUntil = performance.now() + DRAW_TIME * 1000;

    const onHit = ({ health }) => {
      updatePlayer(socket.id, 'health', health);
      playSound(health <= 0 ? 'death' : 'damage', { volume: 0.8 });
      useHudStore.getState().showDamage();
    };
    socket.on('hit', onHit);

    return () => {
      uninstall();
      document.removeEventListener('mousedown', resumeAudio);
      socket.off('hit', onHit);
      camera.fov = WORLD_FOV;
      camera.updateProjectionMatrix();
    };
  }, []);

  const startReload = (now) => {
    const ammo = useRoundsStore.getState().countRounds;
    if (state.reloading || state.isDead || ammo >= MAG_SIZE) return;
    const empty = ammo === 0;
    state.reloading = true;
    state.reloadUntil = now + (empty ? RELOAD_EMPTY_TIME : RELOAD_TIME) * 1000;
    viewModelRef.current?.reload(empty);
    playSound('reload', { volume: 0.7 });
    useHudStore.getState().setReloading(true);
  };

  const fire = (now, body) => {
    // Keep an exact cadence while the trigger is held.
    state.lastShot = now - state.lastShot < FIRE_INTERVAL * 2 ? state.lastShot + FIRE_INTERVAL : now;
    useRoundsStore.getState().decreaseRounds();

    // Spread: none when aiming, small when standing, larger when moving or airborne.
    let spread = 0.006;
    if (!state.grounded) spread = 0.05;
    else if (state.speed > 1) spread = 0.022;
    spread *= 1 - state.ads;

    camera.getWorldPosition(_origin);
    camera.getWorldDirection(_dir);
    if (spread > 0) {
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _tmp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      _dir.addScaledVector(_right, Math.cos(a) * r).addScaledVector(_tmp, Math.sin(a) * r).normalize();
    }

    shotRay.origin = { x: _origin.x, y: _origin.y, z: _origin.z };
    shotRay.dir = { x: _dir.x, y: _dir.y, z: _dir.z };
    const hit = world.castRayAndGetNormal(
      shotRay,
      MAX_SHOT_DISTANCE,
      true,
      undefined,
      undefined,
      undefined,
      body
    );

    let target = null;
    if (hit) {
      _point.copy(_origin).addScaledVector(_dir, hit.timeOfImpact);
      target = hit.collider.parent()?.userData?.playerId ?? null;
      if (target) {
        useHudStore.getState().showHitMarker();
        playHitTick();
        impactsRef.current?.blood(_point);
      } else {
        _normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        impactsRef.current?.bulletHole(_point, _normal);
      }
    }

    socket.emit('shoot', {
      o: { x: round3(_origin.x), y: round3(_origin.y), z: round3(_origin.z) },
      d: { x: _dir.x, y: _dir.y, z: _dir.z },
      target,
    });

    viewModelRef.current?.shot();
    playSound('shot', { volume: 0.55, detune: (Math.random() - 0.5) * 120 });

    // Camera recoil: mostly vertical, a little random horizontal. Applied over a few frames.
    const kick = 1 - state.ads * 0.5;
    state.recoilPending += (0.0045 + Math.random() * 0.003) * kick;
    state.recoilYawPending += (Math.random() - 0.5) * 0.004 * kick;
  };

  useFrame((_, rawDt) => {
    const body = bodyRef.current;
    if (!body || !anchorRef.current) return;
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    const dead = state.isDead;

    // --- look ------------------------------------------------------------
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (state.recoilPending > 1e-5 || Math.abs(state.recoilYawPending) > 1e-5) {
      const k = dampFactor(28, dt);
      const dp = state.recoilPending * k;
      const dy = state.recoilYawPending * k;
      state.recoilPending -= dp;
      state.recoilYawPending -= dy;
      _euler.x = THREE.MathUtils.clamp(_euler.x + dp, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
      _euler.y += dy;
      camera.quaternion.setFromEuler(_euler);
    }
    const yaw = _euler.y;
    const pitch = _euler.x;
    let dYaw = yaw - state.yaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    state.yawVel = THREE.MathUtils.lerp(state.yawVel, dYaw / Math.max(dt, 1e-3), dampFactor(20, dt));
    state.pitchVel = THREE.MathUtils.lerp(state.pitchVel, (pitch - state.pitch) / Math.max(dt, 1e-3), dampFactor(20, dt));
    state.yaw = yaw;
    state.pitch = pitch;

    // --- ground check ------------------------------------------------------
    const pos = body.translation();
    const linvel = body.linvel();
    downRay.origin = { x: pos.x, y: pos.y, z: pos.z };
    const ground = world.castRay(downRay, PLAYER_CENTER_TO_FEET + 0.15, true, undefined, undefined, undefined, body);
    if (ground && linvel.y < 2.5) state.lastGrounded = now;
    // Small grace period so walking over bumps/edges doesn't flicker airborne.
    state.grounded = now - state.lastGrounded < 120;

    // --- movement ----------------------------------------------------------
    const fx = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const sx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _wish.set(0, 0, 0).addScaledVector(_forward, fx).addScaledVector(_right, sx);
    if (_wish.lengthSq() > 0) _wish.normalize();

    state.sprinting = !dead && input.sprint && fx > 0 && !input.aim && !input.fire && state.grounded;
    let speed = state.sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (state.ads > 0.5) speed = ADS_SPEED;
    if (dead) speed = 0;
    _wish.multiplyScalar(speed);

    const accel = dampFactor(state.grounded ? GROUND_ACCEL : AIR_ACCEL, dt);
    state.vel.x += (_wish.x - state.vel.x) * accel;
    state.vel.z += (_wish.z - state.vel.z) * accel;

    let vy = linvel.y;
    if (!dead && input.jump && state.grounded && now - state.lastJump > 350) {
      vy = JUMP_VELOCITY;
      state.lastJump = now;
      state.lastGrounded = 0;
    }
    body.setLinvel({ x: state.vel.x, y: vy, z: state.vel.z }, true);
    state.speed = Math.hypot(linvel.x, linvel.z);
    state.verticalSpeed = linvel.y;

    if (pos.y < FALL_RESET_Y) {
      body.setTranslation({ x: -10, y: 40, z: 15 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // --- camera --------------------------------------------------------------
    // The RigidBody group is interpolated between physics steps; following it (instead of
    // the raw body translation) keeps the camera smooth on high refresh rate displays.
    const smooth = anchorRef.current.parent.position;
    state.deadT = dead ? Math.min(1, state.deadT + dt * 1.8) : 0;
    const deathDrop = state.deadT * state.deadT * (EYE_HEIGHT + PLAYER_CENTER_TO_FEET - 0.25);
    camera.position.set(smooth.x, smooth.y + EYE_HEIGHT - deathDrop, smooth.z);
    if (dead) {
      _euler.setFromQuaternion(camera.quaternion, 'YXZ');
      _euler.z = THREE.MathUtils.lerp(_euler.z, 0.5, dampFactor(3, dt));
      camera.quaternion.setFromEuler(_euler);
    }

    // --- aiming --------------------------------------------------------------
    const wantAds = !dead && input.aim && !state.reloading && !state.sprinting;
    state.ads += ((wantAds ? 1 : 0) - state.ads) * dampFactor(14, dt);
    const fov = THREE.MathUtils.lerp(WORLD_FOV, ADS_FOV, state.ads);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (controls) controls.pointerSpeed = 1 - state.ads * 0.35;

    // --- weapon ----------------------------------------------------------------
    if (state.reloading && now >= state.reloadUntil) {
      state.reloading = false;
      useRoundsStore.getState().reloadRounds();
      useHudStore.getState().setReloading(false);
    }
    if (input.reload) {
      input.reload = false;
      startReload(now);
    }
    const ammo = useRoundsStore.getState().countRounds;
    const ready = !dead && !state.reloading && now >= state.drawUntil;
    if (input.firePressed) {
      input.firePressed = false;
      if (ready && ammo === 0) {
        playSound('dryFire', { volume: 0.8 });
        startReload(now);
      }
    }
    if (ready && input.fire && ammo > 0 && now - state.lastShot >= FIRE_INTERVAL) {
      fire(now, body);
    }

    // --- network -------------------------------------------------------------------
    if (now >= state.nextSend) {
      state.nextSend = Math.max(state.nextSend + NET_SEND_INTERVAL, now);
      const flags =
        (state.grounded ? FLAG_GROUNDED : 0) |
        (state.sprinting ? FLAG_SPRINT : 0) |
        (state.ads > 0.5 ? FLAG_AIM : 0) |
        (state.reloading ? FLAG_RELOAD : 0);
      socket.volatile.emit('move', {
        t: Math.round(now),
        p: [round3(pos.x), round3(pos.y), round3(pos.z)],
        yaw: round3(yaw),
        pitch: round3(pitch),
        f: flags,
      });
    }
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        position={[initialPosition.x, initialPosition.y, initialPosition.z]}
        colliders={false}
        mass={1}
        lockRotations
        canSleep={false}
      >
        <CapsuleCollider args={[PLAYER_HALF_HEIGHT, PLAYER_RADIUS]} friction={0} />
        <group ref={anchorRef} />
      </RigidBody>
      <Impacts ref={impactsRef} />
      <ViewModel ref={viewModelRef} player={state} visible={!isDead} />
    </>
  );
};
