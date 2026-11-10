# Game server

The game server is a Cloudflare Worker. Each room is its own Durable Object, so rooms run independently and close
to the player who created them.

## Layout

- `src/game/GameRoom.js` is one match: players, scores, timer, and the checks on moves, shots and respawns.
  It knows nothing about sockets, so the tests drive it directly.
- `src/game/RoomHost.js` serves one room over plain WebSockets: joining, reconnecting (a dropped player has
  10 seconds to come back with their score), the timer, and limits on what one connection may send.
- `src/app.js` is the Hono app: it routes `/rooms/<roomId>` to that room's Durable Object (`src/room.js`), which
  holds a RoomHost.
- Gameplay numbers the client also uses come from `@shooter/shared` (`packages/shared/` in the repo root).

## Commands

One-time setup, after `pnpm install` in the repo root:

```bash
pnpm exec wrangler login
```

In this folder:

```bash
pnpm dev              # run locally on http://localhost:8787 (for phones on your LAN: pnpm dev --ip 0.0.0.0)
pnpm test             # game, connection and route tests
pnpm check            # build without deploying
pnpm run deploy       # deploy; prints the URL, e.g. https://shooting-game.<your-subdomain>.workers.dev
```

Use `pnpm run deploy`, not `pnpm deploy`: `pnpm deploy` is a built-in pnpm command that does something else.
From the repo root, `pnpm deploy:server` does the same.

Then set `VITE_SERVER_URL` in `apps/client/.env` to the Worker's URL (or a custom domain routed to it) and
rebuild the client.
