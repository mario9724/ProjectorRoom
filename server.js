const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { pool, initDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = process.env.PORT || 3000;

// Inicializar base de datos
initDB();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Generar ID único
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, selectedEpisode, sourceUrl, useHostSource, projectorType, customManifest } = req.body;

  if (!roomName || !hostUsername || !manifest || !sourceUrl) {
    return res.json({ success: false, message: 'Datos incompletos' });
  }

  const roomId = generateId();

  try {
    await pool.query(
      `INSERT INTO projector_rooms (id, room_name, host_username, manifest, selected_episode, source_url, use_host_source, projector_type, custom_manifest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [roomId, roomName, hostUsername, manifest, selectedEpisode || null, sourceUrl, useHostSource !== false, projectorType || 'public', customManifest || '']
    );

    console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);

    res.json({
      success: true,
      projectorRoom: {
        id: roomId,
        roomName,
        hostUsername,
        manifest,
        selectedEpisode: selectedEpisode || null,
        sourceUrl,
        useHostSource: useHostSource !== false,
        projectorType: projectorType || 'public',
        customManifest: customManifest || ''
      }
    });
  } catch (error) {
    console.error('Error creando sala:', error);
    res.json({ success: false, message: 'Error al crear la sala' });
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

    const room = result.rows[0];
    res.json({
      success: true,
      projectorRoom: {
        id: room.id,
        roomName: room.room_name,
        hostUsername: room.host_username,
        manifest: room.manifest,
        selectedEpisode: room.selected_episode,
        sourceUrl: room.source_url,
        useHostSource: room.use_host_source,
        projectorType: room.projector_type,
        customManifest: room.custom_manifest,
        createdAt: room.created_at
      }
    });
  } catch (error) {
    console.error('Error obteniendo sala:', error);
    res.json({ success: false, message: 'Error al obtener la sala' });
  }
});

// Obtener ratings de una sala
app.get('/api/projectorrooms/:id/ratings', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT username, rating FROM ratings WHERE room_id = $1 ORDER BY created_at DESC',
      [roomId]
    );
    res.json({ success: true, ratings: result.rows });
  } catch (error) {
    console.error('Error obteniendo ratings:', error);
    res.json({ success: false, ratings: [] });
  }
});

// Obtener reacciones de una sala
app.get('/api/projectorrooms/:id/reactions', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT username, time, message FROM reactions WHERE room_id = $1 ORDER BY created_at ASC',
      [roomId]
    );
    res.json({ success: true, reactions: result.rows });
  } catch (error) {
    console.error('Error obteniendo reacciones:', error);
    res.json({ success: false, reactions: [] });
  }
});

// Obtener mensajes de chat de una sala
app.get('/api/projectorrooms/:id/messages', async (req, res) => {
  const roomId = req.params.id;

  try {
    const result = await pool.query(
      'SELECT username, message, is_system, created_at FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC',
      [roomId]
    );
    res.json({ success: true, messages: result.rows });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.json({ success: false, messages: [] });
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

    try {
      // Agregar usuario a la base de datos
      await pool.query(
        'INSERT INTO room_users (room_id, socket_id, username) VALUES ($1, $2, $3)',
        [roomId, socket.id, username]
      );

      // Obtener todos los usuarios de la sala
      const result = await pool.query(
        'SELECT socket_id as id, username FROM room_users WHERE room_id = $1',
        [roomId]
      );

      socket.roomId = roomId;
      socket.username = username;

      io.to(roomId).emit('user-joined', {
        user: { id: socket.id, username },
        users: result.rows
      });

      // Guardar mensaje de sistema
      await pool.query(
        'INSERT INTO chat_messages (room_id, username, message, is_system) VALUES ($1, $2, $3, $4)',
        [roomId, username, `${username} se unió a la sala`, true]
      );
    } catch (error) {
      console.error('Error al unirse a la sala:', error);
    }
  });

  // MENSAJE DE CHAT
  socket.on('chat-message', async ({ roomId, message }) => {
    console.log(`💬 [${roomId}] ${socket.username}: ${message}`);

    try {
      // Guardar mensaje en la base de datos
      await pool.query(
        'INSERT INTO chat_messages (room_id, username, message, is_system) VALUES ($1, $2, $3, $4)',
        [roomId, socket.username, message, false]
      );

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
      await pool.query(
        'INSERT INTO ratings (room_id, username, rating) VALUES ($1, $2, $3)',
        [roomId, username, rating]
      );

      io.to(roomId).emit('rating-added', { username, rating });
    } catch (error) {
      console.error('Error guardando rating:', error);
    }
  });

  // REACCIÓN
  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);

    try {
      await pool.query(
        'INSERT INTO reactions (room_id, username, time, message) VALUES ($1, $2, $3, $4)',
        [roomId, username, time, message]
      );

      io.to(roomId).emit('reaction-added', { username, time, message });
    } catch (error) {
      console.error('Error guardando reacción:', error);
    }
  });

  // DESCONEXIÓN
  socket.on('disconnect', async () => {
    console.log('🔴 Usuario desconectado:', socket.id);

    const roomId = socket.roomId;
    const username = socket.username;

    if (roomId) {
      try {
        // Remover usuario de la base de datos
        await pool.query('DELETE FROM room_users WHERE socket_id = $1', [socket.id]);

        // Obtener usuarios restantes
        const result = await pool.query(
          'SELECT socket_id as id, username FROM room_users WHERE room_id = $1',
          [roomId]
        );

        io.to(roomId).emit('user-left', {
          username: username,
          users: result.rows
        });

        // Guardar mensaje de sistema
        if (username) {
          await pool.query(
            'INSERT INTO chat_messages (room_id, username, message, is_system) VALUES ($1, $2, $3, $4)',
            [roomId, username, `${username} salió de la sala`, true]
          );
        }
      } catch (error) {
        console.error('Error al desconectar:', error);
      }
    }
  });
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});