const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  function rollDice(expr) {
    const match = expr.match(/^d(\d+)$/i);
    if (!match) return null;
    const sides = parseInt(match[1], 10);
    return Math.floor(Math.random() * sides) + 1;
  }

  router.get('/random-name', async (req, res) => {
    const { race, option } = req.query;
    if (!race || !option) {
      return res.status(400).json({ error: 'Missing "race" or "option" query param' });
    }

    try {
      const { rows: tables } = await pool.query(
        `SELECT * FROM "core"."name_tables" WHERE race_name = $1 AND option = $2`,
        [race, option]
      );

      if (tables.length === 0) return res.status(404).json({ error: 'Option not found' });

      const table = tables[0];
      const roll = rollDice(table.dice_expression);
      if (!roll) return res.status(400).json({ error: 'Invalid dice expression' });

      const { rows: names } = await pool.query(
        `SELECT name FROM "core"."names"
         WHERE name_table_id = $1 AND $2 BETWEEN min_roll AND max_roll
         LIMIT 1`,
        [table.id, roll]
      );

      if (names.length === 0) {
        return res.status(404).json({ error: `No name found for roll ${roll}` });
      }

      res.json({
        name: names[0].name,
        option: table.option,
        race: table.race_name,
        source: table.source,
        dice: table.dice_expression,
        roll: roll
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  });

  router.get('/name-options', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT race_name, option
        FROM "core"."name_tables"
        ORDER BY race_name, option
      `);
  
      // Group by race_name
      const grouped = {};
      for (const row of rows) {
        const race = row.race_name;
        const option = row.option;
        if (!grouped[race]) grouped[race] = [];
        grouped[race].push(option);
      }
  
      res.json(grouped);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch name options', message: err.message });
    }
  });

  return router;
};
