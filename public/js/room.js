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
let vjsPlayer = null; // Instancia para PiP

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

// ==================== CONFIGURACIÓN INVITADO ====================
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
      if (!customManifest) { alert('URL manifest requerida'); return; }
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
          <img src="${movieData.poster || ''}" alt="Poster" style="width: 80px; border-radius: 8px;">
          <div class="movie-info" style="margin-left: 15px;">
            <h2>${escapeHtml(movieData.title)}</h2>
          </div>
        </div>
        <h3 style="margin-top: 20px;">🔍 Selecciona tu fuente</h3>
        <div id="guestSourcesList" class="sources-list" style="max-height: 300px; overflow-y: auto; margin: 15px 0;">
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
      container.innerHTML = '<div>No se encontraron fuentes</div>';
      return;
    }
    renderGuestSources();
  } catch (error) {
    container.innerHTML = `<div>Error: ${error.message}</div>`;
  }
}

function renderGuestSources() {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '';
  guestSources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.style.padding = '10px'; card.style.border = '1px solid #333'; card.style.margin = '5px 0'; card.style.cursor = 'pointer';
    card.onclick = () => {
      guestSelectedSourceIndex = index;
      document.querySelectorAll('.source-card').forEach((c, i) => c.style.borderColor = i === index ? '#fff' : '#333');
    };
    card.innerHTML = `<strong>${escapeHtml(source.title)}</strong><br><small>${escapeHtml(source.provider)}</small>`;
    container.appendChild(card);
  });
  document.getElementById('btnJoinRoom').disabled = false;
}

window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) { alert('Selecciona fuente'); return; }
  localStorage.setItem('projectorroom_guest_source_' + roomId, guestSources[guestSelectedSourceIndex].url);
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  initRoom();
};

// ==================== LÓGICA DE SALA ====================
function initRoom() {
  renderRoom();
  if (!isHost && roomData.useHostSource === false) {
    document.getElementById('changeSourceSection').style.display = 'block';
  }
  connectSocket();
  setupButtons();
}

function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  document.getElementById('roomPosterSmall').src = movieData.poster || '';
  document.getElementById('roomTitle').textContent = `Proyectando ${movieData.title}`;
  document.getElementById('roomBackdrop').src = movieData.backdrop || movieData.poster || '';
  document.getElementById('movieYear').textContent = `📅 ${movieData.year || 'N/A'}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating || 'N/A'}`;
  document.getElementById('movieOverview').textContent = movieData.overview || '';
}

function connectSocket() {
  socket = io();
  socket.on('connect', () => socket.emit('join-room', { roomId, username }));
  socket.on('user-joined', data => updateUsersList(data.users));
  socket.on('user-left', data => updateUsersList(data.users));
  socket.on('chat-message', data => addChatMessage(data.username, data.message));
  socket.on('chat-history', data => data.messages.forEach(msg => addChatMessage(msg.username, msg.message)));
  socket.on('rating-added', data => { allRatings.push(data); renderAllRatings(); });
  socket.on('reaction-added', data => { allReactions.push(data); renderAllReactions(); });
}

// ==================== REPRODUCCIÓN (FIXED) ====================
async function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) { alert('No hay fuente'); return; }

  if (!vjsPlayer) {
    vjsPlayer = videojs('hiddenVideo');
  }

  vjsPlayer.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  vjsPlayer.ready(async function() {
    try {
      await vjsPlayer.play();
      const videoTag = document.querySelector('#hiddenVideo_html5_api');
      if (videoTag && document.pictureInPictureEnabled) {
        await videoTag.requestPictureInPicture();
      } else {
        vjsPlayer.requestFullscreen();
      }
    } catch (e) {
      alert("Pulsa de nuevo para confirmar");
    }
  });
}

// ==================== CHAT Y OTROS ====================
function updateUsersList(users) {
  const el = document.getElementById('usersNames');
  if (el) el.textContent = users.map(u => u.username).join(', ');
}

function addChatMessage(username, message) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<strong>${escapeHtml(username)}:</strong> ${escapeHtml(message)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (msg && socket) {
    socket.emit('chat-message', { roomId, message: msg });
    input.value = '';
  }
}

function copyInvite() {
  navigator.clipboard.writeText(window.location.origin + '/sala/' + roomId);
  alert('Enlace copiado');
}

function changeSource() {
  localStorage.removeItem('projectorroom_guest_source_' + roomId);
  window.location.reload();
}

// ==================== MODALES ====================
function openCalificationsModal() {
  document.getElementById('modalCalifications').style.display = 'flex';
  setupRatingStars();
  renderAllRatings();
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  stars.forEach(star => {
    star.onclick = function() {
      userRating = parseInt(this.dataset.value);
      stars.forEach((s, i) => s.classList.toggle('selected', i < userRating));
    };
  });
  document.getElementById('btnSubmitRating').onclick = () => {
    if (!userRating) return;
    socket.emit('add-rating', { roomId, username, rating: userRating });
  };
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = allRatings.map(r => `<div>${r.username}: ${r.rating}/10</div>`).join('') || 'Sin votos';
}

function closeCalificationsModal() { document.getElementById('modalCalifications').style.display = 'none'; }

function openReactionsModal() {
  document.getElementById('modalReactions').style.display = 'flex';
  renderAllReactions();
}

function submitReaction() {
  const min = document.getElementById('reactionMinute').value;
  const msg = document.getElementById('reactionMessage').value;
  if (min && msg) {
    socket.emit('add-reaction', { roomId, username, time: min + ':00', message: msg });
  }
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = allReactions.map(r => `<div>[${r.time}] ${r.username}: ${r.message}</div>`).join('') || 'Sin reacciones';
}

function closeReactionsModal() { document.getElementById('modalReactions').style.display = 'none'; }

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  if (document.getElementById('btnChangeSource')) document.getElementById('btnChangeSource').onclick = changeSource;
  document.getElementById('btnCalifications').onclick = openCalificationsModal;
  document.getElementById('btnReactions').onclick = openReactionsModal;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnSubmitReaction').onclick = submitReaction;
  document.getElementById('btnCloseCalifications').onclick = closeCalificationsModal;
  document.getElementById('btnCloseReactions').onclick = closeReactionsModal;
  document.getElementById('chatInput').onkeypress = e => { if (e.key === 'Enter') sendChatMessage(); };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
