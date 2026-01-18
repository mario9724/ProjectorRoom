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
      const posterUrl = m.poster || '';
      document.getElementById('headerPoster').style.backgroundImage = `url(${posterUrl})`;
      document.getElementById('roomTitle').textContent = `PROYECTANDO ${m.title}`;
      document.getElementById('roomSubtitle').textContent = `en la sala de ${room.host_username}`;
      
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
      window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(streamUrl)}`;
    } else if (isAndroid) {
      window.location.href = streamUrl;
    } else {
      window.open(streamUrl, '_blank');
    }
  };
  
  // BOTÓN INVITAR
  btnInvite.onclick = async () => {
    const inviteUrl = window.location.href;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Únete a mi sala de proyección',
          text: '¡Estoy viendo una película en ProjectorRoom!',
          url: inviteUrl
        });
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('✅ Enlace copiado al portapapeles');
      }
    } catch (e) {
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
