const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ==================== POSTGRES ====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      host_username TEXT NOT NULL,
      manifest TEXT NOT NULL,
      source_url TEXT NOT NULL,
      use_host_source BOOLEAN DEFAULT TRUE,
      projector_type TEXT DEFAULT 'public',
      custom_manifest TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      time TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id BIGSERIAL PRIMARY KEY,
      room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      rating INT NOT NULL CHECK (rating >= 1 AND rating <= 10),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(room_id, username)
    );
  `);

  console.log('✅ DB inicializada');
}

// ==================== Estado en memoria (solo users conectados) ====================
let roomUsers = {}; // { roomId: [{ id, username }] }

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;

  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();

  try {
    await pool.query(
      `INSERT INTO rooms (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        roomId,
        roomName,
        hostUsername,
        manifest,
        sourceUrl,
        useHostSource !== false,
        projectorType || 'public',
        customManifest || ''
      ]
    );

    console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);

    return res.json({
      success: true,
      projectorRoom: {
        id: roomId,
        roomName,
        hostUsername,
        manifest,
        sourceUrl,
        useHostSource: useHostSource !== false,
        projectorType: projectorType || 'public',
        customManifest: customManifest || '',
        createdAt: new Date()
      }
    });
  } catch (err) {
    console.error('❌ Error creando sala:', err);
    return res.json({ success: false, message: 'Error creando sala' });
  }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);

    if (result.rows.length === 0) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }

    const r = result.rows[0];

    return res.json({
      success: true,
      projectorRoom: {
        id: r.id,
        roomName: r.room_name,
        hostUsername: r.host_username,
        manifest: r.manifest,
        sourceUrl: r.source_url,
        useHostSource: r.use_host_source,
        projectorType: r.projector_type,
        customManifest: r.custom_manifest,
        createdAt: r.created_at
      }
    });
  } catch (err) {
    console.error('❌ Error obteniendo sala:', err);
    return res.json({ success: false, message: 'Error obteniendo sala' });
  }
});

// Historial: mensajes
app.get('/api/projectorrooms/:id/messages', async (req, res) => {
  const roomId = req.params.id;
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);

  try {
    const result = await pool.query(
      `SELECT username, message, created_at
       FROM messages
       WHERE room_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [roomId, limit]
    );

    return res.json({ success: true, messages: result.rows });
  } catch (err) {
    console.error('❌ Error cargando messages:', err);
    return res.json({ success: false, messages: [] });
  }
});

// Historial: ratings
app.get('/api/projectorrooms/:id/ratings', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT username, rating, created_at
       FROM ratings
       WHERE room_id = $1
       ORDER BY created_at DESC`,
      [roomId]
    );

    return res.json({ success: true, ratings: result.rows });
  } catch (err) {
    console.error('❌ Error cargando ratings:', err);
    return res.json({ success: false, ratings: [] });
  }
});

// Historial: reactions
app.get('/api/projectorrooms/:id/reactions', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT username, time, message, created_at
       FROM reactions
       WHERE room_id = $1
       ORDER BY created_at ASC`,
      [roomId]
    );

    return res.json({ success: true, reactions: result.rows });
  } catch (err) {
    console.error('❌ Error cargando reactions:', err);
    return res.json({ success: false, reactions: [] });
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

    if (!roomUsers[roomId]) roomUsers[roomId] = [];

    // Evitar duplicados si recarga
    roomUsers[roomId] = roomUsers[roomId].filter(u => u.id !== socket.id);
    roomUsers[roomId].push({ id: socket.id, username });

    socket.roomId = roomId;
    socket.username = username;

    io.to(roomId).emit('user-joined', {
      user: { id: socket.id, username },
      users: roomUsers[roomId]
    });
  });

  // MENSAJE DE CHAT (persistente)
  socket.on('chat-message', async ({ roomId, message }) => {
    console.log(`💬 [${roomId}] ${socket.username}: ${message}`);

    try {
      await pool.query(
        `INSERT INTO messages (room_id, username, message) VALUES ($1,$2,$3)`,
        [roomId, socket.username, message]
      );
    } catch (err) {
      console.error('❌ DB chat insert error:', err);
    }

    io.to(roomId).emit('chat-message', { username: socket.username, message });
  });

  // CALIFICACIÓN (persistente, 1 por user)
  socket.on('add-rating', async ({ roomId, username, rating }) => {
    console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);

    try {
      await pool.query(
        `INSERT INTO ratings (room_id, username, rating)
         VALUES ($1,$2,$3)
         ON CONFLICT (room_id, username)
         DO UPDATE SET rating = EXCLUDED.rating, created_at = NOW()`,
        [roomId, socket.username, rating]
      );
    } catch (err) {
      console.error('❌ DB rating upsert error:', err);
    }

    io.to(roomId).emit('rating-added', { username: socket.username, rating });
  });

  // REACCIÓN (persistente)
  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);

    try {
      await pool.query(
        `INSERT INTO reactions (room_id, username, time, message) VALUES ($1,$2,$3,$4)`,
        [roomId, socket.username, time, message]
      );
    } catch (err) {
      console.error('❌ DB reaction insert error:', err);
    }

    io.to(roomId).emit('reaction-added', { username: socket.username, time, message });
  });

  // DESCONEXIÓN
  socket.on('disconnect', () => {
    console.log('🔴 Usuario desconectado:', socket.id);

    const roomId = socket.roomId;
    const username = socket.username;

    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(user => user.id !== socket.id);

      io.to(roomId).emit('user-left', {
        username,
        users: roomUsers[roomId]
      });

      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
        console.log(`🗑️ Sala ${roomId} (sin usuarios conectados)`);
      }
    }
  });
});

// ==================== SERVIDOR ====================

initDb()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error iniciando DB:', err);
    process.exit(1);
  });
