const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreams.stremio.ru/stremio/8f3b4883-a738-4363-9736-f54ebbd2d620/eyJpIjoiV3RjMjczQ1FpL0plQy8zK1ZVaS9FUT09IiwiZSI6ImRQRDFQMjdiclhTYXVtRHlyWXlpOS9uQ3VVcW41Y1hlTzdYRjRLZkd0N289IiwidCI6ImEifQ/manifest.json';

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
    overview: movie.overview || 'Sin descripción disponible'
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
    loadSources();
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
    const streamUrl = `${baseUrl}/stream/${streamType}/${selectedMovie.imdbId}.json`;
    
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
