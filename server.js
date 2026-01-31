const express = require(‘express’);
const http = require(‘http’);
const socketIO = require(‘socket.io’);
const path = require(‘path’);
const db = require(’./database’);

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(‘public’));

// Generar ID único
function generateId() {
return Math.random().toString(36).substring(2, 9);
}

// Formatear reacción para el frontend
function formatReactionForClient(reaction) {
return {
username: reaction.username,
time: `${reaction.time_minutes}:00`,
time_minutes: reaction.time_minutes,
message: reaction.message,
created_at: reaction.created_at
};
}

// Formatear calificación para el frontend
function formatRatingForClient(rating) {
return {
username: rating.username,
rating: rating.rating,
created_at: rating.created_at,
updated_at: rating.updated_at
};
}

// Inicializar base de datos al arrancar
db.initDatabase().catch(err => {
console.error(‘Error crítico al inicializar DB:’, err);
process.exit(1);
});

// ==================== RUTAS API ====================

// Crear sala
app.post(’/api/projectorrooms/create’, async (req, res) => {
try {
const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, mediaInfo, cast, crew } = req.body;

```
if (!roomName || !hostUsername || !manifest || !sourceUrl) {
  return res.json({ success: false, message: 'Datos incompletos' });
}

const roomId = generateId();

const roomData = {
  id: roomId,
  roomName,
  hostUsername,
  manifest,
  sourceUrl,
  useHostSource,
  projectorType,
  customManifest
};

// Crear sala en DB
const room = await db.createRoom(roomData);

// Guardar información de la película/serie si está disponible
if (mediaInfo) {
  await db.saveMediaInfo(roomId, mediaInfo);
  
  // Guardar cast si está disponible
  if (cast && Array.isArray(cast)) {
    await db.saveMediaCast(roomId, cast);
  }
  
  // Guardar crew si está disponible
  if (crew && Array.isArray(crew)) {
    await db.saveMediaCrew(roomId, crew);
  }
}

console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);

res.json({ 
  success: true, 
  projectorRoom: room
});
```

} catch (error) {
console.error(‘Error creando sala:’, error);
res.status(500).json({
success: false,
message: ‘Error al crear la sala’
});
}
});

// Obtener sala por ID
app.get(’/api/projectorrooms/:id’, async (req, res) => {
try {
const roomId = req.params.id;
const room = await db.getRoomById(roomId);

```
if (!room) {
  return res.json({ success: false, message: 'Sala no encontrada' });
}

res.json({ 
  success: true, 
  projectorRoom: room
});
```

} catch (error) {
console.error(‘Error obteniendo sala:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener la sala’
});
}
});

// Obtener información completa de la sala (con media info, cast, crew)
app.get(’/api/projectorrooms/:id/full’, async (req, res) => {
try {
const roomId = req.params.id;

```
const [room, mediaInfo, cast, crew, stats] = await Promise.all([
  db.getRoomById(roomId),
  db.getMediaInfo(roomId),
  db.getMediaCast(roomId),
  db.getMediaCrew(roomId),
  db.getRoomStats(roomId)
]);

if (!room) {
  return res.json({ success: false, message: 'Sala no encontrada' });
}

res.json({ 
  success: true, 
  projectorRoom: room,
  mediaInfo,
  cast,
  crew,
  stats
});
```

} catch (error) {
console.error(‘Error obteniendo sala completa:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener la información de la sala’
});
}
});

// Obtener mensajes de chat de una sala
app.get(’/api/projectorrooms/:id/messages’, async (req, res) => {
try {
const roomId = req.params.id;
const limit = parseInt(req.query.limit) || 100;

```
const messages = await db.getChatMessages(roomId, limit);

res.json({ 
  success: true, 
  messages 
});
```

} catch (error) {
console.error(‘Error obteniendo mensajes:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener mensajes’
});
}
});

// Obtener calificaciones de una sala
app.get(’/api/projectorrooms/:id/ratings’, async (req, res) => {
try {
const roomId = req.params.id;

```
const [ratings, avgRating] = await Promise.all([
  db.getRatings(roomId),
  db.getAverageRating(roomId)
]);

res.json({ 
  success: true, 
  ratings,
  average: avgRating
});
```

} catch (error) {
console.error(‘Error obteniendo calificaciones:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener calificaciones’
});
}
});

// Obtener reacciones de una sala
app.get(’/api/projectorrooms/:id/reactions’, async (req, res) => {
try {
const roomId = req.params.id;
const reactions = await db.getReactions(roomId);

```
res.json({ 
  success: true, 
  reactions 
});
```

} catch (error) {
console.error(‘Error obteniendo reacciones:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener reacciones’
});
}
});

// Obtener estadísticas de una sala
app.get(’/api/projectorrooms/:id/stats’, async (req, res) => {
try {
const roomId = req.params.id;
const stats = await db.getRoomStats(roomId);

```
res.json({ 
  success: true, 
  stats 
});
```

} catch (error) {
console.error(‘Error obteniendo estadísticas:’, error);
res.status(500).json({
success: false,
message: ‘Error al obtener estadísticas’
});
}
});

// Servir HTML principal
app.get(’/’, (req, res) => {
res.sendFile(path.join(__dirname, ‘public’, ‘index.html’));
});

// Servir sala
app.get(’/sala/:id’, (req, res) => {
res.sendFile(path.join(__dirname, ‘public’, ‘room.html’));
});

// ==================== SOCKET.IO ====================

io.on(‘connection’, (socket) => {
console.log(‘🔌 Usuario conectado:’, socket.id);

// UNIRSE A SALA
socket.on(‘join-room’, async ({ roomId, username }) => {
try {
console.log(`👤 ${username} se unió a sala ${roomId}`);

```
  socket.join(roomId);
  
  // Guardar usuario en DB
  await db.addUserToRoom(roomId, socket.id, username);
  
  // Obtener usuarios activos
  const activeUsers = await db.getActiveUsersInRoom(roomId);
  
  // Guardar datos en socket
  socket.roomId = roomId;
  socket.username = username;
  
  // Obtener mensajes históricos del chat
  const chatHistory = await db.getChatMessages(roomId, 50);
  
  // Enviar historial de chat al usuario que se unió
  socket.emit('chat-history', { messages: chatHistory });
  
  // Obtener calificaciones existentes
  const [ratings, avgRating] = await Promise.all([
    db.getRatings(roomId),
    db.getAverageRating(roomId)
  ]);
  
  // Formatear y enviar calificaciones al usuario que se unió
  const formattedRatings = ratings.map(formatRatingForClient);
  socket.emit('ratings-history', { ratings: formattedRatings, average: avgRating });
  
  // Obtener reacciones existentes
  const reactions = await db.getReactions(roomId);
  
  // Formatear y enviar reacciones al usuario que se unió
  const formattedReactions = reactions.map(formatReactionForClient);
  socket.emit('reactions-history', { reactions: formattedReactions });
  
  // Notificar a todos en la sala
  io.to(roomId).emit('user-joined', {
    user: { id: socket.id, username },
    users: activeUsers
  });
  
} catch (error) {
  console.error('Error al unirse a sala:', error);
  socket.emit('error', { message: 'Error al unirse a la sala' });
}
```

});

// MENSAJE DE CHAT
socket.on(‘chat-message’, async ({ roomId, message }) => {
try {
console.log(`💬 [${roomId}] ${socket.username}: ${message}`);

```
  // Guardar mensaje en DB
  const savedMessage = await db.saveChatMessage(roomId, socket.username, message);
  
  // Emitir a todos en la sala
  io.to(roomId).emit('chat-message', {
    username: socket.username,
    message: message,
    created_at: savedMessage.created_at
  });
  
} catch (error) {
  console.error('Error guardando mensaje:', error);
  socket.emit('error', { message: 'Error al enviar mensaje' });
}
```

});

// CALIFICACIÓN
socket.on(‘add-rating’, async ({ roomId, username, rating }) => {
try {
console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);

```
  // Guardar calificación en DB
  await db.saveRating(roomId, username, rating);
  
  // Obtener promedio actualizado
  const avgRating = await db.getAverageRating(roomId);
  
  // Emitir a todos en la sala
  io.to(roomId).emit('rating-added', {
    username,
    rating,
    average: avgRating
  });
  
} catch (error) {
  console.error('Error guardando calificación:', error);
  socket.emit('error', { message: 'Error al guardar calificación' });
}
```

});

// REACCIÓN
socket.on(‘add-reaction’, async ({ roomId, username, time, message }) => {
try {
console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);

```
  // Convertir tiempo de formato "MM:SS" a solo minutos si es necesario
  let timeMinutes = time;
  if (typeof time === 'string' && time.includes(':')) {
    const [mins] = time.split(':');
    timeMinutes = parseInt(mins);
  } else if (typeof time === 'string') {
    timeMinutes = parseInt(time);
  }
  
  // Guardar reacción en DB
  const savedReaction = await db.saveReaction(roomId, username, timeMinutes, message);
  
  // Emitir a todos en la sala con formato correcto
  io.to(roomId).emit('reaction-added', formatReactionForClient({
    username,
    time_minutes: timeMinutes,
    message,
    created_at: savedReaction.created_at
  }));
  
} catch (error) {
  console.error('Error guardando reacción:', error);
  socket.emit('error', { message: 'Error al guardar reacción' });
}
```

});

// DESCONEXIÓN
socket.on(‘disconnect’, async () => {
try {
console.log(‘🔴 Usuario desconectado:’, socket.id);

```
  const roomId = socket.roomId;
  const username = socket.username;
  
  if (roomId) {
    // Marcar usuario como desconectado en DB
    await db.removeUserFromRoom(socket.id);
    
    // Obtener usuarios activos restantes
    const activeUsers = await db.getActiveUsersInRoom(roomId);
    
    // Notificar a los demás
    io.to(roomId).emit('user-left', {
      username: username,
      users: activeUsers
    });
    
    console.log(`👋 ${username} salió de sala ${roomId}`);
  }
  
} catch (error) {
  console.error('Error en desconexión:', error);
}
```

});
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo de errores no capturados
process.on(‘unhandledRejection’, (err) => {
console.error(‘Error no manejado:’, err);
});