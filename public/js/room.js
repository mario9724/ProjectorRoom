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

// Variable para el reproductor
let vjsPlayer = null;

// ==================== INICIALIZAR ====================
window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  username = sessionStorage.getItem('projectorroom_host_username_' + roomId) || '';
  
  if (!username) {
    username = prompt('Ingresa tu nombre para entrar a la sala:') || 'Invitado' + Math.floor(Math.random() * 1000);
    sessionStorage.setItem('projectorroom_host_username_' + roomId, username);
  }

  await loadRoomData();
  setupSocket();
  setupUIListeners();
  setupRatingSystem();
});

async function loadRoomData() {
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    if (data.success) {
      roomData = data.projectorRoom;
      updateUIWithRoomData();
    }
  } catch (error) { console.error('Error cargando sala:', error); }
}

function updateUIWithRoomData() {
  const manifest = JSON.parse(roomData.manifest);
  document.getElementById('roomTitle').textContent = manifest.name || 'Sin título';
  document.getElementById('roomPosterSmall').src = manifest.poster || '';
  document.getElementById('roomBackdrop').src = manifest.background || '';
  document.getElementById('movieYear').textContent = manifest.releaseInfo || '';
  document.getElementById('movieType').textContent = roomData.projectorType === 'public' ? '🎬 Público' : '🔒 Privado';
  document.getElementById('movieRating').textContent = '⭐ ' + (manifest.imdbRating || 'N/A');
  document.getElementById('movieOverview').textContent = manifest.description || '';
}

function setupSocket() {
  socket = io();
  socket.emit('join-room', { roomId, username });

  socket.on('user-joined', data => {
    currentUsers = data.users;
    updateUsersList();
    addChatMessage('Sistema', `${data.username} se ha unido`, true);
  });

  socket.on('user-left', data => {
    currentUsers = data.users;
    updateUsersList();
    addChatMessage('Sistema', `${data.username} ha salido`, true);
  });

  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message);
  });
}

function updateUsersList() {
  const names = currentUsers.map(u => u.username).join(', ');
  document.getElementById('usersNames').textContent = names;
}

// ==================== MODIFICACIÓN: PROYECTAR EMBEBIDO ====================
async function startProjection() {
  const sourceUrl = isHost ? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
  
  if (!sourceUrl) {
    alert('No hay fuente de video seleccionada.');
    return;
  }

  // 1. Ocultar imagen y mostrar reproductor
  document.getElementById('roomBackdrop').style.display = 'none';
  document.getElementById('playerWrapper').style.display = 'block';

  // 2. Inicializar Video.js si no existe
  if (!vjsPlayer) {
    vjsPlayer = videojs('videoPlayer', {
      fluid: true,
      plugins: {
        chromecast: { addButtonToControlBar: true }
      }
    });
  }

  // 3. Cargar URL
  vjsPlayer.src({
    src: sourceUrl,
    type: 'application/x-mpegURL'
  });

  vjsPlayer.play().catch(e => console.log("Autoplay bloqueado"));
}

// ==================== RESTO DE TUS FUNCIONES (Sin cambios) ====================
function setupUIListeners() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Enlace copiado');
  };
  document.getElementById('btnChangeSource').onclick = () => {
    document.getElementById('modalSource').style.display = 'block';
    loadSources();
  };
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('chatInput').onkeypress = (e) => { if(e.key === 'Enter') sendChatMessage(); };
  
  // Cerrar modales
  document.getElementById('btnCloseSource').onclick = () => document.getElementById('modalSource').style.display = 'none';
  document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'block';
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'none';
  document.getElementById('btnReactions').onclick = () => document.getElementById('modalReactions').style.display = 'block';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display = 'none';
}

async function loadSources() {
  const list = document.getElementById('sourcesList');
  list.innerHTML = 'Buscando...';
  const manifest = JSON.parse(roomData.manifest);
  try {
    const res = await fetch(`${PUBLIC_MANIFEST.replace('manifest.json', '')}stream/${manifest.type}/${manifest.id}.json`);
    const data = await res.json();
    list.innerHTML = '';
    data.streams.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'source-item';
      d.innerHTML = `<strong>${s.name}</strong><br>${s.title}`;
      d.onclick = () => {
        localStorage.setItem('projectorroom_guest_source_' + roomId, s.url);
        document.getElementById('modalSource').style.display = 'none';
        alert('Fuente guardada');
      };
      list.appendChild(d);
    });
  } catch(e) { list.innerHTML = 'Error'; }
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (input.value.trim()) {
    socket.emit('chat-message', { roomId, message: input.value });
    input.value = '';
  }
}

function addChatMessage(user, msg, isSystem = false) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = isSystem ? 'message system' : 'message';
  div.innerHTML = `<strong>${user}:</strong> ${msg}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function setupRatingSystem() {
  document.querySelectorAll('.star').forEach(s => {
    s.onclick = () => alert('Nota guardada');
  });
}
