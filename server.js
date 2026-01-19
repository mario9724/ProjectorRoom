const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ==================== POSTGRESQL POOL ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test de conexión
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.stack);
  } else {
    console.log('✅ PostgreSQL conectado correctamente');
    release();
  }
});

// ==================== MIDDLEWARE ====================
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== RUTAS DE SALAS ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  try {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
    
    const result = await pool.query(
      `INSERT INTO projector_rooms 
       (room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) 
       RETURNING *`,
      [roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest]
    );
    
    console.log('✅ Sala creada:', result.rows[0].id);
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    res.status(500).json({ success: false, message: 'Error creando sala' });
  }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await pool.query(
      'SELECT * FROM projector_rooms WHERE id = $1',
      [roomId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sala no encontrada' });
    }
    
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    console.error('❌ Error obteniendo sala:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo sala' });
  }
});

// ==================== PERSISTENCIA MENSAJES ====================

// Guardar mensaje (función auxiliar para Socket.IO)
async function saveMessage(roomId, username, message) {
  try {
    await pool.query(
      'INSERT INTO room_messages (room_id, username, message, created_at) VALUES ($1, $2, $3, NOW())',
      [roomId, username, message]
    );
    console.log(`💬 Mensaje guardado: ${username} en sala ${roomId}`);
  } catch (error) {
    console.error('❌ Error guardando mensaje:', error);
  }
}

// Obtener mensajes de sala
app.get('/api/projectorrooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await pool.query(
      'SELECT username, message, created_at FROM room_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 100',
      [roomId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('❌ Error obteniendo mensajes:', error);
    res.status(500).json({ success: false });
  }
});

// ==================== CALIFICACIONES ====================

// Guardar calificación
app.post('/api/projectorrooms/:roomId/ratings', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, rating } = req.body;
    
    await pool.query(
      `INSERT INTO room_ratings (room_id, username, rating, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (room_id, username) DO UPDATE SET rating = $3, created_at = NOW()`,
      [roomId, username, rating]
    );
    
    console.log(`⭐ Rating guardado: ${username} dio ${rating}/10 en sala ${roomId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error guardando rating:', error);
    res.status(500).json({ success: false });
  }
});

// Obtener calificaciones de sala
app.get('/api/projectorrooms/:roomId/ratings', async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await pool.query(
      'SELECT username, rating FROM room_ratings WHERE room_id = $1 ORDER BY created_at DESC',
      [roomId]
    );
    res.json({ success: true, ratings: result.rows });
  } catch (error) {
    console.error('❌ Error obteniendo ratings:', error);
    res.status(500).json({ success: false });
  }
});

// ==================== REACCIONES ====================

// Guardar reacción
app.post('/api/projectorrooms/:roomId/reactions', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, time, message } = req.body;
    
    await pool.query(
      'INSERT INTO room_reactions (room_id, username, time, message, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [roomId, username, time, message]
    );
    
    console.log(`💭 Reacción guardada: ${username} en ${time} - sala ${roomId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error guardando reacción:', error);
    res.status(500).json({ success: false });
  }
});

// Obtener reacciones de sala
app.get('/api/projectorrooms/:roomId/reactions', async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await pool.query(
      'SELECT username, time, message FROM room_reactions WHERE room_id = $1 ORDER BY time ASC',
      [roomId]
    );
    res.json({ success: true, reactions: result.rows });
  } catch (error) {
    console.error('❌ Error obteniendo reacciones:', error);
    res.status(500).json({ success: false });
  }
});

// ==================== SOCKET.IO ====================

// Mapa de usuarios conectados por sala
const roomUsers = new Map();

io.on('connection', (socket) => {
  console.log('👤 Usuario conectado:', socket.id);

  // Usuario se une a sala
  socket.on('join-room', async (roomId, username) => {
    socket.username = username;
    socket.roomId = roomId;
    socket.join(roomId);
    
    // Agregar usuario al mapa
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, []);
    }
    roomUsers.get(roomId).push({ socketId: socket.id, username });
    
    const users = roomUsers.get(roomId).map(u => ({ username: u.username }));
    
    // Notificar a todos en la sala
    io.to(roomId).emit('user-joined', { user: { username }, users });
    
    console.log(`✅ ${username} se unió a sala ${roomId} - Total usuarios: ${users.length}`);
  });

  // Mensaje de chat
  socket.on('chat-message', async (roomId, message) => {
    const username = socket.username;
    
    if (!username || !message) return;
    
    // Guardar en PostgreSQL
    await saveMessage(roomId, username, message);
    
    // Emitir a todos en la sala (incluyendo al emisor)
    io.to(roomId).emit('chat-message', { username, message });
  });

  // Calificación añadida
  socket.on('add-rating', (roomId, username, rating) => {
    console.log(`⭐ Broadcasting rating: ${username} - ${rating}/10`);
    socket.to(roomId).emit('rating-added', { username, rating });
  });

  // Reacción añadida
  socket.on('add-reaction', (roomId, username, time, message) => {
    console.log(`💭 Broadcasting reacción: ${username} en ${time}`);
    socket.to(roomId).emit('reaction-added', { username, time, message });
  });

  // Usuario se desconecta
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    const username = socket.username;
    
    if (roomId && roomUsers.has(roomId)) {
      // Remover usuario del mapa
      const users = roomUsers.get(roomId).filter(u => u.socketId !== socket.id);
      
      if (users.length === 0) {
        roomUsers.delete(roomId);
      } else {
        roomUsers.set(roomId, users);
      }
      
      const usersList = users.map(u => ({ username: u.username }));
      
      // Notificar desconexión
      io.to(roomId).emit('user-left', { username, users: usersList });
      
      console.log(`👋 ${username} salió de sala ${roomId} - Quedan ${users.length} usuarios`);
    }
    
    console.log('❌ Usuario desconectado:', socket.id);
  });
});

// ==================== RUTAS WEB ====================

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sala específica
app.get('/sala/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Ruta catch-all para SPA
app.get('*', (req, res) => {
  res.redirect('/');
});

// ==================== INICIAR SERVIDOR ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('🎬 ════════════════════════════════════════');
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 Socket.IO disponible`);
  console.log(`🗄️  PostgreSQL conectado`);
  console.log(`🌐 Accede en: http://localhost:${PORT}`);
  console.log('🎬 ════════════════════════════════════════');
  console.log('');
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});
