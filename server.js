const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos en memoria (solo para salas y usuarios conectados)
let projectorRooms = {};
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Inicializar base de datos
db.initDatabase().catch(err => {
  console.error('Error fatal al inicializar BD:', err);
  process.exit(1);
});

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
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
    createdAt: new Date()
  };
  console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
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

// Obtener mensajes de chat de una sala
app.get('/api/projectorrooms/:id/messages', async (req, res) => {
  try {
    const roomId = req.params.id;
    const messages = await db.getChatMessages(roomId);
    res.json({ success: true, messages });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.json({ success: false, message: 'Error obteniendo mensajes' });
  }
});

// Obtener calificaciones de una sala
app.get('/api/projectorrooms/:id/ratings', async (req, res) => {
  try {
    const roomId = req.params.id;
    const ratings = await db.getRatings(roomId);
    res.json({ success: true, ratings });
  } catch (error) {
    console.error('Error obteniendo calificaciones:', error);
    res.json({ success: false, message: 'Error obteniendo calificaciones' });
  }
});

// Obtener reacciones de una sala
app.get('/api/projectorrooms/:id/reactions', async (req, res) => {
  try {
    const roomId = req.params.id;
    const reactions = await db.getReactions(roomId);
    res.json({ success: true, reactions });
  } catch (error) {
    console.error('Error obteniendo reacciones:', error);
    res.json({ success: false, message: 'Error obteniendo reacciones' });
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

    // Cargar datos históricos de la base de datos
    try {
      const messages = await db.getChatMessages(roomId);
      const ratings = await db.getRatings(roomId);
      const reactions = await db.getReactions(roomId);

      // Enviar historial al usuario que se acaba de unir
      socket.emit('load-history', {
        messages,
        ratings,
        reactions
      });
    } catch (error) {
      console.error('Error cargando historial:', error);
    }

    // Notificar a todos en la sala
    io.to(roomId).emit('user-joined', {
      user: { id: socket.id, username },
      users: roomUsers[roomId]
    });
  });

  // MENSAJE DE CHAT
  socket.on('chat-message', async ({ roomId, message }) => {
    console.log(`💬 [${roomId}] ${socket.username}: ${message}`);
    
    try {
      // Guardar en base de datos
      await db.saveChatMessage(roomId, socket.username, message);
      
      // Emitir a todos en la sala
      io.to(roomId).emit('chat-message', {
        username: socket.username,
        message: message
      });
    } catch (error) {
      console.error('Error guardando mensaje:', error);
    }
  });

  // CALIFICACIÓN
  socket.on('add-rating', async ({ roomId, username, rating }) => {
    console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);
    
    try {
      // Guardar en base de datos
      await db.saveRating(roomId, username, rating);
      
      // Emitir a todos en la sala
      io.to(roomId).emit('rating-added', {
        username,
        rating
      });
    } catch (error) {
      console.error('Error guardando calificación:', error);
    }
  });

  // REACCIÓN
  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);
    
    try {
      // Guardar en base de datos
      await db.saveReaction(roomId, username, time, message);
      
      // Emitir a todos en la sala
      io.to(roomId).emit('reaction-added', {
        username,
        time,
        message
      });
    } catch (error) {
      console.error('Error guardando reacción:', error);
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
