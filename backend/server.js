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
const authRoutes = require('./routes/auth'); // auth.js exports router directly

// Register routes
app.use('/api', randomNameRoutes);
app.use('/api', noteRoutes);
app.use('/api', nodesRoutes);
app.use('/api', entitiesRoutes);
app.use('/api/auth', authRoutes); // Register auth routes under /api/auth


// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'connected', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = app; // Export the app instance for testing
