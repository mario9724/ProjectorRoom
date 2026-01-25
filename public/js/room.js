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

// ==================== CONFIGURACIÓN INVITADO ====================

function showGuestConfig() {
  console.log('📝 Renderizando configuración de invitado');
  
  document.querySelector('.room-container').style.display = 'none';
  
  let configHTML = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 Únete a la sala</h1>
        <h2>${escapeHtml(roomData.roomName)}</h2>
        <p style="text-align: center; color: #999; margin-bottom: 20px;">
          Anfitrión: <strong>${escapeHtml(roomData.hostUsername)}</strong>
        </p>
        <input type="text" id="guestUsername" placeholder="Tu nombre" maxlength="20">
        <button class="btn-primary-large" onclick="saveGuestConfig()">Continuar</button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', configHTML);
}

function saveGuestConfig() {
  const guestUsername = document.getElementById('guestUsername').value.trim();
  
  if (!guestUsername) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  
  username = guestUsername;
  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  
  console.log('✅ Configuración de invitado guardada');
  
  if (roomData.useHostSource === false) {
    console.log('🔍 Mostrar selector de fuente');
    document.querySelector('.guest-config-container').remove();
    showGuestSourceSelector();
  } else {
    console.log('✅ Usando fuente del anfitrión');
    document.querySelector('.guest-config-container').remove();
    initRoom();
  }
}

// ==================== SELECTOR DE FUENTE INVITADO ====================

async function showGuestSourceSelector() {
  console.log('🎬 Mostrando selector de fuentes para invitado');
  
  document.querySelector('.room-container').style.display = 'none';
  
  const movieData = roomData.movieData || {};
  const poster = movieData.poster_path 
    ? `https://image.tmdb.org/t/p/w200${movieData.poster_path}`
    : '';
  const title = movieData.title || movieData.name || roomData.roomName;
  const year = (movieData.release_date || movieData.first_air_date || '').substring(0, 4);
  const rating = movieData.vote_average ? movieData.vote_average.toFixed(1) : 'N/A';
  const mediaType = roomData.mediaType === 'tv' ? 'Serie' : 'Película';
  
  let selectorHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <div class="movie-header-wrapper">
            <img src="${poster}" alt="${escapeHtml(title)}">
            <div class="movie-info">
              <h2>${escapeHtml(title)}</h2>
              <div class="movie-meta">
                <span>⭐ ${rating}</span>
                <span>📅 ${year}</span>
                <span>🎬 ${mediaType}</span>
              </div>
            </div>
          </div>
          <p class="movie-overview">${escapeHtml(movieData.overview || 'Sin descripción')}</p>
        </div>
        
        <h3 class="section-title">Elige tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>
        
        <div id="guestSourcesList" class="sources-list">
          <div class="loading">🔍 Buscando fuentes disponibles...</div>
        </div>
        
        <button class="btn-primary-large" onclick="saveGuestSource()" id="btnConfirmGuestSource" style="opacity: 0.5; cursor: not-allowed;" disabled>
          Confirmar selección
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  
  await loadGuestSources();
}

async function loadGuestSources() {
  const sourcesList = document.getElementById('guestSourcesList');
  
  try {
    const manifestUrl = roomData.projectorType === 'custom' && roomData.customManifest 
      ? roomData.customManifest 
      : PUBLIC_MANIFEST;
    
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();
    
    const catalogUrl = manifest.catalogs.find(c => c.id === 'webstreamr-search')?.extra?.[0]?.search?.catalogURL;
    
    if (!catalogUrl) {
      throw new Error('No se encontró URL de catálogo');
    }
    
    const movieData = roomData.movieData || {};
    const searchQuery = movieData.title || movieData.name || roomData.roomName;
    const searchUrl = catalogUrl.replace('{SEARCH_QUERY}', encodeURIComponent(searchQuery));
    
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (!searchData.metas || searchData.metas.length === 0) {
      sourcesList.innerHTML = '<div class="no-results">❌ No se encontraron fuentes</div>';
      return;
    }
    
    const year = (movieData.release_date || movieData.first_air_date || '').substring(0, 4);
    const matchedMeta = searchData.metas.find(m => {
      const titleMatch = m.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const yearMatch = m.name?.includes(year);
      return titleMatch || yearMatch;
    }) || searchData.metas[0];
    
    const streamUrl = `https://webstreamr.hayd.uk/stream/${roomData.mediaType || 'movie'}/${matchedMeta.id}.json`;
    
    const streamRes = await fetch(streamUrl);
    const streamData = await streamRes.json();
    
    if (!streamData.streams || streamData.streams.length === 0) {
      sourcesList.innerHTML = '<div class="no-results">❌ No se encontraron streams</div>';
      return;
    }
    
    guestSources = streamData.streams;
    
    let html = '';
    guestSources.forEach((stream, index) => {
      const title = stream.title || stream.name || `Fuente ${index + 1}`;
      let metaInfo = [];
      if (stream.quality) metaInfo.push(stream.quality);
      if (stream.size) metaInfo.push(stream.size);
      if (stream.source) metaInfo.push(`📡 ${stream.source}`);
      
      html += `
        <div class="source-card" onclick="selectGuestSource(${index})">
          <div class="source-title">${escapeHtml(title)}</div>
          <div class="source-meta">${metaInfo.join(' • ')}</div>
        </div>
      `;
    });
    
    sourcesList.innerHTML = html;
    
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    sourcesList.innerHTML = '<div class="no-results">❌ Error al cargar fuentes</div>';
  }
}

function selectGuestSource(index) {
  guestSelectedSourceIndex = index;
  
  document.querySelectorAll('.source-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  document.querySelectorAll('.source-card')[index].classList.add('selected');
  
  const btn = document.getElementById('btnConfirmGuestSource');
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
  btn.disabled = false;
  
  console.log('✅ Fuente seleccionada:', guestSources[index]);
}

function saveGuestSource() {
  if (guestSelectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  const selectedSource = guestSources[guestSelectedSourceIndex];
  localStorage.setItem('projectorroom_guest_source_' + roomId, selectedSource.url);
  
  console.log('✅ Fuente guardada para invitado');
  
  document.querySelector('.guest-source-container').remove();
  initRoom();
}

// ==================== SALA PRINCIPAL ====================

function initRoom() {
  console.log('🏠 Inicializando sala principal');
  
  document.querySelector('.room-container').style.display = 'block';
  
  renderRoomUI();
  setupEventListeners();
  connectSocket();
  
  // ⭐ BETA-1.7: Ocultar botón invitar si es invitado
  if (!isHost) {
    const btnInvite = document.getElementById('btnCopyInvite');
    if (btnInvite) {
      btnInvite.classList.add('guest-hidden');
    }
  }
  
  // ⭐ BETA-1.6: Mostrar botón cambiar película si es host
  if (isHost) {
    const btnChangeMovie = document.getElementById('btnChangeMovie');
    if (btnChangeMovie) {
      btnChangeMovie.style.display = 'block';
    }
  } else {
    const btnChangeMovie = document.getElementById('btnChangeMovie');
    if (btnChangeMovie) {
      btnChangeMovie.style.display = 'none';
    }
  }
}

function renderRoomUI() {
  const movieData = roomData.movieData || {};
  const poster = movieData.poster_path 
    ? `https://image.tmdb.org/t/p/w300${movieData.poster_path}`
    : '';
  const backdrop = movieData.backdrop_path
    ? `https://image.tmdb.org/t/p/original${movieData.backdrop_path}`
    : '';
  const title = movieData.title || movieData.name || roomData.roomName;
  const year = (movieData.release_date || movieData.first_air_date || '').substring(0, 4);
  const rating = movieData.vote_average ? movieData.vote_average.toFixed(1) : 'N/A';
  const mediaType = roomData.mediaType === 'tv' ? 'Serie' : 'Película';
  
  // Header
  document.querySelector('.room-title-info h1').textContent = title;
  document.querySelector('.room-poster-small img').src = poster;
  
  // Backdrop + Info
  if (backdrop) {
    document.querySelector('.room-backdrop img').src = backdrop;
  }
  
  document.querySelector('.room-info').innerHTML = `
    <div class="movie-meta">
      <span>⭐ ${rating}/10</span>
      <span>📅 ${year}</span>
      <span>🎬 ${mediaType}</span>
    </div>
    <p>${escapeHtml(movieData.overview || 'Sin descripción disponible.')}</p>
  `;
}

function setupEventListeners() {
  // Proyectar
  document.getElementById('btnStartProjection').addEventListener('click', function() {
    let sourceUrl;
    
    if (isHost) {
      sourceUrl = roomData.sourceUrl;
    } else {
      if (roomData.useHostSource) {
        sourceUrl = roomData.sourceUrl;
      } else {
        sourceUrl = localStorage.getItem('projectorroom_guest_source_' + roomId);
      }
    }
    
    if (!sourceUrl) {
      alert('No se encontró una fuente válida');
      return;
    }
    
    console.log('🎬 Proyectando:', sourceUrl);
    window.open(sourceUrl, '_blank');
  });
  
  // Copiar invitación
  document.getElementById('btnCopyInvite').addEventListener('click', function() {
    const inviteUrl = window.location.href;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      alert('✅ Link copiado al portapapeles');
    });
  });
  
  // ⭐ BETA-1.6: Cambiar película (solo anfitrión)
  const btnChangeMovie = document.getElementById('btnChangeMovie');
  if (btnChangeMovie) {
    btnChangeMovie.addEventListener('click', function() {
      if (confirm('¿Quieres cambiar la película proyectada?\n\nLos invitados deberán seleccionar nueva fuente si no compartes la tuya.')) {
        sessionStorage.setItem('projectorroom_updating_room', roomId);
        window.location.href = '/';
      }
    });
  }
  
  // Calificaciones
  document.getElementById('btnCalifications').addEventListener('click', openRatingsModal);
  
  // Reacciones
  document.getElementById('btnReactions').addEventListener('click', openReactionsModal);
  
  // Enviar chat
  document.getElementById('btnSendMessage').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

// ==================== WEBSOCKET ====================

function connectSocket() {
  socket = io();
  
  socket.emit('join-room', {
    roomId: roomId,
    username: username
  });
  
  socket.on('user-joined', function(data) {
    console.log('👤 Usuario unido:', data.user.username);
    currentUsers = data.users;
    updateUsersList();
    addSystemMessage(`${data.user.username} se unió a la sala`);
  });
  
  socket.on('user-left', function(data) {
    console.log('🔴 Usuario salió:', data.username);
    currentUsers = data.users;
    updateUsersList();
    addSystemMessage(`${data.username} salió de la sala`);
  });
  
  socket.on('chat-message', function(data) {
    addChatMessage(data.username, data.message, data.isSystem);
  });
  
  socket.on('rating-added', function(data) {
    console.log('⭐ Nueva calificación:', data);
    allRatings.push(data);
    if (document.getElementById('ratingsModal').style.display === 'flex') {
      renderRoomiesRatings();
    }
  });
  
  socket.on('reaction-added', function(data) {
    console.log('💬 Nueva reacción:', data);
    allReactions.push(data);
    if (document.getElementById('reactionsModal').style.display === 'flex') {
      renderRoomiesReactions();
    }
  });
  
  // ⭐ BETA-1.6: Escuchar cambio de película (invitados)
  socket.on('movie-changed', function(data) {
    console.log('🎬 Película cambiada por anfitrión:', data.movieData);
    
    alert(`${data.message}: ${data.movieData.title || data.movieData.name}\n\nLa página se recargará.`);
    
    // Limpiar selección de fuente anterior
    localStorage.removeItem('projectorroom_guest_source_' + roomId);
    
    // Recargar para nueva selección
    location.reload();
  });
}

function updateUsersList() {
  const userNames = currentUsers.map(u => u.username).join(', ');
  document.getElementById('usersNames').textContent = userNames || 'Nadie conectado';
}

// ==================== CHAT ====================

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  socket.emit('chat-message', {
    roomId: roomId,
    message: message
  });
  
  input.value = '';
}

function addChatMessage(username, message, isSystem = false) {
  const messagesDiv = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  
  if (isSystem) {
    messageEl.textContent = message;
  } else {
    messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span>${escapeHtml(message)}`;
  }
  
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(message) {
  addChatMessage('', message, true);
}

// ==================== MODALES ====================

function openRatingsModal() {
  document.getElementById('ratingsModal').style.display = 'flex';
  renderUserRating();
  renderRoomiesRatings();
}

function closeRatingsModal() {
  document.getElementById('ratingsModal').style.display = 'none';
}

function renderUserRating() {
  const starsContainer = document.querySelector('.rating-stars');
  starsContainer.innerHTML = '';
  
  for (let i = 1; i <= 10; i++) {
    const star = document.createElement('span');
    star.className = 'star';
    star.textContent = '⭐';
    star.onclick = () => selectRating(i);
    
    if (userRating && i <= userRating) {
      star.classList.add('selected');
    }
    
    starsContainer.appendChild(star);
  }
}

function selectRating(rating) {
  userRating = rating;
  renderUserRating();
  
  socket.emit('add-rating', {
    roomId: roomId,
    username: username,
    rating: rating
  });
  
  console.log('⭐ Calificación enviada:', rating);
}

function renderRoomiesRatings() {
  const list = document.getElementById('roomiesRatingsList');
  
  if (allRatings.length === 0) {
    list.innerHTML = '<p style="text-align: center; color: #999;">Aún no hay calificaciones de otros roomies</p>';
    return;
  }
  
  list.innerHTML = '';
  
  allRatings.forEach(rating => {
    const ratingEl = document.createElement('div');
    ratingEl.className = 'rating-item';
    ratingEl.innerHTML = `
      <strong>${escapeHtml(rating.username)}</strong>: ${'⭐'.repeat(rating.rating)} (${rating.rating}/10)
    `;
    list.appendChild(ratingEl);
  });
}

function openReactionsModal() {
  document.getElementById('reactionsModal').style.display = 'flex';
  renderRoomiesReactions();
}

function closeReactionsModal() {
  document.getElementById('reactionsModal').style.display = 'none';
}

function addReaction() {
  const time = document.getElementById('reactionTime').value.trim();
  const message = document.getElementById('reactionMessage').value.trim();
  
  if (!time || !message) {
    alert('Por favor, completa todos los campos');
    return;
  }
  
  socket.emit('add-reaction', {
    roomId: roomId,
    username: username,
    time: time,
    message: message
  });
  
  document.getElementById('reactionTime').value = '';
  document.getElementById('reactionMessage').value = '';
  
  console.log('💬 Reacción enviada');
}

function renderRoomiesReactions() {
  const content = document.getElementById('roomiesReactionsContent');
  
  if (allReactions.length === 0) {
    content.innerHTML = '<p style="text-align: center; color: #999;">Aún no hay reacciones</p>';
    return;
  }
  
  allReactions.sort((a, b) => {
    const parseTime = (time) => {
      const parts = time.split(':').map(Number);
      return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    };
    return parseTime(a.time) - parseTime(b.time);
  });
  
  content.innerHTML = '';
  
  allReactions.forEach(reaction => {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'reaction-item';
    reactionEl.innerHTML = `
      <div class="reaction-time">⏱️ ${escapeHtml(reaction.time)}</div>
      <div class="reaction-user">${escapeHtml(reaction.username)}</div>
      <div class="reaction-message">${escapeHtml(reaction.message)}</div>
    `;
    content.appendChild(reactionEl);
  });
}

// ==================== UTILIDADES ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
