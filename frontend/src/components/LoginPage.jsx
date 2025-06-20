import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import './FormPages.css'; // Assuming a shared CSS file for form styling

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors

    if (!username.trim() || !password.trim()) {
      setError('Username and password cannot be empty.');
      return;
    }

    try {
      const response = await apiClient.post('/auth/login', { username, password });
      if (response.data && response.data.token) {
        localStorage.setItem('token', response.data.token);
        if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
        }
        navigate('/'); // Redirect to home page on successful login
      } else {
        setError('Login failed: No token received.');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        setError(err.response.data.error);
      } else {
        setError('Login failed. Please check your credentials or try again later.');
      }
      console.error('Login error:', err);
    }
  };

  return (
    <div className="form-page-container">
      <h2>Login</h2>
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
          <button type="submit">Login</button>
        </div>
      </form>
    </div>
  );
}

export default LoginPage;
