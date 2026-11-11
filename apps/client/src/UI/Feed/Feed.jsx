import { IS_TOUCH } from '@/config';
import { KILL_TTL, NOTICE_TTL, useFeedStore } from '@/store/FeedStore';
import styles from './Feed.module.scss';
import WeaponIcon from '../WeaponIcon';
import { teamColor } from '@/game/teams';

// Fewer lines on phones, where the left side also holds the move stick.
const VISIBLE_KILLS = IS_TOUCH ? 3 : 5;

// "You" in blaze; anyone else in their team's colour in a team match.
const Name = ({ you, team, children }) =>
  you ? <span className={styles.you}>You</span> : <span style={{ color: teamColor(team) }}>{children}</span>;

// A head and shoulders in a crosshair.
const HeadshotIcon = () => (
  <svg className={styles.head} viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 2.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2.5 16c.4-3.2 2.7-4.8 5.5-4.8s5.1 1.6 5.5 4.8Z"
      fill="currentColor"
      opacity="0.5"
    />
    <circle cx="8" cy="5.5" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 0v2.4M8 8.6V11M2.5 5.5H0M13.5 5.5H16" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const Feed = () => {
  const kills = useFeedStore((s) => s.kills);
  const notices = useFeedStore((s) => s.notices);

  return (
    <>
      <ol className={styles.kills} aria-label="Kill feed" style={{ '--ttl': `${KILL_TTL}ms` }}>
        {kills.slice(-VISIBLE_KILLS).map((k) => (
          <li key={k.id} className={k.you ? styles.mine : undefined}>
            <Name you={k.you === 'killer'} team={k.killerTeam}>
              {k.killer}
            </Name>
            <WeaponIcon id={k.weapon} className={styles.icon} />
            {k.headshot && <HeadshotIcon />}
            <span className="sr-only">eliminated</span>
            <Name you={k.you === 'victim'} team={k.victimTeam}>
              {k.victim}
            </Name>
            {k.headshot && <span className="sr-only">with a headshot</span>}
          </li>
        ))}
      </ol>
      <div className={styles.notices} role="status" style={{ '--ttl': `${NOTICE_TTL}ms` }}>
        {notices.map((n) => (
          <p key={n.id}>{n.text}</p>
        ))}
      </div>
    </>
  );
};

export default Feed;
