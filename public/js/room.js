// ==================== CONFIGURACIÓN ====================

const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';

let socket;
let currentRoom = null;
let currentUsername = '';
let myRating = 0;

// ==================== FUNCIÓN DETECTAR MKV ====================

function checkAndHideProjectorIfMKV(sourceUrl) {
  if (!sourceUrl) {
    console.log('⚠️ No hay sourceUrl disponible');
    return;
  }
  
  const urlLower = sourceUrl.toLowerCase();
  const isMKV = urlLower.includes('.mkv');
  const btnStartProjection = document.getElementById('btnStartProjection');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 VERIFICANDO FORMATO DE VIDEO');
  console.log('📎 URL:', sourceUrl);
  console.log('🎬 ¿Contiene .mkv?', isMKV);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (isMKV) {
    console.log('🚫 FORMATO MKV DETECTADO');
    console.log('🚫 OCULTANDO BOTÓN PROYECTAR');
    btnStartProjection.style.display = 'none';
    btnStartProjection.disabled = true;
  } else {
    console.log('✅ Formato compatible');
    console.log('✅ MOSTRANDO BOTÓN PROYECTAR');
    btnStartProjection.style.display = 'block';
    btnStartProjection.disabled = false;
  }
}

// ==================== INICIALIZACIÓN ====================

window.addEventListener('DOMContentLoaded', () => {
  initSocketConnection();
  loadRoomData();
  setupEventListeners();
});

function getRoomIdFromUrl() {
  const path = window.location.pathname;
  return path.split('/sala/')[1];
}

function initSocketConnection() {
  socket = io();
  
  socket.on('connect', () => {
    console.log('✅ Socket conectado:', socket.id);
  });
  
  socket.on('user-joined', (data) => {
    console.log('👤 Usuario se unió:', data.user.username);
    updateUsersList(data.users);
  });
  
  socket.on('user-left', (data) => {
    console.log('👋 Usuario salió:', data.username);
    updateUsersList(data.users);
  });
  
  socket.on('chat-message', (data) => {
    addChatMessage(data.username, data.message, data.created_at);
  });
  
  socket.on('chat-history', (data) => {
    displayChatHistory(data.messages);
  });
  
  socket.on('rating-added', (data) => {
    console.log('⭐ Nueva calificación:', data);
    loadRatings();
  });
  
  socket.on('ratings-history', (data) => {
    displayRatingsHistory(data.ratings, data.average);
  });
  
  socket.on('reaction-added', (data) => {
    console.log('💬 Nueva reacción:', data);
    loadReactions();
  });
  
  socket.on('reactions-history', (data) => {
    displayReactionsHistory(data.reactions);
  });
  
  socket.on('content-changed', (data) => {
    console.log('🔄 Contenido cambiado por el anfitrión');
    alert('El anfitrión ha cambiado el contenido de la sala. Recargando...');
    window.location.reload();
  });
  
  socket.on('error', (data) => {
    console.error('❌ Error del servidor:', data.message);
    alert(data.message);
  });
}

// ==================== CARGAR DATOS DE LA SALA ====================

async function loadRoomData() {
  try {
    const roomId = getRoomIdFromUrl();
    
    const res = await fetch(`/api/projectorrooms/${roomId}/full`);
    const data = await res.json();
    
    if (!data.success) {
      alert('Sala no encontrada');
      window.location.href = '/';
      return;
    }
    
    currentRoom = data.projectorRoom;
    
    console.log('📦 Sala cargada:', currentRoom);
    
    // ⭐ VERIFICAR MKV INMEDIATAMENTE
    checkAndHideProjectorIfMKV(currentRoom.sourceUrl);
    
    currentUsername = prompt('¿Cómo te llamas?') || 'Anónimo';
    
    socket.emit('join-room', {
      roomId: roomId,
      username: currentUsername
    });
    
    displayRoomInfo(data.projectorRoom, data.mediaInfo);
    
    // ⭐ VERIFICAR MKV DESPUÉS DE displayRoomInfo
    setTimeout(() => {
      checkAndHideProjectorIfMKV(currentRoom.sourceUrl);
    }, 100);
    
    const isHost = currentUsername === currentRoom.hostUsername;
    
    if (isHost) {
      document.getElementById('btnChangeContent').style.display = 'block';
    }
    
    const isGuest = !isHost && !currentRoom.useHostSource;
    
    if (isGuest) {
      document.getElementById('changeSourceSection').style.display = 'block';
    }
    
  } catch (error) {
    console.error('❌ Error cargando sala:', error);
    alert('Error al cargar la sala');
  }
}

function displayRoomInfo(room, mediaInfo) {
  document.getElementById('roomTitle').textContent = room.roomName;
  
  if (mediaInfo) {
    const posterSmall = document.getElementById('roomPosterSmall');
    posterSmall.src = mediaInfo.poster_path 
      ? `${TMDB_IMAGE_BASE}${mediaInfo.poster_path}`
      : 'https://via.placeholder.com/200x300?text=Sin+Poster';
    
    const backdrop = document.getElementById('roomBackdrop');
    backdrop.src = mediaInfo.backdrop_path
      ? `${TMDB_BACKDROP_BASE}${mediaInfo.backdrop_path}`
      : 'https://via.placeholder.com/1280x720?text=Sin+Banner';
    
    document.getElementById('movieYear').textContent = mediaInfo.release_date 
      ? new Date(mediaInfo.release_date).getFullYear() 
      : '-';
    
    document.getElementById('movieType').textContent = mediaInfo.media_type === 'movie' 
      ? '🎬 Película' 
      : '📺 Serie';
    
    document.getElementById('movieRating').textContent = mediaInfo.vote_average 
      ? `⭐ ${mediaInfo.vote_average}/10` 
      : '-';
    
    document.getElementById('movieOverview').textContent = mediaInfo.overview || 'Sin descripción disponible';
  }
  
  // ⭐ VERIFICAR MKV AQUÍ TAMBIÉN
  checkAndHideProjectorIfMKV(room.sourceUrl);
}

function updateUsersList(users) {
  const usersNames = users.map(u => u.username).join(', ');
  document.getElementById('usersNames').textContent = `${users.length} roomie(s): ${usersNames}`;
}

// ==================== CHAT ====================

function displayChatHistory(messages) {
  const chatContainer = document.getElementById('chatMessages');
  chatContainer.innerHTML = '';
  
  messages.forEach(msg => {
    addChatMessage(msg.username, msg.message, msg.created_at, false);
  });
  
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addChatMessage(username, message, timestamp, scroll = true) {
  const chatContainer = document.getElementById('chatMessages');
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  
  const isOwnMessage = username === currentUsername;
  if (isOwnMessage) {
    messageDiv.classList.add('own-message');
  }
  
  const time = new Date(timestamp).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <strong>${username}</strong>
      <span class="message-time">${time}</span>
    </div>
    <div class="message-content">${escapeHtml(message)}</div>
  `;
  
  chatContainer.appendChild(messageDiv);
  
  if (scroll) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== CALIFICACIONES ====================

function displayRatingsHistory(ratings, average) {
  const ratingsContent = document.getElementById('ratingsContent');
  
  if (!ratings || ratings.length === 0) {
    ratingsContent.innerHTML = '<p style="text-align: center; color: #888;">Aún no hay calificaciones</p>';
    return;
  }
  
  const avgRating = average?.average_rating || 0;
  const totalRatings = average?.total_ratings || ratings.length;
  
  let html = `
    <div class="average-rating">
      <div class="avg-number">${avgRating}</div>
      <div class="avg-stars">${'⭐'.repeat(Math.round(avgRating))}</div>
      <div class="avg-count">${totalRatings} calificacion(es)</div>
    </div>
    <div class="ratings-list-items">
  `;
  
  ratings.forEach(rating => {
    const isOwnRating = rating.username === currentUsername;
    
    if (isOwnRating) {
      myRating = rating.rating;
      updateStarsDisplay(myRating);
    }
    
    html += `
      <div class="rating-item ${isOwnRating ? 'own-rating' : ''}">
        <span class="rating-username">${rating.username}</span>
        <span class="rating-value">${'⭐'.repeat(rating.rating)} (${rating.rating}/10)</span>
      </div>
    `;
  });
  
  html += '</div>';
  ratingsContent.innerHTML = html;
}

async function loadRatings() {
  try {
    const roomId = getRoomIdFromUrl();
    const res = await fetch(`/api/projectorrooms/${roomId}/ratings`);
    const data = await res.json();
    
    if (data.success) {
      displayRatingsHistory(data.ratings, data.average);
    }
  } catch (error) {
    console.error('Error cargando calificaciones:', error);
  }
}

// ==================== REACCIONES ====================

function displayReactionsHistory(reactions) {
  const reactionsContent = document.getElementById('reactionsContent');
  
  if (!reactions || reactions.length === 0) {
    reactionsContent.innerHTML = '<p style="text-align: center; color: #888;">Aún no hay reacciones</p>';
    return;
  }
  
  let html = '<div class="reactions-list">';
  
  reactions.forEach(reaction => {
    const isOwnReaction = reaction.username === currentUsername;
    
    html += `
      <div class="reaction-item ${isOwnReaction ? 'own-reaction' : ''}">
        <div class="reaction-header">
          <span class="reaction-username">${reaction.username}</span>
          <span class="reaction-time">⏱️ ${reaction.time}</span>
        </div>
        <div class="reaction-message">${escapeHtml(reaction.message)}</div>
      </div>
    `;
  });
  
  html += '</div>';
  reactionsContent.innerHTML = html;
}

async function loadReactions() {
  try {
    const roomId = getRoomIdFromUrl();
    const res = await fetch(`/api/projectorrooms/${roomId}/reactions`);
    const data = await res.json();
    
    if (data.success) {
      displayReactionsHistory(data.reactions);
    }
  } catch (error) {
    console.error('Error cargando reacciones:', error);
  }
}

// ==================== REPRODUCCIÓN ====================

function startProjection() {
  if (!currentRoom || !currentRoom.sourceUrl) {
    alert('No hay fuente disponible para reproducir');
    return;
  }
  
  const videoContainer = document.getElementById('videoContainer');
  const backdrop = document.getElementById('roomBackdrop');
  const video = document.getElementById('roomVideoPlayer');
  
  backdrop.style.display = 'none';
  videoContainer.style.display = 'block';
  
  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });
    
    hls.loadSource(currentRoom.sourceUrl);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS manifest cargado');
      video.play().catch(err => {
        console.error('❌ Error al reproducir:', err);
        alert('No se puede reproducir. Verifica CORS y formato.');
      });
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ Error HLS:', data);
      if (data.fatal) {
        alert('Error fatal al cargar el video');
      }
    });
    
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = currentRoom.sourceUrl;
    video.addEventListener('loadedmetadata', () => {
      video.play();
    });
    
  } else {
    alert('Tu navegador no soporta HLS');
  }
  
  setupCastButtons();
}

function setupCastButtons() {
  const video = document.getElementById('roomVideoPlayer');
  const btnAirPlay = document.getElementById('btnAirPlayControl');
  const btnChromecast = document.getElementById('btnChromecastControl');
  
  if (window.WebKitPlaybackTargetAvailabilityEvent) {
    btnAirPlay.style.display = 'block';
    
    video.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
      if (event.availability === 'available') {
        btnAirPlay.style.display = 'block';
      }
    });
    
    btnAirPlay.addEventListener('click', () => {
      video.webkitShowPlaybackTargetPicker();
    });
  }
  
  if (window.chrome && chrome.cast && chrome.cast.isAvailable) {
    btnChromecast.style.display = 'block';
    
    btnChromecast.addEventListener('click', () => {
      const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
      
      if (castSession) {
        const mediaInfo = new chrome.cast.media.MediaInfo(currentRoom.sourceUrl, 'video/mp4');
        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        
        castSession.loadMedia(request).then(
          () => console.log('✅ Chromecast iniciado'),
          (error) => console.error('❌ Error Chromecast:', error)
        );
      } else {
        alert('No hay dispositivo Chromecast disponible');
      }
    });
  }
}

function openInVLC(streamUrl) {
  const vlcUrl = `vlc://${streamUrl.replace(/^https?:\/\//, '')}`;
  console.log('🎬 Abriendo en VLC:', vlcUrl);
  window.location.href = vlcUrl;
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  // Botón: Proyectar
  const btnStartProjection = document.getElementById('btnStartProjection');
  btnStartProjection.addEventListener('click', startProjection);
  
  // Botón: Usar pantalla externa
  const btnExternalPlayer = document.getElementById('btnExternalPlayer');
  
  btnExternalPlayer.addEventListener('click', () => {
    if (!currentRoom || !currentRoom.sourceUrl) {
      alert('No hay fuente disponible');
      return;
    }
    
    const streamUrl = currentRoom.sourceUrl;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    
    if (isIOS) {
      const vlcUrl = `vlc://${streamUrl.replace(/^https?:\/\//, '')}`;
      console.log('🎬 Abriendo en VLC (iOS):', vlcUrl);
      window.location.href = vlcUrl;
      
    } else if (isAndroid) {
      const intent = `intent://${streamUrl.replace(/^https?:\/\//, '')}#Intent;action=android.intent.action.VIEW;type=video/*;end`;
      console.log('🎬 Abriendo selector de reproductor (Android):', intent);
      window.location.href = intent;
      
    } else {
      window.open(streamUrl, '_blank');
    }
  });
  
  // Botón: Invitar roomie
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  btnCopyInvite.addEventListener('click', () => {
    const inviteUrl = window.location.href;
    
    if (navigator.share) {
      navigator.share({
        title: `Únete a ${currentRoom.roomName}`,
        text: '¡Ven a ver esta peli conmigo!',
        url: inviteUrl
      }).catch(err => console.log('Error compartiendo:', err));
    } else {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        alert('✅ Enlace copiado al portapapeles');
      });
    }
  });
  
  // Botón: Cambiar contenido (solo anfitrión)
  const btnChangeContent = document.getElementById('btnChangeContent');
  btnChangeContent.addEventListener('click', () => {
    const roomId = getRoomIdFromUrl();
    window.location.href = `/?changeContent=${roomId}`;
  });
  
  // Botón: Cambiar fuente (solo invitados)
  const btnChangeSource = document.getElementById('btnChangeSource');
  btnChangeSource.addEventListener('click', () => {
    const roomId = getRoomIdFromUrl();
    window.location.href = `/?changeSource=${roomId}`;
  });
  
  // Chat: Enviar mensaje
  const btnSendChat = document.getElementById('btnSendChat');
  const chatInput = document.getElementById('chatInput');
  
  btnSendChat.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
  
  // Calificaciones
  const btnCalifications = document.getElementById('btnCalifications');
  const modalCalifications = document.getElementById('modalCalifications');
  const btnCloseCalifications = document.getElementById('btnCloseCalifications');
  
  btnCalifications.addEventListener('click', () => {
    modalCalifications.style.display = 'flex';
    loadRatings();
  });
  
  btnCloseCalifications.addEventListener('click', () => {
    modalCalifications.style.display = 'none';
  });
  
  // Estrellas de calificación
  const stars = document.querySelectorAll('#ratingStars .star');
  
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const value = parseInt(star.dataset.value);
      myRating = value;
      updateStarsDisplay(value);
    });
  });
  
  const btnSubmitRating = document.getElementById('btnSubmitRating');
  btnSubmitRating.addEventListener('click', submitRating);
  
  // Reacciones
  const btnReactions = document.getElementById('btnReactions');
  const modalReactions = document.getElementById('modalReactions');
  const btnCloseReactions = document.getElementById('btnCloseReactions');
  
  btnReactions.addEventListener('click', () => {
    modalReactions.style.display = 'flex';
    loadReactions();
  });
  
  btnCloseReactions.addEventListener('click', () => {
    modalReactions.style.display = 'none';
  });
  
  const btnSubmitReaction = document.getElementById('btnSubmitReaction');
  btnSubmitReaction.addEventListener('click', submitReaction);
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  
  if (!message) return;
  
  const roomId = getRoomIdFromUrl();
  
  socket.emit('chat-message', {
    roomId,
    message
  });
  
  chatInput.value = '';
}

function updateStarsDisplay(rating) {
  const stars = document.querySelectorAll('#ratingStars .star');
  
  stars.forEach(star => {
    const value = parseInt(star.dataset.value);
    
    if (value <= rating) {
      star.classList.add('active');
    } else {
      star.classList.remove('active');
    }
  });
}

function submitRating() {
  if (myRating === 0) {
    alert('Selecciona una calificación primero');
    return;
  }
  
  const roomId = getRoomIdFromUrl();
  
  socket.emit('add-rating', {
    roomId,
    username: currentUsername,
    rating: myRating
  });
  
  alert('✅ Calificación guardada');
}

function submitReaction() {
  const minute = document.getElementById('reactionMinute').value;
  const message = document.getElementById('reactionMessage').value.trim();
  
  if (!minute || !message) {
    alert('Completa todos los campos');
    return;
  }
  
  const roomId = getRoomIdFromUrl();
  
  socket.emit('add-reaction', {
    roomId,
    username: currentUsername,
    time: parseInt(minute),
    message
  });
  
  document.getElementById('reactionMinute').value = '';
  document.getElementById('reactionMessage').value = '';
  
  alert('✅ Reacción guardada');
}
