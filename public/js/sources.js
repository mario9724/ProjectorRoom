const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let selectedMovie = {};
let sources = [];
let selectedSource = null;

// Cargar datos desde URL
window.addEventListener('load', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const movieData = urlParams.get('movie');
  
  if (!movieData) {
    alert('Error: No se encontró película');
    window.history.back();
    return;
  }
  
  try {
    selectedMovie = JSON.parse(decodeURIComponent(movieData));
    loadSessionData();
    renderMovie();
    await loadSources();
  } catch (error) {
    console.error('Error:', error);
    alert('Error cargando datos');
  }
});

function loadSessionData() {
  // Datos del localStorage (onboarding)
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  
  console.log('Session ', session); // DEBUG
  
  document.getElementById('configUsername').textContent = session.username || '-';
  document.getElementById('configRoomName').textContent = session.roomName || '-';
  document.getElementById('configProjectorType').textContent = 
    session.projectorType === 'custom' ? 'Personalizado' : 'Predeterminado';
  document.getElementById('configSourceMode').textContent = 
    session.sourceMode === 'host' ? 'Usar mi proyección' : 'Proyección individual';
}

function renderMovie() {
  document.getElementById('moviePoster').style.backgroundImage = 
    `url(${selectedMovie.poster})`;
  document.getElementById('movieTitle').textContent = selectedMovie.title;
  document.getElementById('movieRating').innerHTML = `⭐ ${selectedMovie.rating}`;
  document.getElementById('movieYear').textContent = selectedMovie.year;
  document.getElementById('movieType').textContent = 
    selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  document.getElementById('movieOverview').textContent = selectedMovie.overview;
}

async function loadSources() {
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  const projectorType = session.projectorType || 'public';
  const manifestUrl = projectorType === 'custom' 
    ? session.customManifest
    : PUBLIC_MANIFEST;
  
  try {
    const manifest = await fetch(manifestUrl).then(r => r.json());
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const imdbId = selectedMovie.imdbId;
    
    const res = await fetch(`${baseUrl}/stream/${selectedMovie.type === 'movie' ? 'movie' : 'series'}/${imdbId}.json`);
    const data = await res.json();
    
    // Filtrar streams HTTP
    sources = (data.streams || [])
      .filter(s => s.url && (s.url.startsWith('http://') || s.url.startsWith('https://')))
      .map(s => ({
        url: s.url,
        title: s.title || s.name || 'Stream',
        provider: manifest.name || 'Addon'
      }));
    
    renderSources();
    
  } catch (error) {
    console.error('Error fuentes:', error);
    document.getElementById('sourcesList').innerHTML = `
      <div class="sources-empty">
        <div class="empty-icon">😕</div>
        <p>No se encontraron fuentes disponibles</p>
      </div>
    `;
  }
}

function renderSources() {
  const container = document.getElementById('sourcesList');
  
  if (sources.length === 0) {
    container.innerHTML = `
      <div class="sources-empty">
        <div class="empty-icon">😕</div>
        <p>No hay fuentes disponibles</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = sources.map((source, index) => `
    <div class="source-card" onclick="selectSource(${index})" data-index="${index}" ${selectedSource === index ? 'data-selected="true"' : ''}>
      <div class="source-title">${source.title}</div>
      <div class="source-meta">
        <span>📡 ${source.provider}</span>
      </div>
    </div>
  `).join('');
  
  // Habilitar botón crear si hay fuentes
  document.getElementById('btnCreate').disabled = sources.length === 0;
}

function selectSource(index) {
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
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Redirigir a sala
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(session.username || 'Anónimo')}`;
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error creando sala');
  }
}

// EVENTOS
document.getElementById('btnBack').onclick = () => window.history.back();
document.getElementById('btnCreate').onclick = createRoom;
