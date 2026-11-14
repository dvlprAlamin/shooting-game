import styles from './Credits.module.scss';

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

// The third-party models in the app, all CC BY 4.0 from Sketchfab. The license asks for the title, author, source,
// license, and whether it was changed. A new one goes on this list (check its license first).
const CREDITS = [
  {
    used: 'Canyon map',
    title: 'Creek Falls World Maps',
    url: 'https://sketchfab.com/3d-models/creek-falls-world-maps-1a68a391da784bc8920b59dccd7a56ee',
    author: 'siparmin',
    authorUrl: 'https://sketchfab.com/siparminid',
  },
  {
    used: "Arms, and every soldier's AK",
    title: 'FPS AK-74m animations',
    url: 'https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14',
    author: 'Cransh',
    authorUrl: 'https://sketchfab.com/ccransh',
  },
];

const Link = (props) => <a target="_blank" rel="noreferrer" {...props} />;

/** The credits for the models the game uses (Settings, About). */
const Credits = () => (
  <div className={styles.credits}>
    <p className={styles.note}>
      3D models from Sketchfab, used under the <Link href={CC_BY}>Creative Commons Attribution 4.0</Link> license.
      Each one was modified for RimFire.
    </p>
    <ul className={styles.list}>
      {CREDITS.map(({ used, title, url, author, authorUrl }) => (
        <li key={url}>
          <span className={styles.used}>{used}</span>
          <span className={styles.work}>
            <Link href={url}>{title}</Link> by <Link href={authorUrl}>{author}</Link>
          </span>
          <span className={styles.license}>CC BY 4.0, modified</span>
        </li>
      ))}
    </ul>
  </div>
);

export default Credits;
