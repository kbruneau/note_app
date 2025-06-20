import React, { useState } from 'react';
import apiClient from '../services/apiClient'; // Import apiClient
import { Link } from 'react-router-dom';

const NoteEntry = () => {
  const [title, setTitle] = useState(''); // Added title state
  const [note, setNote] = useState(''); // 'note' state is for content
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const submitNote = async () => {
    if (!note.trim()) return; // Content is still required
    setLoading(true);
    try {
      const payload = {
        content: note,
        title: title.trim() // Include title in payload
      };
      const res = await apiClient.post('/add-note', payload);
      setResponse(res.data); // res.data should contain { note: {id, title, content, ...}, nodes: [] }
      setNote('');
      setTitle(''); // Reset title field
    } catch (err) {
      console.error('Error saving note:', err);
      setResponse({ error: 'Failed to save note', message: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-page-container">
      <h2>Create New Session Note</h2> {/* Updated title for clarity */}
      <form onSubmit={(e) => { e.preventDefault(); submitNote(); }}> {/* Added form element */}
        <div className="form-group"> {/* Using form-group for consistency if styled elsewhere */}
          <label htmlFor="noteTitle">Title (Optional):</label>
          <input
            type="text"
            id="noteTitle"
            placeholder="Enter note title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            // Inherits global input styling
          />
        </div>
        <div className="form-group">
          <label htmlFor="noteContent">Content:</label>
          <textarea
            id="noteContent" // Added id for label
            rows={10} // Increased rows
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type your campaign note here..."
            required // Content is required
            // Inherits global textarea styling (removed inline style)
          />
        </div>
        <button type="submit" disabled={loading || !note.trim()} className="button">
          {loading ? 'Saving...' : 'Save Note'}
        </button>
      </form>

      {response && ( // Simplified response display
        <div className="tagged-entities-list">
          {response.error && <p style={{ color: 'red' }}>Error: {response.message || response.error}</p>}
          {response.success && response.note && (
            <>
              <h3>Note Created: {response.note.title || `Note #${response.note.id}`}</h3>
              <h4>Tagged Entities:</h4>
              {response.nodes?.length > 0 ? (
                response.nodes.map(n => (
                  <div key={n.id}>
                    <Link to={`/node/${n.id}`}>
                      {n.name} <small>({n.type})</small>
                    </Link>
                  </div>
                ))
              ) : (
                <p><em>No entities were automatically tagged in this note.</em></p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteEntry;
