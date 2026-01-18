<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sala - ProjectorRoom</title>
  <link rel="stylesheet" href="css/room.css">
</head>
<body>
  
  <!-- HEADER CON PÓSTER -->
  <header class="room-header">
    <div class="header-content">
      <div class="header-poster" id="headerPoster"></div>
      <div class="header-info">
        <h1 id="roomTitle">Cargando...</h1>
        <p id="roomSubtitle">Proyectando en la sala de...</p>
      </div>
    </div>
  </header>

  <!-- ACCIONES -->
  <div class="actions-bar">
    <button id="btnPlay" class="btn-play">
      Comenzar Proyección
    </button>
    
    <button id="btnInvite" class="btn-invite" style="display:none">
      Invitar a la Sala
    </button>
  </div>

  <!-- CHAT -->
  <div class="chat-container">
    <div class="chat-header">
      <h3>Chat de la Sala</h3>
      <div id="usersList" class="users-online"></div>
    </div>
    
    <div id="chatMessages" class="chat-messages"></div>
    
    <div class="chat-input-container">
      <input 
        type="text" 
        id="messageInput" 
        placeholder="Escribe un mensaje..." 
        autocomplete="off"
      >
      <button onclick="sendMessage()" class="btn-send">Enviar</button>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="js/player.js"></script>
  <script src="js/chat.js"></script>
</body>
</html>
