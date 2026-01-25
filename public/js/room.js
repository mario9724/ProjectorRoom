// room.js - v1.6.0-stable
// FIX: Validación pathname + DOM checks

const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreamsfortheweebsstable.midnightignite.me/stremio/25123557-beb8-43d4-a498-fbec7d56e903/eyJpIjoiZkJxZjZQd2U3WnE1QlphQnh3UWJtZz09IiwiZSI6IjllZ3RvS3pvY3dpNmdaNEpzaUxuZVhEZDdqSmM0Z20ycFBFQzRJYy9PK2s9IiwidCI6ImEifQ/manifest.json';

let roomId = null;
let socket = null;
let username;
let roomData = null;
let isHost = false;
let guestSources = [];
let guestSelectedSourceIndex = null;
let userRating = null;
let allRatings = [];
let allReactions = [];
let currentUsers = [];

// ========================================
// INICIALIZAR
// ========================================
window.addEventListener('load', async function() {
  // ✅ FIX: NO EJECUTAR SI ESTAMOS EN INDEX.HTML
  const path = window.location.pathname;

  if (path === '/' || path === '/index.html') {
    console.log('📍 Estamos en index.html - NO ejecutar room.js');
    return;
  }

  console.log('🚀 Inicializando sala');

  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];

  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }

  console.log('🆔 Room ID:', roomId);

  try {
    await loadRoomData();
    console.log('✅ Datos de sala cargados:', roomData);
  } catch (error) {
    console.error('❌ Error cargando sala:', error);
    alert('Error: Sala no encontrada');
    window.location.href = '/';
    return;
  }

  isHost = sessionStorage.getItem(`projectorroom:ishost:${roomId}`) === 'true';
  console.log('👤 Es anfitrión?', isHost);

  if (isHost) {
    username = sessionStorage.getItem(`projectorroom:hostusername:${roomId}`);
    console.log('🎭 Username anfitrión:', username);

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

    const alreadyConfigured = localStorage.getItem(`projectorroom:guestconfigured:${roomId}`) === 'true';
    console.log('⚙️ Ya configurado?', alreadyConfigured);

    if (alreadyConfigured) {
      username = localStorage.getItem('projectorroom:username');
      console.log('🎭 Username invitado:', username);

      if (roomData.useHostSource === false) {
        console.log('🔍 Anfitrión NO comparte fuente, verificando selección...');
        const hasSelectedSource = localStorage.getItem(`projectorroom:guestsource:${roomId}`);

        if (!hasSelectedSource) {
          console.log('⚠️ Invitado debe seleccionar fuente...');
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
      console.log('⚙️ Mostrando configuración de invitado...');
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

// ========================================
// CONFIGURACIÓN DE INVITADO
// ========================================
function showGuestConfig() {
  console.log('📝 Renderizando configuración de invitado');
  const roomContainer = document.querySelector('.room-container');
  if (roomContainer) roomContainer.style.display = 'none';

  let configHTML = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>✋ Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus>
  `;

  if (roomData.useHostSource === false) {
    configHTML += `
        <div style="margin-top: 30px;">
          <h2 style="font-size: 1.3rem; margin-bottom: 20px; text-align: center;">¿Qué proyector quieres usar?</h2>

          <div class="option-card" onclick="selectGuestProjector('public')">
            <input type="radio" name="guestProjectorType" value="public" checked>
            <div class="option-content">
              <div class="option-title">🎬 Proyector público</div>
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
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px; width: 100%;">
          Accede a la sala de ${escapeHtml(roomData.hostUsername)}
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', configHTML);
}

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

window.submitGuestConfig = function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();

  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }

  console.log('💾 Guardando configuración de invitado:', username);
  localStorage.setItem('projectorroom:username', username);
  localStorage.setItem(`projectorroom:guestconfigured:${roomId}`, 'true');

  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;

    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
      localStorage.setItem(`projectorroom:guestmanifest:${roomId}`, customManifest);
    }

    localStorage.setItem(`projectorroom:guestprojector:${roomId}`, projectorType);

    console.log('🔍 Invitado debe seleccionar fuente');
    const guestConfig = document.querySelector('.guest-config-container');
    if (guestConfig) guestConfig.remove();
    showGuestSourceSelector();
  } else {
    console.log('✅ Invitado usará fuente del anfitrión');
    const guestConfig = document.querySelector('.guest-config-container');
    if (guestConfig) guestConfig.remove();
    const roomContainer = document.querySelector('.room-container');
    if (roomContainer) roomContainer.style.display = 'block';
    initRoom();
  }
};

// ========================================
// SELECTOR DE FUENTES PARA INVITADO
// ========================================
async function showGuestSourceSelector() {
  console.log('🎬 Mostrando selector de fuentes para invitado');
  const roomContainer = document.querySelector('.room-container');
  if (roomContainer) roomContainer.style.display = 'none';

  const movieData = JSON.parse(roomData.manifest);

  const selectorHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <div class="movie-header">
          <img src="${movieData.poster}" alt="Poster">
          <div class="movie-info">
            <h2>${escapeHtml(movieData.title || 'Película')}</h2>
            <div class="movie-meta">
              <span>⭐ ${movieData.rating || 'N/A'}</span>
              <span>${movieData.year || 'N/A'}</span>
              <span>${movieData.type === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
            </div>
            <p>${escapeHtml(movieData.overview || 'Sin descripción')}</p>
          </div>
        </div>

        <h3 class="section-title">Selecciona tu fuente</h3>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>

        <div id="guestSourcesList" class="sources-list">
          <div class="loading">Cargando fuentes...</div>
        </div>

        <button id="btnJoinRoom" class="btn-primary" disabled onclick="joinRoomWithSource()" style="width: 100%;">
          Unirse a la sala
        </button>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  await loadGuestSources(movieData);
}

async function loadGuestSources(movieData) {
  console.log('📡 Cargando fuentes para invitado...');
  const container = document.getElementById('guestSourcesList');
  if (!container) return;

  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';

  const projectorType = localStorage.getItem(`projectorroom:guestprojector:${roomId}`);
  const manifestUrl = projectorType === 'custom' 
    ? localStorage.getItem(`projectorroom:guestmanifest:${roomId}`)
    : PUBLIC_MANIFEST;

  console.log('🔗 Manifest URL:', manifestUrl);

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');

    const streamType = movieData.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${streamType}/${movieData.imdbId}.json`;

    console.log('📺 Stream URL:', streamUrl);

    const res = await fetch(streamUrl);
    if (!res.ok) {
      throw new Error('No se encontraron fuentes');
    }

    const data = await res.json();

    guestSources = (data.streams || [])
      .filter(s => {
        if (!s?.url) return false;
        const url = s.url.toLowerCase();
        if (url.startsWith('magnet:') || url.includes('infohash')) {
          console.log('⏭️ Saltando torrent:', s.title || s.name);
          return false;
        }
        return url.startsWith('http://') || url.startsWith('https://');
      })
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));

    console.log('✅ Fuentes encontradas:', guestSources.length);

    if (guestSources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      return;
    }

    renderGuestSources();
  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

function renderGuestSources() {
  const container = document.getElementById('guestSourcesList');
  if (!container) return;

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

  const btnJoinRoom = document.getElementById('btnJoinRoom');
  if (btnJoinRoom) btnJoinRoom.disabled = false;
}

function selectGuestSource(index) {
  guestSelectedSourceIndex = index;
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

window.joinRoomWithSource = function() {
  if (guestSelectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }

  const selectedUrl = guestSources[guestSelectedSourceIndex].url;
  console.log('✅ Fuente seleccionada:', selectedUrl);

  localStorage.setItem(`projectorroom:guestsource:${roomId}`, selectedUrl);

  const guestSourceContainer = document.querySelector('.guest-source-container');
  if (guestSourceContainer) guestSourceContainer.remove();

  const roomContainer = document.querySelector('.room-container');
  if (roomContainer) roomContainer.style.display = 'block';

  initRoom();
};
