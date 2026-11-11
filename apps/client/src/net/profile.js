// This device's profile id: made once and kept, so your matches add up to one record (see the server's
// profiles.js). Whoever has the id can read the record, so it's never shown or sent to other players.
// Signing in swaps it for the account's profile id, and signing out starts a new one (see account.js).
const make = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

let current = (() => {
  try {
    let id = localStorage.getItem('profileId');
    if (!id) {
      id = make();
      localStorage.setItem('profileId', id);
    }
    return id;
  } catch {
    return make(); // private mode: a record for this visit only
  }
})();

/** The profile this device plays as right now. */
export const getProfileId = () => current;

/** Plays as `id` from now on (a new profile of its own if none is given). */
export const setProfileId = (id = make()) => {
  current = id;
  try {
    localStorage.setItem('profileId', id);
  } catch {
    // Private mode: kept for this visit only.
  }
};
