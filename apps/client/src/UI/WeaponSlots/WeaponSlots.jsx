import { useWeaponStore } from '@/store/WeaponStore';
import { SLOTS } from '@/weapons/items';
import WeaponIcon from '../WeaponIcon';
import styles from './WeaponSlots.module.scss';

/** Desktop: every gun and the medkit with its key, the one in hand lit. Touch uses buttons instead. */
const WeaponSlots = () => {
  const weapon = useWeaponStore((s) => s.weapon);
  const medkits = useWeaponStore((s) => s.medkits);
  const healing = useWeaponStore((s) => s.healing);

  return (
    <ol className={styles.slots} aria-label="Weapons">
      {SLOTS.map((slot, i) => {
        const isMedkit = slot.id === 'medkit';
        const current = isMedkit ? healing : weapon === slot.id && !healing;
        const empty = isMedkit && medkits === 0;
        return (
          <li
            key={slot.id}
            className={`${styles.slot} ${current ? styles.current : ''} ${empty ? styles.empty : ''}`}
            aria-current={current || undefined}
          >
            <span className={styles.key}>{i + 1}</span>
            <WeaponIcon id={slot.id} className={styles.icon} />
            <span className={styles.name}>
              {slot.name}
              {isMedkit && <span className={styles.count}> ×{medkits}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export default WeaponSlots;
