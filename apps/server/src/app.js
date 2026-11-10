import { Hono } from 'hono';
import { ROOM_ID_PATTERN } from '@shooter/shared';

const app = new Hono();

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

export default app;
