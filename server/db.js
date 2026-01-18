const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      room_name VARCHAR(255) NOT NULL,
      host_username VARCHAR(255) NOT NULL,
      manifest TEXT,
      source_url TEXT,
      use_host_source BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_sources (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
      username VARCHAR(255) NOT NULL,
      source_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  console.log('✅ Base de datos inicializada');
};

initDB().catch(console.error);

module.exports = pool;
