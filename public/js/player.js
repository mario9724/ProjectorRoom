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
      
      // BOTÓN VLC (siempre disponible)
      setupVLCButton(streamUrl);
      
      // REPRODUCIR INTEGRADO
      console.log('🎥 Stream URL:', streamUrl);
      initPlayer(streamUrl);
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
  }
}

function setupVLCButton(url) {
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const btnVLC = document.getElementById('btnVLC');
  
  if (isIOS) {
    btnVLC.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`;
  } else {
    btnVLC.href = url;
    btnVLC.setAttribute('download', '');
  }
}

function initPlayer(url) {
  const video = document.getElementById('videoPlayer');
  
  // Detectar formato
  const isHLS = url.includes('.m3u8') || url.includes('m3u8');
  const isMKV = url.includes('.mkv') || url.includes('mkv');
  
  if (isHLS) {
    loadHLS(url, video);
  } else {
    loadDirect(url, video);
  }
}

// ════════════════════════════════════════════
// HLS.js (m3u8 - Debrid)
// ════════════════════════════════════════════
function loadHLS(url, video) {
  if (Hls.isSupported()) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      }
    });
    
    hls.loadSource(url);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS cargado');
      initPlyr(video);
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS Error:', data);
      if (data.fatal) {
        console.log('Error fatal - usar VLC');
      }
    });
    
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari nativo
    video.src = url;
    initPlyr(video);
  }
}

// ════════════════════════════════════════════
// Directo (MP4, MKV, HTTP)
// ════════════════════════════════════════════
function loadDirect(url, video) {
  video.src = url;
  initPlyr(video);
  
  video.addEventListener('error', (e) => {
    console.error('❌ Error video:', video.error);
  });
}

// ════════════════════════════════════════════
// Plyr (controles bonitos)
// ════════════════════════════════════════════
function initPlyr(video) {
  player = new Plyr(video, {
    controls: [
      'play-large',
      'play',
      'progress',
      'current-time',
      'duration',
      'mute',
      'volume',
      'captions',
      'settings',
      'pip',
      'airplay',
      'fullscreen'
    ],
    settings: ['quality', 'speed', 'loop'],
    speed: { 
      selected: 1, 
      options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] 
    },
    quality: {
      default: 'auto',
      options: ['auto']
    },
    ratio: '16:9',
    fullscreen: { 
      enabled: true, 
      fallback: true, 
      iosNative: true 
    }
  });
  
  player.on('ready', () => {
    console.log('✅ Player listo');
  });
  
  player.on('error', (e) => {
    console.error('❌ Player error:', e);
  });
}

loadRoom();
