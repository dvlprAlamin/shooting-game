import { useEffect, useRef, useState } from 'react';
import Button from '../elements/Button';
import LeaderBoard from '../LeaderBoard/LeaderBoard';
import { otherTeam, teamName } from '@/game/teams';
import styles from './RespawnPopup.module.scss';

const RESPAWN_DELAY = 5; // seconds before the Respawn button unlocks

/** Most kills first; fewer deaths breaks a tie. */
const rankPlayers = (players) => Object.values(players ?? {}).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

// Your team first, each with its players ranked.
const teamBlocks = (ranked, teamScores, myTeam) =>
  [myTeam, otherTeam(myTeam)].map((team) => ({
    team,
    score: teamScores[team] ?? 0,
    players: ranked.filter((p) => p.team === team),
    mine: team === myTeam,
  }));

const teamWinnerLine = (teamScores, myTeam) => {
  const mine = teamScores[myTeam] ?? 0;
  const theirs = teamScores[otherTeam(myTeam)] ?? 0;
  if (mine === theirs) return `Tied, ${mine} to ${theirs}`;
  if (mine > theirs) return `Your team wins, ${mine} to ${theirs}`;
  return `${teamName(otherTeam(myTeam))} wins, ${theirs} to ${mine}`;
};

const winnerLine = (ranked, myId) => {
  const [first, second] = ranked;
  if (!first) return null;
  const kills = `${first.kills} kill${first.kills === 1 ? '' : 's'}`;
  if (second && second.kills === first.kills) return `Tied at ${kills}`;
  return first.id === myId ? `You win with ${kills}` : `${first.playerName} wins with ${kills}`;
};

/**
 * Full-screen after you die (with the countdown to respawn) and when the match ends. At the end,
 * players vote for a rematch: it starts when everyone is ready, or shortly after more than half are.
 */
const RespawnPopup = ({
  reSpawnHandler,
  leaderboard,
  isGameOver,
  killedBy,
  myId,
  myTeam = null,
  teamScores = null, // set in a team match
  rematch,
  onRematch,
  onLeave,
}) => {
  const [wait, setWait] = useState(RESPAWN_DELAY);
  const respawnRef = useRef(null);
  const againRef = useRef(null);
  const ranked = rankPlayers(leaderboard);
  const teams = teamScores && myTeam ? teamBlocks(ranked, teamScores, myTeam) : null;
  const { votes, startsIn } = rematch;
  const voted = votes.includes(myId);

  useEffect(() => {
    if (isGameOver) return;
    if (wait <= 0) {
      respawnRef.current?.focus(); // so Enter or Space respawns
      return;
    }
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait, isGameOver]);

  useEffect(() => {
    if (isGameOver) againRef.current?.focus();
  }, [isGameOver]);

  const title = isGameOver ? 'Match over' : killedBy ? `${killedBy} got you` : 'You were eliminated';
  const subtitle = !isGameOver ? null : teams ? teamWinnerLine(teamScores, myTeam) : winnerLine(ranked, myId);
  const ready = `${votes.length} of ${ranked.filter((p) => !p.bot).length} ready`; // bots don't vote

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
          {isGameOver ? (
            <div className={styles.actions}>
              <div className={styles.buttons}>
                <Button variant="quiet" onClick={onLeave}>
                  Leave
                </Button>
                <Button ref={againRef} className={styles.again} disabled={voted} onClick={onRematch}>
                  {voted ? 'Ready' : 'Play again'}
                </Button>
              </div>
              <p className={styles.votes} role="status">
                {startsIn ? `${ready}, starting in ${startsIn}` : ready}
              </p>
            </div>
          ) : (
            <Button ref={respawnRef} className={styles.respawn} disabled={wait > 0} onClick={reSpawnHandler}>
              {wait > 0 ? `Respawn in ${wait}` : 'Respawn'}
            </Button>
          )}
        </header>
        <LeaderBoard ranked={ranked} myId={myId} ready={isGameOver ? votes : null} teams={teams} />
      </div>
    </section>
  );
};

export default RespawnPopup;
