async function loadRoom() {
  const roomId = new URLSearchParams(window.location.search).get('id');
  
  const response = await fetch(`/api/projectorrooms/${roomId}`);
  const data = await response.json();
  
  if (data.success) {
    document.getElementById('roomName').textContent = data.projectorRoom.room_name;
    
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.innerHTML = `
      <video controls autoplay>
        <source src="${data.projectorRoom.source_url}" type="video/mp4">
        Tu navegador no soporta video HTML5
      </video>
    `;
  }
}

loadRoom();
