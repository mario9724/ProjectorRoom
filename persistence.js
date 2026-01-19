const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'projectorroom-data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Almacenamiento en memoria
const roomData = {};

// Cargar datos al iniciar
async function loadRoom(roomId) {
    const filePath = path.join(DATA_DIR, `${roomId}.json`);
    if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        roomData[roomId] = data;
        console.log(`📂 Sala cargada: ${roomId}`);
    } else {
        roomData[roomId] = { messages: [], ratings: [], reactions: [] };
    }
}

// Guardar datos
async function saveRoom(roomId) {
    const filePath = path.join(DATA_DIR, `${roomId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(roomData[roomId], null, 2));
    console.log(`💾 Sala guardada: ${roomId}`);
}

module.exports = { roomData, loadRoom, saveRoom };
