import { useEffect, useRef, useState } from 'react';
import { MEDKIT } from '@rimfire/shared/weapons';
import ControlButtons from '@/components/ControlButtons';
import { CONTROLS, MOVE_ZONE } from '@/components/controls';
import touch from '@/components/TouchControls.module.scss';
import { BUTTON_OPACITY, BUTTON_SIZE, DEFAULT_SETTINGS, useSettingsStore } from '@/store/SettingsStore';
import { useWeaponStore } from '@/store/WeaponStore';
import Button from '../elements/Button';
import styles from './LayoutEditor.module.scss';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round = (v) => Math.round(v * 10000) / 10000;
const percent = (v) => `${Math.round(v * 100)}%`;

/**
 * Full screen over the menu: the touch buttons as a match shows them, over where the stick and the crosshair go. Drag
 * a button to move it; the one picked last can be resized or hidden, and all of them made more see-through. Save keeps
 * the layout (store/SettingsStore.ts); Cancel, or Escape, drops the changes.
 */
const LayoutEditor = ({ onClose }) => {
  const dialog = useRef(null);
  const area = useRef(null);
  const toolbar = useRef(null);
  const drag = useRef(null); // { id, pointerId, dx, dy }: the button being moved, and the finger's offset from its centre
  const [layout, setLayout] = useState(() => useSettingsStore.getState().layout);
  const [opacity, setOpacity] = useState(() => useSettingsStore.getState().buttonOpacity);
  const [selected, setSelected] = useState(null);
  const weapon = useWeaponStore((s) => s.weapon);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  const buttonOf = (id) => area.current.querySelector(`[data-control="${id}"]`);
  const centreOf = (id) => {
    const r = buttonOf(id).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  // Button `id` centred on (cx, cy) at `size`, kept whole inside the box: its centre as shares of the box.
  const position = (id, cx, cy, size) => {
    const el = buttonOf(id);
    const box = area.current.getBoundingClientRect();
    const hw = (el.offsetWidth * size) / 2;
    const hh = (el.offsetHeight * size) / 2;
    return {
      x: round((clamp(cx, box.left + hw, box.right - hw) - box.left) / box.width),
      y: round((clamp(cy, box.top + hh, box.bottom - hh) - box.top) / box.height),
    };
  };
  const update = (id, changes) => setLayout((l) => ({ ...l, [id]: { ...l[id], ...changes } }));

  const onPointerDown = (e) => {
    const el = e.target.closest('[data-control]');
    if (!el) {
      if (!toolbar.current.contains(e.target)) setSelected(null);
      return;
    }
    e.preventDefault();
    const id = el.dataset.control;
    const [cx, cy] = centreOf(id);
    drag.current = { id, pointerId: e.pointerId, dx: e.clientX - cx, dy: e.clientY - cy };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelected(id);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (d?.pointerId !== e.pointerId) return;
    update(d.id, position(d.id, e.clientX - d.dx, e.clientY - d.dy, layout[d.id]?.size ?? 1));
  };
  const endDrag = (e) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  // Resized about its centre, and kept on screen.
  const resize = (size) => {
    const [cx, cy] = centreOf(selected);
    update(selected, { size, ...position(selected, cx, cy, size) });
  };
  const reset = () => {
    setLayout(DEFAULT_SETTINGS.layout);
    setOpacity(DEFAULT_SETTINGS.buttonOpacity);
  };
  const save = () => {
    useSettingsStore.getState().change({ layout, buttonOpacity: opacity });
    dialog.current.close();
  };

  const control = CONTROLS.find((c) => c.id === selected);
  const place = layout[selected] ?? {};

  return (
    <dialog
      ref={dialog}
      className={styles.editor}
      aria-label="Button layout"
      onClose={onClose}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <div className={styles.zone} style={{ width: `${MOVE_ZONE * 100}%` }}>
        <span>Move stick</span>
      </div>
      <div className={touch.stick}>
        <div className={touch.knob} />
      </div>
      <div className={styles.crosshair} />

      <ControlButtons
        ref={area}
        className={styles.buttons}
        layout={layout}
        opacity={opacity}
        weapon={weapon}
        medkits={MEDKIT.perLife}
        editing
        selected={selected}
      />

      <div ref={toolbar} className={styles.toolbar}>
        <div className={styles.row}>
          {control ? (
            <>
              <span className={styles.name}>{control.label}</span>
              <label className={styles.slider}>
                Size
                <input
                  type="range"
                  min={BUTTON_SIZE.min}
                  max={BUTTON_SIZE.max}
                  step={BUTTON_SIZE.step}
                  value={place.size ?? 1}
                  onChange={(e) => resize(Number(e.target.value))}
                />
                <output>{percent(place.size ?? 1)}</output>
              </label>
              {control.fixed ? (
                <span className={styles.fixed}>Always shown</span>
              ) : (
                <Button variant="quiet" onClick={() => update(selected, { hidden: !place.hidden })}>
                  {place.hidden ? 'Show' : 'Hide'}
                </Button>
              )}
            </>
          ) : (
            <p className={styles.hint}>Drag a button to move it. Tap one to resize or hide it.</p>
          )}
        </div>
        <div className={styles.row}>
          <label className={styles.slider}>
            Opacity
            <input
              type="range"
              min={BUTTON_OPACITY.min}
              max={BUTTON_OPACITY.max}
              step={BUTTON_OPACITY.step}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
            />
            <output>{percent(opacity)}</output>
          </label>
          <Button variant="quiet" onClick={reset}>
            Reset
          </Button>
          <Button variant="quiet" onClick={() => dialog.current.close()}>
            Cancel
          </Button>
          <Button variant="quiet" className={styles.save} onClick={save}>
            Save
          </Button>
        </div>
      </div>

      <div className={`${touch.rotate} ${styles.rotate}`}>Rotate your device to landscape</div>
    </dialog>
  );
};

export default LayoutEditor;
