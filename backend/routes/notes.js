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

  return router;
};
