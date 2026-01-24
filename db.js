const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Crear tablas si no existen
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projector_rooms (
        id VARCHAR(20) PRIMARY KEY,
        room_name VARCHAR(100) NOT NULL,
        host_username VARCHAR(50) NOT NULL,
        manifest TEXT NOT NULL,
        source_url TEXT NOT NULL,
        use_host_source BOOLEAN DEFAULT true,
        projector_type VARCHAR(20) DEFAULT 'public',
        custom_manifest TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_users (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        socket_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        time VARCHAR(10) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Base de datos inicializada');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
  }
}

module.exports = { pool, initDB };
