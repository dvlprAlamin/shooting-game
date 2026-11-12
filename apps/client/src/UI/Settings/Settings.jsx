import { useId, useRef, useState } from 'react';
import { IS_TOUCH, PRIVACY_URL } from '@/config';
import { DEFAULT_SETTINGS, LOOK_SPEED, useSettingsStore } from '@/store/SettingsStore';
import Credits from '../Credits/Credits';
import Button from '../elements/Button';
import AccountSettings from './AccountSettings';
import LayoutEditor from './LayoutEditor';
import styles from './Settings.module.scss';

const TABS = [
  { value: 'controls', label: 'Controls' },
  { value: 'account', label: 'Account' },
  { value: 'about', label: 'About' },
];

// Tapping outside closes the dialog: `closedby="any"`, which Safari lacks, so there it's done here. Pressed and
// released outside the box, so a drag that ends there doesn't close it.
const NATIVE_DISMISS = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
const outside = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

const SettingsIcon = () => (
  <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

const Controls = ({ onEditLayout }) => {
  const lookSpeed = useSettingsStore((s) => s.lookSpeed);
  const change = useSettingsStore((s) => s.change);
  const id = useId();
  return (
    <>
      <section className={styles.section}>
        <label className={styles.heading} htmlFor={id}>
          Look sensitivity
        </label>
        <p className={styles.note}>How fast {IS_TOUCH ? 'dragging' : 'the mouse'} turns you.</p>
        <div className={styles.range}>
          <input
            id={id}
            type="range"
            min={LOOK_SPEED.min}
            max={LOOK_SPEED.max}
            step={LOOK_SPEED.step}
            value={lookSpeed}
            onChange={(e) => change({ lookSpeed: Number(e.target.value) })}
          />
          <output htmlFor={id}>{lookSpeed.toFixed(1)}×</output>
          <Button
            variant="quiet"
            disabled={lookSpeed === DEFAULT_SETTINGS.lookSpeed}
            onClick={() => change({ lookSpeed: DEFAULT_SETTINGS.lookSpeed })}
          >
            Reset
          </Button>
        </div>
      </section>
      {IS_TOUCH && (
        <section className={styles.section}>
          <h3 className={styles.heading}>On-screen buttons</h3>
          <p className={styles.note}>Move, resize or hide the buttons, and make them more see-through.</p>
          <div className={styles.buttons}>
            <Button variant="quiet" onClick={onEditLayout}>
              Edit layout
            </Button>
          </div>
        </section>
      )}
    </>
  );
};

const About = () => (
  <>
    <section className={styles.section}>
      <h3 className={styles.heading}>Credits</h3>
      <Credits />
    </section>
    <section className={styles.section}>
      <h3 className={styles.heading}>Privacy</h3>
      <p className={styles.note}>What RimFire keeps about you, and how to have it deleted.</p>
      <div className={styles.buttons}>
        <Button variant="quiet" href={PRIVACY_URL} target="_blank" rel="noreferrer">
          Privacy policy
        </Button>
      </div>
    </section>
  </>
);

/**
 * The menu's Settings button and its dialog: Controls (look sensitivity, the touch button layout), Account and About
 * (credits, the privacy policy). `record` and `onProfile` are the menu's record, for the Account tab.
 */
const Settings = ({ record, onProfile }) => {
  const dialog = useRef(null);
  const pressedOutside = useRef(false);
  const [tab, setTab] = useState('controls');
  const [editing, setEditing] = useState(false);
  const dismiss = NATIVE_DISMISS
    ? {}
    : {
        onPointerDown: (e) => {
          pressedOutside.current = outside(e);
        },
        onPointerUp: (e) => {
          if (pressedOutside.current && outside(e)) dialog.current.close();
        },
      };

  return (
    <>
      <Button variant="quiet" onClick={() => dialog.current.showModal()}>
        <SettingsIcon />
        Settings
      </Button>
      <dialog ref={dialog} className={styles.dialog} closedby="any" aria-labelledby="settings-title" {...dismiss}>
        <div className={styles.head}>
          <h2 id="settings-title" className={styles.title}>
            Settings
          </h2>
          <form method="dialog">
            <Button type="submit" variant="quiet">
              Close
            </Button>
          </form>
        </div>
        <fieldset className={styles.tabs}>
          <legend className="sr-only">Section</legend>
          {TABS.map(({ value, label }) => (
            <label key={value} className={styles.tab}>
              <input type="radio" name="settings-tab" value={value} checked={tab === value} onChange={() => setTab(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        <div className={styles.body}>
          {tab === 'controls' && <Controls onEditLayout={() => setEditing(true)} />}
          {tab === 'account' && <AccountSettings record={record} onProfile={onProfile} />}
          {tab === 'about' && <About />}
        </div>
      </dialog>
      {editing && <LayoutEditor onClose={() => setEditing(false)} />}
    </>
  );
};

export default Settings;
