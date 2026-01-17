// Funciones actualizadas con mensajes de ProjectorRoom
async function createRoom() {
  const username = document.getElementById('username').value;
  const roomName = document.getElementById('roomName').value;
  const manifest = document.getElementById('manifest').value;
  const useHostSource = document.querySelector('input[name="sourceMode"]:checked').value === 'host';
  
  const sourceUrl = 'https://example.com/selected-video.mp4'; // Fuente seleccionada
  
  const response = await fetch('/api/projectorrooms/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, hostUsername: username, manifest, sourceUrl, useHostSource })
  });
  
  const data = await response.json();
  if (data.success) {
    window.location.href = `/room.html?id=${data.projectorRoom.id}&username=${username}`;
  } else {
    alert('Error al crear ProjectorRoom: ' + data.error);
  }
}
