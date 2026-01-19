require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT |

| 3000;

// Configuración de PostgreSQL en Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Requerido para conexiones externas en Render
});

app.use(express.json());
app.use(express.static('public'));

// Almacenamiento volátil solo para usuarios en línea (no requiere persistencia larga)
let roomUsers = {}; 

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// ==================== RUTAS API ====================

app.post('/api/projectorrooms/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = req.body;
  const roomId = generateId();
  
  try {
    await pool.query(
      'INSERT INTO rooms (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
     
    );
    res.json({ success: true, projectorRoom: { id: roomId, roomName, hostUsername, manifest, sourceUrl } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al crear la sala en la base de datos' });
  }
});

app.get('/api/projectorrooms/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.json({ success: false, message: 'Sala no encontrada' });
    
    // Formatear para compatibilidad con el frontend
    const room = result.rows;
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
    res.status(500).json({ success: false });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/sala/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

// ==================== SOCKET.IO ====================

io.on('connection', (socket) => {
  socket.on('join-room', async ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    if (!roomUsers[roomId]) roomUsers[roomId] =;
    roomUsers[roomId].push({ id: socket.id, username });

    try {
      // Cargar historial persistente para el nuevo usuario
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
    await pool.query('INSERT INTO chat_messages (room_id, username, message) VALUES ($1, $2, $3)', [roomId, socket.username, message]);
    io.to(roomId).emit('chat-message', { username: socket.username, message });
  });

  socket.on('add-rating', async ({ roomId, username, rating }) => {
    try {
      await pool.query(
        'INSERT INTO ratings (room_id, username, rating) VALUES ($1, $2, $3) ON CONFLICT (room_id, username) DO UPDATE SET rating = EXCLUDED.rating',
        [roomId, username, rating]
      );
      io.to(roomId).emit('rating-added', { username, rating });
    } catch (err) { console.error(err); }
  });

  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    await pool.query('INSERT INTO reactions (room_id, username, time_marker, message) VALUES ($1, $2, $3, $4)', [roomId, username, time, message]);
    io.to(roomId).emit('reaction-added', { username, time, message });
  });

  socket.on('disconnect', () => {
    if (socket.roomId && roomUsers[socket.roomId]) {
      roomUsers[socket.roomId] = roomUsers[socket.roomId].filter(u => u.id!== socket.id);
      io.to(socket.roomId).emit('user-left', { username: socket.username, users: roomUsers[socket.roomId] });
    }
  });
});

server.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
