import { GOOGLE_SIGN_IN, GOOGLE_WEB_CLIENT_ID } from '@/config';
import { useAccountStore } from '@/store/AccountStore';
import { deleteProfile, exchangeGoogleToken } from './api';
import { getProfileId, setProfileId } from './profile';

// Optional sign-in, so your record comes back on another device or after reinstalling. Google for now (Apple
// to come, for iOS). The plugin shows Google's own sign-in (the account sheet on Android); the server checks
// Google's ID token and says which profile to play as from then on (the server's /auth/google).

const CANCELLED = /cancel|popup closed|window was closed/i;

let plugin; // promise of the set-up SocialLogin plugin

/** Loads and sets up the sign-in plugin. On the web this adds Google's script, so call it before the tap. */
export const prepareSignIn = () => {
  if (!GOOGLE_SIGN_IN) return Promise.resolve(null);
  plugin ??= import('@capgo/capacitor-social-login').then(async ({ SocialLogin }) => {
    // Only the ID token is needed, so skip asking for access to Google APIs (it can hang on Android).
    await SocialLogin.initialize({
      google: { webClientId: GOOGLE_WEB_CLIENT_ID, skipAuthOnlyAuthorizationAfterSignIn: true },
    });
    return SocialLogin;
  });
  plugin.catch(() => {
    plugin = undefined; // try again next time
  });
  return plugin;
};

/** Signs in with Google. Resolves to the record to show (the account's, with this device's added; null if it
 *  has none yet), or undefined if the player backed out. Rejects if signing in failed. */
export async function signInWithGoogle() {
  const SocialLogin = await prepareSignIn();
  if (!SocialLogin) throw new Error('Sign-in is off');
  let login;
  try {
    login = await SocialLogin.login({ provider: 'google', options: {} });
  } catch (e) {
    if (CANCELLED.test(String(e?.message ?? e))) return undefined;
    throw e;
  }
  const idToken = login.result?.idToken;
  if (!idToken) throw new Error('Google gave no ID token');
  const { profileId, profile } = await exchangeGoogleToken(idToken, getProfileId());
  setProfileId(profileId);
  useAccountStore.getState().setAccount({ provider: 'google', email: login.result.profile?.email ?? null });
  return profile;
}

/** Signs out. The record stays with the account; this device starts a new one. */
export async function signOut() {
  const SocialLogin = await prepareSignIn().catch(() => null);
  await SocialLogin?.logout({ provider: 'google' }).catch(() => {});
  setProfileId();
  useAccountStore.getState().setAccount(null);
}

/** Deletes your record (and its link to the account you're signed in to, signing you out), then starts a new one. */
export async function deleteRecord() {
  await deleteProfile(getProfileId());
  if (useAccountStore.getState().account) await signOut();
  else setProfileId();
}
