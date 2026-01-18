const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let searchResults = [];
let currentIndex = 0;
let selectedMovie = null;

function goToStep(step) {
  // Obtener sesión actual
  const session = JSON.parse(localStorage.getItem('projectorSession') || '{}');
  
  // PASO 1 → 2: Guardar username
  if (step === 2) {
    const username = document.getElementById('username').value.trim();
    if (!username) {
      return alert('Por favor, escribe tu nombre');
    }
    session.username = username;
  }
  
  // PASO 2 → 3: Guardar roomName
  if (step === 3) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) {
      return alert('Por favor, nombra tu sala');
    }
    session.roomName = roomName;
  }
  
  // PASO 3 → 4: Guardar projectorType
  if (step === 4) {
    session.projectorType = document.querySelector('input[name="projectorType"]:checked').value;
    if (session.projectorType === 'custom') {
      session.customManifest = document.getElementById('customManifest').value.trim();
    }
  }
  
  // PASO 4 → 5: Guardar sourceMode
  if (step === 5) {
    session.sourceMode = document.querySelector('input[name="sourceMode"]:checked').value;
  }
  
  // Guardar en localStorage
  localStorage.setItem('projectorSession', JSON.stringify(session));
  console.log('Session guardada:', session);
  
  // Cambiar de paso
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(`step${step}`).classList.add('active');
}

// TOGGLE CUSTOM MANIFEST
document.querySelectorAll('input[name="projectorType"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    document.getElementById('customManifestInput').style.display = 
      e.target.value === 'custom' ? 'block' : 'none';
  });
});

// BÚSQUEDA
let searchTimeout;
document.getElementById('searchQuery').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (!query) {
    showEmptyState();
    return;
  }
  
  searchTimeout = setTimeout(() => searchMovies(query), 500);
});

async function searchMovies(query) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=es-ES`);
    const data = await res.json();
    
    searchResults = data.results
      .filter(i => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path)
      .map(i => ({
        id: i.id,
        type: i.media_type,
        title: i.title || i.name,
        year: (i.release_date || i.first_air_date || '').slice(0, 4),
        poster: i.poster_path ? 'https://image.tmdb.org/t/p/w500' + i.poster_path : '',
        rating: i.vote_average ? i.vote_average.toFixed(1) : 'N/A',
        overview: i.overview || 'Sin descripción disponible'
      }));
    
    currentIndex = 0;
    renderCarousel();
    
  } catch (error) {
    console.error('Error búsqueda:', error);
  }
}

function showEmptyState() {
  document.getElementById('searchResults').innerHTML = `
    <div class="carousel-empty">
      <div class="empty-icon">🎬</div>
      <p>Escribe algo para comenzar la búsqueda</p>
    </div>
  `;
}

function renderCarousel() {
  const container = document.getElementById('searchResults');
  
  if (searchResults.length === 0) {
    container.innerHTML = `
      <div class="carousel-empty">
        <div class="empty-icon">😕</div>
        <p>No se encontraron resultados</p>
      </div>
    `;
    return;
  }
  
  const movie = searchResults[currentIndex];
  
  container.innerHTML = `
    <div class="carousel-item active">
      <div class="movie-card">
        <div class="movie-poster-container" style="background-image:url(${movie.poster})">
          <div class="movie-rating">⭐ ${movie.rating}</div>
        </div>
        <div class="movie-info">
          <h3 class="movie-title">${movie.title}</h3>
          <div class="movie-meta">
            <span>${movie.type === 'movie' ? '🎬 Película' : '📺 Serie'}</span>
            <span>📅 ${movie.year}</span>
          </div>
          <p class="movie-synopsis">${movie.overview}</p>
          <button onclick="selectMovie()" class="btn-select">Seleccionar y buscar fuentes</button>
        </div>
      </div>
      
      <div class="carousel-controls">
        <button class="carousel-btn" onclick="prevMovie()" ${currentIndex === 0 ? 'disabled' : ''}>
          ← Anterior
        </button>
        <div class="carousel-indicator">
          ${currentIndex + 1} de ${searchResults.length}
        </div>
        <button class="carousel-btn" onclick="nextMovie()" ${currentIndex === searchResults.length - 1 ? 'disabled' : ''}>
          Siguiente →
        </button>
      </div>
    </div>
  `;
}

function prevMovie() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCarousel();
  }
}

function nextMovie() {
  if (currentIndex < searchResults.length - 1) {
    currentIndex++;
    renderCarousel();
  }
}

async function selectMovie() {
  selectedMovie = searchResults[currentIndex];
  
  try {
    const ep = selectedMovie.type === 'movie' ? 'movie' : 'tv';
    const [details, externalIds] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${ep}/${selectedMovie.id}?api_key=${TMDB_API_KEY}&language=es-ES`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/${ep}/${selectedMovie.id}/external_ids?api_key=${TMDB_API_KEY}`).then(r => r.json())
    ]);
    
    selectedMovie.imdbId = externalIds.imdb_id;
    selectedMovie.details = details;
    
    window.location.href = `/sources.html?movie=${encodeURIComponent(JSON.stringify(selectedMovie))}`;
    
  } catch (error) {
    console.error('Error:', error);
    alert('Error al obtener información de la película');
  }
}
