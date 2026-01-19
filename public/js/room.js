const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST =
  'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;

let tmdbIds = null;      // { tmdbId, type, imdbId }
let tmdbDetails = null;  // TMDB details response

let guestSources = [];
let guestSelectedSourceIndex = null;

let userRating = null;
let allRatings = [];
let allReactions = [];
let currentUsers = [];

window.addEventListener('load', async () => {
  console.log('🚀 Inicializando sala...');

  const parts = window.location.pathname.split('/');
  roomId = parts[parts.length - 1];

  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }

  try {
    await loadRoomData();
    await loadTmdbDetails();
  } catch (err) {
    console.error('❌ Error cargando sala:', err);
    return;
  }

  isHost = sessionStorage.getItem(`projectorroom_is_host_${roomId}`) === 'true';

  if (isHost) {
    username = sessionStorage.getItem(`projectorroom_host_username_${roomId}`) || '';
    if (!username) {
      alert('Error de sesión. Crea la sala de nuevo.');
      window.location.href = '/';
      return;
    }
    initRoom();
    return;
  }

  const alreadyConfigured = localStorage.getItem(`projectorroom_guest_configured_${roomId}`) === 'true';
  if (!alreadyConfigured) {
    showGuestConfig();
    return;
  }

  username = localStorage.getItem('projectorroom_username') || '';
  if (!username) {
    localStorage.removeItem(`projectorroom_guest_configured_${roomId}`);
    showGuestConfig();
    return;
  }

  if (roomData.useHostSource === false) {
    const hasSelectedSource = localStorage.getItem(`projectorroom_guest_source_${roomId}`);
    if (!hasSelectedSource) {
      await showGuestSourceSelector();
      return;
    }
  }

  initRoom();
});

// ==================== API SALA ====================
async function loadRoomData() {
  const res = await fetch(`/api/projectorrooms/${encodeURIComponent(roomId)}`, { cache: 'no-store' });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.error('API no devolvió JSON:', text.slice(0, 200));
    alert('La API no devolvió JSON (probable error del servidor).');
    window.location.href = '/';
    throw new Error('API not JSON');
  }

  const data = await res.json();
  if (!data.success) {
    alert(data.message || 'Sala no encontrada');
    window.location.href = '/';
    throw new Error('Room not found');
  }

  roomData = data.projectorRoom;
  roomData.useHostSource = !!roomData.useHostSource;

  roomData.messages = Array.isArray(roomData.messages) ? roomData.messages : [];
  roomData.ratings = Array.isArray(roomData.ratings) ? roomData.ratings : [];
  roomData.reactions = Array.isArray(roomData.reactions) ? roomData.reactions : [];

  // Parsear manifest como IDs
  if (typeof roomData.manifest === 'string') {
    tmdbIds = JSON.parse(roomData.manifest);
  } else {
    tmdbIds = roomData.manifest;
  }

  if (!tmdbIds || !tmdbIds.tmdbId || !tmdbIds.type || !tmdbIds.imdbId) {
    throw new Error('La sala no contiene tmdbId/type/imdbId en manifest');
  }
}

// ==================== TMDB DETAILS ====================
async function loadTmdbDetails() {
  const tmdbType = (tmdbIds.type === 'series' || tmdbIds.type === 'tv') ? 'tv' : 'movie';
  const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbIds.tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('No se pudo cargar la información de TMDB');
  }

  tmdbDetails = await res.json();
}

// ==================== INIT ====================
function initRoom() {
  renderRoom();

  if (!isHost && roomData.useHostSource === false) {
    const changeSourceSection = document.getElementById('changeSourceSection');
    if (changeSourceSection) changeSourceSection.style.display = 'block';
  }

  connectSocket();
  setupButtons();

  allRatings = roomData.ratings;
  allReactions = roomData.reactions;

  // Mensajes históricos (si tu backend los manda)
  if (roomData.messages.length) {
    roomData.messages.forEach(m => addChatMessage(m.username || 'Roomie', m.message || '', false));
  }
}

// ==================== RENDER (DESDE TMDB) ====================
function renderRoom() {
  const title = tmdbDetails?.title || tmdbDetails?.name || 'Título';
  const posterPath = tmdbDetails?.poster_path;
  const backdropPath = tmdbDetails?.backdrop_path;
  const overview = tmdbDetails?.overview || 'Sin descripción disponible';

  const year = (tmdbDetails?.release_date || tmdbDetails?.first_air_date || '').substring(0, 4) || 'N/A';
  const rating = tmdbDetails?.vote_average ? tmdbDetails.vote_average.toFixed(1) : 'N/A';
  const typeLabel = tmdbDetails?.title ? 'Película' : 'Serie';

  const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '';
  const backdropUrl = backdropPath ? `https://image.tmdb.org/t/p/original${backdropPath}` : posterUrl;

  const posterEl = document.getElementById('roomPosterSmall');
  if (posterEl) posterEl.src = posterUrl;

  const titleEl = document.getElementById('roomTitle');
  if (titleEl) titleEl.textContent = `Proyectando "${title}" en ${roomData.roomName} de ${roomData.hostUsername}`;

  const backdropEl = document.getElementById('roomBackdrop');
  if (backdropEl) backdropEl.src = backdropUrl;

  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const ratingEl = document.getElementById('movieRating');
  const overviewEl = document.getElementById('movieOverview');

  if (yearEl) yearEl.textContent = year;
  if (typeEl) typeEl.textContent = typeLabel;
  if (ratingEl) ratingEl.textContent = `⭐ ${rating}`;
  if (overviewEl) overviewEl.textContent = overview;
}

// ==================== SOCKET ====================
function connectSocket() {
  socket = window.io();

  socket.on('connect', () => {
    socket.emit('join-room', { roomId, username });
  });

  socket.on('user-joined', (data) => {
    updateUsersList((data && data.users) || []);
    if (data && data.user && data.user.username) addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });

  socket.on('user-left', (data) => {
    updateUsersList((data && data.users) || []);
    if (data && data.username) addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });

  socket.on('chat-message', (data) => {
    addChatMessage(data.username || 'Roomie', data.message || '', false);
  });

  socket.on('rating-added', (data) => {
    allRatings.push(data);
    const modal = document.getElementById('modalCalifications');
    if (modal && modal.style.display === 'flex') renderAllRatings();
  });

  socket.on('reaction-added', (data) => {
    allReactions.push(data);
    const modal = document.getElementById('modalReactions');
    if (modal && modal.style.display === 'flex') renderAllReactions();
  });
}

function updateUsersList(users) {
  currentUsers = users;
  const el = document.getElementById('usersNames');
  if (!el) return;

  if (!users.length) {
    el.textContent = 'No hay usuarios';
    return;
  }
  const names = users.map(u => u.username).filter(Boolean).join(', ');
  el.textContent = `${users.length} roomies en la sala: ${names}`;
}

// ==================== CHAT ====================
function addChatMessage(from, message, isSystem) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const el = document.createElement('div');
  el.className = isSystem ? 'chat-message chat-system' : 'chat-message';

  if (isSystem) {
    el.textContent = message;
  } else {
    el.innerHTML = `<span class="chat-username">${escapeHtml(from)}:</span> ${escapeHtml(message)}`;
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (!input) return;

  const msg = input.value.trim();
  if (!msg) return;

  socket.emit('chat-message', { roomId, message: msg });
  input.value = '';
}

// ==================== PROYECCIÓN ====================
function startProjection() {
  let sourceUrl = null;

  if (isHost || roomData.useHostSource) {
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

function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomUrl).then(
      () => alert('Enlace copiado'),
      () => prompt('Copia este enlace:', roomUrl)
    );
  } else {
    prompt('Copia este enlace:', roomUrl);
  }
}

function changeSource() {
  if (isHost) {
    alert('Como anfitrión, crea una sala nueva para cambiar la fuente');
    return;
  }
  localStorage.removeItem(`projectorroom_guest_source_${roomId}`);
  window.location.reload();
}

// ==================== CALIFICACIONES ====================
function openCalificationsModal() {
  const modal = document.getElementById('modalCalifications');
  setupRatingStars();
  renderAllRatings();
  modal.style.display = 'flex';
}

function setupRatingStars() {
  const stars = document.querySelectorAll('.star');
  let selectedRating = userRating || 0;

  const paint = () => stars.forEach((s, i) => s.classList.toggle('selected', i < selectedRating));
  paint();

  stars.forEach(star => {
    star.onclick = () => {
      selectedRating = parseInt(star.dataset.value, 10);
      paint();
    };
  });

  const btn = document.getElementById('btnSubmitRating');
  if (btn) {
    btn.onclick = () => {
      if (!selectedRating) return alert('Selecciona una calificación');
      userRating = selectedRating;
      socket.emit('add-rating', { roomId, username, rating: selectedRating });
    };
  }
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  if (!container) return;

  container.innerHTML = '';

  if (!allRatings.length) {
    container.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Aún no hay calificaciones</p>';
    return;
  }

  allRatings.forEach(r => {
    const el = document.createElement('div');
    el.className = 'rating-item';
    const rate = Number(r.rating) || 0;
    el.innerHTML = `<strong>${escapeHtml(r.username || 'Roomie')}:</strong> ${'⭐'.repeat(rate)}${'☆'.repeat(Math.max(0, 10 - rate))} (${rate}/10)`;
    container.appendChild(el);
  });
}

function closeCalificationsModal() {
  const modal = document.getElementById('modalCalifications');
  if (modal) modal.style.display = 'none';
}

// ==================== REACCIONES ====================
function openReactionsModal() {
  renderAllReactions();
  const modal = document.getElementById('modalReactions');
  if (modal) modal.style.display = 'flex';
}

function submitReaction() {
  const minute = document.getElementById('reactionMinute');
  const msg = document.getElementById('reactionMessage');
  if (!minute || !msg) return;

  const minuteNum = pars
