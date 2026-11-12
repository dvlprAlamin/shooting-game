import { useEffect, useState } from 'react';
import { GOOGLE_SIGN_IN } from '@/config';
import { deleteRecord, signInWithGoogle, signOut } from '@/net/account';
import { useAccountStore } from '@/store/AccountStore';
import { GoogleButton, Who } from '../RoomSelector/Account';
import { SIGN_IN_FAILED, leave, useAccountTask } from '../RoomSelector/useAccountTask';
import Button from '../elements/Button';
import styles from './Settings.module.scss';

const CONFIRM_MS = 4000; // how long "Delete for good?" waits for the second tap

/**
 * The Account tab: signing in with Google, or who you're signed in as and signing out; and deleting your record.
 * `record` is the menu's: undefined while it loads or if the server can't give one, null before your first match.
 * `onProfile` gets the record the menu shows afterwards: the account's when signing in, a new empty one (null) after
 * signing out or deleting. Failures show here, since the dialog covers the menu's notices.
 */
const AccountSettings = ({ record, onProfile }) => {
  const account = useAccountStore((s) => s.account);
  const [failure, setFailure] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const { busy, run } = useAccountTask(onProfile, setFailure);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const task = (fn, message) => {
    setFailure(null);
    return run(fn, message);
  };
  const remove = async () => {
    const done = await task(leave(deleteRecord), "Couldn't delete your record. Check your connection and try again.");
    setConfirming(false);
    setDeleted(done);
  };

  let recordPart;
  if (record) {
    recordPart = (
      <>
        <p className={styles.note}>
          Deleting it removes your record and name from the server
          {account ? ', and its link to your Google account. It signs you out too' : ''}. It can&apos;t be undone.
        </p>
        <div className={styles.buttons}>
          <Button
            variant="quiet"
            className={confirming ? styles.danger : ''}
            disabled={busy}
            onClick={confirming ? remove : () => setConfirming(true)}
          >
            {confirming ? 'Delete for good?' : 'Delete record'}
          </Button>
        </div>
      </>
    );
  } else if (deleted) {
    recordPart = (
      <p className={styles.note} role="status">
        Deleted. You start again with a new, empty record.
      </p>
    );
  } else {
    recordPart = (
      <p className={styles.note}>
        {record === null
          ? 'Nothing to delete yet: your record starts with your first match.'
          : "Your record can't be reached right now. Check your connection."}
      </p>
    );
  }

  return (
    <>
      {(account || GOOGLE_SIGN_IN) && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Google account</h3>
          {account ? (
            <>
              <Who account={account} />
              <p className={styles.note}>Your record goes with you to any device you sign in on.</p>
              <div className={styles.buttons}>
                <Button variant="quiet" disabled={busy} onClick={() => task(leave(signOut), "Couldn't sign out. Try again.")}>
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.note}>Sign in to keep your record on any device. Until then it belongs to this one.</p>
              <div className={styles.buttons}>
                <GoogleButton busy={busy} onClick={() => task(signInWithGoogle, SIGN_IN_FAILED)} />
              </div>
            </>
          )}
        </section>
      )}
      <section className={styles.section}>
        <h3 className={styles.heading}>Your record</h3>
        {recordPart}
      </section>
      {failure && (
        <p className={styles.failure} role="alert">
          {failure}
        </p>
      )}
    </>
  );
};

export default AccountSettings;
