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
let player = null;

// ==================== INICIALIZAR (LÓGICA ORIGINAL) ====================
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

// ==================== REPRODUCCIÓN INCRUSTADA ====================
function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) { alert('No hay fuente'); return; }

  // Cambiar imagen por video en el mismo hueco
  document.getElementById('roomBackdrop').style.display = 'none';
  document.getElementById('videoContainer').style.display = 'block';

  if (!player) {
    player = videojs('mainVideo', {
      fluid: true, // Se adapta al tamaño del contenedor
      aspectRatio: '16:9'
    });
  }

  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  player.ready(function() {
    player.play().catch(err => {
      console.log("Reproducción automática bloqueada, esperando clic.");
    });
  });
}

// ==================== FUNCIONES DE SALA (ORIGINALES) ====================
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
  socket.on('user-joined', d => updateUsersList(d.users));
  socket.on('user-left', d => updateUsersList(d.users));
  socket.on('chat-message', d => addChatMessage(d.username, d.message));
  socket.on('chat-history', d => d.messages.forEach(m => addChatMessage(m.username, m.message)));
  socket.on('rating-added', d => { allRatings.push(d); renderAllRatings(); });
  socket.on('reaction-added', d => { allReactions.push(d); renderAllReactions(); });
}

function updateUsersList(users) {
  const el = document.getElementById('usersNames');
  if (el) el.textContent = users.map(u => u.username).join(', ');
}

function addChatMessage(user, msg) {
  const cont = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(msg)}`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (input.value.trim() && socket) {
    socket.emit('chat-message', { roomId, message: input.value });
    input.value = '';
  }
}

// LÓGICA DE INVITADOS (Tu código original)
function showGuestConfig() {
  document.querySelector('.room-container').style.display = 'none';
  const html = `<div class="guest-config-container"><div class="step-card">
    <h1>👋 ¿Cómo te llamas?</h1>
    <input type="text" id="guestUsername" placeholder="Nombre..." autofocus>
    <button class="btn-primary" onclick="submitGuestConfig()" style="width:100%; margin-top:20px;">Entrar</button>
  </div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

window.submitGuestConfig = function() {
  const name = document.getElementById('guestUsername').value.trim();
  if (name) {
    username = name;
    localStorage.setItem('projectorroom_username', name);
    localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
    location.reload();
  }
};

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnCopyInvite').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Copiado');
  };
  document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display='flex';
  document.getElementById('btnReactions').onclick = () => document.getElementById('modalReactions').style.display='flex';
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display='none';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display='none';
  document.getElementById('chatInput').onkeypress = e => { if (e.key === 'Enter') sendChatMessage(); };
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

// Renderizadores de modales (vaciados para brevedad, pero funcionales con tus sockets)
function renderAllRatings() { document.getElementById('ratingsContent').innerHTML = allRatings.map(r => `<div>${r.username}: ${r.rating}</div>`).join(''); }
function renderAllReactions() { document.getElementById('reactionsContent').innerHTML = allReactions.map(r => `<div>${r.username}: ${r.message}</div>`).join(''); }
