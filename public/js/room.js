let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isGuest = false;

// INICIALIZAR SALA
window.addEventListener('load', async function() {
  // Obtener roomId de la URL
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId) {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  // Cargar datos de la sala primero
  await loadRoomData();
  
  // Verificar si es invitado o anfitrión
  username = localStorage.getItem('projectorroom_username');
  
  // Si no hay username o si necesita configurar proyector
  if (!username || (roomData.useHostSource === false && !localStorage.getItem('projectorroom_guest_configured_' + roomId))) {
    showGuestConfig();
    return;
  }
  
  // Si ya está configurado, conectar directamente
  initRoom();
});

// MOSTRAR CONFIGURACIÓN DE INVITADO
function showGuestConfig() {
  isGuest = true;
  
  // Ocultar sala y mostrar formulario
  document.querySelector('.room-container').style.display = 'none';
  
  // Crear formulario de invitado
  const configHTML = `
    <div class="guest-config-container">
      <div class="step-card">
        <h1>👋 Ey roomie, ¿cómo te llamas?</h1>
        <input type="text" id="guestUsername" placeholder="Tu nombre..." maxlength="20" autofocus>
        
        ${roomData.useHostSource === false ? `
          <div style="margin-top: 30px;">
            <h2 style="font-size: 1.3rem; margin-bottom: 20px; text-align: center;">🎬 ¿Qué proyector quieres usar?</h2>
            
            <div class="option-card" onclick="selectGuestProjector('public')">
              <input type="radio" name="guestProjectorType" value="public" checked>
              <div class="option-content">
                <div class="option-title">🌐 Proyector público</div>
                <div class="option-desc">Se usará el predeterminado ya configurado</div>
              </div>
            </div>
            
            <div class="option-card" onclick="selectGuestProjector('custom')">
              <input type="radio" name="guestProjectorType" value="custom">
              <div class="option-content">
                <div class="option-title">⚙️ Proyector personalizado</div>
                <div class="option-desc">Introduce tu manifest.json custom</div>
              </div>
            </div>
            
            <div id="guestCustomManifestBox" style="display:none; margin-top: 15px;">
              <input type="url" id="guestCustomManifest" placeholder="https://tu-manifest.json">
            </div>
          </div>
        ` : ''}
        
        <button class="btn-primary" onclick="submitGuestConfig()" style="margin-top: 30px;">Unirse a la sala →</button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', configHTML);
}

// SELECCIONAR PROYECTOR DE INVITADO
window.selectGuestProjector = function(type) {
  document.querySelectorAll('input[name="guestProjectorType"]').forEach(radio => {
    radio.checked = radio.value === type;
  });
  
  document.querySelectorAll('.guest-config-container .option-card').forEach(card => {
    card.classList.remove('selected');
  });
  event.currentTarget.classList.add('selected');
  
  const customBox = document.getElementById('guestCustomManifestBox');
  if (customBox) {
    customBox.style.display = type === 'custom' ? 'block' : 'none';
  }
};

// ENVIAR CONFIGURACIÓN DE INVITADO
window.submitGuestConfig = function() {
  const usernameInput = document.getElementById('guestUsername');
  username = usernameInput.value.trim();
  
  if (!username) {
    alert('Por favor, escribe tu nombre');
    return;
  }
  
  // Si necesita configurar proyector
  if (roomData.useHostSource === false) {
    const projectorType = document.querySelector('input[name="guestProjectorType"]:checked').value;
    
    if (projectorType === 'custom') {
      const customManifest = document.getElementById('guestCustomManifest').value.trim();
      if (!customManifest) {
        alert('Por favor, introduce la URL del manifest.json');
        return;
      }
      localStorage.setItem('projectorroom_guest_manifest_' + roomId, customManifest);
    }
    
    localStorage.setItem('projectorroom_guest_projector_' + roomId, projectorType);
    localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
  }
  
  localStorage.setItem('projectorroom_username', username);
  
  // Ocultar formulario y mostrar sala
  document.querySelector('.guest-config-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  
  initRoom();
};

// INICIALIZAR SALA
function initRoom() {
  renderRoom();
  connectSocket();
  setupButtons();
}

// CARGAR DATOS DE LA SALA
async function loadRoomData() {
  try {
    const res = await fetch(`/api/projectorrooms/${roomId}`);
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Sala no encontrada');
    }
    
    roomData = data.projectorRoom;
    
  } catch (error) {
    console.error('Error cargando sala:', error);
    alert('Error: ' + error.message);
    window.location.href = '/';
  }
}

// RENDERIZAR SALA
function renderRoom() {
  const movieData = JSON.parse(roomData.manifest);
  
  document.getElementById('roomTitle').textContent = `PROYECTANDO "${movieData.title}"`;
  document.getElementById('roomSubtitle').textContent = `en la sala de ${roomData.hostUsername}`;
  document.getElementById('roomPoster').src = movieData.poster;
  document.getElementById('movieTitle').textContent = movieData.title;
  document.getElementById('movieYear').textContent = `📅 ${movieData.year}`;
  document.getElementById('movieType').textContent = `🎬 ${movieData.type === 'movie' ? 'Película' : 'Serie'}`;
  document.getElementById('movieRating').textContent = `⭐ ${movieData.rating}`;
  document.getElementById('movieOverview').textContent = movieData.overview;
}

// CONECTAR SOCKET.IO
function connectSocket() {
  socket = io();
  
  socket.emit('join-room', { roomId, username });
  
  socket.on('user-joined', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.user.username} se unió a la sala`, true);
  });
  
  socket.on('user-left', data => {
    updateUsersList(data.users);
    addChatMessage('Sistema', `${data.username} salió de la sala`, true);
  });
  
  socket.on('chat-message', data => {
    addChatMessage(data.username, data.message, false);
  });
}

// ACTUALIZAR LISTA DE USUARIOS
function updateUsersList(users) {
  document.getElementById('usersCount').textContent = users.length;
  
  const container = document.getElementById('usersList');
  container.innerHTML = '';
  
  users.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.username;
    container.appendChild(userEl);
  });
}

// AGREGAR MENSAJE AL CHAT
function addChatMessage(username, message, isSystem) {
  const container = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = isSystem ? 'chat-message chat-system' : 'chat-message';
  
  if (isSystem) {
    messageEl.textContent = message;
  } else {
    messageEl.innerHTML = `<span class="chat-username">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
  }
  
  container.appendChild(messageEl);
  container.scrollTop = container.scrollHeight;
}

// ENVIAR MENSAJE
function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (message && socket && roomId) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

// ABRIR VLC (SIN VENTANA EMERGENTE)
function startProjection() {
  if (!roomData || !roomData.sourceUrl) {
    alert('No se encontró la fuente de reproducción');
    return;
  }
  
  // SOLO intentar abrir VLC mediante iframe oculto
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = `vlc://${roomData.sourceUrl}`;
  document.body.appendChild(iframe);
  
  // Eliminar iframe después de 2 segundos
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 2000);
  
  // Mostrar mensaje de confirmación
  setTimeout(() => {
    if (confirm('Si VLC no se abrió automáticamente, ¿deseas copiar el enlace?')) {
      prompt('Copia este enlace y ábrelo en VLC:', roomData.sourceUrl);
    }
  }, 1500);
}

// COPIAR ENLACE DE INVITACIÓN
function copyInvite() {
  const roomUrl = `${window.location.origin}/sala/${roomId}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(roomUrl).then(() => {
      alert('✅ Enlace copiado al portapapeles\n\nCompártelo con tus amigos:\n' + roomUrl);
    }).catch(() => {
      prompt('Copia este enlace:', roomUrl);
    });
  } else {
    prompt('Copia este enlace:', roomUrl);
  }
}

// CONFIGURAR BOTONES
function setupButtons() {
  document.getElementById('btnStartProjection').onclick = startProjection;
  document.getElementById('btnCopyInvite').onclick = copyInvite;
  document.getElementById('btnSendChat').onclick = sendChatMessage;
  
  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

// UTILIDADES
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
