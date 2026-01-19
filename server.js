const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('./database');

const app = express();
const server = http.createServer(app);

// ✅ CORS CONFIGURADO PARA RENDER
const io = new Server(server, {
    cors: {
        origin: '*',  // En producción, cambiar a tu dominio específico
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const PORT = process.env.PORT || 10000;
const db = new Database();

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Rutas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// API: Crear sala
app.post('/api/rooms', async (req, res) => {
    try {
        const { name, username, tmdb_id, media_type } = req.body;
        const roomId = Math.random().toString(36).substring(2, 9);

        await db.createRoom(roomId, name, username, tmdb_id, media_type);
        console.log(`✅ Sala creada: ${roomId} - ${name} por ${username}`);

        res.json({ roomId, name, username });
    } catch (error) {
        console.error('❌ Error al crear sala:', error);
        res.status(500).json({ error: 'Error al crear la sala' });
    }
});

// API: Obtener datos de sala
app.get('/api/rooms/:roomId', async (req, res) => {
    try {
        const room = await db.getRoom(req.params.roomId);
        if (!room) {
            return res.status(404).json({ error: 'Sala no encontrada' });
        }
        res.json(room);
    } catch (error) {
        console.error('❌ Error al obtener sala:', error);
        res.status(500).json({ error: 'Error al obtener la sala' });
    }
});

// Socket.IO
const activeUsers = new Map();

io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('join-room', async ({ roomId, username }) => {
        try {
            socket.join(roomId);

            if (!activeUsers.has(roomId)) {
                activeUsers.set(roomId, new Map());
            }
            activeUsers.get(roomId).set(socket.id, username);

            const messages = await db.getMessages(roomId);
            const ratings = await db.getRatings(roomId);
            const reactions = await db.getReactions(roomId);

            socket.emit('load-history', { messages, ratings, reactions });

            const users = Array.from(activeUsers.get(roomId).values());
            io.to(roomId).emit('users-update', users);

            console.log(`👤 ${username} se unió a sala ${roomId}`);
        } catch (error) {
            console.error('❌ Error en join-room:', error);
        }
    });

    socket.on('send-message', async ({ roomId, username, message }) => {
        try {
            await db.saveMessage(roomId, username, message);
            io.to(roomId).emit('new-message', { username, message, timestamp: new Date() });
        } catch (error) {
            console.error('❌ Error al enviar mensaje:', error);
        }
    });

    socket.on('send-rating', async ({ roomId, username, rating }) => {
        try {
            await db.saveRating(roomId, username, rating);
            const ratings = await db.getRatings(roomId);
            io.to(roomId).emit('ratings-update', ratings);
        } catch (error) {
            console.error('❌ Error al enviar rating:', error);
        }
    });

    socket.on('send-reaction', async ({ roomId, username, time, message }) => {
        try {
            await db.saveReaction(roomId, username, time, message);
            const reactions = await db.getReactions(roomId);
            io.to(roomId).emit('reactions-update', reactions);
        } catch (error) {
            console.error('❌ Error al enviar reacción:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Cliente desconectado: ${socket.id}`);

        for (const [roomId, users] of activeUsers.entries()) {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                const userList = Array.from(users.values());
                io.to(roomId).emit('users-update', userList);

                if (users.size === 0) {
                    activeUsers.delete(roomId);
                }
                break;
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
