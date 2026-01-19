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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

function generateRoomId() {
  return crypto.randomBytes(4).toString('hex'); // 8 chars
}

async function cleanupExpiredRooms() {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM rooms WHERE expires_at < NOW()`);
  } finally {
    client.release();
  }
}

setInterval(() => cleanupExpiredRooms().catch(() => {}), 10 * 60 * 1000);

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

  const client = await pool.connect();
  try {
    const insert = await client.query(
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
    console.error(err);
    return res.json({ success: false, message: 'Error creando sala' });
  } finally {
    client.release();
  }
});

// API: obtener sala
app.get('/api/projectorrooms/:id', async (req, res) => {
  const roomId = req.params.id;

  const client = await pool.connect();
  try {
    const q = await client.query(
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
    console.error(err);
    return res.json({ success: false, message: 'Error obteniendo sala' });
  } finally {
    client.release();
  }
});

// HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/sala/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

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
      console.error(err);
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

      io.to(roomId).emit('chat-message', { username: socket.username, message: msg });
    } catch (err) {
      console.error(err);
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
      console.error(err);
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

      io.to(roomId).emit('reaction-added', { username: u, time: t, message: m });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', async () => {
    console.log('Usuario desconectado', socket.id);

    const roomId = socket.roomId;
    const username = socket.username;
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
      console.error(err);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
