import { useState } from 'react';
import { failureMessage } from '@/net/api';

/**
 * Runs one account task at a time (signing in or out, deleting the record). The task resolves to the record to show
 * afterwards, which goes to `onProfile` (undefined: no change). A failure's message goes to `onFailure`. `run`
 * resolves to whether the task went through.
 */
export function useAccountTask(onProfile, onFailure) {
  const [busy, setBusy] = useState(false);
  const run = async (task, failure) => {
    if (busy) return false;
    setBusy(true);
    try {
      const profile = await task();
      if (profile !== undefined) onProfile(profile);
      return true;
    } catch (e) {
      console.error(e);
      onFailure(failureMessage(e, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// Signing out and deleting leave a new, empty record (null).
export const leave = (task) => async () => {
  await task();
  return null;
};

export const SIGN_IN_FAILED = "Couldn't sign in with Google. Check your connection and try again.";
