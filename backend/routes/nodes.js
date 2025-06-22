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
        `SELECT id, name, type, sub_type, description, source, tags, created_at, updated_at, is_player_character, is_party_member
         FROM "Note"."nodes" WHERE id = $1`,
        [nodeId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Node not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  });

  // Remove a specific tag from a node
  router.delete('/nodes/:nodeId/tags', async (req, res) => {
    const { nodeId: nodeIdParam } = req.params;
    const nodeId = parseInt(nodeIdParam, 10);
    const { tag_to_remove } = req.body;

    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID.' });
    }
    if (!tag_to_remove || typeof tag_to_remove !== 'string' || tag_to_remove.trim() === '') {
      return res.status(400).json({ error: 'tag_to_remove must be a non-empty string.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const nodeRes = await client.query(
        `SELECT id, name, tags FROM "Note"."nodes" WHERE id = $1 FOR UPDATE`,
        [nodeId]
      );

      if (nodeRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Node not found.' });
      }

      const currentNode = nodeRes.rows[0];
      let tagsChanged = false;
      let finalMessage = `Tag '${tag_to_remove}' not found on node or node had no tags. No changes made.`;

      if (currentNode.tags && currentNode.tags.includes(tag_to_remove)) {
        const newTags = currentNode.tags.filter(tag => tag !== tag_to_remove);

        // Handle empty array case for SQL: should be NULL or an empty array literal {}
        const dbTags = newTags.length > 0 ? newTags : null; // Or an empty array literal '{}' if your DB prefers

        const updateRes = await client.query(
          `UPDATE "Note"."nodes" SET tags = $1 WHERE id = $2`,
          [dbTags, nodeId]
        );

        if (updateRes.rowCount === 0) {
          // Should not happen due to FOR UPDATE lock and prior check
          await client.query('ROLLBACK');
          return res.status(500).json({ error: 'Failed to update node tags due to concurrent modification.' });
        }
        tagsChanged = true;
        finalMessage = `Tag '${tag_to_remove}' removed successfully from node '${currentNode.name}'.`;
      }

      await client.query('COMMIT');
      res.json({ success: true, message: finalMessage, tags_changed: tagsChanged, current_tags: tagsChanged ? (currentNode.tags.filter(tag => tag !== tag_to_remove)) : currentNode.tags });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to remove tag from node:', err);
      res.status(500).json({ error: 'Failed to remove tag', message: err.message });
    } finally {
      client.release();
    }
  });

  router.patch('/nodes/:id/type', async (req, res) => {
    const nodeId = parseInt(req.params.id, 10);
    // Destructure new flags from body, default to undefined if not provided
    const { newType, isPlayerCharacter, isPartyMember } = req.body;
    const client = await pool.connect(); // Acquire client
    const nodeA_ID = nodeId; // Renaming for clarity in merge logic (nodeId is NodeA_ID)
  
    try {
      await client.query('BEGIN'); // Start transaction

      // Get Node A's current name. We need this to find Node B.
      // Lock Node A for the duration of the transaction.
      const nodeARes = await client.query(
        `SELECT name FROM "Note"."nodes" WHERE id = $1 FOR UPDATE`,
        [nodeA_ID]
      );
      if (nodeARes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Node to update (Node A) not found.' });
      }
      const nodeA_Name = nodeARes.rows[0].name;

      // Check if Node B (target for merge) exists: same name (case-insensitive) as Node A, but with the newType.
      // Lock Node B as well if it exists.
      const nodeBRes = await client.query(`
        SELECT id FROM "Note"."nodes"
        WHERE id != $1
          AND LOWER(name) = LOWER($2)
          AND type = $3
        FOR UPDATE
      `, [nodeA_ID, nodeA_Name, newType]);
  
      if (nodeBRes.rows.length > 0) {
        // Node B exists, proceed with MERGE logic
        const nodeB_ID = nodeBRes.rows[0].id;

        // 1. Update Note.note_mentions
        // All mentions pointing to NodeA_ID should now point to NodeB_ID and have the newType
        await client.query(
          `UPDATE "Note"."note_mentions" SET node_id = $1, mention_type = $2 WHERE node_id = $3`,
          [nodeB_ID, newType, nodeA_ID]
        );

        // 2. Update Note.node_links (Source relationships: NodeA -> X  becomes NodeB -> X)
        // Get all targets linked from Node A
        const sourceLinksRes = await client.query(
            `SELECT target_node_id FROM "Note"."node_links" WHERE source_node_id = $1`,
            [nodeA_ID]
        );
        for (const row of sourceLinksRes.rows) {
            const target_node_id = row.target_node_id;
            // If target is Node B itself, this link will become a self-loop on Node B later, handle by delete self-loops
            if (target_node_id === nodeB_ID) continue;

            // Check if Node B already links to this target
            const existingLinkToTargetRes = await client.query(
                `SELECT 1 FROM "Note"."node_links" WHERE source_node_id = $1 AND target_node_id = $2`,
                [nodeB_ID, target_node_id]
            );
            if (existingLinkToTargetRes.rows.length > 0) {
                // Conflict: Node B already links to this target. Delete Node A's link.
                await client.query(
                    `DELETE FROM "Note"."node_links" WHERE source_node_id = $1 AND target_node_id = $2`,
                    [nodeA_ID, target_node_id]
                );
            }
        }
        // Update remaining source links from Node A to Node B
        await client.query(
          `UPDATE "Note"."node_links" SET source_node_id = $1 WHERE source_node_id = $2`,
          [nodeB_ID, nodeA_ID]
        );

        // 3. Update Note.node_links (Target relationships: X -> NodeA becomes X -> NodeB)
        // Get all sources linking to Node A
        const targetLinksRes = await client.query(
            `SELECT source_node_id FROM "Note"."node_links" WHERE target_node_id = $1`,
            [nodeA_ID]
        );
        for (const row of targetLinksRes.rows) {
            const source_node_id = row.source_node_id;
             // If source is Node B itself, this link will become a self-loop on Node B later, handle by delete self-loops
            if (source_node_id === nodeB_ID) continue;

            // Check if this source already links to Node B
            const existingLinkFromSourceRes = await client.query(
                `SELECT 1 FROM "Note"."node_links" WHERE source_node_id = $1 AND target_node_id = $2`,
                [source_node_id, nodeB_ID]
            );
            if (existingLinkFromSourceRes.rows.length > 0) {
                // Conflict: This source already links to Node B. Delete Node A's incoming link.
                await client.query(
                    `DELETE FROM "Note"."node_links" WHERE target_node_id = $1 AND source_node_id = $2`,
                    [nodeA_ID, source_node_id]
                );
            }
        }
        // Update remaining target links from Node A to Node B
        await client.query(
          `UPDATE "Note"."node_links" SET target_node_id = $1 WHERE target_node_id = $2`,
          [nodeB_ID, nodeA_ID]
        );

        // 4. Delete self-loops on Node B that might have been created
        await client.query(
          `DELETE FROM "Note"."node_links" WHERE source_node_id = $1 AND target_node_id = $1`,
          [nodeB_ID]
        );

        // Additional step: If NodeB (target of merge) is PERSON type, update its flags
        if (newType === 'PERSON') {
          await client.query(
            `UPDATE "Note"."nodes"
             SET is_player_character = $1, is_party_member = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [
              isPlayerCharacter === undefined ? false : !!isPlayerCharacter,
              isPartyMember === undefined ? false : !!isPartyMember,
              nodeB_ID
            ]
          );
        }
        // If newType is not PERSON, Node B's flags are presumed to be already FALSE or NULL.
        // If Node B was previously not PERSON and is now being "targeted" by a merge that implies it's PERSON,
        // this logic is correct. The newType IS Node B's type.

        // 5. Delete Node A
        await client.query(`DELETE FROM "Note"."nodes" WHERE id = $1`, [nodeA_ID]);

        await client.query('COMMIT');
        res.json({
            success: true,
            merged: true,
            target_node_id: nodeB_ID, // ID of the node NodeA was merged into
            message: `Node ${nodeA_Name} (ID: ${nodeA_ID}) type changed to ${newType} and merged into existing Node ID: ${nodeB_ID}.`
        });

      } else {
        // Node B does not exist, just UPDATE Node A's type
        let updateQuery = `UPDATE "Note"."nodes" SET type = $1, updated_at = CURRENT_TIMESTAMP`;
        const queryParams = [newType];
        let paramIdx = 2;

        if (newType === 'PERSON') {
          updateQuery += `, is_player_character = $${paramIdx++}, is_party_member = $${paramIdx++}`;
          queryParams.push(isPlayerCharacter === undefined ? false : !!isPlayerCharacter);
          queryParams.push(isPartyMember === undefined ? false : !!isPartyMember);
        } else {
          // If changing to a non-PERSON type, reset flags
          updateQuery += `, is_player_character = FALSE, is_party_member = FALSE`;
        }
        updateQuery += ` WHERE id = $${paramIdx}`;
        queryParams.push(nodeA_ID);

        const updateResult = await client.query(updateQuery, queryParams);

        if (updateResult.rowCount === 0) {
          // This case should ideally be caught by the initial fetch of Node A's name,
          // but as a safeguard if Node A was deleted between the name fetch and this update.
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Node not found for update.' });
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            merged: false,
            updated_node_id: nodeA_ID,
            message: "Node type updated successfully."
        });
      }
    } catch (err) {
      await client.query('ROLLBACK'); // Rollback on any error
      console.error('🔥 Failed to update node type / merge node:', err);
      res.status(500).json({ error: 'Failed to update node type / merge node', message: err.message });
    } finally {
      if (client) {
        client.release(); // Release client
      }
    }
  });
  

  // GET all notes that mention this node (and other nodes mentioned with it)
  router.get('/nodes/:id/mentions', async (req, res) => {
    const nodeId = parseInt(req.params.id, 10);
    if (isNaN(nodeId)) return res.status(400).json({ error: 'Invalid node ID' });
  
    try {
      const query = `
        WITH RankedMentions AS (
            SELECT
                m.id AS mention_id,
                m.note_id,
                n.content AS note_content,
                n.title AS note_title,
                m.node_id AS mentioned_node_id,
                m.mention_type,
                m.source,
                m.confidence,
                m.start_pos,
                m.end_pos,
                n.created_at AS note_created_at, -- Added for ordering
                -- Rank mentions of the specific node within each note to pick a representative one
                ROW_NUMBER() OVER (PARTITION BY m.note_id ORDER BY m.id ASC) as rn_in_note
            FROM "Note"."note_mentions" m
            JOIN "Note"."notes" n ON m.note_id = n.id
            WHERE m.node_id = $1 -- $1 is the nodeId for the NodePage
        ),
        NoteMentionCounts AS (
            SELECT
                note_id,
                COUNT(*) AS mention_count
            FROM RankedMentions -- Counts all mentions of this node in the note
            GROUP BY note_id
        )
        SELECT
            rm.note_id,
            rm.note_content,
            rm.note_title,
            rm.mention_id AS representative_mention_id,
            rm.mention_type AS representative_mention_type,
            rm.source AS representative_source,
            rm.confidence AS representative_confidence,
            rm.start_pos AS representative_start_pos,
            rm.end_pos AS representative_end_pos,
            rm.note_created_at, -- Pass through for ordering
            nmc.mention_count
        FROM RankedMentions rm
        JOIN NoteMentionCounts nmc ON rm.note_id = nmc.note_id
        WHERE rm.rn_in_note = 1 -- Selects only the first/representative mention per note
        ORDER BY rm.note_created_at DESC, rm.note_id DESC; -- Order notes by creation date
      `;
      const { rows } = await pool.query(query, [nodeId]);
  
      const resultsWithSnippets = rows.map(row => {
        const content = row.note_content || '';
        const start = row.representative_start_pos; // Use representative start/end
        const end = row.representative_end_pos;
        let snippet = '';
        const CONTEXT_CHARS = 50;

        if (typeof start === 'number' && typeof end === 'number' && start >= 0 && end >= start && end <= content.length) {
            const snippetStart = Math.max(0, start - CONTEXT_CHARS);
            const snippetEnd = Math.min(content.length, end + CONTEXT_CHARS);
            snippet = content.substring(snippetStart, snippetEnd);
            if (snippetStart > 0) snippet = "... " + snippet;
            if (snippetEnd < content.length) snippet = snippet + " ...";
        } else {
            snippet = content.substring(0, 100) + (content.length > 100 ? "..." : "");
        }
  
        return {
          // Keep all fields from the row, which are now structured per note
          // and include representative mention details and count
          ...row,
          id: row.representative_mention_id, // For keying and actions, use the ID of the representative mention
          snippet
        };
      });
  
      res.json(resultsWithSnippets);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch mentions', message: err.message });
    }
  });

  router.get('/nodes/by-name/:name', async (req, res) => {
    const name = req.params.name;
    try {
      const { rows } = await pool.query(
        `SELECT id, name, type, sub_type, description, source, tags, created_at, updated_at, is_player_character, is_party_member
         FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [name]
      );
      if (rows.length === 0) return res.status(404).json({}); // Return empty object for 404 as per existing logic
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch node' });
    }
  });

  return router;
};
