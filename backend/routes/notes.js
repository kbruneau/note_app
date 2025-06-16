const express = require('express');
// const { spawn } = require('child_process'); // Removed
// const path = require('path'); // Removed
const axios = require('axios'); // Added axios

module.exports = (pool) => {
  const router = express.Router();

  // Add a new note
  router.post('/add-note', async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Missing note content' });

    // The route does not seem to use explicit transactions for the initial note insert
    // in the provided code. If it did, client acquisition/release would be here.
    // For this subtask, we'll assume pool.query is acceptable for the initial insert,
    // or that a higher-level mechanism handles client management if this route were part of a larger transaction.

    let noteId;
    let createdAt;

    try {
      // Step 1: Insert the note into the database
      const noteInsertResult = await pool.query(
        `INSERT INTO "DM"."notes" (content) VALUES ($1) RETURNING id, created_at`,
        [content]
      );
      noteId = noteInsertResult.rows[0].id;
      createdAt = noteInsertResult.rows[0].created_at;

      // Step 2: Call the tagger service
      try {
        const taggerPayload = { note_id: noteId, text: content };
        const taggerServiceUrl = 'http://localhost:5001/tag'; // Tagger service URL
        const taggerResponse = await axios.post(taggerServiceUrl, taggerPayload);
        const taggedNodes = taggerResponse.data;

        return res.json({
          success: true,
          id: noteId,
          created_at: createdAt,
          nodes: taggedNodes
        });

      } catch (taggerError) {
        console.error('Error calling tagger service:', taggerError.message);
        // Note exists, but tagging failed. Respond with note details and error.
        // The client might want to inform the user that the note was saved but entities couldn't be auto-tagged.
        return res.status(500).json({
          error: 'Note saved, but tagging service failed.',
          message: taggerError.message,
          note_id: noteId,
          created_at: createdAt,
          tagger_error_details: taggerError.response ? taggerError.response.data : "No response data" // Include tagger's error if available
        });
      }

    } catch (dbError) {
      console.error('🔥 Database error in add-note:', dbError);
      // This catch block handles errors from the initial note insertion.
      if (!res.headersSent) {
        // Ensure a response is only sent if one hasn't been already (e.g., by tagger error handling)
        res.status(500).json({ error: 'Failed to save note', message: dbError.message });
      }
    }
    // No explicit client.release() here as pool.query handles it,
    // or client lifecycle is managed by a yet-to-be-implemented outer transaction scope.
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
    const client = await pool.connect(); // Acquire client

    try {
      // Start transaction for database operations
      await client.query('BEGIN');
      await client.query(`UPDATE "DM"."notes" SET content = $1 WHERE id = $2`, [content, id]);
      await client.query(`DELETE FROM "DM"."note_mentions" WHERE note_id = $1`, [id]);
      await client.query(`DELETE FROM "DM"."node_links" WHERE note_id = $1`, [id]);
      await client.query('COMMIT'); // Commit database changes before calling tagger

      // Now call the tagger service
      try {
        const taggerPayload = { note_id: id, text: content };
        const taggerServiceUrl = 'http://localhost:5001/tag';
        // We don't necessarily need the response data from the tagger for the client here,
        // but we wait for it to complete.
        await axios.post(taggerServiceUrl, taggerPayload);

        res.json({ success: true, message: "Note updated and retagged successfully." });

      } catch (taggerError) {
        console.error(`Error calling tagger service during note update for ID ${id}:`, taggerError.message);
        // Note was updated in the DB, but re-tagging failed.
        // It's important to still send a 2xx success for the DB update, but with an error message for tagging.
        // However, the client might interpret a 500 as a complete failure of the PUT.
        // A more nuanced approach could be a 207 Multi-Status, but for now, let's indicate primary success with a warning.
        // Or, as per instructions, a 500 but with success:true for the DB part.
        res.status(500).json({
          success: true, // Indicates DB update was fine
          error: 'Note updated, but re-tagging service failed.',
          message: taggerError.message,
          note_id: id,
          tagger_error_details: taggerError.response ? taggerError.response.data : "No response data"
        });
      }

    } catch (dbError) {
      // This catch block is for errors during the DB transaction (BEGIN, UPDATE, DELETEs, COMMIT)
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          console.error('🔥 Failed to rollback transaction:', rollbackErr);
        }
      }
      console.error(`🔥 Database error updating note ID ${id}:`, dbError);
      // Ensure a response is only sent if one hasn't been already (by tagger error handling, though less likely here)
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to update note', message: dbError.message });
      }
    } finally {
      if (client) {
        client.release(); // Release client in finally block
      }
    }
  });

  // Delete a note
  router.delete('/notes/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM "DM"."note_mentions" WHERE note_id = $1`, [id]);
      await client.query(`DELETE FROM "DM"."node_links" WHERE note_id = $1`, [id]);
      await client.query(`DELETE FROM "DM"."notes" WHERE id = $1`, [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to delete note:', err);
      res.status(500).json({ error: 'Failed to delete note', message: err.message });
    } finally {
      client.release();
    }
  });

  router.post('/manual-tag', async (req, res) => {
    const { name, type, note_id, start_pos, end_pos, tag } = req.body;
    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
      // Check if the node already exists
      const existing = await client.query(`
        SELECT id FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2
      `, [name, type]);
  
      let nodeId; // Renamed to avoid conflict with the note_id from req.body
      if (existing.rows.length > 0) {
        nodeId = existing.rows[0].id;
      } else {
        const insert = await client.query(`
          INSERT INTO "DM"."nodes" (name, type) VALUES ($1, $2) RETURNING id
        `, [name, type]);
        nodeId = insert.rows[0].id;
      }
  
      // Append tag only if it's a PERSON and not already tagged
      if (tag && type === 'PERSON') {
        await client.query(`
          UPDATE "DM"."nodes"
          SET tags = array_append(tags, $1)
          WHERE id = $2 AND NOT ($1 = ANY(tags))
        `, [tag, nodeId]);
      }
  
      // Create note mention
      await client.query(`
        INSERT INTO "DM"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type)
        VALUES ($1, $2, $3, $4, $5)
      `, [nodeId, note_id, start_pos, end_pos, type]); // Use note_id from req.body here
  
      await client.query('COMMIT');
      res.json({ success: true, node_id: nodeId, node: { name, type } }); // Return the actual nodeId used/created
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Manual tag error:', err);
      res.status(500).json({ error: 'Manual tag failed', message: err.message });
    } finally {
      client.release();
    }
  });

  // Correct a mention
  router.post('/mentions/:mentionId/correct', async (req, res) => {
    const { mentionId } = req.params;
    const {
      new_name_segment, // Optional: Corrected text of the mention
      new_type,         // Required: Corrected entity type
      note_id,          // Required: ID of the note containing this mention
      original_text_segment, // Required: Original text of the mention
      original_mention_type, // Required: Original type of the mention
      original_source,       // Optional: Original source from note_mentions
      original_confidence,   // Optional: Original confidence from note_mentions
      start_pos,        // Optional: New start position if span is corrected
      end_pos           // Optional: New end position if span is corrected
    } = req.body;

    if (!new_type || !note_id || !original_text_segment || !original_mention_type) {
      return res.status(400).json({
        error: 'Missing required fields: new_type, note_id, original_text_segment, original_mention_type are required.'
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const name_to_use = new_name_segment || original_text_segment;
      let final_node_id;

      // Step 1: Check if the target node (corrected name and type) exists or create it
      const existingNodeRes = await client.query(
        `SELECT id FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2`,
        [name_to_use, new_type]
      );

      if (existingNodeRes.rows.length > 0) {
        final_node_id = existingNodeRes.rows[0].id;
      } else {
        const newNodeRes = await client.query(
          `INSERT INTO "DM"."nodes" (name, type) VALUES ($1, $2) RETURNING id`,
          [name_to_use, new_type]
        );
        final_node_id = newNodeRes.rows[0].id;
      }

      // Step 2: Update the existing mention in DM.note_mentions
      // Determine which fields to update in note_mentions
      const updateFields = [];
      const updateValues = [];
      let paramCount = 1;

      updateFields.push(`node_id = $${paramCount++}`);
      updateValues.push(final_node_id);

      updateFields.push(`mention_type = $${paramCount++}`);
      updateValues.push(new_type);

      updateFields.push(`source = $${paramCount++}`);
      updateValues.push('USER_MODIFIED');

      updateFields.push(`confidence = $${paramCount++}`);
      updateValues.push(1.0);

      if (start_pos !== undefined && end_pos !== undefined) {
        updateFields.push(`start_pos = $${paramCount++}`);
        updateValues.push(start_pos);
        updateFields.push(`end_pos = $${paramCount++}`);
        updateValues.push(end_pos);
      }

      updateValues.push(mentionId); // For the WHERE clause

      const updateMentionQuery = `
        UPDATE "DM"."note_mentions"
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *;
      `;

      const updatedMentionRes = await client.query(updateMentionQuery, updateValues);
      if (updatedMentionRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mention not found or not updated.' });
      }

      // Step 3: Log the correction
      await client.query(
        `INSERT INTO "DM"."tagging_corrections" (
          note_id, mention_id, original_text_segment, original_mention_type,
          original_source, original_confidence, corrected_text_segment,
          corrected_mention_type, correction_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          note_id, mentionId, original_text_segment, original_mention_type,
          original_source, original_confidence, name_to_use,
          new_type, 'MODIFY'
        ]
      );

      await client.query('COMMIT');
      res.json({
        success: true,
        message: "Mention updated successfully",
        updated_mention: updatedMentionRes.rows[0]
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to correct mention:', err);
      res.status(500).json({ error: 'Failed to correct mention', message: err.message });
    } finally {
      client.release();
    }
  });

  // Add a new mention to a note
  router.post('/notes/:noteId/mentions/add', async (req, res) => {
    const { noteId: note_id_param } = req.params; // note_id from URL
    const noteId = parseInt(note_id_param, 10);

    const {
      name_segment, // Required: Text of the new mention
      type,         // Required: Entity type for the new mention
      start_pos,    // Required: Start position
      end_pos       // Required: End position
    } = req.body;

    if (!name_segment || !type || start_pos === undefined || end_pos === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name_segment, type, start_pos, end_pos are required.'
      });
    }
    if (isNaN(noteId)) {
        return res.status(400).json({ error: 'Invalid noteId parameter.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let final_node_id;

      // Step 1: Find or create node in DM.nodes
      const existingNodeRes = await client.query(
        `SELECT id FROM "DM"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2`,
        [name_segment, type]
      );

      if (existingNodeRes.rows.length > 0) {
        final_node_id = existingNodeRes.rows[0].id;
      } else {
        const newNodeRes = await client.query(
          `INSERT INTO "DM"."nodes" (name, type) VALUES ($1, $2) RETURNING id`,
          [name_segment, type]
        );
        final_node_id = newNodeRes.rows[0].id;
      }

      // Step 2: Insert into DM.note_mentions
      const newMentionRes = await client.query(
        `INSERT INTO "DM"."note_mentions" (
          node_id, note_id, start_pos, end_pos, mention_type, source, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`, // Return the newly created mention
        [final_node_id, noteId, start_pos, end_pos, type, 'USER_ADDED', 1.0]
      );
      const new_mention_record = newMentionRes.rows[0];
      const new_mention_id = new_mention_record.id;

      // Step 3: Log to DM.tagging_corrections
      await client.query(
        `INSERT INTO "DM"."tagging_corrections" (
          note_id, mention_id, original_text_segment, original_mention_type,
          original_source, original_confidence, corrected_text_segment,
          corrected_mention_type, correction_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          noteId, new_mention_id, name_segment, null, // original_mention_type is null for new adds
          null, null, // original_source & original_confidence are null
          name_segment, type, 'ADD_TAG'
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        message: "Mention added successfully",
        new_mention: new_mention_record
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to add new mention:', err);
      res.status(500).json({ error: 'Failed to add new mention', message: err.message });
    } finally {
      client.release();
    }
  });

  // Delete a mention
  router.delete('/mentions/:mentionId', async (req, res) => {
    const { mentionId: mention_id_param } = req.params;
    const mentionId = parseInt(mention_id_param, 10);

    // Optional request body parameters for more complete logging, though fetching is preferred.
    const {
        note_id: body_note_id,
        original_text_segment: body_text_segment,
        original_mention_type: body_mention_type,
        original_source: body_source,
        original_confidence: body_confidence
    } = req.body;

    if (isNaN(mentionId)) {
      return res.status(400).json({ error: 'Invalid mentionId parameter.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Fetch Mention Details (Before Deleting)
      const mentionDetailsRes = await client.query(
        `SELECT m.note_id, m.start_pos, m.end_pos, m.mention_type, m.source, m.confidence, n.name AS node_name
         FROM "DM"."note_mentions" m
         JOIN "DM"."nodes" n ON m.node_id = n.id
         WHERE m.id = $1`,
        [mentionId]
      );

      if (mentionDetailsRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mention not found.' });
      }
      const fetchedMention = mentionDetailsRes.rows[0];

      const note_id_to_log = body_note_id !== undefined ? body_note_id : fetchedMention.note_id;
      const text_to_log = body_text_segment || fetchedMention.node_name; // Prefer body if provided, else fetched node name
      const type_to_log = body_mention_type || fetchedMention.mention_type;
      const source_to_log = body_source !== undefined ? body_source : fetchedMention.source;
      const confidence_to_log = body_confidence !== undefined ? body_confidence : fetchedMention.confidence;


      // Step 2: Log to DM.tagging_corrections
      await client.query(
        `INSERT INTO "DM"."tagging_corrections" (
          note_id, mention_id, original_text_segment, original_mention_type,
          original_source, original_confidence, corrected_text_segment,
          corrected_mention_type, correction_action
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          note_id_to_log, mentionId, text_to_log, type_to_log,
          source_to_log, confidence_to_log, null, // corrected_text_segment is null for delete
          null, 'DELETE_TAG' // corrected_mention_type is null
        ]
      );

      // Step 3: Delete from DM.note_mentions
      const deleteMentionRes = await client.query(
        `DELETE FROM "DM"."note_mentions" WHERE id = $1`,
        [mentionId]
      );

      // This check is technically redundant if the fetch succeeded, but good for safety.
      if (deleteMentionRes.rowCount === 0) {
        await client.query('ROLLBACK');
        // Should have been caught by the fetch, but as a safeguard:
        return res.status(404).json({ error: 'Mention not found for deletion (race condition or inconsistency).' });
      }

      await client.query('COMMIT');
      res.json({ success: true, message: "Mention deleted successfully" });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to delete mention:', err);
      res.status(500).json({ error: 'Failed to delete mention', message: err.message });
    } finally {
      client.release();
    }
  });

  return router;
};
