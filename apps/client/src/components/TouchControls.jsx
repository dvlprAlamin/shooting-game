import { useEffect, useRef } from 'react';
import { input, releaseAll, setAim } from '@/game/input';
import { useAimingStore } from '@/store/AimingStore';
import { useSettingsStore } from '@/store/SettingsStore';
import { useWeaponStore } from '@/store/WeaponStore';
import ControlButtons from './ControlButtons';
import { MOVE_ZONE } from './controls';
import styles from './TouchControls.module.scss';

const STICK_RADIUS = 52; // px the knob can travel from the stick centre
const DEAD_ZONE = 0.12;
const SPRINT_PUSH = 0.9; // forward push (0..1) that starts sprinting

/**
 * On-screen controls for phones: a floating stick (left), drag-to-look (right), and the buttons (ControlButtons):
 * fire on both sides, aim, jump, reload, the gun in hand (tap for the next) and the medkit, laid out as the
 * settings say. Writes into the shared `input` state the player reads every frame. The right fire button also
 * looks while held, so you can shoot and track a target with one thumb.
 */
const TouchControls = () => {
  const rootRef = useRef();
  const stickRef = useRef();
  const knobRef = useRef();
  const isAiming = useAimingStore((s) => s.isAiming);
  const weapon = useWeaponStore((s) => s.weapon);
  const medkits = useWeaponStore((s) => s.medkits);
  const layout = useSettingsStore((s) => s.layout);
  const opacity = useSettingsStore((s) => s.buttonOpacity);

  useEffect(() => {
    const root = rootRef.current;
    const stickEl = stickRef.current;
    const knobEl = knobRef.current;
    const pointers = new Map(); // pointerId -> { role, x, y, el, looks }
    let stick = null; // centre of the active stick

    const held = (role) => {
      for (const p of pointers.values()) if (p.role === role) return true;
      return false;
    };
    const touched = (el) => {
      for (const p of pointers.values()) if (p.el === el) return true;
      return false;
    };
    // Hold highlight for momentary buttons; aim is a toggle and React renders its state.
    const press = (p, on) => p.role !== 'aim' && p.el?.classList.toggle(styles.pressed, on);

    const moveStick = (x, y) => {
      let dx = x - stick.x;
      let dy = y - stick.y;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_RADIUS) {
        dx *= STICK_RADIUS / dist;
        dy *= STICK_RADIUS / dist;
      }
      knobEl.style.transform = `translate(${dx}px, ${dy}px)`;

      // Rescale past the dead zone so movement starts from zero instead of jumping.
      const m = Math.min(dist / STICK_RADIUS, 1);
      const k = m < DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE) / m;
      input.moveX = (dx / STICK_RADIUS) * k;
      input.moveY = (-dy / STICK_RADIUS) * k;
      input.stickSprint = -dy / STICK_RADIUS > SPRINT_PUSH;
      stickEl.classList.toggle(styles.sprint, input.stickSprint);
    };

    const resetStick = () => {
      stick = null;
      input.moveX = input.moveY = 0;
      input.stickSprint = false;
      stickEl.style.left = stickEl.style.top = '';
      stickEl.classList.remove(styles.active, styles.sprint);
      knobEl.style.transform = '';
    };

    const onDown = (e) => {
      e.preventDefault();
      const el = e.target.closest('[data-btn]');
      let role = el?.dataset.btn;
      if (!role) role = e.clientX < window.innerWidth * MOVE_ZONE ? 'move' : 'look';
      if ((role === 'move' && stick) || (role === 'look' && held('look'))) return; // one finger each

      root.setPointerCapture(e.pointerId);
      const p = { role, x: e.clientX, y: e.clientY, el, looks: role === 'look' || !!el?.dataset.looks };
      pointers.set(e.pointerId, p);
      press(p, true);

      switch (role) {
        case 'move':
          // The stick appears under the thumb.
          stick = { x: e.clientX, y: e.clientY };
          stickEl.style.left = `${e.clientX}px`;
          stickEl.style.top = `${e.clientY}px`;
          stickEl.classList.add(styles.active);
          moveStick(e.clientX, e.clientY);
          break;
        case 'fire':
          input.fire = true;
          input.firePressed = true;
          break;
        case 'jump':
          input.jump = true;
          break;
        case 'reload':
          input.reload = true;
          break;
        case 'weapon':
          input.cycle = 1;
          break;
        case 'medkit':
          input.heal = true;
          break;
        case 'aim':
          setAim(!input.aim);
          break;
      }
    };

    const onMove = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      if (p.role === 'move') {
        moveStick(e.clientX, e.clientY);
      } else if (p.looks) {
        input.lookX += e.clientX - p.x;
        input.lookY += e.clientY - p.y;
      }
      p.x = e.clientX;
      p.y = e.clientY;
    };

    const release = (id) => {
      const p = pointers.get(id);
      if (!p) return;
      pointers.delete(id);
      if (!touched(p.el)) press(p, false); // both fire buttons can be held: each lets go on its own
      if (p.role === 'move') resetStick();
      else if (p.role === 'fire' && !held('fire')) input.fire = false;
      else if (p.role === 'jump' && !held('jump')) input.jump = false;
    };
    const onUp = (e) => release(e.pointerId);

    const releaseEverything = () => {
      for (const id of [...pointers.keys()]) release(id);
      releaseAll();
    };
    const onVisibility = () => {
      if (document.hidden) releaseEverything();
    };

    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('lostpointercapture', onUp);
    window.addEventListener('blur', releaseEverything);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('lostpointercapture', onUp);
      window.removeEventListener('blur', releaseEverything);
      document.removeEventListener('visibilitychange', onVisibility);
      releaseEverything();
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={stickRef} className={styles.stick}>
        <div ref={knobRef} className={styles.knob} />
      </div>

      <ControlButtons layout={layout} opacity={opacity} weapon={weapon} medkits={medkits} isAiming={isAiming} />

      <div className={styles.rotate}>Rotate your device to landscape</div>
    </div>
  );
};

export default TouchControls;
