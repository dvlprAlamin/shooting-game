import { useRef } from 'react';
import Button from '../elements/Button';
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
    used: 'First-person arms and guns',
    title: 'FPS AK-74m animations',
    url: 'https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14',
    author: 'Cransh',
    authorUrl: 'https://sketchfab.com/ccransh',
  },
  {
    used: 'Soldiers',
    title: 'Person',
    url: 'https://sketchfab.com/3d-models/person-1d6f1156c1504b3499a2fcff713cff08',
    author: 'skeyo',
    authorUrl: 'https://sketchfab.com/hutcbugo',
  },
  {
    used: "Soldiers' rifle",
    title: 'Low-poly AKS-74U',
    url: 'https://sketchfab.com/3d-models/low-poly-aks-74u-4aa2f92e016c434eafdba67b238bb7fb',
    author: 'veightyfive',
    authorUrl: 'https://sketchfab.com/veightyfive',
  },
];

// Tapping outside closes the dialog: `closedby="any"`, which Safari lacks, so there it's done here. Pressed and
// released outside the box, so a drag that ends there doesn't close it.
const NATIVE_DISMISS = typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
const outside = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

const Link = (props) => <a target="_blank" rel="noreferrer" {...props} />;

/** A button that opens the credits for the models the game uses. */
const Credits = ({ className = '' }) => {
  const dialog = useRef(null);
  const pressedOutside = useRef(false);
  const dismiss = NATIVE_DISMISS
    ? {}
    : {
        onPointerDown: (e) => {
          pressedOutside.current = outside(e);
        },
        onPointerUp: (e) => {
          if (pressedOutside.current && outside(e)) dialog.current.close();
        },
      };

  return (
    <>
      <Button variant="quiet" className={className} onClick={() => dialog.current.showModal()}>
        Credits
      </Button>
      <dialog ref={dialog} className={styles.dialog} closedby="any" aria-labelledby="credits-title" {...dismiss}>
        <div className={styles.head}>
          <h2 id="credits-title" className={styles.title}>
            Credits
          </h2>
          <form method="dialog">
            <Button type="submit" variant="quiet">
              Close
            </Button>
          </form>
        </div>
        <p className={styles.note}>
          3D models from Sketchfab, used under the <Link href={CC_BY}>Creative Commons Attribution 4.0</Link>{' '}
          license. Each one was modified for RimFire.
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
      </dialog>
    </>
  );
};

export default Credits;
