const express = require('express');
const { spawn } = require('child_process');
const path = require('path');

module.exports = (pool) => {
  const router = express.Router();

  // Add a new note
  router.post('/add-note', async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing note content' });

    try {
      const { rows } = await pool.query(
        `INSERT INTO "DM"."notes" (content) VALUES ($1) RETURNING id, created_at`,
        [content]
      );
      const noteId = rows[0].id;

      const pythonPath = path.resolve(__dirname, '../../.venv/Scripts/python.exe');
      const taggerPath = path.resolve(__dirname, '../../tagger.py');

      const py = spawn(pythonPath, [taggerPath]);
      const payload = JSON.stringify({ note_id: noteId, text: content });

      let stdoutBuffer = '';
      let stderr = '';

      py.stdin.write(payload);
      py.stdin.end();

      py.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
      });

      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', async (code) => {
        if (code !== 0) {
          console.error(`❌ tagger.py exited with code ${code}`);
          console.error(stderr);
          return res.status(500).json({ error: 'Tagger failed', message: stderr.trim() });
        }

        let taggedNodes = [];
        try {
          taggedNodes = JSON.parse(stdoutBuffer);
        } catch (err) {
          console.error('❌ Failed to parse tagger.py output:', stdoutBuffer);
          return res.status(500).json({ error: 'Invalid JSON from tagger', message: stdoutBuffer });
        }

        return res.json({
          success: true,
          id: noteId,
          created_at: rows[0].created_at,
          nodes: taggedNodes
        });
      });

    } catch (err) {
      console.error('🔥 Express route error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to save note', message: err.message });
      }
    }
  });

  // Get all notes
  router.get('/notes', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, content, created_at
        FROM "DM"."notes"
        ORDER BY created_at DESC
      `);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch notes', message: err.message });
    }
  });

  // Update a note
  router.put('/notes/:id', async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    try {
      await pool.query(`UPDATE "DM"."notes" SET content = $1 WHERE id = $2`, [content, id]);
      await pool.query(`DELETE FROM "DM"."note_mentions" WHERE note_id = $1`, [id]);
      await pool.query(`DELETE FROM "DM"."node_links" WHERE note_id = $1`, [id]);

      const pythonPath = path.resolve(__dirname, '../../.venv/Scripts/python.exe');
      const taggerPath = path.resolve(__dirname, '../../tagger.py');
      const py = spawn(pythonPath, [taggerPath]);

      const payload = JSON.stringify({ note_id: id, text: content });
      let stderr = '';

      py.stdin.write(payload);
      py.stdin.end();

      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', (code) => {
        if (code !== 0) {
          console.error(`❌ tagger.py failed during update`);
          console.error(stderr);
        }
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update note', message: err.message });
    }
  });

  // Delete a note
  router.delete('/notes/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query(`DELETE FROM "DM"."note_mentions" WHERE note_id = $1`, [id]);
      await pool.query(`DELETE FROM "DM"."node_links" WHERE note_id = $1`, [id]);
      await pool.query(`DELETE FROM "DM"."notes" WHERE id = $1`, [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete note', message: err.message });
    }
  });

  router.post('/manual-tag', async (req, res) => {
    const { name, type, note_id, start_pos, end_pos, tag } = req.body;
  
    try {
      // Check if the node already exists
      const existing = await pool.query(`
        SELECT id FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2
      `, [name, type]);
  
      let node_id;
      if (existing.rows.length > 0) {
        node_id = existing.rows[0].id;
      } else {
        const insert = await pool.query(`
          INSERT INTO "DM"."nodes" (name, type) VALUES ($1, $2) RETURNING id
        `, [name, type]);
        node_id = insert.rows[0].id;
      }
  
      // Append tag only if it's a PERSON and not already tagged
      if (tag && type === 'PERSON') {
        await pool.query(`
          UPDATE "DM"."nodes"
          SET tags = array_append(tags, $1)
          WHERE id = $2 AND NOT ($1 = ANY(tags))
        `, [tag, node_id]);
      }
  
      // Create note mention
      await pool.query(`
        INSERT INTO "DM"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type)
        VALUES ($1, $2, $3, $4, $5)
      `, [node_id, note_id, start_pos, end_pos, type]);
  
      res.json({ success: true, node_id, node: { name, type } });
    } catch (err) {
      console.error('Manual tag error:', err);
      res.status(500).json({ error: 'Manual tag failed', message: err.message });
    }
  });

  return router;
};
