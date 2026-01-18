const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource } = req.body;
  
  if (!roomName || !hostUsername || !sourceUrl) {
    return res.status(400).json({ success: false, error: 'Datos incompletos' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO rooms (room_name, host_username, manifest, source_url, use_host_source) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [roomName, hostUsername, manifest, sourceUrl, useHostSource]
    );
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sala no encontrada' });
    }
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
