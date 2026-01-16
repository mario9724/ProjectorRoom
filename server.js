const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
client.connect();

async function genPin(length) {
  return Math.floor(1000000 / Math.pow(10, 7-length)).toString().padStart(length, '0');
}

// ========== WEB API ==========
app.post('/api/register', async (req, res) => {
  const { user_name, pin, tmdb_api, filmoteca_type, sala_name } = req.body;
  const user_id = await genPin(6);
  const pin_hash = await bcrypt.hash(pin, 10);
  
  // Usuario
  const userRes = await client.query(
    'INSERT INTO usuarios(user_name, user_id, pin_hash, tmdb_api) VALUES($1,$2,$3,$4) RETURNING id, user_id',
    [user_name, user_id, pin_hash, tmdb_api]
  );
  
  // Primera sala
  const sala_pin = await genPin(6);
  await client.query(
    'INSERT INTO salas(sala_name, filmoteca_type, pin, anfitrion_name) VALUES($1,$2,$3,$4)',
    [sala_name, filmoteca_type, sala_pin, user_name]
  );
  
  res.json({ success: true, user_id, sala_pin });
});

app.post('/api/auth', async (req, res) => {
  const { user_name, pin } = req.body;
  const result = await client.query('SELECT * FROM usuarios WHERE user_name = $1', [user_name]);
  if (result.rows[0] && await bcrypt.compare(pin, result.rows[0].pin_hash)) {
    res.json({ success: true, user: result.rows[0] });
  } else {
    res.json({ success: false });
  }
});

// Más endpoints: /api/salas, /api/items/add, /api/ratings, etc.
app.get('/api/salas/:pin', async (req, res) => {
  const result = await client.query('SELECT * FROM salas WHERE pin = $1', [req.params.pin]);
  res.json(result.rows[0] || null);
});

// ========== STREMIO ==========
const builder = new addonBuilder({
  id: 'org.roomies.social',
  version: '1.0.0',
  name: 'Roomies Social',
  description: 'Salas sociales con ratings y reacciones',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  idPrefixes: ['roomies:'],
  catalogs: [{ type: 'movie', id: 'salas', name: 'Salas Populares' }]
});

builder.defineCatalogHandler(async (args) => {
  if (args.extra.search) {
    // Búsqueda salas por nombre
    const result = await client.query('SELECT * FROM salas WHERE sala_name ILIKE $1 LIMIT 20', [`%${args.extra.search}%`]);
    return { metas: result.rows.map(s => ({
      id: `roomies:sala:${s.id}`,
      type: s.filmoteca_type,
      name: s.sala_name,
      poster: 'https://via.placeholder.com/300x450?text='+encodeURIComponent(s.sala_name)
    })) };
  }
  return { metas: [] };
});

builder.defineMetaHandler(async (args) => {
  if (args.id.startsWith('roomies:sala:')) {
    const salaId = args.id.split(':')[2];
    const sala = await client.query('SELECT * FROM salas s JOIN sala_items si ON s.id=si.sala_id JOIN items i ON si.item_id=i.id WHERE s.id=$1 LIMIT 1', [salaId]);
    return { metas: sala.rows.map(item => ({
      id: `roomies:item:${item.item_pin}`,
      type: 'movie',
      name: item.tmdb_name,
      poster: `https://image.tmdb.org/t/p/w500/${item.tmdb_id}.jpg`, // Placeholder
      rating: item.avg_rating
    })) };
  }
  return { metas: [] };
});

builder.defineStreamHandler(async (args) => {
  // Streams desde manifests user + ratings overlay
  return { streams: [{ url: 'https://example.com/stream.m3u8', title: 'Fuentes + Reviews' }] };
});

app.use('/manifest.json', serveHTTP(builder.getInterface()));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on ${port}`));
