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
      
      player = videojs('videoPlayer', {
        controls: true,
        fluid: true,
        sources: [{ src: `/proxy-stream?url=${encodeURIComponent(data.projectorRoom.source_url)}`, type: 'video/mp4' }]
      });
    }
  } catch (e) {
    console.error(e);
  }
}

loadRoom();
