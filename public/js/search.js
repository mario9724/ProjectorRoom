const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let selectedContent = null;
let imdbId = null;
let movieDetails = null;

document.querySelectorAll('input[name="projectorType"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('customManifest').style.display = 
      radio.value === 'custom' ? 'block' : 'none';
  });
});

document.getElementById('searchQuery').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchContent();
});

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
  div.innerHTML = 'Cargando fuentes...';
  document.getElementById('sourcesSection').style.display = 'block';
  
  try {
    const manifest = await fetch(url).then(r => r.json());
    const base = url.replace('/manifest.json', '');
    const streams = await fetch(`${base}/stream/${selectedContent.type === 'movie' ? 'movie' : 'series'}/${imdbId}.json`).then(r => r.json());
    
    // Filtrar solo HTTP/HTTPS
    const httpStreams = (streams.streams || []).filter(s => {
      if (!s.url || typeof s.url !== 'string') return false;
      return s.url.startsWith('http://') || s.url.startsWith('https://');
    });
    
    if (httpStreams.length === 0) {
      throw new Error('Sin fuentes HTTP/Debrid disponibles');
    }
    
    const roomName = document.getElementById('roomName').value || 'Mi Sala';
    
    // PARSEAR FORMATO ADDON (como Stremio)
    div.innerHTML = httpStreams.slice(0, 20).map(s => {
      const info = parseStreamInfo(s, manifest.name);
      return `
        <div class="source-card" onclick='createRoom(${JSON.stringify(s.url)}, ${JSON.stringify(info)})'>
          <div class="source-header">
            <span class="source-quality">${info.quality}</span>
            <span class="source-format ${info.formatClass}">${info.format}</span>
            ${info.seeders ? `<span class="source-seeds">👥 ${info.seeders}</span>` : ''}
          </div>
          
          <div class="source-title">${info.title}</div>
          
          <div class="source-meta">
            ${info.size ? `<span>📦 ${info.size}</span>` : ''}
            ${info.audio ? `<span>🔊 ${info.audio}</span>` : ''}
            ${info.lang ? `<span>🌐 ${info.lang}</span>` : ''}
            ${info.provider ? `<span>📡 ${info.provider}</span>` : ''}
          </div>
          
          <div class="source-room">
            Crear sala: <strong>${roomName}</strong>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (e) {
    div.innerHTML = `<div style="color:#ef4444;padding:2rem;text-align:center">❌ ${e.message}</div>`;
  }
}

// ════════════════════════════════════════════
// PARSEAR INFO DEL STREAM (formato Stremio)
// ════════════════════════════════════════════
function parseStreamInfo(stream, addonName) {
  const title = stream.title || stream.name || 'Stream';
  const lines = title.split('\n');
  
  const info = {
    title: lines[0] || 'Stream',
    quality: 'HD',
    format: 'HTTP',
    formatClass: 'format-http',
    size: null,
    audio: null,
    lang: null,
    seeders: null,
    provider: addonName || 'Addon'
  };
  
  // Detectar calidad (4K, 1080p, 720p, etc)
  const qualityMatch = title.match(/(4K|2160p|1080p|720p|480p|HD|SD|UHD|FHD)/i);
  if (qualityMatch) {
    info.quality = qualityMatch[1].toUpperCase();
  }
  
  // Detectar formato archivo
  const url = stream.url.toLowerCase();
  if (url.includes('.m3u8')) {
    info.format = 'HLS';
    info.formatClass = 'format-hls';
  } else if (url.includes('.mkv')) {
    info.format = 'MKV';
    info.formatClass = 'format-mkv';
  } else if (url.includes('.mp4')) {
    info.format = 'MP4';
    info.formatClass = 'format-mp4';
  } else if (url.includes('.avi')) {
    info.format = 'AVI';
    info.formatClass = 'format-avi';
  } else if (url.includes('debrid')) {
    info.format = 'Debrid';
    info.formatClass = 'format-debrid';
  }
  
  // Detectar tamaño
  const sizeMatch = title.match(/(\d+\.?\d*\s?(GB|MB|TB))/i);
  if (sizeMatch) {
    info.size = sizeMatch[1];
  }
  
  // Detectar audio
  const audioMatch = title.match(/(AAC|AC3|DDP|ATMOS|DTS|TrueHD|5\.1|7\.1)/i);
  if (audioMatch) {
    info.audio = audioMatch[1];
  }
  
  // Detectar idioma
  const langMatch = title.match(/(DUAL|LATINO|SPANISH|ENGLISH|MULTI)/i);
  if (langMatch) {
    info.lang = langMatch[1];
  }
  
  // Detectar seeders (si es torrent convertido)
  const seedMatch = title.match(/👤\s*(\d+)/);
  if (seedMatch) {
    info.seeders = seedMatch[1];
  }
  
  // Detectar proveedor específico
  if (url.includes('real-debrid')) info.provider = 'RealDebrid';
  else if (url.includes('alldebrid')) info.provider = 'AllDebrid';
  else if (url.includes('torbox')) info.provider = 'TorBox';
  else if (url.includes('premiumize')) info.provider = 'Premiumize';
  else if (url.includes('pixeldrain')) info.provider = 'PixelDrain';
  else if (url.includes('streamtape')) info.provider = 'StreamTape';
  
  return info;
}

async function createRoom(url, streamInfo) {
  const user = document.getElementById('username').value.trim();
  const room = document.getElementById('roomName').value.trim();
  const mode = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  
  if (!user || !room) return alert('Completa datos');
  
  try {
    const res = await fetch('/api/projectorrooms/create', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        roomName: room, 
        hostUsername: user,
        manifest: JSON.stringify({
          tmdbId: selectedContent.id, 
          imdbId, 
          title: selectedContent.title,
          poster: selectedContent.poster, 
          type: selectedContent.type,
          overview: movieDetails.overview, 
          year: selectedContent.year,
          streamInfo: streamInfo // GUARDAR INFO DEL STREAM
        }),
        sourceUrl: url, 
        useHostSource: mode
      })
    });
    
    const data = await res.json();
    if (data.success) {
      window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${encodeURIComponent(user)}`;
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
