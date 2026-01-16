-- Reset DB
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

-- Tabla 1: SALAS (listas/rooms)
CREATE TABLE salas (
  id SERIAL PRIMARY KEY,
  sala_name VARCHAR(100) NOT NULL,
  filmoteca_type VARCHAR(50) NOT NULL, -- movie/series/custom
  pin CHAR(6) UNIQUE NOT NULL,
  anfitrion_name VARCHAR(50),
  genero VARCHAR(50),
  etiquetas TEXT[],
  invitados TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 2: USUARIOS
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  user_name VARCHAR(50) UNIQUE NOT NULL,
  user_id CHAR(6) UNIQUE NOT NULL,
  bio TEXT,
  image_url TEXT,
  pin_hash VARCHAR(255),
  tmdb_api TEXT,
  puntos INT DEFAULT 0,
  nivel INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla 3: ITEMS (global)
CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  tmdb_name VARCHAR(255),
  item_pin CHAR(6) UNIQUE,
  tmdb_id VARCHAR(20),
  year INT,
  avg_rating NUMERIC(3,2) DEFAULT 0
);

-- Junctions clave
CREATE TABLE sala_items (sala_id INT REFERENCES salas(id), item_id INT REFERENCES items(id), PRIMARY KEY(sala_id, item_id));
CREATE TABLE item_ratings (id SERIAL PRIMARY KEY, item_id INT REFERENCES items(id), user_name VARCHAR(50), stars INT, review TEXT);

-- Índices
CREATE INDEX idx_salas_pin ON salas(pin);
CREATE INDEX idx_items_pin ON items(item_pin);
CREATE INDEX idx_usuarios_name ON usuarios(user_name);
