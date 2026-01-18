const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let guestSources = [];
let guestSelectedSourceIndex = null;

// INICIALIZAR SALA
window.addEventListener('load', async function() {
  // Obtener roomId de la URL
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId) {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  // Cargar datos de la sala primero
  await loadRoomData();
  
  // Verificar si es ANFITRIÓN (viene de crear sala)
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  
  if (isHost) {
    // ES ANFITRIÓN - Acceso directo sin configuración
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    initRoom();
  } else {
    // ES INVITADO - Verificar si ya se configuró
    const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    
    if (alreadyConfigured) {
      username = localStorage.getItem('projectorroom_username');
      
      // Si el anfitrión NO comparte fuente, verificar si el invitado ya seleccionó fuente
      if (roomData.useHostSource === false) {
        const hasSelectedSource = localStorage.getItem('projectorroom_guest_source_' + roomId);
        
        if (!hasSelectedSource) {
          // Mostrar selector de fuentes
          showGuestSourceSelector();
          return;
        }
      }
      
      initRoom();
    } else {
      showGuestConfig();
    }
  }
});

// MOSTRAR CONFIGURACIÓN DE INVITADO
function showGuestConfig() {
  // Ocultar sala y mostrar formulario
  document.querySelector('.room-container').style.display = 'none';
  
  // Crear formulario según configuración del anfitrión
  let configHTML = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus>
  `;
  
  // Si el anfitrión NO comparte su proyector, mostrar selector
  if (roomData.useHostSource === false) {
    configHTML += `
      <div style="margin-top: 30px;">
        <h2 style="font-size: 1.3rem; margin-bottom: 20px; text-align: center;">🎬 ¿Qué proyector quieres usar?</h2>
        
        <div class="option-card" onclick="selectGuestProjector('public')">
          <input type="radio" name="guestProjectorType" value="public" checked>
          <div class="option-content">
            <div class="option-title">🌐 Proyector público</div>
            <div class="option-desc">Se usará el predeterminado ya configurado</div>
          </div>
        </div>
        
        <div class="option-card" onclick="selectGuestProjector('custom')">
          <input type="radio" name="guestProjectorType" value="custom">
          <div class="option-content">
            <div class="option-title">⚙️ Proyector personalizado</div>
            <div class="option-desc">Introduce tu manifest.json custom</div>
          </div>
        </div>
        
        <div id="guestCustomManifestBox" style="display:none; margin-top: 15px;">
          <input type="url" id="guestCustomManifest" placeholder="https://tu-manifest.json">
        </div>
      </div>
    `;
  }
  
  configHTML += `
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px;">
          Accede a la sala de ${escapeHtml(roomData.hostUsername)} →
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', configHTML);
}

// SELECCIONAR PROYECTOR DE INVITADO
window.selectGuestProjector = function(type) {
  document.querySelectorAll('input[name="guestProjectorType"]').forEach(radio => {
    radio.checked = radio.value === type;
  });
  
  document.querySelectorAll('.guest-config-container .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  const customBox = document.getElementById('guestCustomManifestBox');
  if (customBox) {
    customBox.style.display = type === 'custom' ? 'block' : 'none';
  }
};

// ENVIAR CONFIGURACIÓN DE INVITADO
window.submitGuestConfig = async function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  
  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  
  localStorage.setItem('projectorroom_username', username);
  localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  
  // Si necesita configurar proyector
  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;
    
    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
      localStorage.setItem('projectorroom_guest_manifest_' + roomId, customManifest);
    }
    
    localStorage.setItem('projectorroom_guest_projector_' + roomId, projectorType);
    
    // Ocultar formulario y mostrar selector de fuentes
    document.querySelector('.guest-config-container').remove();
    showGuestSourceSelector();
  } else {
    // Ocultar formulario y mostrar sala directamente
    document.querySelector('.guest-config-container').remove();
    document.querySelector('.room-container').style.display = 'block';
    initRoom();
  }
};

// MOSTRAR SELECTOR DE FUENTES PARA INVITADO
async function showGuestSourceSelector() {
  document.querySelector('.room-container').style.display = 'none';
  
  const movieData = JSON.parse(roomData.manifest);
  
  const selectorHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <img src="${movieData.poster}" alt="Poster">
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title)}</h2>
            <div class="movie-meta">
              <span>⭐ ${movieData.rating}</span>
              <span>${movieData.year}</span>
              <span>${movieData.type === 'movie' ? 'Película' : 'Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview)}</p>
          </div>
        </div>
        
        <h3 class="section-title">🔍 Selecciona tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>
        
        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Cargando fuentes...</div>
        </div>
        
        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()">
          Unirse a la sala →
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  
  // Cargar fuentes
  await loadGuestSources(movieData);
}

// CARGAR FUENTES PARA INVITADO
async function loadGuestSources(movieData) {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const projectorType = localStorage.getItem('projectorroom_guest_projector_' + roomId);
  const manifestUrl = projectorType === 'custom'
    ? localStorage.getItem('projectorroom_guest_manifest_' + roomId)
    : PUBLIC_MANIFEST;
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${streamType}/${movieData.imdbId}.json`;
    
    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');
    
    const data = await res.json();
    
    guestSources = (data.streams || [])
      .filter(s => s && s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));
    
    if (guestSources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      return;
    }
    
    renderGuestSources();
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

// RENDERIZAR FUENTES PARA INVITADO
function renderGuestSources() {
  const container = document.getElementById('guestSourcesList');
  container.innerHTML = '';
  
  guestSources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectGuestSource(index);
    
    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>
    `;
    
    container.appendChild(card);
  });
  
  document.getElementById('btnJoinRoom').disabled = false;
}

// SELECCIONAR FUENTE DE INVITADO
function selectGuestSource(index) {
  guestSelectedSourceIndex = index;
  
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

// UNIRSE A LA SALA CON FUENTE SELECCIONADA
window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  // Guardar fuente seleccionada
  localStorage.setItem('projectorroom_guest_source_' + roomId, guestSources[guestSelectedSourceIndex].url);
  
  // Ocultar selector y mostrar sala
  document.querySelector('.guest-source-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  
  initRoom();
};

// INICIALIZAR SALA
function initRoom() {
  renderRoom();
  connectSocket();
  setupButtons();
}

// CARGAR DATOS DE LA SALA
async function loadRoomData() {
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    roomData = data.projectorRoom;
    
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error: ' + error.message);
    window.location.href = '/';
  }
}

// RENDERIZAR SALA
function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  
  document.getElementById('roomTitle').textContent = `PROYECTANDO "${movieData.title}"`;
  document.getElementById('roomSubtitle').textContent = `en la sala de ${roomData.hostUsername}`;
  document.getElementById('roomPoster').src = movieData.poster;
  document.getElementById('movieTitle').textContent = movieData.title;
  document.getElementById('movieYear').textContent = `📅 ${movieData.year}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating}`;
  document.getElementById('movieOverview').textContent = movieData.overview;
}

// CONECTAR SOCKET.IO
function connectSocket() {
  socket = io();
  
  socket.emit('join-room', { roomId, username });
  
  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
}

// ACTUALIZAR LISTA DE USUARIOS
function updateUsersList(users) {
  document.getElementById('usersCount').textContent = users.length;
  
  const container = document.getElementById('usersList');
  container.innerHTML = '';
  
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.username;
    container.appendChild(userEl);
  });
}

// AGREGAR MENSAJE AL CHAT
function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  
  if (isSystem) {
    messageEl.textContent = message;
  } else {
    messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
  }
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

// ENVIAR MENSAJE
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (message && socket && roomId) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

// ABRIR VLC (SOLO VLC, SIN DESCARGA)
function startProjection() {
  let sourceUrl;
  
  // Determinar qué fuente usar
  if (isHost || roomData.useHostSource) {
    sourceUrl = roomData.sourceUrl;
  } else {
    sourceUrl = localStorage.getItem('projectorroom_guest_source_' + roomId);
  }
  
  if (!sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }
  
  // SOLO abrir VLC (sin fallback de descarga)
  window.location.href = `vlc://${sourceUrl}`;
}

// COPIAR ENLACE DE INVITACIÓN
function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomUrl).then(() => {
      alert('✅ Enlace copiado al portapapeles\n\nCompártelo con tus amigos:\n' + roomUrl);
    }).catch(() => {
      prompt('Copia este enlace:', roomUrl);
    });
  } else {
    prompt('Copia este enlace:', roomUrl);
  }
}

// CONFIGURAR BOTONES
function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  
  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

// UTILIDADES
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
