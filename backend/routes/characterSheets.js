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
    if (isNaN(nodeId)) {
      return res.status(400).json({ error: 'Invalid node ID format.' });
    }

    try {
      const nodeRes = await pool.query('SELECT id, is_player_character FROM "Note"."nodes" WHERE id = $1', [nodeId]);
      if (nodeRes.rows.length === 0) {
        return res.status(404).json({ error: 'Character node not found.' });
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
    try {
      const result = await pool.query(
        'SELECT * FROM "Note"."character_sheets" WHERE node_id = $1',
        [nodeId]
      );
      if (result.rows.length === 0) {
        // Return 200 with empty object if sheet not found, or 404 - depends on frontend expectation
        // For now, 200 with empty object might be simpler for frontend to handle "create if not exists"
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
    const {
      race,
      main_class, // Renamed from mainClass for consistency if desired, or keep as mainClass
      level,
      background,
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
          (node_id, race, main_class, level, background, alignment, experience_points, player_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (node_id) DO UPDATE SET
          race = EXCLUDED.race,
          main_class = EXCLUDED.main_class,
          level = EXCLUDED.level,
          background = EXCLUDED.background,
          alignment = EXCLUDED.alignment,
          experience_points = EXCLUDED.experience_points,
          player_name = EXCLUDED.player_name,
          updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          nodeId,
          race,
          main_class,
          level === undefined ? 1 : level, // Default level if not provided on create
          background,
          alignment,
          experience_points === undefined ? 0 : experience_points, // Default XP
          player_name
        ]
      );
      res.status(200).json(result.rows[0]); // Return 200 for update, could be 201 if always new
    } catch (err) {
      console.error(`Error saving character sheet for node ${nodeId}:`, err);
      res.status(500).json({ error: 'Failed to save character sheet', message: err.message });
    }
  });

  return router;
};
