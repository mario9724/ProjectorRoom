const PUBLIC_MANIFEST =
  'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

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

// ==================== INIT ====================
window.addEventListener('load', async () => {
  roomId = window.location.pathname.split('/').pop();

  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }

  try {
    await loadRoomData();
  } catch (e) {
    console.error('Error cargando sala:', e);
    alert('Error: Sala no encontrada');
    window.location.href = '/';
    return;
  }

  isHost = sessionStorage.getItem(`projectorroom_is_host_${roomId}`) === 'true';

  if (isHost) {
    username = sessionStorage.getItem(`projectorroom_host_username_${roomId}`) || '';
    if (!username) {
      alert('Error de sesión. Por favor, crea la sala de nuevo.');
      window.location.href = '/';
      return;
    }
    initRoom();
    return;
  }

  // Invitado
  const alreadyConfigured = localStorage.getItem(`projectorroom_guest_configured_${roomId}`) === 'true';
  if (!alreadyConfigured) {
    showGuestConfig();
    return;
  }

  username = localStorage.getItem('projectorroom_username') || '';

  if (roomData.useHostSource === false) {
    const hasSelectedSource = localStorage.getItem(`projectorroom_guest_source_${roomId}`);
    if (!hasSelectedSource) {
      showGuestSourceSelector();
      return;
    }
  }

  initRoom();
});

async function loadRoomData() {
  const res = await fetch(`/api/projectorrooms/${roomId}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Sala no encontrada');
  roomData = data.projectorRoom;
}

// ==================== GUEST CONFIG ====================
function showGuestConfig() {
  document.querySelector('.room-container').style.display = 'none';

  let html = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus />
  `;

  if (roomData.useHostSource === false) {
    html += `
      <div style="margin-top: 30px;">
        <h2 style="font-size: 1.3rem; margin-bottom: 20px; text-align: center;">¿Qué proyector quieres usar?</h2>

        <div class="option-card selected" onclick="selectGuestProjector('public')">
          <input type="radio" name="guestProjectorType" value="public" checked />
          <div class="option-content">
            <div class="option-title">Proyector público</div>
            <div class="option-desc">Se usará el predeterminado ya configurado</div>
          </div>
        </div>

        <div class="option-card" onclick="selectGuestProjector('custom')">
          <input type="radio" name="guestProjectorType" value="custom" />
          <div class="option-content">
            <div class="option-title">Proyector personalizado</div>
            <div class="option-desc">Introduce tu manifest.json custom</div>
          </div>
        </div>

        <div id="guestCustomManifestBox" style="display:none; margin-top: 15px;">
          <input type="url" id="guestCustomManifest" placeholder="https://tu-manifest.json" />
        </div>
      </div>
    `;
  }

  html += `
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px; width: 100%;">
          Accede a la sala de ${escapeHtml(roomData.hostUsername)}
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
}

window.selectGuestProjector = function (type) {
  document.querySelectorAll('input[name="guestProjectorType"]').forEach(r => (r.checked = r.value === type));
  document.querySelectorAll('.guest-config-container .option-card').forEach(c => c.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  const customBox = document.getElementById('guestCustomManifestBox');
  if (customBox) customBox.style.display = type === 'custom' ? 'block' : 'none';
};

window.submitGuestConfig = function () {
  const input = document.getElementById('guestUsername');
  username = (input?.value || '').trim();

  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }

  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem(`projectorroom_guest_configured_${roomId}`, 'true');

  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;

    if (projectorType === 'custom') {
      const customManifest = (document.getElementById('guestCustomManifest')?.value || '').trim();
      if (!customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
      localStorage.setItem(`projectorroom_guest_manifest_${roomId}`, customManifest);
    }

    localStorage.setItem(`projectorroom_guest_projector_${roomId}`, projectorType);

    document.querySelector('.guest-config-container')?.remove();
    showGuestSourceSelector();
    return;
  }

  document.querySelector('.guest-config-container')?.remove();
  document.querySelector('.room-container').style.display = 'block';
  initRoom();
};

// ==================== GUEST SOURCE SELECTOR ====================
async function showGuestSourceSelector() {
  document.querySelector('.room-container').style.display = 'none';

  const movieData = JSON.parse(roomData.manifest);

  const html = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <img src="${escapeHtml(movieData.poster)}" alt="Poster" />
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title)}</h2>
            <div class="movie-meta">
              <span>${escapeHtml(movieData.rating || 'NA')}</span>
              <span>${escapeHtml(movieData.year || 'NA')}</span>
              <span>${movieData.type === 'movie' ? 'Película' : 'Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview || 'Sin descripción')}</p>
          </div>
        </div>

        <h3 class="section-title">Selecciona tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>

        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Buscando fuentes...</div>
        </div>

        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()" style="width: 100%;">
          Unirse a la sala
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  await loadGuestSources(movieData);
}

function buildStreamIdFromMovieData(movieData) {
  if (movieData.type === 'movie') return movieData.imdbId;

  // ✅ Stremio series id: ttXXXXXXX:season:episode
  const s = movieData.season || 1;
  const e = movieData.episode || 1;
  return `${movieData.imdbId}:${s}:${e}`;
}

async function loadGuestSources(movieData) {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '<div class="loading">Buscando fuentes...</div>';

  const projectorType = localStorage.getItem(`projectorroom_guest_projector_${roomId}`) || 'public';
  const manifestUrl =
    projectorType === 'custom'
      ? localStorage.getItem(`projectorroom_guest_manifest_${roomId}`)
      : PUBLIC_MANIFEST;

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('manifest.json', '');

    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamId = buildStreamIdFromMovieData(movieData);

    // ✅ con .json (como venías usando)
    const streamUrl = `${baseUrl}stream/${streamType}/${encodeURIComponent(streamId)}.json`;

    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');

    const data = await res.json();

    guestSources = (data.streams || [])
      .filter(s => s.url && (s.url.startsWith('http') || s.url.startsWith('https')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));

    if (!guestSources.length) {
      container.innerHTML = '<div class="loading">No se encontraron fuentes disponibles</div>';
      return;
    }

    renderGuestSources();
  } catch (e) {
    console.error('Error cargando fuentes invitado:', e);
    container.innerHTML = `<div class="loading">Error: ${escapeHtml(e.message)}</div>`;
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
      <div class="source-meta">${escapeHtml(source.provider)}</div>
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

window.joinRoomWithSource = function () {
  if (guestSelectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }

  const selectedUrl = guestSources[guestSelectedSourceIndex].url;
  localStorage.setItem(`projectorroom_guest_source_${roomId}`, selectedUrl);

  document.querySelector('.guest-source-container')?.remove();
  document.querySelector('.room-container').style.display = 'block';
  initRoom();
};

// ==================== MAIN ROOM ====================
function initRoom() {
  renderRoom();

  // Invitado puede cambiar fuente solo si host NO comparte
  if (!isHost && roomData.useHostSource === false) {
    const changeSourceSection = document.getElementById('changeSourceSection');
    if (changeSourceSection) changeSourceSection.style.display = 'block';
  }

  // Botón cerrar sala solo host
  const btnCloseRoom = document.getElementById('btnCloseRoom');
  if (btnCloseRoom) btnCloseRoom.style.display = isHost ? 'block' : 'none';

  connectSocket();
  setupButtons();
  loadRatings();
  loadReactions();
}

function formatEpisodeTag(movieData) {
  if (!movieData || movieData.type !== 'series') return '';
  const s = movieData.season;
  const e = movieData.episode;
  if (!s || !e) return '';
  return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
}

function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);

  const posterEl = document.getElementById('roomPosterSmall');
  if (posterEl) posterEl.src = movieData.poster || '';

  const titleEl = document.getElementById('roomTitle');
  if (titleEl) {
    const ep = formatEpisodeTag(movieData);
    const epText = ep ? ` (${ep})` : '';
    titleEl.textContent = `Proyectando ${movieData.title}${epText} en ${roomData.roomName} de ${roomData.hostUsername}`;
  }

  const backdropEl = document.getElementById('roomBackdrop');
  if (backdropEl) backdropEl.src = movieData.backdrop || movieData.poster || '';

  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const ratingEl = document.getElementById('movieRating');
  const overviewEl = document.getElementById('movieOverview');

  if (yearEl) yearEl.textContent = movieData.year || 'NA';
  if (typeEl) typeEl.textContent = movieData.type === 'movie' ? 'Película' : 'Serie';
  if (ratingEl) ratingEl.textContent = movieData.rating || 'NA';
  if (overviewEl) overviewEl.textContent = movieData.overview || 'Sin descripción disponible';
}

// ==================== SOCKET ====================
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join-room', roomId, username);
  });

  socket.on('user-joined', data => {
    updateUsersList(data.users || []);
    if (data.user?.username) addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });

  socket.on('user-left', data => {
    updateUsersList(data.users || []);
    if (data.username) addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });

  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });

  socket.on('rating-added', data => {
    allRatings.push(data);
    const modal = document.getElementById('modalCalifications');
    if (modal && modal.style.display === 'flex') renderAllRatings();
  });

  socket.on('reaction-added', data => {
    allReactions.push(data);
    const modal = document.getElementById('modalReactions');
    if (modal && modal.style.display === 'flex') renderAllReactions();
  });

  socket.on('room-closed', () => {
    alert('El anfitrión cerró la sala');
    window.location.href = '/';
  });
}

function updateUsersList(users) {
  currentUsers = users;

  const usersNamesEl = document.getElementById('usersNames');
  if (!usersNamesEl) return;

  if (users.length === 0) {
    usersNamesEl.textContent = 'No hay usuarios';
    return;
  }

  if (users.length === 1) {
    usersNamesEl.textContent = `1 roomie en la sala: ${users[0].username}`;
    return;
  }

  const names = users.map(u => u.username).join(', ');
  usersNamesEl.textContent = `${users.length} roomies en la sala: ${names}`;
}

// ==================== CHAT ====================
function addChatMessage(user, message, isSystem) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const el = document.createElement('div');
  el.className = isSystem ? 'chat-message chat-system' : 'chat-message';

  if (isSystem) el.textContent = message;
  else el.innerHTML = `<span class="chat-username">${escapeHtml(user)}:</span> ${escapeHtml(message)}`;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  socket.emit('chat-message', roomId, message);
  input.value = '';
}

// ==================== PROYECCIÓN ====================
function startProjection() {
  let sourceUrl = null;

  if (isHost || roomData.useHostSource === true) {
    sourceUrl = roomData.sourceUrl;
  } else {
    sourceUrl = localStorage.getItem(`projectorroom_guest_source_${roomId}`);
  }

  if (!sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }

  window.location.href = `vlc://${sourceUrl}`;
}

// ==================== ACTIONS ====================
function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  if (navigator.clipboard) navigator.clipboard.writeText(roomUrl).then(() => alert(`Enlace copiado: ${roomUrl}`));
  else prompt('Copia este enlace:', roomUrl);
}

function changeSource() {
  if (isHost) {
    alert('Como anfitrión, debes crear una nueva sala para cambiar la fuente');
    return;
  }
  if (roomData.useHostSource === true) {
    alert('El anfitrión está compartiendo la fuente, no puedes cambiarla.');
    return;
  }

  localStorage.removeItem(`projectorroom_guest_source_${roomId}`);
  document.querySelector('.guest-source-container')?.remove();
  showGuestSourceSelector();
}

async function closeRoom() {
  if (!isHost) return;

  const ok = confirm('¿Cerrar la sala para todos?');
  if (!ok) return;

  const res = await fetch(`/api/projectorrooms/${roomId}`, { method: 'DELETE' });
  const data = await res.json();

  if (!data.success) {
    alert(`No se pudo cerrar la sala: ${data.message || 'Error'}`);
    return;
  }

  alert('Sala cerrada');
  window.location.href = '/';
}

// ==================== MODALS (igual que tu flujo actual) ====================
function openCalificationsModal() {
  const modal = document.getElementById('modalCalifications');
  setupRatingStars();
  renderAllRatings();
  modal.style.display = 'flex';
}

function closeCalificationsModal() {
  document.getElementById('modalCalifications').style.display = 'none';
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  let selectedRating = userRating || 0;

  stars.forEach((s, i) => s.classList.toggle('selected', i < selectedRating));

  stars.forEach(star => {
    star.onclick = function () {
      selectedRating = parseInt(this.dataset.value, 10);
      stars.forEach((s, i) => s.classList.toggle('selected', i < selectedRating));
    };
  });

  const btn = document.getElementById('btnSubmitRating');
  if (btn) {
    btn.onclick = function () {
      if (selectedRating <= 0) return alert('Selecciona una calificación');
      userRating = selectedRating;
      socket.emit('add-rating', roomId, username, selectedRating);
      alert(`Has calificado con ${selectedRating}/10 estrellas`);
    };
  }
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = '';

  if (!allRatings.length) {
    container.innerHTML =
      '<p style="color:#888; text-align:center; padding: 20px;">Aún no hay calificaciones de otros roomies</p>';
    return;
  }

  allRatings.forEach(r => {
    const el = document.createElement('div');
    el.className = 'rating-item';
    el.innerHTML = `<strong>${escapeHtml(r.username)}</strong>: ${'★'.repeat(r.rating)}${'☆'.repeat(
      10 - r.rating
    )} (${r.rating}/10)`;
    container.appendChild(el);
  });
}

function openReactionsModal() {
  renderAllReactions();
  document.getElementById('modalReactions').style.display = 'flex';
}

function closeReactionsModal() {
  document.getElementById('modalReactions').style.display = 'none';
}

function submitReaction() {
  const minute = (document.getElementById('reactionMinute')?.value || '').trim();
  const message = (document.getElementById('reactionMessage')?.value || '').trim();
  if (!minute || !message) return alert('Completa todos los campos');

  const minuteNum = parseInt(minute, 10);
  if (isNaN(minuteNum) || minuteNum < 0) return alert('Introduce un minuto válido');

  const time = `${minuteNum}:00`;
  socket.emit('add-reaction', roomId, username, time, message);

  document.getElementById('reactionMinute').value = '';
  document.getElementById('reactionMessage').value = '';
  alert('Reacción enviada');
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = '';

  if (!allReactions.length) {
    container.innerHTML =
      '<p style="color:#888; text-align:center; padding: 20px;">Aún no hay reacciones</p>';
    return;
  }

  const parseTime = t => {
    const parts = String(t || '').split(':').map(Number);
    return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
  };

  allReactions
    .slice()
    .sort((a, b) => parseTime(a.time) - parseTime(b.time))
    .forEach(r => {
      const el = document.createElement('div');
      el.className = 'reaction-item';
      el.innerHTML = `
        <div class="reaction-time">${escapeHtml(r.time)}</div>
        <div class="reaction-user">${escapeHtml(r.username)}</div>
        <div class="reaction-message">${escapeHtml(r.message)}</div>
      `;
      container.appendChild(el);
    });
}

function loadRatings() { allRatings = []; }
function loadReactions() { allReactions = []; }

function setupButtons() {
  const btnStartProjection = document.getElementById('btnStartProjection');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnChangeSource = document.getElementById('btnChangeSource');
  const btnCloseRoom = document.getElementById('btnCloseRoom');
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
  if (btnCloseRoom) btnCloseRoom.onclick = closeRoom;

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

  window.onclick = function (event) {
    if (event.target.classList && event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };
}

// ==================== UTIL ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
