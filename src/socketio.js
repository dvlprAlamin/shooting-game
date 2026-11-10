import { GameRoom } from './GameRoom.js';

/**
 * Socket.IO transport: one GameRoom per room id, socket events routed to it.
 * All game rules live in GameRoom; this file only handles connections and room lookup.
 */
export function attachSocketIO(io) {
    const rooms = new Map(); // roomId -> { room: GameRoom, timer }
    const sockets = new Map(); // socket id -> socket

    const send = (id, event, data, volatile) => {
        const socket = sockets.get(id);
        if (!socket) return;
        const target = volatile ? socket.volatile : socket;
        if (data === undefined) target.emit(event);
        else target.emit(event, data);
    };

    const createRoom = (roomId, settings) => {
        const entry = { room: new GameRoom({ ...settings, send }), timer: null };
        entry.timer = setInterval(() => {
            entry.room.tick();
            if (entry.room.ended) {
                clearInterval(entry.timer);
                entry.timer = null;
            }
        }, 1000);
        rooms.set(roomId, entry);
        return entry;
    };

    const closeRoom = (roomId) => {
        clearInterval(rooms.get(roomId)?.timer);
        rooms.delete(roomId);
    };

    const roomOf = (socket) => rooms.get(socket.data.roomId)?.room;

    const leaveRoom = (socket) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        socket.data.roomId = null;
        const entry = rooms.get(roomId);
        if (!entry) return;
        entry.room.leave(socket.id);
        // If no players left in the room, remove the room
        if (entry.room.isEmpty) closeRoom(roomId);
    };

    io.on('connection', (socket) => {
        console.log('a user connected', socket.id);
        sockets.set(socket.id, socket);
        const notify = (message) => socket.emit('notification', { message });

        // Join or create a room
        socket.on('joinRoom', (payload) => {
            const { playerName, isCreate, duration, playersLimit } = payload || {};
            const roomId = String(payload?.roomId || '').trim();
            if (!roomId) return notify('Invalid room id!');
            if (socket.data.roomId) return notify('Already in a room!');

            let entry = rooms.get(roomId);
            if (!entry) {
                if (!isCreate) return notify('Room not exist!');
                entry = createRoom(roomId, { duration, playersLimit });
            }
            const error = entry.room.join(socket.id, playerName);
            if (error) {
                notify(error);
                if (entry.room.isEmpty) closeRoom(roomId);
                return;
            }
            socket.data.roomId = roomId;
        });

        socket.on('move', (data) => roomOf(socket)?.move(socket.id, data));
        socket.on('shoot', (data) => roomOf(socket)?.shoot(socket.id, data));
        socket.on('respawn', () => roomOf(socket)?.respawn(socket.id));

        socket.on('disconnect', () => {
            console.log('user disconnected', socket.id);
            leaveRoom(socket);
            sockets.delete(socket.id);
        });
    });

    return { rooms };
}
