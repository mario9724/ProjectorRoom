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
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId) {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  await loadRoomData();
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    initRoom();
  } else {
    const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    
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
});

// MOSTRAR CONFIGURACIÓN DE INVITADO
function showGuestConfig() {
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
  renderRoom();
  connectSocket();
  setupButtons();
  loadRatings();
  loadReactions();
}

async function loadRoomData() {
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    roomData = data.projectorRoom;
    
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error: ' + error.message);
    window.location.href = '/';
  }
}

// RENDERIZAR SALA
function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  
  // Header con póster pequeño
  document.getElementById('roomPosterSmall').src = movieData.poster;
  document.getElementById('roomTitle').textContent = `Proyectando ${movieData.title} en ${roomData.roomName} de ${roomData.hostUsername}`;
  
  // Info de película
  document.getElementById('roomPoster').src = movieData.poster;
  document.getElementById('movieTitle').textContent = movieData.title;
  document.getElementById('movieYear').textContent = `📅 ${movieData.year}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating}`;
  document.getElementById('movieOverview').textContent = movieData.overview;
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
  
  socket.on('rating-added', data => {
    allRatings.push(data);
  });
  
  socket.on('reaction-added', data => {
    allReactions.push(data);
  });
}

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

function sendChatMessage() {
  const input = document.getElementById('chatInput');
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
  // Limpiar fuente actual
  if (isHost) {
    sessionStorage.removeItem('projectorroom_is_host_' + roomId);
    sessionStorage.removeItem('projectorroom_host_username_' + roomId);
  } else {
    localStorage.removeItem('projectorroom_guest_source_' + roomId);
  }
  
  // Recargar página para volver a selector
  window.location.reload();
}

// CALIFICAR
function openRateModal() {
  const modal = document.getElementById('modalRate');
  const ratingsList = document.getElementById('ratingsList');
  const starsContainer = document.getElementById('ratingStars');
  const submitBtn = document.getElementById('btnSubmitRating');
  
  if (userRating !== null) {
    // Ya calificó, mostrar calificaciones
    starsContainer.style.display = 'none';
    submitBtn.style.display = 'none';
    ratingsList.style.display = 'block';
    renderAllRatings();
  } else {
    // No ha calificado, mostrar estrellas
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
    closeRateModal();
  };
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
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
  document.getElementById('modalRate').style.display = 'none';
}

// REACCIONAR
function openReactModal() {
  document.getElementById('modalReact').style.display = 'flex';
}

function submitReaction() {
  const time = document.getElementById('reactionTime').value.trim();
  const message = document.getElementById('reactionMessage').value.trim();
  
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
  document.getElementById('modalReact').style.display = 'none';
  document.getElementById('reactionTime').value = '';
  document.getElementById('reactionMessage').value = '';
}

// VER REACCIONES
function openViewReactionsModal() {
  renderAllReactions();
  document.getElementById('modalViewReactions').style.display = 'flex';
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = '';
  
  if (allReactions.length === 0) {
    container.innerHTML = '<p style="color: #888;">Aún no hay reacciones</p>';
    return;
  }
  
  allReactions.sort((a, b) => {
    const [minA, secA] = a.time.split(':').map(Number);
    const [minB, secB] = b.time.split(':').map(Number);
    return (minA * 60 + secA) - (minB * 60 + secB);
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
  document.getElementById('modalViewReactions').style.display = 'none';
}

function loadRatings() {
  // Aquí puedes cargar ratings del servidor si los guardas
  allRatings = [];
}

function loadReactions() {
  // Aquí puedes cargar reacciones del servidor si las guardas
  allReactions = [];
}

// CONFIGURAR BOTONES
function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  document.getElementById('btnChangeSource').onclick = changeSource;
  document.getElementById('btnRate').onclick = openRateModal;
  document.getElementById('btnReact').onclick = openReactModal;
  document.getElementById('btnViewReactions').onclick = openViewReactionsModal;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  
  document.getElementById('btnCancelRate').onclick = closeRateModal;
  document.getElementById('btnSubmitReaction').onclick = submitReaction;
  document.getElementById('btnCancelReact').onclick = closeReactModal;
  document.getElementById('btnCloseReactions').onclick = closeViewReactionsModal;
  
  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
  
  // Cerrar modales al hacer clic fuera
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
