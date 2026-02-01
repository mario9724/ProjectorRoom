const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreams-nightly.stremio.ru/stremio/f18d6a2e-742d-4ae6-8866-2c7b2484031f/eyJpIjoiM2tVUUwxWGhTUlE3azRrK2E4eFZJdz09IiwiZSI6ImxDWkE2dGJPYXFta2FTSUNBaGt2TkRzL1NQRlFteGtZUzJ4WVd2YXRsNFE9IiwidCI6ImEifQ/manifest.json';

let currentStep = 1;
let searchTimeout = null;
let selectedMovie = null;
let sources = [];
let selectedSourceIndex = null;
let roomConfig = {
  username: '',
  roomName: '',
  projectorType: 'public',
  customManifest: '',
  shareMode: 'host'
};

// NAVEGACIÓN ENTRE PASOS
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
  document.getElementById('step' + currentStep).classList.remove('active');
  
  // Mostrar nuevo paso
  currentStep = step;
  document.getElementById('step' + step).classList.add('active');
  
  // Inicializar búsqueda en paso 5
  if (step === 5) {
    setTimeout(initSearch, 100);
  }
}

// SELECCIÓN DE TIPO DE PROYECTOR
function selectProjectorType(type) {
  document.querySelectorAll('input[name="projectorType"]').forEach(radio => {
    radio.checked = radio.value === type;
  });
  
  document.querySelectorAll('#step3 .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  const customBox = document.getElementById('customManifestBox');
  customBox.style.display = type === 'custom' ? 'block' : 'none';
}

// SELECCIÓN DE MODO COMPARTIR
function selectShareMode(mode) {
  document.querySelectorAll('input[name="shareMode"]').forEach(radio => {
    radio.checked = radio.value === mode;
  });
  
  document.querySelectorAll('#step4 .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
}

// INICIALIZAR BÚSQUEDA
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

// BUSCAR PELÍCULAS
async function searchMovies(query) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="loading">🔍 Buscando...</div>';
  
  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();
    
    const filtered = (data.results || []).filter(item => 
      (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
    );
    
    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron resultados</div>';
      return;
    }
    
    renderMovieGrid(filtered);
  } catch (error) {
    console.error('Error buscando:', error);
    container.innerHTML = '<div class="loading">❌ Error en la búsqueda</div>';
  }
}

// RENDERIZAR GRID
function renderMovieGrid(movies) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';
  
  movies.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => selectMovie(movie);
    
    card.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title || movie.name}">
      <div class="movie-card-info">
        <div class="movie-card-title">${escapeHtml(movie.title || movie.name)}</div>
        <div class="movie-card-meta">⭐ ${movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A'}</div>
      </div>
    `;
    
    container.appendChild(card);
  });
}

// SELECCIONAR PELÍCULA
async function selectMovie(movie) {
  selectedMovie = {
    id: movie.id,
    type: movie.media_type === 'movie' ? 'movie' : 'series',
    title: movie.title || movie.name,
    poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
    rating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
    year: (movie.release_date || movie.first_air_date || '').substring(0, 4),
    overview: movie.overview || 'Sin descripción disponible',
    selectedSeason: null,
    selectedEpisode: null
  };
  
  // Obtener IMDb ID
  try {
    const type = movie.media_type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${type}/${movie.id}/external_ids?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    selectedMovie.imdbId = data.imdb_id;
    
    if (!selectedMovie.imdbId) {
      alert('No se encontró IMDb ID para este contenido');
      return;
    }
    
    goToStep(6);
    renderSelectedMovie();
    
    // Si es serie, cargar temporadas y mostrar selector
    if (selectedMovie.type === 'series') {
      await loadSeasons();
    } else {
      // Si es película, cargar fuentes directamente
      loadSources();
    }
  } catch (error) {
    console.error('Error obteniendo IMDb ID:', error);
    alert('Error obteniendo información');
  }
}

// RENDERIZAR PELÍCULA SELECCIONADA
function renderSelectedMovie() {
  document.getElementById('selectedPoster').src = selectedMovie.poster;
  document.getElementById('selectedTitle').textContent = selectedMovie.title;
  document.getElementById('selectedRating').textContent = `⭐ ${selectedMovie.rating}`;
  document.getElementById('selectedYear').textContent = selectedMovie.year;
  document.getElementById('selectedType').textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  document.getElementById('selectedOverview').textContent = selectedMovie.overview;
  
  // Ocultar selector de episodios si es película
  if (selectedMovie.type === 'movie') {
    document.getElementById('episodeSelector').style.display = 'none';
  }
}

// ==================== SELECTOR DE EPISODIOS ====================

// CARGAR TEMPORADAS DESDE TMDB
async function loadSeasons() {
  try {
    const url = `https://api.themoviedb.org/3/tv/${selectedMovie.id}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url);
    const data = await res.json();
    
    // Filtrar temporadas válidas (excluir especiales si season_number es 0)
    selectedMovie.seasons = data.seasons.filter(s => s.season_number > 0);
    
    // Mostrar selector de episodios
    document.getElementById('episodeSelector').style.display = 'block';
    renderSeasons();
    
    // Ocultar fuentes hasta que se seleccione episodio
    document.getElementById('sourcesList').innerHTML = '<div class="loading">👆 Primero selecciona una temporada y episodio</div>';
    document.getElementById('btnCreateRoom').disabled = true;
    
  } catch (error) {
    console.error('Error cargando temporadas:', error);
    alert('Error al cargar las temporadas');
  }
}

// RENDERIZAR SELECTOR DE TEMPORADAS
function renderSeasons() {
  const select = document.getElementById('seasonSelect');
  select.innerHTML = '<option value="">Selecciona una temporada...</option>';
  
  selectedMovie.seasons.forEach(season => {
    const option = document.createElement('option');
    option.value = season.season_number;
    option.textContent = `Temporada ${season.season_number} (${season.episode_count} episodios)`;
    select.appendChild(option);
  });
  
  // Event listener para cuando se selecciona una temporada
  select.onchange = (e) => {
    const seasonNumber = parseInt(e.target.value);
    if (seasonNumber) {
      selectSeason(seasonNumber);
    } else {
      // Si deselecciona, ocultar episodios
      document.getElementById('episodeSelectorContainer').style.display = 'none';
      document.getElementById('episodeSelect').innerHTML = '<option value="">Selecciona un episodio...</option>';
    }
  };
}

// SELECCIONAR TEMPORADA Y CARGAR EPISODIOS
async function selectSeason(seasonNumber) {
  selectedMovie.selectedSeason = seasonNumber;
  selectedMovie.selectedEpisode = null;
  
  // Cargar episodios de esta temporada
  await loadEpisodes(seasonNumber);
}

// CARGAR EPISODIOS DE UNA TEMPORADA (EN ESPAÑOL)
async function loadEpisodes(seasonNumber) {
  try {
    const url = `https://api.themoviedb.org/3/tv/${selectedMovie.id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url);
    const data = await res.json();
    
    selectedMovie.episodes = data.episodes;
    
    // Mostrar contenedor de episodios y renderizar
    document.getElementById('episodeSelectorContainer').style.display = 'block';
    renderEpisodes();
    
  } catch (error) {
    console.error('Error cargando episodios:', error);
    alert('Error al cargar los episodios');
  }
}

// RENDERIZAR SELECTOR DE EPISODIOS
function renderEpisodes() {
  const select = document.getElementById('episodeSelect');
  select.innerHTML = '<option value="">Selecciona un episodio...</option>';
  
  selectedMovie.episodes.forEach(episode => {
    const option = document.createElement('option');
    option.value = episode.episode_number;
    // Formato: "1. Nombre del Episodio"
    option.textContent = `${episode.episode_number}. ${episode.name || 'Sin título'}`;
    select.appendChild(option);
  });
  
  // Event listener para cuando se selecciona un episodio
  select.onchange = (e) => {
    const episodeNumber = parseInt(e.target.value);
    if (episodeNumber) {
      selectEpisode(episodeNumber);
    } else {
      // Si deselecciona, ocultar fuentes
      document.getElementById('sourcesList').innerHTML = '<div class="loading">👆 Selecciona un episodio</div>';
      document.getElementById('btnCreateRoom').disabled = true;
    }
  };
}

// SELECCIONAR EPISODIO Y CARGAR FUENTES
function selectEpisode(episodeNumber) {
  selectedMovie.selectedEpisode = episodeNumber;
  
  // Ahora sí, cargar las fuentes para este episodio específico
  loadSources();
}

// CARGAR FUENTES
async function loadSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const manifestUrl = roomConfig.projectorType === 'custom' 
    ? roomConfig.customManifest 
    : PUBLIC_MANIFEST;
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = selectedMovie.type === 'movie' ? 'movie' : 'series';
    
    // Construir URL según el tipo de contenido
    let streamUrl;
    if (selectedMovie.type === 'movie') {
      streamUrl = `${baseUrl}/stream/${streamType}/${selectedMovie.imdbId}.json`;
    } else {
      // Para series: incluir temporada y episodio
      const season = selectedMovie.selectedSeason;
      const episode = selectedMovie.selectedEpisode;
      streamUrl = `${baseUrl}/stream/${streamType}/${selectedMovie.imdbId}:${season}:${episode}.json`;
    }
    
    console.log('🔍 Buscando en:', streamUrl);
    
    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');
    
    const data = await res.json();
    
    sources = (data.streams || [])
      .filter(s => s && s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));
    
    if (sources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      document.getElementById('btnCreateRoom').disabled = true;
      return;
    }
    
    renderSources();
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
    document.getElementById('btnCreateRoom').disabled = true;
  }
}

// RENDERIZAR FUENTES
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
  
  document.getElementById('btnCreateRoom').disabled = false;
}

function selectSource(index) {
  selectedSourceIndex = index;
  
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

// CREAR SALA Y REDIRIGIR
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
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      const roomId = data.projectorRoom.id;
      
      // MARCAR COMO ANFITRIÓN (no mostrar configuración de invitado)
      sessionStorage.setItem('projectorroom_is_host_' + roomId, 'true');
      sessionStorage.setItem('projectorroom_host_username_' + roomId, roomConfig.username);
      
      // REDIRIGIR A LA SALA
      window.location.href = `/sala/${roomId}`;
    } else {
      alert('Error creando sala');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error creando sala');
  }
}

// UTILIDADES
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
