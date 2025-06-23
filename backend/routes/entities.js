const express = require('express');

const authenticateToken = require('../utils/authenticateToken'); // Added for user ID

module.exports = (pool) => {
  const router = express.Router();

  // GET all entities grouped and deduplicated by name for a given type
  router.get('/entities/by-type/:type', authenticateToken, async (req, res) => { // Added authenticateToken
    const type = req.params.type;
    const userId = req.user.userId; // Get userId

    if (!userId) {
      return res.status(403).json({ error: 'User ID not found in token.' });
    }

    try {
      // This query assumes "Note"."nodes" table has a user_id column.
      const { rows } = await pool.query(`
        SELECT id, name, type, sub_type, source, created_at, array_to_json(tags) AS tags, is_player_character, is_party_member
        FROM "Note"."nodes"
        WHERE type = $1 AND user_id = $2
        ORDER BY name
      `, [type, userId]);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching entities by type:', err);
      res.status(500).json({ error: 'Failed to fetch entities' });
    }
  });

  // GET detailed player character information, including last known location
  router.get('/entities/player-characters-detailed', authenticateToken, async (req, res) => { // Added authenticateToken
    const userId = req.user.userId; // Get userId

    if (!userId) {
      return res.status(403).json({ error: 'User ID not found in token.' });
    }

    const client = await pool.connect();
    try {
      // This query assumes "Note"."nodes" (aliased as pc_node and pc_main) has a user_id column.
      // It also filters notes "n" by user_id.
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
              AND pc_node.user_id = $1 -- Filter PCs by user
              AND n.user_id = $1       -- Filter notes by user
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
          AND pc_main.user_id = $1 -- Filter main selection of PCs by user
        ORDER BY pc_main.name;
      `;
      const { rows } = await client.query(query, [userId]); // Added userId as parameter
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
  router.post('/retag-entity-everywhere', authenticateToken, async (req, res) => {
    const { name, type: newType, isPlayerCharacter, isPartyMember } = req.body; // 'type' from request is the newType
    const userId = req.user.userId;

    if (!name || !newType) {
      return res.status(400).json({ error: 'Missing name or newType parameters.' });
    }
    if (!userId) {
      return res.status(403).json({ error: 'User ID not found in token.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Find or Create the Target Node for (name, newType, userId)
      let targetNodeId;
      let targetNodeIsNew = false;
      const targetNodeSelectRes = await client.query(
        `SELECT id FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 AND user_id = $3`,
        [name, newType, userId]
      );

      if (targetNodeSelectRes.rows.length > 0) {
        targetNodeId = targetNodeSelectRes.rows[0].id;
        // If target node exists and newType is PERSON, update its PC/PM flags if provided and different
        if (newType === 'PERSON') {
          const existingFlagsRes = await client.query(
            `SELECT is_player_character, is_party_member FROM "Note"."nodes" WHERE id = $1 AND user_id = $2`,
            [targetNodeId, userId]
          );
          if (existingFlagsRes.rows.length > 0) { // Should be true
            const currentIsPC = existingFlagsRes.rows[0].is_player_character;
            const currentIsPM = existingFlagsRes.rows[0].is_party_member;
            const updatePC = isPlayerCharacter !== undefined ? !!isPlayerCharacter : currentIsPC;
            const updatePM = isPartyMember !== undefined ? !!isPartyMember : currentIsPM;

            if (updatePC !== currentIsPC || updatePM !== currentIsPM) {
              await client.query(
                `UPDATE "Note"."nodes" SET is_player_character = $1, is_party_member = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3 AND user_id = $4`,
                [updatePC, updatePM, targetNodeId, userId]
              );
            }
          }
        }
      } else {
        // Target node doesn't exist, create it
        const pcFlag = newType === 'PERSON' ? (isPlayerCharacter !== undefined ? !!isPlayerCharacter : false) : false;
        const pmFlag = newType === 'PERSON' ? (isPartyMember !== undefined ? !!isPartyMember : false) : false;
        const createNodeRes = await client.query(
          `INSERT INTO "Note"."nodes" (name, type, user_id, is_player_character, is_party_member)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [name, newType, userId, pcFlag, pmFlag]
        );
        targetNodeId = createNodeRes.rows[0].id;
        targetNodeIsNew = true;
      }

      // Step 2: Find Obsolete Node IDs (same name, same user, different type)
      const obsoleteNodesRes = await client.query(
        `SELECT id FROM "Note"."nodes"
         WHERE LOWER(name) = LOWER($1) AND user_id = $2 AND type != $3`,
        [name, userId, newType]
      );
      const obsoleteNodeIds = obsoleteNodesRes.rows.map(row => row.id);

      let mentionsReassignedCount = 0;
      if (obsoleteNodeIds.length > 0) {
        // Step 3: Re-attribute mentions from obsolete nodes to the target node.
        // This updates existing mentions that pointed to an obsolete node to now point to the target node.
        // It avoids creating a duplicate if a mention for the target node already exists at the same text span.
        const updateMentionsRes = await client.query(
          `UPDATE "Note"."note_mentions" AS nm
           SET node_id = $1, mention_type = $2
           FROM "Note"."notes" AS n
           WHERE nm.node_id = ANY($3::int[]) -- Any of the obsolete node IDs
             AND nm.note_id = n.id
             AND n.user_id = $4            -- Only in notes owned by the user
             AND NOT EXISTS (              -- Prevent update if a mention for targetNodeId already exists at this exact spot
               SELECT 1 FROM "Note"."note_mentions" nm_conflict
               WHERE nm_conflict.note_id = nm.note_id
                 AND nm_conflict.start_pos = nm.start_pos
                 AND nm_conflict.end_pos = nm.end_pos
                 AND nm_conflict.node_id = $1 -- targetNodeId
             )
           RETURNING nm.id`, // Return IDs of updated mentions
          [targetNodeId, newType, obsoleteNodeIds, userId]
        );
        mentionsReassignedCount = updateMentionsRes.rowCount;

        // Now, delete any remaining mentions that pointed to obsolete nodes.
        // These are mentions that were NOT updated because a targetNodeId mention already existed at their position.
        await client.query(
          `DELETE FROM "Note"."note_mentions" AS nm
           USING "Note"."notes" AS n
           WHERE nm.node_id = ANY($1::int[]) -- Any of the obsolete node IDs
             AND nm.note_id = n.id
             AND n.user_id = $2`,           // Only in notes owned by the user
          [obsoleteNodeIds, userId]
        );
      }

      // Step 4: Add new mentions for the targetNodeId for any text occurrences not yet linked to THIS targetNodeId.
      const { rows: notes } = await client.query(
        `SELECT id, content FROM "Note"."notes" WHERE content_tsv @@ websearch_to_tsquery('english', $1) AND user_id = $2`,
        [name, userId]
      );

      let newMentionsCreatedCount = 0;
      if (notes.length > 0) {
        const safeNameRegex = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeNameRegex}\\b`, 'gi');
        const mentionsToInsert = [];

        for (const note of notes) {
          const matches = [...note.content.matchAll(regex)];
          for (const match of matches) {
            mentionsToInsert.push({
              node_id: targetNodeId,
              note_id: note.id,
              start_pos: match.index,
              end_pos: match.index + name.length,
              mention_type: newType,
              source: 'USER_RETAGGED_EVERYWHERE', // Or a more specific source
              confidence: 1.0
            });
          }
        }

        if (mentionsToInsert.length > 0) {
          // Use INSERT ... ON CONFLICT DO NOTHING to avoid duplicates if some mentions were already created
          // for the targetNodeId by other means or by the re-attribution step.
          // The unique constraint should be on (note_id, node_id, start_pos, end_pos) or similar.
          // For simplicity, if (note_id, start_pos, end_pos) should be unique per type, this is more complex.
          // Assuming (note_id, node_id, start_pos, end_pos) as the conflict target.
          const insertValuesStr = mentionsToInsert
            .map((_, i) => `($1, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6}, $${i * 6 + 7})`)
            .join(', ');
          const insertParams = [targetNodeId];
          mentionsToInsert.forEach(m => {
            insertParams.push(m.note_id, m.start_pos, m.end_pos, m.mention_type, m.source, m.confidence);
          });

          // Assuming a unique constraint like: UNIQUE (note_id, node_id, start_pos, end_pos)
          // Or more simply, if a text span should only have one type of tag: UNIQUE (note_id, start_pos, end_pos)
          // The previous steps should have handled consolidation for the *same text span*.
          // This step now ensures the targetNodeId is linked to all text spans.
          const insertNewMentionsRes = await client.query(
            `INSERT INTO "Note"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type, source, confidence)
             VALUES ${insertValuesStr}
             ON CONFLICT (note_id, node_id, start_pos, end_pos) DO NOTHING`, // Handles if mention already exists for target node
            insertParams
          );
          newMentionsCreatedCount = insertNewMentionsRes.rowCount;
        }
      }

      // Step 5 (Optional but Recommended): Delete obsolete nodes if they have no remaining mentions or other critical links.
      // This requires checking 'node_links' and 'character_sheets' as well.
      // For now, this step is omitted to keep the current change focused.
      if (obsoleteNodeIds.length > 0) {
        // Example: A more comprehensive check before deleting would be needed.
        // For now, we are NOT deleting obsolete nodes automatically.
        console.log(`INFO: Obsolete node IDs found during retag: ${obsoleteNodeIds.join(', ')}. Manual cleanup might be needed.`);
      }

      await client.query('COMMIT');
      res.json({
        success: true,
        message: `Entity '${name}' re-tagged as '${newType}'. ${mentionsReassignedCount} mentions reassigned. ${newMentionsCreatedCount} new mentions created/confirmed.`,
        targetNodeId: targetNodeId,
        targetNodeIsNew: targetNodeIsNew,
        mentionsReassigned: mentionsReassignedCount,
        newMentionsCreated: newMentionsCreatedCount
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Retag entity everywhere error:', err);
    } finally {
      if (client) {
        client.release(); // Release client
      }
    }
  });

  return router;
};
