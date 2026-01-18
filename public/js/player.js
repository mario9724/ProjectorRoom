let player;
let videoUrl;

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
      videoUrl = data.projectorRoom.source_url;
      document.getElementById('externalLink').href = videoUrl;
      
      const video = document.getElementById('videoPlayer');
      
      // Inicializar Plyr
      player = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
        settings: ['quality', 'speed'],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
      });
      
      // Configurar source
      player.source = {
        type: 'video',
        sources: [{
          src: videoUrl,
          type: 'video/mp4'
        }]
      };
      
      // Detectar error y mostrar fallback
      let errorCount = 0;
      
      video.addEventListener('error', () => {
        errorCount++;
        console.error('❌ Error video:', video.error);
        
        if (errorCount > 2) {
          showError();
        }
      });
      
      player.on('error', () => {
        console.error('❌ Error Plyr');
        showError();
      });
      
      // Timeout si no carga en 10 segundos
      setTimeout(() => {
        if (video.readyState === 0) {
          console.warn('⚠️ Video no cargó - mostrando fallback');
          showError();
        }
      }, 10000);
      
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
    showError();
  }
}

function showError() {
  document.getElementById('playerContainer').style.display = 'none';
  document.getElementById('errorContainer').style.display = 'block';
}

loadRoom();
