// The site's pages (scripts/build.js writes them out): the landing page, and the two Google Play asks for, linked from
// the store listing and the app's Settings: the privacy policy (/privacy) and how to delete your account and data
// (/delete-account). The privacy policy loads nothing from elsewhere; the deletion page loads Google's sign-in, for
// anyone who signed in with Google and no longer has the app.

import { API_URL, CONTACT, DEVELOPER, GOOGLE_WEB_CLIENT_ID, SITE_URL } from './config.js';

const UPDATED = '13 November 2026';
const LOG_DAYS = 7; // Workers Logs keeps the game server's request logs this long (apps/server/wrangler.jsonc)

const mail = `<a href="mailto:${CONTACT}">${CONTACT}</a>`;
// The steps in the app (apps/client/src/UI/Settings/AccountSettings.jsx).
const IN_APP =
    'In the menu, open <strong>Settings</strong>, then <strong>Account</strong>, and tap <strong>Delete record</strong>, then <strong>Delete for good</strong>.';

// The third-party models in the game, as the app credits them (apps/client/src/UI/Credits/Credits.jsx): they show in
// the screenshots here.
const CREDITS = [
    ['Creek Falls World Maps', 'https://sketchfab.com/3d-models/creek-falls-world-maps-1a68a391da784bc8920b59dccd7a56ee', 'siparmin', 'https://sketchfab.com/siparminid'],
    ['FPS AK-74m animations', 'https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14', 'Cransh', 'https://sketchfab.com/ccransh'],
    ['Person', 'https://sketchfab.com/3d-models/person-1d6f1156c1504b3499a2fcff713cff08', 'skeyo', 'https://sketchfab.com/hutcbugo'],
    ['Low-poly AKS-74U', 'https://sketchfab.com/3d-models/low-poly-aks-74u-4aa2f92e016c434eafdba67b238bb7fb', 'veightyfive', 'https://sketchfab.com/veightyfive'],
];

const footer = `<footer class="foot">
<nav aria-label="RimFire">
<a href="/privacy">Privacy policy</a>
<a href="/delete-account">Delete your account</a>
<a href="mailto:${CONTACT}">Contact</a>
</nav>
<p>RimFire is a game by ${DEVELOPER}.</p>
<p class="credits">The game uses 3D models from Sketchfab under the
<a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0</a> license, each modified:
${CREDITS.map(([title, url, author, authorUrl]) => `<a href="${url}">${title}</a> by <a href="${authorUrl}">${author}</a>`).join(', ')}.</p>
</footer>`;

/** A whole page: `path` is where it's served (for its canonical address), `head` extra tags for the head. */
const page = ({ title, description, path, head = '', body }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${SITE_URL}${path}">
<meta name="theme-color" content="#0f1d17">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
${head}</head>
<body>
${body}
${footer}
</body>
</html>
`;

// The privacy policy, the deletion page and the 404: the name back home, then one column of text.
const doc = ({ title, description, path, body, script = '' }) =>
    page({
        title,
        description,
        path,
        body: `<header class="bar"><a class="brand" href="/"><img src="/favicon.svg" alt="" width="40" height="40">RimFire</a></header>
<main class="doc">
${body}
</main>${script}`,
    });

const shot = (name, alt, caption, big = false) => `<figure class="shot chamfer${big ? ' big' : ''}">
<img src="/images/${name}-800.jpg" srcset="/images/${name}-800.jpg 800w, /images/${name}-1600.jpg 1600w"
sizes="${big ? '(max-width: 46rem) 100vw, 46rem' : '(max-width: 46rem) 100vw, 23rem'}" width="1600" height="900" alt="${alt}" loading="lazy">
<figcaption>${caption}</figcaption>
</figure>`;

export const landingPage = () =>
    page({
        title: 'RimFire: deathmatch with friends',
        description: `RimFire is a first-person deathmatch game for phones, by ${DEVELOPER}. Play quick public matches, rooms with friends, or nearby games over Wi-Fi with no internet.`,
        path: '/',
        head: `<link rel="preload" href="/fonts/big-shoulders-stencil-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<meta property="og:type" content="website">
<meta property="og:title" content="RimFire: deathmatch with friends">
<meta property="og:description" content="A first-person deathmatch game for phones. Quick play, rooms with friends, or nearby games over Wi-Fi.">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}/images/share.jpg">
<meta name="twitter:card" content="summary_large_image">
`,
        body: `<header class="hero">
<img class="hero-art" src="/images/hero-2000.jpg" srcset="/images/hero-1200.jpg 1200w, /images/hero-2000.jpg 2000w, /images/hero-2800.jpg 2800w"
sizes="100vw" width="2800" height="1188" alt="A soldier kneels on a canyon rim at sunset, aiming a rifle" fetchpriority="high">
<div class="hero-text">
<h1 class="wordmark"><span>Rim</span><span>Fire</span></h1>
<p class="tagline">Deathmatch with friends</p>
<p class="pitch">Fast first-person matches on your phone. Jump into a public match, make a room and share the code, or
play over the same Wi-Fi with no internet at all.</p>
<p class="soon chamfer">Coming soon to Android and iPhone</p>
</div>
</header>

<main>
<section class="section" aria-labelledby="ways">
<h2 id="ways">Three ways to play</h2>
<ul class="cards">
<li class="card chamfer"><h3>Quick play</h3><p>One tap puts you in a public ten-minute match with free slots. Bots play
until people come.</p></li>
<li class="card chamfer"><h3>Rooms</h3><p>Pick the map, the mode and how long it lasts, then send your friends the room
code.</p></li>
<li class="card chamfer"><h3>Nearby</h3><p>Host a game on your phone and play with friends on the same Wi-Fi or hotspot.
No internet needed.</p></li>
</ul>
</section>

<section class="section" aria-labelledby="match">
<h2 id="match">In a match</h2>
<div class="gallery">
${shot('outpost', 'Firing a rifle at an enemy soldier running across a sunlit yard on Outpost', 'Outpost', true)}
${shot('depot', 'A headshot between shipping containers on Depot', 'Depot')}
${shot('outpost-close', 'An enemy soldier, named Viper, close up behind a crate on Outpost', 'Outpost')}
</div>
</section>

<section class="section" aria-labelledby="inside">
<h2 id="inside">What's inside</h2>
<dl class="facts">
<div><dt>Maps</dt><dd>Canyon, Depot and Outpost</dd></div>
<div><dt>Modes</dt><dd>Free for all, and two teams</dd></div>
<div><dt>Guns</dt><dd>Rifle, SMG, marksman rifle and pistol, plus a medkit</dd></div>
<div><dt>Your record</dt><dd>Matches, wins and kills, on any device once you sign in with Google</dd></div>
<div><dt>Controls</dt><dd>Move, resize or hide the on-screen buttons to suit your grip</dd></div>
<div><dt>Ads</dt><dd>None, and no tracking</dd></div>
</dl>
</section>
</main>`,
    });

export const privacyPage = () =>
    doc({
        title: 'RimFire privacy policy',
        description: `What RimFire, a game by ${DEVELOPER}, collects, what for, and how to delete it.`,
        path: '/privacy',
        body: `<h1>RimFire privacy policy</h1>
<p class="meta">RimFire is a game by ${DEVELOPER}. Last updated ${UPDATED}.</p>
<p>This policy covers the RimFire app for Android and iOS, the game in a web browser, and this website. It says what
the game collects, what for, and how to delete it. In short: a random player ID, the name you type, your game record,
and, only if you sign in with Google, your Google account's ID. No ads, no tracking, and nothing is sold.</p>

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

<h2>This website</h2>
<p>This website sets no cookies and uses no analytics or tracking. The account deletion page loads Google's sign-in
button from Google, so you can prove which account to delete.</p>

<h2>Who else handles it</h2>
<ul>
<li><a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a> runs the game server and this website, and
stores the records, for us.</li>
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
<p>For questions, or to ask what we hold about you or have it corrected or deleted: ${mail}.</p>`,
    });

/** `clientId`: the Web OAuth client to sign in with Google through (empty: no sign-in, only the steps and email);
 *  `apiUrl`: the game server that deletes. */
export const deletionPage = (clientId = GOOGLE_WEB_CLIENT_ID, apiUrl = API_URL) =>
    doc({
        title: 'Delete your RimFire account and data',
        description: `How to delete your RimFire record and its link to your Google account. RimFire is a game by ${DEVELOPER}.`,
        path: '/delete-account',
        body: `<h1>Delete your RimFire account and data</h1>
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
<p>Email ${mail}. See also the <a href="/privacy">privacy policy</a>.</p>`,
        script: clientId ? deletionScript(clientId, apiUrl) : '',
    });

export const notFoundPage = () =>
    doc({
        title: 'Page not found: RimFire',
        description: 'There is no page at this address.',
        path: '/404',
        body: `<h1>Page not found</h1>
<p>There's nothing at this address. Try the <a href="/">home page</a>, or the
<a href="/privacy">privacy policy</a>.</p>`,
    });

const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

// Google's sign-in hands back an ID token, which the game server's /auth/google/delete checks before deleting.
const deletionScript = (clientId, apiUrl) => `
<script>
const CLIENT_ID = ${json(clientId)};
const DELETE_URL = ${json(`${apiUrl.replace(/\/+$/, '')}/auth/google/delete`)};
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
    res = await fetch(DELETE_URL, {
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
