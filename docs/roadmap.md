# RimFire roadmap

The plan after the first Play closed test (November 2026). Each item says why it matters, where it goes in the code,
how to build it, and when it counts as done, so any session can pick one up cold. Work roughly top to bottom:
section A makes the closed test useful, B is in progress, C and D are open.

Status key: **todo**, **doing**, **done**. Update the status here when an item lands.

---

## A. Closed-test hardening

### A1. Error reporting — done
- **Why:** testers' crashes are invisible today; there is no reporting at all.
- **Where:** new `POST /errors` route in `apps/server/src/app.js` (same rate limiter as the other routes), client
  hook in `apps/client/src/main.tsx`, a React error boundary around `<App/>`.
- **How:** catch `window.onerror`, `unhandledrejection` and boundary errors; send `{message, stack (trimmed to
  4 KB), app version, platform, device model, url}` with `navigator.sendBeacon`, at most 10 per session. Store
  in Workers Analytics Engine (no table to manage) or a D1 `errors` table with a 30-day cleanup. No third-party
  SDK, so the Play Data safety form only gains "crash logs, not linked to the user". Update `/privacy` in
  `apps/site`.
- **Done when:** a thrown error on a phone shows up in the store within a minute, and a flood from one client is
  capped.
- **Status (Nov 14):** built as planned, with D1: `apps/server/src/errors.js` (one row per error and build, with a
  count; rows unseen for 30 days are deleted as reports come in), `POST /errors` (rate limit `LIMIT_ERRORS`, 16 KB
  cap), `apps/client/src/net/crashReports.ts` (sendBeacon as text/plain, each error once, 10 per session, nothing
  sent from dev builds), `UI/ErrorScreen` with a Reload button, reported through the React root's `onCaughtError`
  with the component stack. The build id is the commit (`__APP_BUILD__` in `vite.config.js`), also shown in
  Settings > About. Read reports with `pnpm errors`. Privacy policy updated. Checked end to end in headless Chrome
  (uncaught error, rejection, render error, cap, reload). Left: deploy (server, then site), then the Play Data safety
  form gains "Crash logs" (collected, not shared, not linked to the user). Stack traces are minified; hidden source
  maps per build would make them readable.

### A2. Protocol version and "update the app" — done
- **Why:** pushing to `main` redeploys the Worker (Workers Builds), but testers keep a fixed APK. Today the join
  message has no version, so one protocol change silently breaks every installed copy.
- **Where:** `PROTOCOL_VERSION` in `packages/shared/gameplay.js`; client join in `apps/client/src/net/socket.js`;
  check in `packages/game/src/RoomHost.js` (close codes 4000–4005 are taken, use `4006 OUTDATED`); a message in
  the menu with a link to the store.
- **How:** the server accepts a range (`MIN_PROTOCOL..PROTOCOL_VERSION`) so old apps keep working until a change
  really breaks them. Nearby games (the phone hosts `RoomHost`) carry the same check.
- **Done when:** a client with a lower version gets the update message, not a broken match. Server tests cover it.
- **Status (Nov 14):** built as planned. `PROTOCOL_VERSION` and `MIN_PROTOCOL` (both 1) in
  `packages/shared/gameplay.js`, whose comment says when to bump which; the join sends `protocol`, and none counts as
  1, so the installed closed-test builds keep working. `RoomHost` refuses an app outside the range before it can make
  the room: an `outdated` message with `{ min, max }`, then close `4006 OUTDATED`; an app from before versions gets a
  notification and `4000` instead, which it already understands. The app works out who is behind: if it is, a notice
  plus a box in the menu's tagline spot with Update (the Play listing on Android, the website on iOS until there is
  an App Store listing) or Reload on the web; if the room is, "the host needs to update" (nearby) or "the server is
  being updated". Nearby games replaced `NEARBY_VERSION` with the same range: hosts advertise `v` and `min`, and the
  Nearby tab says whose app to update. Checked in headless Chrome against the real `RoomHost` (accepted, app too old
  on web and Android, server behind, four phone sizes with no overflow).

### A3. CI before deploy — done
- **Why:** there are no GitHub workflows; a push to `main` goes live untested.
- **Where:** `.github/workflows/ci.yml`.
- **How:** on push and pull request: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`,
  `pnpm --filter @rimfire/server check` (wrangler dry run), `pnpm build`. Then either point the Workers Builds
  production branch at a `release` branch, or deploy from the workflow with a Cloudflare API token secret after the
  checks pass.
- **Done when:** a failing test blocks the deploy.
- **Note (Nov 14):** a push to `main` doesn't deploy the Worker today: after pushing the error reporting (d48006c),
  `POST /errors` was still 404 on the live server. The only build on push is a Cloudflare Pages project `rimfire`
  (the web client, rimfire.pages.dev). So deploying from this workflow is the way, and until then the server goes
  out with `pnpm deploy:server`.
- **Status (Nov 14):** `.github/workflows/ci.yml`. Every push and pull request runs lint, the client's `typecheck`
  (new script, `tsc --noEmit`), all tests, the wrangler dry run and both builds. A push to `main` that passes deploys
  the website every time and the game server only when the push touched `apps/server`, `packages` or the lockfile,
  because a server deploy restarts every room and ends the matches in them; Run workflow deploys everything. The deploy
  job needs the checks (`needs: check`), so a failing test blocks it. Wrangler keeps the deployed Worker's D1 database
  (it inherits the binding), so a deploy from a fresh machine doesn't make a new one. The web game can move here too:
  turn off Pages' automatic production deployments and set the repository variable `PAGES_FROM_CI=true`. Checked:
  every step passes in a clean clone without a Cloudflare login, actionlint, and the change detection against real
  commit ranges. Left: the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets (until then the deploy is
  skipped with a warning), then one Run workflow to put out what has piled up. Caveat: on `main` only one run waits
  behind a running one, so if three pushes land within a few minutes the middle one is cancelled, and a server change
  in it waits for the next deploy that includes the server (or Run workflow).

### A4. In-app feedback — todo
- **Why:** testers need a one-tap way to report what felt wrong.
- **Where:** Settings > About (`apps/client/src/UI/Settings/Settings.jsx`).
- **How:** start with a `mailto:` to the contact address on the site, pre-filled with app version, platform and
  device. Later a `POST /feedback` route if email is too much friction.
- **Done when:** the button opens a pre-filled email on Android and iOS.

### A5. Server movement checks — todo
- **Why:** `GameRoom.move()` (`packages/game/src/GameRoom.js`) stores any position a client sends, so a modded
  client can teleport. That matters once Quick play is public.
- **How:** limit the horizontal distance per elapsed time to `SPRINT_SPEED` plus slack (lag bursts, jump pads,
  respawns are exempt), clamp to the map's bounds, and on a violation keep the last good position and tell the
  client (`moveRejected`) so it snaps back. Count violations per player; kick after many.
- **Done when:** GameRoom tests cover a teleport, a fast-but-legal burst after lag, and respawn.

### A6. Dependency alerts — todo
- **Why:** GitHub Dependabot listed many alerts before the November upgrade; nobody has checked what remains.
- **How:** `gh api repos/{owner}/{repo}/dependabot/alerts`, fix what reaches shipped code, dismiss dev-only noise
  with a reason.

---

## B. Characters and cosmetics

The remote-player model was a civilian ("Person" from Sketchfab) with a script-made rig and code-driven
animation. It is being replaced by two Mixamo soldiers with recorded animations. Mixamo files are free to use
inside the game but must not be shared as raw files: the sources stay in `apps/client/assets-src/mixamo/`,
which git ignores (`*.fbx`).

### B1. New soldier characters — doing
- **Sources:** `assets-src/mixamo/Ch15_nonPBR.fbx` (grey camo, plate vest) and `Ch35_nonPBR.fbx` (black SWAT, gas
  mask); animations in `assets-src/mixamo/animations/Pro Rifle Pack/` (49 clips, no reload) and
  `Pistol_Handgun Locomotion Pack/` (20 clips).
- **Build:** `apps/client/scripts/build-characters.py` (headless Blender) bakes a gun-grip finger pose into the
  mesh, removes finger and end bones, cuts each mesh to a phone budget, packs its textures into one atlas, removes
  the forward travel from the walk and run clips, and exports the characters plus one shared clip file to
  `public/models/`. Then the meshopt/WebP compression step.
- **Runtime:** `apps/client/src/RemotePlayer.jsx` plays the clips with an `AnimationMixer`: walk, run and sprint
  blended by direction, aim pitch spread over the spine, jump, a death clip, pistol clips for the pistol, recoil
  done in code. Guns ride on the right-hand bone.
- **Done when:** both soldiers move, aim and die convincingly in the game; frame time on the low-end test phone
  is no worse than with the old soldier; the old `soldier.glb`, `soldierRig.js` and its credit are removed.
- **Status (Nov 14):** built and checked in headless Chrome (all gaits, pistol, aim pitch, deaths, 60 fps). Old
  soldier removed from the app and its in-app credit dropped. Left: measure on the low-end phone (with 4 soldiers
  animating close by, the new ones cost about 1 ms more main-thread time per frame at a 6x CPU slowdown; far and
  off-screen soldiers animate less often), ship in a new closed-test build. The website keeps the old model's
  credit until its screenshots and the store's are retaken with the new soldiers.
- Soldiers also hold the first-person AK now (`rifle_tp.glb`, extracted from `viewmodel_ak.glb` by
  `ONLY=rifle node scripts/build-models.mjs`), replacing the low-poly AKS-74U; its credit stays on the website for
  the same reason.

### B2. Team armband — todo (after B1)
- A band on the upper arm in the team colour (`src/game/teams.js`), only in team matches. In team matches each
  team also wears one of the two soldiers, so sides read from the body, not just the name tag.

### B3. Reload animation — todo
- The rifle pack has no reload. Download Mixamo's single "Reloading" (FBX, without skin, 30 fps) into
  `assets-src/mixamo/animations/`, add it to the build, play it on the upper body while `FLAG_RELOAD` is set.

### B4. Menu character preview — todo
- **Why:** players should see their soldier, which is also where future outfits get picked and shown.
- **Where:** the menu (`src/UI/RoomSelector/RoomSelector.jsx`): a small R3F canvas with only the character, the
  idle clip, drag to turn. Pause rendering when the menu is hidden; keep it off on the lowest quality setting if it
  costs the phone.

### B5. End-of-match podium — todo
- The top 3 standing in their outfits on the game-over screen, using the B4 preview scene.

### B6. Outfits and the locker — todo (needs D2)
- A skin id per profile (D1), sent in `publicPlayer` so everyone sees it; the locker screen built on B4.
  Matching sleeve tint on the first-person arms (`src/ViewModel.jsx`).

### B7. Third-person camera — later, optional
- Decided to keep first-person gameplay. If it comes back: a setting or a separate mode (third-person sees around
  corners, which changes fairness), camera collision, crosshair from the camera with shots still starting at the
  eyes (the server checks the origin).

---

## C. Experience

### C1. Graphics and audio settings — todo
- Settings has Controls, Account and About only. Add: quality Low/High (today `LOW_QUALITY` in `src/config.ts`
  picks by device), antialiasing on/off (measured +7% frame time on the low-end phone), a 30/60 fps cap for battery,
  master and effects volume (`src/game/audio.js`). Store in `SettingsStore.ts`.

### C2. Damage direction and haptics — todo
- The `hit` message already carries `from` (the shooter's eye position). Draw an arc around the crosshair pointing
  at it for ~1 s (`src/UI/Hud`). Haptics with `@capacitor/haptics`: light on hit given, medium on hit taken, heavy on
  death; a setting to turn them off.

### C3. Enemy footsteps — todo
- Only your own footsteps play. Play positional steps for remote players from the walk cycle in
  `RemotePlayer.jsx` (`playSoundAt`), quieter when walking slowly, none while aiming. Cap how many play at once.

### C4. Touch aim assist — todo
- Mild slowdown of look speed while the crosshair is over an enemy, plus slight drag toward them when moving, touch
  only, setting to turn off. Keep it weak enough that mouse players don't lose out.

### C5. First-run tutorial — todo
- On first launch, a practice room with control hints over the touch buttons (move, look, fire, aim, reload, switch
  gun), dismissed step by step. Remember it was done in `localStorage`.

### C6. Death screen details — todo
- Show who killed you, the gun, the distance and how much health they had left. `playerDead` has the killer and
  gun; add distance and killer health on the server.

### C7. Layout fixes — todo
- Found while capturing store screenshots: the HUD is very small on iPad (scale it for tablets), at 640×360 CSS the
  room bar covers the deaths counter, and the menu's "Create room" tab wraps to two lines.

---

## D. Features

### D1. Invite link and share — todo
- `https://rimfire.anminas.com/r/<room code>`: opens the app on Android (App Links, `assetlinks.json` on the site)
  and iOS (universal links), and the site page explains how to get the game otherwise. A Share button next to
  the room code using `@capacitor/share` (Web Share on the web).

### D2. XP, levels and progression — todo
- XP per kill, headshot and match finished, levels shown on the profile and the scoreboard, stored in D1 by the
  existing `onResults`. Unlocks outfits (B6). Later, paid outfits through Play Billing / App Store purchases — no
  ads.

### D3. Bot difficulty — todo
- Easy / Normal / Hard for Practice: reaction time, aim error and how far bots see, in
  `packages/game/src/bots/BotDirector.js`.

### D4. New modes — todo
- King of the Hill (hold a zone; zones as map data) and Gun Game (each kill moves you to the next gun; better
  once there are more guns). Add to `MODES` in `gameplay.js`.

### D5. Crouch, grenades, minimap — todo
- Crouch: the rifle pack already has crouch clips; smaller capsule on the server for hits. Grenades: thrown arc,
  server-timed explosion with wall checks. Minimap: map outline from map data, teammates always, enemies only when
  they fire.

### D6. More block maps — todo
- Built as data like Depot and Outpost (`packages/shared/maps/`), so bots can play them straight away.
