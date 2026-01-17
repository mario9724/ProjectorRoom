const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/create', async (req, res) => {
  const { roomName, hostUsername, manifest, sourceUrl, useHostSource } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO rooms (room_name, host_username, manifest, source_url, use_host_source) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [roomName, hostUsername, manifest, sourceUrl, useHostSource]
    );
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rooms WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'ProjectorRoom no encontrada' });
    }
    res.json({ success: true, projectorRoom: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/sources', async (req, res) => {
  const { username, sourceUrl } = req.body;
  
  try {
    const result = await pool.query(
      `INSERT INTO room_sources (room_id, username, source_url) 
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, username, sourceUrl]
    );
    res.json({ success: true, source: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
