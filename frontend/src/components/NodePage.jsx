import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';
import { useParams, useNavigate } from 'react-router-dom';

const NodePage = () => {
  const { nodeId } = useParams();
  const [node, setNode] = useState(null);
  const [mentions, setMentions] = useState([]);
  const [isEditingType, setIsEditingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [expandedNotes, setExpandedNotes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNode = async () => {
      try {
        const res = await axios.get(`http://localhost:4000/api/nodes/${nodeId}`);
        setNode(res.data);
        setNewType(res.data.type);
      } catch (err) {
        console.error('Failed to fetch node', err);
      }
    };

    const fetchMentions = async () => {
      try {
        const res = await axios.get(`http://localhost:4000/api/nodes/${nodeId}/mentions`);
        setMentions(res.data);
      } catch (err) {
        console.error('Failed to fetch mentions', err);
      }
    };

    fetchNode();
    fetchMentions();
  }, [nodeId]);

  const toggleNote = (noteId) => {
    setExpandedNotes((prev) =>
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId]
    );
  };

  const handleTypeChange = async () => {
    try {
      await axios.patch(`http://localhost:4000/api/nodes/${nodeId}/type`, { newType });
      setNode(prev => ({ ...prev, type: newType }));
      setIsEditingType(false);
    } catch (err) {
      console.error('Failed to update node type:', err);
    }
  };

  const formatType = (type) => {
    const map = {
      PERSON: 'Person',
      LOCATION: 'Place',
      ITEM: 'Item',
      SPELL: 'Spell',
      MONSTER: 'Monster'
    };
    return map[type] || type;
  };

  return (
    <div className="app-wrapper">
      {node ? (
        <>
          <h2 className="entity-header">{node.name}</h2>
          <p className="entity-meta">
            <strong>Type:</strong>{' '}
            {isEditingType ? (
              <>
                <select value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="PERSON">Person</option>
                  <option value="LOCATION">Place</option>
                  <option value="ITEM">Item</option>
                  <option value="SPELL">Spell</option>
                  <option value="MONSTER">Monster</option>
                </select>
                <button onClick={handleTypeChange}>Save</button>
                <button onClick={() => setIsEditingType(false)}>Cancel</button>
              </>
            ) : (
              <>
                <a href={`/?tab=${node.type}`} className="entity-link">{formatType(node.type)}</a>
                <button onClick={() => setIsEditingType(true)} className="button">Change</button>
              </>
            )}
          </p>

          <h3>Mentions</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {mentions.map((m) => (
              <li key={m.id} className="mention-entry">
                <div className="entity-meta">
                  <strong>Note #{m.note_id}</strong>
                  <div style={{ float: 'right' }}>
                    <button
                      onClick={() => navigate(`/notes/${m.note_id}/edit`)}
                      style={{
                        fontSize: '0.8rem',
                        padding: '2px 6px',
                        border: '1px solid #a17642',
                        borderRadius: '4px',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#7b4b1d',
                        marginRight: '5px'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleNote(m.note_id)}
                      style={{
                        fontSize: '0.8rem',
                        padding: '2px 6px',
                        border: '1px solid #a17642',
                        borderRadius: '4px',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#7b4b1d'
                      }}
                    >
                      {expandedNotes.includes(m.note_id) ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>
                <div className="mention-snippet" style={{ clear: 'both' }}>
                  <em>
                    {expandedNotes.includes(m.note_id)
                      ? m.note_content
                      : m.note_content?.substring(Math.max(0, m.start_pos - 30), m.end_pos + 30)}
                  </em>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default NodePage;
