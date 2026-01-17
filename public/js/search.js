let selectedContent = null;
let stremioSources = [];

async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  const apiKey = document.getElementById('tmdbApiKey').value.trim();
  
  if (!query || !apiKey) {
    alert('⚠️ Completa TMDB API Key y término de búsqueda');
    return;
  }
  
  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div style="padding:2rem;text-align:center">🔄 Buscando...</div>';
  
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=es-ES&include_adult=false`
    );
    
    if (!response.ok) throw new Error(`TMDB Error ${response.status}`);
    
    const data = await response.json();
    displayResults(data.results.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv'
    ));
    
  } catch (error) {
    resultsDiv.innerHTML = `
      <div style="color:#ef4444;padding:2rem;text-align:center">
        ❌ ${error.message}<br>
        <small><a href="https://www.themoviedb.org/settings/api" target="_blank">Obtener API Key</a></small>
      </div>
    `;
  }
}

function displayResults(results) {
  const container = document.getElementById('searchResults');
  
  if (results.length === 0) {
    container.innerHTML = '<div style="padding:2rem;text-align:center">No hay resultados</div>';
    return;
  }
  
  container.innerHTML = results.slice(0, 12).map(item => {
    const title = item.title || item.name;
    const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4) || 'N/A';
    const type = item.media_type === 'movie' ? '🎬 Película' : '📺 Serie';
    
    return `
      <div class="result-item" onclick="selectContent(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${year}')">
        <div class="result-poster" style="${item.poster_path ? `background-image:url(https://image.tmdb.org/t/p/w200${item.poster_path})` : ''}"></div>
        <h4>${title}</h4>
        <p>${type} • ${year}</p>
      </div>
    `;
  }).join('');
}

async function selectContent(id, mediaType, title, year) {
  selectedContent = { id, mediaType, title, year };
  await loadSourcesFromManifest(id, mediaType, title);
}

async function loadSourcesFromManifest(tmdbId, mediaType, title) {
  const manifestUrl = document.getElementById('manifestUrl').value.trim();
  const sourcesDiv = document.getElementById('sourcesList');
  
  sourcesDiv.innerHTML = '<div>🔄 Cargando streams Stremio...</div>';
  
  try {
    // 1. Obtener manifest
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();
    
    // 2. ID Stremio (TMDB → IMDb-like)
    const stremioId = mediaType === 'movie' ? 
      `tt${tmdbId.toString().padStart(7, '0')}` : 
      `${mediaType}:${tmdbId}`;
    
    // 3. Consultar streams
    const streamUrl = manifestUrl.replace('/manifest.json', `/stream/${mediaType}/${tmdbId}.json`);
    const streamRes = await fetch(streamUrl);
    const streamData = await streamRes.json();
    
    stremioSources = (streamData.streams || []).filter(s => s.url);
    
    if (stremioSources.length === 0) {
      throw new Error(`${manifest.name || 'Addon'} no tiene streams`);
    }
    
    // 4. Mostrar
    sourcesDiv.innerHTML = stremioSources.slice(0, 8).map((stream, i) => {
      const quality = stream.title?.split(' - ')[0] || 'HD';
      const seeds = stream.seeds || 0;
      
      return `
        <label class="source-option">
          <input type="radio" name="selectedSource" value="${stream.url}" ${i===0?'checked':''}>
          <div>
            <strong>${quality}</strong> 
            ${stream.flag?` ${stream.flag}`:''}
            <span style="color:${seeds>50?'#10b981':'#f59e0b'}"> ● ${seeds}</span><br>
            <small>${stream.provider||'Stremio'} • ${stream.size||'N/A'}</small>
          </div>
        </label>
      `;
    }).join('');
    
    document.getElementById('sourceSelection').style.display = 'block';
    document.querySelector('.host-options').style.display = 'block';
    
  } catch (error) {
    sourcesDiv.innerHTML = `
      <div style="color:#f59e0b;padding:1.5rem;border-radius:12px">
        ⚠️ ${error.message}<br>
        <button onclick="setDefaultManifest()" style="margin-top:0.5rem">Probar Torrentio</button>
      </div>
    `;
  }
}

function setDefaultManifest() {
  document.getElementById('manifestUrl').value = 'https://torrentio.strem.fun/manifest.json';
}

async function createRoom() {
  if (!selectedContent || !stremioSources.length) {
    return alert('⚠️ Selecciona película y fuente');
  }
  
  const username = document.getElementById('username').value.trim();
  const roomName = document.getElementById('roomName').value.trim();
  const tmdbKey = document.getElementById('tmdbApiKey').value.trim();
  const manifestUrl = document.getElementById('manifestUrl').value.trim();
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  const sourceUrl = document.querySelector('input[name="selectedSource"]:checked')?.value;
  
  if (!username || !roomName || !sourceUrl) {
    return alert('⚠️ Completa todos los campos');
  }
  
  try {
    const response = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        roomName, hostUsername: username,
        manifest: JSON.stringify({tmdbKey, stremioManifest: manifestUrl}),
        sourceUrl, useHostSource
      })
    });
    
    const data = await response.json();
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(username)}`;
    }
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

document.addEventListener('keypress', e => {
  if (e.key === 'Enter' && document.activeElement.id === 'searchQuery') {
    searchContent();
  }
});
