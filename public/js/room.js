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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre" maxlength="20">

        <h2 style="margin-top: 30px; margin-bottom: 15px;">🎬 ¿Qué proyector quieres usar?</h2>

        <div class="option-card" data-option="public">
          <input type="radio" name="projectorType" value="public" id="optionPublic">
          <div class="option-content">
            <div class="option-title">🌐 Proyector público</div>
            <div class="option-desc">Se usará el predeterminado ya configurado</div>
          </div>
        </div>

        <div class="option-card" data-option="custom">
          <input type="radio" name="projectorType" value="custom" id="optionCustom">
          <div class="option-content">
            <div class="option-title">⚙️ Proyector personalizado</div>
            <div class="option-desc">Introduce tu manifest.json custom</div>
          </div>
        </div>

        <div id="customManifestInput" style="display: none; margin-top: 15px;">
          <input type="url" id="customManifestUrl" placeholder="URL de tu manifest.json">
        </div>

        <button id="btnContinue" class="btn-primary" style="width: 100%; margin-top: 20px;">
          Accede a la sala de ${escapeHtml(roomData.hostUsername)} →
        </button>
      </div>
    </div>
  `;

  document.body.innerHTML = configHTML;

  const optionCards = document.querySelectorAll('.option-card');
  const customInput = document.getElementById('customManifestInput');

  optionCards.forEach(card => {
    card.addEventListener('click', function() {
      optionCards.forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');

      const radio = this.querySelector('input[type="radio"]');
      radio.checked = true;

      if (radio.value === 'custom') {
        customInput.style.display = 'block';
      } else {
        customInput.style.display = 'none';
      }
    });
  });

  document.getElementById('btnContinue').addEventListener('click', function() {
    const usernameInput = document.getElementById('guestUsername').value.trim();

    if (!usernameInput) {
      alert('Por favor, introduce tu nombre');
      return;
    }

    const selectedOption = document.querySelector('input[name="projectorType"]:checked');

    if (!selectedOption) {
      alert('Por favor, selecciona un tipo de proyector');
      return;
    }

    let manifestUrl = PUBLIC_MANIFEST;

    if (selectedOption.value === 'custom') {
      const customUrl = document.getElementById('customManifestUrl').value.trim();

      if (!customUrl) {
        alert('Por favor, introduce la URL de tu manifest.json');
        return;
      }

      manifestUrl = customUrl;
    }

    username = usernameInput;
    localStorage.setItem('projectorroom_username', username);
    localStorage.setItem('projectorroom_manifest_url', manifestUrl);
    localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');

    console.log('✅ Configuración de invitado guardada:', { username, manifestUrl });

    if (roomData.useHostSource === false) {
      console.log('🔍 Anfitrión no comparte fuente, mostrando selector...');
      showGuestSourceSelector();
    } else {
      console.log('✅ Iniciando sala directamente');
      location.reload();
    }
  });
}

async function showGuestSourceSelector() {
  console.log('🔍 Mostrando selector de fuentes para invitado');
  document.querySelector('.room-container').style.display = 'none';

  const movieData = roomData.movieData;
  const tmdbId = roomData.tmdbId;
  const mediaType = roomData.mediaType;

  console.log('📊 Datos película:', movieData);

  const typeText = mediaType === 'movie' ? 'Película' : 'Serie';
  const year = movieData.release_date?.substring(0, 4) || 
               movieData.first_air_date?.substring(0, 4) || '';
  const yearSpan = year ? `<span>📅 ${year}</span>` : '';

  const posterUrl = movieData.poster_path 
    ? `https://image.tmdb.org/t/p/w200${movieData.poster_path}`
    : '/images/placeholder.png';

  let sourceHTML = `
    <div class="guest-source-container">
      <div class="step-card wide">
        <!-- ⭐ BETA-1.7: Layout arreglado -->
        <div class="movie-header">
          <div class="movie-header-wrapper">
            <img src="${posterUrl}" alt="Poster">
            <div class="movie-info">
              <h2>${escapeHtml(movieData.title || movieData.name)}</h2>
              <div class="movie-meta">
                <span>⭐ ${movieData.vote_average?.toFixed(1) || 'N/A'}</span>
                ${yearSpan}
                <span>🎬 ${typeText}</span>
              </div>
            </div>
          </div>
          <p class="movie-overview">${escapeHtml(movieData.overview || 'Sin descripción')}</p>
        </div>

        <h2 class="section-title">🔍 Selecciona tu fuente</h2>
        <p class="section-subtitle">Elige la mejor calidad para tu reproducción</p>

        <div class="sources-list" id="sourcesList"></div>

        <button id="btnJoinRoom" class="btn-primary" style="width: 100%; margin-top: 10px;" disabled>
          Unirse a la sala →
        </button>
      </div>
    </div>
  `;

  document.body.innerHTML = sourceHTML;

  const sourcesList = document.getElementById('sourcesList');
  sourcesList.innerHTML = '<div class="loading">🔍 Buscando fuentes disponibles...</div>';

  try {
    const manifestUrl = localStorage.getItem('projectorroom_manifest_url') || PUBLIC_MANIFEST;
    console.log('📡 Cargando manifest:', manifestUrl);

    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();

    console.log('📦 Manifest cargado:', manifest);

    const catalogUrl = manifest.catalogs.find(c => c.id === 'webstreamr-search')?.extra?.[0]?.search?.catalogURL;

    if (!catalogUrl) {
      throw new Error('No se encontró URL de catálogo en el manifest');
    }

    const searchUrl = catalogUrl.replace('{SEARCH_QUERY}', encodeURIComponent(movieData.title || movieData.name));
    console.log('🔎 Buscando en:', searchUrl);

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    console.log('📋 Resultados búsqueda:', searchData);

    if (!searchData.metas || searchData.metas.length === 0) {
      sourcesList.innerHTML = '<div class="loading">❌ No se encontraron fuentes para esta película</div>';
      return;
    }

    const matchedMeta = searchData.metas.find(m => {
      const titleMatch = m.name?.toLowerCase().includes(movieData.title?.toLowerCase() || movieData.name?.toLowerCase());
      const yearMatch = m.name?.includes(year);
      return titleMatch || yearMatch;
    }) || searchData.metas[0];

    console.log('🎯 Meta seleccionado:', matchedMeta);

    const streamUrl = `https://webstreamr.hayd.uk/stream/${mediaType}/${matchedMeta.id}.json`;
    console.log('🌊 Cargando streams:', streamUrl);

    const streamRes = await fetch(streamUrl);
    const streamData = await streamRes.json();

    console.log('🎬 Streams disponibles:', streamData);

    if (!streamData.streams || streamData.streams.length === 0) {
      sourcesList.innerHTML = '<div class="loading">❌ No se encontraron streams para esta película</div>';
      return;
    }

    guestSources = streamData.streams;

    sourcesList.innerHTML = '';

    guestSources.forEach((stream, index) => {
      const sourceCard = document.createElement('div');
      sourceCard.className = 'source-card';
      sourceCard.dataset.index = index;

      const title = stream.title || stream.name || `Fuente ${index + 1}`;

      let metaInfo = [];
      if (stream.quality) metaInfo.push(stream.quality);
      if (stream.size) metaInfo.push(stream.size);
      if (stream.source) metaInfo.push(`📡 ${stream.source}`);

      sourceCard.innerHTML = `
        <div class="source-title">${escapeHtml(title)}</div>
        <div class="source-meta">${metaInfo.join(' • ')}</div>
      `;

      sourceCard.addEventListener('click', function() {
        document.querySelectorAll('.source-card').forEach(c => c.classList.remove('selected'));
        this.classList.add('selected');
        guestSelectedSourceIndex = index;
        document.getElementById('btnJoinRoom').disabled = false;
        console.log('✅ Fuente seleccionada:', index, stream);
      });

      sourcesList.appendChild(sourceCard);
    });

  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    sourcesList.innerHTML = '<div class="loading">❌ Error al cargar fuentes. Intenta de nuevo.</div>';
  }

  document.getElementById('btnJoinRoom').addEventListener('click', function() {
    if (guestSelectedSourceIndex === null) {
      alert('Por favor, selecciona una fuente');
      return;
    }

    const selectedSource = guestSources[guestSelectedSourceIndex];
    localStorage.setItem('projectorroom_guest_source_' + roomId, JSON.stringify(selectedSource));

    console.log('✅ Fuente guardada, recargando...');
    location.reload();
  });
}

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
}

// ... resto del código permanece igual ...

function renderRoomUI() {
  const movieData = roomData.movieData;
  const mediaType = roomData.mediaType;

  document.getElementById('roomTitle').textContent = movieData.title || movieData.name || 'Sala';

  const posterSmall = document.querySelector('.room-poster-small img');
  if (movieData.poster_path) {
    posterSmall.src = `https://image.tmdb.org/t/p/w200${movieData.poster_path}`;
  }

  const backdrop = document.querySelector('.room-backdrop img');
  if (movieData.backdrop_path) {
    backdrop.src = `https://image.tmdb.org/t/p/original${movieData.backdrop_path}`;
  }

  const typeText = mediaType === 'movie' ? 'Película' : 'Serie';
  const year = movieData.release_date?.substring(0, 4) || 
               movieData.first_air_date?.substring(0, 4) || 'N/A';
  const rating = movieData.vote_average?.toFixed(1) || 'N/A';

  document.querySelector('.movie-meta').innerHTML = `
    <span>⭐ ${rating}</span>
    <span>📅 ${year}</span>
    <span>🎬 ${typeText}</span>
  `;

  document.querySelector('.room-info p').textContent = movieData.overview || 'Sin descripción disponible.';

  if (isHost && roomData.useHostSource) {
    document.getElementById('changeSourceSection').style.display = 'block';
  } else {
    document.getElementById('changeSourceSection').style.display = 'none';
  }
}

// ... resto de funciones ...
