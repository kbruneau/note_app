const request = require('supertest');
const app = require('../server'); // Adjust path if server.js is elsewhere
const pool = require('../db'); // Path to your db connection pool

describe('Auth API Endpoints', () => {
  let testUser = {
    username: 'testuser_auth',
    password: 'password123',
  };
  let createdUserId;

  // Clean up any existing test user before all tests
  beforeAll(async () => {
    try {
      await pool.query('DELETE FROM "Note"."users" WHERE username = $1', [testUser.username]);
    } catch (err) {
      console.error("Error in beforeAll cleanup:", err.message);
    }
  });

  // Clean up the created test user after all tests in this suite
  afterAll(async () => {
    try {
      if (createdUserId) {
        await pool.query('DELETE FROM "Note"."users" WHERE id = $1', [createdUserId]);
      } else {
        // Fallback if ID wasn't captured, try username again
        await pool.query('DELETE FROM "Note"."users" WHERE username = $1', [testUser.username]);
      }
    } catch (err) {
      console.error("Error in afterAll cleanup:", err.message);
    }
    pool.end(); // Close the pool connection
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: testUser.username,
          password: testUser.password,
        });

      expect(response.statusCode).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.username).toBe(testUser.username);
      createdUserId = response.body.user.id; // Save for cleanup
    });

    it('should fail to register an existing user', async () => {
      // First, ensure user is created (previous test should do this, but good to be sure or create another)
      // For simplicity, this test relies on the previous one having run and created testUser.username
      // A more robust approach might create a unique user for this specific test's pre-condition.
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: testUser.username, // Same username
          password: 'anotherpassword',
        });

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error', 'Username already exists');
    });

    it('should fail if username is missing', async () => {
        const response = await request(app)
            .post('/api/auth/register')
            .send({ password: 'password123' });
        expect(response.statusCode).toBe(400);
        expect(response.body).toHaveProperty('error', 'Username and password are required');
    });

    it('should fail if password is missing', async () => {
        const response = await request(app)
            .post('/api/auth/register')
            .send({ username: 'anotheruser_nopass' });
        expect(response.statusCode).toBe(400);
        expect(response.body).toHaveProperty('error', 'Username and password are required');
    });
  });

  describe('POST /api/auth/login', () => {
    // User should have been created by the registration test.
    // If tests are run independently or order changes, ensure user exists before login tests.
    // For robustness, a beforeEach could create the user for login tests if not using testUser from register.

    it('should login an existing user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password,
        });

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe(testUser.username);
    });

    it('should fail to login with incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword',
        });

      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });

    it('should fail to login a non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistentuser_auth',
          password: 'password123',
        });

      expect(response.statusCode).toBe(401);
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });
  });
});
