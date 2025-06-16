const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  // GET node by ID
  router.get('/nodes/:nodeId', async (req, res) => {
    const nodeId = parseInt(req.params.nodeId, 10); // ✅ Moved up
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }
  
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "DM"."nodes" WHERE id = $1`,
        [nodeId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Node not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  });

  router.patch('/nodes/:id/type', async (req, res) => {
    const nodeId = parseInt(req.params.id, 10);
    const { newType } = req.body;
  
    try {
      // Check if another node with the same name and type already exists
      const { rows } = await pool.query(`
        SELECT id FROM "DM"."nodes"
        WHERE id != $1 AND LOWER(name) = LOWER((SELECT name FROM "DM"."nodes" WHERE id = $1)) AND type = $2
      `, [nodeId, newType]);
  
      if (rows.length > 0) {
        return res.status(409).json({ error: 'A node with this name and type already exists.' });
      }
  
      // If no duplicate, proceed to update
      await pool.query(`
        UPDATE "DM"."nodes"
        SET type = $1
        WHERE id = $2
      `, [newType, nodeId]);
  
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to update type error:', err);
      res.status(500).json({ error: 'Failed to update node type' });
    }
  });
  

  // GET all notes that mention this node (and other nodes mentioned with it)
  router.get('/nodes/:id/mentions', async (req, res) => {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid node ID' });
  
    try {
      const { rows } = await pool.query(`
        SELECT m.*, n.content AS note_content
        FROM "DM"."note_mentions" m
        JOIN "DM"."notes" n ON m.note_id = n.id
        WHERE m.node_id = $1
        ORDER BY m.note_id DESC
      `, [nodeId]);
  
      // Add a `snippet` field for each mention
      const mentionsWithSnippets = rows.map(m => {
        const start = m.start_pos;
        const end = m.end_pos;
        const content = m.note_content || '';
  
        let snippet = '';
        if (typeof start === 'number' && typeof end === 'number' && start >= 0 && end > start && end <= content.length) {
          snippet = content.slice(start, end);
        }
  
        return {
          ...m,
          snippet
        };
      });
  
      res.json(mentionsWithSnippets);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch mentions', message: err.message });
    }
  });

  router.get('/nodes/by-name/:name', async (req, res) => {
    const name = req.params.name;
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [name]
      );
      if (rows.length === 0) return res.status(404).json({});
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch node' });
    }
  });

  return router;
};
