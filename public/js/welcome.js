const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
let currentStep = 1;
let searchTimeout = null;

// Navegación entre pasos
function goToStep(step) {
  // Validaciones
  if (step === 3) {
    const username = document.getElementById('username').value.trim();
    if (!username) {
      alert('Por favor, escribe tu nombre');
      return;
    }
  }
  
  if (step === 4) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) {
      alert('Por favor, escribe el nombre de la sala');
      return;
    }
  }
  
  // Ocultar paso actual
  const currentStepEl = document.getElementById('step' + currentStep);
  if (currentStepEl) {
    currentStepEl.classList.remove('active');
  }
  
  // Mostrar nuevo paso
  currentStep = step;
  const newStepEl = document.getElementById('step' + step);
  if (newStepEl) {
    newStepEl.classList.add('active');
  }
  
  // Si llegamos al paso de búsqueda, activar listener
  if (step === 6) {
    setTimeout(initSearch, 100);
  }
}

// Inicializar búsqueda
function initSearch() {
  const input = document.getElementById('searchQuery');
  if (!input) return;
  
  input.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();
    
    if (query.length < 2) {
      const container = document.getElementById('searchResults');
      if (container) {
        container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">🎬</div><p>Escribe al menos 2 caracteres</p></div>';
      }
      return;
    }
    
    searchTimeout = setTimeout(function() {
      searchTMDB(query);
    }, 500);
  });
}

// Buscar en TMDB
async function searchTMDB(query) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">⏳</div><p>Buscando...</p></div>';
  
  try {
    const url = 'https://api.themoviedb.org/3/search/multi?api_key=' + TMDB_API_KEY + '&language=es-ES&query=' + encodeURIComponent(query);
    
    const res = await fetch(url);
    const data = await res.json();
    
    const filtered = (data.results || []).filter(function(item) {
      return (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path;
    });
    
    if (filtered.length === 0) {
      container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">😕</div><p>No se encontraron resultados</p></div>';
      return;
    }
    
    renderResults(filtered);
    
  } catch (error) {
    console.error('Error buscando:', error);
    container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">❌</div><p>Error en la búsqueda</p></div>';
  }
}

// Renderizar resultados
function renderResults(results) {
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  let html = '<div class="carousel-container"><div class="carousel-track">';
  
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const title = item.title || item.name || 'Sin título';
    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
    const poster = 'https://image.tmdb.org/t/p/w500' + item.poster_path;
    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
    
    html += '<div class="carousel-item" onclick="selectMovie(' + i + ')" data-index="' + i + '">';
    html += '<div class="carousel-poster" style="background-image:url(' + poster + ')"></div>';
    html += '<div class="carousel-info">';
    html += '<div class="carousel-title">' + escapeHtml(title) + '</div>';
    html += '<div class="carousel-meta">⭐ ' + rating + ' • ' + year + '</div>';
    html += '</div>';
    html += '</div>';
  }
  
  html += '</div></div>';
  html += '<button id="btnSelectMovie" class="btn-primary" style="margin-top:1rem;" disabled>Seleccionar y buscar fuentes</button>';
  
  container.innerHTML = html;
  
  // Guardar resultados en global
  window.searchResults = results;
  window.selectedMovieIndex = null;
}

// Seleccionar película
function selectMovie(index) {
  window.selectedMovieIndex = index;
  
  // Marcar visualmente
  const items = document.querySelectorAll('.carousel-item');
  items.forEach(function(item, i) {
    if (i === index) {
      item.style.border = '3px solid #007bff';
    } else {
      item.style.border = '1px solid #ddd';
    }
  });
  
  // Habilitar botón
  const btn = document.getElementById('btnSelectMovie');
  if (btn) {
    btn.disabled = false;
    btn.onclick = proceedToSources;
  }
}

// Proceder a fuentes
async function proceedToSources() {
  if (window.selectedMovieIndex === null || !window.searchResults) {
    alert('Por favor, selecciona una película');
    return;
  }
  
  const item = window.searchResults[window.selectedMovieIndex];
  
  // Obtener IMDb ID
  try {
    const imdbId = await getIMDbId(item.id, item.media_type);
    
    if (!imdbId) {
      throw new Error('No se encontró IMDb ID');
    }
    
    // Guardar sesión
    const username = document.getElementById('username').value.trim();
    const roomName = document.getElementById('roomName').value.trim();
    const projectorType = document.querySelector('input[name="projectorType"]:checked').value;
    const sourceMode = document.querySelector('input[name="sourceMode"]:checked').value;
    const customManifest = document.getElementById('customManifest') ? document.getElementById('customManifest').value : '';
    
    const session = {
      username: username,
      roomName: roomName,
      projectorType: projectorType,
      sourceMode: sourceMode,
      customManifest: customManifest
    };
    
    localStorage.setItem('projectorSession', JSON.stringify(session));
    
    // Preparar datos de película
    const movieData = {
      id: item.id,
      imdbId: imdbId,
      type: item.media_type === 'movie' ? 'movie' : 'series',
      title: item.title || item.name,
      poster: 'https://image.tmdb.org/t/p/w500' + item.poster_path,
      rating: item.vote_average ? item.vote_average.toFixed(1) : 'N/A',
      year: (item.release_date || item.first_air_date || '').substring(0, 4),
      overview: item.overview || 'Sin descripción disponible'
    };
    
    // Codificar para URL
    const movieParam = encodeURIComponent(JSON.stringify(movieData));
    const url = '/sources.html?movie=' + movieParam;
    
    // Redirigir
    window.location.href = url;
    
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
}

// Obtener IMDb ID
async function getIMDbId(tmdbId, mediaType) {
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '/external_ids?api_key=' + TMDB_API_KEY;
  
  const res = await fetch(url);
  const data = await res.json();
  
  return data.imdb_id || null;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listener para tipo de proyector
document.addEventListener('DOMContentLoaded', function() {
  const radios = document.querySelectorAll('input[name="projectorType"]');
  radios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      const customInput = document.getElementById('customManifestInput');
      if (this.value === 'custom') {
        if (customInput) customInput.style.display = 'block';
      } else {
        if (customInput) customInput.style.display = 'none';
      }
    });
  });
});
