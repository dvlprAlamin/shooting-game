import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { attachSocketIO } from './src/socketio.js';

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

attachSocketIO(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
