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
let roomRatings = {}; // { roomId: [{ username, rating }] }
let roomReactions = {}; // { roomId: [{ username, time, message }] }
let roomMessages = {}; // { roomId: [{ username, message, is_system }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  const { 
    roomName, 
    hostUsername, 
    manifest, 
    sourceUrl, 
    useHostSource, 
    projectorType, 
    customManifest,
    selectedEpisode  // ⭐ NUEVO: soportar episodio seleccionado
  } = req.body;

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
    selectedEpisode: selectedEpisode || null,  // ⭐ Guardar episodio
    createdAt: new Date()
  };

  // Inicializar arrays vacíos para esta sala
  roomRatings[roomId] = [];
  roomReactions[roomId] = [];
  roomMessages[roomId] = [];

  console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
  if (selectedEpisode) {
    const ep = JSON.parse(selectedEpisode);
    console.log(`   📺 Episodio: T${ep.season_number}E${ep.episode_number} - ${ep.name}`);
  }

  res.json({
    success: true,
    projectorRoom: projectorRooms[roomId]
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

// ⭐ NUEVO: Obtener ratings de una sala
app.get('/api/projectorrooms/:id/ratings', (req, res) => {
  const roomId = req.params.id;
  const ratings = roomRatings[roomId] || [];

  res.json({
    success: true,
    ratings: ratings
  });
});

// ⭐ NUEVO: Obtener reactions de una sala
app.get('/api/projectorrooms/:id/reactions', (req, res) => {
  const roomId = req.params.id;
  const reactions = roomReactions[roomId] || [];

  res.json({
    success: true,
    reactions: reactions
  });
});

// ⭐ NUEVO: Obtener mensajes de una sala
app.get('/api/projectorrooms/:id/messages', (req, res) => {
  const roomId = req.params.id;
  const messages = roomMessages[roomId] || [];

  res.json({
    success: true,
    messages: messages
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

  // MENSAJE DE CHAT
  socket.on('chat-message', ({ roomId, message }) => {
    console.log(`💬 [${roomId}] ${socket.username}: ${message}`);

    // ⭐ Guardar en BD
    if (!roomMessages[roomId]) {
      roomMessages[roomId] = [];
    }
    roomMessages[roomId].push({
      username: socket.username,
      message: message,
      is_system: false
    });

    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message: message
    });
  });

  // CALIFICACIÓN
  socket.on('add-rating', ({ roomId, username, rating }) => {
    console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);

    // ⭐ Guardar en BD
    if (!roomRatings[roomId]) {
      roomRatings[roomId] = [];
    }
    roomRatings[roomId].push({
      username: username,
      rating: rating
    });

    io.to(roomId).emit('rating-added', {
      username,
      rating
    });
  });

  // REACCIÓN
  socket.on('add-reaction', ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);

    // ⭐ Guardar en BD
    if (!roomReactions[roomId]) {
      roomReactions[roomId] = [];
    }
    roomReactions[roomId].push({
      username: username,
      time: time,
      message: message
    });

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
