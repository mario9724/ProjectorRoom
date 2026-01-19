const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Inicializar tablas
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Tabla de mensajes de chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de calificaciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, username)
      )
    `);

    // Tabla de reacciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        username VARCHAR(100) NOT NULL,
        time VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Índices para mejorar rendimiento
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_room_id ON chat_messages(room_id);
      CREATE INDEX IF NOT EXISTS idx_ratings_room_id ON ratings(room_id);
      CREATE INDEX IF NOT EXISTS idx_reactions_room_id ON reactions(room_id);
    `);

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Funciones para mensajes de chat
async function saveChatMessage(roomId, username, message) {
  const result = await pool.query(
    'INSERT INTO chat_messages (room_id, username, message) VALUES ($1, $2, $3) RETURNING *',
    [roomId, username, message]
  );
  return result.rows[0];
}

async function getChatMessages(roomId) {
  const result = await pool.query(
    'SELECT * FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC',
    [roomId]
  );
  return result.rows;
}

// Funciones para calificaciones
async function saveRating(roomId, username, rating) {
  const result = await pool.query(
    `INSERT INTO ratings (room_id, username, rating) 
     VALUES ($1, $2, $3) 
     ON CONFLICT (room_id, username) 
     DO UPDATE SET rating = $3, created_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [roomId, username, rating]
  );
  return result.rows[0];
}

async function getRatings(roomId) {
  const result = await pool.query(
    'SELECT username, rating FROM ratings WHERE room_id = $1 ORDER BY created_at DESC',
    [roomId]
  );
  return result.rows;
}

// Funciones para reacciones
async function saveReaction(roomId, username, time, message) {
  const result = await pool.query(
    'INSERT INTO reactions (room_id, username, time, message) VALUES ($1, $2, $3, $4) RETURNING *',
    [roomId, username, time, message]
  );
  return result.rows[0];
}

async function getReactions(roomId) {
  const result = await pool.query(
    'SELECT username, time, message FROM reactions WHERE room_id = $1 ORDER BY created_at ASC',
    [roomId]
  );
  return result.rows;
}

module.exports = {
  pool,
  initDatabase,
  saveChatMessage,
  getChatMessages,
  saveRating,
  getRatings,
  saveReaction,
  getReactions
};
