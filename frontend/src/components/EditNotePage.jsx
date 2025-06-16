import React, { useState, useEffect } from 'react';
import apiClient from '../services/apiClient'; // Import apiClient
import { useParams, useNavigate } from 'react-router-dom';

const EditNotePage = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNote = async () => {
      try {
        const response = await apiClient.get(`/notes/${id}`); // Use apiClient, relative URL
        setTitle(response.data.title);
        setContent(response.data.content);
      } catch (error) {
        console.error('Error fetching note:', error);
        // Handle error (e.g., show a message or redirect)
      }
    };
    fetchNote();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.put(`/notes/${id}`, { title, content }); // Use apiClient, relative URL
      navigate(`/notes/${id}`); // Or navigate to the notes list
    } catch (error) {
      console.error('Error updating note:', error);
      // Handle error (e.g., show a message)
    }
  };

  return (
    <div>
      <h2>Edit Note</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="title">Title:</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="content">Content:</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </div>
        <button type="submit">Save Changes</button>
        <button type="button" onClick={() => navigate(-1)}>Cancel</button>
      </form>
    </div>
  );
};

export default EditNotePage;
