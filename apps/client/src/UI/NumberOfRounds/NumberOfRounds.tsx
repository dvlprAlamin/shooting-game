import { MAG_SIZE } from '@shooter/shared';
import { useRoundsStore, IRoundsStore } from '@/store/RoundsStore.ts';
import styles from '@/UI/NumberOfRounds/styles.module.scss';
import { IS_TOUCH, RELOAD_BUTTON_NAME } from '@/config';

const NumberOfRounds = () => {
  const countOfRounds = useRoundsStore((state: IRoundsStore) => state.countRounds);
  const isEmpty = countOfRounds === 0;

  return (
    <div className={`${styles.ammo} ${isEmpty ? styles.empty : ''}`}>
      <span className={styles.count}>{countOfRounds}</span>
      <span className={styles.mag}>/{MAG_SIZE}</span>
      <span className="sr-only">rounds</span>
      {/* On touch the reload button sits right next to the counter. */}
      {isEmpty && !IS_TOUCH && <span className={styles.hint}>Press {RELOAD_BUTTON_NAME} to reload</span>}
    </div>
  );
};

export default NumberOfRounds;
