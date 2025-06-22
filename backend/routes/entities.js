const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  // GET all entities grouped and deduplicated by name for a given type
  router.get('/entities/by-type/:type', async (req, res) => {
    const type = req.params.type;
    try {
      const { rows } = await pool.query(`
        SELECT id, name, type, sub_type, source, created_at, array_to_json(tags) AS tags, is_player_character, is_party_member
        FROM "Note"."nodes"
        WHERE type = $1
        ORDER BY name
      `, [type]);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching entities by type:', err);
      res.status(500).json({ error: 'Failed to fetch entities' });
    }
  });

  // GET detailed player character information, including last known location
  router.get('/entities/player-characters-detailed', async (req, res) => {
    const client = await pool.connect();
    try {
      const query = `
        WITH PCMentionsInNotes AS (
            SELECT
                pc_node.id AS pc_id,
                n.id AS note_id,
                n.created_at AS note_created_at
            FROM "Note"."nodes" pc_node
            JOIN "Note"."note_mentions" pc_mention ON pc_node.id = pc_mention.node_id
            JOIN "Note"."notes" n ON pc_mention.note_id = n.id
            WHERE pc_node.is_player_character = TRUE
        ),
        RankedPCNotes AS (
            SELECT
                pc_id,
                note_id,
                note_created_at,
                ROW_NUMBER() OVER (PARTITION BY pc_id ORDER BY note_created_at DESC, note_id DESC) as rn
            FROM PCMentionsInNotes
        ),
        LatestPCNoteLocationMentions AS (
            SELECT
                rpn.pc_id,
                loc_mention.node_id AS location_id,
                loc_node.name AS location_name,
                ROW_NUMBER() OVER (PARTITION BY rpn.pc_id ORDER BY loc_mention.id ASC) as loc_rn
            FROM RankedPCNotes rpn
            JOIN "Note"."note_mentions" loc_mention ON rpn.note_id = loc_mention.note_id
            JOIN "Note"."nodes" loc_node ON loc_mention.node_id = loc_node.id
            WHERE rpn.rn = 1 AND loc_node.type = 'LOCATION'
        )
        SELECT
            pc_main.id,
            pc_main.name,
            pc_main.type,
            pc_main.sub_type,
            pc_main.is_player_character,
            pc_main.is_party_member,
            array_to_json(pc_main.tags) AS tags,
            cs.main_class,
            r.name AS race_name,
            lpl.location_id,
            lpl.location_name
        FROM "Note"."nodes" pc_main
        LEFT JOIN "Note"."character_sheets" cs ON pc_main.id = cs.node_id
        LEFT JOIN "race"."races" r ON cs.race_id = r.id
        LEFT JOIN (
            SELECT * FROM LatestPCNoteLocationMentions WHERE loc_rn = 1
        ) lpl ON pc_main.id = lpl.pc_id
        WHERE pc_main.is_player_character = TRUE
        ORDER BY pc_main.name;
      `;
      const { rows } = await client.query(query);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching detailed player characters:', err);
      res.status(500).json({ error: 'Failed to fetch detailed player characters', message: err.message });
    } finally {
      if (client) {
        client.release();
      }
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
        `SELECT id FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 LIMIT 1 FOR UPDATE`, // Added FOR UPDATE
        [name, type]
      );
      if (nodeRows.length === 0) {
        await client.query('ROLLBACK'); // Node not found, rollback
        // client.release(); // Removed: will be handled by finally
        return res.status(404).json({ error: 'Node not found' });
      }
      const nodeId = nodeRows[0].id;

      // Step 2: Get all relevant notes using Full-Text Search
      const { rows: notes } = await client.query(
        `SELECT id, content FROM "Note"."notes" WHERE content_tsv @@ websearch_to_tsquery('english', $1)`,
        [name] // 'name' is the search term for FTS
      );
      if (notes.length === 0) {
        await client.query('COMMIT'); // No notes to process, commit (or rollback, depending on desired behavior)
        // client.release(); // Removed: will be handled by finally
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
        // client.release(); // Removed: will be handled by finally
        return res.json({ success: true, mentionsAdded: 0 });
      }

      // Step 4: Get existing mentions for this node
      const { rows: existing } = await client.query(
        `SELECT note_id, start_pos, end_pos FROM "Note"."note_mentions" WHERE node_id = $1 FOR UPDATE`, // Added FOR UPDATE
        [nodeId]
      );
      const existingSet = new Set(existing.map(e => `${e.note_id}:${e.start_pos}:${e.end_pos}`));

      const filteredMentions = newMentions.filter(
        m => !existingSet.has(`${m.note_id}:${m.start_pos}:${m.end_pos}`)
      );

      if (filteredMentions.length === 0) {
        await client.query('COMMIT'); // No new mentions to add after filtering
        // client.release(); // Removed: will be handled by finally
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
        `INSERT INTO "Note"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type)
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
