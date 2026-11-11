# Shooting Game

## Controls

| | Desktop | Touch (phones, tablets, mobile app) |
|---|---|---|
| Move | WASD / arrows | Left thumb: the stick appears where you touch |
| Sprint | Shift | Push the stick all the way forward |
| Look | Mouse (click to capture) | Drag anywhere on the right half |
| Fire | Left click (hold for the rifle and SMG) | Red button (hold for auto fire; drag on it to aim while shooting) |
| Aim down sights | Right click (hold) | Scope button (tap to toggle) |
| Jump | Space | Arrow button |
| Reload | R | Circular-arrow button |
| Switch weapon | 1 rifle, 2 SMG, 3 marksman, 4 pistol; scroll wheel; Q for the last one | Gun button above the red one (next gun) |
| Medkit | 5 or H | Cross button (shows how many you have) |

Touch controls turn on automatically on touch-first devices and in the mobile app. Add `?touch=1` or
`?touch=0` to the URL to force them on or off (handy for testing on a desktop browser with device emulation).

## Mobile app (Capacitor)

The Android and iOS apps wrap the same Vite build with [Capacitor](https://capacitorjs.com).
Native projects live in `android/` and `ios/`.

Requirements: Android Studio (with the Android SDK) for Android; Xcode on macOS for iOS (deployment target iOS 15).

1. Point the app at your game server. The app can't derive it from its own address, so builds read it from
   `.env.production`, which points at the deployed Worker:

   ```
   VITE_SERVER_URL=https://shooting-game.services-65f.workers.dev
   ```

   This is the Cloudflare Worker in `apps/server`, on its `workers.dev` address for now (a custom domain later).
   The client no longer talks to the old Node + Socket.IO server.

   Use `https://` in production: Android and iOS block plain `http://` / `ws://` by default.

2. Build the web app, copy it into the native projects, and open the IDE:

   ```
   pnpm app:android   # opens Android Studio; press Run
   pnpm app:ios       # opens Xcode; pick a team under Signing & Capabilities, then Run
   ```

   After changing web code, run `pnpm app:sync` (build + copy to both platforms) and run again from the IDE.

### Building an APK

One-time setup: install [Android Studio](https://developer.android.com/studio) and open it once so it downloads
the Android SDK. It ships the JDK 21 the build needs. For command-line builds, add this to `~/.zshrc`:

```
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

**Debug APK** (for testing on your own phones):

```
pnpm app:apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with
`$ANDROID_HOME/platform-tools/adb install -r <apk>` over USB, or copy it to the phone and open it (allow
"Install unknown apps"). In Android Studio the same build is under Build > Generate App Bundles or APKs >
Generate APKs.

**Signed release APK** (to share publicly; Google Play wants an AAB instead, see below):

1. Create a signing key once, and back it up: you need the same key for every future update.

   ```
   keytool -genkey -v -keystore ~/shooterfree-release.jks -alias shooterfree -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Build and sign (`apksigner` comes from the SDK build tools):

   ```
   export PATH="$PATH:$(ls -d $ANDROID_HOME/build-tools/* | tail -1)"
   pnpm build && pnpm exec cap sync android
   pnpm exec cap build android --androidreleasetype APK --signing-type apksigner \
     --keystorepath ~/shooterfree-release.jks --keystorealias shooterfree \
     --keystorepass <password> --keystorealiaspass <password>
   ```

   Output: `android/app/build/outputs/apk/release/app-release-signed.apk`.

For Google Play, run the same `cap build` with `--androidreleasetype AAB` and without `--signing-type apksigner`
(app bundles are signed with the default `jarsigner`), then upload
`android/app/build/outputs/bundle/release/app-release-signed.aab`.

### Sign in with Google

Optional for players: signing in keeps their record on any device and after reinstalling. The button sits under
"Your record" on the Quick play tab, and stays hidden until the app and the server both have the Web OAuth
client id. Not on iOS yet: that needs an iOS client id, and Sign in with Apple alongside it.

1. In [Google Cloud Console](https://console.cloud.google.com/), in one project, under Google Auth Platform:
   - Set up the consent screen as External. While it's in Testing, only the accounts listed under Audience >
     Test users can sign in; publish it to let everyone in (the basic profile and email need no review).
   - Create a client of type **Web application**. Its id (`….apps.googleusercontent.com`) is the one the app and
     the server use. For the web build, add the game's address under Authorized JavaScript origins and the same
     address with a trailing `/` under Authorized redirect URIs.
   - Create a client of type **Android** for package `com.dvlpralamin.shooterfree` and the SHA-1 of the key that
     signs the APK: one per key (the debug key from `cd android && ./gradlew signingReport`, your release key,
     and Play App Signing's key if the app is on Google Play). Its id isn't used anywhere: Google only checks that
     the APK's key is registered.
2. Put the Web client id in `.env.production` as `VITE_GOOGLE_WEB_CLIENT_ID` and in `GOOGLE_CLIENT_ID` in
   `apps/server/wrangler.jsonc`, deploy the server, and rebuild the app.

Signed in, a player can sign out (the device starts a new record; the account keeps its own) or delete their
record. Google Play wants that in-app deletion, and also a web page where people can ask for it.

### Testing against a server on your LAN (Android)

For a quick test with the game server running on your computer (`pnpm dev --ip 0.0.0.0` in
`apps/server`):

```
VITE_SERVER_URL=http://192.168.x.x:8787 pnpm build
CAP_ALLOW_INSECURE=1 pnpm exec cap sync android
```

`CAP_ALLOW_INSECURE=1` allows cleartext `http://` / `ws://` traffic. Run a normal `pnpm app:sync` before making
a release build so it isn't shipped. On iOS, use an `https://` server.

### App details

- App id: `com.dvlpralamin.shooterfree` (`capacitor.config.ts`). Change it before the first store upload;
  it can't be changed afterwards.
- Landscape only, full screen (status/navigation bars hidden; an edge swipe shows them briefly).
- The Draco decoder for the map models is bundled in `public/draco/`, so the app needs no CDN.

## Gameplay numbers shared with the server

Values both sides must agree on (hitbox size, room options) come from `@rimfire/shared`, each gun's numbers
(damage, fire rate, magazine, reload, spread, recoil, speed) from `@rimfire/shared/weapons`
(`packages/shared/` in the repo root). Edit them there; the server picks up the same change.

## Quick play and profiles

The menu's first tab, Quick play, asks the server for a public room with free slots (`POST /quickplay`, see
`src/net/api.js`) and joins it; bots play there until people fill it. Practice, beside Play now, opens a
private room of your own against bots. Bots show a Bot tag on the scoreboard. The same tab shows your record (matches, wins, kills, K/D) from
`GET /profile/<id>`. The id is made once per device and kept in `localStorage` (`src/net/profile.js`); every
join sends it, and the server adds each match to it. Without profiles on the server the tab shows a line about
quick play instead.

## Team matches

Picking Teams in the menu makes a team match (`mode: 'tdm'`). The two teams' names and colours are in
`src/game/teams.js` and `--team-a` / `--team-b` in `src/index.scss`: Blue and Gold, apart from blaze (always
you) and teal (spawn protection). The HUD shows your team's score left of the timer, the scoreboard groups
players by team, and name tags take the team colour; teammates' tags show through walls at a fixed size.

## Weapons

Everyone carries all four guns and a medkit. The rifle is the AK in `public/models/viewmodel_ak.glb`. The SMG,
the pistol, the marksman rifle's scope and the medkit are built from simple shapes in `src/weapons/models.js`
and fixed to the AK rig's gun bone, so the SMG reloads with the AK's hands and every gun gets its draw, walk,
run and shot animations. `VIEWS` in `src/ViewModel.jsx` says how each one is held. The pistol is one-handed and
aims with the crosshair, because its sights can't line up with the AK's right hand; it dips out of view to
reload. Other players' soldiers hold the third-person versions (`thirdPersonModel`).
