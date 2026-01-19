CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(10) PRIMARY KEY,
    room_name VARCHAR(50) NOT NULL,
    host_username VARCHAR(30) NOT NULL,
    manifest TEXT NOT NULL,
    source_url TEXT NOT NULL,
    use_host_source BOOLEAN DEFAULT TRUE,
    projector_type VARCHAR(20) DEFAULT 'public',
    custom_manifest TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(10) REFERENCES rooms(id) ON DELETE CASCADE,
    username VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ratings (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(10) REFERENCES rooms(id) ON DELETE CASCADE,
    username VARCHAR(30) NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, username)
);

CREATE TABLE IF NOT EXISTS reactions (
    id SERIAL PRIMARY KEY,
    room_id VARCHAR(10) REFERENCES rooms(id) ON DELETE CASCADE,
    username VARCHAR(30) NOT NULL,
    time_marker VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
