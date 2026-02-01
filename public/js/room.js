const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
let roomId = null, socket = null, username = '', roomData = null, isHost = false;
let player = null, userRating = null, allRatings = [], allReactions = [];

window.addEventListener('load', async () => {
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    if (!data.success) throw new Error();
    roomData = data.projectorRoom;
    
    isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
    username = isHost ? sessionStorage.getItem('projectorroom_host_username_' + roomId) : localStorage.getItem('projectorroom_username');

    if (!username) {
      showGuestConfig();
    } else {
      initRoom();
    }
  } catch (e) {
    window.location.href = '/';
  }
});

function initRoom() {
  renderRoomInfo();
  connectSocket();
  setupEventListeners();
}

function renderRoomInfo() {
  const movie = JSON.parse(roomData.manifest);
  document.getElementById('roomTitle').textContent = movie.title || 'Sin título';
  document.getElementById('roomPosterSmall').src = movie.poster || '';
  document.getElementById('roomBackdrop').src = movie.backdrop || movie.poster || '';
  document.getElementById('movieYear').textContent = movie.year ? `📅 ${movie.year}` : '';
  document.getElementById('movieType').textContent = movie.type === 'movie' ? '🎬 Película' : '📺 Serie';
  document.getElementById('movieRating').textContent = movie.rating ? `⭐ ${movie.rating}` : '';
  document.getElementById('movieOverview').textContent = movie.overview || '';
}

async function startProjection() {
  let sourceUrl = (isHost || roomData.useHostSource) 
    ? roomData.sourceUrl 
    : localStorage.getItem('projectorroom_guest_source_' + roomId);

  if (!sourceUrl) return alert("No hay fuente disponible");

  document.getElementById('roomBackdrop').style.display = 'none';
  document.getElementById('videoContainer').style.display = 'block';

  if (!player) {
    player = videojs('mainVideo', {
      fluid: true,
      controls: true,
      autoplay: false,
      preload: 'auto',
      controlBar: { fullscreenToggle: true },
      plugins: { chromecast: { addButtonToControlBar: true } }
    });
  }

  player.src({
    src: sourceUrl,
    type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
  });

  player.play().catch(() => console.log("Clic manual requerido"));
}

function connectSocket() {
  socket = io();
  socket.emit('join-room', { roomId, username });

  socket.on('user-joined', d => {
    document.getElementById('usersNames').textContent = d.users.map(u => u.username).join(', ');
  });

  socket.on('chat-message', d => {
    const cont = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<strong>${d.username}:</strong> ${d.message}`;
    cont.appendChild(div);
    cont.scrollTop = cont.scrollHeight;
  });

  socket.on('rating-added', d => { allRatings.push(d); renderRatings(); });
  socket.on('reaction-added', d => { allReactions.push(d); renderReactions(); });
}

function setupEventListeners() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnSendChat').onclick = () => {
    const inp = document.getElementById('chatInput');
    if (inp.value.trim()) {
      socket.emit('chat-message', { roomId, message: inp.value });
      inp.value = '';
    }
  };

  // Estrellas
  document.querySelectorAll('.star').forEach(s => {
    s.onclick = function() {
      userRating = this.dataset.value;
      document.querySelectorAll('.star').forEach(st => st.classList.toggle('selected', st.dataset.value <= userRating));
    };
  });

  document.getElementById('btnSubmitRating').onclick = () => {
    if (userRating) socket.emit('add-rating', { roomId, username, rating: userRating });
  };

  document.getElementById('btnSubmitReaction').onclick = () => {
    const m = document.getElementById('reactionMinute').value;
    const msg = document.getElementById('reactionMessage').value;
    if (m && msg) socket.emit('add-reaction', { roomId, username, time: m+':00', message: msg });
  };

  // Modales
  document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'flex';
  document.getElementById('btnReactions').onclick = () => document.getElementById('modalReactions').style.display = 'flex';
  document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'none';
  document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display = 'none';
}

function showGuestConfig() {
  const name = prompt("¿Tu nombre?");
  if (name) {
    localStorage.setItem('projectorroom_username', name);
    location.reload();
  }
}

function renderRatings() { document.getElementById('ratingsContent').innerHTML = allRatings.map(r => `<div>${r.username}: ${r.rating}/10</div>`).join(''); }
function renderReactions() { document.getElementById('reactionsContent').innerHTML = allReactions.map(r => `<div>[${r.time}] ${r.username}: ${r.message}</div>`).join(''); }
