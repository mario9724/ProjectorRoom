const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('id');
let username = urlParams.get('username');

// Si no hay username, pedirlo
if (!username) {
  username = prompt('Tu nombre de usuario:') || 'Anónimo';
}

const users = new Set();
users.add(username);

// Unirse a sala
socket.emit('join-room', { roomId, username });

// Usuario nuevo se une
socket.on('user-joined', ({ username: newUser, users: allUsers }) => {
  if (allUsers) {
    users.clear();
    allUsers.forEach(u => users.add(u));
  } else {
    users.add(newUser);
  }
  updateUsersList();
  if (newUser !== username) {
    addSystemMessage(`${newUser} se unió a la sala`);
  }
});

// Usuario sale
socket.on('user-left', ({ username: leftUser, users: allUsers }) => {
  if (allUsers) {
    users.clear();
    allUsers.forEach(u => users.add(u));
  } else {
    users.delete(leftUser);
  }
  updateUsersList();
  addSystemMessage(`${leftUser} salió de la sala`);
});

// Mensaje recibido
socket.on('message', ({ username: sender, message, timestamp }) => {
  const messagesDiv = document.getElementById('chatMessages');
  const time = new Date(timestamp).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messagesDiv.innerHTML += `
    <div class="message">
      <strong style="color:${sender === username ? '#10b981' : '#06b6d4'}">${sender}:</strong> 
      ${escapeHtml(message)}
      <small style="opacity:0.5;margin-left:0.5rem;font-size:0.8rem">${time}</small>
    </div>
  `;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Enviar mensaje
function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  
  if (message) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

// Actualizar lista usuarios
function updateUsersList() {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = Array.from(users)
    .map(u => `<span class="user-tag">${u === username ? '👑 ' + u : u}</span>`)
    .join('');
}

// Mensaje sistema
function addSystemMessage(msg) {
  const messagesDiv = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messagesDiv.innerHTML += `
    <div style="text-align:center;opacity:0.6;margin:0.75rem 0;font-size:0.9rem;color:#94a3b8">
      ${msg} • ${time}
    </div>
  `;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Escape HTML para seguridad
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inicializar
updateUsersList();
addSystemMessage('Conectado a la sala');
