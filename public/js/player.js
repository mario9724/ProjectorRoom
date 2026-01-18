let currentUrl = '';
let useIframe = false;

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (data.success) {
      const m = JSON.parse(data.projectorRoom.manifest);
      
      // Banner
      document.getElementById('roomTitle').textContent = 
        `Proyectando "${m.title}" en ${data.projectorRoom.room_name} de ${data.projectorRoom.host_username}`;
      document.getElementById('moviePoster').style.backgroundImage = m.poster ? `url(${m.poster})` : '';
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = `<p>Año: ${m.year} | Anfitrión: ${data.projectorRoom.host_username}</p>`;
      
      // VIDEO
      currentUrl = data.projectorRoom.source_url;
      loadVideo(currentUrl);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

function loadVideo(sourceUrl) {
  const proxyUrl = `/proxy-stream?url=${encodeURIComponent(sourceUrl)}`;
  
  console.log('🎥 Original:', sourceUrl);
  console.log('🔗 Proxy:', proxyUrl);
  
  if (useIframe) {
    // IFRAME MODE
    document.getElementById('videoPlayer').style.display = 'none';
    document.getElementById('iframeContainer').style.display = 'block';
    document.getElementById('videoIframe').src = proxyUrl;
  } else {
    // HTML5 VIDEO NATIVO
    document.getElementById('videoPlayer').style.display = 'block';
    document.getElementById('iframeContainer').style.display = 'none';
    
    const video = document.getElementById('videoPlayer');
    const source = document.getElementById('videoSource');
    
    source.src = proxyUrl;
    video.load();
    
    // Auto-cambiar a iframe si falla
    video.addEventListener('error', (e) => {
      console.error('❌ Video error:', e);
      console.log('🔄 Intentando con iframe...');
      useIframe = true;
      loadVideo(sourceUrl);
    }, { once: true });
    
    video.addEventListener('loadedmetadata', () => {
      console.log('✅ Video cargado:', video.duration, 'segundos');
    });
  }
}

function togglePlayer() {
  useIframe = !useIframe;
  loadVideo(currentUrl);
}

function openExternal() {
  window.open(`/proxy-stream?url=${encodeURIComponent(currentUrl)}`, '_blank');
}

loadRoom();
