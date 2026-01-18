const socket = io();

// Unirse a sala
const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
const username = params.get('username') || 'Invitado';

socket.emit('join-room', { roomId, username });

// Recibir usuarios
socket.on('user-joined', ({ username, users }) => {
  updateUsersList(users);
  addSystemMessage(`${username} se unió a la sala`);
});

socket.on('user-left', ({ username, users }) => {
  updateUsersList(users);
  addSystemMessage(`${username} salió de la sala`);
});

// Recibir mensajes
socket.on('message', ({ username, message, timestamp }) => {
  addMessage(username, message, timestamp);
});

function updateUsersList(users) {
  const list = document.getElementById('usersList');
  list.innerHTML = `<strong>👥 ${users.length} online:</strong> ${users.join(', ')}`;
}

function addMessage(user, msg, time) {
  const messagesDiv = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  
  const timeStr = new Date(time).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  messageEl.innerHTML = `
    <div class="message-header">
      <span class="message-time">${timeStr}</span>
      <span class="message-user">${user}</span>
    </div>
    <div class="message-content">${escapeHtml(msg)}</div>
  `;
  
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(msg) {
  const messagesDiv = document.getElementById('chatMessages');
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message system-message';
  messageEl.textContent = msg;
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  socket.emit('chat-message', { roomId, message });
  input.value = '';
}

// Enter para enviar
document.getElementById('messageInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
