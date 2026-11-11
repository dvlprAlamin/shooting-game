import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PROFILE_ID_PATTERN, ROOM_ID_PATTERN } from '@shooter/shared';
import { verifyGoogleIdToken } from './googleAuth.js';
import { lobbyOf } from './lobbyOf.js';
import { deleteProfile, getProfile, signIn } from './profiles.js';

const app = new Hono();

// The game is served from other origins (the web build's host, capacitor://localhost in the apps).
app.use('/quickplay', cors());
app.use('/profile/*', cors());
app.use('/auth/*', cors());

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

// Deletes a profile's record (and its link to an account). Whoever has the id may: it's what plays as the profile.
app.delete('/profile/:id', async (c) => {
    const id = c.req.param('id');
    if (!PROFILE_ID_PATTERN.test(id)) return c.json({ error: 'Invalid profile id' }, 400);
    if (!c.env.DB) return c.json({ error: 'Profiles are not set up on this server' }, 503);
    await deleteProfile(c.env.DB, id);
    return c.body(null, 204);
});

// Sign in with Google: the app sends Google's ID token and the profile id it has been using, and gets back the
// profile id to use from now on (the account's, see signIn) with its totals. GOOGLE_CLIENT_ID is the OAuth
// client the tokens are issued for (comma-separated if there are several); without it sign-in is off.
app.post('/auth/google', async (c) => {
    const audiences = String(c.env.GOOGLE_CLIENT_ID ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (!c.env.DB || !audiences.length) return c.json({ error: 'Sign-in is not set up on this server' }, 503);
    const { idToken, profileId } = (await c.req.json().catch(() => null)) ?? {};
    const validToken = typeof idToken === 'string' && idToken.length <= 4096;
    if (!validToken || typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId)) {
        return c.json({ error: 'Expected { idToken, profileId }' }, 400);
    }
    let claims;
    try {
        claims = await verifyGoogleIdToken(idToken, audiences);
    } catch {
        return c.json({ error: "Can't reach Google to check the sign-in" }, 502);
    }
    if (!claims) return c.json({ error: 'Invalid sign-in' }, 401);
    const id = await signIn(c.env.DB, { provider: 'google', subject: claims.sub, profileId });
    return c.json({ profileId: id, profile: await getProfile(c.env.DB, id) });
});

export default app;
