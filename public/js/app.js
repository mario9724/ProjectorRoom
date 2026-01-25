// app.js - FIX COMPLETO
const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreamsfortheweebsstable.midnightignite.me/stremio/25123557-beb8-43d4-a498-fbec7d56e903/eyJpIjoiZkJxZjZQd2U3WnE1QlphQnh3UWJtZz09IiwiZSI6IjllZ3RvS3pvY3dpNmdaNEpzaUxuZVhEZDdqSmM0Z20ycFBFQzRJYy9PK2s9IiwidCI6ImEifQ/manifest.json';

let currentStep = 1;
let searchTimeout = null;
let selectedMovie = null;
let sources = [];
let selectedSourceIndex = null;
let roomConfig = { username: '', roomName: '', projectorType: 'public', customManifest: '', shareMode: 'host' };

// ========================================
// NAVEGACIÓN
// ========================================
function goToStep(step) {
  // Validaciones
  if (step === 2) {
    const username = document.getElementById('username').value.trim();
    if (!username) {
      alert('Por favor, escribe tu nombre');
      return;
    }
    roomConfig.username = username;
  }

  if (step === 3) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) {
      alert('Por favor, escribe el nombre de la sala');
      return;
    }
    roomConfig.roomName = roomName;
  }

  if (step === 4) {
    roomConfig.projectorType = document.querySelector('input[name="projectorType"]:checked').value;
    if (roomConfig.projectorType === 'custom') {
      roomConfig.customManifest = document.getElementById('customManifest').value.trim();
      if (!roomConfig.customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
    }
  }

  if (step === 5) {
    roomConfig.shareMode = document.querySelector('input[name="shareMode"]:checked').value;
  }

  // Ocultar paso actual
  document.getElementById(`step${currentStep}`).classList.remove('active');
  // Mostrar nuevo paso
  currentStep = step;
  document.getElementById(`step${step}`).classList.add('active');

  // Inicializar búsqueda en paso 5
  if (step === 5) {
    setTimeout(initSearch, 100);
  }
}

// ========================================
// SELECCIÓN DE OPCIONES
// ========================================
function selectProjectorType(type) {
  document.querySelectorAll('input[name="projectorType"]').forEach(radio => {
    radio.checked = radio.value === type;
  });
  document.querySelectorAll('.step3 .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');

  const customBox = document.getElementById('customManifestBox');
  customBox.style.display = type === 'custom' ? 'block' : 'none';
}

function selectShareMode(mode) {
  document.querySelectorAll('input[name="shareMode"]').forEach(radio => {
    radio.checked = radio.value === mode;
  });
  document.querySelectorAll('.step4 .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
}

// ========================================
// BÚSQUEDA DE PELÍCULAS
// ========================================
function initSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();

    if (query.length < 2) {
      document.getElementById('searchResults').innerHTML = '<div class="loading">Escribe al menos 2 caracteres...</div>';
      return;
    }

    searchTimeout = setTimeout(() => searchMovies(query), 500);
  });
}

async function searchMovies(query) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="loading">🔍 Buscando...</div>';

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}`;

    const res = await fetch(url);
    const data = await res.json();

    const filtered = data.results
      .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path)
      .map(item => ({
        tmdbId: item.id,
        imdbId: null,
        title: item.title || item.name,
        year: (item.release_date || item.first_air_date || '').substring(0, 4),
        poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
        backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
        rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
        overview: item.overview || 'Sin descripción disponible',
        type: item.media_type === 'movie' ? 'movie' : 'series',
        mediaType: item.media_type
      }));

    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron resultados</div>';
      return;
    }

    renderMovieGrid(filtered);
  } catch (error) {
    console.error('❌ Error buscando:', error);
    container.innerHTML = '<div class="loading">❌ Error en la búsqueda</div>';
  }
}

function renderMovieGrid(movies) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';

  movies.forEach((movie) => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => selectMovie(movie);

    card.innerHTML = `
      <img src="${movie.poster}" alt="${escapeHtml(movie.title)}">
      <div class="movie-card-info">
        <div class="movie-card-title">${escapeHtml(movie.title)}</div>
        <div class="movie-card-meta">⭐ ${movie.rating}</div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ========================================
// SELECCIONAR PELÍCULA
// ========================================
async function selectMovie(movie) {
  console.log('✅ Seleccionando:', movie.title);

  // OBTENER IMDb ID
  try {
    const endpoint = movie.type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${endpoint}/${movie.tmdbId}/external_ids?api_key=${TMDB_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    movie.imdbId = data.imdb_id;

    if (!movie.imdbId) {
      alert('⚠️ Esta película/serie no tiene IMDb ID disponible.\n\nNo se pueden cargar fuentes sin IMDb ID.');
      return;
    }

    console.log('✅ IMDb ID:', movie.imdbId);

    // GUARDAR EN SESSIONSTORAGE ← FIX PRINCIPAL
    selectedMovie = movie;
    sessionStorage.setItem('projectorroom:selectedmovie', JSON.stringify(movie));

    // VERIFICAR GUARDADO
    const saved = sessionStorage.getItem('projectorroom:selectedmovie');
    console.log('🔍 sessionStorage guardado:', saved ? '✅ OK' : '❌ FALLÓ');

    goToStep(6);
    renderSelectedMovie();
    loadSources();

  } catch (error) {
    console.error('❌ Error obteniendo IMDb ID:', error);
    alert('Error obteniendo información');
  }
}

// ========================================
// RENDERIZAR PELÍCULA SELECCIONADA
// ========================================
function renderSelectedMovie() {
  const posterEl = document.getElementById('selectedPoster');
  const titleEl = document.getElementById('selectedTitle');
  const ratingEl = document.getElementById('selectedRating');
  const yearEl = document.getElementById('selectedYear');
  const typeEl = document.getElementById('selectedType');
  const overviewEl = document.getElementById('selectedOverview');

  if (posterEl) posterEl.src = selectedMovie.poster;
  if (titleEl) titleEl.textContent = selectedMovie.title;
  if (ratingEl) ratingEl.textContent = selectedMovie.rating;
  if (yearEl) yearEl.textContent = selectedMovie.year;
  if (typeEl) typeEl.textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  if (overviewEl) overviewEl.textContent = selectedMovie.overview;
}

// ========================================
// CARGAR FUENTES
// ========================================
async function loadSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';

  const manifestUrl = roomConfig.projectorType === 'custom' ? roomConfig.customManifest : PUBLIC_MANIFEST;

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');

    let streamUrl;
    if (selectedMovie.type === 'movie') {
      streamUrl = `${baseUrl}/stream/movie/${selectedMovie.imdbId}.json`;
    } else {
      // SERIES: Necesita episodio específico
      alert('⚠️ Para series, selecciona episodio en la sala.');
      container.innerHTML = '<div class="loading">📺 Series necesitan episodio específico</div>';
      const btnCreateRoom = document.getElementById('btnCreateRoom');
      if (btnCreateRoom) btnCreateRoom.disabled = true;
      return;
    }

    console.log('📺 Stream URL:', streamUrl);

    const res = await fetch(streamUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: No se encontraron fuentes`);
    }

    const data = await res.json();

    // FILTRAR SOLO HTTP DIRECTOS (NO TORRENTS)
    sources = (data.streams || [])
      .filter(s => {
        if (!s?.url) return false;
        const url = s.url.toLowerCase();
        // Excluir torrents
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

    console.log('✅', sources.length, 'fuentes HTTP encontradas');

    if (sources.length === 0) {
      container.innerHTML = '<div class="loading">😕 Solo torrents disponibles<br><small>Prueba otro addon</small></div>';
      const btnCreateRoom = document.getElementById('btnCreateRoom');
      if (btnCreateRoom) btnCreateRoom.disabled = true;
      return;
    }

    renderSources();
  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ ${error.message}</div>`;
    const btnCreateRoom = document.getElementById('btnCreateRoom');
    if (btnCreateRoom) btnCreateRoom.disabled = true;
  }
}

// ========================================
// RENDERIZAR FUENTES
// ========================================
function renderSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '';

  sources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectSource(index);

    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>
    `;

    container.appendChild(card);
  });

  const btnCreateRoom = document.getElementById('btnCreateRoom');
  if (btnCreateRoom) btnCreateRoom.disabled = false;
}

function selectSource(index) {
  selectedSourceIndex = index;
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

// ========================================
// CREAR SALA
// ========================================
async function createRoom() {
  if (selectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }

  const roomData = {
    roomName: roomConfig.roomName,
    hostUsername: roomConfig.username,
    manifest: JSON.stringify(selectedMovie),
    sourceUrl: sources[selectedSourceIndex].url,
    useHostSource: roomConfig.shareMode === 'host',
    projectorType: roomConfig.projectorType,
    customManifest: roomConfig.customManifest
  };

  console.log('📤 Creando sala:', roomData);

  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });

    const data = await res.json();

    if (data.success) {
      const roomId = data.projectorRoom.id;

      // MARCAR COMO ANFITRIÓN
      sessionStorage.setItem(`projectorroom:ishost:${roomId}`, 'true');
      sessionStorage.setItem(`projectorroom:hostusername:${roomId}`, roomConfig.username);

      // REDIRIGIR A LA SALA
      window.location.href = `/sala/${roomId}`;
    } else {
      alert('Error creando sala: ' + data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    alert('Error creando sala');
  }
}

// ========================================
// UTILIDADES
// ========================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
