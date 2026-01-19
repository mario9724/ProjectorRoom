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
let db;
let stmts;

// Manejo de diferentes entornos
const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction ? '/opt/render/project/src/projector_rooms.db' : ':memory:';

try {
  db = new Database(dbPath, { 
    verbose: console.log,
    timeout: 5000 
  });
  
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

  // Preparar statements
  stmts = {
    createRoom: db.prepare(`
      INSERT INTO rooms (id, roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getRoom: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    getAllRooms: db.prepare('SELECT * FROM rooms ORDER BY createdAt DESC'),
    deleteRoom: db.prepare('DELETE FROM rooms WHERE id = ?'),
    
    addUser: db.prepare('INSERT INTO users (id, roomId, username, joinedAt) VALUES (?, ?, ?, ?)'),
    getUsersByRoom: db.prepare('SELECT * FROM users WHERE roomId = ?'),
    removeUser: db.prepare('DELETE FROM users WHERE id = ?'),
    
    addMessage: db.prepare('INSERT INTO messages (roomId, username, message, timestamp) VALUES (?, ?, ?, ?)'),
    getMessagesByRoom: db.prepare('SELECT * FROM messages WHERE roomId = ? ORDER BY timestamp ASC LIMIT 100'),
    
    addRating: db.prepare('INSERT INTO ratings (roomId, username, rating, timestamp) VALUES (?, ?, ?, ?)'),
    getRatingsByRoom: db.prepare('SELECT * FROM ratings WHERE roomId = ? ORDER BY timestamp DESC'),
    
    addReaction: db.prepare('INSERT INTO reactions (roomId, username, time, message, timestamp) VALUES (?, ?, ?, ?, ?)'),
    getReactionsByRoom: db.prepare('SELECT * FROM reactions WHERE roomId = ? ORDER BY timestamp DESC LIMIT 50')
  };

  console.log('✅ Base de datos SQLite inicializada correctamente');
  console.log(`📊 Ruta DB: ${dbPath}`);
  
} catch (error) {
  console.error('❌ Error inicializando SQLite:', error);
  process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Headers CORS para APIs
app.use('/api/', (req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Cache en memoria para usuarios conectados
let roomUsers = {};

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', (req, res) => {
  try {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
    
    if (!roomName || !hostUsername || !manifest || !sourceUrl) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    const roomId = generateId();
    const createdAt = new Date().toISOString();
    
    stmts.createRoom.run(
      roomId, roomName, hostUsername, manifest, sourceUrl,
      useHostSource !== false ? 1 : 0, projectorType || 'public',
      customManifest || '', createdAt
    );

    const room = stmts.getRoom.get(roomId);
    console.log(`✅ Sala creada: ${roomId} - ${roomName}`);
    
    res.json({
      success: true,
      projectorRoom: {
        ...room,
        useHostSource: Boolean(room.useHostSource)
      }
    });
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    res.status(500).json({ success: false, message: 'Error al crear sala' });
  }
});

// Obtener sala por ID (CRÍTICO - ESTE ES EL PROBLEMA)
app.get('/api/projectorrooms/:id', (req, res) => {
  const roomId = req.params.id;
  
  console.log(`📥 GET /api/projectorrooms/${roomId}`);
  
  try {
    const room = stmts.getRoom.get(roomId);
    
    if (!room) {
      console.log(`❌ Sala no encontrada: ${roomId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Sala no encontrada' 
      });
    }

    const messages = stmts.getMessagesByRoom.all(roomId);
    const ratings = stmts.getRatingsByRoom.all(roomId);
    const reactions = stmts.getReactionsByRoom.all(roomId);
    
    console.log(`✅ Sala cargada: ${roomId} (${messages.length} msgs, ${ratings.length} ratings)`);
    
    res.json({
      success: true,
      projectorRoom: {
        ...room,
        useHostSource: Boolean(room.useHostSource),
        messages: messages || [],
        ratings: ratings || [],
        reactions: reactions || []
      }
    });
  } catch (error) {
    console.error(`❌ Error sala ${roomId}:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
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
    console.error('❌ Error listando salas:', error);
    res.status(500).json({ success: false, message: 'Error al listar salas' });
  }
});

// Eliminar sala
app.delete('/api/projectorrooms/:id', (req, res) => {
  try {
    const result = stmts.deleteRoom.run(req.params.id);
    if (result.changes > 0) {
      console.log(`🗑️ Sala eliminada: ${req.params.id}`);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, message: 'Sala no encontrada' });
    }
  } catch (error) {
    console.error('❌ Error eliminando sala:', error);
    res.status(500).json({ success: false });
  }
});

// Páginas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sala/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log('🔌 Conexión:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    console.log(`👤 ${username} → ${roomId}`);
    socket.join(roomId);
    
    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId].push({ id: socket.id, username });
    
    try {
      stmts.addUser.run(socket.id, roomId, username, new Date().toISOString());
    } catch (error) {
      console.error('❌ Error usuario DB:', error);
    }

    socket.roomId = roomId;
    socket.username = username;
    
    io.to(roomId).emit('user-joined', {
      user: { id: socket.id, username },
      users: roomUsers[roomId]
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const timestamp = new Date().toISOString();
    try {
      stmts.addMessage.run(roomId, socket.username, message, timestamp);
    } catch (error) {
      console.error('❌ Error mensaje DB:', error);
    }
    io.to(roomId).emit('chat-message', { username: socket.username, message, timestamp });
  });

  socket.on('add-rating', ({ roomId, username, rating }) => {
    const timestamp = new Date().toISOString();
    try {
      stmts.addRating.run(roomId, username, rating, timestamp);
    } catch (error) {
      console.error('❌ Error rating DB:', error);
    }
    io.to(roomId).emit('rating-added', { username, rating, timestamp });
  });

  socket.on('add-reaction', ({ roomId, username, time, message }) => {
    const timestamp = new Date().toISOString();
    try {
      stmts.addReaction.run(roomId, username, time, message, timestamp);
    } catch (error) {
      console.error('❌ Error reacción DB:', error);
    }
    io.to(roomId).emit('reaction-added', { username, time, message, timestamp });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(u => u.id !== socket.id);
      try {
        stmts.removeUser.run(socket.id);
      } catch (error) {}
      io.to(roomId).emit('user-left', { username: socket.username, users: roomUsers[roomId] });
      if (roomUsers[roomId].length === 0) delete roomUsers[roomId];
    }
  });
});

// Cleanup
process.on('SIGINT', () => {
  console.log('🛑 Cerrando...');
  if (db) db.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor: http://localhost:${PORT}`);
  console.log(`📊 DB: ${dbPath} (${isProduction ? 'prod' : 'dev'})`);
});
