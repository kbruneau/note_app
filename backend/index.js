const app = require('./server'); // Import the configured app

const PORT = process.env.PORT || 4000;

// Check if the environment is not test before starting the server
// This prevents the server from starting during tests if index.js is inadvertently imported.
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app; // Optionally export app again if other non-test scripts might need it
                     // Though primarily 'server.js' should be the source for 'app'.
