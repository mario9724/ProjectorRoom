const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

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

// Convertir datos de sala de snake_case a camelCase para el frontend
function formatRoomForClient(room) {
  if (!room) return null;
  
  return {
    id: room.id,
    roomName: room.room_name,
    hostUsername: room.host_username,
    manifest: room.manifest,
    sourceUrl: room.source_url,
    useHostSource: room.use_host_source,
    projectorType: room.projector_type,
    customManifest: room.custom_manifest,
    createdAt: room.created_at
  };
}

// Inicializar base de datos al arrancar
db.initDatabase().catch(err => {
  console.error('Error crítico al inicializar DB:', err);
  process.exit(1);
});

// ==================== RUTAS API ====================

// Crear sala
app.post('/api/projectorrooms/create', async (req, res) => {
  try {
    const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, mediaInfo, cast, crew } = req.body;
    
    console.log('📥 Recibiendo petición de crear sala...');
    console.log('📋 Datos recibidos:', { roomName, hostUsername, sourceUrl: sourceUrl ? 'SÍ' : 'NO', useHostSource });
    
    if (!roomName || !hostUsername || !manifest) {
      console.error('❌ Datos incompletos');
      return res.json({ success: false, message: 'Datos incompletos' });
    }
    
    if (useHostSource && !sourceUrl) {
      console.error('❌ Se seleccionó compartir fuente pero no hay sourceUrl');
      return res.json({ success: false, message: 'Fuente requerida cuando se comparte' });
    }
    
    const roomId = generateId();
    console.log('🆔 Room ID generado:', roomId);
    
    const roomData = {
      id: roomId,
      roomName,
      hostUsername,
      manifest,
      sourceUrl: sourceUrl || '',
      useHostSource: useHostSource !== false,
      projectorType: projectorType || 'public',
      customManifest: customManifest || null
    };
    
    console.log('💾 Guardando en DB:', roomData);
    
    const room = await db.createRoom(roomData);
    
    console.log('✅ Sala guardada en DB');
    
    if (mediaInfo) {
      await db.saveMediaInfo(roomId, mediaInfo);
      
      if (cast && Array.isArray(cast)) {
        await db.saveMediaCast(roomId, cast);
      }
      
      if (crew && Array.isArray(crew)) {
        await db.saveMediaCrew(roomId, crew);
      }
    }
    
    console.log(`✅ Sala creada: ${roomId} - ${roomName} por ${hostUsername}`);
    
    res.json({ 
      success: true, 
      projectorRoom: formatRoomForClient(room)
    });
    
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error al crear la sala: ' + error.message 
    });
  }
});

// Obtener sala por ID
app.get('/api/projectorrooms/:id', async (req, res) => {
  try {
    const roomId = req.params.id;
    const room = await db.getRoomById(roomId);
    
    if (!room) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }
    
    res.json({ 
      success: true, 
      projectorRoom: formatRoomForClient(room)
    });
    
  } catch (error) {
    console.error('Error obteniendo sala:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener la sala' 
    });
  }
});

// ⭐ CORREGIDO: Actualizar contenido de sala
app.put('/api/projectorrooms/:roomId/update-content', async (req, res) => {
  const { roomId } = req.params;
  const { manifest, sourceUrl } = req.body;
  
  console.log('🔄 Actualizando contenido de sala:', roomId);
  console.log('📦 Manifest:', manifest);
  console.log('🎬 SourceUrl:', sourceUrl);
  
  try {
    const room = await db.getRoomById(roomId);
    
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sala no encontrada' 
      });
    }
    
    await db.updateRoomContent(roomId, manifest, sourceUrl || null);
    
    console.log('✅ Contenido actualizado correctamente');
    
    res.json({ 
      success: true, 
      message: 'Contenido actualizado correctamente' 
    });
    
  } catch (error) {
    console.error('❌ Error actualizando contenido:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor: ' + error.message 
    });
  }
});

// ⭐ Reset contenido (calificaciones y reacciones)
app.post('/api/projectorrooms/:id/reset-content', async (req, res) => {
  try {
    const roomId = req.params.id;
    
    console.log('🔄 Reseteando contenido de sala:', roomId);
    
    const room = await db.getRoomById(roomId);
    
    if (!room) {
      return res.json({ success: false, message: 'Sala no encontrada' });
    }
    
    await db.resetRoomContent(roomId);
    
    console.log('✅ Contenido reseteado correctamente');
    
    res.json({ 
      success: true, 
      message: 'Contenido reseteado correctamente' 
    });
    
  } catch (error) {
    console.error('❌ Error reseteando contenido:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error en el servidor: ' + error.message 
    });
  }
});

// Obtener información completa de la sala
app.get('/api/projectorrooms/:id/full', async (req, res) => {
  try {
    const roomId = req.params.id;
    
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
      projectorRoom: formatRoomForClient(room),
      mediaInfo,
      cast,
      crew,
      stats
    });
    
  } catch (error) {
    console.error('Error obteniendo sala completa:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener la información de la sala' 
    });
  }
});

// Obtener mensajes de chat
app.get('/api/projectorrooms/:id/messages', async (req, res) => {
  try {
    const roomId = req.params.id;
    const limit = parseInt(req.query.limit) || 100;
    
    const messages = await db.getChatMessages(roomId, limit);
    
    res.json({ 
      success: true, 
      messages 
    });
    
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener mensajes' 
    });
  }
});

// Obtener calificaciones
app.get('/api/projectorrooms/:id/ratings', async (req, res) => {
  try {
    const roomId = req.params.id;
    
    const [ratings, avgRating] = await Promise.all([
      db.getRatings(roomId),
      db.getAverageRating(roomId)
    ]);
    
    res.json({ 
      success: true, 
      ratings,
      average: avgRating
    });
    
  } catch (error) {
    console.error('Error obteniendo calificaciones:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener calificaciones' 
    });
  }
});

// Obtener reacciones
app.get('/api/projectorrooms/:id/reactions', async (req, res) => {
  try {
    const roomId = req.params.id;
    const reactions = await db.getReactions(roomId);
    
    res.json({ 
      success: true, 
      reactions 
    });
    
  } catch (error) {
    console.error('Error obteniendo reacciones:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener reacciones' 
    });
  }
});

// Obtener estadísticas
app.get('/api/projectorrooms/:id/stats', async (req, res) => {
  try {
    const roomId = req.params.id;
    const stats = await db.getRoomStats(roomId);
    
    res.json({ 
      success: true, 
      stats 
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al obtener estadísticas' 
    });
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
  
  socket.on('join-room', async ({ roomId, username }) => {
    try {
      console.log(`👤 ${username} se unió a sala ${roomId}`);
      
      socket.join(roomId);
      
      await db.addUserToRoom(roomId, socket.id, username);
      
      const activeUsers = await db.getActiveUsersInRoom(roomId);
      
      socket.roomId = roomId;
      socket.username = username;
      
      const chatHistory = await db.getChatMessages(roomId, 50);
      socket.emit('chat-history', { messages: chatHistory });
      
      const [ratings, avgRating] = await Promise.all([
        db.getRatings(roomId),
        db.getAverageRating(roomId)
      ]);
      
      const formattedRatings = ratings.map(formatRatingForClient);
      socket.emit('ratings-history', { ratings: formattedRatings, average: avgRating });
      
      const reactions = await db.getReactions(roomId);
      const formattedReactions = reactions.map(formatReactionForClient);
      socket.emit('reactions-history', { reactions: formattedReactions });
      
      io.to(roomId).emit('user-joined', {
        user: { id: socket.id, username },
        users: activeUsers
      });
      
    } catch (error) {
      console.error('Error al unirse a sala:', error);
      socket.emit('error', { message: 'Error al unirse a la sala' });
    }
  });
  
  socket.on('chat-message', async ({ roomId, message }) => {
    try {
      console.log(`💬 [${roomId}] ${socket.username}: ${message}`);
      
      const savedMessage = await db.saveChatMessage(roomId, socket.username, message);
      
      io.to(roomId).emit('chat-message', {
        username: socket.username,
        message: message,
        created_at: savedMessage.created_at
      });
      
    } catch (error) {
      console.error('Error guardando mensaje:', error);
      socket.emit('error', { message: 'Error al enviar mensaje' });
    }
  });
  
  socket.on('add-rating', async ({ roomId, username, rating }) => {
    try {
      console.log(`⭐ [${roomId}] ${username} calificó con ${rating}/10`);
      
      await db.saveRating(roomId, username, rating);
      
      const avgRating = await db.getAverageRating(roomId);
      
      io.to(roomId).emit('rating-added', {
        username,
        rating,
        average: avgRating
      });
      
    } catch (error) {
      console.error('Error guardando calificación:', error);
      socket.emit('error', { message: 'Error al guardar calificación' });
    }
  });
  
  socket.on('add-reaction', async ({ roomId, username, time, message }) => {
    try {
      console.log(`💬 [${roomId}] ${username} reaccionó en ${time}: ${message}`);
      
      let timeMinutes = time;
      if (typeof time === 'string' && time.includes(':')) {
        const [mins] = time.split(':');
        timeMinutes = parseInt(mins);
      } else if (typeof time === 'string') {
        timeMinutes = parseInt(time);
      }
      
      const savedReaction = await db.saveReaction(roomId, username, timeMinutes, message);
      
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
  });

  socket.on('content-changed', async ({ roomId }) => {
    try {
      console.log(`🔄 [${roomId}] Anfitrión cambió el contenido`);
      
      socket.to(roomId).emit('content-changed', {
        message: 'El anfitrión cambió el contenido de la sala'
      });
      
    } catch (error) {
      console.error('Error notificando cambio de contenido:', error);
    }
  });
  
  socket.on('disconnect', async () => {
    try {
      console.log('🔴 Usuario desconectado:', socket.id);
      
      const roomId = socket.roomId;
      const username = socket.username;
      
      if (roomId) {
        await db.removeUserFromRoom(socket.id);
        
        const activeUsers = await db.getActiveUsersInRoom(roomId);
        
        io.to(roomId).emit('user-left', {
          username: username,
          users: activeUsers
        });
        
        console.log(`👋 ${username} salió de sala ${roomId}`);
      }
      
    } catch (error) {
      console.error('Error en desconexión:', error);
    }
  });
});

// ==================== SERVIDOR ====================

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Error no manejado:', err);
});
