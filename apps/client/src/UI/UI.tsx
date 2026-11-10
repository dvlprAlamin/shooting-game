import NumberOfRounds from '@/UI/NumberOfRounds/NumberOfRounds.tsx';
import { IAimingStore, useAimingStore } from '@/store/AimingStore.ts';
import { IHudStore, useHudStore } from '@/store/HudStore.ts';
import styles from '@/UI/UI.module.scss';
import blood from '@/assets/textures/blood_256x256.png';
import Reloading from '@/UI/Reloading.jsx';
// import QuickAccessSlots from "@/UI/QuickAccessSlots/QuickAccessSlots.tsx";

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

const UI = () => {
  const isAiming = useAimingStore((state: IAimingStore) => state.isAiming);
  const isReloading = useHudStore((s: IHudStore) => s.isReloading);

  return (
    <div className="ui-root">
      {!isAiming && <div className={styles.aim} />}
      <HitMarker />
      <Callout />
      <DamageOverlay />
      {isReloading && <Reloading />}
      <NumberOfRounds />
      {/* <QuickAccessSlots /> */}
    </div>
  );
};

export default UI;
