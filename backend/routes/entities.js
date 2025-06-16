const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  // GET all entities grouped and deduplicated by name for a given type
  router.get('/entities/by-type/:type', async (req, res) => {
    const type = req.params.type;
    try {
      const { rows } = await pool.query(`
        SELECT id, name, type, sub_type, source, created_at, array_to_json(tags) AS tags
        FROM "DM"."nodes"
        WHERE type = $1
        ORDER BY name
      `, [type]);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching entities by type:', err);
      res.status(500).json({ error: 'Failed to fetch entities' });
    }
  });

  // Re-tag the same entity everywhere it occurs
  router.post('/retag-entity-everywhere', async (req, res) => {
    const { name, type } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: 'Missing name or type' });
    }

    const client = await pool.connect(); // Acquire client
    try {
      await client.query('BEGIN'); // Start transaction

      // Step 1: Retrieve node ID
      const { rows: nodeRows } = await client.query(
        `SELECT id FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 LIMIT 1 FOR UPDATE`, // Added FOR UPDATE
        [name, type]
      );
      if (nodeRows.length === 0) {
        await client.query('ROLLBACK'); // Node not found, rollback
        client.release();
        return res.status(404).json({ error: 'Node not found' });
      }
      const nodeId = nodeRows[0].id;

      // Step 2: Get all relevant notes
      const { rows: notes } = await client.query(
        `SELECT id, content FROM "DM"."notes" WHERE content ILIKE '%' || $1 || '%'`,
        [name]
      );
      if (notes.length === 0) {
        await client.query('COMMIT'); // No notes to process, commit (or rollback, depending on desired behavior)
        client.release();
        return res.json({ success: true, mentionsAdded: 0 });
      }

      // Step 3: Match words (No DB interaction, so outside explicit transaction steps if complex)
      const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${safeName}\\b`, 'gi');

      const newMentions = [];
      for (const note of notes) {
        const matches = [...note.content.matchAll(regex)];
        for (const match of matches) {
          newMentions.push({
            note_id: note.id,
            start_pos: match.index,
            end_pos: match.index + name.length
          });
        }
      }

      if (newMentions.length === 0) {
        await client.query('COMMIT'); // No new mentions found
        client.release();
        return res.json({ success: true, mentionsAdded: 0 });
      }

      // Step 4: Get existing mentions for this node
      const { rows: existing } = await client.query(
        `SELECT note_id, start_pos, end_pos FROM "DM"."note_mentions" WHERE node_id = $1 FOR UPDATE`, // Added FOR UPDATE
        [nodeId]
      );
      const existingSet = new Set(existing.map(e => `${e.note_id}:${e.start_pos}:${e.end_pos}`));

      const filteredMentions = newMentions.filter(
        m => !existingSet.has(`${m.note_id}:${m.start_pos}:${m.end_pos}`)
      );

      if (filteredMentions.length === 0) {
        await client.query('COMMIT'); // No new mentions to add after filtering
        client.release();
        return res.json({ success: true, mentionsAdded: 0 });
      }

      // Step 5: Bulk insert new mentions
      const insertValues = filteredMentions
        .map((_, i) => `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`)
        .join(', ');
      const insertParams = [nodeId];
      filteredMentions.forEach(m => {
        insertParams.push(m.note_id, m.start_pos, m.end_pos, type);
      });

      await client.query(
        `INSERT INTO "DM"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type)
         VALUES ${insertValues}`,
        insertParams
      );

      await client.query('COMMIT'); // Commit successful transaction
      res.json({ success: true, mentionsAdded: filteredMentions.length });
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback on any error
      console.error('🔥 Retag error:', err);
      res.status(500).json({ error: 'Server error', message: err.message });
    } finally {
      if (client) {
        client.release(); // Release client
      }
    }
  });

  return router;
};
