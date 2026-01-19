const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const storage = require('node-persist');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Inicializar node-persist
(async () => {
    await storage.init({
        dir: './projectorroom-data',
        forgiveParseErrors: true
    });
    console.log('✅ Persistencia inicializada');
})();

app.use(express.json());
app.use(express.static('public')); // Tu carpeta con HTML/CSS/JS

const rooms = new Map();

// ==================== API ENDPOINTS ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
    const id = Date.now().toString();
    
    const room = {
        id,
        roomName,
        hostUsername,
        manifest,
        sourceUrl,
        useHostSource,
        projectorType,
        customManifest,
        users: []
    };
    
    rooms.set(id, room);
    
    // Guardar sala en persistencia
    await storage.setItem(`room_${id}`, room);
    
    res.json({ success: true, projectorRoom: room });
});

// Obtener sala
app.get('/api/projectorrooms/:id', async (req, res) => {
    const roomId = req.params.id;
    let room = rooms.get(roomId);
    
    // Si no está en memoria, cargar de persistencia
    if (!room) {
        room = await storage.getItem(`room_${roomId}`);
        if (room) {
            room.users = [];
            rooms.set(roomId, room);
        }
    }
    
    if (!room) {
        return res.json({ success: false, message: 'Sala no encontrada' });
    }
    
    // Cargar datos persistentes
    const messages = await storage.getItem(`messages_${roomId}`) || [];
    const ratings = await storage.getItem(`ratings_${roomId}`) || [];
    const reactions = await storage.getItem(`reactions_${roomId}`) || [];
    
    res.json({
        success: true,
        projectorRoom: room,
        messages,
        ratings,
        reactions
    });
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('🔌 Usuario conectado:', socket.id);
    
    socket.on('join-room', async (roomId, username) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        socket.join(roomId);
        const user = { id: socket.id, username };
        room.users.push(user);
        
        console.log(`👤 ${username} se unió a la sala ${roomId}`);
        
        // Cargar historial y enviarlo al nuevo usuario
        const messages = await storage.getItem(`messages_${roomId}`) || [];
        const ratings = await storage.getItem(`ratings_${roomId}`) || [];
        const reactions = await storage.getItem(`reactions_${roomId}`) || [];
        
        socket.emit('load-history', { messages, ratings, reactions });
        
        io.to(roomId).emit('user-joined', { user, users: room.users });
    });
    
    socket.on('chat-message', async (roomId, message) => {
        const room = rooms.get(roomId);
        if (!room) return;
        
        const user = room.users.find(u => u.id === socket.id);
        if (!user) return;
        
        const messageData = {
            username: user.username,
            message,
            timestamp: Date.now()
        };
        
        // Guardar mensaje
        const messages = await storage.getItem(`messages_${roomId}`) || [];
        messages.push(messageData);
        await storage.setItem(`messages_${roomId}`, messages);
        
        console.log(`💬 [${room.roomName}] ${user.username}: ${message}`);
        
        io.to(roomId).emit('chat-message', messageData);
    });
    
    socket.on('add-rating', async (roomId, username, rating) => {
        const ratings = await storage.getItem(`ratings_${roomId}`) || [];
        
        // Actualizar o añadir rating
        const existingIndex = ratings.findIndex(r => r.username === username);
        const ratingData = { username, rating, timestamp: Date.now() };
        
        if (existingIndex !== -1) {
            ratings[existingIndex] = ratingData;
        } else {
            ratings.push(ratingData);
        }
        
        await storage.setItem(`ratings_${roomId}`, ratings);
        
        console.log(`⭐ ${username} calificó con ${rating}/10`);
        
        io.to(roomId).emit('rating-added', ratingData);
    });
    
    socket.on('add-reaction', async (roomId, username, time, message) => {
        const reactions = await storage.getItem(`reactions_${roomId}`) || [];
        
        const reactionData = {
            username,
            time,
            message,
            timestamp: Date.now()
        };
        
        reactions.push(reactionData);
        await storage.setItem(`reactions_${roomId}`, reactions);
        
        console.log(`🎬 ${username} reaccionó en ${time}: ${message}`);
        
        io.to(roomId).emit('reaction-added', reactionData);
    });
    
    socket.on('disconnect', () => {
        console.log('🔌 Usuario desconectado:', socket.id);
        
        rooms.forEach((room, roomId) => {
            const userIndex = room.users.findIndex(u => u.id === socket.id);
            if (userIndex !== -1) {
                const user = room.users[userIndex];
                room.users.splice(userIndex, 1);
                
                console.log(`👋 ${user.username} salió de la sala ${roomId}`);
                
                io.to(roomId).emit('user-left', {
                    username: user.username,
                    users: room.users
                });
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
