const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST =
  'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

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
  shareMode: 'host' // host | guests
};

// Series selector state
let seriesSeasons = [];
let selectedSeason = 1;
let selectedEpisode = 1;

// ==================== NAVEGACIÓN ENTRE PASOS ====================
function goToStep(step) {
  if (step === 2) {
    const username = document.getElementById('username').value.trim();
    if (!username) return alert('Por favor, escribe tu nombre');
    roomConfig.username = username;
  }

  if (step === 3) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) return alert('Por favor, escribe el nombre de la sala');
    roomConfig.roomName = roomName;
  }

  if (step === 4) {
    roomConfig.projectorType = document.querySelector('input[name="projectorType"]:checked').value;

    if (roomConfig.projectorType === 'custom') {
      roomConfig.customManifest = document.getElementById('customManifest').value.trim();
      if (!roomConfig.customManifest) return alert('Por favor, introduce la URL del manifest.json');
    }
  }

  if (step === 5) {
    roomConfig.shareMode = document.querySelector('input[name="shareMode"]:checked').value;
  }

  document.getElementById('step' + currentStep).classList.remove('active');

  currentStep = step;
  document.getElementById('step' + step).classList.add('active');

  if (step === 5) setTimeout(initSearch, 100);
}

// ==================== SELECCIÓN DE TIPO DE PROYECTOR ====================
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

// ==================== SELECCIÓN DE MODO COMPARTIR ====================
function selectShareMode(mode) {
  document.querySelectorAll('input[name="shareMode"]').forEach(radio => {
    radio.checked = radio.value === mode;
  });

  document.querySelectorAll('#step4 .option-card').forEach(card => {
    card.classList.remove('selected');
  });

  event.currentTarget.classList.add('selected');
}

// ==================== INICIALIZAR BÚSQUEDA ====================
function initSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', function () {
    clearTimeout(searchTimeout);

    const query = this.value.trim();
    if (query.length < 2) {
      document.getElementById('searchResults').innerHTML =
        '<div class="loading">Escribe al menos 2 caracteres...</div>';
      return;
    }

    searchTimeout = setTimeout(() => searchMovies(query), 500);
  });
}

// ==================== BUSCAR ====================
async function searchMovies(query) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '<div class="loading">Buscando...</div>';

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url);
    const data = await res.json();

    const filtered = (data.results || []).filter(
      item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
    );

    if (!filtered.length) {
      container.innerHTML = '<div class="loading">No se encontraron resultados</div>';
      return;
    }

    renderMovieGrid(filtered);
  } catch (e) {
    console.error('Error buscando:', e);
    container.innerHTML = '<div class="loading">Error en la búsqueda</div>';
  }
}

// ==================== GRID RESULTADOS ====================
function renderMovieGrid(items) {
  const container = document.getElementById('searchResults');
  container.innerHTML = '';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => selectMovie(item);

    card.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w500${item.poster_path}" alt="${escapeHtml(
      item.title || item.name
    )}" />
      <div class="movie-card-info">
        <div class="movie-card-title">${escapeHtml(item.title || item.name)}</div>
        <div class="movie-card-meta">${item.vote_average ? item.vote_average.toFixed(1) : 'NA'}</div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==================== SELECCIONAR ITEM ====================
async function selectMovie(item) {
  selectedMovie = {
    id: item.id,
    type: item.media_type === 'movie' ? 'movie' : 'series',
    title: item.title || item.name,
    poster: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
    backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    rating: item.vote_average ? item.vote_average.toFixed(1) : 'NA',
    year: (item.release_date || item.first_air_date || '').substring(0, 4),
    overview: item.overview || 'Sin descripción disponible',
    imdbId: null,
    season: null,
    episode: null
  };

  try {
    const type = item.media_type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${type}/${item.id}/external_ids?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    selectedMovie.imdbId = data.imdb_id || null;

    if (!selectedMovie.imdbId) {
      alert('No se encontró IMDb ID para este contenido');
      return;
    }

    goToStep(6);
    renderSelectedMovie();

    if (selectedMovie.type === 'series') {
      await initSeriesEpisodeSelector();
    } else {
      removeSeriesEpisodeSelector();
    }

    await loadSources();
  } catch (e) {
    console.error('Error obteniendo IMDb ID:', e);
    alert('Error obteniendo información');
  }
}

function renderSelectedMovie() {
  document.getElementById('selectedPoster').src = selectedMovie.poster;
  document.getElementById('selectedTitle').textContent = selectedMovie.title;
  document.getElementById('selectedRating').textContent = selectedMovie.rating;
  document.getElementById('selectedYear').textContent = selectedMovie.year;
  document.getElementById('selectedType').textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  document.getElementById('selectedOverview').textContent = selectedMovie.overview;
}

// ==================== SELECTOR TEMP/EP (SERIES) ====================
function ensureSeriesSelectorContainer() {
  let box = document.getElementById('seriesEpisodeSelector');
  if (box) return box;

  const sourcesList = document.getElementById('sourcesList');
  if (!sourcesList) return null;

  box = document.createElement('div');
  box.id = 'seriesEpisodeSelector';
  box.style.margin = '10px 0 16px 0';
  box.style.padding = '12px';
  box.style.border = '1px solid #3a3a3a';
  box.style.borderRadius = '12px';
  box.style.background = '#1a1a1a';

  sourcesList.parentNode.insertBefore(box, sourcesList);
  return box;
}

function removeSeriesEpisodeSelector() {
  document.getElementById('seriesEpisodeSelector')?.remove();
}

async function initSeriesEpisodeSelector() {
  const box = ensureSeriesSelectorContainer();
  if (!box) return;

  box.innerHTML = `<div class="loading">Cargando temporadas...</div>`;

  const tvUrl = `https://api.themoviedb.org/3/tv/${selectedMovie.id}?api_key=${TMDB_API_KEY}&language=es-ES`;
  const tvRes = await fetch(tvUrl);
  const tvData = await tvRes.json();

  seriesSeasons = (tvData.seasons || [])
    .filter(s => typeof s.season_number === 'number' && s.season_number >= 0)
    .sort((a, b) => a.season_number - b.season_number);

  const hasSeason1 = seriesSeasons.some(s => s.season_number === 1);
  selectedSeason = hasSeason1 ? 1 : (seriesSeasons[0]?.season_number ?? 1);

  const episodes = await fetchSeasonEpisodes(selectedSeason);
  selectedEpisode = 1;

  selectedMovie.season = selectedSeason;
  selectedMovie.episode = selectedEpisode;

  renderSeriesSelector(box, seriesSeasons, episodes);
}

async function fetchSeasonEpisodes(seasonNumber) {
  const url = `https://api.themoviedb.org/3/tv/${selectedMovie.id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=es-ES`;
  const res = await fetch(url);
  const data = await res.json();

  return (data.episodes || [])
    .filter(e => typeof e.episode_number === 'number' && e.episode_number >= 1)
    .sort((a, b) => a.episode_number - b.episode_number);
}

function renderSeriesSelector(container, seasons, episodes) {
  const seasonOptions = seasons
    .map(s => {
      const sn = s.season_number;
      const name = s.name || (sn === 0 ? 'Especiales' : `Temporada ${sn}`);
      return `<option value="${sn}" ${sn === selectedSeason ? 'selected' : ''}>${escapeHtml(name)}</option>`;
    })
    .join('');

  const episodeOptions = episodes
    .map(e => {
      const en = e.episode_number;
      const label = `E${String(en).padStart(2, '0')} - ${e.name ? e.name : 'Episodio'}`;
      return `<option value="${en}" ${en === selectedEpisode ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    })
    .join('');

  container.innerHTML = `
    <div style="font-weight:600; margin-bottom:10px;">Selecciona capítulo</div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">
      <div style="flex:1; min-width:160px;">
        <div style="font-size:0.9rem; color:#999; margin-bottom:6px;">Temporada</div>
        <select id="seasonSelect" style="width:100%; padding:12px; border-radius:10px; border:1px solid #3a3a3a; background:#2a2a2a; color:#fff;">
          ${seasonOptions}
        </select>
      </div>
      <div style="flex:2; min-width:220px;">
        <div style="font-size:0.9rem; color:#999; margin-bottom:6px;">Episodio</div>
        <select id="episodeSelect" style="width:100%; padding:12px; border-radius:10px; border:1px solid #3a3a3a; background:#2a2a2a; color:#fff;">
          ${episodeOptions}
        </select>
      </div>
    </div>
  `;

  const seasonSelect = document.getElementById('seasonSelect');
  const episodeSelect = document.getElementById('episodeSelect');

  seasonSelect.addEventListener('change', async () => {
    selectedSeason = parseInt(seasonSelect.value, 10) || 1;
    selectedEpisode = 1;

    selectedMovie.season = selectedSeason;
    selectedMovie.episode = selectedEpisode;

    const eps = await fetchSeasonEpisodes(selectedSeason);
    renderSeriesSelector(container, seasons, eps);
    await loadSources();
  });

  episodeSelect.addEventListener('change', async () => {
    selectedEpisode = parseInt(episodeSelect.value, 10) || 1;

    selectedMovie.season = selectedSeason;
    selectedMovie.episode = selectedEpisode;

    await loadSources();
  });
}

// ==================== ID STREMIO ====================
function buildStreamIdForAddon() {
  if (selectedMovie.type === 'movie') return selectedMovie.imdbId;
  const s = selectedMovie.season || 1;
  const e = selectedMovie.episode || 1;
  return `${selectedMovie.imdbId}:${s}:${e}`;
}

// ==================== CARGAR FUENTES (HOST) ====================
async function loadSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '<div class="loading">Buscando fuentes...</div>';

  const manifestUrl =
    roomConfig.projectorType === 'custom' ? roomConfig.customManifest : PUBLIC_MANIFEST;

  if (selectedMovie.type === 'series' && (!selectedMovie.season || !selectedMovie.episode)) {
    container.innerHTML = '<div class="loading">Selecciona temporada y episodio</div>';
    document.getElementById('btnCreateRoom').disabled = true;
    return;
  }

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('manifest.json', '');

    const streamType = selectedMovie.type === 'movie' ? 'movie' : 'series';
    const streamId = buildStreamIdForAddon();

    // Mantengo .json por compatibilidad con lo que venías usando
    const streamUrl = `${baseUrl}stream/${streamType}/${encodeURIComponent(streamId)}.json`;

    const res = await fetch(streamUrl);
    if (!res.ok) throw new Error('No se encontraron fuentes');

    const data = await res.json();

    sources = (data.streams || [])
      .filter(s => s.url && (s.url.startsWith('http') || s.url.startsWith('https')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));

    if (!sources.length) {
      container.innerHTML = '<div class="loading">No se encontraron fuentes disponibles</div>';
      document.getElementById('btnCreateRoom').disabled = true;
      return;
    }

    renderSources();
  } catch (e) {
    console.error('Error cargando fuentes:', e);
    container.innerHTML = `<div class="loading">Error: ${escapeHtml(e.message)}</div>`;
    document.getElementById('btnCreateRoom').disabled = true;
  }
}

function renderSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '';

  sources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectSource(index);

    card.innerHTML = `
      <div class="source-title">${escapeHtml(source.title)}</div>
      <div class="source-meta">${escapeHtml(source.provider)}</div>
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

// ==================== CREAR SALA ====================
async function createRoom() {
  if (selectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }

  const roomPayload = {
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
      body: JSON.stringify(roomPayload)
    });

    const data = await res.json();
    if (!data.success) return alert('Error creando sala');

    const id = data.projectorRoom.id;

    sessionStorage.setItem(`projectorroom_is_host_${id}`, 'true');
    sessionStorage.setItem(`projectorroom_host_username_${id}`, roomConfig.username);

    localStorage.removeItem(`projectorroom_guest_configured_${id}`);
    localStorage.removeItem(`projectorroom_guest_source_${id}`);
    localStorage.removeItem(`projectorroom_guest_projector_${id}`);
    localStorage.removeItem(`projectorroom_guest_manifest_${id}`);

    window.location.href = `/sala/${id}`;
  } catch (e) {
    console.error('Error:', e);
    alert('Error creando sala');
  }
}

// ==================== UTIL ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
