const socket = io();
const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
let username = params.get('username') || prompt('Nombre:') || 'Anónimo';

const users = new Set();

socket.emit('join-room', { roomId, username });

socket.on('user-joined', ({ username: u, users: all }) => {
  if (all) { users.clear(); all.forEach(x => users.add(x)); }
  else users.add(u);
  updateUsers();
  if (u !== username) addMsg(`${u} se unió`);
});

socket.on('user-left', ({ username: u, users: all }) => {
  if (all) { users.clear(); all.forEach(x => users.add(x)); }
  else users.delete(u);
  updateUsers();
  addMsg(`${u} salió`);
});

socket.on('message', ({ username: u, message: m, timestamp: t }) => {
  const div = document.getElementById('chatMessages');
  div.innerHTML += `<div class="message"><strong>${u}:</strong> ${m} <small>${new Date(t).toLocaleTimeString()}</small></div>`;
  div.scrollTop = div.scrollHeight;
});

function sendMessage() {
  const inp = document.getElementById('messageInput');
  if (inp.value.trim()) {
    socket.emit('chat-message', { roomId, message: inp.value });
    inp.value = '';
  }
}

function updateUsers() {
  users.add(username);
  document.getElementById('usersList').innerHTML = Array.from(users).map(u => `<span class="user-tag">${u}</span>`).join('');
}

function addMsg(txt) {
  const div = document.getElementById('chatMessages');
  div.innerHTML += `<div style="text-align:center;opacity:0.6;margin:0.5rem 0">${txt}</div>`;
  div.scrollTop = div.scrollHeight;
}

updateUsers();
