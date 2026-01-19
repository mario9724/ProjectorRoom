const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'projectorroom.db');

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Error conectando a la base de datos:', err);
            } else {
                console.log('✅ Conectado a la base de datos SQLite');
                this.initTables();
            }
        });
    }

    initTables() {
        this.db.serialize(() => {
            // Tabla de salas
            this.db.run(`
                CREATE TABLE IF NOT EXISTS rooms (
                    id TEXT PRIMARY KEY,
                    roomName TEXT NOT NULL,
                    hostUsername TEXT NOT NULL,
                    manifest TEXT NOT NULL,
                    sourceUrl TEXT NOT NULL,
                    useHostSource INTEGER DEFAULT 1,
                    projectorType TEXT DEFAULT 'public',
                    customManifest TEXT,
                    createdAt TEXT NOT NULL
                )
            `);

            // Tabla de mensajes de chat
            this.db.run(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roomId TEXT NOT NULL,
                    username TEXT NOT NULL,
                    message TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
                )
            `);

            // Tabla de calificaciones
            this.db.run(`
                CREATE TABLE IF NOT EXISTS ratings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roomId TEXT NOT NULL,
                    username TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
                )
            `);

            // Tabla de reacciones
            this.db.run(`
                CREATE TABLE IF NOT EXISTS reactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roomId TEXT NOT NULL,
                    username TEXT NOT NULL,
                    time TEXT NOT NULL,
                    message TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
                )
            `);

            console.log('✅ Tablas de base de datos inicializadas');
        });
    }

    // ==================== SALAS ====================
    createRoom(roomData) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO rooms (id, roomName, hostUsername, manifest, sourceUrl, useHostSource, projectorType, customManifest, createdAt)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            this.db.run(sql, [
                roomData.id,
                roomData.roomName,
                roomData.hostUsername,
                roomData.manifest,
                roomData.sourceUrl,
                roomData.useHostSource ? 1 : 0,
                roomData.projectorType,
                roomData.customManifest || '',
                roomData.createdAt
            ], (err) => {
                if (err) reject(err);
                else resolve(roomData);
            });
        });
    }

    getRoom(roomId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM rooms WHERE id = ?';
            this.db.get(sql, [roomId], (err, row) => {
                if (err) reject(err);
                else if (!row) resolve(null);
                else {
                    resolve({
                        ...row,
                        useHostSource: row.useHostSource === 1
                    });
                }
            });
        });
    }

    // ==================== MENSAJES ====================
    saveChatMessage(roomId, username, message) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO chat_messages (roomId, username, message, timestamp)
                         VALUES (?, ?, ?, ?)`;

            this.db.run(sql, [roomId, username, message, new Date().toISOString()], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, roomId, username, message });
            });
        });
    }

    getChatMessages(roomId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM chat_messages WHERE roomId = ? ORDER BY timestamp ASC`;
            this.db.all(sql, [roomId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ==================== CALIFICACIONES ====================
    saveRating(roomId, username, rating) {
        return new Promise((resolve, reject) => {
            // Primero verificar si el usuario ya ha calificado
            const checkSql = 'SELECT id FROM ratings WHERE roomId = ? AND username = ?';
            this.db.get(checkSql, [roomId, username], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (row) {
                    // Actualizar calificación existente
                    const updateSql = 'UPDATE ratings SET rating = ?, timestamp = ? WHERE id = ?';
                    this.db.run(updateSql, [rating, new Date().toISOString(), row.id], (err) => {
                        if (err) reject(err);
                        else resolve({ roomId, username, rating });
                    });
                } else {
                    // Insertar nueva calificación
                    const insertSql = `INSERT INTO ratings (roomId, username, rating, timestamp)
                                      VALUES (?, ?, ?, ?)`;
                    this.db.run(insertSql, [roomId, username, rating, new Date().toISOString()], (err) => {
                        if (err) reject(err);
                        else resolve({ roomId, username, rating });
                    });
                }
            });
        });
    }

    getRatings(roomId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT username, rating FROM ratings WHERE roomId = ? ORDER BY timestamp DESC`;
            this.db.all(sql, [roomId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ==================== REACCIONES ====================
    saveReaction(roomId, username, time, message) {
        return new Promise((resolve, reject) => {
            const sql = `INSERT INTO reactions (roomId, username, time, message, timestamp)
                         VALUES (?, ?, ?, ?, ?)`;

            this.db.run(sql, [roomId, username, time, message, new Date().toISOString()], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, roomId, username, time, message });
            });
        });
    }

    getReactions(roomId) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT username, time, message FROM reactions WHERE roomId = ? ORDER BY timestamp ASC`;
            this.db.all(sql, [roomId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ==================== CERRAR CONEXIÓN ====================
    close() {
        this.db.close((err) => {
            if (err) {
                console.error('❌ Error cerrando base de datos:', err);
            } else {
                console.log('✅ Conexión a base de datos cerrada');
            }
        });
    }
}

module.exports = new Database();
