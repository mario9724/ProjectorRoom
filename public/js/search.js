let selectedMovie = null;
let stremioSources = [];

async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  const apiKey = document.getElementById('tmdbApiKey').value.trim();
  
  if (!query || !apiKey) {
    alert('Completa API Key y búsqueda');
    return;
  }
  
  const grid = document.getElementById('movieGrid');
  grid.innerHTML = '<div style="grid-column:1/-1;padding:2rem;text-align:center">🔄 Buscando...</div>';
  
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=es-ES`
    );
    const data = await res.json();
    
    const movies = data.results.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv'
    ).slice(0, 20);
    
    grid.innerHTML = movies.map(item => {
      const title = item.title || item.name;
      const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4);
      return `
        <div class="movie-card" onclick="selectMovie(${item.id}, '${item.media_type}', '${title.replace(/'/g,"\\'")}', '${year}')">
          <div class="movie-poster" style="${item.poster_path ? `background-image:url(https://image.tmdb.org/t/p/w154${item.poster_path})` : ''}"></div>
          <div class="movie-info">
            <h4>${title}</h4>
            <p>${year}</p>
          </div>
        </div>
      `;
    }).join('');
    
  } catch(e) {
    grid.innerHTML = `<div style="color:#ef4444;padding:2rem">Error: ${e.message}</div>`;
  }
}

function selectMovie(id, mediaType, title, year) {
  selectedMovie = { id, mediaType, title, year };
  
  document.getElementById('selectedMovie').innerHTML = `
    <strong>✅ Seleccionado:</strong> ${title} (${year})<br>
    <small>ID: ${id} | Tipo: ${mediaType}</small>
  `;
  document.getElementById('selectedMovie').style.display = 'block';
  document.getElementById('manifestSection').style.display = 'block';
  
  // Ocultar secciones anteriores
  document.getElementById('sourcesSection').style.display = 'none';
}

async function scrapeSources() {
  if (!selectedMovie) {
    alert('Selecciona película primero');
    return;
  }
  
  const manifestUrl = document.getElementById('manifestUrl').value.trim();
  if (!manifestUrl) {
    alert('Ingresa manifest URL');
    return;
  }
  
  const sourcesDiv = document.getElementById('sourcesList');
  sourcesDiv.innerHTML = '🔄 Raspando streams...';
  document.getElementById('sourcesSection').style.display = 'block';
  
  try {
    // 1. Manifest
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();
    
    // 2. Streams para este ID específico
    const streamPath = manifest.resources.includes('stream') ? 
      `/stream/${selectedMovie.media_type}/${selectedMovie.id}.json` : 
      `/catalog/${selectedMovie.media_type}.json`;
    
    const streamUrl = manifestUrl.replace('/manifest.json', streamPath);
    const streamRes = await fetch(streamUrl);
    const streams = await streamRes.json();
    
    stremioSources = streams.streams?.filter(s => s.url && (s.url.startsWith('http') || s.url.includes('debrid'))) || [];
    
    if (stremioSources.length === 0) {
      throw new Error('No streams disponibles');
    }
    
    // Mostrar fuentes
    sourcesDiv.innerHTML = stremioSources.slice(0, 10).map((s, i) => {
      const q = s.title?.match(/(\d{3,4}p)/)?.[1] || 'HD';
      const seeds = s.seeds || 0;
      return `
        <label class="source-option">
          <input type="radio" name="selectedSource" value="${s.url}" ${i===0?'checked':''}>
          <div>
            <strong>${q}</strong> 
            ${s.flag?` ${s.flag}`:''}
            <span style="color:${seeds>50?'#10b981':'#f59e0b'}">●${seeds}</span><br>
            <small>${s.provider||'Stream'} ${s.size||''}</small>
          </div>
        </label>
      `;
    }).join('');
    
  } catch(e) {
    sourcesDiv.innerHTML = `<div style="color:#f59e0b">Error: ${e.message}</div>`;
  }
}

async function createRoom() {
  const sourceUrl = document.querySelector('input[name="selectedSource"]:checked')?.value;
  if (!sourceUrl) return alert('Selecciona fuente');
  
  const username = document.getElementById('username').value.trim();
  const roomName = document.getElementById('roomName').value.trim();
  const tmdbKey = document.getElementById('tmdbApiKey').value.trim();
  const manifestUrl = document.getElementById('manifestUrl').value.trim();
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        roomName, hostUsername: username,
        manifest: JSON.stringify({tmdbKey, stremioManifest: manifestUrl}),
        sourceUrl, useHostSource
      })
    });
    
    const data = await res.json();
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(username)}`;
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}
