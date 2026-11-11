import { teamName } from '@/game/teams';
import styles from './LeaderBoard.module.scss';

const Row = ({ player: { id, playerName, kills, deaths, bestStreak = 0, bot }, rank, myId, ready }) => (
  <tr className={id === myId ? styles.me : undefined}>
    <td className={styles.rank}>{rank}</td>
    <th scope="row" className={styles.name}>
      {playerName}
      {id === myId && <span className={styles.you}> (you)</span>}
      {bot && <span className={styles.bot}>Bot</span>}
      {ready?.includes(id) && <span className={styles.ready}>Ready</span>}
    </th>
    <td className={styles.num}>{kills}</td>
    <td className={styles.num}>{deaths}</td>
    <td className={styles.num}>{bestStreak}</td>
  </tr>
);

// Fills the rest of its flex-column parent; only the table scrolls when there are more players than fit.
// `ready`: ids of the players who want a rematch (after the match), or null.
// `teams`: in a team match, [{ team, score, players, mine }] in the order to show them (players ranked); each
// team gets its own block under a row with its name and score.
const LeaderBoard = ({ ranked, myId, ready = null, teams = null }) => (
  <div className={styles.scroll}>
    <table className={styles.table}>
      <caption className="sr-only">Scoreboard</caption>
      <thead>
        <tr>
          <th scope="col" className={styles.rank}>
            #
          </th>
          <th scope="col">Player</th>
          <th scope="col" className={styles.num}>
            Kills
          </th>
          <th scope="col" className={styles.num}>
            Deaths
          </th>
          <th scope="col" className={`${styles.num} ${styles.streak}`}>
            Best streak
          </th>
        </tr>
      </thead>
      {teams ? (
        teams.map(({ team, score, players, mine }) => (
          <tbody key={team} className={styles[`team-${team}`]}>
            <tr className={styles.teamRow}>
              <th scope="rowgroup" colSpan={5}>
                <span>
                  {teamName(team)}
                  {mine && <span className={styles.yours}>Your team</span>}
                </span>
                <span className={styles.total}>
                  {score}
                  <span className="sr-only"> kills</span>
                </span>
              </th>
            </tr>
            {players.map((player, i) => (
              <Row key={player.id} player={player} rank={i + 1} myId={myId} ready={ready} />
            ))}
          </tbody>
        ))
      ) : (
        <tbody>
          {ranked.map((player, i) => (
            <Row key={player.id} player={player} rank={i + 1} myId={myId} ready={ready} />
          ))}
        </tbody>
      )}
    </table>
  </div>
);

export default LeaderBoard;
