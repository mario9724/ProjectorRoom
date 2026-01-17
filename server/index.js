const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const db = require('./db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rutas de ProjectorRoom
const roomsRouter = require('./routes/rooms');
app.use('/api/projectorrooms', roomsRouter);

// WebSocket para chat de sala
io.on('connection', (socket) => {
  console.log('Usuario conectado a ProjectorRoom:', socket.id);

  socket.on('join-room', async ({ roomId, username }) => {
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;
    
    io.to(roomId).emit('user-joined', { username });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    io.to(roomId).emit('message', {
      username: socket.username,
      message,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId) {
      io.to(socket.roomId).emit('user-left', { username: socket.username });
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`ProjectorRoom corriendo en puerto ${PORT}`);
});
