let player;
let hls;
let ffmpeg;

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (data.success) {
      const m = JSON.parse(data.projectorRoom.manifest);
      const streamUrl = data.projectorRoom.source_url;
      
      // Banner
      document.getElementById('roomTitle').textContent = 
        `Proyectando "${m.title}" en ${data.projectorRoom.room_name} de ${data.projectorRoom.host_username}`;
      document.getElementById('moviePoster').style.backgroundImage = 
        m.poster ? `url(${m.poster})` : '';
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = 
        `<p>Año: ${m.year} | Anfitrión: ${data.projectorRoom.host_username}</p>`;
      
      // PROCESAR STREAM
      handleStream(streamUrl, m.title);
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
  }
}

async function handleStream(url, title) {
  const format = detectFormat(url);
  
  console.log('🎥 Stream:', url);
  console.log('📦 Formato:', format.name);
  
  // ════════════════════════════════════════════
  // HLS (m3u8)
  // ════════════════════════════════════════════
  if (format.name === 'HLS') {
    showPlayer();
    loadHLS(url);
    return;
  }
  
  // ════════════════════════════════════════════
  // MP4 / WebM / DASH (nativos)
  // ════════════════════════════════════════════
  if (['MP4', 'WebM', 'DASH'].includes(format.name)) {
    showPlayer();
    loadVideoJS(url, format.type);
    return;
  }
  
  // ════════════════════════════════════════════
  // MKV (convertir con FFmpeg)
  // ════════════════════════════════════════════
  if (format.name === 'MKV') {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // En móvil: ofrecer conversión o VLC
    if (isMobile) {
      const convert = confirm(
        '⚠️ MKV detectado.\n\n' +
        '✅ Convertir ahora (~30s, requiere datos)\n' +
        '❌ Cancelar y usar VLC externo'
      );
      
      if (!convert) {
        showExternal(url, title, format);
        return;
      }
    }
    
    // Convertir MKV
    try {
      const convertedUrl = await convertMKV(url);
      showPlayer();
      loadVideoJS(convertedUrl, 'video/mp4');
    } catch (error) {
      console.error('❌ Error conversión:', error);
      showExternal(url, title, format);
    }
    return;
  }
  
  // ════════════════════════════════════════════
  // OTROS (AVI, etc) → VLC externo
  // ════════════════════════════════════════════
  showExternal(url, title, format);
}

function detectFormat(url) {
  const u = url.toLowerCase();
  
  if (u.includes('.m3u8') || u.includes('m3u8')) {
    return { name: 'HLS', type: 'application/x-mpegURL' };
  }
  if (u.includes('.mpd') || u.includes('mpd')) {
    return { name: 'DASH', type: 'application/dash+xml' };
  }
  if (u.includes('.mp4') || u.includes('mp4')) {
    return { name: 'MP4', type: 'video/mp4' };
  }
  if (u.includes('.webm') || u.includes('webm')) {
    return { name: 'WebM', type: 'video/webm' };
  }
  if (u.includes('.mkv') || u.includes('mkv')) {
    return { name: 'MKV', type: null };
  }
  if (u.includes('.avi') || u.includes('avi')) {
    return { name: 'AVI', type: null };
  }
  
  return { name: 'Desconocido', type: 'video/mp4' };
}

// ════════════════════════════════════════════
// HLS.js
// ════════════════════════════════════════════
function loadHLS(url) {
  const video = document.getElementById('videoPlayer');
  
  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 30
    });
    
    hls.loadSource(url);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS listo');
      initControls();
    });
    
    hls.on(Hls.Events.ERROR, (e, data) => {
      if (data.fatal) {
        console.error('❌ HLS fatal:', data);
      }
    });
    
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    initControls();
  }
}

// ════════════════════════════════════════════
// Video.js (MP4/DASH/WebM)
// ════════════════════════════════════════════
function loadVideoJS(url, type) {
  player = videojs('videoPlayer', {
    controls: true,
    fluid: true,
    preload: 'auto'
  });
  
  player.src({ src: url, type: type });
  console.log('✅ Video.js listo');
}

// ════════════════════════════════════════════
// FFMPEG.WASM (convertir MKV → MP4)
// ════════════════════════════════════════════
async function convertMKV(url) {
  showConversion();
  
  try {
    // Cargar FFmpeg
    updateConversion('Cargando FFmpeg WASM...', 10);
    const { FFmpeg } = FFmpegWASM;
    const { fetchFile } = FFmpegUtil;
    
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
    
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      updateConversion(`Convirtiendo... ${percent}%`, 30 + (progress * 60));
    });
    
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js'
    });
    
    // Descargar MKV
    updateConversion('Descargando archivo...', 20);
    const data = await fetchFile(url);
    
    // Escribir input
    updateConversion('Preparando conversión...', 30);
    await ffmpeg.writeFile('input.mkv', data);
    
    // REMUX (sin recodificar video, solo container)
    updateConversion('Convirtiendo a MP4...', 40);
    await ffmpeg.exec([
      '-i', 'input.mkv',
      '-c:v', 'copy',       // Copiar video sin recodificar
      '-c:a', 'aac',        // Audio a AAC
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    
    // Leer output
    updateConversion('Finalizando...', 90);
    const output = await ffmpeg.readFile('output.mp4');
    
    // Crear blob URL
    const blob = new Blob([output.buffer], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(blob);
    
    updateConversion('✅ Conversión completa', 100);
    
    setTimeout(() => {
      document.getElementById('conversionLoader').style.display = 'none';
    }, 500);
    
    return blobUrl;
    
  } catch (error) {
    console.error('❌ Error FFmpeg:', error);
    throw error;
  }
}

function showConversion() {
  document.getElementById('conversionLoader').style.display = 'block';
  document.getElementById('playerContainer').style.display = 'none';
  document.getElementById('externalContainer').style.display = 'none';
}

function updateConversion(text, percent) {
  document.getElementById('conversionStatus').textContent = text;
  document.getElementById('conversionProgress').style.width = percent + '%';
}

function showPlayer() {
  document.getElementById('playerContainer').style.display = 'block';
  document.getElementById('conversionLoader').style.display = 'none';
  document.getElementById('externalContainer').style.display = 'none';
}

function showExternal(url, title, format) {
  document.getElementById('externalContainer').style.display = 'block';
  document.getElementById('conversionLoader').style.display = 'none';
  document.getElementById('playerContainer').style.display = 'none';
  
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  document.getElementById('formatInfo').textContent = 
    `Formato ${format.name} - Mejor experiencia con reproductor externo:`;
  
  document.getElementById('btnInfuse').href = 
    `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`;
  
  document.getElementById('btnVLC').href = isIOS 
    ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`
    : url;
  
  document.getElementById('btnBrowser').href = url;
  
  document.getElementById('btnShare').onclick = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('✅ Enlace copiado');
      }
    } catch (e) {}
  };
}

function initControls() {
  // Controles adicionales si usas HLS.js sin Video.js
  const video = document.getElementById('videoPlayer');
  video.controls = true;
}

loadRoom();
