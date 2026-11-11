import { useEffect, useState } from 'react';
import { GOOGLE_SIGN_IN } from '@/config';
import { deleteRecord, prepareSignIn, signInWithGoogle, signOut } from '@/net/account';
import { useAccountStore } from '@/store/AccountStore';
import { useFeedStore } from '@/store/FeedStore';
import Button from '../elements/Button';
import styles from './Account.module.scss';

const CONFIRM_MS = 4000; // how long "Delete for good?" waits for the second tap

// Google's "G" as its sign-in buttons show it: Google's branding rules ask for this mark, unchanged.
const GoogleMark = () => (
  <svg className={styles.mark} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

/** Under your record: sign in to keep it on any device, or who you're signed in as. `onProfile` gets the record
 *  to show afterwards: the account's when signing in, a new empty one (null) after signing out or deleting. */
const Account = ({ onProfile }) => {
  const account = useAccountStore((s) => s.account);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    prepareSignIn().catch(() => {}); // early, so the tap opens Google's sign-in right away
  }, []);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (!account && !GOOGLE_SIGN_IN) return null;

  const run = async (task, failure) => {
    if (busy) return;
    setBusy(true);
    try {
      const profile = await task();
      if (profile !== undefined) onProfile(profile);
    } catch (e) {
      console.error(e);
      useFeedStore.getState().pushNotice(failure);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (!account) {
    return (
      <div className={styles.account}>
        <button
          type="button"
          className={styles.google}
          disabled={busy}
          onClick={() => run(signInWithGoogle, "Couldn't sign in with Google. Check your connection and try again.")}
        >
          <GoogleMark />
          {busy ? 'Signing in' : 'Sign in with Google'}
        </button>
        <p>Keep your record on any device</p>
      </div>
    );
  }

  const leave = (task) => async () => {
    await task();
    return null;
  };
  return (
    <div className={styles.account}>
      <p className={styles.who} title="Signed in with Google">
        <GoogleMark />
        <span>{account.email ?? 'Signed in with Google'}</span>
      </p>
      <div className={styles.buttons}>
        <Button variant="quiet" disabled={busy} onClick={() => run(leave(signOut), "Couldn't sign out. Try again.")}>
          Sign out
        </Button>
        <Button
          variant="quiet"
          className={confirming ? styles.danger : ''}
          disabled={busy}
          title="Deletes your record and its link to your Google account"
          onClick={() =>
            confirming
              ? run(leave(deleteRecord), "Couldn't delete your record. Check your connection and try again.")
              : setConfirming(true)
          }
        >
          {confirming ? 'Delete for good?' : 'Delete record'}
        </Button>
      </div>
    </div>
  );
};

export default Account;
