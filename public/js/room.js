const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreams-nightly.stremio.ru/stremio/f18d6a2e-742d-4ae6-8866-2c7b2484031f/eyJpIjoiM2tVUUwxWGhTUlE3azRrK2E4eFZJdz09IiwiZSI6ImxDWkE2dGJPYXFta2FTSUNBaGt2TkRzL1NQRlFteGtZUzJ4WVd2YXRsNFE9IiwidCI6ImEifQ/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let guestSources = [];
let guestSelectedSourceIndex = null;
let userRating = null;
let allRatings = [];
let allReactions = [];
let currentUsers = [];

// ==================== INICIALIZAR ====================
window.addEventListener('load', async function() {
  console.log('🚀 Inicializando sala...');
  
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  console.log('📋 Room ID:', roomId);
  
  try {
    await loadRoomData();
    console.log('✅ Datos de sala cargados:', roomData);
  } catch (error) {
    console.error('❌ Error cargando sala:', error);
    alert('Error: Sala no encontrada');
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  console.log('👤 ¿Es anfitrión?', isHost);
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    console.log('🎯 Username anfitrión:', username);
    
    if (!username) {
      console.error('❌ No se encontró username del anfitrión');
      alert('Error de sesión. Por favor, crea la sala de nuevo.');
      window.location.href = '/';
      return;
    }
    
    console.log('✅ Anfitrión detectado, iniciando sala...');
    initRoom();
    
  } else {
    console.log('👥 Usuario invitado detectado');
    
    const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    console.log('⚙️ ¿Ya configurado?', alreadyConfigured);
    
    if (alreadyConfigured) {
      username = localStorage.getItem('projectorroom_username');
      console.log('👤 Username invitado:', username);
      
      if (roomData.useHostSource === false) {
        console.log('🔍 Anfitrión NO comparte fuente, verificando selección...');
        const hasSelectedSource = localStorage.getItem('projectorroom_guest_source_' + roomId);
        
        if (!hasSelectedSource) {
          console.log('⚠️ Invitado debe seleccionar fuente');
          showGuestSourceSelector();
          return;
        } else {
          console.log('✅ Invitado ya tiene fuente:', hasSelectedSource);
        }
      } else {
        console.log('✅ Anfitrión comparte fuente');
      }
      
      initRoom();
    } else {
      console.log('📝 Mostrando configuración de invitado...');
      showGuestConfig();
    }
  }
});

async function loadRoomData() {
  const res = await fetch(`/api/projectorrooms/${roomId}`);
  const data = await res.json();
  
  if (!data.success) {
    throw new Error(data.message || 'Sala no encontrada');
  }
  
  roomData = data.projectorRoom;
}

function showGuestConfig() {
  console.log('📝 Renderizando configuración de invitado');
  document.querySelector('.room-container').style.display = 'none';
  
  let configHTML = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus>
  `;
  
  if (roomData.useHostSource === false) {
    configHTML += `
      <div style="margin-top: 30px;">
        <h2 style="font-size: 1.3rem; margin-bottom: 20px; text-align: center;">🎬 ¿Qué proyector quieres usar?</h2>
        
        <div class="option-card" onclick="selectGuestProjector('public')">
          <input type="radio" name="guestProjectorType" value="public" checked>
          <div class="option-content">
            <div class="option-title">🌐 Proyector público</div>
            <div class="option-desc">Se usará el predeterminado ya configurado</div>
          </div>
        </div>
        
        <div class="option-card" onclick="selectGuestProjector('custom')">
          <input type="radio" name="guestProjectorType" value="custom">
          <div class="option-content">
            <div class="option-title">⚙️ Proyector personalizado</div>
            <div class="option-desc">Introduce tu manifest.json custom</div>
          </div>
        </div>
        
        <div id="guestCustomManifestBox" style="display:none; margin-top: 15px;">
          <input type="url" id="guestCustomManifest" placeholder="https://tu-manifest.json">
        </div>
      </div>
    `;
  }
  
  configHTML += `
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px; width: 100%;">
          Accede a la sala de ${escapeHtml(roomData.hostUsername)} →
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', configHTML);
}

window.selectGuestProjector = function(type) {
  document.querySelectorAll('input[name="guestProjectorType"]').forEach(radio => {
    radio.checked = radio.value === type;
  });
  
  document.querySelectorAll('.guest-config-container .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  const customBox = document.getElementById('guestCustomManifestBox');
  if (customBox) {
    customBox.style.display = type === 'custom' ? 'block' : 'none';
  }
};

window.submitGuestConfig = function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  
  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  
  console.log('✅ Guardando configuración de invitado:', username);
  
  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  
  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;
    
    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
      localStorage.setItem('projectorroom_guest_manifest_' + roomId, customManifest);
    }
    
    localStorage.setItem('projectorroom_guest_projector_' + roomId, projectorType);
    
    console.log('🔍 Invitado debe seleccionar fuente');
    document.querySelector('.guest-config-container').remove();
    showGuestSourceSelector();
  } else {
    console.log('✅ Invitado usará fuente del anfitrión');
    document.querySelector('.guest-config-container').remove();
    document.querySelector('.room-container').style.display = 'block';
    initRoom();
  }
};

async function showGuestSourceSelector() {
  console.log('🔍 Mostrando selector de fuentes para invitado');
  document.querySelector('.room-container').style.display = 'none';
  
  const movieData = JSON.parse(roomData.manifest);
  
  const selectorHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <img src="${movieData.poster || ''}" alt="Poster">
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title || 'Película')}</h2>
            <div class="movie-meta">
              <span>⭐ ${movieData.rating || 'N/A'}</span>
              <span>${movieData.year || 'N/A'}</span>
              <span>${movieData.type === 'movie' ? 'Película' : 'Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview || 'Sin descripción')}</p>
          </div>
        </div>
        
        <h3 class="section-title">🔍 Selecciona tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>
        
        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Cargando fuentes...</div>
        </div>
        
        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()" style="width: 100%;">
          Unirse a la sala →
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  await loadGuestSources(movieData);
}

async function loadGuestSources(movieData) {
  console.log('🔍 Cargando fuentes para invitado...');
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const projectorType = localStorage.getItem('projectorroom_guest_projector_' + roomId);
  const manifestUrl = projectorType === 'custom'
    ? localStorage.getItem('projectorroom_guest_manifest_' + roomId)
    : PUBLIC_MANIFEST;
  
  console.log('📡 Manifest URL:', manifestUrl);
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${streamType}/${movieData.imdbId}.json`;
    
    console.log('🎬 Stream URL:', streamUrl);
    
    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');
    
    const data = await res.json();
    
    guestSources = (data.streams || [])
      .filter(s => s && s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));
    
    console.log('✅ Fuentes encontradas:', guestSources.length);
    
    if (guestSources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      return;
    }
    
    renderGuestSources();
  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

function renderGuestSources() {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '';
  
  guestSources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectGuestSource(index);
    
    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>
    `;
    
    container.appendChild(card);
  });
  
  document.getElementById('btnJoinRoom').disabled = false;
}

function selectGuestSource(index) {
  guestSelectedSourceIndex = index;
  
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  const selectedUrl = guestSources[guestSelectedSourceIndex].url;
  console.log('✅ Fuente seleccionada:', selectedUrl);
  
  localStorage.setItem('projectorroom_guest_source_' + roomId, selectedUrl);
  
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  
  initRoom();
};

function initRoom() {
  console.log('🎬 Inicializando sala principal...');
  console.log('👤 Usuario:', username);
  console.log('🎯 Es anfitrión:', isHost);
  
  renderRoom();
  
  if (!isHost && roomData.useHostSource === false) {
    const changeSourceSection = document.getElementById('changeSourceSection');
    if (changeSourceSection) {
      changeSourceSection.style.display = 'block';
    }
    console.log('🔄 Botón "Cambiar fuente" habilitado');
  }
  
  connectSocket();
  setupButtons();
  loadRatings();
  loadReactions();
  
  console.log('✅ Sala inicializada correctamente');
}

function renderRoom() {
  console.log('🎨 Renderizando interfaz de sala...');
  
  const movieData = JSON.parse(roomData.manifest);
  
  // Poster pequeño (header)
  const posterEl = document.getElementById('roomPosterSmall');
  if (posterEl) posterEl.src = movieData.poster || '';
  
  const titleEl = document.getElementById('roomTitle');
  if (titleEl) titleEl.textContent = `Proyectando ${movieData.title} en ${roomData.roomName} de ${roomData.hostUsername}`;
  
  // Backdrop/Banner (con fallback al poster si no existe)
  const backdropEl = document.getElementById('roomBackdrop');
  if (backdropEl) {
    backdropEl.src = movieData.backdrop || movieData.poster || '';
  }
  
  // Info de la película
  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const ratingEl = document.getElementById('movieRating');
  const overviewEl = document.getElementById('movieOverview');
  
  if (yearEl) yearEl.textContent = `📅 ${movieData.year || 'N/A'}`;
  if (typeEl) typeEl.textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  if (ratingEl) ratingEl.textContent = `⭐ ${movieData.rating || 'N/A'}`;
  if (overviewEl) overviewEl.textContent = movieData.overview || 'Sin descripción disponible';
  
  console.log('✅ Interfaz renderizada');
}

function connectSocket() {
  console.log('🔌 Conectando a Socket.IO...');
  
  socket = io();
  
  socket.on('connect', () => {
    console.log('✅ Socket conectado');
    socket.emit('join-room', { roomId, username });
  });
  
  socket.on('user-joined', data => {
    console.log('👥 Usuario unido:', data.user.username);
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    console.log('👋 Usuario salió:', data.username);
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
  
  // Cargar historial de chat al unirse
  socket.on('chat-history', data => {
    console.log('📜 Cargando historial de chat:', data.messages.length, 'mensajes');
    data.messages.forEach(msg => {
      addChatMessage(msg.username, msg.message, false);
    });
  });
  
  socket.on('rating-added', data => {
    console.log('⭐ Rating añadido:', data);
    allRatings.push(data);
    if (document.getElementById('modalCalifications').style.display === 'flex') {
      renderAllRatings();
    }
  });
  
  // Cargar historial de calificaciones al unirse
  socket.on('ratings-history', data => {
    console.log('📜 Cargando historial de calificaciones:', data.ratings.length, 'ratings');
    allRatings = data.ratings || [];
    console.log('📊 Promedio de calificaciones:', data.average);
  });
  
  socket.on('reaction-added', data => {
    console.log('💬 Reacción añadida:', data);
    allReactions.push(data);
    if (document.getElementById('modalReactions').style.display === 'flex') {
      renderAllReactions();
    }
  });
  
  // Cargar historial de reacciones al unirse
  socket.on('reactions-history', data => {
    console.log('📜 Cargando historial de reacciones:', data.reactions.length, 'reacciones');
    allReactions = data.reactions || [];
  });
}

function updateUsersList(users) {
  currentUsers = users;
  
  const usersNamesEl = document.getElementById('usersNames');
  if (usersNamesEl) {
    if (users.length === 0) {
      usersNamesEl.textContent = 'No hay usuarios';
    } else if (users.length === 1) {
      usersNamesEl.textContent = `1 roomie en la sala: ${users[0].username}`;
    } else {
      const names = users.map(u => u.username).join(', ');
      usersNamesEl.textContent = `${users.length} roomies en la sala: ${names}`;
    }
  }
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  
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

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;
  
  const message = input.value.trim();
  
  if (message && socket && roomId) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

// ==================== REPRODUCCIÓN EN PICTURE-IN-PICTURE ====================

function startProjection() {
  let sourceUrl;
  
  if (isHost || roomData.useHostSource) {
    sourceUrl = roomData.sourceUrl;
    console.log('🎬 Usando fuente del anfitrión:', sourceUrl);
  } else {
    sourceUrl = localStorage.getItem('projectorroom_guest_source_' + roomId);
    console.log('🎬 Usando fuente del invitado:', sourceUrl);
  }
  
  if (!sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }
  
  console.log('▶️ Abriendo en Picture-in-Picture:', sourceUrl);
  
  // Intentar abrir en PIP
  openInPictureInPicture(sourceUrl);
}

async function openInPictureInPicture(videoUrl) {
  // Verificar soporte de PIP
  if (!document.pictureInPictureEnabled) {
    console.log('⚠️ PIP no soportado, abriendo en nueva pestaña');
    window.open(videoUrl, '_blank');
    return;
  }
  
  // Crear elemento de video temporal oculto
  const videoElement = document.createElement('video');
  videoElement.src = videoUrl;
  videoElement.controls = true;
  videoElement.crossOrigin = 'anonymous';
  videoElement.style.position = 'fixed';
  videoElement.style.bottom = '-1000px'; // Oculto fuera de la pantalla
  videoElement.style.width = '640px';
  videoElement.style.height = '360px';
  
  // Agregar al DOM
  document.body.appendChild(videoElement);
  
  try {
    // Esperar a que el video esté listo
    await videoElement.play();
    
    // Entrar en modo PIP
    if (videoElement !== document.pictureInPictureElement) {
      await videoElement.requestPictureInPicture();
      console.log('✅ Video en modo PIP');
      
      // Evento cuando sale del PIP
      videoElement.addEventListener('leavepictureinpicture', () => {
        console.log('❌ Salió del modo PIP');
        videoElement.pause();
        document.body.removeChild(videoElement);
      });
      
      // Evento cuando termina el video
      videoElement.addEventListener('ended', () => {
        console.log('✅ Video terminado');
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture();
        }
        document.body.removeChild(videoElement);
      });
    }
    
  } catch (error) {
    console.error('Error activando PIP:', error);
    
    // Si PIP falla, mostrar opciones al usuario
    showPlaybackOptions(videoUrl, videoElement);
  }
}

function showPlaybackOptions(videoUrl, videoElement) {
  // Limpiar video element si existe
  if (videoElement && videoElement.parentNode) {
    document.body.removeChild(videoElement);
  }
  
  const options = confirm(
    '🎬 Elige cómo reproducir:\n\n' +
    '✅ OK → Abrir en nueva pestaña (puedes usar apps externas)\n' +
    '❌ Cancelar → Reproducir aquí en pantalla'
  );
  
  if (options) {
    // Abrir en nueva pestaña - activa selector del SO
    window.open(videoUrl, '_blank');
  } else {
    // Reproducir en la misma página (inline)
    playInline(videoUrl);
  }
}

function playInline(videoUrl) {
  // Crear modal con reproductor
  const modal = document.createElement('div');
  modal.id = 'videoModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.95);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;
  
  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = `
    position: relative;
    width: 100%;
    max-width: 1200px;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
  `;
  
  const video = document.createElement('video');
  video.src = videoUrl;
  video.controls = true;
  video.autoplay = true;
  video.style.cssText = `
    width: 100%;
    height: auto;
    display: block;
  `;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕ Cerrar';
  closeBtn.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border: 2px solid #fff;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1rem;
    z-index: 10001;
  `;
  
  closeBtn.onclick = () => {
    video.pause();
    document.body.removeChild(modal);
  };
  
  videoContainer.appendChild(video);
  videoContainer.appendChild(closeBtn);
  modal.appendChild(videoContainer);
  document.body.appendChild(modal);
  
  // Cerrar con ESC
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      video.pause();
      document.body.removeChild(modal);
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomUrl).then(() => {
      alert('✅ Enlace copiado al portapapeles\n\n' + roomUrl);
    }).catch(() => {
      prompt('Copia este enlace:', roomUrl);
    });
  } else {
    prompt('Copia este enlace:', roomUrl);
  }
}

function changeSource() {
  if (isHost) {
    alert('Como anfitrión, debes crear una nueva sala para cambiar la fuente');
    return;
  }
  
  console.log('🔄 Reiniciando selección de fuente...');
  localStorage.removeItem('projectorroom_guest_source_' + roomId);
  window.location.reload();
}

function openCalificationsModal() {
  const modal = document.getElementById('modalCalifications');
  setupRatingStars();
  renderAllRatings();
  modal.style.display = 'flex';
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  let selectedRating = userRating || 0;
  
  stars.forEach((s, i) => {
    if (i < selectedRating) {
      s.classList.add('selected');
    } else {
      s.classList.remove('selected');
    }
  });
  
  stars.forEach(star => {
    star.onclick = function() {
      selectedRating = parseInt(this.dataset.value);
      
      stars.forEach((s, i) => {
        if (i < selectedRating) {
          s.classList.add('selected');
        } else {
          s.classList.remove('selected');
        }
      });
    };
  });
  
  document.getElementById('btnSubmitRating').onclick = function() {
    if (selectedRating === 0) {
      alert('Selecciona una calificación');
      return;
    }
    
    userRating = selectedRating;
    
    if (socket && roomId) {
      socket.emit('add-rating', { roomId, username, rating: selectedRating });
    }
    
    alert(`✅ Has calificado con ${selectedRating}/10 estrellas`);
  };
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = '';
  
  if (allRatings.length === 0) {
    container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">Aún no hay calificaciones de otros roomies</p>';
    return;
  }
  
  allRatings.forEach(rating => {
    const ratingEl = document.createElement('div');
    ratingEl.className = 'rating-item';
    ratingEl.innerHTML = `
      <strong>${escapeHtml(rating.username)}:</strong> ${'★'.repeat(rating.rating)}${'☆'.repeat(10 - rating.rating)} (${rating.rating}/10)
    `;
    container.appendChild(ratingEl);
  });
}

function closeCalificationsModal() {
  document.getElementById('modalCalifications').style.display = 'none';
}

function openReactionsModal() {
  renderAllReactions();
  document.getElementById('modalReactions').style.display = 'flex';
}

function submitReaction() {
  const minute = document.getElementById('reactionMinute').value.trim();
  const message = document.getElementById('reactionMessage').value.trim();
  
  if (!minute || !message) {
    alert('Completa todos los campos');
    return;
  }
  
  const minuteNum = parseInt(minute);
  if (isNaN(minuteNum) || minuteNum < 0) {
    alert('Introduce un minuto válido');
    return;
  }
  
  const time = `${minuteNum}:00`;
  
  if (socket && roomId) {
    socket.emit('add-reaction', { roomId, username, time, message });
  }
  
  document.getElementById('reactionMinute').value = '';
  document.getElementById('reactionMessage').value = '';
  
  alert('✅ Reacción enviada');
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = '';
  
  if (allReactions.length === 0) {
    container.innerHTML = '<p style="color: #888; text-align: center; padding: 20px;">Aún no hay reacciones</p>';
    return;
  }
  
  allReactions.sort((a, b) => {
    const parseTime = (time) => {
      const parts = time.split(':').map(Number);
      return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    };
    return parseTime(a.time) - parseTime(b.time);
  });
  
  allReactions.forEach(reaction => {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'reaction-item';
    reactionEl.innerHTML = `
      <div class="reaction-time">⏱️ ${escapeHtml(reaction.time)}</div>
      <div class="reaction-user">${escapeHtml(reaction.username)}</div>
      <div class="reaction-message">${escapeHtml(reaction.message)}</div>
    `;
    container.appendChild(reactionEl);
  });
}

function closeReactionsModal() {
  document.getElementById('modalReactions').style.display = 'none';
}

function loadRatings() {
  allRatings = [];
}

function loadReactions() {
  allReactions = [];
}

function setupButtons() {
  const btnStartProjection = document.getElementById('btnStartProjection');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnChangeSource = document.getElementById('btnChangeSource');
  const btnCalifications = document.getElementById('btnCalifications');
  const btnReactions = document.getElementById('btnReactions');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnSubmitReaction = document.getElementById('btnSubmitReaction');
  const btnCloseCalifications = document.getElementById('btnCloseCalifications');
  const btnCloseReactions = document.getElementById('btnCloseReactions');
  const chatInput = document.getElementById('chatInput');
  
  if (btnStartProjection) btnStartProjection.onclick = startProjection;
  if (btnCopyInvite) btnCopyInvite.onclick = copyInvite;
  if (btnChangeSource) btnChangeSource.onclick = changeSource;
  if (btnCalifications) btnCalifications.onclick = openCalificationsModal;
  if (btnReactions) btnReactions.onclick = openReactionsModal;
  if (btnSendChat) btnSendChat.onclick = sendChatMessage;
  if (btnSubmitReaction) btnSubmitReaction.onclick = submitReaction;
  if (btnCloseCalifications) btnCloseCalifications.onclick = closeCalificationsModal;
  if (btnCloseReactions) btnCloseReactions.onclick = closeReactionsModal;
  
  if (chatInput) {
    chatInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }
  
  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
