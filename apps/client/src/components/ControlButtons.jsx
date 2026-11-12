import WeaponIcon from '@/UI/WeaponIcon';
import { CONTROLS, placement } from './controls';
import styles from './TouchControls.module.scss';

const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const Trigger = () => (
  <Icon>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Icon>
);

const face = (id, { weapon, medkits }) => {
  switch (id) {
    case 'fire':
    case 'fireLeft':
      return <Trigger />;
    case 'aim':
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </Icon>
      );
    case 'jump':
      return (
        <Icon>
          <path d="M6 13l6-6 6 6" />
          <path d="M6 19l6-6 6 6" />
        </Icon>
      );
    case 'reload':
      return (
        <Icon>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v5h-5" />
        </Icon>
      );
    case 'weapon':
      // The gun in hand; a tap takes the next one.
      return <WeaponIcon id={weapon} />;
    case 'medkit':
      return (
        <>
          <WeaponIcon id="medkit" />
          <span className={styles.badge}>{medkits}</span>
        </>
      );
  }
};

/**
 * The on-screen buttons, in the box inside the safe areas, each where `layout` (store/SettingsStore.ts) puts it or
 * where the stylesheet does. `opacity` is the settings' button opacity. In the layout editor (`editing`) hidden
 * buttons show faintly instead of not at all, and `selected` is outlined; `className` goes on the box.
 */
const ControlButtons = ({ ref, className = '', layout, opacity, weapon, medkits, isAiming, editing = false, selected = null }) => (
  <div ref={ref} className={`${styles.area} ${className}`} style={{ '--alpha': opacity }}>
    {CONTROLS.map(({ id, role, label, looks }) => {
      const place = layout[id];
      if (place?.hidden && !editing) return null;
      const classes = [
        styles.button,
        styles[id],
        role === 'fire' && styles.trigger,
        id === 'aim' && isAiming && styles.on,
        id === 'medkit' && !medkits && styles.used,
        editing && place?.hidden && styles.hidden,
        selected === id && styles.selected,
      ];
      return (
        <div
          key={id}
          data-btn={role}
          data-control={id}
          data-looks={looks || undefined}
          className={classes.filter(Boolean).join(' ')}
          style={placement(place)}
          aria-label={label}
        >
          {face(id, { weapon, medkits })}
        </div>
      );
    })}
  </div>
);

export default ControlButtons;
