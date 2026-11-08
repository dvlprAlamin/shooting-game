import { useEffect, useRef } from 'react';
import { input, releaseAll, setAim } from '@/game/input';
import { useAimingStore } from '@/store/AimingStore';
import styles from './TouchControls.module.scss';

const STICK_RADIUS = 52; // px the knob can travel from the stick centre
const DEAD_ZONE = 0.12;
const SPRINT_PUSH = 0.9; // forward push (0..1) that starts sprinting
const MOVE_ZONE = 0.45; // left share of the screen that drives the stick; the rest is look

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

/**
 * On-screen controls for phones: a floating stick (left), drag-to-look (right), and fire/aim/jump/reload
 * buttons. Writes into the shared `input` state the player reads every frame. The fire button also
 * looks while held, so you can shoot and track a target with one thumb.
 */
const TouchControls = () => {
  const rootRef = useRef();
  const stickRef = useRef();
  const knobRef = useRef();
  const isAiming = useAimingStore((s) => s.isAiming);

  useEffect(() => {
    const root = rootRef.current;
    const stickEl = stickRef.current;
    const knobEl = knobRef.current;
    const pointers = new Map(); // pointerId -> { role, x, y, el }
    let stick = null; // centre of the active stick

    const held = (role) => {
      for (const p of pointers.values()) if (p.role === role) return true;
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
      const p = { role, x: e.clientX, y: e.clientY, el };
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
      } else if (p.role === 'look' || p.role === 'fire') {
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
      if (!held(p.role)) press(p, false);
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

      <div data-btn="reload" className={`${styles.button} ${styles.reload}`}>
        <Icon>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </Icon>
      </div>
      <div data-btn="fire" className={`${styles.button} ${styles.fire}`}>
        <Icon>
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </Icon>
      </div>
      <div data-btn="aim" className={`${styles.button} ${styles.aim} ${isAiming ? styles.on : ''}`}>
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </Icon>
      </div>
      <div data-btn="jump" className={`${styles.button} ${styles.jump}`}>
        <Icon>
          <path d="M6 13l6-6 6 6" />
          <path d="M6 19l6-6 6 6" />
        </Icon>
      </div>

      <div className={styles.rotate}>Rotate your device to landscape</div>
    </div>
  );
};

export default TouchControls;
