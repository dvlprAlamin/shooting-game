// The one Lobby Durable Object (lobby.js), by name. Kept apart from lobby.js so the Hono app imports it
// without the Workers runtime (the tests run in Node).
export const lobbyOf = (env) => env.LOBBY.get(env.LOBBY.idFromName('lobby'));
