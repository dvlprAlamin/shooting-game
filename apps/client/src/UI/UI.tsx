import NumberOfRounds from '@/UI/NumberOfRounds/NumberOfRounds.tsx';
import { IAimingStore, useAimingStore } from '@/store/AimingStore.ts';
import { IHudStore, useHudStore } from '@/store/HudStore.ts';
import styles from '@/UI/UI.module.scss';
import blood from '@/assets/textures/blood_256x256.png';
import Reloading from '@/UI/Reloading.jsx';
import WeaponSlots from '@/UI/WeaponSlots/WeaponSlots.jsx';
import { useWeaponStore } from '@/store/WeaponStore.ts';
import { KEEPS_CROSSHAIR } from '@/weapons/items';
import { IS_TOUCH } from '@/config';

const HitMarker = () => {
  const marker = useHudStore((s: IHudStore) => s.marker);
  if (!marker.n) return null;
  // Remounting via `key` restarts the CSS animation on every hit.
  return <div key={marker.n} className={`${styles.hitMarker} ${styles[marker.kind] ?? ''}`} />;
};

// Your streaks and headshot kills, over the crosshair. Screen readers get it from the kill feed.
const Callout = () => {
  const callout = useHudStore((s: IHudStore) => s.callout);
  if (!callout) return null;
  return (
    <div key={callout.n} className={styles.callout} aria-hidden="true">
      <p className={styles.calloutTitle}>{callout.title}</p>
      {callout.detail && <p className={styles.calloutDetail}>{callout.detail}</p>}
    </div>
  );
};

const DamageOverlay = () => {
  const flash = useHudStore((s: IHudStore) => s.damageFlash);
  if (!flash) return null;
  // Scatter splats around the edges so they never cover the crosshair.
  const rotation = (flash * 137) % 360;
  const angle = flash * 2.4;
  const left = 50 + Math.cos(angle) * 30;
  const top = 50 + Math.sin(angle) * 28;
  return (
    <div key={flash} className={styles.damage}>
      <img
        src={blood}
        alt=""
        style={{ left: `${left}%`, top: `${top}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
      />
    </div>
  );
};

// The marksman rifle's scope: a round view with a fine reticle, black around it.
const Scope = () => (
  <div className={styles.scope} aria-hidden="true">
    <div className={styles.reticle} />
  </div>
);

const UI = () => {
  const isAiming = useAimingStore((state: IAimingStore) => state.isAiming);
  const isReloading = useHudStore((s: IHudStore) => s.isReloading);
  const scoped = useHudStore((s: IHudStore) => s.scoped);
  const weapon = useWeaponStore((s) => s.weapon);
  // Aiming lines up the gun's sights with the middle of the screen, so the crosshair goes; the pistol aims
  // with the crosshair (see VIEWS in ViewModel.jsx).
  const crosshair = !scoped && (!isAiming || KEEPS_CROSSHAIR.has(weapon));

  return (
    <div className="ui-root">
      {scoped && <Scope />}
      {crosshair && <div className={styles.aim} />}
      <HitMarker />
      <Callout />
      <DamageOverlay />
      {isReloading && <Reloading />}
      <NumberOfRounds />
      {!IS_TOUCH && <WeaponSlots />}
    </div>
  );
};

export default UI;
