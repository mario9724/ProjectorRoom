const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('id');
const username = urlParams.get('username') || 'Anónimo';

let socket = null;
let videoPlayer = null;
let isHost = false;
let isSyncing = false;

// Inicializar
window.addEventListener('load', async function() {
  if (!roomId) {
    alert('Error: ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  try {
    // Obtener datos de la sala
    const res = await fetch('/api/projectorrooms/' + roomId);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    const room = data.projectorRoom;
    isHost = room.hostUsername === username;
    
    // Renderizar info de la sala
    document.getElementById('roomTitle').textContent = room.roomName;
    
    // Configurar video
    videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = room.sourceUrl;
    
    // Ocultar loading cuando el video esté listo
    videoPlayer.addEventListener('loadedmetadata', function() {
      document.getElementById('loadingOverlay').style.display = 'none';
    });
    
    // Conectar Socket.IO
    connectSocket();
    
    // Listeners del video
    setupVideoListeners();
    
    // Chat
    setupChat();
    
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
    window.location.href = '/';
  }
});

function connectSocket() {
  socket = io();
  
  socket.emit('join-room', { roomId, username });
  
  socket.on('user-joined', function(data) {
    updateUsersList(data.users);
    addChatMessage('Sistema', data.user.username + ' se unió a la sala', true);
  });
  
  socket.on('user-left', function(data) {
    updateUsersList(data.users);
    addChatMessage('Sistema', data.username + ' salió de la sala', true);
  });
  
  socket.on('sync-state', function(state) {
    isSyncing = true;
    videoPlayer.currentTime = state.currentTime;
    if (state.isPlaying) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
    setTimeout(function() { isSyncing = false; }, 500);
  });
  
  socket.on('video-play', function(data) {
    if (!isSyncing) {
      isSyncing = true;
      videoPlayer.currentTime = data.currentTime;
      videoPlayer.play();
      setTimeout(function() { isSyncing = false; }, 500);
    }
  });
  
  socket.on('video-pause', function(data) {
    if (!isSyncing) {
      isSyncing = true;
      videoPlayer.currentTime = data.currentTime;
      videoPlayer.pause();
      setTimeout(function() { isSyncing = false; }, 500);
    }
  });
  
  socket.on('video-seek', function(data) {
    if (!isSyncing) {
      isSyncing = true;
      videoPlayer.currentTime = data.currentTime;
      setTimeout(function() { isSyncing = false; }, 500);
    }
  });
  
  socket.on('chat-message', function(data) {
    addChatMessage(data.username, data.message, false);
  });
}

function setupVideoListeners() {
  videoPlayer.addEventListener('play', function() {
    if (!isSyncing) {
      socket.emit('video-play', {
        roomId: roomId,
        currentTime: videoPlayer.currentTime
      });
    }
  });
  
  videoPlayer.addEventListener('pause', function() {
    if (!isSyncing) {
      socket.emit('video-pause', {
        roomId: roomId,
        currentTime: videoPlayer.currentTime
      });
    }
  });
  
  videoPlayer.addEventListener('seeked', function() {
    if (!isSyncing) {
      socket.emit('video-seek', {
        roomId: roomId,
        currentTime: videoPlayer.currentTime
      });
    }
  });
}

function setupChat() {
  const input = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSendMessage');
  
  function sendMessage() {
    const message = input.value.trim();
    if (message) {
      socket.emit('chat-message', {
        roomId: roomId,
        message: message
      });
      input.value = '';
    }
  }
  
  btnSend.onclick = sendMessage;
  
  input.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
}

function updateUsersList(users) {
  const container = document.getElementById('usersList');
  container.textContent = '👤 ' + users.length + ' usuario' + (users.length !== 1 ? 's' : '') + ' conectado' + (users.length !== 1 ? 's' : '');
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message' + (isSystem ? ' system-message' : '');
  
  const userSpan = document.createElement('span');
  userSpan.className = 'chat-username';
  userSpan.textContent = username + ': ';
  
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  
  messageEl.appendChild(userSpan);
  messageEl.appendChild(msgSpan);
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}
