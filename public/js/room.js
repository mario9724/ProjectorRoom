const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let player = null;
let allRatings = [];
let allReactions = [];

// ==================== INICIALIZACIÓN ====================
window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    roomData = data.projectorRoom;
  } catch (e) { window.location.href = '/'; return; }

  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  username = isHost ? sessionStorage.getItem('projectorroom_host_username_' + roomId) : localStorage.getItem('projectorroom_username');

  if (!username) { showGuestConfig(); } else { initRoom(); }
});

// ==================== REPRODUCCIÓN INCRUSTADA + CHROMECAST ====================
async function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) return;

  document.getElementById('roomBackdrop').style.display = 'none';
  document.getElementById('videoContainer').style.display = 'block';

  if (!player) {
    player = videojs('mainVideo', {
      fluid: true,
      controls: true,
      controlBar: {
        fullscreenToggle: true, // Permitimos el botón, pero no lo activamos nosotros
        pictureInPictureToggle: true
      },
      techOrder: ['chromecast', 'html5'],
      plugins: {
        chromecast: {
          addButtonToControlBar: true,
          requestSessionStrategy: 'instant'
        }
      }
    });

    // Forzar que el modo "FullWindow" sea falso al inicio
    player.on('ready', () => {
      player.fill(true); // Ocupar todo el hueco del contenedor
    });
  }

  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  player.play().catch(() => {
    console.log("Reproducción bloqueada, esperando acción del usuario.");
  });
}

// ==================== LÓGICA DE SALA ====================
function initRoom() {
  const movie = JSON.parse(roomData.manifest);
  document.getElementById('roomTitle').textContent = movie.title;
  document.getElementById('roomBackdrop').src = movie.backdrop || movie.poster;
  document.getElementById('roomPosterSmall').src = movie.poster;
  
  connectSocket();
  setupButtons();
}

function connectSocket() {
  socket = io();
  socket.on('connect', () => socket.emit('join-room', { roomId, username }));
  socket.on('user-joined', d => updateUsersList(d.users));
  socket.on('chat-message', d => addChatMessage(d.username, d.message));
  socket.on('rating-added', d => { allRatings.push(d); renderRatings(); });
}

function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('btnCopyInvite').onclick = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Enlace copiado');
  };
  
  // Modales
  document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display='flex';
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display='none';
  // ... resto de eventos ...
}

function addChatMessage(user, msg) {
  const cont = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.innerHTML = `<strong>${user}:</strong> ${msg}`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  if (input.value.trim()) {
    socket.emit('chat-message', { roomId, message: input.value });
    input.value = '';
  }
}

function showGuestConfig() {
  // Lógica de login de invitado (simplificada)
  const name = prompt("¿Cómo te llamas?");
  if (name) {
    localStorage.setItem('projectorroom_username', name);
    location.reload();
  }
}
