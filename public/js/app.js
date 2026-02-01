const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://aiostreams-nightly.stremio.ru/stremio/f18d6a2e-742d-4ae6-8866-2c7b2484031f/eyJpIjoiM2tVUUwxWGhTUlE3azRrK2E4eFZJdz09IiwiZSI6ImxDWkE2dGJPYXFta2FTSUNBaGt2TkRzL1NQRlFteGtZUzJ4WVd2YXRsNFE9IiwidCI6ImEifQ/manifest.json';

let currentStep = 1;
let searchTimeout = null;
let selectedMovie = null;
let sources = [];
let selectedSourceIndex = null;
let selectedSeason = null;
let selectedEpisode = null;

// ⭐ Variables para cambio de contenido
let isChangingContent = false;
let changingRoomId = null;

let roomConfig = {
  username: '',
  roomName: '',
  projectorType: 'public',
  customManifest: '',
  shareMode: 'host'
};

// ⭐ CORREGIDO: Verificar si estamos cambiando contenido al cargar
window.addEventListener('load', function() {
  changingRoomId = sessionStorage.getItem('projectorroom_changing_content');
  
  if (changingRoomId) {
    console.log('🔄 Modo cambio de contenido - Sala:', changingRoomId);
    isChangingContent = true;
    
    // ⭐ RECUPERAR TODA la configuración guardada
    roomConfig.username = sessionStorage.getItem('projectorroom_host_username_' + changingRoomId) || '';
    roomConfig.roomName = sessionStorage.getItem('projectorroom_change_room_name') || '';
    roomConfig.shareMode = sessionStorage.getItem('projectorroom_change_use_host_source') === 'true' ? 'host' : 'individual';
    roomConfig.projectorType = sessionStorage.getItem('projectorroom_projector_type_' + changingRoomId) || 'public';
    roomConfig.customManifest = sessionStorage.getItem('projectorroom_custom_manifest_' + changingRoomId) || '';
    
    console.log('📋 Configuración recuperada:', roomConfig);
    
    // ⭐ IR DIRECTO AL PASO 5 (sin mostrar pasos 1-4)
    setTimeout(() => {
      goToStep(5);
    }, 100);
    
    return; // ⭐ IMPORTANTE: NO ejecutar el resto del código
  }
});

// ⭐ CORREGIDO: goToStep() - Saltar pasos si es cambio de contenido
function goToStep(step) {
  console.log('📍 goToStep:', step, '| Modo cambio:', isChangingContent);
  
  // Validaciones (solo si NO estamos cambiando contenido)
  if (!isChangingContent) {
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
  }
  
  // ⭐ SI ES CAMBIO DE CONTENIDO, SIEMPRE ir al paso 5
  if (isChangingContent && step < 5) {
    step = 5;
    console.log('🔄 Forzando paso 5 (cambio de contenido)');
  }
  
  // ⭐ Ocultar TODOS los pasos
  for (let i = 1; i <= 6; i++) {
    const stepEl = document.getElementById('step' + i);
    if (stepEl) stepEl.classList.remove('active');
  }
  
  // ⭐ Mostrar SOLO el paso solicitado
  currentStep = step;
  const targetStepEl = document.getElementById('step' + step);
  if (targetStepEl) {
    targetStepEl.classList.add('active');
    console.log('✅ Paso', step, 'mostrado');
  }
  
  // ⭐ Inicializar búsqueda SOLO en paso 5
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
  if (customBox) {
    customBox.style.display = type === 'custom' ? 'block' : 'none';
  }
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
  if (!input) {
    console.error('❌ No se encontró #searchInput');
    return;
  }
  
  console.log('🔍 Inicializando búsqueda...');
  
  // Limpiar listener anterior
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  
  newInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();
    
    if (query.length < 2) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    
    searchTimeout = setTimeout(() => searchMovies(query), 500);
  });
  
  newInput.focus();
}

// BUSCAR PELÍCULAS/SERIES
async function searchMovies(query) {
  const resultsContainer = document.getElementById('searchResults');
  if (!resultsContainer) return;
  
  resultsContainer.innerHTML = '<div class="loading">Buscando...</div>';
  
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(query)}&page=1`
    );
    const data = await res.json();
    
    const filtered = data.results.filter(item => 
      (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
    );
    
    if (filtered.length === 0) {
      resultsContainer.innerHTML = '<div class="loading">No se encontraron resultados</div>';
      return;
    }
    
    resultsContainer.innerHTML = '';
    
    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'movie-card';
      card.onclick = () => selectMovie(item);
      
      const title = item.title || item.name;
      const year = item.release_date || item.first_air_date;
      const yearText = year ? year.split('-')[0] : 'N/A';
      const type = item.media_type === 'movie' ? 'Película' : 'Serie';
      
      card.innerHTML = `
        <img src="https://image.tmdb.org/t/p/w200${item.poster_path}" alt="${escapeHtml(title)}">
        <div class="movie-info">
          <div class="movie-title">${escapeHtml(title)}</div>
          <div class="movie-meta">${yearText} · ${type}</div>
        </div>
      `;
      
      resultsContainer.appendChild(card);
    });
    
  } catch (error) {
    console.error('Error buscando:', error);
    resultsContainer.innerHTML = '<div class="loading">Error al buscar</div>';
  }
}

// SELECCIONAR PELÍCULA
async function selectMovie(movie) {
  selectedMovie = movie;
  console.log('🎬 Película seleccionada:', movie);
  
  // Obtener IMDb ID
  try {
    const detailsUrl = `https://api.themoviedb.org/3/${movie.media_type}/${movie.id}/external_ids?api_key=${TMDB_API_KEY}`;
    const res = await fetch(detailsUrl);
    const data = await res.json();
    
    selectedMovie.imdb_id = data.imdb_id;
    
    if (!selectedMovie.imdb_id) {
      alert('No se encontró IMDb ID para este contenido');
      return;
    }
    
    console.log('✅ IMDb ID:', selectedMovie.imdb_id);
    
    // Ir al paso 6 (fuentes)
    goToStep(6);
    
    // Mostrar info de la película
    renderMovieInfo();
    
    // Si es serie, cargar temporadas
    if (selectedMovie.media_type === 'tv') {
      await loadSeasons();
    } else {
      // Si es película, ocultar selector de episodios
      const episodeSelector = document.getElementById('episodeSelector');
      if (episodeSelector) episodeSelector.style.display = 'none';
    }
    
    // Cargar fuentes
    await loadSources();
    
  } catch (error) {
    console.error('Error obteniendo IMDb ID:', error);
    alert('Error obteniendo información de la película. Intenta de nuevo.');
  }
}

// RENDERIZAR INFO DE PELÍCULA
function renderMovieInfo() {
  const title = selectedMovie.title || selectedMovie.name;
  const year = selectedMovie.release_date || selectedMovie.first_air_date;
  const yearText = year ? year.split('-')[0] : 'N/A';
  const type = selectedMovie.media_type === 'movie' ? 'Película' : 'Serie';
  const rating = selectedMovie.vote_average ? selectedMovie.vote_average.toFixed(1) : 'N/A';
  
  const posterEl = document.getElementById('selectedPoster');
  const titleEl = document.getElementById('selectedTitle');
  const ratingEl = document.getElementById('selectedRating');
  const yearEl = document.getElementById('selectedYear');
  const typeEl = document.getElementById('selectedType');
  const overviewEl = document.getElementById('selectedOverview');
  
  if (posterEl) posterEl.src = `https://image.tmdb.org/t/p/w200${selectedMovie.poster_path}`;
  if (titleEl) titleEl.textContent = title;
  if (ratingEl) ratingEl.textContent = `⭐ ${rating}`;
  if (yearEl) yearEl.textContent = yearText;
  if (typeEl) typeEl.textContent = type;
  if (overviewEl) overviewEl.textContent = selectedMovie.overview || 'Sin descripción disponible';
}

// ⭐ CARGAR TEMPORADAS (SOLO SERIES)
async function loadSeasons() {
  console.log('📺 Cargando temporadas...');
  
  const episodeSelector = document.getElementById('episodeSelector');
  const seasonSelect = document.getElementById('seasonSelect');
  
  if (!episodeSelector || !seasonSelect) return;
  
  episodeSelector.style.display = 'block';
  
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${selectedMovie.id}?api_key=${TMDB_API_KEY}&language=es-ES`
    );
    const data = await res.json();
    
    seasonSelect.innerHTML = '<option value="">Selecciona una temporada...</option>';
    
    data.seasons.forEach(season => {
      if (season.season_number > 0) {
        const option = document.createElement('option');
        option.value = season.season_number;
        option.textContent = `Temporada ${season.season_number}`;
        seasonSelect.appendChild(option);
      }
    });
    
    // Listener para cuando seleccione temporada
    seasonSelect.onchange = function() {
      selectedSeason = this.value;
      if (selectedSeason) {
        loadEpisodes(selectedSeason);
      }
    };
    
  } catch (error) {
    console.error('Error cargando temporadas:', error);
  }
}

// ⭐ CARGAR EPISODIOS
async function loadEpisodes(seasonNumber) {
  console.log('📺 Cargando episodios de temporada', seasonNumber);
  
  const episodeSelectorContainer = document.getElementById('episodeSelectorContainer');
  const episodeSelect = document.getElementById('episodeSelect');
  
  if (!episodeSelectorContainer || !episodeSelect) return;
  
  episodeSelectorContainer.style.display = 'block';
  
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${selectedMovie.id}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=es-ES`
    );
    const data = await res.json();
    
    episodeSelect.innerHTML = '<option value="">Selecciona un episodio...</option>';
    
    data.episodes.forEach(episode => {
      const option = document.createElement('option');
      option.value = episode.episode_number;
      option.textContent = `Episodio ${episode.episode_number}: ${episode.name}`;
      episodeSelect.appendChild(option);
    });
    
    // Listener para cuando seleccione episodio
    episodeSelect.onchange = function() {
      selectedEpisode = this.value;
      console.log('✅ Episodio seleccionado:', selectedSeason, 'x', selectedEpisode);
      
      // Recargar fuentes con el episodio seleccionado
      if (selectedEpisode) {
        loadSources();
      }
    };
    
  } catch (error) {
    console.error('Error cargando episodios:', error);
  }
}

// CARGAR FUENTES
async function loadSources() {
  const container = document.getElementById('sourcesList');
  
  if (!container) {
    console.error('❌ No se encontró #sourcesList');
    return;
  }
  
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const manifestUrl = roomConfig.projectorType === 'custom' 
    ? roomConfig.customManifest 
    : PUBLIC_MANIFEST;
  
  console.log('📡 Cargando desde manifest:', manifestUrl);
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const streamType = selectedMovie.media_type === 'movie' ? 'movie' : 'series';
    
    // ⭐ Construir URL con temporada y episodio si es serie
    let streamUrl = `${baseUrl}/stream/${streamType}/${selectedMovie.imdb_id}`;
    
    if (selectedMovie.media_type === 'tv' && selectedSeason && selectedEpisode) {
      streamUrl += `:${selectedSeason}:${selectedEpisode}`;
    }
    
    streamUrl += '.json';
    
    console.log('🎬 Stream URL:', streamUrl);
    
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
    
    console.log('✅ Fuentes encontradas:', sources.length);
    
    if (sources.length === 0) {
      container.innerHTML = '<div class="loading">😕 No se encontraron fuentes disponibles</div>';
      return;
    }
    
    renderSources();
    
  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
  }
}

// RENDERIZAR FUENTES
function renderSources() {
  const container = document.getElementById('sourcesList');
  
  if (!container) {
    console.error('❌ No se encontró #sourcesList');
    return;
  }
  
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
  if (btnCreateRoom) {
    btnCreateRoom.disabled = false;
  }
}

// SELECCIONAR FUENTE
function selectSource(index) {
  selectedSourceIndex = index;
  
  document.querySelectorAll('.source-card').forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });
}

// ⭐ CREAR O ACTUALIZAR SALA
async function createRoom() {
  if (selectedSourceIndex === null) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  // ⭐ Si es serie, validar que se seleccionó episodio
  if (selectedMovie.media_type === 'tv' && (!selectedSeason || !selectedEpisode)) {
    alert('Por favor, selecciona una temporada y episodio');
    return;
  }
  
  const selectedSource = sources[selectedSourceIndex];
  console.log('✅ Fuente seleccionada:', selectedSource.url);
  
  const manifest = JSON.stringify({
    imdbId: selectedMovie.imdb_id,
    title: selectedMovie.title || selectedMovie.name,
    year: (selectedMovie.release_date || selectedMovie.first_air_date || '').split('-')[0],
    poster: selectedMovie.poster_path 
      ? `https://image.tmdb.org/t/p/w500${selectedMovie.poster_path}` 
      : '',
    backdrop: selectedMovie.backdrop_path 
      ? `https://image.tmdb.org/t/p/original${selectedMovie.backdrop_path}` 
      : '',
    overview: selectedMovie.overview || '',
    rating: selectedMovie.vote_average || 0,
    type: selectedMovie.media_type || 'movie',
    season: selectedSeason || null,
    episode: selectedEpisode || null
  });
  
  try {
    if (isChangingContent && changingRoomId) {
      // ⭐ ACTUALIZAR SALA EXISTENTE
      console.log('🔄 Actualizando sala:', changingRoomId);
      
      const updateRes = await fetch(`/api/projectorrooms/${changingRoomId}/update-content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest,
          sourceUrl: roomConfig.shareMode === 'host' ? selectedSource.url : null
        })
      });
      
      console.log('📡 Response status:', updateRes.status);
      
      if (!updateRes.ok) {
        const errorText = await updateRes.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`HTTP ${updateRes.status}: ${errorText}`);
      }
      
      const updateData = await updateRes.json();
      console.log('📦 Update ', updateData);
      
      if (!updateData.success) {
        throw new Error(updateData.message || 'Error actualizando sala');
      }
      
      console.log('✅ Sala actualizada correctamente');
      
      // Limpiar sessionStorage
      sessionStorage.removeItem('projectorroom_changing_content');
      sessionStorage.removeItem('projectorroom_change_room_name');
      sessionStorage.removeItem('projectorroom_change_use_host_source');
      
      // Si no comparte fuente, guardar la seleccionada localmente
      if (roomConfig.shareMode !== 'host') {
        localStorage.setItem('projectorroom_guest_source_' + changingRoomId, selectedSource.url);
      }
      
      alert('✅ Contenido actualizado correctamente');
      window.location.href = `/sala/${changingRoomId}`;
      
    } else {
      // ⭐ CREAR NUEVA SALA
      console.log('🆕 Creando nueva sala...');
      
      const requestBody = {
        roomName: roomConfig.roomName,
        hostUsername: roomConfig.username,
        manifest,
        sourceUrl: roomConfig.shareMode === 'host' ? selectedSource.url : '',
        useHostSource: roomConfig.shareMode === 'host',
        projectorType: roomConfig.projectorType,
        customManifest: roomConfig.customManifest || null
      };
      
      console.log('📤 Request body:', requestBody);
      
      const res = await fetch('/api/projectorrooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📡 Response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      console.log('📦 Response ', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Error creando sala');
      }
      
      const roomId = data.projectorRoom.id;
      console.log('✅ Sala creada:', roomId);
      
      // Guardar sesión del anfitrión
      sessionStorage.setItem('projectorroom_is_host_' + roomId, 'true');
      sessionStorage.setItem('projectorroom_host_username_' + roomId, roomConfig.username);
      
      // Si no comparte fuente, guardar la seleccionada localmente
      if (roomConfig.shareMode !== 'host') {
        localStorage.setItem('projectorroom_guest_source_' + roomId, selectedSource.url);
      }
      
      window.location.href = `/sala/${roomId}`;
    }
    
  } catch (error) {
    console.error('❌ Error completo:', error);
    console.error('❌ Error name:', error.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error stack:', error.stack);
    alert('Error: ' + error.message);
  }
}

// ESCAPE HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
