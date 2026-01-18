const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let searchTimeout = null;
let selectedMovie = null;
let sources = [];
let selectedSourceIndex = null;
let socket = null;
let currentRoomId = null;

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', function() {
  // Búsqueda
  document.getElementById('searchInput').addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();
    
    if (query.length < 2) {
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    
    searchTimeout = setTimeout(() => searchMovies(query), 500);
  });
  
  // Botones pantalla 2
  document.getElementById('btnBack').onclick = goToScreen1;
  document.getElementById('btnCreateRoom').onclick = createRoom;
  document.getElementById('btnInviteRoomies').onclick = copyInviteLink;
  
  // Botones pantalla 3
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnInvite').onclick = copyRoomLink;
  document.getElementById('btnSendMessage').onclick = sendChatMessage;
  
  document.getElementById('chatInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendChatMessage();
  });
});

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
  container.className = 'movie-grid';
  
  movies.forEach(movie => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => selectMovie(movie);
    
    card.innerHTML = `
      <img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title || movie.name}">
      <div class="movie-card-info">
        <div class="movie-card-title">${movie.title || movie.name}</div>
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
      alert('No se encontró IMDb ID para esta película');
      return;
    }
    
    goToScreen2();
    loadSources();
  } catch (error) {
    console.error('Error obteniendo IMDb ID:', error);
    alert('Error obteniendo información de la película');
  }
}

// PANTALLA 2
function goToScreen2() {
  document.getElementById('screen1').classList.remove('active');
  document.getElementById('screen2').classList.add('active');
  
  document.getElementById('moviePoster').src = selectedMovie.poster;
  document.getElementById('movieTitle').textContent = selectedMovie.title;
  document.getElementById('movieRating').textContent = `⭐ ${selectedMovie.rating}`;
  document.getElementById('movieYear').textContent = selectedMovie.year;
  document.getElementById('movieType').textContent = selectedMovie.type === 'movie' ? 'Película' : 'Serie';
  document.getElementById('movieOverview').textContent = selectedMovie.overview;
}

function goToScreen1() {
  document.getElementById('screen2').classList.remove('active');
  document.getElementById('screen1').classList.add('active');
}

// CARGAR FUENTES
async function loadSources() {
  const container = document.getElementById('sourcesList');
  container.innerHTML = '<div class="loading">🔍 Buscando fuentes...</div>';
  
  const projectorType = document.getElementById('projectorType').value;
  const manifestUrl = projectorType === 'custom' 
    ? document.getElementById('customManifest')?.value 
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
      return;
    }
    
    renderSources();
  } catch (error) {
    console.error('Error cargando fuentes:', error);
    container.innerHTML = `<div class="loading">❌ Error: ${error.message}</div>`;
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

// CREAR SALA
async function createRoom() {
  if (selectedSourceIndex === null) {
    alert('Selecciona una fuente');
    return;
  }
  
  const username = document.getElementById('username').value.trim() || 'Anónimo';
  const roomName = document.getElementById('roomName').value.trim() || 'Sala de Proyección';
  const sourceMode = document.getElementById('sourceMode').value;
  
  const roomData = {
    roomName: roomName,
    hostUsername: username,
    manifest: JSON.stringify(selectedMovie),
    sourceUrl: sources[selectedSourceIndex].url,
    useHostSource: sourceMode === 'host'
  };
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      currentRoomId = data.projectorRoom.id;
      goToScreen3(data.projectorRoom, username);
    } else {
      alert('Error creando sala');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error creando sala');
  }
}

// PANTALLA 3
function goToScreen3(room, username) {
  document.getElementById('screen2').classList.remove('active');
  document.getElementById('screen3').classList.add('active');
  
  document.getElementById('roomTitleHeader').textContent = `PROYECTANDO "${selectedMovie.title}"`;
  document.getElementById('roomSubtitle').textContent = `en la sala de ${room.hostUsername}`;
  document.getElementById('roomPoster').src = selectedMovie.poster;
  document.getElementById('roomMovieTitle').textContent = selectedMovie.title;
  document.getElementById('roomYear').textContent = `📅 ${selectedMovie.year}`;
  document.getElementById('roomType').textContent = `🎬 ${selectedMovie.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('roomHost').textContent = `👤 Anfitrión: ${room.hostUsername}`;
  document.getElementById('roomOverview').textContent = selectedMovie.overview;
  
  // Conectar Socket.IO
  connectSocket(room.id, username);
}

// ABRIR VLC
function startProjection() {
  if (selectedSourceIndex === null) return;
  
  const vlcUrl = `vlc://${sources[selectedSourceIndex].url}`;
  window.location.href = vlcUrl;
  
  // Fallback
  setTimeout(() => {
    const link = document.createElement('a');
    link.href = sources[selectedSourceIndex].url;
    link.download = '';
    link.click();
  }, 1000);
}

// COPIAR ENLACE
function copyInviteLink() {
  alert('Función de invitación próximamente');
}

function copyRoomLink() {
  const roomUrl = `${window.location.origin}/?room=${currentRoomId}`;
  navigator.clipboard.writeText(roomUrl).then(() => {
    alert('✅ Enlace copiado al portapapeles');
  }).catch(() => {
    alert('Link: ' + roomUrl);
  });
}

// SOCKET.IO
function connectSocket(roomId, username) {
  socket = io();
  socket.emit('join-room', { roomId, username });
  
  socket.on('user-joined', data => {
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (message && socket && currentRoomId) {
    socket.emit('chat-message', { roomId: currentRoomId, message });
    input.value = '';
  }
}

function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  
  if (isSystem) {
    messageEl.textContent = message;
  } else {
    messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
  }
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

// UTILIDADES
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
