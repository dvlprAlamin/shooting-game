import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PROFILE_ID_PATTERN, ROOM_ID_PATTERN } from '@shooter/shared';
import { lobbyOf } from './lobbyOf.js';
import { getProfile } from './profiles.js';

const app = new Hono();

// The game is served from other origins (the web build's host, capacitor://localhost in the apps).
app.use('/quickplay', cors());
app.use('/profile/*', cors());

// Kept from the Node server for anything that pings it (Workers don't need waking up).
app.get('/activate', (c) => c.text('ok'));

// A room's WebSocket goes straight to that room's Durable Object.
app.get('/rooms/:roomId', (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
        return c.text('Expected a WebSocket upgrade', 426);
    }
    const roomId = c.req.param('roomId');
    if (!ROOM_ID_PATTERN.test(roomId)) return c.text('Invalid room id', 400);
    const rooms = c.env.ROOMS;
    return rooms.get(rooms.idFromName(roomId)).fetch(c.req.raw);
});

// Quick play: the room to join (`quick: true` in joinRoom), from the Lobby.
app.post('/quickplay', async (c) => c.json({ roomId: await lobbyOf(c.env).quickPlay() }));

// A profile's totals. Profiles need the DB binding (D1); without it the game works, minus profiles.
app.get('/profile/:id', async (c) => {
    const id = c.req.param('id');
    if (!PROFILE_ID_PATTERN.test(id)) return c.json({ error: 'Invalid profile id' }, 400);
    if (!c.env.DB) return c.json({ error: 'Profiles are not set up on this server' }, 503);
    const profile = await getProfile(c.env.DB, id);
    return profile ? c.json(profile) : c.json({ error: 'No such profile' }, 404);
});

export default app;
