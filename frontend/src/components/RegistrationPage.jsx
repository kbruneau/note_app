import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import './FormPages.css'; // Assuming a shared CSS file for form styling

function RegistrationPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors

    if (!username.trim() || !password.trim()) {
      setError('Please enter a username and password.');
      return;
    }

    try {
      await apiClient.post('/auth/register', { username, password });
      navigate('/login'); // Redirect to login page on successful registration
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error); // Keep specific backend errors
      } else {
        setError('Registration failed. Please try a different username or try again later.');
      }
      console.error('Registration error:', err);
    }
  };

  return (
    <div className="form-page-container">
      <h2>Create Your Account</h2>
      <form onSubmit={handleSubmit}>
        {error && <p className="error-message">{error}</p>}
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="button-row">
          <button type="submit">Register</button>
        </div>
      </form>
    </div>
  );
}

export default RegistrationPage;
