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
      
      const video = document.getElementById('videoPlayer');
      const videoUrl = data.projectorRoom.source_url;
      
      video.src = videoUrl;
      video.load();
      
      video.addEventListener('loadstart', () => {
        document.getElementById('videoStatus').textContent = '⏳ Cargando...';
      });
      
      video.addEventListener('loadedmetadata', () => {
        document.getElementById('videoStatus').textContent = `✅ Listo (${Math.floor(video.duration / 60)} min)`;
      });
      
      video.addEventListener('error', () => {
        document.querySelector('.video-section').innerHTML = `
          <div style="padding:3rem;text-align:center;background:#1e1b4b;border-radius:16px">
            <h3 style="color:#ef4444">❌ Error</h3>
            <p style="color:#cbd5e1">No se pudo cargar el video</p>
            <a href="${videoUrl}" target="_blank" 
              style="display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#4f46e5;color:white;text-decoration:none;border-radius:8px">
              🔗 Abrir directo
            </a>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

loadRoom();
