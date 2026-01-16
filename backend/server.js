const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// POOL POSTGRESQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// INICIALIZAR BASE DE DATOS
async function initDatabase() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS init_table (id INT);
      SELECT 1;
    `);
    console.log('✅ Base de datos lista');
    client.release();
  } catch (err) {
    console.error('❌ Error BD:', err);
  }
}

initDatabase();

// GENERAR PIN 6 DÍGITOS ÚNICO
async function generateUniquePin(table, pinColumn) {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
    const result = await pool.query(
      `SELECT ${pinColumn} FROM ${table} WHERE ${pinColumn} = $1`,
      [pin]
    );
  } while (result.rows.length > 0);
  return pin;
}

// 1. REGISTRO USUARIO
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, auth_pin, tmdb_api_key, filmoteca_type } = req.body;
    
    // Generar PIN público único
    const user_pin = await generateUniquePin('users', 'user_pin');
    
    // Encriptar PIN autenticación
    const auth_pin_hash = await bcrypt.hash(auth_pin, 10);
    
    const result = await pool.query(
      `INSERT INTO users (username, user_pin, auth_pin_hash, tmdb_api_key, filmoteca_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, user_pin`,
      [username, user_pin, auth_pin_hash, tmdb_api_key, filmoteca_type]
    );
    
    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. CREAR LISTA
app.post('/api/lists', async (req, res) => {
  try {
    const { user_id, sala_name, genre, tags } = req.body;
    
    const list_pin = await generateUniquePin('lists', 'list_pin');
    
    const result = await pool.query(
      `INSERT INTO lists (list_pin, sala_name, filmoteca_type, host_id, genre, tags)
       VALUES ($1, $2, (SELECT filmoteca_type FROM users WHERE id = $3), $3, $4, $5)
       RETURNING *`,
      [list_pin, sala_name, user_id, genre, tags || []]
    );
    
    res.json({
      success: true,
      list: result.rows[0]
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API ProjectorRoom corriendo en puerto ${PORT}`);
});
