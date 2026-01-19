const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// ==================== CONFIGURACIÓN BASE DE DATOS ====================
const dbPath = process.env.NODE_ENV === 'production' ? 'projector_rooms.db' : ':memory:';
const db = new Database(dbPath, { verbose: console.log });

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    roomName TEXT NOT NULL,
    hostUsername TEXT NOT NULL,
    manifest TEXT NOT NULL,
    sourceUrl TEXT NOT NULL,
    useHostSource INTEGER DEFAULT 1,
    projectorType TEXT DEFAULT 'public',
    customManifest TEXT DEFAULT '',
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    roomId TEXT NOT NULL,
    username TEXT NOT NULL,
    joinedAt TEXT NOT NULL,
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    username TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    username TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
    timestamp TEXT NOT NULL,
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomId TEXT NOT NULL,
    username TEXT NOT NULL,
    time TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
  );
`);

console.log('✅ Base de datos SQLite inicializada');

// Preparar statements
const stmts = {
  // Rooms
  createRoom: db.prepare(`
    INSERT INTO rooms (id, roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getRoom: db.prepare('SELECT * FROM rooms WHERE id = ?'),
  getAllRooms: db.prepare('SELECT * FROM rooms ORDER BY createdAt DESC'),
  deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
  
  // Users
  addUser: db.prepare('INSERT INTO users (id, roomId, username, joinedAt) VALUES (?, ?, ?, ?)'),
  getUsersByRoom: db.prepare('SELECT * FROM users WHERE roomId = ?'),
  removeUser: db.prepare('DELETE FROM users WHERE id = ?'),
  getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
  
  // Messages
  addMessage: db.prepare('INSERT INTO messages (roomId, username, message, timestamp) VALUES (?, ?, ?, ?)'),
  getMessagesByRoom: db.prepare('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC LIMIT 100'),
  
  // Ratings
  addRating: db.prepare('INSERT INTO ratings (roomId, username, rating, timestamp) VALUES (?, ?, ?, ?)'),
  getRatingsByRoom: db.prepare('SELECT * FROM ratings WHERE roomId = ? ORDER BY timestamp DESC'),
  
  // Reactions
  addReaction: db.prepare('INSERT INTO reactions (roomId, username, time, message, timestamp) VALUES (?, ?, ?, ?, ?)'),
  getReactionsByRoom: db.prepare('SELECT * FROM reactions WHERE roomId = ? ORDER BY timestamp DESC LIMIT 50')
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Cache en memoria para usuarios conectados (no persiste)
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
  
  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();
  const createdAt = new Date().toISOString();
  
  try {
    stmts.createRoom.run(
      roomId,
      roomName,
      hostUsername,
      manifest,
      sourceUrl,
      useHostSource !== false ? 1 : 0,
      projectorType || 'public',
      customManifest || '',
      createdAt
    );

    const room = stmts.getRoom.get(roomId);
    console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
    
    res.json({
      success: true,
      projectorRoom: {
        ...room,
        useHostSource: Boolean(room.useHostSource)
      }
    });
  } catch (error) {
    console.error('Error creando sala:', error);
    res.json({ success: false, message: 'Error al crear sala' });
  }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', (req, res) => {
  const roomId = req.params.id;
  
  try {
    const room = stmts.getRoom.get(roomId);
    
    if (!room) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }

    // Obtener historial de mensajes, ratings y reacciones
    const messages = stmts.getMessagesByRoom.all(roomId);
    const ratings = stmts.getRatingsByRoom.all(roomId);
    const reactions = stmts.getReactionsByRoom.all(roomId);
    
    res.json({
      success: true,
      projectorRoom: {
        ...room,
        useHostSource: Boolean(room.useHostSource),
        messages,
        ratings,
        reactions
      }
    });
  } catch (error) {
    console.error('Error obteniendo sala:', error);
    res.json({ success: false, message: 'Error al obtener sala' });
  }
});

// Listar todas las salas
app.get('/api/projectorrooms', (req, res) => {
  try {
    const rooms = stmts.getAllRooms.all();
    res.json({
      success: true,
      rooms: rooms.map(room => ({
        ...room,
        useHostSource: Boolean(room.useHostSource)
      }))
    });
  } catch (error) {
    console.error('Error listando salas:', error);
    res.json({ success: false, message: 'Error al listar salas' });
  }
});

// Eliminar sala (solo host)
app.delete('/api/projectorrooms/:id', (req, res) => {
  const roomId = req.params.id;
  
  try {
    const result = stmts.deleteRoom.run(roomId);
    
    if (result.changes > 0) {
      console.log(`🗑️ Sala eliminada: ${roomId}`);
      res.json({ success: true, message: 'Sala eliminada' });
    } else {
      res.json({ success: false, message: 'Sala no encontrada' });
    }
  } catch (error) {
    console.error('Error eliminando sala:', error);
    res.json({ success: false, message: 'Error al eliminar sala' });
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
  socket.on('join-room', ({ roomId, username }) => {
    console.log(`👤 ${username} se unió a sala ${roomId}`);
    socket.join(roomId);

    // Inicializar array si no existe
    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }

    // Agregar usuario a memoria
    roomUsers[roomId].push({
      id: socket.id,
      username: username
    });

    // Guardar en DB
    try {
      stmts.addUser.run(socket.id, roomId, username, new Date().toISOString());
    } catch (error) {
      console.error('Error guardando usuario:', error);
    }

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
    
    const timestamp = new Date().toISOString();
    
    // Guardar en DB
    try {
      stmts.addMessage.run(roomId, socket.username, message, timestamp);
    } catch (error) {
      console.error('Error guardando mensaje:', error);
    }

    // Emitir a todos
    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message: message,
      timestamp: timestamp
    });
  });

  // CALIFICACIÓN
  socket.on('add-rating', ({ roomId, username, rating }) => {
    console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);
    
    const timestamp = new Date().toISOString();
    
    // Guardar en DB
    try {
      stmts.addRating.run(roomId, username, rating, timestamp);
    } catch (error) {
      console.error('Error guardando rating:', error);
    }

    // Emitir a todos
    io.to(roomId).emit('rating-added', {
      username,
      rating,
      timestamp
    });
  });

  // REACCIÓN
  socket.on('add-reaction', ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);
    
    const timestamp = new Date().toISOString();
    
    // Guardar en DB
    try {
      stmts.addReaction.run(roomId, username, time, message, timestamp);
    } catch (error) {
      console.error('Error guardando reacción:', error);
    }

    // Emitir a todos
    io.to(roomId).emit('reaction-added', {
      username,
      time,
      message,
      timestamp
    });
  });

  // DESCONEXIÓN
  socket.on('disconnect', () => {
    console.log('🔴 Usuario desconectado:', socket.id);
    
    const roomId = socket.roomId;
    const username = socket.username;

    if (roomId && roomUsers[roomId]) {
      // Remover usuario de memoria
      roomUsers[roomId] = roomUsers[roomId].filter(user => user.id !== socket.id);

      // Remover de DB
      try {
        stmts.removeUser.run(socket.id);
      } catch (error) {
        console.error('Error removiendo usuario:', error);
      }

      // Notificar a los demás
      io.to(roomId).emit('user-left', {
        username: username,
        users: roomUsers[roomId]
      });

      // Limpiar sala vacía de memoria
      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
        console.log(`🗑️ Sala ${roomId} vacía en memoria`);
      }
    }
  });
});

// ==================== SERVIDOR ====================

// Limpieza al cerrar
process.on('SIGINT', () => {
  console.log('🛑 Cerrando servidor...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Cerrando servidor...');
  db.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 Base de datos: ${dbPath}`);
});
