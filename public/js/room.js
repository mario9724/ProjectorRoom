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
let player = null; // Motor para Cast y PiP

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
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    if (!username) {
      alert('Error de sesión. Por favor, crea la sala de nuevo.');
      window.location.href = '/';
      return;
    }
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

async function loadRoomData() {
  const res = await fetch(`/api/projectorrooms/${roomId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Sala no encontrada');
  roomData = data.projectorRoom;
}

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
  if (customBox) customBox.style.display = type === 'custom' ? 'block' : 'none';
};

window.submitGuestConfig = function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  if (!username) { alert('Por favor, escribe tu nombre'); return; }
  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;
    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) { alert('Por favor, introduce la URL del manifest.json'); return; }
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

async function showGuestSourceSelector() {
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
            </div>
            <p>${escapeHtml(movieData.overview || 'Sin descripción')}</p>
          </div>
        </div>
        <h3 class="section-title">🔍 Selecciona tu fuente</h3>
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
  const container = document.getElementById('guestSourcesList');
  const projectorType = localStorage.getItem('projectorroom_guest_projector_' + roomId);
  const manifestUrl = projectorType === 'custom' ? localStorage.getItem('projectorroom_guest_manifest_' + roomId) : PUBLIC_MANIFEST;
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${streamType}/${movieData.imdbId}.json`;
    const res = await fetch(streamUrl);
    const data = await res.json();
    guestSources = (data.streams || []).filter(s => s && s.url).map(s => ({
      url: s.url,
      title: s.title || s.name || 'Stream',
      provider: manifest.name || 'Addon'
    }));
    if (guestSources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes</div>';
      return;
    }
    renderGuestSources();
  } catch (error) {
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

function renderGuestSources() {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '';
  guestSources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => {
      guestSelectedSourceIndex = index;
      document.querySelectorAll('.source-card').forEach((c, i) => c.classList.toggle('selected', i === index));
    };
    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>
    `;
    container.appendChild(card);
  });
  document.getElementById('btnJoinRoom').disabled = false;
}

window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) { alert('Por favor, selecciona una fuente'); return; }
  localStorage.setItem('projectorroom_guest_source_' + roomId, guestSources[guestSelectedSourceIndex].url);
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  initRoom();
};

function initRoom() {
  renderRoom();
  if (!isHost && roomData.useHostSource === false) {
    document.getElementById('changeSourceSection').style.display = 'block';
  }
  connectSocket();
  setupButtons();
  loadRatings();
  loadReactions();
}

function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  document.getElementById('roomPosterSmall').src = movieData.poster || '';
  document.getElementById('roomTitle').textContent = `Proyectando ${movieData.title} en ${roomData.roomName}`;
  document.getElementById('roomBackdrop').src = movieData.backdrop || movieData.poster || '';
  document.getElementById('movieYear').textContent = `📅 ${movieData.year || 'N/A'}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating || 'N/A'}`;
  document.getElementById('movieOverview').textContent = movieData.overview || 'Sin descripción disponible';
}

function connectSocket() {
  socket = io();
  socket.on('connect', () => socket.emit('join-room', { roomId, username }));
  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  socket.on('chat-message', data => addChatMessage(data.username, data.message, false));
  socket.on('chat-history', data => data.messages.forEach(msg => addChatMessage(msg.username, msg.message, false)));
  socket.on('rating-added', data => {
    allRatings.push(data);
    if (document.getElementById('modalCalifications').style.display === 'flex') renderAllRatings();
  });
  socket.on('reaction-added', data => {
    allReactions.push(data);
    if (document.getElementById('modalReactions').style.display === 'flex') renderAllReactions();
  });
}

// ==================== REPRODUCCIÓN (NUEVA LÓGICA) ====================

async function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) { alert('No se encontró la fuente'); return; }

  const videoElement = document.getElementById('hiddenVideo');

  if (!player) {
    player = videojs('hiddenVideo', {
      controls: true,
      techOrder: ['chromecast', 'html5'],
      plugins: { chromecast: { buttonPositionIndex: 0 } }
    });
  }

  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  player.ready(async function() {
    try {
      await player.play();
      const rawVideo = videoElement.querySelector('video');
      if (document.pictureInPictureEnabled && rawVideo) {
        await rawVideo.requestPictureInPicture();
      }
    } catch (error) {
      console.error('Error PIP:', error);
      window.open(sourceUrl, '_blank');
    }
  });
}

// ==================== FUNCIONES RESTANTES (ORIGINALES) ====================

function updateUsersList(users) {
  currentUsers = users;
  const usersNamesEl = document.getElementById('usersNames');
  if (usersNamesEl) {
    const names = users.map(u => u.username).join(', ');
    usersNamesEl.textContent = `${users.length} roomies: ${names}`;
  }
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  if (isSystem) messageEl.textContent = message;
  else messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
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

function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  navigator.clipboard.writeText(roomUrl).then(() => alert('✅ Enlace copiado')).catch(() => prompt('Copia este enlace:', roomUrl));
}

function changeSource() {
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
  stars.forEach(star => {
    star.onclick = function() {
      const val = parseInt(this.dataset.value);
      userRating = val;
      stars.forEach((s, i) => s.classList.toggle('selected', i < val));
    };
  });
  document.getElementById('btnSubmitRating').onclick = function() {
    if (!userRating) { alert('Selecciona una calificación'); return; }
    socket.emit('add-rating', { roomId, username, rating: userRating });
    alert('✅ Calificación guardada');
  };
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = allRatings.map(r => `
    <div class="rating-item"><strong>${escapeHtml(r.username)}:</strong> ${'★'.repeat(r.rating)} (${r.rating}/10)</div>
  `).join('') || '<p>Aún no hay calificaciones</p>';
}

function closeCalificationsModal() { document.getElementById('modalCalifications').style.display = 'none'; }

function openReactionsModal() {
  renderAllReactions();
  document.getElementById('modalReactions').style.display = 'flex';
}

function submitReaction() {
  const minute = document.getElementById('reactionMinute').value.trim();
  const message = document.getElementById('reactionMessage').value.trim();
  if (minute && message && socket) {
    socket.emit('add-reaction', { roomId, username, time: `${minute}:00`, message });
    document.getElementById('reactionMinute').value = '';
    document.getElementById('reactionMessage').value = '';
    alert('✅ Reacción enviada');
  }
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = allReactions.map(r => `
    <div class="reaction-item">
      <div class="reaction-time">⏱️ ${escapeHtml(r.time)}</div>
      <div class="reaction-user">${escapeHtml(r.username)}</div>
      <div class="reaction-message">${escapeHtml(r.message)}</div>
    </div>
  `).join('') || '<p>Aún no hay reacciones</p>';
}

function closeReactionsModal() { document.getElementById('modalReactions').style.display = 'none'; }

function loadRatings() { allRatings = []; }
function loadReactions() { allReactions = []; }

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  const btnChangeSource = document.getElementById('btnChangeSource');
  if (btnChangeSource) btnChangeSource.onclick = changeSource;
  document.getElementById('btnCalifications').onclick = openCalificationsModal;
  document.getElementById('btnReactions').onclick = openReactionsModal;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnSubmitReaction').onclick = submitReaction;
  document.getElementById('btnCloseCalifications').onclick = closeCalificationsModal;
  document.getElementById('btnCloseReactions').onclick = closeReactionsModal;
  document.getElementById('chatInput').onkeypress = e => { if (e.key === 'Enter') sendChatMessage(); };
  window.onclick = e => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
