const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%2C%22mediaFlowProxyUrl%22%3A%22%22%2C%22mediaFlowProxyPassword%22%3A%22%22%7D/manifest.json';

let selectedContent = null;
let imdbId = null;
let movieDetails = null;

function toggleCustomProjector() {
  const isCustom = document.querySelector('input[name="projectorType"]:checked').value === 'custom';
  document.getElementById('customManifest').style.display = isCustom ? 'block' : 'none';
}

async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) return alert('⚠️ Escribe algo para buscar');
  
  const resultsDiv = document.getElementById('searchResults');
  resultsDiv.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">🔄 Buscando...</div>';
  
  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=es-ES`
    );
    const data = await response.json();
    const items = data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv');
    
    if (items.length === 0) {
      resultsDiv.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">Sin resultados</div>';
      return;
    }
    
    resultsDiv.innerHTML = items.slice(0, 20).map(item => {
      const title = item.title || item.name;
      const year = item.release_date?.slice(0,4) || item.first_air_date?.slice(0,4) || '?';
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
            <h4>${item.media_type === 'movie' ? '🎬' : '📺'} ${title}</h4>
            <p>${year}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    resultsDiv.innerHTML = `<div style="grid-column:1/-1;color:#ef4444;text-align:center;padding:2rem">❌ Error: ${error.message}</div>`;
  }
}

async function selectContent(content) {
  selectedContent = content;
  
  try {
    // Obtener detalles completos
    const endpoint = content.type === 'movie' ? 'movie' : 'tv';
    const [details, externals] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${endpoint}/${content.id}?api_key=${TMDB_API_KEY}&language=es-ES`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/${endpoint}/${content.id}/external_ids?api_key=${TMDB_API_KEY}`).then(r => r.json())
    ]);
    
    imdbId = externals.imdb_id;
    movieDetails = details;
    
    if (!imdbId) throw new Error('IMDb ID no disponible');
    
    document.getElementById('selectedContent').style.display = 'block';
    document.getElementById('contentCard').innerHTML = `
      <div class="content-poster" style="${content.poster ? `background-image:url(${content.poster})` : ''}"></div>
      <div class="content-details">
        <h3>${content.title}</h3>
        <p><strong>Tipo:</strong> ${content.type === 'movie' ? 'Película' : 'Serie'}</p>
        <p><strong>Año:</strong> ${content.year}</p>
        <p><strong>IMDb:</strong> ${imdbId}</p>
      </div>
    `;
    
    document.getElementById('sourcesSection').style.display = 'none';
    document.getElementById('selectedContent').scrollIntoView({ behavior: 'smooth' });
    
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

async function fetchSources() {
  if (!selectedContent || !imdbId) return alert('⚠️ Selecciona contenido');
  
  const projectorType = document.querySelector('input[name="projectorType"]:checked').value;
  const manifestUrl = projectorType === 'public' ? PUBLIC_MANIFEST : document.getElementById('customManifest').value.trim();
  
  if (!manifestUrl) return alert('⚠️ Ingresa URL del manifest');
  
  const sourcesDiv = document.getElementById('sourcesList');
  sourcesDiv.innerHTML = '<div style="text-align:center;padding:2rem;color:#06b6d4">🔄 Buscando fuentes...</div>';
  document.getElementById('sourcesSection').style.display = 'block';
  
  try {
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();
    
    const baseUrl = manifestUrl.replace('/manifest.json', '');
    const mediaType = selectedContent.type === 'movie' ? 'movie' : 'series';
    const streamUrl = `${baseUrl}/stream/${mediaType}/${imdbId}.json`;
    
    const streamRes = await fetch(streamUrl);
    const streamData = await streamRes.json();
    const streams = (streamData.streams || []).filter(s => s.url);
    
    if (streams.length === 0) throw new Error('No hay fuentes');
    
    const username = document.getElementById('username').value.trim();
    const roomName = document.getElementById('roomName').value.trim();
    const addonName = manifest.name || 'Proyector Público';
    
    sourcesDiv.innerHTML = streams.slice(0, 12).map(stream => {
      const resolution = stream.title?.split(' - ')[0] || 'HD';
      const sourceUrl = stream.url;
      
      return `
        <div class="source-item" onclick='createRoom("${sourceUrl}")'>
          <div class="source-title">
            Proyectar en ${resolution} desde ${addonName}
          </div>
          <div class="source-subtitle">
            @${roomName || 'Mi Sala'}
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    sourcesDiv.innerHTML = `<div style="color:#ef4444;padding:2rem;text-align:center">❌ ${error.message}</div>`;
  }
}

async function createRoom(sourceUrl) {
  const username = document.getElementById('username').value.trim();
  const roomName = document.getElementById('roomName').value.trim();
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  
  if (!username || !roomName) return alert('⚠️ Completa nombre y sala');
  
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
          poster: selectedContent.poster,
          type: selectedContent.type,
          overview: movieDetails.overview,
          year: selectedContent.year
        }),
        sourceUrl,
        useHostSource
      })
    });
    
    const data = await response.json();
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(username)}`;
    }
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

document.addEventListener('keypress', e => {
  if (e.key === 'Enter' && e.target.id === 'searchQuery') searchContent();
});
