# Game server

The game server is a Cloudflare Worker. Each room is its own Durable Object, so rooms run independently and close
to the player who created them.

## Layout

- The game itself is the `@rimfire/game` package (`packages/game/` in the repo root), shared with the app, which
  hosts nearby games with it. Its tests are there too.
- `GameRoom.js` (in `@rimfire/game`) is one match: players, scores, timer, and the checks on moves, shots and respawns,
  plus headshots, spawn protection, health regeneration, kill streaks and rematch votes. It knows nothing about
  sockets, so the tests drive it directly.
- Weapons come from `@rimfire/shared/weapons`. Every player carries all of them; `switchWeapon`, `reload` and
  `heal` tell the room what they do. The room keeps its own count of each magazine and times draws, reloads
  and the medkit (with 150 ms of slack for the network), so a shot is refused if it comes too fast for the gun
  in hand, from an empty magazine, mid-reload, mid-switch or mid-heal. Damage is the gun's, less with range
  for the guns that fall off. `playerWeapon` and each player's `weapon` field tell the others what you hold.
- Rooms are free-for-all or team matches (`mode` in `joinRoom`: `ffa` or `tdm`; every `joinedRoom` says which).
  In a team match each player is on team `a` or `b` (the `team` field of every player), newcomers on the smaller
  team. Teammates can't hurt each other, spawns keep away from the other team only, and each kill scores for the
  killer's team (`teamScores`, sent on joining and after every kill). Teams two or more apart are evened out as
  players respawn and when a rematch starts.
- The room plays on the map its creator picked (`map` in `joinRoom`; every `joinedRoom` says which). Players
  spawn on that map's points. A shot only counts if it starts within 3 m of the shooter's eyes, on their side
  of any wall, and no box of the map is in its way before the target (`walls.js`). Canyon has no boxes,
  so it gets only the first check.
- `RoomHost.js` (in `@rimfire/game`) serves one room over plain WebSockets: joining, leaving, reconnecting (a dropped player
  has 10 seconds to come back with their score), the timer, closing a finished room nobody restarts (after
  3 minutes), and limits on what one connection may send.
- `src/app.js` is the Hono app: it routes `/rooms/<roomId>` to that room's Durable Object (`src/room.js`), which
  holds a RoomHost. It also answers `POST /quickplay`, `GET` and `DELETE /profile/<id>` and `POST /auth/google`
  (all allow any origin).
- Quick play: `POST /quickplay` asks the one Lobby Durable Object (`src/lobby.js`, logic in
  `src/Matchmaker.js`) for a room and answers `{ roomId }`. The client joins it with `quick: true`, which
  creates the room, if it doesn't exist yet, as a public one with `QUICK_PLAY` settings (`@rimfire/shared`) on a
  random map. Public rooms report their player count to the Lobby on every change and every 15 seconds; it sends
  players to the fullest room with a free slot and at least 90 seconds left, and holds each slot it hands out
  for 10 seconds. Its list lives in memory, kept alive and rebuilt by those reports. Rooms made with a code are
  never listed.
- Bots: quick-play and practice rooms (`practice: true` in `joinRoom`: the same settings, but private) keep
  `QUICK_PLAY.bots` players in the match, adding bots while there are fewer people and dropping one whenever
  someone joins a full room. Bots are players like any other (same shot checks, same scores, marked `bot` in
  the player list), driven 20 times a second by `bots/BotDirector.js` in `@rimfire/game`: they walk a grid worked out
  from the map's boxes (`bots/nav.js`, floors, platforms and ramps included), see 130° ahead up to
  60 m with no box in the way, wait a moment before firing in bursts, hit more often up close, reload, heal,
  and respawn after a few seconds. They leave a player alone until that player's first move after spawning
  (their game is still loading). They don't vote for rematches, and a room with only bots left closes. They
  need a grid, so they play Depot and Outpost only: Canyon has no boxes to build one from.
- Profiles: the client makes a profile id once and sends it as `profileId` when joining. At the end of a match
  (or when a player leaves before it) the room adds their kills, deaths, best streak, time, and whether they
  played the match through and won, to their row in D1 (`src/profiles.js`, binding `DB`). The table is made on
  first use. Without the `DB` binding the game runs as before and `/profile` answers 503. The id is what plays
  as the profile, so it is never shown to other players; `DELETE /profile/<id>` deletes the record.
- Sign in with Google (optional): the app sends `POST /auth/google` `{ idToken, profileId }` with the ID token
  from Google's sign-in. `src/googleAuth.js` checks it (Google's signature, issuer, expiry, and that it was
  issued for `GOOGLE_CLIENT_ID`, the Web OAuth client), and the `accounts` table links the Google account
  (its `sub`, nothing else) to a profile. The answer is `{ profileId, profile }`: the profile the device plays
  as from then on. A new account takes the device's profile, so the record so far is kept; signing in to an
  account from another device adds that device's guest record to the account's and deletes the guest profile.
  With `GOOGLE_CLIENT_ID` empty (`vars` in `wrangler.jsonc`), sign-in answers 503.
- Gameplay numbers and maps the client also uses come from `@rimfire/shared` and `@rimfire/shared/maps`
  (`packages/shared/` in the repo root).

## Commands

One-time setup, after `pnpm install` in the repo root:

```bash
pnpm exec wrangler login
```

In this folder:

```bash
pnpm dev              # run locally on http://localhost:8787 (for phones on your LAN: pnpm dev --ip 0.0.0.0)
pnpm test             # game, connection, route and map tests
pnpm check            # build without deploying
pnpm run deploy       # deploy; prints the URL, e.g. https://shooting-game.<your-subdomain>.workers.dev
```

Use `pnpm run deploy`, not `pnpm deploy`: `pnpm deploy` is a built-in pnpm command that does something else.
From the repo root, `pnpm deploy:server` does the same.

The first deploy also provisions the D1 database for profiles (the `DB` binding in `wrangler.jsonc` has no
`database_id`, so wrangler creates it). Locally, `pnpm dev` gives it a local database.

Cost: the Lobby is one more Durable Object, awake while any quick-play room is open (the rooms' reports keep
it up), so it adds about one room's worth of duration. D1 writes are one row per player per match.

Then set `VITE_SERVER_URL` in `apps/client/.env.production` to the Worker's URL (or a custom domain routed to it)
and rebuild the client.

To turn on Google sign-in, put the Web OAuth client id in `GOOGLE_CLIENT_ID` (`vars` in `wrangler.jsonc`) and
deploy; the client needs the same id, see `apps/client/README.md`.
