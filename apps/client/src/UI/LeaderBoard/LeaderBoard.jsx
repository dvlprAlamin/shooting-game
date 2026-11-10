import styles from './LeaderBoard.module.scss';

// Fills the rest of its flex-column parent; only the table scrolls when there are more players than fit.
// `ready`: ids of the players who want a rematch (after the match), or null.
const LeaderBoard = ({ ranked, myId, ready = null }) => (
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
      <tbody>
        {ranked.map(({ id, playerName, kills, deaths, bestStreak = 0 }, i) => (
          <tr key={id} className={id === myId ? styles.me : undefined}>
            <td className={styles.rank}>{i + 1}</td>
            <th scope="row" className={styles.name}>
              {playerName}
              {id === myId && <span className={styles.you}> (you)</span>}
              {ready?.includes(id) && <span className={styles.ready}>Ready</span>}
            </th>
            <td className={styles.num}>{kills}</td>
            <td className={styles.num}>{deaths}</td>
            <td className={styles.num}>{bestStreak}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default LeaderBoard;
