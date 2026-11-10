import { RELOAD_TIME } from '@/game/constants';
import styles from './UI.module.scss';

/** Under the crosshair while reloading: a bar that fills over the reload time. */
const Reloading = () => (
  <div className={styles.reloading} style={{ '--reload-time': `${RELOAD_TIME}s` }}>
    Reloading
    <span className={styles.progress} />
  </div>
);

export default Reloading;
