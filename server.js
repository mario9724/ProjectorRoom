const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos en memoria
const projectorRooms = {};

// Ruta principal - SIEMPRE debe servir index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource } = req.body;
  
  const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  projectorRooms[roomId] = {
    id: roomId,
    roomName: roomName,
    hostUsername: hostUsername,
    manifest: manifest,
    sourceUrl: sourceUrl,
    useHostSource: useHostSource,
    users: [],
    videoState: {
      currentTime: 0,
      isPlaying: false,
      lastUpdate: Date.now()
    },
    createdAt: new Date().toISOString()
  };
  
  console.log('✅ Sala creada:', roomId);
  
  res.json({
    success: true,
    projectorRoom: projectorRooms[roomId]
  });
});

// API: Obtener sala
app.get('/api/projectorrooms/:id', (req, res) => {
  const room = projectorRooms[req.params.id];
  
  if (!room) {
    return res.status(404).json({
      success: false,
      message: 'Sala no encontrada'
    });
  }
  
  res.json({
    success: true,
    projectorRoom: room
  });
});

// Socket.IO: Gestión en tiempo real
io.on('connection', (socket) => {
  console.log('🔌 Usuario conectado:', socket.id);
  
  socket.on('join-room', ({ roomId, username }) => {
    console.log('👤', username, 'se unió a sala:', roomId);
    
    if (!projectorRooms[roomId]) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    const user = {
      id: socket.id,
      username: username,
      joinedAt: new Date().toISOString()
    };
    
    projectorRooms[roomId].users.push(user);
    
    // Notificar a todos
    io.to(roomId).emit('user-joined', {
      user: user,
      users: projectorRooms[roomId].users
    });
    
    // Enviar estado actual del video
    socket.emit('sync-state', projectorRooms[roomId].videoState);
  });
  
  socket.on('video-play', ({ roomId, currentTime }) => {
    console.log('▶️ Play en sala:', roomId);
    
    if (projectorRooms[roomId]) {
      projectorRooms[roomId].videoState = {
        currentTime: currentTime,
        isPlaying: true,
        lastUpdate: Date.now()
      };
      
      socket.to(roomId).emit('video-play', { currentTime });
    }
  });
  
  socket.on('video-pause', ({ roomId, currentTime }) => {
    console.log('⏸️ Pause en sala:', roomId);
    
    if (projectorRooms[roomId]) {
      projectorRooms[roomId].videoState = {
        currentTime: currentTime,
        isPlaying: false,
        lastUpdate: Date.now()
      };
      
      socket.to(roomId).emit('video-pause', { currentTime });
    }
  });
  
  socket.on('video-seek', ({ roomId, currentTime }) => {
    console.log('⏩ Seek en sala:', roomId, 'a', currentTime);
    
    if (projectorRooms[roomId]) {
      projectorRooms[roomId].videoState.currentTime = currentTime;
      projectorRooms[roomId].videoState.lastUpdate = Date.now();
      
      socket.to(roomId).emit('video-seek', { currentTime });
    }
  });
  
  socket.on('chat-message', ({ roomId, message }) => {
    console.log('💬 Mensaje en sala:', roomId, 'de', socket.username);
    
    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message: message,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
    
    if (socket.roomId && projectorRooms[socket.roomId]) {
      projectorRooms[socket.roomId].users = projectorRooms[socket.roomId].users.filter(
        u => u.id !== socket.id
      );
      
      io.to(socket.roomId).emit('user-left', {
        userId: socket.id,
        username: socket.username,
        users: projectorRooms[socket.roomId].users
      });
    }
  });
});

// Iniciar servidor
server.listen(PORT, () => {
  console.log('🚀 Servidor corriendo en puerto', PORT);
});
