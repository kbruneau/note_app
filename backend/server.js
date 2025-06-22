require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Route modules
const randomNameRoutes = require('./routes/randomName')(pool);
const noteRoutes = require('./routes/notes')(pool);
const nodesRoutes = require('./routes/nodes')(pool);
const entitiesRoutes = require('./routes/entities')(pool);
const characterSheetsRouter = require('./routes/characterSheets')(pool); // Import new router
const coreDataRouter = require('./routes/coreData')(pool); // Import coreData router
const authRoutes = require('./routes/auth'); // exports router

// Register routes
app.use('/api', randomNameRoutes);
app.use('/api', noteRoutes);
app.use('/api', nodesRoutes);
app.use('/api', entitiesRoutes);
app.use('/api/nodes', characterSheetsRouter); // Mount for routes like /api/nodes/:nodeId/character-sheet
app.use('/api/core-data', coreDataRouter); // Mount coreData router
app.use('/api/auth', authRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'connected', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
