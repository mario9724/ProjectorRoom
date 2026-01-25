const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let currentStep = 1;
let searchTimeout = null;
let selectedMovie = null;
let selectedMediaType = 'movie';
let sources = [];
let selectedSource = null;
let selectedSourceIndex = null;
let manifestUrl = PUBLIC_MANIFEST;
let projectorType = 'public';
let customManifestUrl = '';
let shareSource = true;

// ⭐ BETA-1.6: Detectar modo actualización
const updatingRoomId = sessionStorage.getItem('projectorroom_updating_room');
if (updatingRoomId) {
  console.log('🔄 Modo actualización de sala:', updatingRoomId);
}

// NAVEGACIÓN ENTRE PASOS
function goToStep(step) {
  // Validaciones (solo si NO estamos actualizando)
  if (!updatingRoomId) {
    if (step === 2) {
      const username = document.getElementById('username').value.trim();
      if (!username) {
        alert('Por favor, escribe tu nombre');
        return;
      }
    }

    if (step === 3) {
      const roomName = document.getElementById('roomName').value.trim();
      if (!roomName) {
        alert('Por favor, escribe el nombre de la sala');
        return;
      }
    }

    if (step === 4) {
      projectorType = document.querySelector('input[name="projectorType"]:checked').value;
      if (projectorType === 'custom') {
        customManifestUrl = document.getElementById('customManifest').value.trim();
        if (!customManifestUrl) {
          alert('Por favor, introduce la URL del manifest.json');
          return;
        }
        manifestUrl = customManifestUrl;
      } else {
        manifestUrl = PUBLIC_MANIFEST;
      }
    }

    if (step === 5) {
      shareSource = document.querySelector('input[name="shareMode"]:checked').value === 'host';
    }
  }

  // Ocultar paso actual
  if (currentStep > 0) {
    const currentStepEl = document.getElementById('step' + currentStep);
    if (currentStepEl) {
      currentStepEl.classList.remove('active');
    }
  }

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
      document.getElementById('searchResults').innerHTML = '<div class="no-results">Escribe al menos 2 caracteres para buscar</div>';
      return;
    }

    document.getElementById('searchResults').innerHTML = '<div class="loading">🔍 Buscando...</div>';

    searchTimeout = setTimeout(() => searchMovie(query), 500);
  });
}

// BUSCAR PELÍCULA
async function searchMovie(query) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=es-ES`);
    const data = await res.json();

    const results = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');

    if (results.length === 0) {
      document.getElementById('searchResults').innerHTML = '<div class="no-results">No se encontraron resultados</div>';
      return;
    }

    let html = '';
    results.slice(0, 8).forEach(item => {
      const title = item.title || item.name;
      const year = (item.release_date || item.first_air_date || '').substring(0, 4);
      const poster = item.poster_path 
        ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
        : '/images/placeholder.png';
      const type = item.media_type === 'movie' ? 'Película' : 'Serie';

      html += `
        <div class="movie-result-card" onclick='selectMovie(${JSON.stringify(item)})'>
          <img src="${poster}" alt="${title}">
          <div class="movie-result-info">
            <div class="movie-result-title">${title}</div>
            <div class="movie-result-meta">
              <span>⭐ ${item.vote_average?.toFixed(1) || 'N/A'}</span>
              <span>📅 ${year || 'N/A'}</span>
              <span>🎬 ${type}</span>
            </div>
          </div>
        </div>
      `;
    });

    document.getElementById('searchResults').innerHTML = html;
  } catch (error) {
    console.error('Error buscando:', error);
    document.getElementById('searchResults').innerHTML = '<div class="no-results">Error al buscar. Intenta de nuevo.</div>';
  }
}

// ⭐ FIX: SELECCIONAR PELÍCULA (guardar media_type correctamente)
// ⭐ BETA-1.5.1: selectMovie CON SELECTOR EPISODIOS
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
  
  try {
    const type = movie.media_type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${type}/${movie.id}/external_ids?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    
    selectedMovie.imdbId = data.imdb_id;
    
    if (!selectedMovie.imdbId) {
      alert('No se encontró IMDb ID');
      return;
    }
    
    // ⭐ CLAVE: Para series cargar temporadas, para películas ir directo
    if (selectedMovie.type === 'series') {
      await loadSeasons();
    } else {
      goToStep(6);
      renderSelectedMovie();
      loadSources();
    }
    
  } catch (error) {
    console.error('Error:', error);
    alert('Error obteniendo información');
  }
}


  console.log('Película seleccionada:', movie);
  console.log('Media type:', selectedMediaType);

  document.getElementById('step5').classList.remove('active');
  document.getElementById('step6').classList.add('active');
  currentStep = 6;

  // Render info
  const poster = movie.poster_path 
    ? `https://image.tmdb.org/t/p/w300${movie.poster_path}`
    : '/images/placeholder.png';

  const title = movie.title || movie.name;
  const year = (movie.release_date || movie.first_air_date || '').substring(0, 4);
  const type = movie.media_type === 'movie' ? 'Película' : 'Serie';

  document.getElementById('selectedMovieInfo').innerHTML = `
    <img src="${poster}" alt="${title}">
    <div>
      <h3>${title}</h3>
      <div class="movie-meta">
        <span>⭐ ${movie.vote_average?.toFixed(1) || 'N/A'}</span>
        <span>📅 ${year || 'N/A'}</span>
        <span>🎬 ${type}</span>
      </div>
      <p>${movie.overview || 'Sin descripción disponible.'}</p>
    </div>
  `;

  // Cargar fuentes
  await loadSources();
}

// ⭐ FIX: CARGAR FUENTES (usar selectedMediaType correcto)
async function loadSources() {
  const sourcesList = document.getElementById('sourcesList');
  sourcesList.innerHTML = '<div class="loading">🔍 Buscando fuentes disponibles...</div>';

  try {
    console.log('🔍 Manifest URL:', manifestUrl);

    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();

    console.log('✅ Manifest cargado:', manifest);

    const catalogUrl = manifest.catalogs.find(c => c.id === 'webstreamr-search')?.extra?.[0]?.search?.catalogURL;

    if (!catalogUrl) {
      throw new Error('No se encontró URL de catálogo en el manifest');
    }

    const searchQuery = selectedMovie.title || selectedMovie.name;
    const searchUrl = catalogUrl.replace('{SEARCH_QUERY}', encodeURIComponent(searchQuery));

    console.log('🔍 Buscando en catálogo:', searchUrl);

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    console.log('✅ Resultados búsqueda:', searchData);

    if (!searchData.metas || searchData.metas.length === 0) {
      sourcesList.innerHTML = '<div class="no-results">❌ No se encontraron fuentes para esta película</div>';
      return;
    }

    const year = (selectedMovie.release_date || selectedMovie.first_air_date || '').substring(0, 4);
    const matchedMeta = searchData.metas.find(m => {
      const titleMatch = m.name?.toLowerCase().includes(searchQuery.toLowerCase());
      const yearMatch = m.name?.includes(year);
      return titleMatch || yearMatch;
    }) || searchData.metas[0];

    console.log('🎯 Meta seleccionado:', matchedMeta);
    console.log('🎬 Media type para stream:', selectedMediaType);

    // ⭐ FIX: Usar selectedMediaType (ya tiene el valor correcto)
    const streamUrl = `https://webstreamr.hayd.uk/stream/${selectedMediaType}/${matchedMeta.id}.json`;

    console.log('🔗 Stream URL:', streamUrl);

    const streamRes = await fetch(streamUrl);
    const streamData = await streamRes.json();

    console.log('✅ Streams:', streamData);

    if (!streamData.streams || streamData.streams.length === 0) {
      sourcesList.innerHTML = '<div class="no-results">❌ No se encontraron streams para esta película</div>';
      return;
    }

    sources = streamData.streams;

    let html = '';
    sources.forEach((stream, index) => {
      const title = stream.title || stream.name || `Fuente ${index + 1}`;
      let metaInfo = [];
      if (stream.quality) metaInfo.push(stream.quality);
      if (stream.size) metaInfo.push(stream.size);
      if (stream.source) metaInfo.push(`📡 ${stream.source}`);

      html += `
        <div class="source-card" onclick="selectSource(${index})">
          <div class="source-title">${title}</div>
          <div class="source-meta">${metaInfo.join(' • ')}</div>
        </div>
      `;
    });

    sourcesList.innerHTML = html;

  } catch (error) {
    console.error('❌ Error cargando fuentes:', error);
    sourcesList.innerHTML = '<div class="no-results">❌ Error al cargar fuentes. Intenta de nuevo.</div>';
  }
}

// SELECCIONAR FUENTE
function selectSource(index) {
  selectedSourceIndex = index;
  selectedSource = sources[index];

  document.querySelectorAll('.source-card').forEach(card => {
    card.classList.remove('selected');
  });

  document.querySelectorAll('.source-card')[index].classList.add('selected');

  console.log('Fuente seleccionada:', selectedSource);
}

// ⭐ BETA-1.6: CREAR O ACTUALIZAR SALA
async function createRoom() {
  const updatingRoomId = sessionStorage.getItem('projectorroom_updating_room');

  // Si estamos actualizando
  if (updatingRoomId) {
    if (!selectedSource) {
      alert('Por favor, selecciona una fuente de video');
      return;
    }

    console.log('🔄 Actualizando sala existente:', updatingRoomId);

    try {
      const updateRes = await fetch(`/api/projectorrooms/${updatingRoomId}/movie`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbId: selectedMovie.id,
          mediaType: selectedMediaType,
          movieData: selectedMovie,
          sourceUrl: selectedSource.url,
          manifest: manifestUrl
        })
      });

      const updateData = await updateRes.json();

      if (updateData.success) {
        console.log('✅ Sala actualizada');

        // Limpiar flag
        sessionStorage.removeItem('projectorroom_updating_room');

        // Volver a sala
        window.location.href = `/sala/${updatingRoomId}`;
      } else {
        alert('Error actualizando sala: ' + updateData.message);
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error de conexión');
    }

    return;
  }

  // CREAR SALA NUEVA
  const hostUsername = document.getElementById('hostUsername').value.trim();

  if (!hostUsername) {
    alert('Por favor, introduce tu nombre');
    return;
  }

  if (!selectedSource) {
    alert('Por favor, selecciona una fuente de video');
    return;
  }

  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: selectedMovie.title || selectedMovie.name,
        hostUsername: hostUsername,
        manifest: manifestUrl,
        sourceUrl: selectedSource.url,
        useHostSource: shareSource,
        projectorType: projectorType,
        customManifest: customManifestUrl,
        tmdbId: selectedMovie.id,
        mediaType: selectedMediaType,
        movieData: selectedMovie
      })
    });

    const data = await res.json();

    if (data.success) {
      const roomId = data.projectorRoom.id;

      sessionStorage.setItem('projectorroom_is_host_' + roomId, 'true');
      sessionStorage.setItem('projectorroom_host_username_' + roomId, hostUsername);

      console.log('✅ Sala creada:', roomId);

      window.location.href = `/sala/${roomId}`;
    } else {
      alert('Error: ' + data.message);
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error de conexión');
  }
}
