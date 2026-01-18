let player;

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (data.success) {
      const m = JSON.parse(data.projectorRoom.manifest);
      
      document.getElementById('roomTitle').textContent = 
        `Proyectando "${m.title}" en ${data.projectorRoom.room_name} de ${data.projectorRoom.host_username}`;
      document.getElementById('moviePoster').style.backgroundImage = m.poster ? `url(${m.poster})` : '';
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = `<p>Año: ${m.year} | Anfitrión: ${data.projectorRoom.host_username}</p>`;
      
      // 🎬 VIDEO SOURCE
      const sourceUrl = data.projectorRoom.source_url;
      const proxyUrl = `/proxy-stream?url=${encodeURIComponent(sourceUrl)}`;
      
      console.log('🎥 Source URL:', sourceUrl);
      console.log('🔗 Proxy URL:', proxyUrl);
      
      // Inicializar Video.js
      player = videojs('videoPlayer', {
        controls: true,
        autoplay: false,
        preload: 'auto',
        fluid: true,
        responsive: true,
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        sources: [{
          src: proxyUrl,
          type: 'video/mp4'
        }],
        html5: {
          vhs: {
            withCredentials: false,
            overrideNative: true
          }
        }
      });
      
      player.ready(() => {
        console.log('✅ Player inicializado');
      });
      
      player.on('loadstart', () => {
        console.log('⏳ Cargando video...');
      });
      
      player.on('canplay', () => {
        console.log('✅ Video listo para reproducir');
      });
      
      player.on('error', () => {
        const error = player.error();
        console.error('❌ Error reproductor:', error);
        
        let errorMsg = 'Error desconocido';
        if (error) {
          switch(error.code) {
            case 1: errorMsg = 'Carga abortada'; break;
            case 2: errorMsg = 'Error de red'; break;
            case 3: errorMsg = 'Error de decodificación'; break;
            case 4: errorMsg = 'Formato no soportado o fuente inaccesible'; break;
          }
        }
        
        document.querySelector('.video-section').innerHTML = `
          <div style="padding:3rem;text-align:center;background:#1e1b4b;border-radius:16px">
            <h3 style="color:#ef4444;margin-bottom:1rem">❌ Error de reproducción</h3>
            <p style="color:#cbd5e1;margin-bottom:0.5rem">${errorMsg}</p>
            <p style="color:#94a3b8;font-size:0.9rem">
              ${error ? error.message : 'La fuente puede estar caída o bloqueada'}
            </p>
            <button onclick="window.location.reload()" 
              style="margin-top:1.5rem;padding:0.75rem 1.5rem;background:#4f46e5;color:white;border:none;border-radius:8px;cursor:pointer">
              🔄 Recargar
            </button>
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
