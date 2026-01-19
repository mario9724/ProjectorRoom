const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos en memoria solo para usuarios activos
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;

    if (!roomName || !hostUsername || !manifest || !sourceUrl) {
        return res.json({ success: false, message: 'Datos incompletos' });
    }

    const roomId = generateId();
    const roomData = {
        id: roomId,
        roomName,
        hostUsername,
        manifest,
        sourceUrl,
        useHostSource: useHostSource !== false,
        projectorType: projectorType || 'public',
        customManifest: customManifest || '',
        createdAt: new Date().toISOString()
    };

    try {
        await db.createRoom(roomData);
        console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
        res.json({
            success: true,
            projectorRoom: roomData
        });
    } catch (error) {
        console.error('❌ Error creando sala:', error);
        res.json({ success: false, message: 'Error creando sala' });
    }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', async (req, res) => {
    const roomId = req.params.id;

    try {
        const room = await db.getRoom(roomId);
        if (!room) {
            return res.json({ success: false, message: 'Sala no encontrada' });
        }
        res.json({
            success: true,
            projectorRoom: room
        });
    } catch (error) {
        console.error('❌ Error obteniendo sala:', error);
        res.json({ success: false, message: 'Error obteniendo sala' });
    }
});

// Obtener mensajes de chat
app.get('/api/projectorrooms/:id/messages', async (req, res) => {
    const roomId = req.params.id;

    try {
        const messages = await db.getChatMessages(roomId);
        res.json({ success: true, messages });
    } catch (error) {
        console.error('❌ Error obteniendo mensajes:', error);
        res.json({ success: false, messages: [] });
    }
});

// Obtener calificaciones
app.get('/api/projectorrooms/:id/ratings', async (req, res) => {
    const roomId = req.params.id;

    try {
        const ratings = await db.getRatings(roomId);
        res.json({ success: true, ratings });
    } catch (error) {
        console.error('❌ Error obteniendo calificaciones:', error);
        res.json({ success: false, ratings: [] });
    }
});

// Obtener reacciones
app.get('/api/projectorrooms/:id/reactions', async (req, res) => {
    const roomId = req.params.id;

    try {
        const reactions = await db.getReactions(roomId);
        res.json({ success: true, reactions });
    } catch (error) {
        console.error('❌ Error obteniendo reacciones:', error);
        res.json({ success: false, reactions: [] });
    }
});

// Servir HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Servir sala
app.get('/sala/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('🔌 Usuario conectado:', socket.id);

    // UNIRSE A SALA
    socket.on('join-room', async ({ roomId, username }) => {
        console.log(`👤 ${username} intenta unirse a sala ${roomId}`);

        try {
            socket.join(roomId);

            if (!roomUsers[roomId]) {
                roomUsers[roomId] = [];
            }

            // Agregar usuario
            roomUsers[roomId].push({
                id: socket.id,
                username: username
            });

            // Guardar datos en socket
            socket.roomId = roomId;
            socket.username = username;

            console.log(`✅ ${username} unido a sala ${roomId}`);

            // Cargar historial y enviarlo al usuario que acaba de unirse
            try {
                const messages = await db.getChatMessages(roomId);
                const ratings = await db.getRatings(roomId);
                const reactions = await db.getReactions(roomId);

                console.log(`📚 Enviando historial a ${username}: ${messages.length} mensajes, ${ratings.length} ratings, ${reactions.length} reacciones`);

                socket.emit('load-history', {
                    messages,
                    ratings,
                    reactions
                });
            } catch (error) {
                console.error('❌ Error cargando historial:', error);
                // Enviar historial vacío en caso de error
                socket.emit('load-history', {
                    messages: [],
                    ratings: [],
                    reactions: []
                });
            }

            // Notificar a todos en la sala
            io.to(roomId).emit('user-joined', {
                user: { id: socket.id, username },
                users: roomUsers[roomId]
            });
        } catch (error) {
            console.error('❌ Error en join-room:', error);
        }
    });

    // MENSAJE DE CHAT
    socket.on('chat-message', async ({ roomId, message }) => {
        console.log(`💬 [${roomId}] ${socket.username}: ${message}`);

        try {
            await db.saveChatMessage(roomId, socket.username, message);
            io.to(roomId).emit('chat-message', {
                username: socket.username,
                message: message
            });
        } catch (error) {
            console.error('❌ Error guardando mensaje:', error);
            // Emitir el mensaje aunque falle el guardado
            io.to(roomId).emit('chat-message', {
                username: socket.username,
                message: message
            });
        }
    });

    // CALIFICACIÓN
    socket.on('add-rating', async ({ roomId, username, rating }) => {
        console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);

        try {
            await db.saveRating(roomId, username, rating);

            // Obtener todas las calificaciones actualizadas
            const allRatings = await db.getRatings(roomId);

            io.to(roomId).emit('rating-added', {
                username,
                rating,
                allRatings
            });
        } catch (error) {
            console.error('❌ Error guardando calificación:', error);
            // Emitir sin allRatings en caso de error
            io.to(roomId).emit('rating-added', {
                username,
                rating
            });
        }
    });

    // REACCIÓN
    socket.on('add-reaction', async ({ roomId, username, time, message }) => {
        console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);

        try {
            await db.saveReaction(roomId, username, time, message);
            io.to(roomId).emit('reaction-added', {
                username,
                time,
                message
            });
        } catch (error) {
            console.error('❌ Error guardando reacción:', error);
            // Emitir aunque falle el guardado
            io.to(roomId).emit('reaction-added', {
                username,
                time,
                message
            });
        }
    });

    // DESCONEXIÓN
    socket.on('disconnect', () => {
        console.log('🔴 Usuario desconectado:', socket.id);
        const roomId = socket.roomId;
        const username = socket.username;

        if (roomId && roomUsers[roomId]) {
            // Remover usuario de la sala
            roomUsers[roomId] = roomUsers[roomId].filter(user => user.id !== socket.id);

            // Notificar a los demás
            io.to(roomId).emit('user-left', {
                username: username,
                users: roomUsers[roomId]
            });

            // Limpiar sala si está vacía (solo de memoria, no de DB)
            if (roomUsers[roomId].length === 0) {
                delete roomUsers[roomId];
                console.log(`🗑️ Sala ${roomId} limpiada de memoria (sin usuarios activos)`);
            }
        }
    });
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Cerrar base de datos al terminar
process.on('SIGINT', () => {
    console.log('\n🔴 Cerrando servidor...');
    db.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🔴 Cerrando servidor...');
    db.close();
    process.exit(0);
});
