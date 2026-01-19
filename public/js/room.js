const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

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

// ==================== INICIALIZAR ====================

window.addEventListener('load', async function() {
    console.log('🚀 Inicializando sala...');

    const pathParts = window.location.pathname.split('/');
    roomId = pathParts[pathParts.length - 1];

    if (!roomId || roomId === 'sala') {
        alert('ID de sala no válido');
        window.location.href = '/';
        return;
    }

    console.log('📋 Room ID:', roomId);

    try {
        await loadRoomData();
        console.log('✅ Datos de sala cargados:', roomData);
    } catch (error) {
        console.error('❌ Error cargando sala:', error);
        alert('Error: Sala no encontrada');
        window.location.href = '/';
        return;
    }

    isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
    console.log('👤 ¿Es anfitrión?', isHost);

    if (isHost) {
        username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
        console.log('🎯 Username anfitrión:', username);

        if (!username) {
            console.error('❌ No se encontró username del anfitrión');
            alert('Error de sesión. Por favor, crea la sala de nuevo.');
            window.location.href = '/';
            return;
        }

        console.log('✅ Anfitrión detectado, iniciando sala...');
        initRoom();
    } else {
        console.log('👥 Usuario invitado detectado');
        const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
        console.log('⚙️ ¿Ya configurado?', alreadyConfigured);

        if (alreadyConfigured) {
            username = localStorage.getItem('projectorroom_username');
            console.log('👤 Username invitado:', username);

            if (roomData.useHostSource === false) {
                console.log('🔍 Anfitrión NO comparte fuente, verificando selección...');
                const hasSelectedSource = localStorage.getItem('projectorroom_guest_source_' + roomId);

                if (!hasSelectedSource) {
                    console.log('⚠️ Invitado debe seleccionar fuente');
                    showGuestSourceSelector();
                    return;
                } else {
                    console.log('✅ Invitado ya tiene fuente:', hasSelectedSource);
                }
            } else {
                console.log('✅ Anfitrión comparte fuente');
            }

            initRoom();
        } else {
            console.log('📝 Mostrando configuración de invitado...');
            showGuestConfig();
        }
    }
});

async function loadRoomData() {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();

    if (!data.success) {
        throw new Error(data.message || 'Sala no encontrada');
    }

    roomData = data.projectorRoom;
}

function showGuestConfig() {
    console.log('📝 Renderizando configuración de invitado');

    document.querySelector('.room-container').style.display = 'none';

    let configHTML = `
        <div class="guest-config">
            <div class="config-card">
                <h2>🎬 Únete a la sala</h2>
                <p class="room-info"><strong>Sala:</strong> ${escapeHtml(roomData.roomName)}</p>
                <p class="room-info"><strong>Anfitrión:</strong> ${escapeHtml(roomData.hostUsername)}</p>

                <div class="form-group">
                    <label for="guest-username">Tu nombre de usuario</label>
                    <input type="text" id="guest-username" placeholder="Ej: JuanPerez" maxlength="20">
                </div>

                <button onclick="saveGuestConfig()" class="btn-primary">Entrar a la sala</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', configHTML);
}

function saveGuestConfig() {
    const usernameInput = document.getElementById('guest-username');
    const guestUsername = usernameInput.value.trim();

    if (!guestUsername) {
        alert('Por favor ingresa un nombre de usuario');
        return;
    }

    localStorage.setItem('projectorroom_username', guestUsername);
    localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');

    username = guestUsername;
    console.log('✅ Usuario invitado configurado:', username);

    if (roomData.useHostSource === false) {
        console.log('🔍 Anfitrión NO comparte fuente, mostrando selector...');
        document.querySelector('.guest-config').remove();
        showGuestSourceSelector();
    } else {
        console.log('✅ Anfitrión comparte fuente, iniciando sala...');
        document.querySelector('.guest-config').remove();
        document.querySelector('.room-container').style.display = 'flex';
        initRoom();
    }
}

async function showGuestSourceSelector() {
    console.log('🔍 Mostrando selector de fuentes para invitado...');

    document.querySelector('.room-container').style.display = 'none';

    let sourceHTML = `
        <div class="guest-source-selector">
            <div class="config-card">
                <h2>🎬 Selecciona tu fuente</h2>
                <p>El anfitrión no comparte su fuente. Debes seleccionar la tuya.</p>
                <div id="source-list-container">
                    <p>Cargando fuentes disponibles...</p>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', sourceHTML);

    await loadGuestSources();
}

async function loadGuestSources() {
    console.log('🔍 Cargando fuentes desde manifest:', roomData.manifest);

    try {
        const manifestUrl = roomData.manifest;
        const manifestRes = await fetch(manifestUrl);
        const manifestData = await manifestRes.json();

        console.log('📦 Manifest cargado:', manifestData);

        const catalogUrl = manifestData.catalogs.find(c => c.type === 'movie' || c.type === 'series')?.id || manifestData.catalogs[0]?.id;

        if (!catalogUrl) {
            throw new Error('No se encontró catálogo válido');
        }

        const metaId = roomData.sourceUrl.split('/').pop();
        const metaType = roomData.sourceUrl.includes('/movie/') ? 'movie' : 'series';

        console.log('🎯 Buscando streams para:', metaType, metaId);

        const streamUrl = `${manifestData.resources[0]}/stream/${metaType}/${metaId}.json`;
        console.log('🔗 Stream URL:', streamUrl);

        const streamRes = await fetch(streamUrl);
        const streamData = await streamRes.json();

        console.log('📺 Streams obtenidos:', streamData);

        if (!streamData.streams || streamData.streams.length === 0) {
            throw new Error('No hay fuentes disponibles');
        }

        guestSources = streamData.streams;
        renderGuestSources();

    } catch (error) {
        console.error('❌ Error cargando fuentes:', error);
        document.getElementById('source-list-container').innerHTML = `
            <p style="color: red;">Error cargando fuentes. Por favor recarga la página.</p>
        `;
    }
}

function renderGuestSources() {
    const container = document.getElementById('source-list-container');

    if (guestSources.length === 0) {
        container.innerHTML = '<p>No hay fuentes disponibles</p>';
        return;
    }

    let sourcesHTML = '<div class="sources-list">';

    guestSources.forEach((source, index) => {
        const quality = source.title || source.name || 'Fuente ' + (index + 1);
        sourcesHTML += `
            <div class="source-item" onclick="selectGuestSource(${index})">
                <div class="source-info">
                    <strong>${escapeHtml(quality)}</strong>
                    ${source.description ? '<br><small>' + escapeHtml(source.description) + '</small>' : ''}
                </div>
                <button class="btn-select">Seleccionar</button>
            </div>
        `;
    });

    sourcesHTML += '</div>';
    container.innerHTML = sourcesHTML;
}

function selectGuestSource(index) {
    console.log('✅ Fuente seleccionada:', guestSources[index]);

    guestSelectedSourceIndex = index;
    localStorage.setItem('projectorroom_guest_source_' + roomId, index.toString());

    document.querySelector('.guest-source-selector').remove();
    document.querySelector('.room-container').style.display = 'flex';

    initRoom();
}

// ==================== INICIALIZAR SALA ====================

function initRoom() {
    console.log('🎬 Inicializando sala...');

    document.getElementById('room-name-display').textContent = roomData.roomName;
    document.getElementById('room-id-display').textContent = roomId;
    document.getElementById('current-username').textContent = username;

    initSocket();
    loadMovieInfo();
    setupEventListeners();

    console.log('✅ Sala inicializada correctamente');
}

// ==================== SOCKET.IO ====================

function initSocket() {
    socket = io();

    socket.emit('join-room', {
        roomId: roomId,
        username: username
    });

    // NUEVO: Escuchar historial desde el servidor
    socket.on('load-history', (data) => {
        console.log('📚 Historial recibido del servidor:', data);

        // Cargar mensajes
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                appendChatMessage(msg.username, msg.message);
            });
        }

        // Cargar calificaciones
        if (data.ratings && data.ratings.length > 0) {
            allRatings = data.ratings;
            renderRatings();
        }

        // Cargar reacciones
        if (data.reactions && data.reactions.length > 0) {
            allReactions = data.reactions;
            renderReactions();
        }
    });

    socket.on('user-joined', (data) => {
        console.log('👤 Usuario se unió:', data.user);
        currentUsers = data.users;
        updateUsersList();

        if (data.user.username !== username) {
            appendChatMessage('Sistema', `${data.user.username} se unió a la sala`);
        }
    });

    socket.on('user-left', (data) => {
        console.log('👋 Usuario salió:', data.username);
        currentUsers = data.users;
        updateUsersList();
        appendChatMessage('Sistema', `${data.username} salió de la sala`);
    });

    socket.on('chat-message', (data) => {
        console.log('💬 Mensaje recibido:', data);
        if (data.username !== username) {
            appendChatMessage(data.username, data.message);
        }
    });

    socket.on('rating-added', (data) => {
        console.log('⭐ Calificación recibida:', data);
        if (data.allRatings) {
            allRatings = data.allRatings;
        } else {
            const existingIndex = allRatings.findIndex(r => r.username === data.username);
            if (existingIndex >= 0) {
                allRatings[existingIndex].rating = data.rating;
            } else {
                allRatings.push({ username: data.username, rating: data.rating });
            }
        }
        renderRatings();
    });

    socket.on('reaction-added', (data) => {
        console.log('💬 Reacción recibida:', data);
        if (!allReactions.some(r => r.username === data.username && r.time === data.time && r.message === data.message)) {
            allReactions.push({
                username: data.username,
                time: data.time,
                message: data.message
            });
            renderReactions();
        }
    });
}

function updateUsersList() {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';

    currentUsers.forEach(user => {
        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.innerHTML = `
            <span class="user-icon">👤</span>
            <span class="user-name">${escapeHtml(user.username)}</span>
        `;
        usersList.appendChild(userEl);
    });
}

// ==================== CHAT ====================

function setupEventListeners() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-message');

    sendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });

    document.getElementById('copy-link-btn').addEventListener('click', copyRoomLink);
    document.getElementById('submit-rating').addEventListener('click', submitRating);
    document.getElementById('submit-reaction').addEventListener('click', submitReaction);
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    socket.emit('chat-message', {
        roomId: roomId,
        message: message
    });

    appendChatMessage(username, message);
    input.value = '';
}

function appendChatMessage(user, message) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';

    const isSystem = user === 'Sistema';

    messageEl.innerHTML = `
        <strong style="${isSystem ? 'color: #888;' : ''}">${escapeHtml(user)}:</strong>
        <span>${escapeHtml(message)}</span>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function copyRoomLink() {
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink).then(() => {
        alert('¡Link copiado! Compártelo con tus amigos');
    });
}

// ==================== PELÍCULA/SERIE ====================

async function loadMovieInfo() {
    console.log('🎬 Cargando información de película/serie...');

    try {
        const metaId = roomData.sourceUrl.split('/').pop();
        const isMovie = roomData.sourceUrl.includes('/movie/');

        const tmdbId = metaId.split(':')[0];
        const mediaType = isMovie ? 'movie' : 'tv';

        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es`;

        console.log('🔍 TMDB URL:', tmdbUrl);

        const res = await fetch(tmdbUrl);
        const movieData = await res.json();

        console.log('✅ Datos de película/serie:', movieData);

        const posterUrl = movieData.poster_path 
            ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}`
            : 'https://via.placeholder.com/300x450?text=Sin+Poster';

        const backdropUrl = movieData.backdrop_path
            ? `https://image.tmdb.org/t/p/original${movieData.backdrop_path}`
            : '';

        if (backdropUrl) {
            document.querySelector('.movie-info').style.backgroundImage = `linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.9)), url('${backdropUrl}')`;
        }

        const title = movieData.title || movieData.name;
        const year = movieData.release_date ? movieData.release_date.split('-')[0] : (movieData.first_air_date ? movieData.first_air_date.split('-')[0] : '');
        const rating = movieData.vote_average ? movieData.vote_average.toFixed(1) : 'N/A';

        document.getElementById('movie-title').textContent = title;
        document.getElementById('movie-year').textContent = year;
        document.getElementById('movie-rating').textContent = `⭐ ${rating}`;
        document.getElementById('movie-overview').textContent = movieData.overview || 'Sin descripción disponible';
        document.getElementById('movie-poster').src = posterUrl;

    } catch (error) {
        console.error('❌ Error cargando info de película:', error);
    }
}

// ==================== CALIFICACIONES ====================

function submitRating() {
    const ratingSelect = document.getElementById('rating-select');
    const rating = parseInt(ratingSelect.value);

    if (!rating) {
        alert('Por favor selecciona una calificación');
        return;
    }

    userRating = rating;

    socket.emit('add-rating', {
        roomId: roomId,
        username: username,
        rating: rating
    });

    const existingIndex = allRatings.findIndex(r => r.username === username);
    if (existingIndex >= 0) {
        allRatings[existingIndex].rating = rating;
    } else {
        allRatings.push({ username: username, rating: rating });
    }

    renderRatings();
    alert('¡Calificación enviada!');
}

function renderRatings() {
    const container = document.getElementById('ratings-list');
    container.innerHTML = '';

    if (allRatings.length === 0) {
        container.innerHTML = '<p style="color: #888;">Aún no hay calificaciones de otros roomies</p>';
        return;
    }

    allRatings.forEach(rating => {
        const ratingEl = document.createElement('div');
        ratingEl.className = 'rating-item';
        ratingEl.innerHTML = `
            <span class="rating-user">${escapeHtml(rating.username)}</span>
            <span class="rating-stars">${'⭐'.repeat(Math.round(rating.rating / 2))}</span>
            <span class="rating-value">${rating.rating}/10</span>
        `;
        container.appendChild(ratingEl);
    });
}

// ==================== REACCIONES ====================

function submitReaction() {
    const timeInput = document.getElementById('reaction-time');
    const messageInput = document.getElementById('reaction-message');

    const time = timeInput.value.trim();
    const message = messageInput.value.trim();

    if (!time || !message) {
        alert('Por favor completa tiempo y mensaje');
        return;
    }

    socket.emit('add-reaction', {
        roomId: roomId,
        username: username,
        time: time,
        message: message
    });

    allReactions.push({
        username: username,
        time: time,
        message: message
    });

    renderReactions();

    timeInput.value = '';
    messageInput.value = '';
}

function renderReactions() {
    const container = document.getElementById('reactions-list');
    container.innerHTML = '';

    if (allReactions.length === 0) {
        container.innerHTML = '<p style="color: #888;">Aún no hay reacciones</p>';
        return;
    }

    allReactions.sort((a, b) => {
        const parseTime = (time) => {
            const parts = time.split(':').map(Number);
            return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
        };
        return parseTime(a.time) - parseTime(b.time);
    });

    allReactions.forEach(reaction => {
        const reactionEl = document.createElement('div');
        reactionEl.className = 'reaction-item';
        reactionEl.innerHTML = `
            <div class="reaction-header">
                <span class="reaction-time">⏱️ ${escapeHtml(reaction.time)}</span>
                <span class="reaction-user">- ${escapeHtml(reaction.username)}</span>
            </div>
            <div class="reaction-message">${escapeHtml(reaction.message)}</div>
        `;
        container.appendChild(reactionEl);
    });
}

// ==================== UTILIDADES ====================

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
