import React, { useState, useEffect } from 'react';
import apiClient from '../services/apiClient'; // Import apiClient
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

  // State for correction modal
  const [editingMention, setEditingMention] = useState(null);
  const [newMentionType, setNewMentionType] = useState('');
  const mentionTypes = ['PERSON', 'LOCATION', 'ITEM', 'SPELL', 'MONSTER', 'OTHER']; // Available types

  useEffect(() => {
    const fetchNode = async () => {
      try {
        const res = await apiClient.get(`/nodes/${nodeId}`); // Use apiClient, relative URL
        setNode(res.data);
        setNewType(res.data.type);
      } catch (err) {
        console.error('Failed to fetch node', err);
      }
    };

    const fetchMentions = async () => {
      try {
        const res = await apiClient.get(`/nodes/${nodeId}/mentions`); // Use apiClient, relative URL
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
      await apiClient.patch(`/nodes/${nodeId}/type`, { newType }); // Use apiClient, relative URL
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

  const getMentionStyle = (mention) => {
    let style = { padding: '2px 0' };
    if (mention.source === 'USER_MODIFIED' || mention.source === 'USER_ADDED') {
      style.borderLeft = '3px solid blue';
      style.paddingLeft = '5px';
    } else if (mention.source === 'PHRASEMATCHER_EXACT') {
      style.borderLeft = '3px solid green';
      style.paddingLeft = '5px';
    } else if (mention.confidence && mention.confidence < 0.7) {
      style.opacity = 0.7;
      style.borderLeft = '3px solid orange';
      style.paddingLeft = '5px';
    } else if (mention.confidence) {
      style.borderLeft = '3px solid lightgreen';
      style.paddingLeft = '5px';
    }
    return style;
  };

  const handleOpenEditModal = (mention) => {
    setEditingMention(mention);
    setNewMentionType(mention.mention_type);
  };

  const handleCloseModal = () => {
    setEditingMention(null);
    setNewMentionType('');
  };

  const handleSaveCorrection = async () => {
    if (!editingMention || !newMentionType) return;

    const payload = {
      new_type: newMentionType,
      note_id: editingMention.note_id,
      original_text_segment: editingMention.snippet || editingMention.node_name, // Assuming snippet is preferred if available
      original_mention_type: editingMention.mention_type,
      original_source: editingMention.source,
      original_confidence: editingMention.confidence,
      start_pos: editingMention.start_pos, // Assuming span doesn't change for type-only correction for now
      end_pos: editingMention.end_pos,
      // new_name_segment could be added if we allow text editing in the modal
    };

    try {
      const response = await apiClient.post(`/mentions/${editingMention.id}/correct`, payload);
      const updatedMentionFromServer = response.data.updated_mention;

      setMentions(prevMentions =>
        prevMentions.map(m =>
          m.id === editingMention.id
            ? { ...updatedMentionFromServer, snippet: m.snippet, note_content: m.note_content } // Preserve snippet & content if not returned
            : m
        )
      );
      handleCloseModal();
    } catch (error) {
      console.error('Failed to save mention correction:', error);
      alert('Failed to save correction. ' + (error.response?.data?.error || error.message));
    }
  };

  const handleDeleteMentionInModal = async () => {
    if (!editingMention) return;
    if (!window.confirm(`Are you sure you want to delete this mention: "${editingMention.snippet || editingMention.node_name}"?`)) return;

    try {
      // The DELETE endpoint can derive original details from the DB, but passing them can be a fallback
      // For now, relying on backend to fetch if needed.
      await apiClient.delete(`/mentions/${editingMention.id}`);

      setMentions(prevMentions => prevMentions.filter(m => m.id !== editingMention.id));
      handleCloseModal();
    } catch (error) {
      console.error('Failed to delete mention:', error);
      alert('Failed to delete mention. ' + (error.response?.data?.error || error.message));
    }
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
                  {mentionTypes.map(type => <option key={type} value={type}>{formatType(type)}</option>)}
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

          <h3>Mentions in Notes</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {mentions.map((m) => (
              <li key={m.id} className="mention-entry" style={getMentionStyle(m)}>
                <div className="entity-meta">
                  <span>
                    In Note <Link to={`/#note-${m.note_id}`}>#{m.note_id}</Link>:
                    Type: {formatType(m.mention_type)} (Conf: {m.confidence?.toFixed(2)}, Src: {m.source})
                  </span>
                  <div style={{ float: 'right' }}>
                    <button
                      onClick={() => handleOpenEditModal(m)}
                      className="button-icon"
                      title="Correct Mention"
                    > ✏️ </button>
                    <button
                      onClick={() => navigate(`/notes/${m.note_id}/edit`)}
                      className="button-icon"
                      title="Edit Note Content"
                    > 📝 </button>
                    <button
                      onClick={() => toggleNote(m.note_id)}
                      className="button-icon"
                      title={expandedNotes.includes(m.note_id) ? 'Collapse Note' : 'Expand Note'}
                    >
                      {expandedNotes.includes(m.note_id) ? '➖' : '➕'}
                    </button>
                  </div>
                </div>
                <div className="mention-snippet" style={{ clear: 'both', paddingTop: '5px' }}>
                  <em>
                    "{m.snippet || (expandedNotes.includes(m.note_id)
                      ? m.note_content
                      : m.note_content?.substring(Math.max(0, m.start_pos - 50), m.end_pos + 50))}"
                  </em>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading...</p>
      )}

      {editingMention && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Correct Mention</h3>
            <p><strong>Text:</strong> "{editingMention.snippet || editingMention.node_name}"</p>
            <p><strong>Current Type:</strong> {formatType(editingMention.mention_type)}</p>
            <p><em>(Source: {editingMention.source}, Confidence: {editingMention.confidence?.toFixed(2)})</em></p>

            <div>
              <label htmlFor="newMentionType">New Type: </label>
              <select
                id="newMentionType"
                value={newMentionType}
                onChange={(e) => setNewMentionType(e.target.value)}
              >
                {mentionTypes.map(type => (
                  <option key={type} value={type}>{formatType(type)}</option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <button onClick={handleSaveCorrection} className="button">Save Change</button>
              <button onClick={handleDeleteMentionInModal} className="button button-danger">Delete Mention</button>
              <button onClick={handleCloseModal} className="button button-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodePage;
