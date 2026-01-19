const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null, socket = null, username = '', roomData = null, isHost = false;
let allRatings =, allReactions =;

window.addEventListener('load', async function() {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  if (!roomId |

| roomId === 'sala') return window.location.href = '/';

  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    if (!data.success) throw new Error();
    roomData = data.projectorRoom;
  } catch (e) { window.location.href = '/'; }

  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  username = isHost? sessionStorage.getItem('projectorroom_host_username_' + roomId) : localStorage.getItem('projectorroom_username');

  if (!username &&!isHost) return showGuestConfig();
  initRoom();
});

function initRoom() {
  renderRoomUI();
  connectSocket();
  setupButtons();
}

function connectSocket() {
  socket = io();
  socket.on('connect', () => socket.emit('join-room', { roomId, username }));

  socket.on('load-history', data => {
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
    data.messages.forEach(msg => addChatMessage(msg.username, msg.message, false));
    allRatings = data.ratings;
    allReactions = data.reactions;
  });

  socket.on('chat-message', data => addChatMessage(data.username, data.message, false));
  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} entró`, true);
  });
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió`, true);
  });
  socket.on('rating-added', data => {
    const idx = allRatings.findIndex(r => r.username === data.username);
    idx!== -1? allRatings[idx] = data : allRatings.push(data);
    if (document.getElementById('modalCalifications').style.display === 'flex') renderAllRatings();
  });
  socket.on('reaction-added', data => {
    allReactions.push(data);
    if (document.getElementById('modalReactions').style.display === 'flex') renderAllReactions();
  });
}

function renderRoomUI() {
  const movieData = JSON.parse(roomData.manifest);
  document.getElementById('roomPosterSmall').src = movieData.poster |

| '';
  document.getElementById('roomTitle').textContent = `En la sala ${roomData.roomName}`;
  document.getElementById('roomBackdrop').src = movieData.backdrop |

| movieData.poster |
| '';
  document.getElementById('movieYear').textContent = `📅 ${movieData.year}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating}`;
  document.getElementById('movieOverview').textContent = movieData.overview;
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = isSystem? 'chat-message chat-system' : 'chat-message';
  msgEl.innerHTML = isSystem? message : `<span class="chat-username">${username}:</span> ${message}`;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function setupButtons() {
  document.getElementById('btnSendChat').onclick = () => {
    const input = document.getElementById('chatInput');
    if (input.value.trim()) {
      socket.emit('chat-message', { roomId, message: input.value.trim() });
      input.value = '';
    }
  };
  document.getElementById('btnStartProjection').onclick = () => {
    const source = (isHost |

| roomData.useHostSource)? roomData.sourceUrl : localStorage.getItem('projectorroom_guest_source_' + roomId);
    if (source) window.location.href = `vlc://${source}`;
  };
  document.getElementById('btnCopyInvite').onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => alert('Copiado'));
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
  
  document.getElementById('btnSubmitRating').onclick = () => {
    const selected = document.querySelectorAll('.star.selected').length;
    if (selected > 0) socket.emit('add-rating', { roomId, username, rating: selected });
  };
}

function updateUsersList(users) {
  const el = document.getElementById('usersNames');
  if (el) el.textContent = `${users.length} roomie(s): ${users.map(u => u.username).join(', ')}`;
}

function renderAllRatings() {
  const container = document.getElementById('ratingsContent');
  container.innerHTML = allRatings.map(r => `<div class="rating-item"><strong>${r.username}:</strong> ${'★'.repeat(r.rating)} (${r.rating}/10)</div>`).join('');
}

function renderAllReactions() {
  const container = document.getElementById('reactionsContent');
  container.innerHTML = allReactions.sort((a, b) => a.time.localeCompare(b.time)).map(r => `
    <div class="reaction-item"><strong>${r.time} - ${r.username}:</strong> ${r.message}</div>
  `).join('');
}
