import { IS_TOUCH } from '@/config';
import { KILL_TTL, NOTICE_TTL, useFeedStore } from '@/store/FeedStore';
import styles from './Feed.module.scss';

// Fewer lines on phones, where the left side also holds the move stick.
const VISIBLE_KILLS = IS_TOUCH ? 3 : 5;

const Name = ({ you, children }) => (you ? <span className={styles.you}>You</span> : <span>{children}</span>);

const RifleIcon = () => (
  <svg className={styles.icon} viewBox="0 0 32 12" aria-hidden="true">
    <path d="M1 4h20l2-2h3v2h5v2h-7l-1 2h-4l-1 3h-4l1-3H8L5 9H2l1-3H1z" fill="currentColor" />
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
            <Name you={k.you === 'killer'}>{k.killer}</Name>
            <RifleIcon />
            <span className="sr-only">eliminated</span>
            <Name you={k.you === 'victim'}>{k.victim}</Name>
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
