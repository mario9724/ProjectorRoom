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
let player = null; // Instancia de Video.js

// ==================== INICIALIZACIÓN COMPLETA ====================
window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId || roomId === 'sala') {
    window.location.href = '/';
    return;
  }
  
  try {
    await loadRoomData();
  } catch (error) {
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    if (!username) { window.location.href = '/'; return; }
    initRoom();
  } else {
    const configured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    if (configured) {
      username = localStorage.getItem('projectorroom_username');
      if (roomData.useHostSource === false && !localStorage.getItem('projectorroom_guest_source_' + roomId)) {
        showGuestSourceSelector();
        return;
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
  if (!data.success) throw new Error();
  roomData = data.projectorRoom;
}

// ==================== LÓGICA DE REPRODUCCIÓN INTEGRADA ====================
function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) { alert('No hay fuente'); return; }

  // Cambiar Interfaz: Ocultar Backdrop y mostrar Video
  document.getElementById('backdropWrapper').style.display = 'none';
  document.getElementById('videoWrapper').style.display = 'block';

  if (!player) {
    player = videojs('mainVideo');
  }

  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  player.ready(function() {
    player.play().catch(() => {
      console.log("Esperando interacción del usuario...");
    });
  });
}

// ==================== TODA TU LÓGICA ORIGINAL RESTAURADA ====================

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
  if (input.value.trim() && socket) {
    socket.emit('chat-message', { roomId, message: input.value });
    input.value = '';
  }
}

function copyInvite() {
  navigator.clipboard.writeText(window.location.origin + '/sala/' + roomId);
  alert('Enlace de invitación copiado');
}

// LÓGICA DE INVITADOS
function showGuestConfig() {
  document.querySelector('.room-container').style.display = 'none';
  let configHTML = `<div class="guest-config-container"><div class="step-card">
    <h1>👋 Ey roomie, ¿cómo te llamas?</h1>
    <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus>
    <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 20px; width:100%">Entrar</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', configHTML);
}

window.submitGuestConfig = function() {
  const name = document.getElementById('guestUsername').value.trim();
  if (!name) return;
  username = name;
  localStorage.setItem('projectorroom_username', name);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  location.reload();
};

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
    if (userRating) socket.emit('add-rating', { roomId, username, rating: userRating });
  };
}

function renderAllRatings() {
  const cont = document.getElementById('ratingsContent');
  cont.innerHTML = allRatings.map(r => `<div>${r.username}: ${r.rating}/10</div>`).join('') || 'Sin votos';
}

function openReactionsModal() {
  document.getElementById('modalReactions').style.display = 'flex';
  renderAllReactions();
}

function submitReaction() {
  const min = document.getElementById('reactionMinute').value;
  const msg = document.getElementById('reactionMessage').value;
  if (min && msg) socket.emit('add-reaction', { roomId, username, time: min + ':00', message: msg });
}

function renderAllReactions() {
  const cont = document.getElementById('reactionsContent');
  cont.innerHTML = allReactions.map(r => `<div>[${r.time}] ${r.username}: ${r.message}</div>`).join('') || 'Sin reacciones';
}

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  document.getElementById('btnCalifications').onclick = openCalificationsModal;
  document.getElementById('btnReactions').onclick = openReactionsModal;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnSubmitReaction').onclick = submitReaction;
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'none';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display = 'none';
  document.getElementById('chatInput').onkeypress = e => { if (e.key === 'Enter') sendChatMessage(); };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
