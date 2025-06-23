const express = require('express');
// const jwt = require('jsonwebtoken'); // No longer needed here directly
const authenticateToken = require('../utils/authenticateToken'); // Import shared middleware
// const { spawn } = require('child_process'); // Removed
// const path = require('path'); // Removed
const axios = require('axios'); // Added axios

// // Middleware to authenticate JWT - MOVED to utils/authenticateToken.js
// const authenticateToken = (req, res, next) => {
//   ...
// };

module.exports = (pool) => {
  const router = express.Router();

  // Helper function to check note ownership
  const checkNoteOwnership = async (noteId, userId) => {
    if (isNaN(parseInt(noteId, 10))) { // Ensure noteId is a number before querying
        return { error: 'Invalid Note ID format.', status: 400 };
    }
    const result = await pool.query('SELECT user_id FROM "Note"."notes" WHERE id = $1', [noteId]);
    if (result.rows.length === 0) {
      return { error: 'Note not found.', status: 404 };
    }
    if (result.rows[0].user_id !== userId) {
      return { error: 'Forbidden: You do not own this note.', status: 403 };
    }
    return { authorized: true };
  };

  // Add a new note
  router.post('/add-note', authenticateToken, async (req, res) => {
    const { content, title } = req.body; // Add title to destructuring
    const userId = req.user.userId; // Extract user_id from authenticated user

    if (!content) return res.status(400).json({ error: 'Missing note content' });
    if (!userId) return res.status(400).json({ error: 'User ID not found in token' });


    // Using a client for explicit transaction for note insert
    const client = await pool.connect();
    let newNote;

    try {
      await client.query('BEGIN');
      // Step 1: Insert the note into the database, including title and user_id
      const noteInsertResult = await client.query(
        `INSERT INTO "Note"."notes" (content, title, user_id) VALUES ($1, $2, $3) RETURNING id, title, content, created_at, user_id`,
        [content, title || null, userId] // Use title or null if not provided
      );
      newNote = noteInsertResult.rows[0];
      await client.query('COMMIT');
    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error('🔥 Database error in add-note (initial insert):', dbError);
      return res.status(500).json({ error: 'Failed to save note', message: dbError.message });
    } finally {
      client.release();
    }

    // Step 2: Call the tagger service (outside the initial DB transaction for note creation)
    try {
      // Use newNote.content and newNote.id for consistency, as title is now part of newNote
      const taggerPayload = {
        note_id: newNote.id,
        text: newNote.content,
        user_id: userId // Add user_id to the payload for the tagger service
      };
      const taggerServiceUrl = 'http://localhost:5001/tag';
      const taggerResponse = await axios.post(taggerServiceUrl, taggerPayload);
      const taggedNodes = taggerResponse.data;

      return res.status(201).json({ // Return 201 for successful creation
        success: true,
        note: newNote, // Return the full new note object
        nodes: taggedNodes // Keep tagged nodes if frontend uses them
      });

    } catch (taggerError) {
      console.error('Error calling tagger service:', taggerError.message);
      return res.status(500).json({
        success: true, // Note was created
        note: newNote, // Return created note
        error: 'Note saved, but tagging service failed.',
        message: taggerError.message,
        tagger_error_details: taggerError.response ? taggerError.response.data : "No response data"
        });
        res.status(500).json({ error: 'Failed to save note', message: dbError.message });
      }
    // client for tagger service call is managed by axios
  });

  // Get all notes for the authenticated user
  router.get('/notes', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    if (!userId) return res.status(400).json({ error: 'User ID not found in token' });

    try {
      const { rows } = await pool.query(`
        SELECT id, title, content, created_at, user_id
        FROM "Note"."notes"
        WHERE user_id = $1
        ORDER BY created_at DESC
      `, [userId]);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch notes', message: err.message });
    }
  });

  // Update a note
  router.put('/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const noteId = parseInt(id, 10);
    const { content, title } = req.body; // Add title
    const userId = req.user.userId; // Get user ID from token

    if (isNaN(noteId)) {
      return res.status(400).json({ error: 'Invalid note ID.' });
    }
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' }); // Or 401

    // Ensure at least one field is being updated
    if (content === undefined && title === undefined) {
      return res.status(400).json({ error: 'No fields provided for update. Send at least title or content.' });
    }

    const client = await pool.connect();
    let updatedNoteContentForTagger = content; // Default to new content if provided

    try {
      await client.query('BEGIN');

      // Dynamically build the SET clause
      const setClauses = [];
      const queryParams = [];
      let paramIndex = 1;

      if (title !== undefined) { // Allows setting title to null or empty string explicitly
        setClauses.push(`title = $${paramIndex++}`);
        queryParams.push(title);
      }
      if (content !== undefined) {
        setClauses.push(`content = $${paramIndex++}`);
        queryParams.push(content);
      }

      // Add noteId and userId for the WHERE clause
      queryParams.push(noteId);
      queryParams.push(userId);

      if (setClauses.length === 0) {
         // Should be caught by the undefined check above, but as a safeguard
        await client.query('ROLLBACK'); // No actual changes to make
        client.release();
        return res.status(400).json({ error: "No content or title provided for update." });
      }

      const updateQuery = `UPDATE "Note"."notes" SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, title, content, created_at, updated_at;`;

      const updateResult = await client.query(updateQuery, queryParams);

      if (updateResult.rowCount === 0) {
        // Check if the note exists at all, to differentiate between 404 and 403
        const noteExistsResult = await client.query('SELECT id FROM "Note"."notes" WHERE id = $1', [noteId]);
        await client.query('ROLLBACK');
        client.release();
        if (noteExistsResult.rowCount === 0) {
          return res.status(404).json({ error: 'Note not found.' });
        } else {
          return res.status(403).json({ error: 'Forbidden: You do not own this note or no changes were made.' });
        }
      }

      const updatedNoteFromDB = updateResult.rows[0];
      updatedNoteContentForTagger = updatedNoteFromDB.content; // Use the actual content from DB for tagger

      // Clear existing mentions and links as content/context might have changed
      await client.query(`DELETE FROM "Note"."note_mentions" WHERE note_id = $1`, [noteId]);
      await client.query(`DELETE FROM "Note"."node_links" WHERE note_id = $1`, [noteId]);

      await client.query('COMMIT');

      // Call tagger service after successful DB update
      try {
        const taggerPayload = {
          note_id: noteId,
          text: updatedNoteContentForTagger,
          user_id: userId // Add user_id to the payload for the tagger service
        };
        const taggerServiceUrl = 'http://localhost:5001/tag';
        const taggerResponse = await axios.post(taggerServiceUrl, taggerPayload);

        res.json({
          success: true,
          message: "Note updated and retagged successfully.",
          note: updatedNoteFromDB, // Send back the fully updated note
          nodes: taggerResponse.data // Send back new tags
        });

      } catch (taggerError) {
        console.error(`Error calling tagger service during note update for ID ${noteId}:`, taggerError.message);
        res.status(500).json({
          success: true, // DB update was successful
          note: updatedNoteFromDB,
          error: 'Note updated, but re-tagging service failed.',
          message: taggerError.message,
          tagger_error_details: taggerError.response ? taggerError.response.data : "No response data"
        });
      }

    } catch (dbError) {
      await client.query('ROLLBACK');
      console.error(`🔥 Database error updating note ID ${noteId}:`, dbError);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to update note', message: dbError.message });
      }
    } finally {
      client.release();
    }
  });

  // Delete a note
  router.delete('/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const noteId = parseInt(id, 10);
    const userId = req.user.userId;

    if (isNaN(noteId)) {
      return res.status(400).json({ error: 'Invalid note ID.' });
    }
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // It's generally safe to delete related data first if the final note deletion is conditional on user_id.
      // If the note doesn't belong to the user, these deletes won't do harm if note_id is globally unique.
      // However, for strictness, one might fetch note's user_id first.
      await client.query(`DELETE FROM "Note"."note_mentions" WHERE note_id = $1`, [noteId]);
      await client.query(`DELETE FROM "Note"."node_links" WHERE note_id = $1`, [noteId]);

      const deleteResult = await client.query(
        `DELETE FROM "Note"."notes" WHERE id = $1 AND user_id = $2`,
        [noteId, userId]
      );

      if (deleteResult.rowCount === 0) {
        // Check if the note existed at all to return 404 or 403
        const noteExistsResult = await client.query('SELECT id FROM "Note"."notes" WHERE id = $1', [noteId]);
        await client.query('ROLLBACK');
        if (noteExistsResult.rowCount === 0) {
          return res.status(404).json({ error: 'Note not found.' });
        } else {
          return res.status(403).json({ error: 'Forbidden: You do not own this note.' });
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, message: 'Note deleted successfully.' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to delete note:', err);
      res.status(500).json({ error: 'Failed to delete note', message: err.message });
    } finally {
      client.release();
    }
  });

  router.post('/manual-tag', authenticateToken, async (req, res) => {
    const { name, type, note_id, start_pos, end_pos, tag } = req.body;
    const userId = req.user.userId;

    if (!note_id) {
      return res.status(400).json({ error: 'note_id is required in the request body.' });
    }
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });


    const ownership = await checkNoteOwnership(note_id, userId);
    if (!ownership.authorized) {
      return res.status(ownership.status).json({ error: ownership.error });
    }

    const client = await pool.connect();
  
    try {
      await client.query('BEGIN');
      // Check if the node already exists for this user
      // Assumes "Note"."nodes" has user_id column
      const existing = await client.query(`
        SELECT id FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 AND user_id = $3
      `, [name, type, userId]);
  
      let nodeId;
      if (existing.rows.length > 0) {
        nodeId = existing.rows[0].id;
      } else {
        // Assumes "Note"."nodes" has user_id column
        const insert = await client.query(`
          INSERT INTO "Note"."nodes" (name, type, user_id) VALUES ($1, $2, $3) RETURNING id
        `, [name, type, userId]);
        nodeId = insert.rows[0].id;
      }
  
      // Append tag only if it's a PERSON and not already tagged, and user owns the node
      // Assumes "Note"."nodes" has user_id column
      if (tag && type === 'PERSON') {
        await client.query(`
          UPDATE "Note"."nodes"
          SET tags = array_append(tags, $1)
          WHERE id = $2 AND user_id = $3 AND NOT ($1 = ANY(tags))
        `, [tag, nodeId, userId]);
      }
  
      // Create note mention
      await client.query(`
        INSERT INTO "Note"."note_mentions" (node_id, note_id, start_pos, end_pos, mention_type)
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
  router.post('/mentions/:mentionId/correct', authenticateToken, async (req, res) => {
    const { mentionId } = req.params;
    const userId = req.user.userId;
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
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });

    const ownership = await checkNoteOwnership(note_id, userId);
    if (!ownership.authorized) {
      return res.status(ownership.status).json({ error: ownership.error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const name_to_use = new_name_segment || original_text_segment;
      let final_node_id;

      // Step 1: Check if the target node (corrected name and type) exists for this user, or create it for this user
      // Assumes "Note"."nodes" has user_id column
      const existingNodeRes = await client.query(
        `SELECT id FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 AND user_id = $3`,
        [name_to_use, new_type, userId]
      );

      if (existingNodeRes.rows.length > 0) {
        final_node_id = existingNodeRes.rows[0].id;
        // Potentially update flags if it's a PERSON node, though this endpoint is primarily for mention correction.
        // For simplicity, assuming node flags are managed elsewhere or by the add-mention logic if this creates a new effective mention.
      } else {
        // Assumes "Note"."nodes" has user_id column
        const newNodeRes = await client.query(
          `INSERT INTO "Note"."nodes" (name, type, user_id) VALUES ($1, $2, $3) RETURNING id`,
          [name_to_use, new_type, userId]
        );
        final_node_id = newNodeRes.rows[0].id;
      }

      // Step 2: Update the existing mention in Note.note_mentions
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
        UPDATE "Note"."note_mentions"
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
        `INSERT INTO "Note"."tagging_corrections" (
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
  router.post('/notes/:noteId/mentions/add', authenticateToken, async (req, res) => {
    const { noteId: note_id_param } = req.params; // note_id from URL
    const noteId = parseInt(note_id_param, 10);
    const userId = req.user.userId;

    const {
      name_segment, // Required: Text of the new mention
      type,         // Required: Entity type for the new mention
      start_pos,    // Required: Start position
      end_pos,      // Required: End position
      isPlayerCharacter, // Optional: For PERSON type
      isPartyMember      // Optional: For PERSON type
    } = req.body;

    if (!name_segment || !type || start_pos === undefined || end_pos === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name_segment, type, start_pos, end_pos are required.'
      });
    }
    if (isNaN(noteId)) {
        return res.status(400).json({ error: 'Invalid noteId parameter.' });
    }
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });

    const ownership = await checkNoteOwnership(noteId, userId); // noteId from params
    if (!ownership.authorized) {
      return res.status(ownership.status).json({ error: ownership.error });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let final_node_id;

      // Step 1: Find or create node in Note.nodes for the current user
      // Assumes "Note"."nodes" has user_id column
      const existingNodeRes = await client.query(
        `SELECT id, is_player_character, is_party_member FROM "Note"."nodes" WHERE LOWER(name) = LOWER($1) AND type = $2 AND user_id = $3`,
        [name_segment, type, userId]
      );

      if (existingNodeRes.rows.length > 0) {
        final_node_id = existingNodeRes.rows[0].id;
        const existingNode = existingNodeRes.rows[0];
        // If node exists and is PERSON, update its flags if new values are provided and different
        // This ensures that adding a mention can also correctly flag a character
        if (type === 'PERSON') {
          const newIsPC = isPlayerCharacter !== undefined ? !!isPlayerCharacter : existingNode.is_player_character;
          const newIsPM = isPartyMember !== undefined ? !!isPartyMember : existingNode.is_party_member;

          if (newIsPC !== existingNode.is_player_character || newIsPM !== existingNode.is_party_member) {
            await client.query(
              `UPDATE "Note"."nodes" SET
                is_player_character = $1,
                is_party_member = $2,
                updated_at = CURRENT_TIMESTAMP
               WHERE id = $3 AND user_id = $4`, // Ensure user owns the node being updated
              [newIsPC, newIsPM, final_node_id, userId]
            );
          }
        }
      } else {
        // Node does not exist for this user, create it
        // Assumes "Note"."nodes" has user_id column
        let insertQuery = `INSERT INTO "Note"."nodes" (name, type, user_id, is_player_character, is_party_member) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
        let queryParams = [
          name_segment,
          type,
          userId,
          type === 'PERSON' ? !!isPlayerCharacter : false,
          type === 'PERSON' ? !!isPartyMember : false
        ];
        const newNodeRes = await client.query(insertQuery, queryParams);
        final_node_id = newNodeRes.rows[0].id;
      }

      // Step 2: Insert into Note.note_mentions
      const newMentionRes = await client.query(
        `INSERT INTO "Note"."note_mentions" (
          node_id, note_id, start_pos, end_pos, mention_type, source, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (note_id, node_id, start_pos, end_pos) DO NOTHING
        RETURNING *`, // Return the newly created mention or existing if conflict and DO UPDATE was used
        [final_node_id, noteId, start_pos, end_pos, type, 'USER_ADDED', 1.0]
      );

      // If ON CONFLICT DO NOTHING, newMentionRes.rows might be empty if there was a conflict.
      // We need to fetch the mention if it already existed or was just inserted.
      let final_mention_record;
      if (newMentionRes.rows.length > 0) {
        final_mention_record = newMentionRes.rows[0];
      } else {
        // Conflict occurred, row was not inserted. Fetch the existing one.
        const existingMentionRes = await client.query(
          `SELECT * FROM "Note"."note_mentions"
           WHERE note_id = $1 AND node_id = $2 AND start_pos = $3 AND end_pos = $4`,
          [noteId, final_node_id, start_pos, end_pos]
        );
        if (existingMentionRes.rows.length > 0) {
          final_mention_record = existingMentionRes.rows[0];
        } else {
          // This case should be rare: conflict prevented insert, but then select failed.
          // Could happen if another transaction deleted it in between.
          await client.query('ROLLBACK');
          return res.status(500).json({ error: "Failed to retrieve mention after ON CONFLICT clause." });
        }
      }
      const new_mention_id = final_mention_record.id;

      // Step 3: Log to Note.tagging_corrections
      await client.query(
        `INSERT INTO "Note"."tagging_corrections" (
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
        new_mention: final_mention_record // Corrected variable name
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
  router.delete('/mentions/:mentionId', authenticateToken, async (req, res) => {
    const { mentionId: mention_id_param } = req.params;
    const mentionId = parseInt(mention_id_param, 10);
    const userId = req.user.userId;

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
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Fetch Mention Details (Before Deleting) including note_id
      const mentionDetailsRes = await client.query(
        `SELECT m.note_id, m.start_pos, m.end_pos, m.mention_type, m.source, m.confidence, n.name AS node_name
         FROM "Note"."note_mentions" m
         JOIN "Note"."nodes" n ON m.node_id = n.id
         WHERE m.id = $1`,
        [mentionId]
      );

      if (mentionDetailsRes.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release(); // Release client before early return
        return res.status(404).json({ error: 'Mention not found.' });
      }
      const fetchedMention = mentionDetailsRes.rows[0];
      const note_id_of_mention = fetchedMention.note_id;

      // Step 1.5: Check ownership of the note
      const ownership = await checkNoteOwnership(note_id_of_mention, userId);
      if (!ownership.authorized) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(ownership.status).json({ error: ownership.error });
      }

      const note_id_to_log = body_note_id !== undefined ? body_note_id : fetchedMention.note_id;
      const text_to_log = body_text_segment || fetchedMention.node_name; // Prefer body if provided, else fetched node name
      const type_to_log = body_mention_type || fetchedMention.mention_type;
      const source_to_log = body_source !== undefined ? body_source : fetchedMention.source;
      const confidence_to_log = body_confidence !== undefined ? body_confidence : fetchedMention.confidence;


      // Step 2: Log to Note.tagging_corrections
      await client.query(
        `INSERT INTO "Note"."tagging_corrections" (
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

      // Step 3: Delete from Note.note_mentions
      const deleteMentionRes = await client.query(
        `DELETE FROM "Note"."note_mentions" WHERE id = $1`,
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

  // Confirm an existing mention
  router.post('/mentions/:mentionId/confirm', authenticateToken, async (req, res) => {
    const { mentionId: mentionIdParam } = req.params;
    const mentionId = parseInt(mentionIdParam, 10);
    const userId = req.user.userId;

    if (isNaN(mentionId)) {
      return res.status(400).json({ error: 'Invalid mentionId parameter.' });
    }
    if (!userId) return res.status(403).json({ error: 'User ID not found in token.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Step 1: Fetch current mention and its node's name, and lock the mention row
      const originalMentionRes = await client.query(
        `SELECT
            m.id, m.note_id, m.node_id, m.start_pos, m.end_pos, m.mention_type,
            m.source AS original_source, m.confidence AS original_confidence,
            n.name AS node_name
         FROM "Note"."note_mentions" m
         JOIN "Note"."nodes" n ON m.node_id = n.id
         WHERE m.id = $1
         FOR UPDATE OF m;`,
        [mentionId]
      );

      if (originalMentionRes.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release(); // Release client
        return res.status(404).json({ error: 'Mention not found.' });
      }
      const originalMention = originalMentionRes.rows[0];
      const note_id_of_mention = originalMention.note_id;

      // Step 1.5: Check ownership of the note
      const ownership = await checkNoteOwnership(note_id_of_mention, userId);
      if (!ownership.authorized) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(ownership.status).json({ error: ownership.error });
      }

      // Step 2: Update the mention's source and confidence
      const updatedMentionRes = await client.query(
        `UPDATE "Note"."note_mentions"
         SET source = $1, confidence = $2
         WHERE id = $3
         RETURNING *;`,
        ['USER_CONFIRMED', 1.0, mentionId]
      );

      if (updatedMentionRes.rowCount === 0) {
        // Should not happen if the FOR UPDATE lock worked and the row existed
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Mention not found for update (concurrent modification issue?).' });
      }
      const updatedMention = updatedMentionRes.rows[0];

      // Step 3: Log to Note.tagging_corrections
      await client.query(
        `INSERT INTO "Note"."tagging_corrections"
          (note_id, mention_id, original_text_segment, original_mention_type,
          original_source, original_confidence, corrected_text_segment,
          corrected_mention_type, correction_action, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP);`,
        [
          originalMention.note_id,
          mentionId,
          originalMention.node_name, // original_text_segment
          originalMention.mention_type, // original_mention_type
          originalMention.original_source,
          originalMention.original_confidence,
          originalMention.node_name, // corrected_text_segment (not changed)
          originalMention.mention_type, // corrected_mention_type (not changed)
          'CONFIRM_TAG', // correction_action
          userId // user_id from token
        ]
      );

      await client.query('COMMIT');
      res.json({
        success: true,
        message: "Mention confirmed successfully",
        // Combine updated mention fields with the original node_name for a complete response object
        updated_mention: {
          ...updatedMention,
          node_name: originalMention.node_name
        }
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('🔥 Failed to confirm mention:', err);
      res.status(500).json({ error: 'Failed to confirm mention', message: err.message });
    } finally {
      client.release();
    }
  });

  return router;
};
