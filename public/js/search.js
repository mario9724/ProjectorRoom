let selectedContent = null;
let imdbId = null;
let availableSources = [];

// BÚSQUEDA TMDB
async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  const apiKey = document.getElementById('tmdbApiKey').value.trim();
  
  if (!apiKey) {
    return alert('⚠️ Ingresa primero tu TMDB API Key');
  }
  
  if (!query) {
    return alert('⚠️ Escribe algo para buscar');
  }
  
  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">🔄 Buscando...</div>';
  
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=es-ES&include_adult=false`
    );
    
    if (!response.ok) throw new Error('API Key inválida o error TMDB');
    
    const data = await response.json();
    const items = data.results.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv'
    );
    
    if (items.length === 0) {
      resultsDiv.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">No se encontraron resultados</div>';
      return;
    }
    
    resultsDiv.innerHTML = items.slice(0, 20).map(item => {
      const title = item.title || item.name;
      const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4) || '?';
      const type = item.media_type === 'movie' ? '🎬' : '📺';
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '';
      
      return `
        <div class="result-item" onclick='selectContent(${JSON.stringify({
          id: item.id,
          type: item.media_type,
          title: title,
          year: year,
          poster: poster
        })})'>
          <div class="result-poster" style="${poster ? `background-image:url(${poster})` : ''}"></div>
          <div class="result-info">
            <h4>${type} ${title}</h4>
            <p>${year}</p>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    resultsDiv.innerHTML = `<div style="grid-column:1/-1;color:#ef4444;text-align:center;padding:2rem">❌ ${error.message}</div>`;
  }
}

// SELECCIONAR CONTENIDO
async function selectContent(content) {
  selectedContent = content;
  const apiKey = document.getElementById('tmdbApiKey').value.trim();
  
  // Obtener IMDb ID
  try {
    const endpoint = content.type === 'movie' ? 'movie' : 'tv';
    const response = await fetch(
      `https://api.themoviedb.org/3/${endpoint}/${content.id}/external_ids?api_key=${apiKey}`
    );
    const data = await response.json();
    imdbId = data.imdb_id;
    
    if (!imdbId) {
      throw new Error('Este contenido no tiene IMDb ID disponible');
    }
    
    // Mostrar selección
    document.getElementById('selectedContent').style.display = 'block';
    document.getElementById('contentCard').innerHTML = `
      <div class="content-poster" style="${content.poster ? `background-image:url(${content.poster})` : ''}"></div>
      <div class="content-details">
        <h3>${content.title}</h3>
        <p><strong>Tipo:</strong> ${content.type === 'movie' ? 'Película' : 'Serie TV'}</p>
        <p><strong>Año:</strong> ${content.year}</p>
        <p><strong>IMDb ID:</strong> ${imdbId}</p>
        <span class="badge">✅ Listo para buscar fuentes</span>
      </div>
    `;
    
    // Mostrar sección de fuentes
    document.getElementById('sourcesSection').style.display = 'block';
    document.getElementById('sourcesList').innerHTML = '';
    document.getElementById('roomOptions').style.display = 'none';
    
    // Scroll suave
    document.getElementById('sourcesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// BUSCAR FUENTES CON MANIFEST
async function fetchSources() {
  if (!selectedContent || !imdbId) {
    return alert('⚠️ Selecciona primero una película/serie');
  }
  
  const manifestUrl = document.getElementById('manifestUrl').value.trim();
  if (!manifestUrl) {
    return alert('⚠️ Ingresa la URL del Manifest Stremio');
  }
  
  const sourcesDiv = document.getElementById('sourcesList');
  sourcesDiv.innerHTML = '<div style="text-align:center;padding:2rem;color:#06b6d4">🔄 Consultando addon Stremio...</div>';
  
  try {
    // Obtener manifest
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) throw new Error('No se puede acceder al manifest');
    const manifest = await manifestRes.json();
    
    // Construir URL de streams
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const mediaType = selectedContent.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${mediaType}/${imdbId}.json`;
    
    console.log('🔗 Consultando:', streamUrl);
    
    const streamRes = await fetch(streamUrl);
    if (!streamRes.ok) throw new Error('El addon no devolvió fuentes');
    
    const streamData = await streamRes.json();
    availableSources = (streamData.streams || []).filter(s => s.url);
    
    if (availableSources.length === 0) {
      throw new Error(`${manifest.name || 'El addon'} no tiene fuentes para este contenido`);
    }
    
    // Mostrar fuentes
    sourcesDiv.innerHTML = availableSources.slice(0, 15).map((source, index) => {
      const title = (source.title || 'HD Stream').split('\n')[0];
      const seeds = source.seeds || 0;
      const seedsClass = seeds > 100 ? 'seeds-high' : 'seeds-low';
      
      return `
        <label class="source-item">
          <input type="radio" name="selectedSource" value="${source.url}" ${index === 0 ? 'checked' : ''}>
          <div class="source-info">
            <strong>${title}</strong>
            <small>${source.provider || manifest.name || 'Stremio'}</small>
          </div>
          ${seeds > 0 ? `<span class="source-seeds ${seedsClass}">⬆ ${seeds}</span>` : ''}
        </label>
      `;
    }).join('');
    
    // Mostrar opciones de sala
    document.getElementById('roomOptions').style.display = 'block';
    document.getElementById('createBtn').textContent = `🚀 Crear "${selectedContent.title}" (${availableSources.length} fuentes)`;
    
    // Scroll
    document.getElementById('roomOptions').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (error) {
    sourcesDiv.innerHTML = `
      <div style="background:rgba(245,158,11,0.1);border:2px solid #f59e0b;border-radius:12px;padding:1.5rem;color:#f59e0b">
        ⚠️ ${error.message}
      </div>
    `;
  }
}

// CREAR SALA
async function createRoom() {
  const username = document.getElementById('username').value.trim();
  const roomName = document.getElementById('roomName').value.trim();
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  const sourceUrl = document.querySelector('input[name="selectedSource"]:checked')?.value;
  
  if (!username || !roomName) {
    return alert('⚠️ Completa nombre de usuario y nombre de sala');
  }
  
  if (!selectedContent || !sourceUrl) {
    return alert('⚠️ Selecciona contenido y fuente');
  }
  
  try {
    const response = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName,
        hostUsername: username,
        manifest: JSON.stringify({
          tmdbId: selectedContent.id,
          imdbId: imdbId,
          title: selectedContent.title,
          type: selectedContent.type
        }),
        sourceUrl,
        useHostSource
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(username)}`;
    } else {
      alert('❌ Error: ' + data.error);
    }
    
  } catch (error) {
    alert('❌ Error de conexión: ' + error.message);
  }
}

// Enter para buscar
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && e.target.id === 'searchQuery') {
    searchContent();
  }
});
