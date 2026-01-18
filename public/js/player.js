let player;
let hls;

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

function handleStream(url, title) {
  const format = detectFormat(url);
  
  console.log('🎥 Stream:', url);
  console.log('📦 Formato:', format.name);
  
  if (format.canPlay) {
    showPlayer();
    loadPlayer(url, format);
  } else {
    showExternal(url, title, format);
  }
}

function detectFormat(url) {
  const u = url.toLowerCase();
  
  if (u.includes('.m3u8') || u.includes('m3u8')) return { name: 'HLS', type: 'application/x-mpegURL', canPlay: true };
  if (u.includes('.mpd') || u.includes('mpd')) return { name: 'DASH', type: 'application/dash+xml', canPlay: true };
  if (u.includes('.mp4') || u.includes('mp4')) return { name: 'MP4', type: 'video/mp4', canPlay: true };
  if (u.includes('.webm') || u.includes('webm')) return { name: 'WebM', type: 'video/webm', canPlay: true };
  
  // MKV/AVI/otros → Externo
  if (u.includes('.mkv') || u.includes('mkv')) return { name: 'MKV', type: null, canPlay: false };
  if (u.includes('.avi') || u.includes('avi')) return { name: 'AVI', type: null, canPlay: false };
  
  // Desconocido → Intentar MP4
  return { name: 'Desconocido', type: 'video/mp4', canPlay: true };
}

function loadPlayer(url, format) {
  const video = document.getElementById('videoPlayer');
  
  // HLS
  if (format.name === 'HLS') {
    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    }
    return;
  }
  
  // Otros
  video.src = url;
}

function showPlayer() {
  document.getElementById('playerContainer').style.display = 'block';
  document.getElementById('externalContainer').style.display = 'none';
  
  // Inicializar Video.js
  player = videojs('videoPlayer', {
    controls: true,
    fluid: true,
    preload: 'auto'
  });
  
  player.on('error', () => {
    console.error('❌ Player error → Fallback externo');
    showExternal(streamUrl, 'Video', { name: 'Error', canPlay: false });
  });
  
  setupPiP();
}

function setupPiP() {
  const video = document.getElementById('videoPlayer');
  const btnPiP = document.getElementById('btnPiP');
  
  if (document.pictureInPictureEnabled) {
    btnPiP.onclick = async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          btnPiP.textContent = '📺 PiP';
        } else {
          await video.requestPictureInPicture();
          btnPiP.textContent = '🔳 Salir PiP';
        }
      } catch (e) {
        console.error('PiP error:', e);
      }
    };
  }
}

function showExternal(url, title, format) {
  document.getElementById('externalContainer').style.display = 'block';
  document.getElementById('playerContainer').style.display = 'none';
  
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  document.getElementById('formatInfo').textContent = 
    `Formato ${format.name} → Usa reproductor externo:`;
  
  document.getElementById('btnInfuse').href = `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`;
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
        alert('✅ Copiado');
      }
    } catch (e) {}
  };
}

loadRoom();
