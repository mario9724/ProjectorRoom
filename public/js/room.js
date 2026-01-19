const TMDB_API_KEY = '0352d89c612c3b5238db30c8bfee18e2';
const PUBLIC_MANIFEST = 'https://webstreamr.hayd.uk/%7B%22multi%22%3A%22on%22%2C%22al%22%3A%22on%22%2C%22de%22%3A%22on%22%2C%22es%22%3A%22on%22%2C%22fr%22%3A%22on%22%2C%22hi%22%3A%22on%22%2C%22it%22%3A%22on%22%2C%22mx%22%3A%22on%22%2C%22ta%22%3A%22on%22%2C%22te%22%3A%22on%22%7D/manifest.json';

let roomId = null;
let socket = null;
let username = '';
let roomData = null;
let isHost = false;
let guestSources = [];
let guestSelectedSourceIndex = null;
let userRating = null;
let allRatings = [];
let allReactions = [];
let currentUsers = [];

// ==================== INICIALIZAR ====================
window.addEventListener('load', async function() {
  console.log('🚀 Inicializando sala...');
  
  const pathParts = window.location.pathname.split('/');
  roomId = pathParts[pathParts.length - 1];
  
  if (!roomId || roomId === 'sala') {
    alert('ID de sala no válido');
    window.location.href = '/';
    return;
  }
  
  console.log('📋 Room ID:', roomId);
  
  try {
    await loadRoomData();
    console.log('✅ Datos de sala cargados:', roomData);
  } catch (error) {
    console.error('❌ Error cargando sala:', error);
    alert('Error: Sala no encontrada');
    window.location.href = '/';
    return;
  }
  
  isHost = sessionStorage.getItem('projectorroom_is_host_' + roomId) === 'true';
  console.log('👤 ¿Es anfitrión?', isHost);
  
  if (isHost) {
    username = sessionStorage.getItem('projectorroom_host_username_' + roomId);
    console.log('🎯 Username anfitrión:', username);
    
    if (!username) {
      console.error('❌ No se encontró username del anfitrión');
      alert('Error de sesión. Por favor, crea la sala de nuevo.');
      window.location.href = '/';
      return;
    }
    
    console.log('✅ Anfitrión detectado, iniciando sala...');
    initRoom();
    
  } else {
    console.log('👥 Usuario invitado detectado');
    
    const alreadyConfigured = localStorage.getItem('projectorroom_guest_configured_' + roomId) === 'true';
    console.log('⚙️ ¿Ya configurado?', alreadyConfigured);
    
    if (alreadyConfigured) {
      username = localStorage.getItem('projectorroom_username');
      console.log('👤 Username invitado:', username);
      
      if (roomData.useHostSource === false) {
        console.log('🔍 Anfitrión NO comparte fuente, verificando selección...');
        const hasSelectedSource = localStorage.getItem('projectorroom_guest_source_' + roomId);
        
        if (!hasSelectedSource) {
          console.log('⚠️ Invitado debe seleccionar fuente');
          showGuestSourceSelector();
          return;
        } else {
          console.log('✅ Invitado ya tiene fuente:', hasSelectedSource);
        }
      } else {
        console.log('✅ Anfitrión comparte fuente');
      }
      
      initRoom();
    } else {
      console.log('📝 Mostrando configuración de invitado...');
      showGuestConfig();
    }
  }
});

async function loadRoomData() {
  const res = await fetch(`/api/projectorrooms/${roomId}`);
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message || 'Sala no encontrada');
  }
  roomData = data.projectorRoom;
}

function showGuestConfig() {
  console.log('📝 Renderizando configuración de invitado');
  
  document.querySelector('.room-container').style.display = 'none';
  
  let configHTML = `
    <div class="guest-config-container">
      <div class="guest-config-card">
        <h2>🎬 ${escapeHtml(roomData.roomName)}</h2>
        <p>Te estás uniendo a esta sala</p>
        
        <div class="guest-input-group">
          <label for="guestUsernameInput">Elige tu nombre de usuario:</label>
          <input type="text" id="guestUsernameInput" placeholder="Tu nombre..." maxlength="20">
        </div>
        
        <button id="joinRoomBtn" class="join-btn">Unirse a la sala</button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', configHTML);
  
  document.getElementById('joinRoomBtn').addEventListener('click', function() {
    const usernameInput = document.getElementById('guestUsernameInput').value.trim();
    if (!usernameInput) {
      alert('Por favor, ingresa un nombre de usuario');
      return;
    }
    
    username = usernameInput;
    localStorage.setItem('projectorroom_username', username);
    localStorage.setItem('projectorroom_guest_configured_' + roomId, 'true');
    
    console.log('👤 Usuario invitado configurado:', username);
    
    document.querySelector('.guest-config-container').remove();
    document.querySelector('.room-container').style.display = 'block';
    
    if (roomData.useHostSource === false) {
      console.log('🔍 Anfitrión NO comparte fuente, mostrando selector...');
      showGuestSourceSelector();
    } else {
      console.log('✅ Iniciando sala con fuente del anfitrión');
      initRoom();
    }
  });
}

function showGuestSourceSelector() {
  console.log('🔍 Mostrando selector de fuente para invitado');
  
  document.querySelector('.room-container').style.display = 'none';
  
  let selectorHTML = `
    <div class="source-selector-container">
      <div class="source-selector-card">
        <h2>🎬 ${escapeHtml(roomData.roomName)}</h2>
        <p>El anfitrión no comparte su fuente. Necesitas buscar tu propia fuente para el contenido.</p>
        
        <div class="source-input-group">
          <label for="guestMovieSearch">Buscar película o serie:</label>
          <input type="text" id="guestMovieSearch" placeholder="Nombre de película/serie...">
          <button id="guestSearchBtn" class="search-btn">Buscar</button>
        </div>
        
        <div id="guestSearchResults" class="search-results"></div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', selectorHTML);
  
  document.getElementById('guestSearchBtn').addEventListener('click', searchMovieForGuest);
  document.getElementById('guestMovieSearch').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') searchMovieForGuest();
  });
}

async function searchMovieForGuest() {
  const query = document.getElementById('guestMovieSearch').value.trim();
  if (!query) {
    alert('Por favor, ingresa el nombre de una película o serie');
    return;
  }
  
  console.log('🔎 Buscando:', query);
  
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=es-ES`);
    const data = await res.json();
    
    const results = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
    
    if (results.length === 0) {
      alert('No se encontraron resultados');
      return;
    }
    
    displayGuestSearchResults(results);
  } catch (error) {
    console.error('Error buscando contenido:', error);
    alert('Error al buscar. Intenta de nuevo.');
  }
}

function displayGuestSearchResults(results) {
  const container = document.getElementById('guestSearchResults');
  container.innerHTML = '<h3>Resultados:</h3>';
  
  results.slice(0, 5).forEach((item, index) => {
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '';
    
    const itemHTML = `
      <div class="search-result-item" data-index="${index}">
        ${poster ? `<img src="${poster}" alt="${escapeHtml(title)}">` : '<div class="no-poster">Sin imagen</div>'}
        <div class="result-info">
          <h4>${escapeHtml(title)} ${year ? `(${year})` : ''}</h4>
          <p>${item.media_type === 'movie' ? 'Película' : 'Serie'}</p>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHTML);
  });
  
  guestSources = results.slice(0, 5);
  
  document.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', function() {
      const index = parseInt(this.dataset.index);
      selectGuestSource(index);
    });
  });
}

async function selectGuestSource(index) {
  console.log('✅ Fuente seleccionada:', guestSources[index]);
  
  guestSelectedSourceIndex = index;
  const selected = guestSources[index];
  
  const sourceIdentifier = `${selected.media_type}:${selected.id}`;
  localStorage.setItem('projectorroom_guest_source_' + roomId, sourceIdentifier);
  
  document.querySelector('.source-selector-container').remove();
  document.querySelector('.room-container').style.display = 'block';
  
  initRoom();
}

// ==================== INICIAR SALA ====================
function initRoom() {
  console.log('🎬 Iniciando sala...');
  console.log('Usuario:', username);
  console.log('Datos de sala:', roomData);
  
  displayRoomInfo();
  setupSocketListeners();
  setupChatListeners();
  setupRatingListeners();
  setupReactionListeners();
  
  socket = io();
  
  socket.emit('join-room', {
    roomId: roomId,
    username: username
  });
  
  console.log('✅ Sala iniciada correctamente');
}

function displayRoomInfo() {
  document.getElementById('roomName').textContent = roomData.roomName;
  document.getElementById('hostName').textContent = `Anfitrión: ${roomData.hostUsername}`;
  
  const manifestType = roomData.projectorType === 'custom' ? 'Personalizado' : 'Público';
  document.getElementById('manifestInfo').textContent = `Proyector: ${manifestType}`;
}

// ==================== SOCKET LISTENERS ====================
function setupSocketListeners() {
  // Se configuran después de crear el socket en initRoom()
}

// Mover los listeners de socket a después de socket = io()
function initRoom() {
  console.log('🎬 Iniciando sala...');
  console.log('Usuario:', username);
  console.log('Datos de sala:', roomData);
  
  displayRoomInfo();
  setupChatListeners();
  setupRatingListeners();
  setupReactionListeners();
  
  socket = io();
  
  // ==================== SOCKET LISTENERS ====================
  
  // CARGAR HISTORIAL DESDE BASE DE DATOS
  socket.on('load-history', ({ messages, ratings, reactions }) => {
    console.log('📚 Cargando historial desde base de datos...');
    
    // Cargar mensajes de chat
    if (messages && messages.length > 0) {
      messages.forEach(msg => {
        displayChatMessage(msg.username, msg.message);
      });
      console.log(`✅ ${messages.length} mensajes cargados`);
    }
    
    // Cargar calificaciones
    if (ratings && ratings.length > 0) {
      allRatings = ratings;
      updateRatingsDisplay();
      console.log(`✅ ${ratings.length} calificaciones cargadas`);
    }
    
    // Cargar reacciones
    if (reactions && reactions.length > 0) {
      allReactions = reactions;
      updateReactionsDisplay();
      console.log(`✅ ${reactions.length} reacciones cargadas`);
    }
  });
  
  // Usuario se unió
  socket.on('user-joined', ({ user, users }) => {
    console.log('👋 Usuario se unió:', user.username);
    currentUsers = users;
    updateUsersList();
    
    if (user.username !== username) {
      showNotification(`${user.username} se unió a la sala`);
    }
  });
  
  // Usuario se fue
  socket.on('user-left', ({ username: leftUsername, users }) => {
    console.log('👋 Usuario se fue:', leftUsername);
    currentUsers = users;
    updateUsersList();
    showNotification(`${leftUsername} salió de la sala`);
  });
  
  // Mensaje de chat
  socket.on('chat-message', ({ username: msgUsername, message }) => {
    displayChatMessage(msgUsername, message);
  });
  
  // Calificación añadida
  socket.on('rating-added', ({ username: ratingUsername, rating }) => {
    console.log('⭐ Nueva calificación:', ratingUsername, rating);
    
    const existingIndex = allRatings.findIndex(r => r.username === ratingUsername);
    if (existingIndex >= 0) {
      allRatings[existingIndex].rating = rating;
    } else {
      allRatings.push({ username: ratingUsername, rating });
    }
    
    updateRatingsDisplay();
    
    if (ratingUsername !== username) {
      showNotification(`${ratingUsername} calificó con ${rating}/10`);
    }
  });
  
  // Reacción añadida
  socket.on('reaction-added', ({ username: reactionUsername, time, message }) => {
    console.log('💬 Nueva reacción:', reactionUsername, time, message);
    
    allReactions.push({ username: reactionUsername, time, message });
    updateReactionsDisplay();
    
    if (reactionUsername !== username) {
      showNotification(`${reactionUsername} reaccionó en ${time}`);
    }
  });
  
  socket.emit('join-room', {
    roomId: roomId,
    username: username
  });
  
  console.log('✅ Sala iniciada correctamente');
}

// ==================== CHAT ====================
function setupChatListeners() {
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendChatBtn');
  
  sendBtn.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') sendChatMessage();
  });
}

function sendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  const message = chatInput.value.trim();
  
  if (!message) return;
  
  console.log('💬 Enviando mensaje:', message);
  
  socket.emit('chat-message', {
    roomId: roomId,
    message: message
  });
  
  chatInput.value = '';
}

function displayChatMessage(msgUsername, message) {
  const chatMessages = document.getElementById('chatMessages');
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  
  const isOwnMessage = msgUsername === username;
  if (isOwnMessage) {
    msgDiv.classList.add('own-message');
  }
  
  msgDiv.innerHTML = `<strong>${escapeHtml(msgUsername)}:</strong> ${escapeHtml(message)}`;
  
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ==================== CALIFICACIONES ====================
function setupRatingListeners() {
  const stars = document.querySelectorAll('.star');
  const submitRatingBtn = document.getElementById('submitRatingBtn');
  
  stars.forEach((star, index) => {
    star.addEventListener('click', function() {
      const rating = index + 1;
      selectRating(rating);
    });
  });
  
  submitRatingBtn.addEventListener('click', submitRating);
}

function selectRating(rating) {
  userRating = rating;
  
  const stars = document.querySelectorAll('.star');
  stars.forEach((star, index) => {
    if (index < rating) {
      star.classList.add('selected');
    } else {
      star.classList.remove('selected');
    }
  });
  
  console.log('⭐ Calificación seleccionada:', rating);
}

function submitRating() {
  if (!userRating) {
    alert('Por favor, selecciona una calificación');
    return;
  }
  
  console.log('📤 Enviando calificación:', userRating);
  
  socket.emit('add-rating', {
    roomId: roomId,
    username: username,
    rating: userRating
  });
  
  showNotification('¡Calificación enviada!');
}

function updateRatingsDisplay() {
  const container = document.getElementById('ratingsDisplay');
  container.innerHTML = '';
  
  if (allRatings.length === 0) {
    container.innerHTML = '<p class="no-data">Aún no hay calificaciones de otros roomies</p>';
    return;
  }
  
  allRatings.forEach(rating => {
    const ratingEl = document.createElement('div');
    ratingEl.className = 'rating-item';
    ratingEl.innerHTML = `
      <span class="rating-username">${escapeHtml(rating.username)}</span>
      <span class="rating-stars">${'⭐'.repeat(rating.rating)}</span>
      <span class="rating-value">${rating.rating}/10</span>
    `;
    container.appendChild(ratingEl);
  });
  
  // Calcular promedio
  const average = (allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length).toFixed(1);
  const avgEl = document.createElement('div');
  avgEl.className = 'rating-average';
  avgEl.innerHTML = `<strong>Promedio: ${average}/10</strong>`;
  container.appendChild(avgEl);
}

// ==================== REACCIONES ====================
function setupReactionListeners() {
  const timeInput = document.getElementById('reactionTime');
  const messageInput = document.getElementById('reactionMessage');
  const submitReactionBtn = document.getElementById('submitReactionBtn');
  
  submitReactionBtn.addEventListener('click', submitReaction);
}

function submitReaction() {
  const timeInput = document.getElementById('reactionTime');
  const messageInput = document.getElementById('reactionMessage');
  
  const time = timeInput.value.trim();
  const message = messageInput.value.trim();
  
  if (!time || !message) {
    alert('Por favor, completa ambos campos');
    return;
  }
  
  console.log('📤 Enviando reacción:', time, message);
  
  socket.emit('add-reaction', {
    roomId: roomId,
    username: username,
    time: time,
    message: message
  });
  
  timeInput.value = '';
  messageInput.value = '';
  
  showNotification('¡Reacción enviada!');
}

function updateReactionsDisplay() {
  const container = document.getElementById('reactionsDisplay');
  container.innerHTML = '';
  
  if (allReactions.length === 0) {
    container.innerHTML = '<p class="no-data">Aún no hay reacciones</p>';
    return;
  }
  
  // Ordenar por tiempo
  allReactions.sort((a, b) => {
    const parseTime = (time) => {
      const parts = time.split(':').map(Number);
      return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
    };
    return parseTime(a.time) - parseTime(b.time);
  });
  
  allReactions.forEach(reaction => {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'reaction-item';
    reactionEl.innerHTML = `
      <span class="reaction-time">${escapeHtml(reaction.time)}</span>
      <span class="reaction-username">${escapeHtml(reaction.username)}:</span>
      <span class="reaction-message">${escapeHtml(reaction.message)}</span>
    `;
    container.appendChild(reactionEl);
  });
}

// ==================== UTILIDADES ====================
function updateUsersList() {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';
  
  currentUsers.forEach(user => {
    const userEl = document.createElement('div');
    userEl.className = 'user-item';
    userEl.textContent = user.username;
    
    if (user.username === username) {
      userEl.classList.add('current-user');
      userEl.textContent += ' (tú)';
    }
    
    usersList.appendChild(userEl);
  });
  
  document.getElementById('usersCount').textContent = `Usuarios conectados: ${currentUsers.length}`;
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
