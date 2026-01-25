const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreams.stremio.ru/stremio/8f3b4883-a738-4363-9736-f54ebbd2d620/eyJpIjoiV3RjMjczQ1FpL0plQy8zK1ZVaS9FUT09IiwiZSI6ImRQRDFQMjdiclhTYXVtRHlyWXlpOS9uQ3VVcW41Y1hlTzdYRjRLZkd0N289IiwidCI6ImEifQ/manifest.json';

let selectedMovie = null;
let seasons = [];
let selectedEpisode = null;
let useHostSource = true;
let hostUsername = '';
let projectType = 'public';
let customManifest = '';

window.addEventListener('load', function() {
  console.log('🚀 Inicializando creación de sala');

  const movieDataStr = sessionStorage.getItem('projectorroom:selectedmovie');
  if (!movieDataStr) {
    alert('No se encontró la película/serie seleccionada');
    window.location.href = '/';
    return;
  }

  selectedMovie = JSON.parse(movieDataStr);
  console.log('🎬 Película/Serie:', selectedMovie);

  renderMovieInfo();
  setupEventListeners();

  if (selectedMovie.type === 'series') {
    console.log('📺 Es serie, cargando temporadas');
    loadSeasons();
  } else {
    console.log('🎥 Es película');
    loadSources();
  }
});

function renderMovieInfo() {
  const posterEl = document.getElementById('moviePoster');
  const titleEl = document.getElementById('movieTitle');
  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const ratingEl = document.getElementById('movieRating');
  const overviewEl = document.getElementById('movieOverview');

  if (posterEl) posterEl.src = selectedMovie.poster || '';
  if (titleEl) titleEl.textContent = selectedMovie.title || 'Sin título';
  if (yearEl) yearEl.textContent = '📅 ' + (selectedMovie.year || 'N/A');
  if (typeEl) typeEl.textContent = '🎬 ' + (selectedMovie.type === 'movie' ? 'Película' : 'Serie');
  if (ratingEl) ratingEl.textContent = '⭐ ' + (selectedMovie.rating || 'N/A');
  if (overviewEl) overviewEl.textContent = selectedMovie.overview || 'Sin descripción disponible';
}

async function loadSeasons() {
  console.log('📺 Cargando temporadas...');

  try {
    const url = `https://api.themoviedb.org/3/tv/${selectedMovie.tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url);
    const data = await res.json();

    seasons = data.seasons.filter(s => s.season_number > 0);
    console.log('✅', seasons.length, 'temporadas');

    renderSeasonSelector();
  } catch (error) {
    console.error('❌ Error cargando temporadas:', error);
    alert('Error al cargar las temporadas');
  }
}

function renderSeasonSelector() {
  console.log('🔍 selectedMovie.type:', selectedMovie.type);

  if (selectedMovie.type === 'series') {
    console.log('📺 Es serie, mostrando selector');
    const selector = document.getElementById('episodeSelectorContainer');
    if (selector) {
      selector.style.display = 'block';

      const seasonSelect = document.getElementById('seasonSelect');
      seasonSelect.innerHTML = '<option value="">Selecciona temporada</option>';

      seasons.forEach(season => {
        const option = document.createElement('option');
        option.value = season.season_number;
        option.textContent = `Temporada ${season.season_number}`;
        seasonSelect.appendChild(option);
      });
    }
  }
}

window.onSeasonChange = async function() {
  const seasonNum = document.getElementById('seasonSelect').value;

  if (!seasonNum) {
    document.getElementById('episodeSelect').innerHTML = '<option value="">Primero selecciona temporada</option>';
    return;
  }

  console.log('📺 Cargando T' + seasonNum + '...');

  try {
    const url = `https://api.themoviedb.org/3/tv/${selectedMovie.tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=es-ES`;
    console.log('🔗 URL:', url);

    const res = await fetch(url);
    console.log('📊 Status:', res.status);

    const data = await res.json();
    console.log('📋 Episodios:', data.episodes.length);

    const episodeSelect = document.getElementById('episodeSelect');
    episodeSelect.innerHTML = '<option value="">Selecciona episodio</option>';

    data.episodes.forEach(ep => {
      console.log('✅ T' + seasonNum + 'E' + ep.episode_number);

      const option = document.createElement('option');
      option.value = JSON.stringify({
        season_number: seasonNum,
        episode_number: ep.episode_number,
        name: ep.name,
        imdb_id: ep.imdb_id || null
      });
      option.textContent = `${ep.episode_number}. ${ep.name}`;
      episodeSelect.appendChild(option);
    });

    episodeSelect.disabled = false;
  } catch (error) {
    console.error('❌ Error cargando episodios:', error);
    alert('Error al cargar los episodios');
  }
};

window.onEpisodeChange = function() {
  const episodeData = document.getElementById('episodeSelect').value;

  if (!episodeData) {
    selectedEpisode = null;
    return;
  }

  selectedEpisode = JSON.parse(episodeData);
  console.log('📺 Episodio seleccionado:', selectedEpisode);

  loadSources();
};

async function loadSources() {
  console.log('🔍 Cargando fuentes...');

  const sourcesContainer = document.getElementById('sourcesList');
  sourcesContainer.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';

  const manifestUrl = projectType === 'custom' ? customManifest : PUBLIC_MANIFEST;
  console.log('📡 Manifest:', manifestUrl);

  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');

    let streamUrl;

    if (selectedMovie.type === 'movie') {
      streamUrl = `${baseUrl}/stream/movie/${selectedMovie.imdbId}.json`;
    } else {
      if (!selectedEpisode) {
        sourcesContainer.innerHTML = '<div class="loading">⚠️ Selecciona un episodio primero</div>';
        return;
      }

      // CONSTRUCCIÓN CORRECTA DE LA URL PARA SERIES
      const seasonNum = selectedEpisode.season_number;
      const episodeNum = selectedEpisode.episode_number;

      // Formato: /stream/series/tt123456:1:1.json
      streamUrl = `${baseUrl}/stream/series/${selectedMovie.imdbId}:${seasonNum}:${episodeNum}.json`;
    }

    console.log('🎬 Stream URL:', streamUrl);

    const res = await fetch(streamUrl);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: No se encontraron fuentes`);
    }

    const data = await res.json();
    console.log('📊 Respuesta:', data);

    const sources = (data.streams || [])
      .filter(s => s && s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));

    console.log('✅ Fuentes encontradas:', sources.length);

    if (sources.length === 0) {
      sourcesContainer.innerHTML = '<div class="loading">😕 No se encontraron fuentes para este contenido</div>';
      return;
    }

    renderSources(sources);
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    sourcesContainer.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

function renderSources(sources) {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '';

  sources.forEach((source, index) => {
    const card = document.createElement('div');
    card.className = 'source-card';
    card.onclick = () => selectSource(source.url);

    card.innerHTML = `<div class="source-title">${escapeHtml(source.title)}</div>
<div class="source-meta">🔌 ${escapeHtml(source.provider)}</div>`;

    container.appendChild(card);
  });
}

function selectSource(url) {
  document.querySelectorAll('.source-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');

  sessionStorage.setItem('projectorroom:selectedsource', url);
  console.log('✅ Fuente seleccionada:', url);
}

function setupEventListeners() {
  const sourceTypeRadios = document.querySelectorAll('input[name="sourceType"]');
  sourceTypeRadios.forEach(radio => {
    radio.addEventListener('change', e => {
      useHostSource = e.target.value === 'host';
      console.log('🔄 useHostSource:', useHostSource);
    });
  });

  const projectorTypeRadios = document.querySelectorAll('input[name="projectorType"]');
  projectorTypeRadios.forEach(radio => {
    radio.addEventListener('change', e => {
      projectType = e.target.value;

      const customBox = document.getElementById('customManifestBox');
      if (customBox) {
        customBox.style.display = projectType === 'custom' ? 'block' : 'none';
      }

      if (projectType === 'public' || customManifest) {
        loadSources();
      }
    });
  });

  const customManifestInput = document.getElementById('customManifestInput');
  if (customManifestInput) {
    customManifestInput.addEventListener('blur', e => {
      customManifest = e.target.value.trim();
      if (customManifest && projectType === 'custom') {
        loadSources();
      }
    });
  }

  document.getElementById('btnCreateRoom').onclick = createRoom;
}

async function createRoom() {
  const roomName = document.getElementById('roomName').value.trim();
  hostUsername = document.getElementById('hostUsername').value.trim();

  if (!roomName || !hostUsername) {
    alert('Por favor, completa todos los campos');
    return;
  }

  if (selectedMovie.type === 'series' && !selectedEpisode) {
    alert('Por favor, selecciona un episodio');
    return;
  }

  let sourceUrl = null;

  if (useHostSource) {
    sourceUrl = sessionStorage.getItem('projectorroom:selectedsource');
    if (!sourceUrl) {
      alert('Por favor, selecciona una fuente');
      return;
    }
  }

  const roomData = {
    roomName,
    hostUsername,
    manifest: JSON.stringify(selectedMovie),
    selectedEpisode: selectedEpisode ? JSON.stringify(selectedEpisode) : null,
    sourceUrl,
    useHostSource
  };

  console.log('📤 Creando sala:', roomData);

  try {
    const res = await fetch('/api/projectorrooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });

    const data = await res.json();

    if (data.success) {
      console.log('✅ Sala creada:', data.roomId);

      sessionStorage.setItem(`projectorroom:ishost:${data.roomId}`, 'true');
      sessionStorage.setItem(`projectorroom:hostusername:${data.roomId}`, hostUsername);

      window.location.href = '/sala/' + data.roomId;
    } else {
      alert('Error: ' + data.message);
    }
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    alert('Error al crear la sala');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
