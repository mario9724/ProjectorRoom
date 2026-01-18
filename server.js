const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const projectorRooms = {};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/projectorrooms/create', (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource } = req.body;
  
  const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  projectorRooms[roomId] = {
    id: roomId,
    roomName: roomName,
    hostUsername: hostUsername,
    manifest: manifest,
    sourceUrl: sourceUrl,
    useHostSource: useHostSource,
    users: [],
    createdAt: new Date().toISOString()
  };
  
  console.log('✅ Sala creada:', roomId);
  
  res.json({
    success: true,
    projectorRoom: projectorRooms[roomId]
  });
});

app.get('/api/projectorrooms/:id', (req, res) => {
  const room = projectorRooms[req.params.id];
  
  if (!room) {
    return res.status(404).json({
      success: false,
      message: 'Sala no encontrada'
    });
  }
  
  res.json({
    success: true,
    projectorRoom: room
  });
});

io.on('connection', (socket) => {
  console.log('🔌 Usuario conectado:', socket.id);
  
  socket.on('join-room', ({ roomId, username }) => {
    console.log('👤', username, 'se unió a sala:', roomId);
    
    if (!projectorRooms[roomId]) {
      socket.emit('error', { message: 'Sala no encontrada' });
      return;
    }
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    const user = {
      id: socket.id,
      username: username,
      joinedAt: new Date().toISOString()
    };
    
    projectorRooms[roomId].users.push(user);
    
    io.to(roomId).emit('user-joined', {
      user: user,
      users: projectorRooms[roomId].users
    });
  });
  
  socket.on('chat-message', ({ roomId, message }) => {
    console.log('💬 Mensaje en sala:', roomId);
    
    io.to(roomId).emit('chat-message', {
      username: socket.username,
      message: message,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Usuario desconectado:', socket.id);
    
    if (socket.roomId && projectorRooms[socket.roomId]) {
      projectorRooms[socket.roomId].users = projectorRooms[socket.roomId].users.filter(
        u => u.id !== socket.id
      );
      
      io.to(socket.roomId).emit('user-left', {
        userId: socket.id,
        username: socket.username,
        users: projectorRooms[socket.roomId].users
      });
    }
  });
});

server.listen(PORT, () => {
  console.log('🚀 Servidor en puerto', PORT);
});
