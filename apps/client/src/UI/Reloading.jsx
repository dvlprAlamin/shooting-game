import { useHudStore } from '@/store/HudStore';
import styles from './UI.module.scss';

/** Under the crosshair while reloading: a bar that fills over this gun's reload time. */
const Reloading = () => {
  const time = useHudStore((s) => s.reloadTime);
  return (
    <div className={styles.reloading} style={{ '--reload-time': `${time}ms` }}>
      Reloading
      <span className={styles.progress} />
    </div>
  );
};

export default Reloading;
