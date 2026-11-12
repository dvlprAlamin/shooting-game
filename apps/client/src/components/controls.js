// The on-screen buttons, shared by the touch controls and the layout editor (UI/Settings/LayoutEditor.jsx).

export const MOVE_ZONE = 0.45; // left share of the screen that drives the stick; the rest is look

/**
 * In the order the layout editor lists them. `role`: what a press does (TouchControls); `looks`: dragging on it turns
 * you as well, so you can shoot and track a target with one thumb; `fixed`: can't be hidden. The left fire button is
 * for shooting with the left thumb while the right one aims, so it doesn't look.
 */
export const CONTROLS = [
  { id: 'fire', role: 'fire', label: 'Fire', looks: true, fixed: true },
  { id: 'fireLeft', role: 'fire', label: 'Left fire' },
  { id: 'aim', role: 'aim', label: 'Aim' },
  { id: 'jump', role: 'jump', label: 'Jump' },
  { id: 'reload', role: 'reload', label: 'Reload' },
  { id: 'weapon', role: 'weapon', label: 'Next weapon' },
  { id: 'medkit', role: 'medkit', label: 'Medkit' },
];

/** Inline style for a button moved or resized in the settings (store/SettingsStore.ts); undefined: as designed. */
export const placement = (place) => {
  if (!place) return undefined;
  const style = {};
  if (place.x != null) {
    Object.assign(style, { left: `${place.x * 100}%`, top: `${place.y * 100}%`, right: 'auto', bottom: 'auto', translate: '-50% -50%' });
  }
  if (place.size != null && place.size !== 1) style.scale = String(place.size);
  return style;
};
