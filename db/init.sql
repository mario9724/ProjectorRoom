-- HABILITAR EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLA USERS (PRIMERA PRIORIDAD)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    user_pin CHAR(6) UNIQUE NOT NULL, -- PIN público de 6 dígitos
    auth_pin_hash VARCHAR(60) NOT NULL, -- PIN autenticación encriptado
    tmdb_api_key VARCHAR(255) NOT NULL,
    filmoteca_type VARCHAR(50) NOT NULL,
    bio TEXT,
    profile_image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA LISTS
CREATE TABLE lists (
    id SERIAL PRIMARY KEY,
    list_pin CHAR(6) UNIQUE NOT NULL,
    sala_name VARCHAR(100) NOT NULL,
    filmoteca_type VARCHAR(50) NOT NULL,
    host_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    genre VARCHAR(100),
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA ITEMS (TMDB)
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    item_pin CHAR(6) UNIQUE NOT NULL,
    tmdb_id INTEGER UNIQUE NOT NULL,
    item_type VARCHAR(20) NOT NULL, -- 'movie', 'tv'
    title VARCHAR(255) NOT NULL,
    year INTEGER,
    backdrop_path TEXT,
    poster_path TEXT,
    overview TEXT,
    genre TEXT,
    directors TEXT,
    actors TEXT,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    trailer_es TEXT,
    trailer_en TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA LIST_ITEMS (JUNCIÓN)
CREATE TABLE list_items (
    id SERIAL PRIMARY KEY,
    list_id INTEGER REFERENCES lists(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    added_by INTEGER REFERENCES users(id),
    playback_source TEXT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(list_id, item_id)
);

-- ÍNDICES PARA RENDIMIENTO
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_user_pin ON users(user_pin);
CREATE INDEX idx_lists_list_pin ON lists(list_pin);
CREATE INDEX idx_items_tmdb_id ON items(tmdb_id);
CREATE INDEX idx_items_item_pin ON items(item_pin);

-- TRIGGERS PARA MANTENER updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
