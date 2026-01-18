// MOSTRAR CONSOLA EN PANTALLA (DEBUG)
(function() {
  const consoleDiv = document.createElement('div');
  consoleDiv.id = 'mobileConsole';
  consoleDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;max-height:150px;overflow-y:auto;background:#000;color:#0f0;font-family:monospace;font-size:9px;padding:5px;z-index:99999;border-top:2px solid #0f0;';
  document.body.appendChild(consoleDiv);
  
  function log(type, ...args) {
    const line = document.createElement('div');
    line.textContent = type + ': ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    line.style.color = type === 'ERROR' ? '#f00' : type === 'WARN' ? '#ff0' : '#0f0';
    consoleDiv.appendChild(line);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
  }
  
  window.mobileLog = (...args) => log('LOG', ...args);
  window.mobileError = (...args) => log('ERR', ...args);
  window.mobileWarn = (...args) => log('WARN', ...args);
  
  window.addEventListener('error', e => {
    mobileError('ERROR:', e.message);
  });
})();

mobileLog('✅ welcome.js cargado');

const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
let currentStep = 1;
let searchTimeout = null;

// Navegación entre pasos
function goToStep(step) {
  mobileLog('📍 Navegando a paso', step);
  
  // Validaciones
  if (step === 3) {
    const username = document.getElementById('username').value.trim();
    if (!username) {
      alert('Por favor, escribe tu nombre');
      return;
    }
    mobileLog('👤 Username:', username);
  }
  
  if (step === 4) {
    const roomName = document.getElementById('roomName').value.trim();
    if (!roomName) {
      alert('Por favor, escribe el nombre de la sala');
      return;
    }
    mobileLog('🏠 Room name:', roomName);
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
    mobileLog('🔍 Paso de búsqueda activado');
    setTimeout(initSearch, 100);
  }
}

// Inicializar búsqueda
function initSearch() {
  const input = document.getElementById('searchQuery');
  if (!input) {
    mobileError('❌ No se encontró #searchQuery');
    return;
  }
  
  mobileLog('✅ Input de búsqueda encontrado');
  
  input.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    const query = this.value.trim();
    
    mobileLog('⌨️ Texto escrito:', query);
    
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
  mobileLog('🔎 Buscando:', query);
  
  const container = document.getElementById('searchResults');
  if (!container) {
    mobileError('❌ No se encontró #searchResults');
    return;
  }
  
  container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">⏳</div><p>Buscando...</p></div>';
  
  try {
    const url = 'https://api.themoviedb.org/3/search/multi?api_key=' + TMDB_API_KEY + '&language=es-ES&query=' + encodeURIComponent(query);
    mobileLog('📡 URL TMDB:', url);
    
    const res = await fetch(url);
    const data = await res.json();
    
    mobileLog('📦 Resultados:', data.results ? data.results.length : 0);
    
    const filtered = (data.results || []).filter(function(item) {
      return (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path;
    });
    
    mobileLog('✅ Resultados filtrados:', filtered.length);
    
    if (filtered.length === 0) {
      container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">😕</div><p>No se encontraron resultados</p></div>';
      return;
    }
    
    renderResults(filtered);
    
  } catch (error) {
    mobileError('❌ Error buscando:', error.message);
    container.innerHTML = '<div class="carousel-empty"><div class="empty-icon">❌</div><p>Error en la búsqueda</p></div>';
  }
}

// Renderizar resultados
function renderResults(results) {
  mobileLog('🎨 Renderizando', results.length, 'resultados');
  
  const container = document.getElementById('searchResults');
  if (!container) return;
  
  let html = '<div class="carousel-container"><div class="carousel-track">';
  
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const title = item.title || item.name || 'Sin título';
    const year = (item.release_date || item.first_air_date || '').substring(0, 4);
    const poster = 'https://image.tmdb.org/t/p/w500' + item.poster_path;
    const type = item.media_type === 'movie' ? 'movie' : 'tv';
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
  
  mobileLog('✅ Resultados renderizados');
}

// Seleccionar película
function selectMovie(index) {
  mobileLog('👆 Película seleccionada:', index);
  
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
  mobileLog('🚀 Procediendo a fuentes...');
  
  if (window.selectedMovieIndex === null || !window.searchResults) {
    mobileError('❌ No hay película seleccionada');
    alert('Por favor, selecciona una película');
    return;
  }
  
  const item = window.searchResults[window.selectedMovieIndex];
  mobileLog('📦 Item seleccionado:', item);
  
  // Obtener IMDb ID
  try {
    const imdbId = await getIMDbId(item.id, item.media_type);
    mobileLog('🎬 IMDb ID:', imdbId);
    
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
    
    mobileLog('💾 Guardando session:', session);
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
    
    mobileLog('🎬 Movie ', movieData);
    
    // Codificar para URL
    const movieParam = encodeURIComponent(JSON.stringify(movieData));
    const url = '/sources.html?movie=' + movieParam;
    
    mobileLog('🔗 URL generada:', url);
    mobileLog('📏 URL length:', url.length);
    
    // Redirigir
    window.location.href = url;
    
  } catch (error) {
    mobileError('❌ Error:', error.message);
    alert('Error: ' + error.message);
  }
}

// Obtener IMDb ID
async function getIMDbId(tmdbId, mediaType) {
  mobileLog('🔍 Obteniendo IMDb ID para TMDB:', tmdbId, 'tipo:', mediaType);
  
  const type = mediaType === 'movie' ? 'movie' : 'tv';
  const url = 'https://api.themoviedb.org/3/' + type + '/' + tmdbId + '/external_ids?api_key=' + TMDB_API_KEY;
  
  mobileLog('📡 URL External IDs:', url);
  
  const res = await fetch(url);
  const data = await res.json();
  
  mobileLog('📦 External IDs:', data);
  
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
  mobileLog('✅ DOM loaded');
  
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

mobileLog('✅ welcome.js completamente cargado');
