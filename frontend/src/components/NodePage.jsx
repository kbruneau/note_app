import React, { useState, useEffect } from 'react';
import apiClient from '../services/apiClient'; // Import apiClient
import '../App.css';
import { useParams, useNavigate, Link } from 'react-router-dom'; // Added Link

const NodePage = () => {
  const { nodeId } = useParams();
  const [node, setNode] = useState(null);
  const [mentions, setMentions] = useState([]);
  const [isEditingType, setIsEditingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [expandedNotes, setExpandedNotes] = useState([]);
  const navigate = useNavigate();

  // Helper function to format mention source and confidence
  const formatMentionSource = (source, confidence) => {
    if (!source) return `(Confidence: ${confidence?.toFixed(2) || 'N/A'})`;

    let sourceDescription = source;

    if (source === 'PHRASEMATCHER_EXACT') {
      sourceDescription = 'Exact Match (DB)';
    } else if (source === 'USER_CONFIRMED') {
      sourceDescription = 'User Confirmed';
    } else if (source === 'USER_ADDED') {
      sourceDescription = 'User Added';
    } else if (source === 'USER_MODIFIED') {
      sourceDescription = 'User Modified';
    } else if (source.startsWith('SPACY_NER_')) {
      const nerType = source.replace('SPACY_NER_', '').replace('_PASSTHROUGH','');
      if (nerType === 'PERSON' || nerType === 'LOCATION' || nerType === 'ORG') {
        sourceDescription = `Detected ${nerType.charAt(0) + nerType.slice(1).toLowerCase()} (NLP)`;
      } else if (nerType.startsWith('LOCATION_')) { // Handles LOCATION_GPE, LOCATION_LOC etc.
        sourceDescription = `Detected Location (NLP)`;
      } else if (nerType.startsWith('RAW_')) {
        const rawNerType = nerType.replace('RAW_', '');
        sourceDescription = `NLP Raw: ${rawNerType}`;
      } else {
         sourceDescription = `Detected (NLP)`;
      }
    } else if (source === 'INFERRED_RULE_KEYWORD_ITEM') {
      sourceDescription = 'Inferred Item (Keyword)';
    } else if (source === 'INFERRED_RULE_VERB_SPELL') {
      sourceDescription = 'Inferred Spell (Context)';
    } else if (source === 'INFERRED_RULE_VERB_ITEM') {
      sourceDescription = 'Inferred Item (Context)';
    } else if (source === 'INFERRED_RULE_DEP_PERSON') {
      sourceDescription = 'Inferred Person (Context)';
    } else if (source.startsWith('INFERRED_RULE_')) { // More generic rule-based
        const ruleType = source.replace('INFERRED_RULE_', '');
        sourceDescription = `Inferred as ${ruleType.charAt(0) + ruleType.slice(1).toLowerCase()} (Rule)`;
    } else if (source.startsWith('INFERRED_')) {
      const inferredDetail = source.replace('INFERRED_', '').replace(/_/g, ' ');
      sourceDescription = `Inferred (${inferredDetail.charAt(0) + inferredDetail.slice(1).toLowerCase()})`;
    } else if (source === 'UNKNOWN') {
      sourceDescription = 'System Suggestion (Low Confidence)';
    }

    const confidenceText = confidence !== null && confidence !== undefined ? `Conf: ${confidence.toFixed(2)}` : 'Conf: N/A';
    return `${sourceDescription} (${confidenceText})`;
  };

  // State for correction modal
  const [editingMention, setEditingMention] = useState(null);
  const [newMentionType, setNewMentionType] = useState('');
  const [editedMentionName, setEditedMentionName] = useState(''); // New state for edited name
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
      const response = await apiClient.patch(`/nodes/${nodeId}/type`, { newType });
      setIsEditingType(false); // Close editing UI first

      if (response.data.merged === true) {
        alert(response.data.message || `Node type changed and merged into Node ID: ${response.data.target_node_id}. You will be redirected.`);
        navigate(`/node/${response.data.target_node_id}`);
        // The useEffect for [nodeId] will re-fetch data for the new target_node_id page
      } else {
        // Simple update, NodeId remains the same
        setNode(prev => ({ ...prev, type: newType })); // Update local state
        alert(response.data.message || 'Node type updated successfully!');
      }
    } catch (err) {
      console.error('Failed to update node type:', err);
      alert('Failed to update node type: ' + (err.response?.data?.error || err.message));
      // Optionally, if the error was 404 because the current node was deleted (e.g. by another user)
      // you might want to navigate away or show a specific message.
      // For now, just log and alert.
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
    setEditedMentionName(mention.snippet || ''); // Initialize with current snippet or empty string
  };

  const handleCloseModal = () => {
    setEditingMention(null);
    setNewMentionType('');
    setEditedMentionName(''); // Reset edited name
  };

  const handleSaveCorrection = async () => {
    if (!editingMention || !newMentionType || !editedMentionName.trim()) {
        alert("Mention text and type cannot be empty.");
        return;
    }

    const payload = {
      new_name_segment: editedMentionName.trim(), // Use the edited name
      new_type: newMentionType,
      note_id: editingMention.note_id,
      original_text_segment: editingMention.snippet || editingMention.node_name,
      original_mention_type: editingMention.mention_type,
      original_source: editingMention.source,
      original_confidence: editingMention.confidence,
      // If new_name_segment is different, start_pos/end_pos might ideally be updated.
      // For this iteration, we pass original start/end_pos. The backend might adjust them
      // or a more sophisticated UI would allow span editing.
      // For now, we'll assume the backend uses the new_name_segment to find/create the node,
      // and the existing start/end_pos are primarily for logging or if the segment text is unchanged.
      // The backend POST /mentions/:mentionId/correct is set to update start/end if provided,
      // but here we are not providing new ones if only text/type changes.
      // If text changes, start/end pos in the note *should* change. This is a complex part.
      // For now, we'll send the original start/end_pos, implying the correction is about the *node* it points to,
      // or the *type* of the existing span. If the text itself changes, the span *must* be re-evaluated.
      // This subtask focuses on allowing text edit in modal, implying the node's name changes.
      // The backend will handle node creation/lookup with 'new_name_segment'.
      // The existing mention's span (start_pos, end_pos) in the note will remain, but will point to a new/different node.
      start_pos: editingMention.start_pos,
      end_pos: editingMention.end_pos,
    };

    try {
      const response = await apiClient.post(`/mentions/${editingMention.id}/correct`, payload);
      const { updated_mention } = response.data; // Destructure for clarity

      setMentions(prevMentions =>
        prevMentions.map(m => {
          if (m.id === editingMention.id) {
            // Update with data from server, ensure local display text (snippet) reflects the change
            return {
              ...m, // Keep some original fields if not returned by backend e.g. note_content
              node_id: updated_mention.node_id,
              mention_type: updated_mention.mention_type,
              source: updated_mention.source,
              confidence: updated_mention.confidence,
              snippet: editedMentionName.trim(), // Crucially, update the displayed snippet to the edited name
              start_pos: updated_mention.start_pos, // Update if backend returns modified ones
              end_pos: updated_mention.end_pos,
               // If backend sends back the node name linked to node_id:
              // node_name: updated_mention.node_name (or similar) could also be used for snippet.
            };
          }
          return m;
        })
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

  const handleQuickConfirm = async (mentionId) => {
    try {
      const response = await apiClient.post(`/mentions/${mentionId}/confirm`);
      const confirmedMention = response.data.updated_mention; // Backend returns the updated mention

      setMentions(prevMentions =>
        prevMentions.map(m =>
          m.id === mentionId
            ? { ...m, ...confirmedMention, snippet: m.snippet, note_content: m.note_content } // Preserve client-side fields if not in confirmedMention
            : m
        )
      );
      // Optionally, show a success notification
      // alert("Mention confirmed!");
    } catch (error) {
      console.error('Failed to quick confirm mention:', error);
      alert('Failed to confirm mention: ' + (error.response?.data?.message || error.message));
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

          <h3>Where This Appears in Your Notes</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {mentions.map((m) => (
              <li key={m.id} className="mention-entry" style={getMentionStyle(m)}>
                <div className="entity-meta">
                  <span>
                    In Note <Link to={`/#note-${m.note_id}`}>#{m.note_id}</Link>:
                    Tagged as: {formatType(m.mention_type)} ({formatMentionSource(m.source, m.confidence)})
                  </span>
                  <div className="mention-actions">
                    {!['USER_CONFIRMED', 'USER_ADDED', 'PHRASEMATCHER_EXACT', 'USER_MODIFIED'].includes(m.source) && (
                      <button
                        onClick={() => handleQuickConfirm(m.id)}
                        className="button-icon button-quick-confirm"
                        title="Confirm This Tag"
                      > ✔️ </button>
                    )}
                    <button
                      onClick={() => handleOpenEditModal(m)}
                      className="button-icon"
                      title="Edit This Tag or Mention"
                    > ✏️ </button>
                    <button
                      onClick={() => navigate(`/notes/${m.note_id}/edit`)}
                      className="button-icon"
                      title="Edit Full Note"
                    > 📝 </button>
                    <button
                      onClick={() => toggleNote(m.note_id)}
                      className="button-icon"
                      title={expandedNotes.includes(m.note_id) ? 'Collapse Note Details' : 'Expand Note Details'}
                    >
                      {expandedNotes.includes(m.note_id) ? '➖' : '➕'}
                    </button>
                  </div>
                </div>
                <div
                  className={`mention-snippet ${expandedNotes.includes(m.note_id) ? 'expanded' : ''}`}
                  style={{ clear: 'both', paddingTop: '5px' }}
                >
                  <em>
                    {expandedNotes.includes(m.note_id)
                      ? m.note_content  // Show full content when expanded
                      : m.snippet || 'Snippet not available.'} {/* Use backend-generated snippet when collapsed */}
                  </em>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Loading details...</p>
      )}

      {editingMention && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Edit Tag or Mention</h3>
            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="editedMentionName" style={{ display: 'block', marginBottom: '5px' }}>Mentioned Text: </label>
              <input
                type="text"
                id="editedMentionName"
                value={editedMentionName}
                onChange={(e) => setEditedMentionName(e.target.value)}
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label htmlFor="newMentionType" style={{ display: 'block', marginBottom: '5px' }}>New Tag: </label>
              <select
                id="newMentionType"
                value={newMentionType}
                onChange={(e) => setNewMentionType(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              >
                {mentionTypes.map(type => (
                  <option key={type} value={type}>{formatType(type)}</option>
                ))}
              </select>
            </div>
            <p><em>Original Tag: {formatType(editingMention.mention_type)} (Source: {editingMention.source}, Confidence: {editingMention.confidence?.toFixed(2)})</em></p>


            <div className="modal-actions">
              <button onClick={handleSaveCorrection} className="button" disabled={!editedMentionName.trim()}>Save Changes</button>
              <button onClick={handleDeleteMentionInModal} className="button button-danger">Remove This Mention</button>
              <button onClick={handleCloseModal} className="button button-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NodePage;
