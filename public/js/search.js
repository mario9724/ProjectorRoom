const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let selectedContent = null;
let imdbId = null;
let movieDetails = null;

function toggleProjector() {
  const isCustom = document.querySelector('input[name="projectorType"]:checked').value === 'custom';
  document.getElementById('customManifest').style.display = isCustom ? 'block' : 'none';
}

async function searchContent() {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) return alert('Escribe algo');
  
  const div = document.getElementById('searchResults');
  div.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem">Buscando...</div>';
  
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=es-ES`);
    const data = await res.json();
    const items = data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv');
    
    div.innerHTML = items.slice(0, 20).map(i => `
      <div class="result-item" onclick='selectContent(${JSON.stringify({
        id: i.id, type: i.media_type, title: i.title || i.name,
        year: (i.release_date || i.first_air_date || '').slice(0,4),
        poster: i.poster_path ? 'https://image.tmdb.org/t/p/w200' + i.poster_path : ''
      })})'>
        <div class="result-poster" style="${i.poster_path ? `background-image:url(https://image.tmdb.org/t/p/w200${i.poster_path})` : ''}"></div>
        <div class="result-info">
          <h4>${i.media_type === 'movie' ? '🎬' : '📺'} ${i.title || i.name}</h4>
          <p>${(i.release_date || i.first_air_date || '').slice(0,4)}</p>
        </div>
      </div>
    `).join('');
  } catch (e) {
    div.innerHTML = '<div style="color:red">Error</div>';
  }
}

async function selectContent(c) {
  selectedContent = c;
  
  try {
    const ep = c.type === 'movie' ? 'movie' : 'tv';
    const [det, ext] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${ep}/${c.id}?api_key=${TMDB_API_KEY}&language=es-ES`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/${ep}/${c.id}/external_ids?api_key=${TMDB_API_KEY}`).then(r => r.json())
    ]);
    
    imdbId = ext.imdb_id;
    movieDetails = det;
    
    document.getElementById('selectedContent').style.display = 'block';
    document.getElementById('contentCard').innerHTML = `
      <div style="display:flex;gap:1rem;background:#0f0f23;padding:1rem;border-radius:12px">
        <div style="width:100px;height:150px;background:#374151 center/cover;border-radius:8px;${c.poster ? `background-image:url(${c.poster})` : ''}"></div>
        <div>
          <h3>${c.title}</h3>
          <p>Año: ${c.year}</p>
          <p>IMDb: ${imdbId}</p>
        </div>
      </div>
    `;
    
    document.getElementById('sourcesSection').style.display = 'none';
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function fetchSources() {
  if (!imdbId) return alert('Selecciona contenido');
  
  const type = document.querySelector('input[name="projectorType"]:checked').value;
  const url = type === 'public' ? PUBLIC_MANIFEST : document.getElementById('customManifest').value;
  
  const div = document.getElementById('sourcesList');
  div.innerHTML = 'Cargando...';
  document.getElementById('sourcesSection').style.display = 'block';
  
  try {
    const manifest = await fetch(url).then(r => r.json());
    const base = url.replace('/manifest.json', '');
    const streams = await fetch(`${base}/stream/${selectedContent.type === 'movie' ? 'movie' : 'series'}/${imdbId}.json`).then(r => r.json());
    
    const roomName = document.getElementById('roomName').value || 'Mi Sala';
    
    div.innerHTML = (streams.streams || []).slice(0, 12).map(s => `
      <div class="source-item" onclick='createRoom("${s.url}")'>
        <div style="font-weight:600;color:#06b6d4">Proyectar en ${s.title?.split(' - ')[0] || 'HD'} desde ${manifest.name || 'Público'}</div>
        <div style="color:#94a3b8">@${roomName}</div>
      </div>
    `).join('');
  } catch (e) {
    div.innerHTML = '<div style="color:red">Error: ' + e.message + '</div>';
  }
}

async function createRoom(url) {
  const user = document.getElementById('username').value.trim();
  const room = document.getElementById('roomName').value.trim();
  const mode = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  
  if (!user || !room) return alert('Completa datos');
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        roomName: room, hostUsername: user,
        manifest: JSON.stringify({
          tmdbId: selectedContent.id, imdbId, title: selectedContent.title,
          poster: selectedContent.poster, type: selectedContent.type,
          overview: movieDetails.overview, year: selectedContent.year
        }),
        sourceUrl: url, useHostSource: mode
      })
    });
    
    const data = await res.json();
    if (data.success) window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(user)}`;
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
