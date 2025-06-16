require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  password: 'Paisley95',
  host: '32.220.174.183',
  port: 5432,
  database: 'dnd_app',
});

// Route modules
const randomNameRoutes = require('./routes/randomName')(pool);
const noteRoutes = require('./routes/notes')(pool);
const nodesRoutes = require('./routes/nodes')(pool);
const entitiesRoutes = require('./routes/entities')(pool);

// Register routes
app.use('/api', randomNameRoutes);
app.use('/api', noteRoutes);
app.use('/api', nodesRoutes);
app.use('/api', entitiesRoutes);


// Health check
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'connected', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
