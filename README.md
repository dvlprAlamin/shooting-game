# RimFire

A multiplayer first-person shooter: a React Three Fiber client (web, Android, iOS) and a Cloudflare Worker game
server. This repo is one pnpm workspace:

| Folder | Package | What it is |
|---|---|---|
| [`apps/client`](apps/client) | `@rimfire/client` | The game: Vite + React Three Fiber, wrapped as Android/iOS apps with Capacitor |
| [`apps/server`](apps/server) | `@rimfire/server` | The game server: a Cloudflare Worker with one Durable Object per room, a Lobby for quick play, and D1 for profiles |
| [`packages/shared`](packages/shared) | `@rimfire/shared` | Gameplay numbers both sides must agree on (hitbox, room options), the weapon table and the maps |
| [`packages/game`](packages/game) | `@rimfire/game` | The game's rules (`GameRoom`), the room host that serves them and the bots: run by the Worker, and by the phone hosting a nearby game |

## Setup

Node 20 or newer and pnpm 10 (`corepack enable` picks the version from `package.json`). Then, in the repo root:

```bash
pnpm install
```

## Commands

Run these in the repo root:

```bash
pnpm dev             # client (Vite) and server (wrangler dev on http://localhost:8787) together
pnpm dev:client      # just the client
pnpm dev:server      # just the server
pnpm test            # all test suites
pnpm lint            # ESLint over the whole repo (eslint.config.js)
pnpm build           # production build of the client into apps/client/dist
pnpm deploy:server   # deploy the Worker (run `pnpm --filter @rimfire/server exec wrangler login` once first)
```

Commands for one app run from its folder (`cd apps/client && pnpm app:apk`) or from the root with a filter
(`pnpm --filter @rimfire/client app:apk`). The client's mobile app commands are in its README.

## Shared gameplay numbers

Edit `packages/shared/gameplay.js` (and `gameplay.d.ts` for the client's TypeScript files). The client and the
server both import it as `@rimfire/shared`, so a change reaches both at once with no copy step. Each gun's
numbers (damage and its drop-off with range, fire rate, magazine, reload and draw times, spread, recoil) and
the medkit's are in `packages/shared/weapons.js` (`@rimfire/shared/weapons`).

## Maps

Maps live in `packages/shared/maps/` and are imported as `@rimfire/shared/maps`. Canyon is modelled in Blender
(the GLBs in `apps/client/public/`). Depot and Outpost are built from boxes and ramps written as data
(`maps/build.js` has the helpers), so one file drives everything: the client draws them and makes their
colliders, and the server picks spawn points from them and refuses shots that go through their walls.

To add a block map, write a module like `maps/outpost.js` and add it to `MAPS` in `maps/index.js`. Then
`packages/game/test/maps.test.js` checks it: spawn points clear of boxes with a floor under them, ramps no steeper
than 30°, and no way to see or walk out. Materials (`m`) are the keys of `MATERIALS` in
`apps/client/src/maps/textures.js`.

## The old Node server

App builds from before the Worker talk to a Node + Socket.IO server. Its code lives on in the
[shooting-game-server](https://github.com/dvlprAlamin/shooting-game-server) repo and isn't part of this one.
Their address, `shooter-free-api.anmeson.com`, now belongs to the Worker, so those builds can't connect any more:
players need a current build.
