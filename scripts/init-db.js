// scripts/init-db.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initializeDatabase() {
  console.log('⏳ Iniciando migración de base de datos...');
  try {
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    console.log('✅ Tablas creadas/verificadas con éxito.');
  } catch (err) {
    console.error('❌ Error inicializando la base de datos:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initializeDatabase();
