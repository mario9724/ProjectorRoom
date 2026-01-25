const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// ⭐ PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Base de datos de usuarios conectados (solo en memoria, no crítico)
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// ⭐ SETUP: Crear tabla (ejecutar una sola vez)
app.get('/api/setup', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projector_rooms (
        id VARCHAR(50) PRIMARY KEY,
        room_name VARCHAR(255) NOT NULL,
        host_username VARCHAR(100) NOT NULL,
        manifest TEXT NOT NULL,
        source_url TEXT NOT NULL,
        use_host_source BOOLEAN DEFAULT true,
        projector_type VARCHAR(50) DEFAULT 'public',
        custom_manifest TEXT,
        tmdb_id INTEGER,
        media_type VARCHAR(20) DEFAULT 'movie',
        movie_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Tabla projector_rooms creada/verificada');
    res.json({ success: true, message: 'Base de datos inicializada' });
  } catch (error) {
    console.error('❌ Error setup:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, tmdbId, mediaType, movieData } = req.body;

  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();

  try {
    const result = await pool.query(`
      INSERT INTO projector_rooms 
      (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest, tmdb_id, media_type, movie_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *
    `, [
      roomId,
      roomName,
      hostUsername,
      manifest,
      sourceUrl,
      useHostSource !== false,
      projectorType || 'public',
      customManifest || '',
      tmdbId || null,
      mediaType || 'movie',
      JSON.stringify(movieData || {})
    ]);

    const room = result.rows[0];
    console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);

    res.json({
      success: true,
      projectorRoom: room
    });
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ⭐ BETA-1.6: Actualizar película de sala existente
app.put('/api/projectorrooms/:id/movie', async (req, res) => {
  const roomId = req.params.id;
  const { tmdbId, mediaType, movieData, sourceUrl, manifest } = req.body;

  try {
    const result = await pool.query(`
      UPDATE projector_rooms 
      SET 
        tmdb_id = $1, 
        media_type = $2, 
        movie_data = $3, 
        source_url = $4, 
        manifest = $5, 
        room_name = COALESCE($6, room_name),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [
      tmdbId,
      mediaType,
      JSON.stringify(movieData),
      sourceUrl,
      manifest,
      movieData.title || movieData.name,
      roomId
    ]);

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }

    const room = result.rows[0];
    console.log(`🎬 Película actualizada en sala ${roomId}: ${movieData.title || movieData.name}`);

    res.json({
      success: true,
      projectorRoom: room
    });
  } catch (error) {
    console.error('❌ Error actualizando sala:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query('SELECT * FROM projector_rooms WHERE id = $1', [roomId]);

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }

    res.json({
      success: true,
      projectorRoom: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error obteniendo sala:', error);
    res.status(500).json({ success: false, message: error.message });
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
        console.log(`🗑️ Sala ${roomId} limpiada (sin usuarios conectados)`);
      }
    }
  });
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📊 PostgreSQL: ${process.env.DATABASE_URL ? 'CONECTADO' : '❌ NO CONFIGURADO'}`);
});
