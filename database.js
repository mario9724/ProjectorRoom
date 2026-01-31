const { Pool } = require('pg');

// Configuración del pool de PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Función para inicializar las tablas
async function initDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Tabla de salas (projector_rooms)
    await client.query(`
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
      )
    `);
    
    // Tabla de información de películas/series
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_info (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        original_title VARCHAR(200),
        overview TEXT,
        release_date DATE,
        media_type VARCHAR(20), -- 'movie' o 'tv'
        poster_path TEXT,
        backdrop_path TEXT,
        vote_average DECIMAL(3,1),
        vote_count INTEGER,
        popularity DECIMAL(10,3),
        original_language VARCHAR(10),
        genres JSONB,
        runtime INTEGER, -- en minutos
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id)
      )
    `);
    
    // Tabla de elenco (cast)
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_cast (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        actor_name VARCHAR(100) NOT NULL,
        character_name VARCHAR(100),
        profile_path TEXT,
        cast_order INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabla de crew (directores, escritores, etc)
    await client.query(`
      CREATE TABLE IF NOT EXISTS media_crew (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        person_name VARCHAR(100) NOT NULL,
        job VARCHAR(100) NOT NULL,
        department VARCHAR(50),
        profile_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabla de usuarios en salas
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_users (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        socket_id VARCHAR(50) NOT NULL,
        username VARCHAR(50) NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        left_at TIMESTAMP
      )
    `);
    
    // Tabla de mensajes de chat
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Índice para mensajes por sala
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id 
      ON chat_messages(room_id, created_at DESC)
    `);
    
    // Tabla de calificaciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, username)
      )
    `);
    
    // Índice para calificaciones por sala
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ratings_room_id 
      ON ratings(room_id)
    `);
    
    // Tabla de reacciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS reactions (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(20) REFERENCES projector_rooms(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        time_minutes INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Índice para reacciones por sala y tiempo
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reactions_room_id_time 
      ON reactions(room_id, time_minutes)
    `);
    
    await client.query('COMMIT');
    console.log('✅ Base de datos inicializada correctamente');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error inicializando base de datos:', error);
    throw error;
  } finally {
    client.release();
  }
}

// ==================== FUNCIONES DE SALA ====================

async function createRoom(roomData) {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest } = roomData;
  
  const query = `
    INSERT INTO projector_rooms 
    (id, room_name, host_username, manifest, source_url, use_host_source, projector_type, custom_manifest)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;
  
  const values = [
    roomData.id,
    roomName,
    hostUsername,
    manifest,
    sourceUrl,
    useHostSource !== false,
    projectorType || 'public',
    customManifest || null
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function getRoomById(roomId) {
  const query = 'SELECT * FROM projector_rooms WHERE id = $1';
  const result = await pool.query(query, [roomId]);
  return result.rows[0];
}

async function deleteRoom(roomId) {
  const query = 'DELETE FROM projector_rooms WHERE id = $1';
  await pool.query(query, [roomId]);
}

// ==================== FUNCIONES DE MEDIA INFO ====================

async function saveMediaInfo(roomId, mediaData) {
  const query = `
    INSERT INTO media_info 
    (room_id, title, original_title, overview, release_date, media_type, 
     poster_path, backdrop_path, vote_average, vote_count, popularity, 
     original_language, genres, runtime)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (room_id) 
    DO UPDATE SET
      title = EXCLUDED.title,
      original_title = EXCLUDED.original_title,
      overview = EXCLUDED.overview,
      release_date = EXCLUDED.release_date,
      media_type = EXCLUDED.media_type,
      poster_path = EXCLUDED.poster_path,
      backdrop_path = EXCLUDED.backdrop_path,
      vote_average = EXCLUDED.vote_average,
      vote_count = EXCLUDED.vote_count,
      popularity = EXCLUDED.popularity,
      original_language = EXCLUDED.original_language,
      genres = EXCLUDED.genres,
      runtime = EXCLUDED.runtime
    RETURNING *
  `;
  
  const values = [
    roomId,
    mediaData.title,
    mediaData.original_title || null,
    mediaData.overview || null,
    mediaData.release_date || null,
    mediaData.media_type || null,
    mediaData.poster_path || null,
    mediaData.backdrop_path || null,
    mediaData.vote_average || null,
    mediaData.vote_count || null,
    mediaData.popularity || null,
    mediaData.original_language || null,
    mediaData.genres ? JSON.stringify(mediaData.genres) : null,
    mediaData.runtime || null
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

async function getMediaInfo(roomId) {
  const query = 'SELECT * FROM media_info WHERE room_id = $1';
  const result = await pool.query(query, [roomId]);
  return result.rows[0];
}

// ==================== FUNCIONES DE CAST Y CREW ====================

async function saveMediaCast(roomId, castArray) {
  if (!castArray || castArray.length === 0) return;
  
  // Primero eliminar el cast anterior
  await pool.query('DELETE FROM media_cast WHERE room_id = $1', [roomId]);
  
  // Insertar nuevo cast
  const values = castArray.map((person, index) => [
    roomId,
    person.name || person.actor_name,
    person.character || person.character_name || null,
    person.profile_path || null,
    person.order !== undefined ? person.order : index
  ]);
  
  if (values.length > 0) {
    const query = `
      INSERT INTO media_cast (room_id, actor_name, character_name, profile_path, cast_order)
      VALUES ${values.map((_, i) => `($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`).join(', ')}
    `;
    
    await pool.query(query, values.flat());
  }
}

async function saveMediaCrew(roomId, crewArray) {
  if (!crewArray || crewArray.length === 0) return;
  
  // Primero eliminar el crew anterior
  await pool.query('DELETE FROM media_crew WHERE room_id = $1', [roomId]);
  
  // Insertar nuevo crew
  const values = crewArray.map(person => [
    roomId,
    person.name || person.person_name,
    person.job,
    person.department || null,
    person.profile_path || null
  ]);
  
  if (values.length > 0) {
    const query = `
      INSERT INTO media_crew (room_id, person_name, job, department, profile_path)
      VALUES ${values.map((_, i) => `($${i*5+1}, $${i*5+2}, $${i*5+3}, $${i*5+4}, $${i*5+5})`).join(', ')}
    `;
    
    await pool.query(query, values.flat());
  }
}

async function getMediaCast(roomId) {
  const query = 'SELECT * FROM media_cast WHERE room_id = $1 ORDER BY cast_order';
  const result = await pool.query(query, [roomId]);
  return result.rows;
}

async function getMediaCrew(roomId) {
  const query = 'SELECT * FROM media_crew WHERE room_id = $1';
  const result = await pool.query(query, [roomId]);
  return result.rows;
}

// ==================== FUNCIONES DE USUARIOS ====================

async function addUserToRoom(roomId, socketId, username) {
  const query = `
    INSERT INTO room_users (room_id, socket_id, username)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const result = await pool.query(query, [roomId, socketId, username]);
  return result.rows[0];
}

async function removeUserFromRoom(socketId) {
  const query = `
    UPDATE room_users 
    SET left_at = CURRENT_TIMESTAMP 
    WHERE socket_id = $1 AND left_at IS NULL
    RETURNING *
  `;
  
  const result = await pool.query(query, [socketId]);
  return result.rows[0];
}

async function getActiveUsersInRoom(roomId) {
  const query = `
    SELECT socket_id, username, joined_at 
    FROM room_users 
    WHERE room_id = $1 AND left_at IS NULL
    ORDER BY joined_at
  `;
  
  const result = await pool.query(query, [roomId]);
  return result.rows;
}

// ==================== FUNCIONES DE CHAT ====================

async function saveChatMessage(roomId, username, message) {
  const query = `
    INSERT INTO chat_messages (room_id, username, message)
    VALUES ($1, $2, $3)
    RETURNING *
  `;
  
  const result = await pool.query(query, [roomId, username, message]);
  return result.rows[0];
}

async function getChatMessages(roomId, limit = 100) {
  const query = `
    SELECT username, message, created_at 
    FROM chat_messages 
    WHERE room_id = $1 
    ORDER BY created_at DESC 
    LIMIT $2
  `;
  
  const result = await pool.query(query, [roomId, limit]);
  return result.rows.reverse(); // Devolver en orden cronológico
}

// ==================== FUNCIONES DE CALIFICACIONES ====================

async function saveRating(roomId, username, rating) {
  const query = `
    INSERT INTO ratings (room_id, username, rating)
    VALUES ($1, $2, $3)
    ON CONFLICT (room_id, username) 
    DO UPDATE SET 
      rating = EXCLUDED.rating,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  
  const result = await pool.query(query, [roomId, username, rating]);
  return result.rows[0];
}

async function getRatings(roomId) {
  const query = `
    SELECT username, rating, created_at, updated_at 
    FROM ratings 
    WHERE room_id = $1 
    ORDER BY created_at
  `;
  
  const result = await pool.query(query, [roomId]);
  return result.rows;
}

async function getAverageRating(roomId) {
  const query = `
    SELECT 
      ROUND(AVG(rating), 1) as average_rating,
      COUNT(*) as total_ratings
    FROM ratings 
    WHERE room_id = $1
  `;
  
  const result = await pool.query(query, [roomId]);
  return result.rows[0];
}

// ==================== FUNCIONES DE REACCIONES ====================

async function saveReaction(roomId, username, timeMinutes, message) {
  const query = `
    INSERT INTO reactions (room_id, username, time_minutes, message)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const result = await pool.query(query, [roomId, username, timeMinutes, message]);
  return result.rows[0];
}

async function getReactions(roomId) {
  const query = `
    SELECT username, time_minutes, message, created_at 
    FROM reactions 
    WHERE room_id = $1 
    ORDER BY time_minutes, created_at
  `;
  
  const result = await pool.query(query, [roomId]);
  return result.rows;
}

async function getReactionsByTimeRange(roomId, startMinute, endMinute) {
  const query = `
    SELECT username, time_minutes, message, created_at 
    FROM reactions 
    WHERE room_id = $1 AND time_minutes BETWEEN $2 AND $3
    ORDER BY time_minutes, created_at
  `;
  
  const result = await pool.query(query, [roomId, startMinute, endMinute]);
  return result.rows;
}

// ==================== FUNCIONES DE ESTADÍSTICAS ====================

async function getRoomStats(roomId) {
  const statsQuery = `
    SELECT 
      (SELECT COUNT(*) FROM chat_messages WHERE room_id = $1) as total_messages,
      (SELECT COUNT(*) FROM ratings WHERE room_id = $1) as total_ratings,
      (SELECT ROUND(AVG(rating), 1) FROM ratings WHERE room_id = $1) as avg_rating,
      (SELECT COUNT(*) FROM reactions WHERE room_id = $1) as total_reactions,
      (SELECT COUNT(*) FROM room_users WHERE room_id = $1 AND left_at IS NULL) as active_users,
      (SELECT COUNT(DISTINCT username) FROM room_users WHERE room_id = $1) as total_unique_users
  `;
  
  const result = await pool.query(statsQuery, [roomId]);
  return result.rows[0];
}

// ==================== EXPORTAR ====================

module.exports = {
  pool,
  initDatabase,
  
  // Salas
  createRoom,
  getRoomById,
  deleteRoom,
  
  // Media Info
  saveMediaInfo,
  getMediaInfo,
  
  // Cast & Crew
  saveMediaCast,
  saveMediaCrew,
  getMediaCast,
  getMediaCrew,
  
  // Usuarios
  addUserToRoom,
  removeUserFromRoom,
  getActiveUsersInRoom,
  
  // Chat
  saveChatMessage,
  getChatMessages,
  
  // Calificaciones
  saveRating,
  getRatings,
  getAverageRating,
  
  // Reacciones
  saveReaction,
  getReactions,
  getReactionsByTimeRange,
  
  // Estadísticas
  getRoomStats
};
