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
      
      // 🎬 VIDEO DIRECTO (sin proxy)
      const video = document.getElementById('videoPlayer');
      const videoUrl = data.projectorRoom.source_url;
      
      console.log('🎥 URL directa:', videoUrl);
      
      video.src = videoUrl;
      video.load();
      
      // Eventos
      video.addEventListener('loadstart', () => {
        document.getElementById('videoStatus').textContent = '⏳ Cargando...';
      });
      
      video.addEventListener('loadedmetadata', () => {
        document.getElementById('videoStatus').textContent = `✅ Video listo (${Math.floor(video.duration / 60)} min)`;
      });
      
      video.addEventListener('canplay', () => {
        document.getElementById('videoStatus').textContent = '▶️ Listo para reproducir';
      });
      
      video.addEventListener('error', (e) => {
        console.error('❌ Error video:', e, video.error);
        
        let errorMsg = 'Error desconocido';
        if (video.error) {
          switch(video.error.code) {
            case 1: errorMsg = 'Carga abortada por el usuario'; break;
            case 2: errorMsg = 'Error de red - Verifica la URL'; break;
            case 3: errorMsg = 'Error decodificando video'; break;
            case 4: errorMsg = 'Formato no soportado o URL inaccesible'; break;
          }
        }
        
        document.querySelector('.video-section').innerHTML = `
          <div style="padding:3rem;text-align:center;background:#1e1b4b;border-radius:16px">
            <h3 style="color:#ef4444;margin-bottom:1rem">❌ Error de Reproducción</h3>
            <p style="color:#cbd5e1;margin-bottom:1rem">${errorMsg}</p>
            <p style="color:#94a3b8;font-size:0.9rem;margin-bottom:1rem">
              URL: ${videoUrl.substring(0, 60)}...
            </p>
            <a href="${videoUrl}" target="_blank" 
              style="display:inline-block;padding:0.75rem 1.5rem;background:#4f46e5;color:white;text-decoration:none;border-radius:8px;margin-right:0.5rem">
              🔗 Abrir enlace directo
            </a>
            <button onclick="window.location.reload()" 
              style="padding:0.75rem 1.5rem;background:#0f0f23;color:#06b6d4;border:1px solid #3730a3;border-radius:8px;cursor:pointer">
              🔄 Reintentar
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
