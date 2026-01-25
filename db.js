const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    console.log('🔧 Inicializando base de datos...');

    // Crear tabla de salas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projector_rooms (
        id VARCHAR(10) PRIMARY KEY,
        room_name VARCHAR(100) NOT NULL,
        host_username VARCHAR(50) NOT NULL,
        manifest TEXT NOT NULL,
        selected_episode TEXT,
        source_url TEXT NOT NULL,
        use_host_source BOOLEAN DEFAULT true,
        projector_type VARCHAR(20) DEFAULT 'public',
        custom_manifest TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ⭐ MIGRACIÓN: Añadir columna selected_episode si no existe
    await pool.query(`
      ALTER TABLE projector_rooms 
      ADD COLUMN IF NOT EXISTS selected_episode TEXT
    `);

    // Crear tabla de usuarios en sala
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_users (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(10) NOT NULL,
        socket_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de ratings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(10) NOT NULL,
        username VARCHAR(50) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de reacciones
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(10) NOT NULL,
        username VARCHAR(50) NOT NULL,
        time VARCHAR(10) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de mensajes de chat
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(10) NOT NULL,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_system BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Base de datos inicializada correctamente');

  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  }
}

module.exports = { pool, initDB };
