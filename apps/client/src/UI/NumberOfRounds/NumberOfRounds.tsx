import { getWeapon } from '@rimfire/shared/weapons';
import { useWeaponStore, IWeaponStore } from '@/store/WeaponStore.ts';
import styles from '@/UI/NumberOfRounds/styles.module.scss';
import { IS_TOUCH, RELOAD_BUTTON_NAME } from '@/config';

const NumberOfRounds = () => {
  const weapon = getWeapon(useWeaponStore((s: IWeaponStore) => s.weapon));
  const countOfRounds = useWeaponStore((s: IWeaponStore) => s.rounds[weapon.id]);
  const isEmpty = countOfRounds === 0;

  return (
    <div className={`${styles.ammo} ${isEmpty ? styles.empty : ''}`}>
      <span className={styles.weapon}>{weapon.name}</span>
      <span className={styles.count}>{countOfRounds}</span>
      <span className={styles.mag}>/{weapon.magSize}</span>
      <span className="sr-only">rounds</span>
      {/* On touch the reload button sits right next to the counter. */}
      {isEmpty && !IS_TOUCH && <span className={styles.hint}>Press {RELOAD_BUTTON_NAME} to reload</span>}
    </div>
  );
};

export default NumberOfRounds;
