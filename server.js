const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { roomData, loadRoom, saveRoom } = require('./persistence');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos
app.use(express.static('public'));
app.use(express.json());

// Rutas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sala/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ==================== API ====================

app.post('/api/projectorrooms/create', async (req, res) => {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
    const roomId = Date.now().toString();
    
    const room = {
        id: roomId,
        roomName,
        hostUsername,
        manifest,
        sourceUrl,
        useHostSource,
        projectorType,
        customManifest,
        users: []
    };
    
    roomData[roomId] = room;
    await saveRoom(roomId);
    
    res.json({ success: true, projectorRoom: room });
});

app.get('/api/projectorrooms/:id', async (req, res) => {
    const roomId = req.params.id;
    
    if (!roomData[roomId]) {
        await loadRoom(roomId);
    }
    
    if (!roomData[roomId]) {
        return res.status(404).json({ success: false, message: 'Sala no encontrada' });
    }
    
    const room = roomData[roomId];
    res.json({ 
        success: true, 
        projectorRoom: room 
    });
});

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
    console.log('🔌 Conexión:', socket.id);
    
    socket.on('join-room', async (roomId, username) => {
        await loadRoom(roomId);
        
        const history = roomData[roomId] || { messages: [], ratings: [], reactions: [] };
        socket.emit('load-history', history);
        
        socket.join(roomId);
        console.log(`👤 ${username} entró en ${roomId}`);
        
        socket.broadcast.to(roomId).emit('user-joined', { username });
    });
    
    socket.on('chat-message', async (roomId, message) => {
        await loadRoom(roomId);
        
        const msg = {
            username: socket.username || 'Anónimo',
            message,
            timestamp: Date.now()
        };
        
        roomData[roomId].messages = roomData[roomId].messages || [];
        roomData[roomId].messages.push(msg);
        await saveRoom(roomId);
        
        io.to(roomId).emit('chat-message', msg);
    });
    
    socket.on('add-rating', async (roomId, username, rating) => {
        await loadRoom(roomId);
        
        roomData[roomId].ratings = roomData[roomId].ratings || [];
        
        // Actualizar o añadir
        const existing = roomData[roomId].ratings.find(r => r.username === username);
        if (existing) {
            existing.rating = rating;
        } else {
            roomData[roomId].ratings.push({ username, rating });
        }
        
        await saveRoom(roomId);
        io.to(roomId).emit('rating-added', { username, rating });
    });
    
    socket.on('add-reaction', async (roomId, username, time, message) => {
        await loadRoom(roomId);
        
        roomData[roomId].reactions = roomData[roomId].reactions || [];
        roomData[roomId].reactions.push({ username, time, message });
        
        await saveRoom(roomId);
        io.to(roomId).emit('reaction-added', { username, time, message });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor en puerto ${PORT}`);
});
