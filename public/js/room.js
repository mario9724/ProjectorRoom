let roomId = null;
let socket = null;
let username = '';
let roomData = null;

// INICIALIZAR SALA
window.addEventListener('load', async function() {
  // Obtener roomId de la URL
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId) {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  // Obtener username de localStorage
  username = localStorage.getItem('projectorroom_username');
  
  if (!username) {
    username = prompt('¿Cómo te llamas?') || 'Anónimo';
    localStorage.setItem('projectorroom_username', username);
  }
  
  // Cargar datos de la sala
  await loadRoomData();
  
  // Conectar Socket.IO
  connectSocket();
  
  // Configurar botones
  setupButtons();
});

// CARGAR DATOS DE LA SALA
async function loadRoomData() {
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    roomData = data.projectorRoom;
    
    // Parsear manifest (contiene info de la película)
    const movieData = JSON.parse(roomData.manifest);
    
    // Renderizar sala
    document.getElementById('roomTitle').textContent = `PROYECTANDO "${movieData.title}"`;
    document.getElementById('roomSubtitle').textContent = `en la sala de ${roomData.hostUsername}`;
    document.getElementById('roomPoster').src = movieData.poster;
    document.getElementById('movieTitle').textContent = movieData.title;
    document.getElementById('movieYear').textContent = `📅 ${movieData.year}`;
    document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
    document.getElementById('movieRating').textContent = `⭐ ${movieData.rating}`;
    document.getElementById('movieOverview').textContent = movieData.overview;
    
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error: ' + error.message);
    window.location.href = '/';
  }
}

// CONECTAR SOCKET.IO
function connectSocket() {
  socket = io();
  
  socket.emit('join-room', { roomId, username });
  
  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
}

// ACTUALIZAR LISTA DE USUARIOS
function updateUsersList(users) {
  document.getElementById('usersCount').textContent = users.length;
  
  const container = document.getElementById('usersList');
  container.innerHTML = '';
  
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.username;
    container.appendChild(userEl);
  });
}

// AGREGAR MENSAJE AL CHAT
function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  
  if (isSystem) {
    messageEl.textContent = message;
  } else {
    messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
  }
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

// ENVIAR MENSAJE
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (message && socket && roomId) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

// ABRIR VLC (NO CIERRA LA PÁGINA)
function startProjection() {
  if (!roomData || !roomData.sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }
  
  // Abrir VLC en nueva ventana/tab
  const vlcUrl = `vlc://${roomData.sourceUrl}`;
  const newWindow = window.open(vlcUrl, '_blank');
  
  // Fallback: descargar directamente
  setTimeout(() => {
    if (!newWindow || newWindow.closed) {
      const link = document.createElement('a');
      link.href = roomData.sourceUrl;
      link.download = '';
      link.target = '_blank';
      link.click();
    }
  }, 1000);
}

// COPIAR ENLACE DE INVITACIÓN
function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomUrl).then(() => {
      alert('✅ Enlace copiado al portapapeles\n\nCompártelo con tus amigos:\n' + roomUrl);
    }).catch(() => {
      prompt('Copia este enlace:', roomUrl);
    });
  } else {
    prompt('Copia este enlace:', roomUrl);
  }
}

// CONFIGURAR BOTONES
function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  
  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

// UTILIDADES
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
