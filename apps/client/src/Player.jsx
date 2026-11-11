import * as THREE from 'three';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import { socket } from '@/net/socket';
import { isProtected } from '@/net/remotePlayers';
import { input, installInput } from '@/game/input';
import { initAudio, playHitTick, playSound, resumeAudio } from '@/game/audio';
import { usePlayerStore } from '@/store/PlayersStore';
import { useWeaponStore } from '@/store/WeaponStore';
import { useHudStore } from '@/store/HudStore';
import { ViewModel } from '@/ViewModel';
import { Impacts } from '@/Impacts';
import { SOUNDS } from '@/weapons/items';
import { MAX_HEALTH } from '@rimfire/shared';
import { MEDKIT, WEAPONS, getWeapon } from '@rimfire/shared/weapons';
import {
  ADS_SPEED,
  AIR_ACCEL,
  EYE_HEIGHT,
  FLAG_AIM,
  FLAG_GROUNDED,
  FLAG_RELOAD,
  FLAG_SPRINT,
  GROUND_ACCEL,
  HEAD_HEIGHT,
  JUMP_VELOCITY,
  MAX_SHOT_DISTANCE,
  NET_SEND_INTERVAL,
  PLAYER_CENTER_TO_FEET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
  SPRINT_SPEED,
  TOUCH_LOOK_SPEED,
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
// A semi-automatic gun pressed a little too soon still fires, once it can, within this long (ms).
const SHOT_BUFFER = 250;
// Moving while using the medkit.
const HEAL_SPEED = 0.6;
// Look speed while aiming, against hip fire (a scope slows it in step with its zoom instead).
const AIM_LOOK = 0.65;

// `initialYaw`: the way to face on spawning. `fall`: below this height you've fallen out of the map and are put
// back at `fallReset`.
export const Player = memo(function Player({
  initialPosition = { x: 0, y: 0, z: 0 },
  initialYaw,
  fall,
  fallReset,
  isDead,
}) {
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
      queuedShot: 0, // when a semi-automatic gun's trigger was pressed (0: not waiting to fire)
      // What the view model shows and when: the item in hand ('medkit' while healing), drawing it, reloading.
      equipped: null,
      lastWeapon: null, // the gun before this one, for swapping back
      drawStart: 0,
      drawUntil: 0,
      reloading: false,
      reloadEmpty: false,
      reloadStart: 0,
      reloadUntil: 0,
      healStart: 0,
      healUntil: 0, // using the medkit until then (0: not)
      scoped: false, // looking through a scope (the view model hides)
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
    document.addEventListener('touchend', resumeAudio);

    // Fresh spawn: full magazines and a medkit, level camera facing the way the spawn point says. The first
    // frame draws the gun in hand.
    useWeaponStore.getState().rearm();
    useHudStore.getState().setReloading(false);
    useHudStore.getState().setScoped(false);
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = Number.isFinite(initialYaw) ? initialYaw : _euler.y;
    camera.quaternion.setFromEuler(_euler.set(0, yaw, 0, 'YXZ'));

    const onHit = ({ health }) => {
      updatePlayer(socket.id, 'health', health);
      playSound(health <= 0 ? 'death' : 'damage', { volume: 0.8 });
      useHudStore.getState().showDamage();
    };
    socket.on('hit', onHit);

    return () => {
      uninstall();
      document.removeEventListener('mousedown', resumeAudio);
      document.removeEventListener('touchend', resumeAudio);
      socket.off('hit', onHit);
      camera.fov = WORLD_FOV;
      camera.updateProjectionMatrix();
      useHudStore.getState().setScoped(false);
    };
  }, []);

  const stopReload = () => {
    if (!state.reloading) return;
    state.reloading = false;
    useHudStore.getState().setReloading(false);
  };

  // Puts `id` in hand: drawing it takes its draw time, and a reload of the last gun stops.
  const equip = (id, now) => {
    const weapon = getWeapon(id);
    stopReload();
    state.equipped = weapon.id;
    state.queuedShot = 0;
    state.drawStart = now;
    state.drawUntil = now + weapon.drawTime;
  };

  // A key, the wheel or a tap asked for another gun.
  const selectWeapon = (id) => {
    const store = useWeaponStore.getState();
    if (id === store.weapon) return;
    state.lastWeapon = store.weapon;
    store.setWeapon(id);
    socket.emit('switchWeapon', { w: id });
  };

  const startHeal = (now) => {
    const store = useWeaponStore.getState();
    const health = usePlayerStore.getState().players[socket.id]?.health ?? MAX_HEALTH;
    if (state.isDead || state.healUntil || store.medkits <= 0 || health >= MAX_HEALTH) return;
    stopReload();
    store.useMedkit();
    state.equipped = 'medkit';
    state.healStart = now;
    state.healUntil = now + MEDKIT.useTime;
    playSound('reload', { volume: 0.5, detune: 700 });
    socket.emit('heal');
  };

  const startReload = (now) => {
    const store = useWeaponStore.getState();
    const weapon = getWeapon(store.weapon);
    const ammo = store.rounds[weapon.id];
    if (state.reloading || state.isDead || state.healUntil || now < state.drawUntil || ammo >= weapon.magSize) return;
    const empty = ammo === 0;
    const time = empty ? weapon.reloadEmptyTime : weapon.reloadTime;
    state.reloading = true;
    state.reloadEmpty = empty;
    state.reloadStart = now;
    state.reloadUntil = now + time;
    playSound('reload', { volume: 0.7, detune: weapon.id === 'pistol' ? 500 : 0 });
    useHudStore.getState().setReloading(true, time);
    socket.emit('reload');
  };

  const fire = (now, body, weapon) => {
    // Keep an exact cadence while the trigger of an automatic gun is held.
    const interval = weapon.fireInterval;
    state.lastShot = weapon.auto && now - state.lastShot < interval * 2 ? state.lastShot + interval : now;
    useWeaponStore.getState().useRound();
    // Firing gives up your spawn protection (the server ends it too).
    const hud = useHudStore.getState();
    if (hud.protectedUntil) hud.setProtection(0);

    // Spread: small when standing, larger when moving or airborne, the gun's aimed spread when aiming.
    const { spread: s } = weapon;
    let spread = !state.grounded ? s.air : state.speed > 1 ? s.move : s.stand;
    spread = THREE.MathUtils.lerp(spread, s.aim, state.ads);

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
    let head = false;
    if (hit) {
      _point.copy(_origin).addScaledVector(_dir, hit.timeOfImpact);
      target = hit.collider.parent()?.userData?.playerId ?? null;
      if (target) {
        // The collider's translation is the capsule centre; the top of the capsule is the head.
        head = _point.y - hit.collider.translation().y >= HEAD_HEIGHT;
        // Spawn-protected players and teammates take no damage, so they get no hit feedback either.
        const { players } = usePlayerStore.getState();
        const team = players[socket.id]?.team;
        if (!isProtected(target) && !(team && players[target]?.team === team)) {
          hud.showHitMarker(head ? 'head' : 'hit');
          playHitTick(head);
          impactsRef.current?.blood(_point);
        }
      } else {
        _normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        impactsRef.current?.bulletHole(_point, _normal);
      }
    }

    socket.emit('shoot', {
      o: { x: round3(_origin.x), y: round3(_origin.y), z: round3(_origin.z) },
      d: { x: _dir.x, y: _dir.y, z: _dir.z },
      target,
      head,
    });

    viewModelRef.current?.shot();
    const sound = SOUNDS[weapon.id];
    playSound('shot', { volume: sound.volume, detune: sound.detune + (Math.random() - 0.5) * 120 });

    // Camera recoil: mostly vertical, a little random horizontal. Applied over a few frames.
    const { recoil } = weapon;
    const kick = 1 - state.ads * 0.5;
    state.recoilPending += (recoil.kick + Math.random() * recoil.kickRandom) * kick;
    state.recoilYawPending += (Math.random() - 0.5) * recoil.yaw * kick;
  };

  useFrame((_, rawDt) => {
    const body = bodyRef.current;
    if (!body || !anchorRef.current) return;
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    const dead = state.isDead;
    const weapons = useWeaponStore.getState();
    const weapon = getWeapon(weapons.weapon);
    const lookSpeed = THREE.MathUtils.lerp(1, weapon.scope ? weapon.aimFov / WORLD_FOV : AIM_LOOK, state.ads);

    // --- look ------------------------------------------------------------
    _euler.setFromQuaternion(camera.quaternion, 'YXZ');
    if (input.lookX || input.lookY) {
      // Touch drag (mouse look goes through PointerLockControls). Slower while aiming, like pointerSpeed.
      if (!dead) {
        const k = TOUCH_LOOK_SPEED * lookSpeed;
        _euler.y -= input.lookX * k;
        _euler.x = THREE.MathUtils.clamp(_euler.x - input.lookY * k, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        camera.quaternion.setFromEuler(_euler);
      }
      input.lookX = input.lookY = 0;
    }
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
    // Keys are digital; the touch stick is analog (a partial push walks slower).
    const fx = THREE.MathUtils.clamp((input.forward ? 1 : 0) - (input.backward ? 1 : 0) + input.moveY, -1, 1);
    const sx = THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.moveX, -1, 1);
    _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _wish.set(0, 0, 0).addScaledVector(_forward, fx).addScaledVector(_right, sx);
    if (_wish.lengthSq() > 1) _wish.normalize();

    state.sprinting = !dead && (input.sprint || input.stickSprint) && fx > 0 && !input.aim && !input.fire && state.grounded;
    let speed = state.sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (state.ads > 0.5) speed = ADS_SPEED;
    speed *= weapon.speed * (state.healUntil ? HEAL_SPEED : 1);
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

    if (pos.y < fall) {
      body.setTranslation({ x: fallReset.x, y: fallReset.y, z: fallReset.z }, true);
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

    // --- weapons ---------------------------------------------------------------
    // Switching: a number key or a tap picks a gun, the wheel steps through them, Q goes back. Not while
    // dead or using the medkit.
    if (!dead && !state.healUntil) {
      let next = input.select;
      if (!next && input.swapBack) next = state.lastWeapon;
      if (!next && input.cycle) {
        const i = WEAPONS.findIndex((w) => w.id === weapons.weapon);
        next = WEAPONS[(i + input.cycle + WEAPONS.length) % WEAPONS.length].id;
      }
      if (next) selectWeapon(next);
    }
    input.select = null;
    input.swapBack = false;
    input.cycle = 0;
    if (input.heal) {
      input.heal = false;
      startHeal(now);
    }
    if (state.healUntil && now >= state.healUntil) {
      state.healUntil = 0;
      useWeaponStore.getState().setHealing(false);
    }
    // Whatever put a gun in hand (a key, the end of healing, the server after a reconnect), draw it.
    const held = useWeaponStore.getState().weapon;
    if (!state.healUntil && state.equipped !== held) equip(held, now);
    const gun = getWeapon(held);

    if (state.reloading && now >= state.reloadUntil) {
      state.reloading = false;
      useWeaponStore.getState().refill();
      useHudStore.getState().setReloading(false);
    }
    if (input.reload) {
      input.reload = false;
      startReload(now);
    }
    const ammo = useWeaponStore.getState().rounds[gun.id];
    const ready = !dead && !state.reloading && !state.healUntil && now >= state.drawUntil;
    if (input.firePressed) {
      input.firePressed = false;
      if (ready && ammo === 0) {
        playSound('dryFire', { volume: 0.8 });
        startReload(now);
      } else if (!gun.auto) {
        state.queuedShot = now;
      }
    }
    if (ready && ammo > 0 && now - state.lastShot >= gun.fireInterval) {
      const pulled = gun.auto ? input.fire : state.queuedShot && now - state.queuedShot < SHOT_BUFFER;
      if (pulled) {
        state.queuedShot = 0;
        fire(now, body, gun);
      }
    }

    // --- aiming --------------------------------------------------------------
    const wantAds = !dead && input.aim && !state.reloading && !state.sprinting && !state.healUntil;
    state.ads += ((wantAds ? 1 : 0) - state.ads) * dampFactor(14, dt);
    const fov = THREE.MathUtils.lerp(WORLD_FOV, gun.aimFov, state.ads);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    if (controls) controls.pointerSpeed = lookSpeed;
    // Nearly aimed with a scope: the scope view replaces the gun.
    const scoped = !!gun.scope && state.ads > 0.9 && !dead;
    state.scoped = scoped;
    if (useHudStore.getState().scoped !== scoped) useHudStore.getState().setScoped(scoped);

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
});
