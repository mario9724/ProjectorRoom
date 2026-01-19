require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configuración del puerto para Render ✅ CORREGIDO
const PORT = process.env.PORT || 10000;

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static('public'));

let roomUsers = {}; 

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
  const roomId = generateId();
  
  try {
    // ✅ CORREGIDO: array completo con 8 valores
    const values = [roomId, roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest];
    
    await pool.query(
      'INSERT INTO rooms (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      values
    );
    res.json({ success: true, projectorRoom: { id: roomId, roomName, hostUsername, manifest, sourceUrl } });
  } catch (err) {
    console.error('Error DB:', err);
    res.status(500).json({ success: false, message: 'Error al crear la sala' });
  }
});

app.get('/api/projectorrooms/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.json({ success: false, message: 'Sala no encontrada' });
    
    const room = result.rows[0];  // ✅ CORREGIDO: rows[0] en vez de rows
    res.json({ 
      success: true, 
      projectorRoom: {
        id: room.id,
        roomName: room.room_name,
        hostUsername: room.host_username,
        manifest: room.manifest,
        sourceUrl: room.source_url,
        useHostSource: room.use_host_source
      } 
    });
  } catch (err) {
    console.error('Error al obtener sala:', err);
    res.status(500).json({ success: false });
  }
});

app.get('/sala/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

// ==================== SOCKET.IO CON PERSISTENCIA ====================

io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    // ✅ CORREGIDO: array vacío
    if (!roomUsers[roomId]) roomUsers[roomId] = [];
    roomUsers[roomId].push({ id: socket.id, username });

    try {
      const chatRes = await pool.query('SELECT username, message FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC', [roomId]);
      const rateRes = await pool.query('SELECT username, rating FROM ratings WHERE room_id = $1', [roomId]);
      const reacRes = await pool.query('SELECT username, time_marker as time, message FROM reactions WHERE room_id = $1 ORDER BY created_at ASC', [roomId]);

      socket.emit('load-history', {
        messages: chatRes.rows,
        ratings: rateRes.rows,
        reactions: reacRes.rows
      });

      io.to(roomId).emit('user-joined', { user: { id: socket.id, username }, users: roomUsers[roomId] });
    } catch (err) {
      console.error('Error cargando historial:', err);
    }
  });

  socket.on('chat-message', async ({ roomId, message }) => {
    try {
      await pool.query('INSERT INTO chat_messages (room_id, username, message) VALUES ($1, $2, $3)', [roomId, socket.username, message]);
      io.to(roomId).emit('chat-message', { username: socket.username, message });
    } catch (err) { console.error('Error al guardar mensaje:', err); }
  });

  socket.on('add-rating', async ({ roomId, username, rating }) => {
    try {
      await pool.query(
        'INSERT INTO ratings (room_id, username, rating) VALUES ($1, $2, $3) ON CONFLICT (room_id, username) DO UPDATE SET rating = EXCLUDED.rating',
        [roomId, username, rating]
      );
      io.to(roomId).emit('rating-added', { username, rating });
    } catch (err) { console.error('Error al guardar calificación:', err); }
  });

  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    try {
      await pool.query('INSERT INTO reactions (room_id, username, time_marker, message) VALUES ($1, $2, $3, $4)', [roomId, username, time, message]);
      io.to(roomId).emit('reaction-added', { username, time, message });
    } catch (err) { console.error('Error al guardar reacción:', err); }
  });

  socket.on('disconnect', () => {
    if (socket.roomId && roomUsers[socket.roomId]) {
      // ✅ CORREGIDO: template literal con backticks
      roomUsers[socket.roomId] = roomUsers[socket.roomId].filter(u => u.id !== socket.id);
      io.to(socket.roomId).emit('user-left', { username: socket.username, users: roomUsers[socket.roomId] });
    }
  });
});

// ✅ Servidor listo
server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
