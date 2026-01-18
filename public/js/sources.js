const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let selectedMovie = {};
let sources = [];
let selectedSource = null;

window.addEventListener('load', init);

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const movieData = urlParams.get('movie');
  
  if (!movieData) {
    alert('Error: No se encontró película');
    window.history.back();
    return;
  }
  
  try {
    selectedMovie = JSON.parse(decodeURIComponent(movieData));
    console.log('✅ Película cargada:', selectedMovie);
    loadSessionData();
    renderMovie();
    await loadSources();
  } catch (error) {
    console.error('❌ Error inicialización:', error);
    alert('Error cargando datos: ' + error.message);
  }
}

function loadSessionData() {
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  
  console.log('📦 Session ', session);
  
  const usernameEl = document.getElementById('configUsername');
  const roomNameEl = document.getElementById('configRoomName');
  const projTypeEl = document.getElementById('configProjectorType');
  const sourceModeEl = document.getElementById('configSourceMode');
  
  if (usernameEl) usernameEl.textContent = session.username || '-';
  if (roomNameEl) roomNameEl.textContent = session.roomName || '-';
  if (projTypeEl) projTypeEl.textContent = session.projectorType === 'custom' ? 'Personalizado' : 'Predeterminado';
  if (sourceModeEl) sourceModeEl.textContent = session.sourceMode === 'host' ? 'Usar mi proyección' : 'Proyección individual';
}

function renderMovie() {
  const posterEl = document.getElementById('moviePoster');
  const titleEl = document.getElementById('movieTitle');
  const ratingEl = document.getElementById('movieRating');
  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const overviewEl = document.getElementById('movieOverview');
  
  if (posterEl) posterEl.style.backgroundImage = 'url(' + selectedMovie.poster + ')';
  if (titleEl) titleEl.textContent = selectedMovie.title;
  if (ratingEl) ratingEl.textContent = '⭐ ' + selectedMovie.rating;
  if (yearEl) yearEl.textContent = selectedMovie.year;
  if (typeEl) typeEl.textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  if (overviewEl) overviewEl.textContent = selectedMovie.overview;
}

async function loadSources() {
  const container = document.getElementById('sourcesList');
  
  if (!container) {
    console.error('❌ No se encontró el contenedor sourcesList');
    return;
  }
  
  container.innerHTML = '<div class="sources-empty"><div class="empty-icon">🔍</div><p>Buscando fuentes...</p></div>';
  
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  const projectorType = session.projectorType || 'public';
  const manifestUrl = projectorType === 'custom' ? session.customManifest : PUBLIC_MANIFEST;
  
  console.log('🔗 Manifest URL:', manifestUrl);
  
  try {
    console.log('📡 Descargando manifest...');
    const manifest = await fetch(manifestUrl).then(r => r.json());
    console.log('✅ Manifest:', manifest);
    
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const imdbId = selectedMovie.imdbId;
    
    console.log('🎬 IMDb ID:', imdbId);
    
    if (!imdbId) {
      throw new Error('No se encontró IMDb ID para esta película');
    }
    
    const streamType = selectedMovie.type === 'movie' ? 'movie' : 'series';
    const streamUrl = baseUrl + '/stream/' + streamType + '/' + imdbId + '.json';
    
    console.log('🔗 Stream URL:', streamUrl);
    console.log('📡 Descargando streams...');
    
    const res = await fetch(streamUrl);
    
    if (!res.ok) {
      throw new Error('Error HTTP ' + res.status + ': ' + res.statusText);
    }
    
    const data = await res.json();
    
    console.log('📦 RESPUESTA COMPLETA:', JSON.stringify(data, null, 2));
    console.log('📦 Tipo de data.streams:', typeof data.streams);
    console.log('📦 ¿Es array?:', Array.isArray(data.streams));
    
    if (data.streams) {
      console.log('📦 Número de streams:', data.streams.length || Object.keys(data.streams).length);
      console.log('📦 Primer stream:', data.streams[0] || data.streams[Object.keys(data.streams)[0]]);
    }
    
    // Extraer streams
    let allStreams = [];
    
    if (Array.isArray(data.streams)) {
      allStreams = data.streams;
      console.log('✅ Streams como array:', allStreams.length);
    } else if (data.streams && typeof data.streams === 'object') {
      allStreams = Object.values(data.streams);
      console.log('✅ Streams como objeto convertido a array:', allStreams.length);
    } else {
      console.error('❌ No se encontró data.streams o tiene formato desconocido');
    }
    
    console.log('🔍 Analizando cada stream:');
    allStreams.forEach(function(s, i) {
      console.log('Stream #' + i + ':', {
        title: s.title || s.name,
        url: s.url,
        externalUrl: s.externalUrl,
        infoHash: s.infoHash,
        magnetLink: s.magnetLink,
        completo: s
      });
    });
    
    // Filtrar streams HTTP
    sources = allStreams
      .filter(function(s) {
        if (!s) return false;
        
        const url = s.url || s.externalUrl;
        const isHTTP = url && (url.startsWith('http://') || url.startsWith('https://'));
        
        console.log('Filtrando stream:', {
          title: s.title || s.name,
          url: url,
          esHTTP: isHTTP
        });
        
        return isHTTP;
      })
      .map(function(s) {
        return {
          url: s.url || s.externalUrl,
          title: s.title || s.name || s.description || 'Stream',
          provider: manifest.name || 'Addon'
        };
      });
    
    console.log('✅ FUENTES VÁLIDAS FINALES:', sources.length);
    console.log('📋 Lista de fuentes:', sources);
    
    if (sources.length === 0) {
      console.error('❌ No se encontraron fuentes HTTP válidas');
      
      container.innerHTML = 
        '<div class="sources-empty">' +
        '<div class="empty-icon">😕</div>' +
        '<p>No se encontraron fuentes HTTP</p>' +
        '<p style="font-size:0.85rem;color:#666;margin-top:0.5rem;">Abre la consola (F12) para ver los detalles</p>' +
        '</div>';
      
      const btnCreate = document.getElementById('btnCreate');
      if (btnCreate) btnCreate.disabled = true;
      
      return;
    }
    
    console.log('✅ Renderizando fuentes...');
    renderSources();
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    console.error('Stack:', error.stack);
    
    container.innerHTML = 
      '<div class="sources-empty">' +
      '<div class="empty-icon">❌</div>' +
      '<p>Error al cargar fuentes</p>' +
      '<p style="font-size:0.85rem;color:#666;margin-top:0.5rem;">' + error.message + '</p>' +
      '</div>';
    
    const btnCreate = document.getElementById('btnCreate');
    if (btnCreate) btnCreate.disabled = true;
  }
}

function renderSources() {
  const container = document.getElementById('sourcesList');
  
  if (!container) {
    console.error('❌ No se encontró contenedor sourcesList');
    return;
  }
  
  if (sources.length === 0) {
    container.innerHTML = '<div class="sources-empty"><div class="empty-icon">😕</div><p>No hay fuentes</p></div>';
    return;
  }
  
  let html = '';
  
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const isSelected = selectedSource === i ? ' data-selected="true"' : '';
    
    html += '<div class="source-card" onclick="selectSource(' + i + ')" data-index="' + i + '"' + isSelected + '>';
    html += '<div class="source-title">' + escapeHtml(source.title) + '</div>';
    html += '<div class="source-meta"><span>📡 ' + escapeHtml(source.provider) + '</span></div>';
    html += '</div>';
  }
  
  container.innerHTML = html;
  
  const btnCreate = document.getElementById('btnCreate');
  if (btnCreate) {
    btnCreate.disabled = false;
  }
  
  console.log('✅ Fuentes renderizadas correctamente');
}

function selectSource(index) {
  console.log('👆 Fuente seleccionada:', index, sources[index]);
  selectedSource = index;
  renderSources();
}

async function createRoom() {
  if (selectedSource === null || sources.length === 0) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  
  const roomData = {
    roomName: session.roomName || 'Sala de Proyección',
    hostUsername: session.username || 'Anónimo',
    manifest: JSON.stringify({
      tmdbId: selectedMovie.id,
      imdbId: selectedMovie.imdbId,
      title: selectedMovie.title,
      poster: selectedMovie.poster,
      type: selectedMovie.type,
      year: selectedMovie.year,
      overview: selectedMovie.overview
    }),
    sourceUrl: sources[selectedSource].url,
    useHostSource: session.sourceMode === 'host'
  };
  
  console.log('🚀 Creando sala:', roomData);
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    
    console.log('✅ Respuesta servidor:', data);
    
    if (data.success) {
      window.location.href = '/room.html?id=' + data.projectorRoom.id + '&username=' + encodeURIComponent(session.username || 'Anónimo');
    } else {
      alert('Error: ' + (data.message || 'No se pudo crear la sala'));
    }
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    alert('Error creando sala: ' + error.message);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  const btnBack = document.getElementById('btnBack');
  const btnCreate = document.getElementById('btnCreate');
  
  if (btnBack) {
    btnBack.onclick = function() {
      window.history.back();
    };
  }
  
  if (btnCreate) {
    btnCreate.onclick = createRoom;
  }
});
