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
      document.getElementById('moviePoster').style.backgroundImage = 
        manifest.poster ? `url(${manifest.poster})` : '';
      document.getElementById('movieTitle').textContent = manifest.title;
      document.getElementById('movieSynopsis').textContent = manifest.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = `
        <p><strong>Año:</strong> ${manifest.year} | <strong>Tipo:</strong> ${manifest.type === 'movie' ? 'Película' : 'Serie'}</p>
        <p><strong>Anfitrión:</strong> ${room.host_username}</p>
      `;
      
      // Video player
      player = videojs('videoPlayer', {
        fluid: true,
        sources: [{ src: room.source_url, type: 'video/mp4' }]
      });
      
      player.ready(() => {
        console.log('✅ Reproductor listo');
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

loadRoom();
