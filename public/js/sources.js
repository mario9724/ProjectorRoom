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
    console.log('Película cargada:', selectedMovie);
    loadSessionData();
    renderMovie();
    await loadSources();
  } catch (error) {
    console.error('Error:', error);
    alert('Error cargando datos');
  }
}

function loadSessionData() {
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  
  console.log('Session ', session);
  
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
    console.error('No se encontró sourcesList');
    return;
  }
  
  container.innerHTML = '<div class="sources-empty"><div class="empty-icon">🔍</div><p>Buscando fuentes...</p></div>';
  
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  const projectorType = session.projectorType || 'public';
  const manifestUrl = projectorType === 'custom' ? session.customManifest : PUBLIC_MANIFEST;
  
  console.log('Manifest URL:', manifestUrl);
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    console.log('Manifest:', manifest);
    
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const imdbId = selectedMovie.imdbId;
    
    if (!imdbId) {
      throw new Error('No IMDb ID');
    }
    
    const streamType = selectedMovie.type === 'movie' ? 'movie' : 'series';
    const streamUrl = baseUrl + '/stream/' + streamType + '/' + imdbId + '.json';
    
    console.log('Stream URL:', streamUrl);
    
    const res = await fetch(streamUrl);
    const data = await res.json();
    
    console.log('RESPUESTA COMPLETA:', data);
    console.log('Streams:', data.streams);
    
    if (data.streams) {
      console.log('Total streams:', data.streams.length);
      console.log('Primer stream:', data.streams[0]);
    }
    
    sources = (data.streams || [])
      .filter(function(s) {
        if (!s || !s.url) return false;
        return s.url.startsWith('http://') || s.url.startsWith('https://');
      })
      .map(function(s) {
        return {
          url: s.url,
          title: s.title || s.name || 'Stream',
          provider: manifest.name || 'Addon'
        };
      });
    
    console.log('Fuentes válidas:', sources.length);
    console.log('Lista fuentes:', sources);
    
    if (sources.length === 0) {
      container.innerHTML = '<div class="sources-empty"><div class="empty-icon">😕</div><p>No se encontraron fuentes HTTP</p></div>';
      document.getElementById('btnCreate').disabled = true;
      return;
    }
    
    renderSources();
    
  } catch (error) {
    console.error('Error:', error);
    container.innerHTML = '<div class="sources-empty"><div class="empty-icon">❌</div><p>Error: ' + error.message + '</p></div>';
    document.getElementById('btnCreate').disabled = true;
  }
}

function renderSources() {
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
}

function selectSource(index) {
  console.log('Seleccionada:', index);
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
  
  console.log('Creando sala:', roomData);
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      window.location.href = '/room.html?id=' + data.projectorRoom.id + '&username=' + encodeURIComponent(session.username || 'Anónimo');
    } else {
      alert('Error: ' + (data.message || 'No se pudo crear'));
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error creando sala');
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
  
  if (btnBack) btnBack.onclick = function() { window.history.back(); };
  if (btnCreate) btnCreate.onclick = createRoom;
});
