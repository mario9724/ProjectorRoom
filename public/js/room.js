const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

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

// INICIALIZAR SALA
window.addEventListener('load', async function() {
  console.log('🚀 Inicializando sala...');
  
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  console.log('Room ID:', roomId);
  
  if (!roomId) {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  try {
    await loadRoomData();
    
    isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
    console.log('Es anfitrión:', isHost);
    
    if (isHost) {
      username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
      console.log('Username anfitrión:', username);
      initRoom();
    } else {
      const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
      console.log('Ya configurado:', alreadyConfigured);
      
      if (alreadyConfigured) {
        username = localStorage.getItem('projectorroom_username');
        
        if (roomData.useHostSource === false) {
          const hasSelectedSource = localStorage.getItem('projectorroom_guest_source_' + roomId);
          
          if (!hasSelectedSource) {
            showGuestSourceSelector();
            return;
          }
        }
        
        initRoom();
      } else {
        showGuestConfig();
      }
    }
  } catch (error) {
    console.error('Error inicializando:', error);
    alert('Error al cargar la sala: ' + error.message);
  }
});

// CARGAR DATOS DE LA SALA
async function loadRoomData() {
  console.log('Cargando datos de sala:', roomId);
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    console.log('Respuesta del servidor:', data);
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    roomData = data.projectorRoom;
    console.log('Room data cargada:', roomData);
    
  } catch (error) {
    console.error('Error cargando sala:', error);
    throw error;
  }
}

// MOSTRAR CONFIGURACIÓN DE INVITADO
function showGuestConfig() {
  console.log('Mostrando config de invitado');
  
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
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px;">
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

window.submitGuestConfig = async function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  
  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  
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
    
    document.querySelector('.guest-config-container').remove();
    showGuestSourceSelector();
  } else {
    document.querySelector('.guest-config-container').remove();
    document.querySelector('.room-container').style.display = 'block';
    initRoom();
  }
};

// MOSTRAR SELECTOR DE FUENTES PARA INVITADO
async function showGuestSourceSelector() {
  document.querySelector('.room-container').style.display = 'none';
  
  const movieData = JSON.parse(roomData.manifest);
  
  const selectorHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <img src="${movieData.poster}" alt="Poster">
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title)}</h2>
            <div class="movie-meta">
              <span>⭐ ${movieData.rating}</span>
              <span>${movieData.year}</span>
              <span>${movieData.type === 'movie' ? 'Película' : 'Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview)}</p>
          </div>
        </div>
        
        <h3 class="section-title">🔍 Selecciona tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>
        
        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Cargando fuentes...</div>
        </div>
        
        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()">
          Unirse a la sala →
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  
  await loadGuestSources(movieData);
}

async function loadGuestSources(movieData) {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const projectorType = localStorage.getItem('projectorroom_guest_projector_' + roomId);
  const manifestUrl = projectorType === 'custom'
    ? localStorage.getItem('projectorroom_guest_manifest_' + roomId)
    : PUBLIC_MANIFEST;
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${streamType}/${movieData.imdbId}.json`;
    
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
    
    if (guestSources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      return;
    }
    
    renderGuestSources();
  } catch (error) {
    console.error('Error cargando fuentes:', error);
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
  
  localStorage.setItem('projectorroom_guest_source_' + roomId, guestSources[guestSelectedSourceIndex].url);
  
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  
  initRoom();
};

// INICIALIZAR SALA
function initRoom() {
  console.log('Inicializando sala principal');
  
  try {
    renderRoom();
    connectSocket();
    setupButtons();
    loadRatings();
    loadReactions();
    console.log('✅ Sala inicializada correctamente');
  } catch (error) {
    console.error('Error en initRoom:', error);
    alert('Error inicializando sala: ' + error.message);
  }
}

// RENDERIZAR SALA
function renderRoom() {
  console.log('Renderizando sala...');
  
  try {
    const movieData = JSON.parse(roomData.manifest);
    console.log('Movie ', movieData);
    
    // Header con póster pequeño
    const roomPosterSmall = document.getElementById('roomPosterSmall');
    const roomTitle = document.getElementById('roomTitle');
    
    if (roomPosterSmall) roomPosterSmall.src = movieData.poster;
    if (roomTitle) roomTitle.textContent = `Proyectando ${movieData.title} en ${roomData.roomName} de ${roomData.hostUsername}`;
    
    // Info de película
    const roomPoster = document.getElementById('roomPoster');
    const movieTitle = document.getElementById('movieTitle');
    const movieYear = document.getElementById('movieYear');
    const movieType = document.getElementById('movieType');
    const movieRating = document.getElementById('movieRating');
    const movieOverview = document.getElementById('movieOverview');
    
    if (roomPoster) roomPoster.src = movieData.poster;
    if (movieTitle) movieTitle.textContent = movieData.title;
    if (movieYear) movieYear.textContent = `📅 ${movieData.year}`;
    if (movieType) movieType.textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
    if (movieRating) movieRating.textContent = `⭐ ${movieData.rating}`;
    if (movieOverview) movieOverview.textContent = movieData.overview;
    
    console.log('✅ Sala renderizada');
  } catch (error) {
    console.error('Error renderizando:', error);
    throw error;
  }
}

// CONECTAR SOCKET.IO
function connectSocket() {
  console.log('Conectando socket...');
  
  socket = io();
  
  socket.emit('join-room', { roomId, username });
  console.log('Emitido join-room:', { roomId, username });
  
  socket.on('user-joined', data => {
    console.log('Usuario unido:', data);
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    console.log('Usuario salió:', data);
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
  
  socket.on('rating-added', data => {
    console.log('Rating añadido:', data);
    allRatings.push(data);
  });
  
  socket.on('reaction-added', data => {
    console.log('Reacción añadida:', data);
    allReactions.push(data);
  });
}

function updateUsersList(users) {
  const usersCount = document.getElementById('usersCount');
  const usersList = document.getElementById('usersList');
  
  if (usersCount) usersCount.textContent = users.length;
  
  if (usersList) {
    usersList.innerHTML = '';
    
    users.forEach(user => {
      const userEl = document.createElement('div');
      userEl.className = 'user-item';
      userEl.textContent = user.username;
      usersList.appendChild(userEl);
    });
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

// ABRIR VLC
function startProjection() {
  let sourceUrl;
  
  if (isHost || roomData.useHostSource) {
    sourceUrl = roomData.sourceUrl;
  } else {
    sourceUrl = localStorage.getItem('projectorroom_guest_source_' + roomId);
  }
  
  if (!sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }
  
  window.location.href = `vlc://${sourceUrl}`;
}

// COPIAR ENLACE
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

// CAMBIAR FUENTE
function changeSource() {
  if (isHost) {
    sessionStorage.removeItem('projectorroom_is_host_' + roomId);
    sessionStorage.removeItem('projectorroom_host_username_' + roomId);
  } else {
    localStorage.removeItem('projectorroom_guest_source_' + roomId);
  }
  
  window.location.reload();
}

// CALIFICAR
function openRateModal() {
  const modal = document.getElementById('modalRate');
  const ratingsList = document.getElementById('ratingsList');
  const starsContainer = document.getElementById('ratingStars');
  const submitBtn = document.getElementById('btnSubmitRating');
  
  if (userRating !== null) {
    starsContainer.style.display = 'none';
    submitBtn.style.display = 'none';
    ratingsList.style.display = 'block';
    renderAllRatings();
  } else {
    starsContainer.style.display = 'flex';
    submitBtn.style.display = 'block';
    ratingsList.style.display = 'none';
    setupRatingStars();
  }
  
  modal.style.display = 'flex';
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  let selectedRating = 0;
  
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
  
  const submitBtn = document.getElementById('btnSubmitRating');
  if (submitBtn) {
    submitBtn.onclick = function() {
      if (selectedRating === 0) {
        alert('Selecciona una calificación');
        return;
      }
      
      userRating = selectedRating;
      
      if (socket && roomId) {
        socket.emit('add-rating', { roomId, username, rating: selectedRating });
      }
      
      alert(`✅ Has calificado con ${selectedRating}/10 estrellas`);
      closeRateModal();
    };
  }
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (allRatings.length === 0) {
    container.innerHTML = '<p style="color: #888;">Aún no hay calificaciones</p>';
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

function closeRateModal() {
  const modal = document.getElementById('modalRate');
  if (modal) modal.style.display = 'none';
}

// REACCIONAR
function openReactModal() {
  const modal = document.getElementById('modalReact');
  if (modal) modal.style.display = 'flex';
}

function submitReaction() {
  const timeInput = document.getElementById('reactionTime');
  const messageInput = document.getElementById('reactionMessage');
  
  if (!timeInput || !messageInput) return;
  
  const time = timeInput.value.trim();
  const message = messageInput.value.trim();
  
  if (!time || !message) {
    alert('Completa todos los campos');
    return;
  }
  
  if (socket && roomId) {
    socket.emit('add-reaction', { roomId, username, time, message });
  }
  
  alert('✅ Reacción enviada');
  closeReactModal();
}

function closeReactModal() {
  const modal = document.getElementById('modalReact');
  if (modal) modal.style.display = 'none';
  
  const timeInput = document.getElementById('reactionTime');
  const messageInput = document.getElementById('reactionMessage');
  
  if (timeInput) timeInput.value = '';
  if (messageInput) messageInput.value = '';
}

// VER REACCIONES
function openViewReactionsModal() {
  renderAllReactions();
  const modal = document.getElementById('modalViewReactions');
  if (modal) modal.style.display = 'flex';
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (allReactions.length === 0) {
    container.innerHTML = '<p style="color: #888;">Aún no hay reacciones</p>';
    return;
  }
  
  allReactions.sort((a, b) => {
    const parseTime = (time) => {
      const parts = time.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return 0;
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

function closeViewReactionsModal() {
  const modal = document.getElementById('modalViewReactions');
  if (modal) modal.style.display = 'none';
}

function loadRatings() {
  allRatings = [];
}

function loadReactions() {
  allReactions = [];
}

// CONFIGURAR BOTONES
function setupButtons() {
  console.log('Configurando botones...');
  
  const btnStartProjection = document.getElementById('btnStartProjection');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnChangeSource = document.getElementById('btnChangeSource');
  const btnRate = document.getElementById('btnRate');
  const btnReact = document.getElementById('btnReact');
  const btnViewReactions = document.getElementById('btnViewReactions');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnCancelRate = document.getElementById('btnCancelRate');
  const btnSubmitReaction = document.getElementById('btnSubmitReaction');
  const btnCancelReact = document.getElementById('btnCancelReact');
  const btnCloseReactions = document.getElementById('btnCloseReactions');
  const chatInput = document.getElementById('chatInput');
  
  if (btnStartProjection) btnStartProjection.onclick = startProjection;
  if (btnCopyInvite) btnCopyInvite.onclick = copyInvite;
  if (btnChangeSource) btnChangeSource.onclick = changeSource;
  if (btnRate) btnRate.onclick = openRateModal;
  if (btnReact) btnReact.onclick = openReactModal;
  if (btnViewReactions) btnViewReactions.onclick = openViewReactionsModal;
  if (btnSendChat) btnSendChat.onclick = sendChatMessage;
  if (btnCancelRate) btnCancelRate.onclick = closeRateModal;
  if (btnSubmitReaction) btnSubmitReaction.onclick = submitReaction;
  if (btnCancelReact) btnCancelReact.onclick = closeReactModal;
  if (btnCloseReactions) btnCloseReactions.onclick = closeViewReactionsModal;
  
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
  
  console.log('✅ Botones configurados');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
