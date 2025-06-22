const express = require('express');
const authenticateToken = require('../utils/authenticateToken');

module.exports = (pool) => {
  const router = express.Router();

  // GET all races
  router.get('/races', authenticateToken, async (req, res) => {
    try {
      // Assuming race.races has 'id' and 'name' columns
      const result = await pool.query('SELECT id, name FROM "race"."races" ORDER BY name ASC');
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching races:', err);
      res.status(500).json({ error: 'Failed to fetch races', message: err.message });
    }
  });

  // GET all backgrounds
  router.get('/backgrounds', authenticateToken, async (req, res) => {
    try {
      // Assuming background.backgrounds has 'id' and 'name' columns
      const result = await pool.query('SELECT id, name FROM "background"."backgrounds" ORDER BY name ASC');
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching backgrounds:', err);
      res.status(500).json({ error: 'Failed to fetch backgrounds', message: err.message });
    }
  });

  // GET all available class names
  router.get('/available-classes', authenticateToken, async (req, res) => {
    try {
      // This query lists tables in the 'class' schema that start with 'class_'
      // and then formats the name. This is one way to dynamically get class names.
      // A hardcoded list or a dedicated 'class_overview' table might be more robust
      // if table naming conventions aren't strictly for 'class_ClassName'.
      const result = await pool.query(
        `SELECT
           REPLACE(INITCAP(REPLACE(table_name, 'class_', '')), '_', ' ') AS class_name
         FROM information_schema.tables
         WHERE table_schema = 'class' AND table_name LIKE 'class_%'
         ORDER BY class_name ASC`
      );
      // The query returns objects like { class_name: 'Artificer' }
      // We want an array of strings for the frontend dropdown.
      res.json(result.rows.map(row => row.class_name));
    } catch (err) {
      console.error('Error fetching available classes:', err);
      res.status(500).json({ error: 'Failed to fetch available classes', message: err.message });
    }
  });

  return router;
};
