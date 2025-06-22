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
        setTitle(response.data.title !== undefined ? response.data.title : ''); // Ensure graceful fallback for title
        setContent(response.data.content || ''); // Ensure graceful fallback for content
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
    <div className="form-page-container"> {/* Applied class */}
      <h2>Edit Your Note</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group"> {/* Added for spacing */}
          <label htmlFor="title">Title:</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="form-group"> {/* Added for spacing */}
          <label htmlFor="content">Content:</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        </div>
        <div className="button-row"> {/* Added for button alignment */}
          <button type="submit">Save Your Changes</button>
          <button type="button" className="button-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
};

export default EditNotePage;
