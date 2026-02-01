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
            showGuestLogin();
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
    
    // Título dinámico solicitado
    let contentName = movie.title || 'Contenido';
    if (movie.type === 'series' && movie.season && movie.episode) {
        contentName += ` (Temporada ${movie.season} x Episodio ${movie.episode})`;
    }
    const hostName = roomData.hostUsername || 'Anfitrión';
    const dynamicTitle = `Proyectando ${contentName} en ${roomData.name} de ${hostName}`;
    
    document.getElementById('roomTitle').textContent = dynamicTitle;
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

    if (!sourceUrl) return alert("Fuente no disponible.");

    document.getElementById('roomBackdrop').style.display = 'none';
    document.getElementById('videoContainer').style.display = 'block';

    if (!player) {
        player = videojs('mainVideo', {
            fluid: true,
            controls: true,
            techOrder: ['chromecast', 'html5'],
            plugins: { chromecast: { addButtonToControlBar: true } },
            controlBar: { fullscreenToggle: true }
        });
    }

    player.src({
        src: sourceUrl,
        type: sourceUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
    });

    player.ready(() => player.play());
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
        div.innerHTML = `<strong>${escapeHtml(d.username)}:</strong> ${escapeHtml(d.message)}`;
        cont.appendChild(div);
        cont.scrollTop = cont.scrollHeight;
    });

    socket.on('rating-added', d => { allRatings.push(d); renderRatings(); });
    socket.on('reaction-added', d => { allReactions.push(d); renderReactions(); });
}

function setupEventListeners() {
    document.getElementById('btnStartProjection').onclick = startProjection;
    document.getElementById('btnSendChat').onclick = sendChatMessage;
    document.getElementById('btnCopyInvite').onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('Enlace copiado');
    };

    // Estrellas
    document.querySelectorAll('.star').forEach(s => {
        s.onclick = function() {
            userRating = this.dataset.value;
            document.querySelectorAll('.star').forEach(st => {
                st.classList.toggle('selected', parseInt(st.dataset.value) <= parseInt(userRating));
            });
        };
    });

    document.getElementById('btnSubmitRating').onclick = () => {
        if (userRating) socket.emit('add-rating', { roomId, username, rating: userRating });
    };

    document.getElementById('btnSubmitReaction').onclick = () => {
        const m = document.getElementById('reactionMinute').value;
        const msg = document.getElementById('reactionMessage').value;
        if (m && msg) {
            socket.emit('add-reaction', { roomId, username, time: m + ':00', message: msg });
            document.getElementById('reactionMessage').value = '';
        }
    };

    // Modales (display: flex para centrar)
    document.getElementById('btnCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'flex';
    document.getElementById('btnReactions').onclick = () => document.getElementById('modalReactions').style.display = 'flex';
    document.getElementById('btnCloseCalifications').onclick = () => document.getElementById('modalCalifications').style.display = 'none';
    document.getElementById('btnCloseReactions').onclick = () => document.getElementById('modalReactions').style.display = 'none';
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (input.value.trim() && socket) {
        socket.emit('chat-message', { roomId, message: input.value });
        input.value = '';
    }
}

function showGuestLogin() {
    const name = prompt("Nombre:");
    if (name) {
        localStorage.setItem('projectorroom_username', name);
        location.reload();
    }
}

function renderRatings() {
    document.getElementById('ratingsContent').innerHTML = allRatings.map(r => `<div>${escapeHtml(r.username)}: ${r.rating}/10</div>`).join('');
}

function renderReactions() {
    document.getElementById('reactionsContent').innerHTML = allReactions.map(r => `<div>[${r.time}] ${escapeHtml(r.username)}: ${escapeHtml(r.message)}</div>`).join('');
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
