// public/js/room.js

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

// ==================== INICIALIZACIÓN ====================
window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId |

| roomId === 'sala') {
    window.location.href = '/';
    return;
  }
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    if (!data.success) throw new Error();
    roomData = data.projectorRoom;
  } catch (error) {
    alert('Sala no encontrada');
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    if (!username) { window.location.href = '/'; return; }
    initRoom();
  } else {
    const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    if (alreadyConfigured) {
      username = localStorage.getItem('projectorroom_username');
      if (roomData.useHostSource === false &&!localStorage.getItem('projectorroom_guest_source_' + roomId)) {
        showGuestSourceSelector();
        return;
      }
      initRoom();
    } else {
      showGuestConfig();
    }
  }
});

function initRoom() {
  renderRoomUI();
  if (!isHost && roomData.useHostSource === false) {
    document.getElementById('changeSourceSection').style.display = 'block';
  }
  connectSocket();
  setupButtons();
}

// ==================== COMUNICACIÓN (SOCKET.IO) ====================
function connectSocket() {
  socket = io(); // Se conecta automáticamente al host actual [3]
  
  socket.on('connect', () => {
    socket.emit('join-room', { roomId, username });
  });

  // NUEVO: Carga historial persistente desde PostgreSQL
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

// ==================== INTERFAZ Y EVENTOS ====================
function renderRoomUI() {
  const movieData = JSON.parse(roomData.manifest);
  document.getElementById('roomPosterSmall').src = movieData.poster |

| '';
  document.getElementById('roomTitle').textContent = `Proyectando ${movieData.title} en ${roomData.roomName}`;
  document.getElementById('roomBackdrop').src = movieData.backdrop |

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
  const source = (isHost |

| roomData.useHostSource)? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
  if (source) window.location.href = `vlc://${source}`; // Protocolo VLC [4, 2]
}

function setupButtons() {
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  document.getElementById('chatInput').onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => alert('✅ Enlace copiado'));
  };
  document.getElementById('btnCalifications').onclick = () => {
    renderAllRatings();
    document.getElementById('modalCalifications').style.display = 'flex';
  };
  document.getElementById('btnReactions').onclick = () => {
    renderAllReactions();
    document.getElementById('modalReactions').style.display = 'flex';
  };
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'none';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display = 'none';
  
  // Guardar Calificación
  document.getElementById('btnSubmitRating').onclick = () => {
    const selected = document.querySelectorAll('.star.selected').length;
    if (selected === 0) return alert('Elige una nota');
    socket.emit('add-rating', { roomId, username, rating: selected });
    alert('✅ Calificación guardada');
  };

  // Enviar Reacción
  document.getElementById('btnSubmitReaction').onclick = () => {
    const minute = document.getElementById('reactionMinute').value.trim();
    const message = document.getElementById('reactionMessage').value.trim();
    if (!minute ||!message) return alert('Faltan campos');
    socket.emit('add-reaction', { roomId, username, time: `${minute}:00`, message });
    document.getElementById('reactionMinute').value = '';
    document.getElementById('reactionMessage').value = '';
  };
}

// ==================== UTILIDADES ====================
function updateUsersList(users) {
  const el = document.getElementById('usersNames');
  if (el) el.textContent = users.length === 1? `1 roomie: ${users.username}` : `${users.length} roomies: ${users.map(u => u.username).join(', ')}`;
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = allRatings.length === 0? '<p class="loading">Aún no hay calificaciones</p>' : '';
  allRatings.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rating-item';
    item.innerHTML = `<strong>${escapeHtml(r.username)}:</strong> ${'★'.repeat(r.rating)}${'☆'.repeat(10 - r.rating)} (${r.rating}/10)`;
    container.appendChild(item);
  });
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = allReactions.length === 0? '<p class="loading">Aún no hay reacciones</p>' : '';
  allReactions.sort((a, b) => parseInt(a.time) - parseInt(b.time)).forEach(r => {
    const item = document.createElement('div');
    item.className = 'reaction-item';
    item.innerHTML = `<div class="reaction-time">⏱️ ${escapeHtml(r.time)}</div><div class="reaction-user">${escapeHtml(r.username)}</div><div class="reaction-message">${escapeHtml(r.message)}</div>`;
    container.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
