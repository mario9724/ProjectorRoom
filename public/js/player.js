let streamUrl = '';
let isHost = false;
let roomId = '';
let username = '';

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  roomId = params.get('id');
  username = params.get('username') || 'Invitado';
  
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (data.success) {
      const room = data.projectorRoom;
      const m = JSON.parse(room.manifest);
      streamUrl = room.source_url;
      isHost = username === room.host_username;
      
      // Header
      document.getElementById('roomTitle').textContent = 
        `Proyectando "${m.title}" en ${room.room_name} de ${room.host_username}`;
      
      // Póster
      const posterUrl = m.poster || 'https://via.placeholder.com/300x450/1e1b4b/06b6d4?text=Sin+Poster';
      document.getElementById('moviePoster').style.backgroundImage = `url(${posterUrl})`;
      
      // Info
      document.getElementById('movieTitle').textContent = m.title;
      document.getElementById('movieMeta').innerHTML = `
        <span>📅 ${m.year}</span>
        <span>🎭 ${m.type === 'movie' ? 'Película' : 'Serie'}</span>
        <span>👤 Anfitrión: ${room.host_username}</span>
      `;
      document.getElementById('movieSynopsis').textContent = m.overview || 'Sin descripción disponible';
      
      // Botón invitar (solo host)
      if (isHost) {
        document.getElementById('btnInvite').style.display = 'block';
      }
      
      // Setup botones
      setupButtons();
      
    }
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error al cargar la sala');
  }
}

function setupButtons() {
  const btnPlay = document.getElementById('btnPlay');
  const btnInvite = document.getElementById('btnInvite');
  
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  
  // BOTÓN REPRODUCIR
  btnPlay.onclick = () => {
    if (isIOS) {
      // iOS: VLC x-callback
      window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`;
    } else if (isAndroid) {
      // Android: Intent implícito
      window.location.href = streamUrl;
    } else {
      // Desktop: Abrir directo (descarga o VLC si instalado)
      window.open(streamUrl, '_blank');
    }
  };
  
  // BOTÓN INVITAR
  btnInvite.onclick = async () => {
    const inviteUrl = window.location.href;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Únete a mi sala de proyección`,
          text: `Estoy viendo una película. ¡Únete!`,
          url: inviteUrl
        });
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('✅ Enlace copiado al portapapeles');
      }
    } catch (e) {
      // Fallback manual
      prompt('Copia este enlace para invitar:', inviteUrl);
    }
  };
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

loadRoom();
