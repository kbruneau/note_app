import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const NoteEntry = () => {
  const [note, setNote] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const submitNote = async () => {
    if (!note.trim()) return;
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:4000/api/add-note', { content: note });
      setResponse(res.data);
      setNote('');
    } catch (err) {
      console.error('Error saving note:', err);
      setResponse({ error: 'Failed to save note' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Session Notes</h2>
      <textarea
        rows={5}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Type your campaign note here..."
        style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
      />
      <button onClick={submitNote} disabled={loading || !note.trim()}>
        {loading ? 'Saving...' : 'Save Note'}
      </button>

      {response?.success && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Tagged Entities</h3>
          {response.nodes?.length > 0 ? (
            response.nodes.map(n => (
              <div key={n.id}>
                <Link to={`/node/${n.id}`}>
                  {n.name} <small>({n.type})</small>
                </Link>
              </div>
            ))
          ) : (
            <p><em>No entities found in this note.</em></p>
          )}
        </div>
      )}

      {response?.error && (
        <p style={{ color: 'red' }}>{response.error}</p>
      )}
    </div>
  );
};

export default NoteEntry;
