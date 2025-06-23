const express = require('express');
const authenticateToken = require('../utils/authenticateToken'); // Assuming you have this middleware

module.exports = (pool) => {
  const router = express.Router();

  // Middleware to check if the node exists and if it's a player character
  // And if the user owns the note associated with this character (if applicable, though nodes are global)
  // For character sheets, we primarily care that the base node exists.
  // Ownership for character sheets could be tied to who created the PC node or a more complex system.
  // For now, let's assume if a user is authenticated, they can manage sheets for any PC node.
  // This might need refinement based on actual ownership/permission model.
  const checkNodeIsPC = async (req, res, next) => {
    const nodeId = parseInt(req.params.nodeId, 10);
    const userId = req.user ? req.user.userId : null; // Get userId from authenticated token if available

    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID format.' });
    }
    if (!userId) {
      // This should ideally be caught by authenticateToken middleware if it's applied before this,
      // but as a safeguard if this middleware is ever used without it.
      return res.status(401).json({ error: 'User not authenticated.' });
    }

    try {
      // Assumes "Note"."nodes" has a user_id column.
      // Check if node exists AND belongs to the user.
      const nodeRes = await pool.query(
        'SELECT id, is_player_character FROM "Note"."nodes" WHERE id = $1 AND user_id = $2',
        [nodeId, userId]
      );
      if (nodeRes.rows.length === 0) {
        return res.status(404).json({ error: 'Character node not found or not owned by user.' });
      }
      // Optional: Enforce that a sheet can only be for a PC.
      // if (nodeRes.rows[0].is_player_character !== true) {
      //   return res.status(403).json({ error: 'Character sheets can only be created for Player Characters.' });
      // }
      req.nodeId = nodeId; // Pass nodeId to the next handler
      next();
    } catch (err) {
      console.error('Error checking node:', err);
      return res.status(500).json({ error: 'Server error while checking node.' });
    }
  };

  // GET character sheet for a node
  router.get('/:nodeId/character-sheet', authenticateToken, checkNodeIsPC, async (req, res) => {
    const { nodeId } = req; // nodeId from checkNodeIsPC middleware
    const userId = req.user.userId; // Get userId from authenticated token

    if (!userId) {
      return res.status(403).json({ error: 'User ID not found in token.' });
    }

    try {
      // This query assumes "Note"."nodes" table has a user_id column.
      // It fetches the character sheet only if the associated node belongs to the user.
      const query = `
        SELECT
          cs.*,
          r.name AS race_name,
          b.name AS background_name
        FROM "Note"."character_sheets" cs
        JOIN "Note"."nodes" n ON cs.node_id = n.id
        LEFT JOIN "race"."races" r ON cs.race_id = r.id
        LEFT JOIN "background"."backgrounds" b ON cs.background_id = b.id
        WHERE cs.node_id = $1 AND n.user_id = $2
      `;
      const result = await pool.query(query, [nodeId, userId]);

      if (result.rows.length === 0) {
        // Could be no sheet, or node not found/not owned.
        // To differentiate, we can check node ownership first, but checkNodeIsPC doesn't do that yet.
        // For now, returning {} is consistent with "no sheet found for this user for this node".
        return res.status(200).json({});
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(`Error fetching character sheet for node ${nodeId}:`, err);
      res.status(500).json({ error: 'Failed to fetch character sheet', message: err.message });
    }
  });

  // PUT (Create/Update) character sheet for a node
  router.put('/:nodeId/character-sheet', authenticateToken, checkNodeIsPC, async (req, res) => {
    const { nodeId } = req; // nodeId from checkNodeIsPC middleware
    const userId = req.user.userId; // Get userId from authenticated token

    if (!userId) {
      return res.status(403).json({ error: 'User ID not found in token.' });
    }
    const {
      race_id, // Now expecting race_id
      main_class,
      level,
      background_id, // Now expecting background_id
      alignment,
      experience_points,
      player_name
    } = req.body;

    // Basic Validation
    if (level !== undefined && (typeof level !== 'number' || level < 0)) {
      return res.status(400).json({ error: 'Level must be a non-negative number.' });
    }
    if (experience_points !== undefined && (typeof experience_points !== 'number' || experience_points < 0)) {
      return res.status(400).json({ error: 'Experience points must be a non-negative number.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO "Note"."character_sheets"
          (node_id, race_id, main_class, level, background_id, alignment, experience_points, player_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (node_id) DO UPDATE SET
          race_id = EXCLUDED.race_id,
          main_class = EXCLUDED.main_class,
          level = EXCLUDED.level,
          background_id = EXCLUDED.background_id,
          alignment = EXCLUDED.alignment,
          experience_points = EXCLUDED.experience_points,
          player_name = EXCLUDED.player_name,
          updated_at = CURRENT_TIMESTAMP
         RETURNING *`, // Consider joining with race/background tables here too to return names
        [
          nodeId,
          race_id, // Use race_id
          main_class,
          level === undefined ? 1 : level,
          background_id, // Use background_id
          alignment,
          experience_points === undefined ? 0 : experience_points,
          player_name
        ]
      );
      // For consistency, the PUT response should ideally match the GET response structure.
      // Fetch the newly updated/inserted record with joins to get names.
      const savedSheetQuery = `
        SELECT
          cs.*,
          r.name AS race_name,
          b.name AS background_name
        FROM "Note"."character_sheets" cs
        LEFT JOIN "race"."races" r ON cs.race_id = r.id
        LEFT JOIN "background"."backgrounds" b ON cs.background_id = b.id
        WHERE cs.node_id = $1
      `;
      const savedSheetResult = await pool.query(savedSheetQuery, [nodeId]);
      res.status(200).json(savedSheetResult.rows[0]);
    } catch (err) {
      console.error(`Error saving character sheet for node ${nodeId}:`, err);
      res.status(500).json({ error: 'Failed to save character sheet', message: err.message });
    }
  });

  return router;
};
