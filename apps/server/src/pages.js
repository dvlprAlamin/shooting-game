// The two web pages Google Play asks for, linked from the store listing and the app's menu: the privacy policy
// (/privacy) and how to delete your account and data (/delete-account). Plain HTML in the game's colours. The
// privacy page loads nothing from elsewhere; the deletion page loads Google's sign-in, for anyone who signed in
// with Google and no longer has the app.

const DEVELOPER = 'dvlprAlamin'; // as on the Play listing
const CONTACT = 'alaminhowladerofficial@gmail.com';
const UPDATED = '12 November 2026';
const LOG_DAYS = 7; // Workers Logs keeps request logs this long on the paid plan (wrangler.jsonc `observability`)

const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;
// The steps in the app (UI/RoomSelector/Account.jsx).
const IN_APP = 'On the Quick play tab, under Your record, tap <strong>Delete record</strong>, then <strong>Delete for good</strong>.';

const STYLE = `
:root {
  color-scheme: dark;
  --canopy: #0f1d17;
  --bone: #eee7d4;
  --sand: #d59a62;
  --red: #f2463a;
  --muted: rgb(238 231 212 / 0.72);
  --line: rgb(213 154 98 / 0.4);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0;
  background: var(--canopy);
  color: var(--bone);
  font: 400 1.0625rem/1.6 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
h1 {
  margin: 0 0 0.4rem;
  font: 800 clamp(2rem, 8vw, 2.75rem)/1.05 'Big Shoulders Stencil', Impact, 'Arial Narrow', sans-serif;
  text-wrap: balance;
}
h2 { margin: 2.2rem 0 0.5rem; font-size: 1.25rem; line-height: 1.3; color: var(--sand); }
p, ul { margin: 0.6rem 0; }
ul { padding-left: 1.25rem; }
li + li { margin-top: 0.5rem; }
.meta { margin-bottom: 1.8rem; color: var(--muted); }
.note { color: var(--muted); }
a { color: var(--bone); text-decoration-color: var(--sand); text-underline-offset: 0.2em; overflow-wrap: anywhere; }
a:hover { color: var(--sand); }
.panel { margin: 1rem 0; padding: 1rem 1.1rem; border: 1px solid var(--line); }
.panel p:first-child { margin-top: 0; }
#google { min-height: 44px; }
button {
  min-height: 44px;
  padding: 0 1.1rem;
  border: 0;
  background: var(--red);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: default; }
button:focus-visible { outline: 2px solid var(--bone); outline-offset: 2px; }
#status:empty { display: none; }
`;

const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${title} for RimFire, a game by ${DEVELOPER}.">
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

export const privacyPage = () =>
    page(
        'RimFire privacy policy',
        `<h1>RimFire privacy policy</h1>
<p class="meta">RimFire is a game by ${DEVELOPER}. Last updated ${UPDATED}.</p>
<p>This policy covers the RimFire app for Android and iOS, and the game in a web browser. It says what the game
collects, what for, and how to delete it. In short: a random player ID, the name you type, your game record, and,
only if you sign in with Google, your Google account's ID. No ads, no tracking, and nothing is sold.</p>

<h2>What the game collects</h2>
<ul>
<li><strong>A player ID.</strong> The app makes a random ID the first time it runs and keeps it on your device,
with your name and the options you picked, for next time. It isn't your device's hardware ID or advertising ID.
The server keeps your record under it.</li>
<li><strong>Your player name.</strong> The name you type in the menu. Other players in your match see it, and the
server keeps the latest one with your record.</li>
<li><strong>Your game record.</strong> Matches played, wins, kills, deaths, your best streak and your time played,
added up after each online match.</li>
<li><strong>What you do in a match.</strong> Your movement, aim and shots go to the game server while you play, so
it can run the match and show everyone the same game. They're kept only while the match lasts.</li>
<li><strong>Your Google account ID, if you sign in with Google.</strong> Signing in is optional: it gets your record
back on another device. Google gives the app a sign-in token; our server checks it and keeps only your Google
account's ID, to link it to your record. Your email address and name are not stored on our server. The app shows
your email address on your device, so you know which account you're signed in with.</li>
<li><strong>Your IP address.</strong> Like any online service, the server sees it when the app connects. It's used
to limit spam, by counting requests from each address per minute, and is never stored with your record. The
server's request logs, which can include it, are deleted after ${LOG_DAYS} days.</li>
</ul>

<h2>Nearby games</h2>
<p>A nearby game is hosted by a phone on your Wi-Fi or hotspot. Its data goes only between the phones on that
network: it never reaches our server and isn't added to your record. The app uses your local network (on iOS, after
asking you) and reads your Wi-Fi state (on Android) only to find and host these games.</p>

<h2>What the game doesn't do</h2>
<ul>
<li>No ads, and no analytics or tracking tools.</li>
<li>Your data is never sold, or shared with anyone for their own use.</li>
<li>No access to your contacts, location, photos, files, camera or microphone.</li>
</ul>

<h2>Who else handles it</h2>
<ul>
<li><a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a> runs the game server and stores the records,
for us.</li>
<li><a href="https://policies.google.com/privacy">Google</a> handles signing in with Google, if you use it.</li>
</ul>

<h2>How long it's kept</h2>
<p>Your record stays until you delete it. Uninstalling the app or clearing its data doesn't delete it from the
server, but your device forgets the player ID, so unless you signed in with Google the record can't be tied back to
you.</p>

<h2>Deleting your data</h2>
<ul>
<li><strong>In the app:</strong> ${IN_APP} This deletes your record and name from the server, and their link to
your Google account if you signed in. The app then makes a new player ID.</li>
<li><strong>Without the app:</strong> if you signed in with Google, delete your record on the
<a href="/delete-account">account deletion page</a>.</li>
</ul>

<h2>Children</h2>
<p>RimFire is a shooting game for players 13 and older. It isn't directed at children under 13, and we don't
knowingly collect their data. If you think a child under 13 has played online, contact us and we'll help delete
their record.</p>

<h2>Security</h2>
<p>Everything between the app and our server is encrypted (HTTPS and secure WebSockets). Nearby games, which stay on
your local network, are not.</p>

<h2>Changes</h2>
<p>If this policy changes, this page will show the new version and its date.</p>

<h2>Contact</h2>
<p>For questions, or to ask what we hold about you or have it corrected or deleted: ${mail}.</p>`
    );

/** `clientId`: the Web OAuth client to sign in with Google through. Empty: no sign-in, only the steps and email. */
export const deletionPage = (clientId) =>
    page(
        'Delete your RimFire account and data',
        `<h1>Delete your RimFire account and data</h1>
<p class="meta">RimFire, a game by ${DEVELOPER}</p>
<p>RimFire's server keeps a record for each player: the player name, and matches, wins, kills, deaths, best streak
and time played. If you signed in with Google, the record is also linked to your Google account's ID. Deleting
removes all of it at once, and none of it is kept. (The server's request logs, which can include your IP address,
are deleted after ${LOG_DAYS} days anyway.) If you play again, you start a new, empty record.</p>

<h2>In the app</h2>
<p>${IN_APP} This works whether or not you signed in.</p>

<h2>Here, if you signed in with Google</h2>
${
    clientId
        ? `<div class="panel">
<p>Sign in with the Google account you used in RimFire, then confirm.</p>
<div id="google"></div>
<div id="confirm" hidden>
<p>Delete the RimFire record of <strong id="who"></strong>? This can't be undone.</p>
<button type="button" id="delete">Delete for good</button>
</div>
<p id="status" role="status"></p>
</div>`
        : `<p>Signing in here isn't available right now. Email ${mail} and we'll help.</p>`
}
<p class="note">If you never signed in, your record is tied only to the player ID on your device, so it can be
deleted only in the app.</p>

<h2>Questions</h2>
<p>Email ${mail}. See also the <a href="/privacy">privacy policy</a>.</p>
${clientId ? deletionScript(clientId) : ''}`
    );

// Google's sign-in hands back an ID token, which /auth/google/delete checks before deleting.
const deletionScript = (clientId) => `<script>
const CLIENT_ID = ${JSON.stringify(clientId).replace(/</g, '\\u003c')};
const $ = (id) => document.getElementById(id);
const say = (text) => { $('status').textContent = text; };
let token = null;

// The email address in the token, to show which account's record would go.
const emailOf = (jwt) => {
  try {
    return JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null;
  } catch {
    return null;
  }
};

function start() {
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: ({ credential }) => {
      token = credential;
      $('who').textContent = emailOf(credential) ?? 'this Google account';
      $('confirm').hidden = false;
      $('delete').disabled = false;
      say('');
    },
  });
  google.accounts.id.renderButton($('google'), { theme: 'filled_black', size: 'large', text: 'signin_with' });
}

$('delete').addEventListener('click', async () => {
  $('delete').disabled = true;
  say('Deleting…');
  let res;
  try {
    res = await fetch('/auth/google/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
  } catch {
    $('delete').disabled = false;
    return say("Couldn't reach the server. Check your connection and try again.");
  }
  if (res.ok) {
    const { deleted } = await res.json();
    $('confirm').hidden = true;
    return say(deleted
      ? 'Done. Your RimFire record and its link to your Google account are deleted.'
      : 'This Google account has no RimFire record, so there was nothing to delete.');
  }
  $('delete').disabled = res.status !== 401;
  if (res.status === 401) $('confirm').hidden = true;
  say(res.status === 401 ? 'That sign-in has run out. Sign in again.'
    : res.status === 429 ? 'Too many tries from your network. Wait a minute and try again.'
    : "Couldn't delete your record. Try again later, or email ${CONTACT}.");
});
</script>
<script src="https://accounts.google.com/gsi/client" async onload="start()"></script>`;
