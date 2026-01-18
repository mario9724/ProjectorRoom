let player;

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
      
      // 🎬 DETECTAR FORMATO Y ACTUAR
      console.log('🎥 Stream URL:', streamUrl);
      
      // 1. MKV (WebStreamr) → SOLO EXTERNOS
      if (streamUrl.includes('.mkv') || streamUrl.includes('mkv')) {
        console.log('⚠️ MKV detectado - Usando reproductores externos');
        showExternalButtons(streamUrl, m.title, 'MKV no soportado en navegadores');
        return;
      }
      
      // 2. M3U8 (Debrid HLS) → HLS.js + Plyr
      if (streamUrl.includes('.m3u8') || streamUrl.includes('m3u8')) {
        console.log('✅ HLS detectado - Usando HLS.js');
        loadHLS(streamUrl, m.title);
        return;
      }
      
      // 3. MP4/WEBM → Nativo
      if (streamUrl.match(/\.(mp4|webm)$/i)) {
        console.log('✅ MP4/WebM - Player nativo');
        loadNative(streamUrl, m.title);
        return;
      }
      
      // 4. Desconocido → Intentar nativo con fallback
      console.log('⚠️ Formato desconocido - Intentando nativo');
      loadNative(streamUrl, m.title);
      
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
  }
}

// ════════════════════════════════════════════
// HLS.js + Plyr (para Debrid m3u8)
// ════════════════════════════════════════════
function loadHLS(url, title) {
  const video = document.getElementById('videoPlayer');
  
  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      }
    });
    
    hls.loadSource(url);
    hls.attachMedia(video);
    
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ HLS manifest cargado');
      
      // Inicializar Plyr DESPUÉS de HLS
      player = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        settings: ['quality', 'speed'],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
      });
    });
    
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS Error:', data);
      if (data.fatal) {
        showExternalButtons(url, title, 'Error cargando stream HLS');
      }
    });
    
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari iOS nativo
    video.src = url;
    player = new Plyr(video);
  } else {
    showExternalButtons(url, title, 'HLS no soportado en este navegador');
  }
}

// ════════════════════════════════════════════
// Player Nativo (MP4/WebM)
// ════════════════════════════════════════════
function loadNative(url, title) {
  const video = document.getElementById('videoPlayer');
  video.src = url;
  
  player = new Plyr(video, {
    controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
    settings: ['speed'],
    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
  });
  
  video.addEventListener('error', () => {
    console.error('❌ Error video nativo:', video.error);
    showExternalButtons(url, title, 'Error de reproducción');
  });
}

// ════════════════════════════════════════════
// BOTONES EXTERNOS (fallback)
// ════════════════════════════════════════════
function showExternalButtons(url, title, reason) {
  document.getElementById('playerContainer').style.display = 'none';
  document.getElementById('externalButtons').style.display = 'block';
  
  document.getElementById('fallbackTitle').textContent = '🎬 ' + title;
  document.getElementById('fallbackMsg').textContent = reason + '. Usa un reproductor externo:';
  
  // Deep links
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  document.getElementById('btnInfuse').href = 
    `infuse://x-callback-url/play?url=${encodeURIComponent(url)}`;
  
  document.getElementById('btnVLC').href = isIOS 
    ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`
    : url;
  
  document.getElementById('btnBrowser').href = url;
  
  // Share/Cast
  document.getElementById('btnShare').onclick = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: title,
          text: `Reproducir: ${title}`,
          url: url
        });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('✅ Enlace copiado');
      }
    } catch (e) {}
  };
  
  // Hint
  const hint = document.getElementById('platformHint');
  if (isIOS) {
    hint.innerHTML = '<strong>💡 iOS:</strong> Usa Infuse (mejor) o VLC. Puedes hacer AirPlay desde ahí.';
  } else if (/Android/i.test(navigator.userAgent)) {
    hint.innerHTML = '<strong>💡 Android:</strong> Toca VLC y el sistema preguntará "Abrir con...". Para Cast usa Compartir.';
  } else {
    hint.innerHTML = '<strong>💡 PC:</strong> Descarga VLC y abre el enlace copiado con Compartir.';
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: #4f46e5; color: white; padding: 1rem 2rem;
    border-radius: 8px; z-index: 9999; font-weight: 600;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

loadRoom();
