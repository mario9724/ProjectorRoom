const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let currentStep = 1;
let searchTimeout = null;
let selectedMovie = null;
let sources = [];
let selectedSourceIndex = null;
let selectedEpisode = null; // NUEVO: episodio seleccionado
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

  input.focus();
}

// BUSCAR PELÍCULAS
async function searchMovies(query) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="loading">🔍 Buscando...</div>';

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    const data = await res.json();

    const filtered = data.results
      .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path);

    if (filtered.length === 0) {
      container.innerHTML = '<div class="loading">No se encontraron resultados</div>';
      return;
    }

    renderMovieGrid(filtered);
  } catch (error) {
    console.error('Error buscando:', error);
    container.innerHTML = '<div class="loading">Error en la búsqueda</div>';
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

// SELECCIONAR PELÍCULA O SERIE
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

    // NUEVO: Si es serie, obtener temporadas
    if (selectedMovie.type === 'series') {
      const detailsUrl = `https://api.themoviedb.org/3/tv/${movie.id}?api_key=${TMDB_API_KEY}&language=es-ES`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      selectedMovie.seasons = detailsData.seasons || [];
    }

    goToStep(6);
    renderSelectedMovie();
    
    // NUEVO: Si es serie, mostrar selector de episodios
    if (selectedMovie.type === 'series') {
      showEpisodeSelector();
    } else {
      loadSources();
    }

  } catch (error) {
    console.error('Error obteniendo IMDb ID:', error);
    alert('Error obteniendo información');
  }
}

// NUEVO: MOSTRAR SELECTOR DE EPISODIOS
async function showEpisodeSelector() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = `
    <div style="margin-bottom: 30px;">
      <h3 class="section-title">Selecciona temporada y episodio</h3>
      <div style="display: flex; gap: 15px; margin-bottom: 20px;">
        <select id="seasonSelect" style="flex: 1; padding: 12px; background: #2a2a2a; border: 2px solid #3a3a3a; border-radius: 10px; color: #fff; font-size: 1rem;">
          <option value="">Selecciona temporada...</option>
        </select>
        <select id="episodeSelect" style="flex: 1; padding: 12px; background: #2a2a2a; border: 2px solid #3a3a3a; border-radius: 10px; color: #fff; font-size: 1rem;" disabled>
          <option value="">Primero selecciona temporada</option>
        </select>
      </div>
      <div id="episodeInfo" style="background: #1a1a1a; padding: 15px; border-radius: 10px; border: 1px solid #2a2a2a; display: none;">
        <h4 id="episodeTitle" style="color: #fff; margin-bottom: 8px;"></h4>
        <p id="episodeOverview" style="color: #999; font-size: 0.9rem; line-height: 1.4;"></p>
      </div>
    </div>
    <div id="episodeSourcesList"></div>
  `;

  const seasonSelect = document.getElementById('seasonSelect');
  const episodeSelect = document.getElementById('episodeSelect');

  // Llenar selector de temporadas
  selectedMovie.seasons
    .filter(s => s.season_number > 0)
    .forEach(season => {
      const option = document.createElement('option');
      option.value = season.season_number;
      option.textContent = `Temporada ${season.season_number} (${season.episode_count} episodios)`;
      seasonSelect.appendChild(option);
    });

  // Evento cambio de temporada
  seasonSelect.addEventListener('change', async function() {
    const seasonNum = parseInt(this.value);
    if (!seasonNum) return;

    episodeSelect.disabled = true;
    episodeSelect.innerHTML = '<option value="">Cargando episodios...</option>';

    try {
      const url = `https://api.themoviedb.org/3/tv/${selectedMovie.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=es-ES`;
      const res = await fetch(url);
      const data = await res.json();

      episodeSelect.innerHTML = '<option value="">Selecciona episodio...</option>';
      data.episodes.forEach(ep => {
        const option = document.createElement('option');
        option.value = ep.episode_number;
        option.dataset.name = ep.name;
        option.dataset.overview = ep.overview;
        option.textContent = `${ep.episode_number}. ${ep.name}`;
        episodeSelect.appendChild(option);
      });

      episodeSelect.disabled = false;
    } catch (error) {
      console.error('Error cargando episodios:', error);
      episodeSelect.innerHTML = '<option value="">Error cargando episodios</option>';
    }
  });

  // Evento cambio de episodio
  episodeSelect.addEventListener('change', function() {
    const seasonNum = parseInt(seasonSelect.value);
    const episodeNum = parseInt(this.value);
    
    if (!seasonNum || !episodeNum) {
      document.getElementById('episodeInfo').style.display = 'none';
      return;
    }

    const selectedOption = this.options[this.selectedIndex];
    const episodeName = selectedOption.dataset.name;
    const episodeOverview = selectedOption.dataset.overview;

    selectedEpisode = {
      season: seasonNum,
      episode: episodeNum,
      name: episodeName,
      overview: episodeOverview
    };

    // Mostrar info del episodio
    document.getElementById('episodeTitle').textContent = `${seasonNum}x${episodeNum} - ${episodeName}`;
    document.getElementById('episodeOverview').textContent = episodeOverview || 'Sin descripción disponible';
    document.getElementById('episodeInfo').style.display = 'block';

    // Cargar fuentes para este episodio
    loadSources();
  });

  document.getElementById('btnCreateRoom').disabled = true;
}

// RENDERIZAR PELÍCULA SELECCIONADA
function renderSelectedMovie() {
  document.getElementById('selectedPoster').src = selectedMovie.poster;
  document.getElementById('selectedTitle').textContent = selectedMovie.title;
  document.getElementById('selectedRating').textContent = '⭐ ' + selectedMovie.rating;
  document.getElementById('selectedYear').textContent = selectedMovie.year;
  document.getElementById('selectedType').textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  document.getElementById('selectedOverview').textContent = selectedMovie.overview;
}

// CARGAR FUENTES
async function loadSources() {
  const containerId = selectedMovie.type === 'series' ? 'episodeSourcesList' : 'sourcesList';
  const container = document.getElementById(containerId);
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';

  const manifestUrl = roomConfig.projectorType === 'custom' ? roomConfig.customManifest : PUBLIC_MANIFEST;

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('manifest.json', '');
    
    let streamUrl;
    if (selectedMovie.type === 'movie') {
      streamUrl = `${baseUrl}stream/movie/${selectedMovie.imdbId}.json`;
    } else {
      // NUEVO: Formato Stremio para episodios: {imdbId}:{season}:{episode}
      if (!selectedEpisode) {
        container.innerHTML = '<div class="loading">Por favor, selecciona un episodio</div>';
        return;
      }
      streamUrl = `${baseUrl}stream/series/${selectedMovie.imdbId}:${selectedEpisode.season}:${selectedEpisode.episode}.json`;
    }

    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');

    const data = await res.json();
    sources = data.streams
      .filter(s => s.url && (s.url.startsWith('http') || s.url.startsWith('https')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));

    if (sources.length === 0) {
      container.innerHTML = '<div class="loading">No se encontraron fuentes disponibles</div>';
      document.getElementById('btnCreateRoom').disabled = true;
      return;
    }

    renderSources(containerId);
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">Error: ${error.message}</div>`;
    document.getElementById('btnCreateRoom').disabled = true;
  }
}

// RENDERIZAR FUENTES
function renderSources(containerId = 'sourcesList') {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  sources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectSource(index);
    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">📡 ${escapeHtml(source.provider)}</div>
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
    manifest: JSON.stringify({
      ...selectedMovie,
      episode: selectedEpisode // NUEVO: incluir info del episodio
    }),
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
      sessionStorage.setItem('projectorroom_is_host_' + roomId, 'true');
      sessionStorage.setItem('projectorroom_host_username_' + roomId, roomConfig.username);
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
