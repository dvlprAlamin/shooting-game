import { useEffect, useRef, useState } from 'react';
import Button from '../elements/Button';
import LeaderBoard from '../LeaderBoard/LeaderBoard';
import styles from './RespawnPopup.module.scss';

const RESPAWN_DELAY = 5; // seconds before the Respawn button unlocks

/** Most kills first; fewer deaths breaks a tie. */
const rankPlayers = (players) => Object.values(players ?? {}).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

const winnerLine = (ranked, myId) => {
  const [first, second] = ranked;
  if (!first) return null;
  const kills = `${first.kills} kill${first.kills === 1 ? '' : 's'}`;
  if (second && second.kills === first.kills) return `Tied at ${kills}`;
  return first.id === myId ? `You win with ${kills}` : `${first.playerName} wins with ${kills}`;
};

/** Full-screen after you die (with the countdown to respawn) and when the match ends. */
const RespawnPopup = ({ reSpawnHandler, leaderboard, isGameOver, killedBy, myId }) => {
  const [wait, setWait] = useState(RESPAWN_DELAY);
  const respawnRef = useRef(null);
  const ranked = rankPlayers(leaderboard);

  useEffect(() => {
    if (isGameOver) return;
    if (wait <= 0) {
      respawnRef.current?.focus(); // so Enter or Space respawns
      return;
    }
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait, isGameOver]);

  const title = isGameOver ? 'Match over' : killedBy ? `${killedBy} got you` : 'You were eliminated';
  const subtitle = isGameOver ? winnerLine(ranked, myId) : null;

  return (
    <section className={`${styles.screen} ${isGameOver ? styles.over : styles.dead}`} aria-labelledby="outcome">
      <div className={styles.card}>
        <header className={styles.head}>
          <div className={styles.outcome}>
            <h1 id="outcome" className={styles.title}>
              {title}
            </h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {!isGameOver && (
            <Button ref={respawnRef} className={styles.respawn} disabled={wait > 0} onClick={reSpawnHandler}>
              {wait > 0 ? `Respawn in ${wait}` : 'Respawn'}
            </Button>
          )}
        </header>
        <LeaderBoard ranked={ranked} myId={myId} />
      </div>
    </section>
  );
};

export default RespawnPopup;
