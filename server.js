const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Configuración de PostgreSQL usando DATABASE_URL (Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // En muchos entornos gestionados (Render, Heroku) hace falta ssl.
  // Si tu proveedor no requiere SSL, puedes quitar el ssl.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Crear tablas si no existen
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projector_rooms (
      id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      host_username TEXT NOT NULL,
      manifest JSONB NOT NULL,
      source_url TEXT NOT NULL,
      use_host_source BOOLEAN DEFAULT TRUE,
      projector_type TEXT,
      custom_manifest TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_users (
      id SERIAL PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES projector_rooms(id) ON DELETE CASCADE,
      socket_id TEXT NOT NULL,
      username TEXT NOT NULL,
      joined_at TIMESTAMP DEFAULT now()
    );
  `);
}

// Helper: generar id (usa crypto.randomUUID si está disponible)
function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').substring(0, 9);
  return Math.random().toString(36).substring(2, 11);
}

// Inicialización
(async () => {
  try {
    await pool.connect(); // valida conexión
    await ensureTables();
    console.log('✅ Conectado a PostgreSQL y tablas aseguradas');
  } catch (err) {
    console.error('❌ Error conectando a la base de datos:', err);
    process.exit(1);
  }
})().catch(console.error);

// ==================== RUTAS API ====================

// Crear sala (persistida en Postgres)
app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;

  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();

  try {
    // Guardamos manifest como JSONB
    await pool.query(
      `INSERT INTO projector_rooms (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
      [
        roomId,
        roomName,
        hostUsername,
        typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
        sourceUrl,
        useHostSource !== false,
        projectorType || 'public',
        customManifest || ''
      ]
    );

    console.log(`✅ Sala creada en DB: ${roomId} - ${roomName} por ${hostUsername}`);

    const projectorRoom = (await pool.query('SELECT * FROM projector_rooms WHERE id = $1', [roomId])).rows[0];

    res.json({
      success: true,
      projectorRoom
    });
  } catch (err) {
    console.error('❌ Error creando sala:', err);
    res.json({ success: false, message: 'Error interno al crear sala' });
  }
});

// Obtener sala por ID (desde Postgres)
app.get('/api/projectorrooms/:id', async (req, res) => {
  const roomId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM projector_rooms WHERE id = $1', [roomId]);
    const room = result.rows[0];

    if (!room) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }

    res.json({
      success: true,
      projectorRoom: room
    });
  } catch (err) {
    console.error('❌ Error obteniendo sala:', err);
    res.json({ success: false, message: 'Error interno' });
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
  console.log('🔌 Socket conectado:', socket.id);

  socket.on('join-room', async (data) => {
    try {
      const { roomId, username } = data || {};
      if (!roomId || !username) return;

      // Validar que la sala existe
      const roomRes = await pool.query('SELECT id FROM projector_rooms WHERE id = $1', [roomId]);
      if (roomRes.rowCount === 0) {
        socket.emit('error', { message: 'Sala no encontrada' });
        return;
      }

      socket.join(roomId);
      socket.username = username;

      // Insertar usuario conectado
      await pool.query(
        'INSERT INTO room_users (room_id, socket_id, username) VALUES ($1, $2, $3)',
        [roomId, socket.id, username]
      );

      // Obtener lista actualizada de usuarios
      const usersRes = await pool.query('SELECT username FROM room_users WHERE room_id = $1', [roomId]);
      const users = usersRes.rows.map(r => ({ username: r.username }));

      io.to(roomId).emit('user-joined', { user: { username }, users });
      console.log(`👥 ${username} se unió a ${roomId}`);
    } catch (err) {
      console.error('❌ Error en join-room:', err);
    }
  });

  socket.on('chat-message', (data) => {
    try {
      const { roomId, message } = data || {};
      if (!roomId || !message) return;
      // Emisión a todos en la sala
      io.to(roomId).emit('chat-message', { username: socket.username || 'Anónimo', message });
    } catch (err) {
      console.error('❌ Error chat-message:', err);
    }
  });

  socket.on('add-rating', (data) => {
    try {
      if (!data || !data.roomId) return;
      io.to(data.roomId).emit('rating-added', data);
    } catch (err) {
      console.error('❌ Error add-rating:', err);
    }
  });

  socket.on('add-reaction', (data) => {
    try {
      if (!data || !data.roomId) return;
      io.to(data.roomId).emit('reaction-added', data);
    } catch (err) {
      console.error('❌ Error add-reaction:', err);
    }
  });

  socket.on('disconnect', async () => {
    try {
      // Eliminar usuario de room_users y notificar
      const delRes = await pool.query('DELETE FROM room_users WHERE socket_id = $1 RETURNING room_id, username', [socket.id]);
      for (const row of delRes.rows) {
        const usersRes = await pool.query('SELECT username FROM room_users WHERE room_id = $1', [row.room_id]);
        const users = usersRes.rows.map(r => ({ username: r.username }));
        io.to(row.room_id).emit('user-left', { username: row.username, users });
        console.log(`👋 ${row.username} salió de ${row.room_id}`);
      }
    } catch (err) {
      console.error('❌ Error en disconnect:', err);
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});