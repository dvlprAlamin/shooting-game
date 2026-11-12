import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { RESPAWN_DELAY } from '@rimfire/shared';
import Button from '../elements/Button';
import LeaderBoard from '../LeaderBoard/LeaderBoard';
import { otherTeam, teamName } from '@/game/teams';
import { useHudStore } from '@/store/HudStore';
import styles from './RespawnPopup.module.scss';

const UNLOCK = RESPAWN_DELAY / 1000; // seconds before the Respawn button unlocks: the server's wait
// Seconds after that before it presses itself, if you did something in the life you just lost (see
// HudStore.activeThisLife). Otherwise it waits for a tap.
const AUTO_AFTER = 3;

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
  const [elapsed, setElapsed] = useState(0); // seconds since you died
  const [auto] = useState(() => useHudStore.getState().activeThisLife);
  const wait = UNLOCK - elapsed; // until Respawn unlocks
  const autoIn = UNLOCK + AUTO_AFTER - elapsed; // until it presses itself, if `auto`
  const respawnNow = useEffectEvent(() => reSpawnHandler());
  const respawnRef = useRef(null);
  const againRef = useRef(null);
  const ranked = rankPlayers(leaderboard);
  const teams = teamScores && myTeam ? teamBlocks(ranked, teamScores, myTeam) : null;
  const { votes, startsIn } = rematch;
  const voted = votes.includes(myId);

  useEffect(() => {
    if (isGameOver) return;
    if (elapsed === UNLOCK) respawnRef.current?.focus(); // so Enter or Space respawns
    if (auto && elapsed === UNLOCK + AUTO_AFTER) respawnNow();
    if (elapsed >= UNLOCK + (auto ? AUTO_AFTER : 0)) return;
    const id = setTimeout(() => setElapsed((s) => s + 1), 1000);
    return () => clearTimeout(id);
  }, [elapsed, auto, isGameOver]);

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
              <p className={styles.status} role="status">
                {startsIn ? `${ready}, starting in ${startsIn}` : ready}
              </p>
            </div>
          ) : (
            <div className={styles.actions}>
              <Button ref={respawnRef} className={styles.respawn} disabled={wait > 0} onClick={reSpawnHandler}>
                {wait > 0 ? `Respawn in ${wait}` : 'Respawn'}
              </Button>
              {/* Its room is kept from the start, so nothing moves when it shows. */}
              {auto && (
                <p className={`${styles.status} ${wait > 0 ? styles.later : ''}`}>
                  {autoIn > 0 ? `Respawning in ${Math.min(autoIn, AUTO_AFTER)}` : 'Respawning…'}
                </p>
              )}
            </div>
          )}
        </header>
        <LeaderBoard ranked={ranked} myId={myId} ready={isGameOver ? votes : null} teams={teams} />
      </div>
    </section>
  );
};

export default RespawnPopup;
