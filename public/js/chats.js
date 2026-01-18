const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('id');
const username = urlParams.get('username');

const users = new Set();

socket.emit('join-room', { roomId, username });

socket.on('user-joined', ({ username: newUser }) => {
  users.add(newUser);
  updateUsersList();
  addSystemMessage(`${newUser} se unió`);
});

socket.on('user-left', ({ username: leftUser }) => {
  users.delete(leftUser);
  updateUsersList();
  addSystemMessage(`${leftUser} salió`);
});

socket.on('message', ({ username: user, message, timestamp }) => {
  const messagesDiv = document.getElementById('chatMessages');
  messagesDiv.innerHTML += `
    <div class="message">
      <strong>${user}:</strong> ${message}
      <small style="opacity:0.5;margin-left:0.5rem">${new Date(timestamp).toLocaleTimeString()}</small>
    </div>
  `;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (message) {
    socket.emit('chat-message', { roomId, message });
    input.value = '';
  }
}

function updateUsersList() {
  users.add(username);
  document.getElementById('usersList').innerHTML = 
    Array.from(users).map(u => `<span class="user-tag">${u}</span>`).join('');
}

function addSystemMessage(msg) {
  const messagesDiv = document.getElementById('chatMessages');
  messagesDiv.innerHTML += `<div style="text-align:center;opacity:0.6;margin:0.5rem 0">${msg}</div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

updateUsersList();
