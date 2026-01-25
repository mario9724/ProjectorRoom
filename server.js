const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos en memoria
let projectorRooms = {};
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, tmdbId, mediaType, movieData } = req.body;
  
  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();
  projectorRooms[roomId] = {
    id: roomId,
    roomName,
    hostUsername,
    manifest,
    sourceUrl,
    useHostSource: useHostSource !== false,
    projectorType: projectorType || 'public',
    customManifest: customManifest || '',
    tmdbId: tmdbId || null,
    mediaType: mediaType || 'movie',
    movieData: movieData || {},
    createdAt: new Date()
  };

  console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
  
  res.json({
    success: true,
    projectorRoom: projectorRooms[roomId]
  });
});

// ⭐ BETA-1.6: Actualizar película de sala existente
app.put('/api/projectorrooms/:id/movie', (req, res) => {
  const roomId = req.params.id;
  const { tmdbId, mediaType, movieData, sourceUrl, manifest } = req.body;
  
  const room = projectorRooms[roomId];
  
  if (!room) {
    return res.json({ success: false, message: 'Sala no encontrada' });
  }
  
  // Actualizar datos de película
  room.tmdbId = tmdbId;
  room.mediaType = mediaType;
  room.movieData = movieData;
  room.sourceUrl = sourceUrl;
  room.manifest = manifest;
  room.updatedAt = new Date();
  
  console.log(`🎬 Película actualizada en sala ${roomId}: ${movieData.title || movieData.name}`);
  
  res.json({
    success: true,
    projectorRoom: room
  });
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', (req, res) => {
  const roomId = req.params.id;
  const room = projectorRooms[roomId];
  
  if (!room) {
    return res.json({ success: false, message: 'Sala no encontrada' });
  }
  
  res.json({
    success: true,
    projectorRoom: room
  });
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
  socket.on('join-room', ({ roomId, username }) => {
    console.log(`👤 ${username} se unió a sala ${roomId}`);
    
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
    
    // Notificar a todos en la sala
    io.to(roomId).emit('user-joined', {
      user: { id: socket.id, username },
      users: roomUsers[roomId]
    });
  });

  // ⭐ BETA-1.6: Cambio de película por anfitrión
  socket.on('change-movie', ({ roomId, movieData }) => {
    console.log(`🎬 [${roomId}] Anfitrión cambió la película a: ${movieData.title || movieData.name}`);
    
    // Notificar a todos los invitados (excepto anfitrión)
    socket.to(roomId).emit('movie-changed', {
      movieData: movieData,
      message: 'El anfitrión ha cambiado la película'
    });
    
    // Mensaje en chat
    io.to(roomId).emit('chat-message', {
      username: 'Sistema',
      message: `🎬 La película ha sido cambiada a: ${movieData.title || movieData.name}`,
      isSystem: true
    });
  });

  // MENSAJE DE CHAT
  socket.on('chat-message', ({ roomId, message }) => {
    console.log(`💬 [${roomId}] ${socket.username}: ${message}`);
    
    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message: message
    });
  });

  // CALIFICACIÓN
  socket.on('add-rating', ({ roomId, username, rating }) => {
    console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);
    
    io.to(roomId).emit('rating-added', {
      username,
      rating
    });
  });

  // REACCIÓN
  socket.on('add-reaction', ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);
    
    io.to(roomId).emit('reaction-added', {
      username,
      time,
      message
    });
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
      
      // Limpiar sala si está vacía
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
        console.log(`🗑️ Sala ${roomId} eliminada (sin usuarios)`);
      }
    }
  });
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
