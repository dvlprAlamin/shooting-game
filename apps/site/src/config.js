// Where the site and the game server live, and who makes the game. The pages are built with these (scripts/build.js).

export const SITE_URL = 'https://rimfire.anminas.com';
// The game server (apps/server) on its custom domain: the deletion page deletes through it.
export const API_URL = 'https://rimfire-api.anminas.com';
// Sign in with Google on the deletion page: the Web OAuth client id, the same one as the server's GOOGLE_CLIENT_ID and
// the app's VITE_GOOGLE_WEB_CLIENT_ID. Not a secret. Empty: the page gives only the steps and the email address.
export const GOOGLE_WEB_CLIENT_ID = '378969469504-154hsjlr8fbni6481c6km1c9794pjd5d.apps.googleusercontent.com';

export const DEVELOPER = 'dvlprAlamin'; // as on the Play listing
export const CONTACT = 'alaminhowladerofficial@gmail.com';
