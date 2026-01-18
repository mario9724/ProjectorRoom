let player;

async function loadRoom() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('id');
  const username = urlParams.get('username');
  
  try {
    const response = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await response.json();
    
    if (data.success) {
      const room = data.projectorRoom;
      const manifest = JSON.parse(room.manifest);
      
      // Banner título
      document.getElementById('roomTitle').textContent = 
        `Proyectando "${manifest.title}" en ${room.room_name} de ${room.host_username}`;
      
      // Banner película
      if (manifest.poster) {
        document.getElementById('moviePoster').style.backgroundImage = `url(${manifest.poster})`;
      }
      document.getElementById('movieTitle').textContent = manifest.title;
      document.getElementById('movieSynopsis').textContent = manifest.overview || 'Sin descripción disponible';
      document.getElementById('movieMeta').innerHTML = `
        <p><strong>Año:</strong> ${manifest.year} | <strong>Tipo:</strong> ${manifest.type === 'movie' ? 'Película' : 'Serie'}</p>
        <p><strong>Anfitrión:</strong> ${room.host_username}</p>
      `;
      
      // 🎬 VIDEO PLAYER CON PROXY
      const proxyUrl = `/proxy-stream?url=${encodeURIComponent(room.source_url)}`;
      
      player = videojs('videoPlayer', {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        playbackRates: [0.5, 1, 1.25, 1.5, 2],
        sources: [{
          src: proxyUrl,
          type: 'video/mp4'
        }],
        html5: {
          vhs: { withCredentials: false },
          nativeAudioTracks: false,
          nativeVideoTracks: false
        }
      });
      
      player.ready(() => {
        console.log('✅ Reproductor listo');
      });
      
      player.on('error', () => {
        const error = player.error();
        console.error('Error video:', error);
        document.getElementById('videoPlayer').innerHTML = `
          <div style="padding:3rem;text-align:center;color:#ef4444;background:#1e1b4b;border-radius:12px">
            <h3>❌ Error de Reproducción</h3>
            <p>${error ? error.message : 'Formato no soportado'}</p>
            <p style="color:#94a3b8;margin-top:1rem">La fuente puede no ser compatible con streaming directo</p>
          </div>
        `;
      });
      
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error al cargar la sala');
  }
}

loadRoom();
