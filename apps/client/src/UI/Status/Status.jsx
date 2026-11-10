import styles from './Status.module.scss';

/** While the connection is down mid-match. The server holds your player for 10 seconds. */
export const Reconnecting = () => (
  <div className={styles.screen} role="alert">
    <p className={styles.title}>Reconnecting</p>
    <span className={styles.bar} />
    <p className={styles.text}>Your score is kept for 10 seconds while the game gets you back in.</p>
  </div>
);

/** Inside the 3D canvas while the map and models load. */
export const Loading = () => (
  <div className={styles.loading} role="status">
    <p className={styles.title}>Loading map</p>
    <span className={styles.bar} />
  </div>
);
