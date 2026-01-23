require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const CryptoJS = require('crypto-js');
const path = require('path');
const axios = require('axios');

// --- CONFIGURACIÓN ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuración de la Base de Datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Requerido por Render
});

app.use(express.json());
app.use(express.static('public'));

// --- MAGIA: AUTOCONSTRUCCIÓN DE TABLAS ---
const INIT_SQL = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        pin_hash VARCHAR(255) NOT NULL,
        tmdb_key TEXT,
        total_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
        id VARCHAR(10) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        host_id INTEGER REFERENCES users(id),
        tmdb_item_id VARCHAR(50),
        tmdb_item_type VARCHAR(20),
        manifest_url TEXT,
        source_data JSONB,
        host_comment TEXT,
        icebreaker_question TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_events (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(10) REFERENCES rooms(id),
        user_id INTEGER REFERENCES users(id),
        username VARCHAR(50),
        type VARCHAR(20) NOT NULL,
        content JSONB NOT NULL,
        hearts INTEGER DEFAULT 0,
        middle_fingers INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

async function initDB() {
    try {
        await pool.query(INIT_SQL);
        console.log('✅ Tablas de la base de datos verificadas/creadas correctamente.');
    } catch (error) {
        console.error('❌ Error fatal al iniciar la DB:', error);
    }
}

// --- UTILIDADES DE SEGURIDAD ---
const encrypt = (text) => CryptoJS.AES.encrypt(text, process.env.SECRET_KEY).toString();
const decrypt = (cipher) => {
    try {
        return CryptoJS.AES.decrypt(cipher, process.env.SECRET_KEY).toString(CryptoJS.enc.Utf8);
    } catch (e) { return null; }
};

// --- API ROUTES ---

// 1. Registro / Login
app.post('/api/auth', async (req, res) => {
    const { username, pin, tmdbKey } = req.body;
    try {
        const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (userCheck.rows.length > 0) {
            // Login
            const user = userCheck.rows[0];
            const validPin = await bcrypt.compare(pin, user.pin_hash);
            if (!validPin) return res.status(401).json({ error: 'PIN incorrecto. ¿Eres un impostor?' });
            
            // Actualizar key si se envía nueva
            if (tmdbKey) {
                await pool.query('UPDATE users SET tmdb_key = $1 WHERE id = $2', [encrypt(tmdbKey), user.id]);
            }
            return res.json({ id: user.id, username: user.username, tmdbKey: decrypt(user.tmdb_key) });
        } else {
            // Registro
            if (!tmdbKey) return res.status(400).json({ error: 'Necesito tu TMDB API Key para empezar.' });
            const hashedPin = await bcrypt.hash(pin, 10);
            const newUser = await pool.query(
                'INSERT INTO users (username, pin_hash, tmdb_key) VALUES ($1, $2, $3) RETURNING id, username',
                [username, hashedPin, encrypt(tmdbKey)]
            );
            return res.json({ id: newUser.rows[0].id, username: newUser.rows[0].username, tmdbKey });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error en la base de datos.' });
    }
});

// 2. Crear Sala
app.post('/api/rooms', async (req, res) => {
    const { name, hostId, tmdbId, type, manifestUrl, sourceData, comment, icebreaker } = req.body;
    const roomId = Math.random().toString(36).substring(2, 8); // Generador ID simple

    const finalComment = comment || "Bienvenidos a mi sala. No toquéis la cerveza.";
    const finalQuestion = icebreaker || "¿Cuál es vuestro top 3 de películas de lesbianas israelíes favoritas?";

    try {
        await pool.query(
            `INSERT INTO rooms (id, name, host_id, tmdb_item_id, tmdb_item_type, manifest_url, source_data, host_comment, icebreaker_question)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [roomId, name, hostId, tmdbId, type, manifestUrl, JSON.stringify(sourceData), finalComment, finalQuestion]
        );
        res.json({ success: true, roomId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'No se pudo crear la sala.' });
    }
});

// 3. Obtener Sala
app.get('/api/rooms/:id', async (req, res) => {
    try {
        const room = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
        if (room.rows.length === 0) return res.status(404).json({ error: 'Sala no encontrada' });
        
        const chat = await pool.query('SELECT * FROM chat_events WHERE room_id = $1 ORDER BY created_at ASC LIMIT 50', [req.params.id]);
        
        res.json({ room: room.rows[0], chatHistory: chat.rows });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join_room', ({ roomId, user }) => {
        socket.join(roomId);
        socket.to(roomId).emit('system_message', `${user.username} ha entrado.`);
    });

    socket.on('send_event', async (data) => {
        try {
            const saved = await pool.query(
                `INSERT INTO chat_events (room_id, user_id, username, type, content) 
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [data.roomId, data.userId, data.username, data.type, JSON.stringify(data.content)]
            );
            io.to(data.roomId).emit('new_event', saved.rows[0]);
        } catch (e) { console.error(e); }
    });

    socket.on('react_event', async ({ eventId, type, roomId }) => {
        const field = type === 'heart' ? 'hearts' : 'middle_fingers';
        try {
            const updated = await pool.query(
                `UPDATE chat_events SET ${field} = ${field} + 1 WHERE id = $1 RETURNING *`,
                [eventId]
            );
            io.to(roomId).emit('update_reaction', updated.rows[0]);
        } catch (e) { console.error(e); }
    });
});

app.get('*', (req, res) => {
    if(req.path.startsWith('/sala/')) {
        res.sendFile(path.join(__dirname, 'public', 'room.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

const PORT = process.env.PORT || 3000;

// INICIAMOS DB PRIMERO, LUEGO EL SERVER
initDB().then(() => {
    server.listen(PORT, () => console.log(`🚀 ProjectorRoom listo en puerto ${PORT}`));
});
