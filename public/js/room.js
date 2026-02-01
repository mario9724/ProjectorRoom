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

// REPRODUCTOR GLOBAL
let vjsPlayer = null;

// ==================== INICIALIZAR ====================\nwindow.addEventListener('load', async function() {
  console.log('🚀 Inicializando sala...');
  
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
    } else {
      alert('No se pudo cargar la sala');
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
  }
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
    addSystemMessage(`${data.username} se ha unido`);
  });

  socket.on('user-left', data => {
    currentUsers = data.users;
    updateUsersList();
    addSystemMessage(`${data.username} ha salido`);
  });

  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message);
  });

  socket.on('reaction-added', reaction => {
    allReactions.push(reaction);
    if (document.getElementById('modalReactions').style.display === 'block') {
      renderReactions();
    }
  });
}

function updateUsersList() {
  const names = currentUsers.map(u => u.username).join(', ');
  document.getElementById('usersNames').textContent = names;
}

// ==================== PROYECCIÓN (REPRODUCTOR EMBEBIDO) ====================
async function startProjection() {
  const sourceUrl = isHost ? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
  
  if (!sourceUrl) {
    alert('No hay fuente seleccionada. Ve a "Cambiar Fuente"');
    return;
  }

  // Intercambiar Backdrop por Video
  document.getElementById('roomBackdrop').style.display = 'none';
  document.getElementById('playerWrapper').style.display = 'block';

  // Inicializar Video.js solo una vez
  if (!vjsPlayer) {
    vjsPlayer = videojs('videoPlayer', {
      fluid: true,
      autoplay: true,
      plugins: {
        chromecast: { addButtonToControlBar: true },
        airPlay: { addButtonToControlBar: true }
      }
    });
  }

  // Cargar M3U8
  vjsPlayer.src({
    src: sourceUrl,
    type: 'application/x-mpegURL'
  });

  vjsPlayer.play().catch(() => {
    console.log("Autoplay bloqueado");
  });
}

// ==================== FUNCIONES RESTANTES (MODALES Y CHAT) ====================

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (message) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

function addChatMessage(user, msg) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `<strong>${escapeHtml(user)}:</strong> ${escapeHtml(msg)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemMessage(msg) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'message system';
  div.textContent = msg;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function copyInvite() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => alert('Enlace de invitación copiado'));
}

function changeSource() {
    document.getElementById('modalSource').style.display = 'block';
    loadSources();
}

async function loadSources() {
    const list = document.getElementById('sourcesList');
    list.innerHTML = 'Buscando fuentes...';
    const manifest = JSON.parse(roomData.manifest);
    const type = manifest.type || 'movie';
    const id = manifest.id;
    
    try {
        const url = `${PUBLIC_MANIFEST.replace('manifest.json', '')}stream/${type}/${id}.json`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.streams && data.streams.length > 0) {
            guestSources = data.streams;
            list.innerHTML = '';
            data.streams.forEach((stream, index) => {
                const div = document.createElement('div');
                div.className = 'source-item';
                div.innerHTML = `<strong>${stream.name || 'Fuente'}</strong><br><small>${stream.title || ''}</small>`;
                div.onclick = () => selectSource(index);
                list.appendChild(div);
            });
        } else {
            list.innerHTML = 'No se encontraron fuentes.';
        }
    } catch (e) {
        list.innerHTML = 'Error cargando fuentes.';
    }
}

function selectSource(index) {
    const stream = guestSources[index];
    localStorage.setItem('projectorroom_guest_source_' + roomId, stream.url);
    alert('Fuente seleccionada con éxito');
    document.getElementById('modalSource').style.display = 'none';
}

// Rating y Reacciones se mantienen similares a tu lógica original...
function setupUIListeners() {
  const btnStartProjection = document.getElementById('btnStartProjection');
  const btnCopyInvite = document.getElementById('btnCopyInvite');
  const btnChangeSource = document.getElementById('btnChangeSource');
  const btnCalifications = document.getElementById('btnCalifications');
  const btnReactions = document.getElementById('btnReactions');
  const btnSendChat = document.getElementById('btnSendChat');
  const btnSubmitReaction = document.getElementById('btnSubmitReaction');
  const btnCloseCalifications = document.getElementById('btnCloseCalifications');
  const btnCloseReactions = document.getElementById('btnCloseReactions');
  const btnCloseSource = document.getElementById('btnCloseSource');
  const chatInput = document.getElementById('chatInput');
  
  if (btnStartProjection) btnStartProjection.onclick = startProjection;
  if (btnCopyInvite) btnCopyInvite.onclick = copyInvite;
  if (btnChangeSource) btnChangeSource.onclick = changeSource;
  if (btnCalifications) btnCalifications.onclick = openCalificationsModal;
  if (btnReactions) btnReactions.onclick = openReactionsModal;
  if (btnSendChat) btnSendChat.onclick = sendChatMessage;
  if (btnSubmitReaction) btnSubmitReaction.onclick = submitReaction;
  if (btnCloseCalifications) btnCloseCalifications.onclick = () => document.getElementById('modalCalifications').style.display = 'none';
  if (btnCloseReactions) btnCloseReactions.onclick = () => document.getElementById('modalReactions').style.display = 'none';
  if (btnCloseSource) btnCloseSource.onclick = () => document.getElementById('modalSource').style.display = 'none';
  
  if (chatInput) {
    chatInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }
}

function openCalificationsModal() {
    document.getElementById('modalCalifications').style.display = 'block';
    // Lógica para cargar ratings...
}

function openReactionsModal() {
    document.getElementById('modalReactions').style.display = 'block';
    // Lógica para cargar reacciones...
}

function submitReaction() {
    const min = document.getElementById('reactionMinute').value;
    const msg = document.getElementById('reactionMessage').value;
    if (min && msg) {
        socket.emit('add-reaction', { roomId, username, timeMinutes: parseInt(min), message: msg });
        document.getElementById('reactionMessage').value = '';
    }
}

function setupRatingSystem() {
    document.querySelectorAll('.star').forEach(star => {
        star.onclick = function() {
            const val = this.getAttribute('data-value');
            socket.emit('add-rating', { roomId, username, rating: parseInt(val) });
            alert('¡Gracias por calificar!');
        };
    });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
