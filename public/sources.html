console.log('🚀 sources.js iniciado');
console.log('URL completa:', window.location.href);
console.log('Search params:', window.location.search);

const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let selectedMovie = {};
let sources = [];
let selectedSource = null;

window.addEventListener('load', init);

async function init() {
  console.log('🔧 Función init() ejecutada');
  
  const urlParams = new URLSearchParams(window.location.search);
  console.log('📋 URLSearchParams:', urlParams.toString());
  
  const movieData = urlParams.get('movie');
  console.log('🎬 movieData crudo:', movieData);
  
  if (!movieData) {
    console.error('❌ NO SE ENCONTRÓ movieData en URL');
    alert('Error: No se encontró película en la URL');
    window.history.back();
    return;
  }
  
  try {
    console.log('🔄 Decodificando movieData...');
    const decoded = decodeURIComponent(movieData);
    console.log('📦 movieData decodificado:', decoded);
    
    selectedMovie = JSON.parse(decoded);
    console.log('✅ Película parseada:', selectedMovie);
    
    loadSessionData();
    renderMovie();
    await loadSources();
  } catch (error) {
    console.error('❌ Error en init():', error);
    console.error('Stack:', error.stack);
    alert('Error cargando datos: ' + error.message);
  }
}

function loadSessionData() {
  console.log('📦 Cargando session data...');
  
  const sessionStr = localStorage.getItem('projectorSession');
  console.log('📦 localStorage raw:', sessionStr);
  
  const session = JSON.parse(sessionStr || '{}');
  console.log('✅ Session parseada:', session);
  
  const usernameEl = document.getElementById('configUsername');
  const roomNameEl = document.getElementById('configRoomName');
  const projTypeEl = document.getElementById('configProjectorType');
  const sourceModeEl = document.getElementById('configSourceMode');
  
  if (usernameEl) {
    usernameEl.textContent = session.username || '-';
    console.log('👤 Username:', session.username);
  }
  
  if (roomNameEl) {
    roomNameEl.textContent = session.roomName || '-';
    console.log('🏠 Room name:', session.roomName);
  }
  
  if (projTypeEl) {
    projTypeEl.textContent = session.projectorType === 'custom' ? 'Personalizado' : 'Predeterminado';
    console.log('📡 Projector type:', session.projectorType);
  }
  
  if (sourceModeEl) {
    sourceModeEl.textContent = session.sourceMode === 'host' ? 'Usar mi proyección' : 'Proyección individual';
    console.log('🎭 Source mode:', session.sourceMode);
  }
}

function renderMovie() {
  console.log('🎨 Renderizando película...');
  
  const posterEl = document.getElementById('moviePoster');
  const titleEl = document.getElementById('movieTitle');
  const ratingEl = document.getElementById('movieRating');
  const yearEl = document.getElementById('movieYear');
  const typeEl = document.getElementById('movieType');
  const overviewEl = document.getElementById('movieOverview');
  
  if (posterEl) {
    posterEl.style.backgroundImage = 'url(' + selectedMovie.poster + ')';
    console.log('🖼️ Poster:', selectedMovie.poster);
  }
  
  if (titleEl) {
    titleEl.textContent = selectedMovie.title;
    console.log('📝 Título:', selectedMovie.title);
  }
  
  if (ratingEl) {
    ratingEl.textContent = '⭐ ' + selectedMovie.rating;
  }
  
  if (yearEl) {
    yearEl.textContent = selectedMovie.year;
  }
  
  if (typeEl) {
    typeEl.textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  }
  
  if (overviewEl) {
    overviewEl.textContent = selectedMovie.overview;
  }
  
  console.log('✅ Película renderizada');
}

async function loadSources() {
  console.log('🔍 Iniciando loadSources()...');
  
  const container = document.getElementById('sourcesList');
  
  if (!container) {
    console.error('❌ No se encontró #sourcesList');
    return;
  }
  
  container.innerHTML = '<div class="sources-empty"><div class="empty-icon">🔍</div><p>Buscando fuentes...</p></div>';
  
  const sessionStr = localStorage.getItem('projectorSession');
  const session = JSON.parse(sessionStr || '{}');
  const projectorType = session.projectorType || 'public';
  const manifestUrl = projectorType === 'custom' ? session.customManifest : PUBLIC_MANIFEST;
  
  console.log('📡 Manifest URL:', manifestUrl);
  console.log('🎬 IMDb ID:', selectedMovie.imdbId);
  
  try {
    console.log('📥 Descargando manifest...');
    const manifest = await fetch(manifestUrl).then(r => r.json());
    console.log('✅ Manifest recibido:', manifest);
    
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const imdbId = selectedMovie.imdbId;
    
    if (!imdbId) {
      throw new Error('No se encontró IMDb ID en la película');
    }
    
    const streamType = selectedMovie.type === 'movie' ? 'movie' : 'series';
    const streamUrl = baseUrl + '/stream/' + streamType + '/' + imdbId + '.json';
    
    console.log('🔗 Stream URL:', streamUrl);
    console.log('📥 Descargando streams...');
    
    const res = await fetch(streamUrl);
    
    if (!res.ok) {
      throw new Error('HTTP ' + res.status + ': ' + res.statusText);
    }
    
    const data = await res.json();
    
    console.log('📦 Respuesta streams:', data);
    console.log('📊 Total streams:', data.streams ? data.streams.length : 0);
    
    if (data.streams && data.streams[0]) {
      console.log('📋 Primer stream:', data.streams[0]);
    }
    
    sources = (data.streams || [])
      .filter(function(s) {
        if (!s || !s.url) return false;
        const isHTTP = s.url.startsWith('http://') || s.url.startsWith('https://');
        console.log('🔍 Stream:', s.title || s.name, '| HTTP:', isHTTP);
        return isHTTP;
      })
      .map(function(s) {
        return {
          url: s.url,
          title: s.title || s.name || 'Stream',
          provider: manifest.name || 'Addon'
        };
      });
    
    console.log('✅ Fuentes válidas:', sources.length);
    
    if (sources.length === 0) {
      console.warn('⚠️ No se encontraron fuentes HTTP');
      container.innerHTML = '<div class="sources-empty"><div class="empty-icon">😕</div><p>No se encontraron fuentes HTTP disponibles</p></div>';
      document.getElementById('btnCreate').disabled = true;
      return;
    }
    
    renderSources();
    
  } catch (error) {
    console.error('❌ Error en loadSources():', error);
    console.error('Stack:', error.stack);
    container.innerHTML = '<div class="sources-empty"><div class="empty-icon">❌</div><p>Error: ' + error.message + '</p></div>';
    document.getElementById('btnCreate').disabled = true;
  }
}

function renderSources() {
  console.log('🎨 Renderizando ' + sources.length + ' fuentes...');
  
  const container = document.getElementById('sourcesList');
  
  if (!container) return;
  
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
  document.getElementById('btnCreate').disabled = false;
  
  console.log('✅ Fuentes renderizadas');
}

function selectSource(index) {
  console.log('👆 Fuente seleccionada:', index, sources[index]);
  selectedSource = index;
  renderSources();
}

async function createRoom() {
  console.log('🚀 Creando sala...');
  
  if (selectedSource === null || sources.length === 0) {
    alert('Por favor, selecciona una fuente');
    return;
  }
  
  const sessionStr = localStorage.getItem('projectorSession');
  const session = JSON.parse(sessionStr || '{}');
  
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
  
  console.log('📦 Room ', roomData);
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    console.log('✅ Respuesta servidor:', data);
    
    if (data.success) {
      const roomUrl = '/room.html?id=' + data.projectorRoom.id + '&username=' + encodeURIComponent(session.username || 'Anónimo');
      console.log('🔗 Redirigiendo a:', roomUrl);
      window.location.href = roomUrl;
    } else {
      alert('Error: ' + (data.message || 'No se pudo crear'));
    }
  } catch (error) {
    console.error('❌ Error creando sala:', error);
    alert('Error creando sala');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ DOM cargado');
  
  const btnBack = document.getElementById('btnBack');
  const btnCreate = document.getElementById('btnCreate');
  
  if (btnBack) {
    btnBack.onclick = function() { 
      console.log('⬅️ Volviendo...');
      window.history.back(); 
    };
  }
  
  if (btnCreate) {
    btnCreate.onclick = createRoom;
  }
});
