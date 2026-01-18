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

// PROXY CORREGIDO - Maneja headers undefined
app.get('/proxy-stream', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL requerida');
  
  console.log('📹 Proxy stream:', targetUrl);
  
  const followRedirect = (url, depth = 0) => {
    if (depth > 5) {
      console.error('❌ Demasiados redirects');
      return res.status(500).send('Redirect loop');
    }
    
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': req.headers.range || 'bytes=0-'
      }
    }, (proxyRes) => {
      
      // SEGUIR REDIRECTS
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        const redirectUrl = proxyRes.headers.location;
        console.log(`🔄 Redirect ${proxyRes.statusCode} → ${redirectUrl}`);
        proxyRes.resume();
        return followRedirect(redirectUrl, depth + 1);
      }
      
      // ✅ HEADERS SEGUROS (solo si existen)
      const statusCode = req.headers.range && proxyRes.statusCode === 206 ? 206 : 200;
      
      const headers = {
        'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      };
      
      // Solo añadir si existen
      if (proxyRes.headers['content-length']) {
        headers['Content-Length'] = proxyRes.headers['content-length'];
      }
      
      if (proxyRes.headers['content-range']) {
        headers['Content-Range'] = proxyRes.headers['content-range'];
      }
      
      res.writeHead(statusCode, headers);
      proxyRes.pipe(res);
      
    }).on('error', (err) => {
      console.error('❌ Proxy error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Error proxy');
      }
    });
  };
  
  followRedirect(targetUrl);
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
httpServer.listen(PORT, () => console.log(`✅ ProjectorRoom en puerto ${PORT}`));
