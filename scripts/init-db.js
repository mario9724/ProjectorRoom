require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('⏳ Configurando tablas en PostgreSQL...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Base de datos lista para persistencia.');
  } catch (err) {
    console.error('❌ Error al inicializar:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
