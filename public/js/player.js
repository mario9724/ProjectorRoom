let player;

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (data.success) {
      const m = JSON.parse(data.projectorRoom.manifest);
      
      document.getElementById('roomTitle').textContent = `Proyectando "${m.title}" en ${data.projectorRoom.room_name} de ${data.projectorRoom.host_username}`;
      document.getElementById('moviePoster').style.backgroundImage = m.poster ? `url(${m.poster})` : '';
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = `<p>Año: ${m.year} | Anfitrión: ${data.projectorRoom.host_username}</p>`;
      
      // 🎬 PROXY para Debrid/HTTP
      const videoSrc = `/proxy-stream?url=${encodeURIComponent(data.projectorRoom.source_url)}`;
      
      player = videojs('videoPlayer', {
        controls: true,
        fluid: true,
        preload: 'auto',
        sources: [{ src: videoSrc, type: 'video/mp4' }]
      });
      
      player.ready(() => console.log('✅ Reproductor listo'));
      
      player.on('error', () => {
        document.querySelector('.video-section').innerHTML = `
          <div style="padding:3rem;text-align:center;background:#1e1b4b;border-radius:16px">
            <h3 style="color:#ef4444">❌ Error de reproducción</h3>
            <p style="color:#cbd5e1">La fuente puede estar caída o requerir autenticación</p>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

loadRoom();
