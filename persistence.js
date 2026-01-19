const { roomData, loadRoom, saveRoom } = require('./persistence');

io.on('connection', (socket) => {
  socket.on('join-room', (roomId, username) => {
    loadRoom(roomId); // Cargar datos existentes
    
    // Enviar historial al usuario
    socket.emit('load-history', roomData[roomId]);
    
    socket.join(roomId);
  });

  socket.on('chat-message', (roomId, message) => {
    const data = { username: socket.username, message, timestamp: Date.now() };
    roomData[roomId].messages.push(data);
    saveRoom(roomId); // Guardar inmediatamente
    io.to(roomId).emit('chat-message', data);
  });

  socket.on('add-rating', (roomId, username, rating) => {
    const data = { username, rating };
    roomData[roomId].ratings.push(data);
    saveRoom(roomId);
    io.to(roomId).emit('rating-added', data);
  });

  socket.on('add-reaction', (roomId, username, time, message) => {
    const data = { username, time, message };
    roomData[roomId].reactions.push(data);
    saveRoom(roomId);
    io.to(roomId).emit('reaction-added', data);
  });
});
