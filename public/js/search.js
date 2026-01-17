let selectedContent = null;

async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  const apiKey = document.getElementById('tmdbApiKey').value.trim();
  
  if (!query || !apiKey) {
    alert('⚠️ Completa API Key de TMDB y el término de búsqueda');
    return;
  }
  
  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div>Cargando resultados...</div>';
  
  try {
    // Búsqueda multi (movies + TV) - https://developer.themoviedb.org/reference/search-multi
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=es-ES&include_adult=false`
    );
    
    if (!response.ok) {
      throw new Error(`Error ${response.status}: Verifica tu TMDB API Key`);
    }
    
    const data = await response.json();
    displayResults(data.results.filter(item => 
      item.media_type === 'movie' || item.media_type === 'tv'
    ));
    
  } catch (error) {
    console.error('Error TMDB:', error);
    resultsDiv.innerHTML = `
      <div style="color: #ef4444; padding: 2rem; text-align: center;">
        ❌ Error: ${error.message}<br>
        <small>Obtén tu API Key gratuita en <a href="https://www.themoviedb.org/settings/api" target="_blank">themoviedb.org</a></small>
      </div>
    `;
  }
}

function displayResults(results) {
  const container = document.getElementById('searchResults');
  
  if (results.length === 0) {
    container.innerHTML = '<div style="padding: 2rem; text-align: center;">No se encontraron resultados</div>';
    return;
  }
  
  container.innerHTML = results.slice(0, 12).map(item => {
    const title = item.title || item.name;
    const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4) || 'N/A';
    const type = item.media_type === 'movie' ? '🎬 Película' : '📺 Serie';
    
    return `
      <div class="result-item" onclick="selectContent(${item.id}, '${item.media_type}', '${title.replace(/'/g, "\\'")}', '${year}')">
        <div class="result-poster" style="background-image: url('https://image.tmdb.org/t/p/w200${item.poster_path || item.backdrop_path}')"></div>
        <h4>${title}</h4>
        <p>${type} • ${year}</p>
      </div>
    `;
  }).join('');
}

function selectContent(id, mediaType, title, year) {
  selectedContent = { id, mediaType, title, year };
  
  // Fuentes simuladas (aquí integrarías RealDebrid/Stremio addon)
  const mockSources = [
    { name: '🎥 1080p HTTP', url: `https://demo-vids.com/${mediaType}/${id}/1080p.mp4`, type: 'http' },
    { name: '🔥 1080p RealDebrid', url: `https://demo-vids.com/${mediaType}/${id}/debrid.mp4`, type: 'debrid' },
    { name: '📱 720p Móvil', url: `https://demo-vids.com/${mediaType}/${id}/720p.mp4`, type: 'http' }
  ];
  
  document.getElementById('sourceSelection').style.display = 'block';
  document.querySelector('.host-options').style.display = 'block';
  
  document.getElementById('sourcesList').innerHTML = mockSources.map((source, index) => `
    <label class="source-option">
      <input type="radio" name="selectedSource" value="${source.url}" ${index === 0 ? 'checked' : ''}>
      ${source.name}
    </label>
  `).join('');
  
  document.getElementById('createBtn').textContent = `🚀 Crear "${title}"`;
}

async function createRoom() {
  if (!selectedContent) {
    alert('⚠️ Selecciona un contenido primero');
    return;
  }
  
  const username = document.getElementById('username').value.trim();
  const roomName = document.getElementById('roomName').value.trim();
  const tmdbKey = document.getElementById('tmdbApiKey').value.trim();
  const manifest = document.getElementById('manifest').value;
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  const selectedSource = document.querySelector('input[name="selectedSource"]:checked')?.value;
  
  if (!username || !roomName || !selectedSource) {
    alert('⚠️ Completa todos los campos obligatorios');
    return;
  }
  
  try {
    const response = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        roomName, 
        hostUsername: username, 
        manifest: JSON.stringify({ tmdbKey, ...JSON.parse(manifest || '{}') }),
        sourceUrl: selectedSource,
        useHostSource 
      })
    });
    
    const data = await response.json();
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${username}`;
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    alert('Error de conexión: ' + error.message);
  }
}

// Enter para buscar
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && e.target.id === 'searchQuery') {
    searchContent();
  }
});
