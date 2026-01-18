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
      document.getElementById('moviePoster').style.backgroundImage = m.poster ? `url(${m.poster})` : '';
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción';
      document.getElementById('movieMeta').innerHTML = `<p>Año: ${m.year} | Anfitrión: ${data.projectorRoom.host_username}</p>`;
      
      // 🎬 DEEP LINKS a reproductores
      
      // 1. Infuse (iOS/Mac/Apple TV) - x-callback-url
      document.getElementById('btnInfuse').href = 
        `infuse://x-callback-url/play?url=${encodeURIComponent(streamUrl)}`;
      
      // 2. VLC (universal)
      // iOS: vlc-x-callback://
      // Android/Desktop: el navegador abrirá diálogo "Abrir con VLC"
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isIOS) {
        document.getElementById('btnVLC').href = 
          `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`;
      } else {
        // Android/Desktop: abrir directo y el sistema mostrará "Abrir con..."
        document.getElementById('btnVLC').href = streamUrl;
        document.getElementById('btnVLC').setAttribute('download', '');
      }
      
      // 3. Navegador directo
      document.getElementById('btnBrowser').href = streamUrl;
      
      // 4. Compartir/Cast
      document.getElementById('btnShare').onclick = async () => {
        try {
          // Web Share API (para enviar a apps de cast, copiar, etc)
          if (navigator.share) {
            await navigator.share({
              title: m.title,
              text: `Proyectando: ${m.title}`,
              url: streamUrl
            });
          } else {
            // Fallback: copiar al portapapeles
            await navigator.clipboard.writeText(streamUrl);
            showToast('✅ Enlace copiado al portapapeles');
          }
        } catch (e) {
          console.log('Share cancelado');
        }
      };
      
      // Pista según plataforma
      const hint = document.getElementById('platformHint');
      const ua = navigator.userAgent;
      
      if (/iPhone|iPad|iPod/i.test(ua)) {
        hint.innerHTML = `
          <strong>💡 iOS/iPadOS:</strong> 
          Usa <strong>Infuse</strong> (mejor calidad) o <strong>VLC</strong>. 
          Desde ahí puedes hacer AirPlay a tu Apple TV.
        `;
      } else if (/Android/i.test(ua)) {
        hint.innerHTML = `
          <strong>💡 Android:</strong> 
          Toca <strong>VLC</strong> o <strong>Navegador</strong> y el sistema preguntará "Abrir con...". 
          Elige tu reproductor favorito. Para Cast usa <strong>Compartir</strong>.
        `;
      } else {
        hint.innerHTML = `
          <strong>💡 PC:</strong> 
          Usa <strong>Navegador</strong> para reproducir directo, o copia el enlace con <strong>Compartir</strong> 
          y ábrelo en VLC Desktop.
        `;
      }
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
    background: #4f46e5; color: white; padding: 1rem 2rem;
    border-radius: 8px; z-index: 9999; font-weight: 600;
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

loadRoom();
