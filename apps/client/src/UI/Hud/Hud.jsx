import { useEffect, useState } from 'react';
import { MAX_HEALTH, SPAWN_PROTECTION } from '@rimfire/shared';
import { useHudStore } from '@/store/HudStore';
import { otherTeam, teamName } from '@/game/teams';
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

// Spawn protection left, as a draining bar. Gone when it runs out or you fire.
const Protection = () => {
  const until = useHudStore((s) => s.protectedUntil);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const ms = until - performance.now();
    setLeft(Math.max(0, ms));
    if (ms <= 0) return;
    const id = setTimeout(() => setLeft(0), ms);
    return () => clearTimeout(id);
  }, [until]);

  if (left <= 0) return null;
  return (
    <div
      className={styles.protection}
      role="status"
      style={{ '--left': `${left}ms`, '--from': Math.min(1, left / SPAWN_PROTECTION) }}
    >
      Spawn protection
      <span className={styles.drain} aria-hidden="true" />
    </div>
  );
};

const Kills = ({ value, className = styles.stat }) => (
  <span className={className}>
    <KillsIcon />
    {value}
    <span className="sr-only">kills</span>
  </span>
);

const Deaths = ({ value, className = styles.stat }) => (
  <span className={className}>
    <DeathsIcon />
    {value}
    <span className="sr-only">deaths</span>
  </span>
);

// A team's kills, in its colour, with its name over the number.
const TeamScore = ({ team, score, mine }) => (
  <span className={`${styles.team} ${styles[`team-${team}`]}`}>
    <span className={styles.teamName}>
      {teamName(team)}
      {mine && <span className="sr-only"> (your team)</span>}
    </span>
    <span className={styles.teamScore}>{score}</span>
  </span>
);

/**
 * Match info at the top, health at the bottom, and the map and room code to send to friends. In a team match
 * (`teamScores` set) the top strip has your team's score left of the timer and theirs on the right, with your
 * own kills and deaths under it.
 */
const Hud = ({ health, kills = 0, deaths = 0, timeRemaining, roomId, mapName, teamScores = null, myTeam = null }) => {
  const teams = !!(teamScores && myTeam);
  const timer = timeRemaining != null && (
    <span className={`${styles.timer} ${timeRemaining <= LOW_TIME ? styles.low : ''}`} role="timer" aria-label="Time left">
      {formatTime(timeRemaining)}
    </span>
  );
  return (
    <div className={styles.hud}>
      {teams ? (
        <div className={styles.top}>
          <div className={styles.match}>
            <TeamScore team={myTeam} score={teamScores[myTeam]} mine />
            {timer}
            <TeamScore team={otherTeam(myTeam)} score={teamScores[otherTeam(myTeam)]} />
          </div>
          <div className={styles.personal}>
            <Kills value={kills} className={styles.mini} />
            <Deaths value={deaths} className={styles.mini} />
          </div>
        </div>
      ) : (
        <div className={`${styles.top} ${styles.match}`}>
          <Kills value={kills} />
          {timer}
          <Deaths value={deaths} />
        </div>
      )}

      {roomId && (
        <div className={styles.room}>
          {mapName && <span className={styles.mapName}>{mapName}</span>}
          <span className={styles.roomLabel}>Room</span>
          <span className={styles.roomCode}>{roomId}</span>
          <CopyButton text={roomId} />
        </div>
      )}

      <div className={styles.vitals}>
        <Protection />
        <Health value={health} />
      </div>
    </div>
  );
};

export default Hud;
