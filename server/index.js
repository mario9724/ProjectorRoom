const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
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

app.get('/proxy-stream', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).send('URL requerida');
  }
  
  try {
    const response = await axios({
      method: 'GET',
      url: targetUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Range': req.headers.range || 'bytes=0-'
      }
    });
    
    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp4',
      'Content-Length': response.headers['content-length'],
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    });
    
    if (req.headers.range) res.status(206);
    response.data.pipe(res);
    
  } catch (error) {
    res.status(500).send('Error proxy');
  }
});

const roomsRouter = require('./routes/rooms');
app.use('/api/projectorrooms', roomsRouter);

const roomUsers = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;
    
    if (!roomUsers[roomId]) roomUsers[roomId] = new Set();
    roomUsers[roomId].add(username);
    
    io.to(roomId).emit('user-joined', { 
      username,
      users: Array.from(roomUsers[roomId])
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    io.to(roomId).emit('message', {
      username: socket.username,
      message,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    if (socket.roomId && socket.username) {
      roomUsers[socket.roomId]?.delete(socket.username);
      io.to(socket.roomId).emit('user-left', { 
        username: socket.username,
        users: Array.from(roomUsers[socket.roomId] || [])
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`ProjectorRoom en puerto ${PORT}`);
});
