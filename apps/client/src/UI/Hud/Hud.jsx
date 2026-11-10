import { MAX_HEALTH } from '@shooter/shared';
import CopyButton from '../elements/CopyButton';
import styles from './Hud.module.scss';

const HEALTH_SEGMENTS = 10;
const LOW_HEALTH = 30;
const LOW_TIME = 30; // seconds

const KillsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" />
    <path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const DeathsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M12 2C6.9 2 3 5.7 3 10.6c0 2.9 1.4 5 3.5 6.2V21h3v-2h1v2h3v-2h1v2h3v-4.2c2.1-1.2 3.5-3.3 3.5-6.2C21 5.7 17.1 2 12 2Zm-3.5 12a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Zm7 0a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z"
      fill="currentColor"
    />
  </svg>
);

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const Health = ({ value }) => {
  const hp = Math.max(0, Math.min(MAX_HEALTH, value ?? MAX_HEALTH));
  const filled = Math.ceil((hp / MAX_HEALTH) * HEALTH_SEGMENTS);
  return (
    <div
      className={`${styles.health} ${hp <= LOW_HEALTH ? styles.low : ''}`}
      role="meter"
      aria-label="Health"
      aria-valuemin={0}
      aria-valuemax={MAX_HEALTH}
      aria-valuenow={hp}
    >
      <span className={styles.hp}>{hp}</span>
      <span className={styles.bar} aria-hidden="true">
        {Array.from({ length: HEALTH_SEGMENTS }, (_, i) => (
          <i key={i} className={i < filled ? styles.on : undefined} />
        ))}
      </span>
    </div>
  );
};

/** Match info at the top, health at the bottom, and the room code to send to friends. */
const Hud = ({ health, kills = 0, deaths = 0, timeRemaining, roomId }) => (
  <div className={styles.hud}>
    <div className={styles.match}>
      <span className={styles.stat}>
        <KillsIcon />
        {kills}
        <span className="sr-only">kills</span>
      </span>
      {timeRemaining != null && (
        <span
          className={`${styles.timer} ${timeRemaining <= LOW_TIME ? styles.low : ''}`}
          role="timer"
          aria-label="Time left"
        >
          {formatTime(timeRemaining)}
        </span>
      )}
      <span className={styles.stat}>
        <DeathsIcon />
        {deaths}
        <span className="sr-only">deaths</span>
      </span>
    </div>

    {roomId && (
      <div className={styles.room}>
        <span className={styles.roomLabel}>Room</span>
        <span className={styles.roomCode}>{roomId}</span>
        <CopyButton text={roomId} />
      </div>
    )}

    <Health value={health} />
  </div>
);

export default Hud;
