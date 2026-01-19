const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let guestSources =;
let guestSelectedSourceIndex = null;
let userRating = null;
let allRatings =;
let allReactions =;
let currentUsers =;

// ==================== INICIALIZAR ====================
window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId |

| roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  try {
    await loadRoomData();
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
  if (!data.success) throw new Error(data.message |

| 'Sala no encontrada');
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
  document.querySelectorAll('input').forEach(radio => radio.checked = radio.value === type);
  document.querySelectorAll('.guest-config-container.option-card').forEach(card => card.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  const customBox = document.getElementById('guestCustomManifestBox');
  if (customBox) customBox.style.display = type === 'custom'? 'block' : 'none';
};

window.submitGuestConfig = function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  
  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input:checked').value;
    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) return alert('Introduce la URL del manifest.json');
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
          <img src="${movieData.poster |

| ''}" alt="Poster">
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title |

| 'Película')}</h2>
            <div class="movie-meta">
              <span>⭐ ${movieData.rating |

| 'N/A'}</span>
              <span>${movieData.year |

| 'N/A'}</span>
              <span>${movieData.type === 'movie'? 'Película' : 'Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview |

| 'Sin descripción')}</p>
          </div>
        </div>
        <h3 class="section-title">🔍 Selecciona tu fuente</h3>
        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Cargando fuentes...</div>
        </div>
        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()" style="width: 100%;">Unirse a la sala →</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  await loadGuestSources(movieData);
}

async function loadGuestSources(movieData) {
  const container = document.getElementById('guestSourcesList');
  const projectorType = localStorage.getItem('projectorroom_guest_projector_' + roomId);
  const manifestUrl = projectorType === 'custom'? localStorage.getItem('projectorroom_guest_manifest_' + roomId) : PUBLIC_MANIFEST;
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamUrl = `${baseUrl}/stream/${movieData.type === 'movie'? 'movie' : 'series'}/${movieData.imdbId}.json`;
    const res = await fetch(streamUrl);
    const data = await res.json();
    guestSources = (data.streams ||).filter(s => s && s.url).map(s => ({
      url: s.url, title: s.title |

| s.name |
| 'Stream', provider: manifest.name |
| 'Addon'
    }));
    if (guestSources.length === 0) return container.innerHTML = '<div class="loading">😕 No hay fuentes</div>';
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
    card.onclick = () => selectGuestSource(index);
    card.innerHTML = `<div class="source-title">${escapeHtml(source.title)}</div><div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>`;
    container.appendChild(card);
  });
  document.getElementById('btnJoinRoom').disabled = false;
}

function selectGuestSource(index) {
  guestSelectedSourceIndex = index;
  document.querySelectorAll('.source-card').forEach((card, i) => card.classList.toggle('selected', i === index));
}

window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) return alert('Selecciona una fuente');
  localStorage.setItem('projectorroom_guest_source_' + roomId, guestSources.url);
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  initRoom();
};

function initRoom() {
  renderRoom();
  if (!isHost && roomData.useHostSource === false) {
    const section = document.getElementById('changeSourceSection');
    if (section) section.style.display = 'block';
  }
  connectSocket();
  setupButtons();
}

function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  const posterEl = document.getElementById('roomPosterSmall');
  if (posterEl) posterEl.src = movieData.poster |

| '';
  const titleEl = document.getElementById('roomTitle');
  if (titleEl) titleEl.textContent = `Proyectando ${movieData.title} en ${roomData.roomName}`;
  const backdropEl = document.getElementById('roomBackdrop');
  if (backdropEl) backdropEl.src = movieData.backdrop |

| movieData.poster |
| '';
  
  document.getElementById('movieYear').textContent = `📅 ${movieData.year |

| 'N/A'}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie'? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating |

| 'N/A'}`;
  document.getElementById('movieOverview').textContent = movieData.overview |

| 'Sin descripción';
}

function connectSocket() {
  socket = io();
  
  socket.on('connect', () => {
    socket.emit('join-room', { roomId, username });
  });

  // CARGAR HISTORIAL DESDE POSTGRESQL
  socket.on('load-history', data => {
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = ''; 
    data.messages.forEach(msg => addChatMessage(msg.username, msg.message, false));
    allRatings = data.ratings;
    allReactions = data.reactions;
    console.log('📚 Historial sincronizado con la base de datos');
  });

  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió`, true);
  });
  
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió`, true);
  });
  
  socket.on('chat-message', data => addChatMessage(data.username, data.message, false));
  
  socket.on('rating-added', data => {
    const idx = allRatings.findIndex(r => r.username === data.username);
    if (idx!== -1) allRatings[idx] = data; else allRatings.push(data);
    if (document.getElementById('modalCalifications').style.display === 'flex') renderAllRatings();
  });
  
  socket.on('reaction-added', data => {
    allReactions.push(data);
    if (document.getElementById('modalReactions').style.display === 'flex') renderAllReactions();
  });
}

function updateUsersList(users) {
  currentUsers = users;
  const el = document.getElementById('usersNames');
  if (el) el.textContent = users.length === 1? `1 roomie: ${users.username}` : `${users.length} roomies: ${users.map(u => u.username).join(', ')}`;
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = isSystem? 'chat-message chat-system' : 'chat-message';
  msgEl.innerHTML = isSystem? message : `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (message && socket) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

function startProjection() {
  const sourceUrl = (isHost |

| roomData.useHostSource)? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
  if (!sourceUrl) return alert('No se encontró fuente');
  window.location.href = `vlc://${sourceUrl}`;
}

function copyInvite() {
  const url = `${window.location.origin}/sala/${roomId}`;
  navigator.clipboard? navigator.clipboard.writeText(url).then(() => alert('✅ Enlace copiado')) : prompt('Copia este enlace:', url);
}

function changeSource() {
  if (isHost) return alert('Como host, crea una sala nueva para cambiar la fuente');
  localStorage.removeItem('projectorroom_guest_source_' + roomId);
  window.location.reload();
}

function openCalificationsModal() {
  setupRatingStars();
  renderAllRatings();
  document.getElementById('modalCalifications').style.display = 'flex';
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  let selected = userRating |

| 0;
  const updateStars = (val) => stars.forEach((s, i) => s.classList.toggle('selected', i < val));
  updateStars(selected);
  stars.forEach(star => {
    star.onclick = function() {
      selected = parseInt(this.dataset.value);
      updateStars(selected);
    };
  });
  document.getElementById('btnSubmitRating').onclick = function() {
    if (selected === 0) return alert('Elige una nota');
    userRating = selected;
    socket.emit('add-rating', { roomId, username, rating: selected });
    alert('✅ Calificación guardada');
  };
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = allRatings.length === 0? '<p class="loading">Sin calificaciones</p>' : '';
  allRatings.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rating-item';
    item.innerHTML = `<strong>${escapeHtml(r.username)}:</strong> ${'★'.repeat(r.rating)}${'☆'.repeat(10-r.rating)} (${r.rating}/10)`;
    container.appendChild(item);
  });
}

function closeCalificationsModal() { document.getElementById('modalCalifications').style.display = 'none'; }

function openReactionsModal() { renderAllReactions(); document.getElementById('modalReactions').style.display = 'flex'; }

function submitReaction() {
  const minute = document.getElementById('reactionMinute').value.trim();
  const message = document.getElementById('reactionMessage').value.trim();
  if (!minute ||!message) return alert('Faltan campos');
  socket.emit('add-reaction', { roomId, username, time: `${minute}:00`, message });
  document.getElementById('reactionMinute').value = '';
  document.getElementById('reactionMessage').value = '';
  alert('✅ Reacción enviada');
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = allReactions.length === 0? '<p class="loading">Sin reacciones</p>' : '';
  allReactions.sort((a, b) => parseInt(a.time) - parseInt(b.time)).forEach(r => {
    const item = document.createElement('div');
    item.className = 'reaction-item';
    item.innerHTML = `<div class="reaction-time">⏱️ ${escapeHtml(r.time)}</div><div class="reaction-user">${escapeHtml(r.username)}</div><div class="reaction-message">${escapeHtml(r.message)}</div>`;
    container.appendChild(item);
  });
}

function closeReactionsModal() { document.getElementById('modalReactions').style.display = 'none'; }

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  const btnChange = document.getElementById('btnChangeSource');
  if (btnChange) btnChange.onclick = changeSource;
  document.getElementById('btnCalifications').onclick = openCalificationsModal;
  document.getElementById('btnReactions').onclick = openReactionsModal;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnSubmitReaction').onclick = submitReaction;
  document.getElementById('btnCloseCalifications').onclick = closeCalificationsModal;
  document.getElementById('btnCloseReactions').onclick = closeReactionsModal;
  document.getElementById('chatInput').onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };
  window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = 'none'; };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
