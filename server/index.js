const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const https = require('https');
const http = require('http');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const db = require('./db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// PROXY para Debrid + WebStreamr HTTP
app.get('/proxy-stream', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL requerida');
  
  const protocol = targetUrl.startsWith('https') ? https : http;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Range': req.headers.range || 'bytes=0-'
    }
  };
  
  protocol.get(targetUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
      'Content-Length': proxyRes.headers['content-length'],
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res);
  }).on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(500).end();
  });
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
    io.to(roomId).emit('user-joined', { username, users: Array.from(roomUsers[roomId]) });
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
httpServer.listen(PORT, () => console.log(`ProjectorRoom en puerto ${PORT}`));
