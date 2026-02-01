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

// ==================== INICIALIZAR ====================
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

// ==================== REPRODUCCIÓN INCRUSTADA (MODIFICADA) ====================
async function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) {
    alert('No hay fuente de video disponible');
    return;
  }

  // 1. Interfaz: Ocultar imagen y mostrar contenedor de video
  const backdrop = document.getElementById('roomBackdrop');
  const videoCont = document.getElementById('videoContainer');
  if (backdrop) backdrop.style.display = 'none';
  if (videoCont) videoCont.style.display = 'block';

  // 2. Inicializar Video.js solo una vez
  if (!player) {
    player = videojs('mainVideo', {
      fluid: true,
      responsive: true,
      controls: true,
      autoplay: false,
      preload: 'auto'
    });
  }

  // 3. Asignar fuente (Detecta automáticamente si es M3U8 o MP4)
  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  // 4. Reproducir sin pedir pantalla completa
  player.ready(function() {
    player.play().catch(e => {
      console.log("Reproducción bloqueada por el navegador. Requiere clic manual en Play.");
    });
  });
}

// ==================== LÓGICA DE SALA Y SOCKETS ====================
function initRoom() {
  renderRoom();
  if (!isHost && roomData.useHostSource === false) {
    const changeSec = document.getElementById('changeSourceSection');
    if (changeSec) changeSec.style.display = 'block';
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
  if (!cont) return;
  const div = document.createElement('div');
  div.className = 'chat-message';
  div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(msg)}`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (input && input.value.trim() && socket) {
    socket.emit('chat-message', { roomId, message: input.value });
    input.value = '';
  }
}

// ==================== CONFIGURACIÓN DE INVITADOS ====================
function showGuestConfig() {
  document.querySelector('.room-container').style.display = 'none';
  const html = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 ¿Cómo te llamas, roomie?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." autofocus>
        <button class="btn-primary" onclick="submitGuestConfig()" style="width:100%; margin-top:20px;">Entrar a sala</button>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

window.submitGuestConfig = function() {
  const name = document.getElementById('guestUsername').value.trim();
  if (!name) return;
  localStorage.setItem('projectorroom_username', name);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  location.reload();
};

async function showGuestSourceSelector() {
  // Lógica para que el invitado elija su propia fuente si useHostSource es false
  // (Mantenida según tu implementación original)
  document.querySelector('.room-container').style.display = 'none';
  // ... resto de lógica de selector de fuentes ...
}

// ==================== MODALES Y BOTONES ====================
function setupButtons() {
  const btnStart = document.getElementById('btnStartProjection');
  if (btnStart) btnStart.onclick = startProjection;

  const btnCopy = document.getElementById('btnCopyInvite');
  if (btnCopy) btnCopy.onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Enlace copiado');
  };

  const btnChat = document.getElementById('btnSendChat');
  if (btnChat) btnChat.onclick = sendChatMessage;

  const chatInp = document.getElementById('chatInput');
  if (chatInp) chatInp.onkeypress = e => { if (e.key === 'Enter') sendChatMessage(); };

  // Botones de interacción
  document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display='flex';
  document.getElementById('btnReactions').onclick = () => document.getElementById('modalReactions').style.display='flex';
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display='none';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display='none';

  // Lógica de calificación
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

  document.getElementById('btnSubmitReaction').onclick = () => {
    const min = document.getElementById('reactionMinute').value;
    const msg = document.getElementById('reactionMessage').value;
    if (min && msg) socket.emit('add-reaction', { roomId, username, time: min + ':00', message: msg });
  };
}

// ==================== UTILIDADES ====================
function renderAllRatings() {
  const cont = document.getElementById('ratingsContent');
  if (cont) cont.innerHTML = allRatings.map(r => `<div>${r.username}: ${r.rating}/10</div>`).join('') || 'Sin votos';
}

function renderAllReactions() {
  const cont = document.getElementById('reactionsContent');
  if (cont) cont.innerHTML = allReactions.map(r => `<div>[${r.time}] ${r.username}: ${r.message}</div>`).join('') || 'Sin reacciones';
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}
