# Shooting Game Server

This is the backend server for the shooting game. There are two versions:

- **Cloudflare Worker** (`worker/`), used by the current client. See [Cloudflare Worker](#cloudflare-worker).
- **Node + Socket.IO** (`server.js`, Docker), used by client builds from before the Worker. Keep it running
  until every player has the new client, then it can go.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Running with Docker

1.  **Build and run the container:**

    ```bash
    docker-compose up --build
    ```

    This will start the server on port 3000.

2.  **Stop the container:**

    Press `Ctrl+C` in the terminal where it's running, or run:

    ```bash
    docker-compose down
    ```

3.  **Run in detached mode (background):**

    ```bash
    docker-compose up -d
    ```

4.  **View logs:**

    ```bash
    docker-compose logs -f
    ```

## Development

To run locally without Docker:

1.  Install dependencies:
    ```bash
    yarn install
    ```

2.  Start the server:
    ```bash
    yarn start
    ```

3.  Run the tests:
    ```bash
    yarn test
    ```

## Layout

- `src/GameRoom.js` is one match: players, scores, timer, and the checks on moves, shots and respawns. Both
  servers use it.
- `src/RoomHost.js` serves one room over plain WebSockets: joining, reconnecting (a dropped player has
  10 seconds to come back with their score), the timer, and limits on what one connection may send.
- `worker/` is the Cloudflare Worker: Hono routes `/rooms/<roomId>` to that room's Durable Object, which holds
  a RoomHost.
- `server.js` and `src/socketio.js` are the Node + Socket.IO server for older clients. They hold no game rules.
- `shared/` holds gameplay numbers the client also uses. The client keeps a copy in `shooting-game/src/shared/`:
  after editing here, run `pnpm sync:shared` in `shooting-game/`. `yarn test` fails while the copies differ.

## Cloudflare Worker

Each room is its own Durable Object, so rooms run independently and close to the player who created them.

One-time setup:

```bash
cd worker
pnpm install
pnpm exec wrangler login
```

Commands (in `worker/`):

```bash
pnpm dev              # run locally on http://localhost:8787 (for phones on your LAN: pnpm dev --ip 0.0.0.0)
pnpm test             # route tests; the game and connection tests run with `yarn test` in the repo root
pnpm check            # build without deploying
pnpm run deploy       # deploy; prints the URL, e.g. https://shooting-game.<your-subdomain>.workers.dev
```

Use `pnpm run deploy`, not `pnpm deploy`: `pnpm deploy` is a built-in pnpm command that does something else.

Then set `VITE_SERVER_URL` in the client's `.env` to the Worker's URL (or a custom domain routed to it) and
rebuild the client.
