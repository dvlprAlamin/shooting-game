const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const rayIntersectsBox = require('./utils/rayIntersectsBox');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.get("/activate", (req, res) => {
    res.send("ok")
})

// Gameplay tuning (keep in sync with the client's src/game/constants.js)
const DAMAGE = 10;
const MAX_HEALTH = 100;
const MIN_FIRE_INTERVAL = 80; // ms, client fires every 100 ms; allow some jitter
const MAX_SHOT_DISTANCE = 250;
// Player hitbox around the body centre (capsule radius 0.35, 1.8 m tall).
const HITBOX_HALF_WIDTH = 0.35;
const HITBOX_HALF_HEIGHT = 0.9;
// Extra slack when validating client-side hits: covers interpolation delay and latency.
const HIT_TOLERANCE = 0.6;
const HISTORY_MS = 1000;

const rooms = {}; // To store players by room

const randomPositions = [
    {
        x: -45.62518310546875,
        y: -8.443558692932129,
        z: 21.901233673095703
    },
    {
        x: -27.604557037353516,
        y: -7.8375468254089355,
        z: 6.595322132110596
    },
    {
        x: 1.2871710062026978,
        y: -5.710155487060547,
        z: -15.965947151184082
    },
    {
        x: 23.793689727783203,
        y: -1.4231683015823364,
        z: -23.991069793701172
    },
    { x: -6.467380046844482, y: 3.295560121536255, z: -22.08796501159668 },
    { x: 5.820116996765137, y: -10.840858459472656, z: -3.90596866607666 }
]
const getRandomPosition = () => ({ ...randomPositions[Math.floor(Math.random() * randomPositions.length)] });

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const isVec3 = (v) => v && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z);

// The public view of a player (what other clients receive).
const publicPlayer = (p) => ({
    id: p.id,
    playerName: p.playerName,
    position: p.position,
    rotation: p.rotation,
    health: p.health,
    deaths: p.deaths,
    kills: p.kills,
    isDead: p.isDead,
});

const roomPlayers = (roomId) => {
    const out = {};
    for (const id in rooms[roomId].players) out[id] = publicPlayer(rooms[roomId].players[id]);
    return out;
};

const updateAllPlayersForLeaderboard = (roomId) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('leaderboardAllPlayers', roomPlayers(roomId));
}

const pushHistory = (player, now) => {
    player.history.push({ t: now, x: player.position.x, y: player.position.y, z: player.position.z });
    while (player.history.length && now - player.history[0].t > HISTORY_MS) player.history.shift();
};

// Did the shot ray pass through the target at any point in the recent past?
// Clients detect hits against what they see (interpolated, slightly in the past),
// so we accept a hit if any recent position matches within tolerance.
const validateHit = (origin, direction, target, now) => {
    const samples = target.history.length
        ? target.history
        : [{ t: now, x: target.position.x, y: target.position.y, z: target.position.z }];
    const hw = HITBOX_HALF_WIDTH + HIT_TOLERANCE;
    const hh = HITBOX_HALF_HEIGHT + HIT_TOLERANCE;
    for (const p of samples) {
        const t = rayIntersectsBox(
            origin,
            direction,
            { x: p.x - hw, y: p.y - hh, z: p.z - hw },
            { x: p.x + hw, y: p.y + hh, z: p.z + hw }
        );
        if (t !== null && t <= MAX_SHOT_DISTANCE) return true;
    }
    return false;
};

// Fallback for clients that don't report a target: nearest player hit by the ray.
const findTarget = (room, shooterId, origin, direction, maxDistance) => {
    let best = null;
    let bestT = Infinity;
    for (const id in room.players) {
        const target = room.players[id];
        if (id === shooterId || target.isDead) continue;
        const p = target.position;
        const t = rayIntersectsBox(
            origin,
            direction,
            { x: p.x - HITBOX_HALF_WIDTH, y: p.y - HITBOX_HALF_HEIGHT, z: p.z - HITBOX_HALF_WIDTH },
            { x: p.x + HITBOX_HALF_WIDTH, y: p.y + HITBOX_HALF_HEIGHT, z: p.z + HITBOX_HALF_WIDTH }
        );
        if (t !== null && t < bestT && t <= maxDistance) {
            best = target;
            bestT = t;
        }
    }
    return best;
};

const respawnPlayer = (roomId, playerId) => {
    const player = rooms[roomId].players[playerId];
    const newPosition = getRandomPosition();
    player.position = newPosition;
    player.health = MAX_HEALTH;
    player.deaths += 1;
    player.isDead = false;
    player.history = [];

    io.to(roomId).emit('playerRespawned', {
        ...publicPlayer(player),
        rotation: { x: 0, y: 0, z: 0 },
    });
};

const startRoomTimer = (roomId) => {
    const room = rooms[roomId];
    if (room.timer || room.ended) return;
    room.timer = setInterval(() => {
        room.duration -= 1;

        // Broadcast remaining time to all players in the room
        io.to(roomId).emit('timerUpdate', room.duration);

        if (room.duration <= 0) {
            clearInterval(room.timer);
            room.timer = null;
            room.ended = true;
            io.to(roomId).emit('gameOver');
        }
    }, 1000);
};

const leaveRoom = (socket) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.roomId = null;
    socket.leave(roomId);
    const room = rooms[roomId];
    if (!room) return;

    delete room.players[socket.id];
    // Broadcast the player disconnect to other players in the room
    io.to(roomId).emit('playerDisconnected', socket.id);
    updateAllPlayersForLeaderboard(roomId);

    // If no players left in the room, remove the room
    if (Object.keys(room.players).length === 0) {
        clearInterval(room.timer);
        delete rooms[roomId];
    }
};

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Join or create a room
    socket.on('joinRoom', ({ roomId, playerName, isCreate, duration, playersLimit } = {}) => {
        roomId = String(roomId || '').trim();
        playerName = String(playerName || '').trim().slice(0, 24) || 'Player';
        if (!roomId) {
            socket.emit('notification', { message: "Invalid room id!" });
            return
        }
        if (socket.data.roomId) {
            socket.emit('notification', { message: "Already in a room!" });
            return
        }

        if (!isCreate && !rooms[roomId]) {
            socket.emit('notification', { message: "Room not exist!" });
            return
        }

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: {},
                playersLimit: Number(playersLimit) || 5,
                duration: (Number(duration) || 5) * 60,
                timer: null,
                ended: false,
            };
        }
        const room = rooms[roomId];

        if (room.ended) {
            socket.emit('notification', { message: "This game is already over!" });
            return
        }

        if (room.playersLimit <= Object.keys(room.players).length) {
            socket.emit('notification', { message: "Room is full!" });
            return
        }

        socket.join(roomId);
        socket.data.roomId = roomId;

        // Start the game timer if it's not already running
        startRoomTimer(roomId);

        socket.emit('joinedRoom', { message: "Joined Room Successful!" });
        const now = Date.now();
        room.players[socket.id] = {
            id: socket.id,
            playerName: playerName,
            position: getRandomPosition(),
            rotation: { x: 0, y: 0, z: 0 },
            health: MAX_HEALTH,
            deaths: 0,
            kills: 0,
            isDead: false,
            lastShotAt: 0,
            history: [],
        };
        pushHistory(room.players[socket.id], now);

        // Send the current players in the room to the new player
        socket.emit('currentPlayers', roomPlayers(roomId));
        if (room.duration > 0) socket.emit('timerUpdate', room.duration);

        // Broadcast a new player to all other players in the room
        socket.to(roomId).emit('newPlayer', publicPlayer(room.players[socket.id]));
        updateAllPlayersForLeaderboard(roomId)
    });

    // Movement: { t, p: [x, y, z], yaw, pitch, f }
    // `t` is the sender's clock; receivers use it to interpolate without jitter.
    socket.on('move', (data) => {
        const roomId = socket.data.roomId;
        const player = rooms[roomId]?.players[socket.id];
        if (!player || !data || !Array.isArray(data.p)) return;
        const [x, y, z] = data.p;
        if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return;
        const yaw = isFiniteNumber(data.yaw) ? data.yaw : 0;
        const pitch = isFiniteNumber(data.pitch) ? data.pitch : 0;

        if (!player.isDead) {
            player.position = { x, y, z };
            player.rotation = { x: pitch, y: yaw, z: 0 };
            pushHistory(player, Date.now());
        }

        // Relay to everyone else in the room. Volatile: a late movement packet is useless,
        // so it's better to drop it than to queue it up.
        socket.to(roomId).volatile.emit('playerMoved', {
            id: socket.id,
            t: isFiniteNumber(data.t) ? data.t : 0,
            p: [x, y, z],
            yaw,
            pitch,
            f: data.f | 0,
        });
    });

    // Shot: { o: origin, d: direction, target?: playerId }
    socket.on('shoot', (data) => {
        const roomId = socket.data.roomId;
        const room = rooms[roomId];
        const shooter = room?.players[socket.id];
        if (!shooter || shooter.isDead || room.ended || !data) return;
        if (!isVec3(data.o) || !isVec3(data.d)) return;

        const now = Date.now();
        if (now - shooter.lastShotAt < MIN_FIRE_INTERVAL) return;
        shooter.lastShotAt = now;

        const len = Math.hypot(data.d.x, data.d.y, data.d.z);
        if (len < 1e-6) return;
        const direction = { x: data.d.x / len, y: data.d.y / len, z: data.d.z / len };

        // Let everyone else hear/see the shot.
        socket.to(roomId).emit('playerShot', { id: socket.id, o: data.o, d: direction });

        let target = null;
        if (typeof data.target === 'string') {
            const candidate = room.players[data.target];
            if (candidate && !candidate.isDead && candidate.id !== socket.id &&
                validateHit(data.o, direction, candidate, now)) {
                target = candidate;
            }
        } else if (data.target === undefined) {
            target = findTarget(room, socket.id, data.o, direction,
                isFiniteNumber(data.dist) ? data.dist : MAX_SHOT_DISTANCE);
        }
        if (!target) return;

        target.health = Math.max(0, target.health - DAMAGE);
        io.to(target.id).emit('hit', { health: target.health, from: data.o, shooter: socket.id });
        socket.emit('hitConfirmed', { id: target.id, health: target.health });

        if (target.health <= 0) {
            target.isDead = true;
            shooter.kills += 1;
            io.to(roomId).emit('playerDead', { id: target.id, shooter: socket.id, playerName: target.playerName, shooterName: shooter.playerName });
            io.to(roomId).emit('playerKilled', { id: socket.id, kills: shooter.kills });
            updateAllPlayersForLeaderboard(roomId)
        }
    });

    socket.on('respawn', () => {
        const roomId = socket.data.roomId;
        const player = rooms[roomId]?.players[socket.id];
        if (!player || !player.isDead || rooms[roomId].ended) return;
        respawnPlayer(roomId, socket.id);
        updateAllPlayersForLeaderboard(roomId)
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
        leaveRoom(socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
