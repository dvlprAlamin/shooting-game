// This device's profile id: made once and kept, so your matches add up to one record (see the server's
// profiles.js). Whoever has the id can read the record, so it's never shown or sent to other players.
const make = () =>
  crypto.randomUUID?.() ??
  `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

export const PROFILE_ID = (() => {
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
