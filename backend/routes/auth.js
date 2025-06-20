const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db'); // Assuming db.js is in the backend root

const router = express.Router();

// Registration route (/register)
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if username already exists
    const userCheck = await pool.query('SELECT * FROM "Note"."users" WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash the password
    const saltRounds = 10; // Or use a value from environment variables
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert the new user
    const newUser = await pool.query(
      'INSERT INTO "Note"."users" (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, passwordHash]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error('Error during registration:', error);
    // More specific error handling based on error type could be added
    if (error.code === 'ECONNREFUSED') {
        return res.status(500).json({ error: 'Database connection refused. Please check backend .env file and ensure PostgreSQL is running.' });
    }
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login route (/login)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Query the user
    const userResult = await pool.query('SELECT * FROM "Note"."users" WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' }); // User not found
    }

    const user = userResult.rows[0];

    // Compare password with stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' }); // Password doesn't match
    }

    // Generate JWT
    const payload = {
      userId: user.id,
      username: user.username,
    };

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        console.error("JWT_SECRET is not defined in environment variables.");
        return res.status(500).json({ error: "Internal server error: JWT secret not configured." });
    }

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' }); // Token expires in 1 hour

    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Error during login:', error);
     if (error.code === 'ECONNREFUSED') {
        return res.status(500).json({ error: 'Database connection refused. Please check backend .env file and ensure PostgreSQL is running.' });
    }
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

module.exports = router;
