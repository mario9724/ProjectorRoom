const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en variables de entorno');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

function generateRoomId() {
  return crypto.randomBytes(4).toString('hex'); // 8 chars
}

/**
 * Auto-migración:
 * - Crea tablas si no existen.
 * - Si existen con esquema viejo, añade columnas/constraints/índices que falten.
 * Esto soluciona el caso típico: ya existe `rooms` pero sin `projector_type`.
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // rooms
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        room_name TEXT NOT NULL,
        host_username TEXT NOT NULL,
        manifest JSONB NOT NULL,
        source_url TEXT NOT NULL,
        use_host_source BOOLEAN NOT NULL DEFAULT true,
        projector_type TEXT NOT NULL DEFAULT 'public',
        custom_manifest TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);

    // Si la tabla existía “vieja”, asegurar columnas
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_name TEXT;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS host_username TEXT;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS manifest JSONB;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS source_url TEXT;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS use_host_source BOOLEAN NOT NULL DEFAULT true;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS projector_type TEXT NOT NULL DEFAULT 'public';`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS custom_manifest TEXT;`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await client.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`);

    // En caso de tabla vieja con expires_at null, rellenar y hacer NOT NULL después
    await client.query(`
      UPDATE rooms
      SET expires_at = COALESCE(expires_at, created_at + INTERVAL '24 hours')
      WHERE expires_at IS NULL;
    `);

    // Intentar forzar NOT NULL (si falla por datos inconsistentes, no tumbar servicio)
    try {
      await client.query(`ALTER TABLE rooms ALTER COLUMN expires_at SET NOT NULL;`);
    } catch (e) {
      console.error('No se pudo SET NOT NULL en rooms.expires_at:', e.message);
    }

    await client.query(`CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON rooms (expires_at);`);

    // presence
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_presence (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        socket_id TEXT NOT NULL,
        username TEXT NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        left_at TIMESTAMPTZ,
        UNIQUE (room_id, socket_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_presence_room_left ON room_presence (room_id, left_at);`);

    // chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_room_created ON chat_messages (room_id, created_at);`);

    // ratings
    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        rating INT NOT NULL CHECK (rating >= 1 AND rating <= 10),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (room_id, username)
      );
    `);

    // reactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id BIGSERIAL PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        time TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_reactions_room_created ON reactions (room_id, created_at);`);

    await client.query('COMMIT');
    console.log('DB OK: tablas/migraciones aplicadas');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inicializando DB:', err);
    // No hacemos throw para no dejar el servicio KO; pero quedará sin DB funcional.
  } finally {
    client.release();
  }
}

async function cleanupExpiredRooms() {
  try {
    await pool.query(`DELETE FROM rooms WHERE expires_at < NOW()`);
  } catch (e) {
    console.error('Error cleanupExpiredRooms:', e.message);
  }
}

setInterval(() => cleanupExpiredRooms(), 10 * 60 * 1000);

async function getOnlineUsers(roomId) {
  const q = await pool.query(
    `
    SELECT socket_id AS id, username
    FROM room_presence
    WHERE room_id = $1 AND left_at IS NULL
    ORDER BY joined_at ASC
    `,
    [roomId]
  );
  return q.rows;
}

async function getRoomHistory(roomId) {
  const [chat, ratings, reactions] = await Promise.all([
    pool.query(
      `
      SELECT username, message, created_at AS "createdAt"
      FROM chat_messages
      WHERE room_id = $1
      ORDER BY created_at ASC
      LIMIT 200
      `,
      [roomId]
    ),
    pool.query(
      `
      SELECT username, rating, created_at AS "createdAt"
      FROM ratings
      WHERE room_id = $1
      ORDER BY created_at ASC
      `,
      [roomId]
    ),
    pool.query(
      `
      SELECT username, time, message, created_at AS "createdAt"
      FROM reactions
      WHERE room_id = $1
      ORDER BY created_at ASC
      LIMIT 500
      `,
      [roomId]
    )
  ]);

  return {
    chat: chat.rows,
    ratings: ratings.rows,
    reactions: reactions.rows
  };
}

// Rutas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sala/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// API: crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  const {
    roomName,
    hostUsername,
    manifest,
    sourceUrl,
    useHostSource,
    projectorType,
    customManifest
  } = req.body;

  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  let manifestJson;
  try {
    manifestJson = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
  } catch (e) {
    return res.json({ success: false, message: 'Manifest inválido' });
  }

  const roomId = generateRoomId();

  try {
    const insert = await pool.query(
      `
      INSERT INTO rooms (
        id, room_name, host_username, manifest, source_url,
        use_host_source, projector_type, custom_manifest, expires_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW() + INTERVAL '24 hours')
      RETURNING
        id,
        room_name AS "roomName",
        host_username AS "hostUsername",
        manifest,
        source_url AS "sourceUrl",
        use_host_source AS "useHostSource",
        projector_type AS "projectorType",
        custom_manifest AS "customManifest",
        created_at AS "createdAt",
        expires_at AS "expiresAt"
      `,
      [
        roomId,
        roomName,
        hostUsername,
        manifestJson,
        sourceUrl,
        useHostSource !== false,
        projectorType || 'public',
        customManifest || null
      ]
    );

    console.log(`Sala creada ${roomId} - ${roomName} por ${hostUsername}`);

    return res.json({ success: true, projectorRoom: insert.rows[0] });
  } catch (err) {
    console.error('Error creando sala:', err);
    return res.json({ success: false, message: 'Error creando sala' });
  }
});

// API: obtener sala
app.get('/api/projectorrooms/:id', async (req, res) => {
  const roomId = req.params.id;

  try {
    const q = await pool.query(
      `
      SELECT
        id,
        room_name AS "roomName",
        host_username AS "hostUsername",
        manifest,
        source_url AS "sourceUrl",
        use_host_source AS "useHostSource",
        projector_type AS "projectorType",
        custom_manifest AS "customManifest",
        created_at AS "createdAt",
        expires_at AS "expiresAt"
      FROM rooms
      WHERE id = $1 AND expires_at > NOW()
      `,
      [roomId]
    );

    if (q.rows.length === 0) {
      return res.json({ success: false, message: 'Sala no encontrada o expirada' });
    }

    const room = q.rows[0];
    return res.json({
      success: true,
      projectorRoom: {
        ...room,
        manifest: JSON.stringify(room.manifest)
      }
    });
  } catch (err) {
    console.error('Error obteniendo sala:', err);
    return res.json({ success: false, message: 'Error obteniendo sala' });
  }
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('Usuario conectado', socket.id);

  socket.on('join-room', async (roomId, username) => {
    try {
      const roomQ = await pool.query(
        `SELECT id FROM rooms WHERE id=$1 AND expires_at > NOW()`,
        [roomId]
      );
      if (roomQ.rows.length === 0) {
        socket.emit('room-expired');
        return;
      }

      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username;

      await pool.query(
        `
        INSERT INTO room_presence (room_id, socket_id, username)
        VALUES ($1,$2,$3)
        ON CONFLICT (room_id, socket_id)
        DO UPDATE SET username = EXCLUDED.username, left_at = NULL, joined_at = NOW()
        `,
        [roomId, socket.id, username]
      );

      const users = await getOnlineUsers(roomId);
      io.to(roomId).emit('user-joined', {
        user: { id: socket.id, username },
        users
      });

      const history = await getRoomHistory(roomId);
      socket.emit('room-history', history);
    } catch (err) {
      console.error('Error join-room:', err);
    }
  });

  socket.on('chat-message', async (roomId, message) => {
    try {
      if (!socket.username) return;

      const msg = String(message || '').trim();
      if (!msg) return;

      await pool.query(
        `INSERT INTO chat_messages (room_id, username, message) VALUES ($1,$2,$3)`,
        [roomId, socket.username, msg]
      );

      io.to(roomId).emit('chat-message', {
        username: socket.username,
        message: msg
      });
    } catch (err) {
      console.error('Error chat-message:', err);
    }
  });

  socket.on('add-rating', async (roomId, username, rating) => {
    try {
      const r = parseInt(rating, 10);
      if (Number.isNaN(r) || r < 1 || r > 10) return;

      const u = socket.username || username;
      if (!u) return;

      const q = await pool.query(
        `
        INSERT INTO ratings (room_id, username, rating)
        VALUES ($1,$2,$3)
        ON CONFLICT (room_id, username)
        DO UPDATE SET rating = EXCLUDED.rating, created_at = NOW()
        RETURNING username, rating
        `,
        [roomId, u, r]
      );

      io.to(roomId).emit('rating-added', q.rows[0]);
    } catch (err) {
      console.error('Error add-rating:', err);
    }
  });

  socket.on('add-reaction', async (roomId, username, time, message) => {
    try {
      const u = socket.username || username;
      if (!u) return;

      const t = String(time || '').trim();
      const m = String(message || '').trim();
      if (!t || !m) return;

      await pool.query(
        `INSERT INTO reactions (room_id, username, time, message) VALUES ($1,$2,$3,$4)`,
        [roomId, u, t, m]
      );

      io.to(roomId).emit('reaction-added', {
        username: u,
        time: t,
        message: m
      });
    } catch (err) {
      console.error('Error add-reaction:', err);
    }
  });

  socket.on('disconnect', async () => {
    const roomId = socket.roomId;
    const username = socket.username;

    console.log('Usuario desconectado', socket.id);

    if (!roomId) return;

    try {
      await pool.query(
        `
        UPDATE room_presence
        SET left_at = NOW()
        WHERE room_id = $1 AND socket_id = $2 AND left_at IS NULL
        `,
        [roomId, socket.id]
      );

      const users = await getOnlineUsers(roomId);
      io.to(roomId).emit('user-left', { username, users });
    } catch (err) {
      console.error('Error disconnect:', err);
    }
  });
});

// Arranque: inicializa DB antes de escuchar
(async () => {
  await initDatabase();
  await cleanupExpiredRooms();

  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
})();
