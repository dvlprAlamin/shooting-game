import styles from './LeaderBoard.module.scss';

// Fills the rest of its flex-column parent; only the table scrolls when there are more players than fit.
const LeaderBoard = ({ ranked, myId }) => (
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
        </tr>
      </thead>
      <tbody>
        {ranked.map(({ id, playerName, kills, deaths }, i) => (
          <tr key={id} className={id === myId ? styles.me : undefined}>
            <td className={styles.rank}>{i + 1}</td>
            <th scope="row" className={styles.name}>
              {playerName}
              {id === myId && <span className={styles.you}> (you)</span>}
            </th>
            <td className={styles.num}>{kills}</td>
            <td className={styles.num}>{deaths}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default LeaderBoard;
