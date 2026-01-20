const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let allRatings =; // Corregido: inicializado como array vacío
let allReactions =; // Corregido: inicializado como array vacío

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
    if (!data.success) throw new Error("Sala no encontrada");
    roomData = data.projectorRoom;
  } catch (error) {
    console.error("Error cargando sala:", error);
    alert('Error: Sala no encontrada');
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  username = isHost? sessionStorage.getItem('projectorroom_host_username_' + roomId) : localStorage.getItem('projectorroom_username');

  if (!username &&!isHost) {
    // Si no hay usuario ni es host, mostrar config de invitado (asumiendo que tienes esa función)
    if (typeof showGuestConfig === 'function') showGuestConfig();
    return;
  }
  
  initRoom();
});

function initRoom() {
  renderRoomUI();
  connectSocket();
  setupButtons();
}

// ==================== COMUNICACIÓN ====================
function connectSocket() {
  socket = io();
  
  socket.on('connect', () => {
    socket.emit('join-room', { roomId, username });
  });

  // Cargar historial persistente desde PostgreSQL
  socket.on('load-history', data => {
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = ''; 
    
    if (data.messages) {
        data.messages.forEach(msg => addChatMessage(msg.username, msg.message, false));
    }
    allRatings = data.ratings ||;
    allReactions = data.reactions ||;
    console.log('📚 Historial sincronizado');
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

// ==================== INTERFAZ ====================
function renderRoomUI() {
  if (!roomData) return;
  const movieData = JSON.parse(roomData.manifest);
  
  document.getElementById('roomPosterSmall').src = movieData.poster |

| '';
  document.getElementById('roomTitle').textContent = `En la sala ${roomData.roomName}`;
  document.getElementById('roomBackdrop').src = movieData.backdrop |

| movieData.poster |
| '';
  
  document.getElementById('movieYear').textContent = `📅 ${movieData.year |

| 'N/A'}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type |

| 'N/A'}`;
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

function setupButtons() {
  const btnSend = document.getElementById('btnSendChat');
  if (btnSend) btnSend.onclick = sendChatMessage;

  const inputChat = document.getElementById('chatInput');
  if (inputChat) {
      inputChat.onkeypress = (e) => { if (e.key === 'Enter') sendChatMessage(); };
  }

  document.getElementById('btnStartProjection').onclick = () => {
    const source = (isHost |

| roomData.useHostSource)? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
    if (source) window.location.href = `vlc://${source}`;
  };

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
}

function updateUsersList(users) {
  const el = document.getElementById('usersNames');
  if (el) el.textContent = `${users.length} roomie(s): ${users.map(u => u.username).join(', ')}`;
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  if (!container) return;
  container.innerHTML = allRatings.map(r => `
    <div class="rating-item"><strong>${escapeHtml(r.username)}:</strong> ${'★'.repeat(r.rating)} (${r.rating}/10)</div>
  `).join('');
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  if (!container) return;
  container.innerHTML = allReactions.sort((a, b) => a.time.localeCompare(b.time)).map(r => `
    <div class="reaction-item"><strong>${escapeHtml(r.time)} - ${escapeHtml(r.username)}:</strong> ${escapeHtml(r.message)}</div>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
