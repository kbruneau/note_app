const request = require('supertest');
const app = require('../server');
const pool = require('../db');

describe('Notes API Endpoints', () => {
  let testUser = {
    username: 'testuser_notes_owner',
    password: 'password123',
    id: null,
    token: null,
  };

  let otherUser = {
    username: 'testuser_notes_other',
    password: 'password123',
    id: null,
    token: null,
  };

  // Helper function to register and login a user
  const setupUser = async (userData) => {
    // Register
    await request(app).post('/api/auth/register').send(userData);
    // Login
    const loginResponse = await request(app).post('/api/auth/login').send(userData);
    userData.token = loginResponse.body.token;
    userData.id = loginResponse.body.user.id;
  };

  beforeAll(async () => {
    // Clean up existing test users
    await pool.query('DELETE FROM "Note"."users" WHERE username = $1 OR username = $2', [testUser.username, otherUser.username]);

    // Setup primary test user
    await setupUser(testUser);
    // Setup another user for testing cross-user access
    await setupUser(otherUser);
  });

  afterAll(async () => {
    // Clean up users and their notes
    if (testUser.id) {
        await pool.query('DELETE FROM "Note"."notes" WHERE user_id = $1', [testUser.id]);
        await pool.query('DELETE FROM "Note"."users" WHERE id = $1', [testUser.id]);
    }
    if (otherUser.id) {
        await pool.query('DELETE FROM "Note"."notes" WHERE user_id = $1', [otherUser.id]);
        await pool.query('DELETE FROM "Note"."users" WHERE id = $1', [otherUser.id]);
    }
    pool.end();
  });

  describe('Authentication/Authorization for Notes', () => {
    it('should not allow access to GET /api/notes without a token', async () => {
      const response = await request(app).get('/api/notes');
      expect(response.statusCode).toBe(401);
    });

    it('should not allow access to POST /api/add-note without a token', async () => {
      const response = await request(app)
        .post('/api/add-note')
        .send({ title: 'Test Note', content: 'This is a test note.' });
      expect(response.statusCode).toBe(401);
    });

    it('should fetch notes for an authenticated user (testUser)', async () => {
      // Add a note for testUser first
      await request(app)
        .post('/api/add-note')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ title: 'User1 Note 1', content: 'Content for user 1 note 1' });

      const response = await request(app)
        .get('/api/notes')
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Check if the fetched notes belong to testUser (all of them should)
      response.body.forEach(note => {
        expect(note.user_id).toBe(testUser.id);
      });
      expect(response.body.some(note => note.title === 'User1 Note 1')).toBe(true);
    });
  });

  describe('CRUD Operations for Own Notes', () => {
    let createdNoteId;

    it('should allow a user to create a new note', async () => {
      const noteData = { title: 'My New Note', content: 'This is the content of my new note.' };
      const response = await request(app)
        .post('/api/add-note')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send(noteData);

      expect(response.statusCode).toBe(201); // Assuming 201 for successful creation from notes.js
      expect(response.body.note).toHaveProperty('id');
      expect(response.body.note.title).toBe(noteData.title);
      expect(response.body.note.content).toBe(noteData.content);
      expect(response.body.note.user_id).toBe(testUser.id);
      createdNoteId = response.body.note.id; // Save for later tests
    });

    it('should allow a user to update their own note', async () => {
      const updatedData = { title: 'Updated Note Title', content: 'Updated content.' };
      const response = await request(app)
        .put(`/api/notes/${createdNoteId}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send(updatedData);

      expect(response.statusCode).toBe(200); // Assuming 200 for successful update
      expect(response.body.note.title).toBe(updatedData.title);
      expect(response.body.note.content).toBe(updatedData.content);
    });

    it('should allow a user to delete their own note', async () => {
      const response = await request(app)
        .delete(`/api/notes/${createdNoteId}`)
        .set('Authorization', `Bearer ${testUser.token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify the note is actually deleted (optional: try to fetch it)
      const fetchResponse = await request(app)
        .get('/api/notes') // This fetches all notes for the user
        .set('Authorization', `Bearer ${testUser.token}`);
      expect(fetchResponse.body.find(note => note.id === createdNoteId)).toBeUndefined();
    });
  });

  describe('Cross-User Access Prevention', () => {
    let userANoteId;

    beforeAll(async () => {
      // User A (testUser) creates a note
      const noteResponse = await request(app)
        .post('/api/add-note')
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({ title: 'User A Private Note', content: 'This is a private note for User A.' });
      userANoteId = noteResponse.body.note.id;
    });

    it('should not allow User B to fetch User A\'s notes via GET /api/notes', async () => {
      // User B fetches their notes
      const response = await request(app)
        .get('/api/notes')
        .set('Authorization', `Bearer ${otherUser.token}`);

      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Crucially, User A's note should not be in User B's list
      const foundUserANote = response.body.find(note => note.id === userANoteId);
      expect(foundUserANote).toBeUndefined();
    });

    // Note: GET /api/notes/:id is not an existing endpoint, so we test update/delete directly.

    it('should not allow User B to update User A\'s note', async () => {
      const response = await request(app)
        .put(`/api/notes/${userANoteId}`)
        .set('Authorization', `Bearer ${otherUser.token}`)
        .send({ title: 'Attempted Update by User B', content: 'Malicious content' });

      expect(response.statusCode).toBe(403); // Or 404 if the check is "note not found for this user"
      expect(response.body).toHaveProperty('error');
    });

    it('should not allow User B to delete User A\'s note', async () => {
      const response = await request(app)
        .delete(`/api/notes/${userANoteId}`)
        .set('Authorization', `Bearer ${otherUser.token}`);

      expect(response.statusCode).toBe(403); // Or 404
      expect(response.body).toHaveProperty('error');

      // Verify User A's note still exists
      const verifyResponse = await request(app)
        .get('/api/notes')
        .set('Authorization', `Bearer ${testUser.token}`);
      expect(verifyResponse.body.find(note => note.id === userANoteId)).toBeDefined();
    });
  });
});
