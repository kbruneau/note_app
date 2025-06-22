import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient';
import '../App.css';
import { useLocation, useParams } from 'react-router-dom';

const entityTypesForTagging = ['PERSON', 'LOCATION', 'ITEM', 'SPELL', 'MONSTER', 'OTHER'];

const HomePage = () => {
  const { entityType } = useParams();
  const location = useLocation();

  const currentTypeName = useMemo(() => {
    if (!entityType) return 'Notes';
    const name = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    return name;
  }, [entityType]);

  const [data, setData] = useState([]);
  const [sortByRecent, setSortByRecent] = useState(true);
  const [editNoteId, setEditNoteId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState(''); // Added state for new note title
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selection, setSelection] = useState({ text: '', start: null, end: null });
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [showFabOptions, setShowFabOptions] = useState(false);
  const [existingNode, setExistingNode] = useState(null);
  const [newTypeForExistingText, setNewTypeForExistingText] = useState(''); // New state

  const [highlightNoteId, setHighlightNoteId] = useState(null);

  useEffect(() => {
    const hash = location.hash;
    if (currentTypeName === 'Notes' && hash.startsWith('#note-')) {
      const id = parseInt(hash.replace('#note-', ''), 10);
      setHighlightNoteId(id);
      setTimeout(() => {
        const el = document.getElementById(`note-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlighted');
          setTimeout(() => el.classList.remove('highlighted'), 3000);
        }
      }, 300);
    } else {
      setHighlightNoteId(null);
    }
  }, [location, data, currentTypeName]);

  useEffect(() => {
    const typeMap = {
      Notes: 'NOTES',
      People: 'PERSON',
      Places: 'LOCATION',
      Items: 'ITEM',
      Spells: 'SPELL'
    };
    const backendType = typeMap[currentTypeName] || currentTypeName.toUpperCase();

    const fetchData = async () => {
      setSubmitting(true);
      try {
        const endpoint = currentTypeName === 'Notes' ? '/notes' : `/entities/by-type/${backendType}`;
        const res = await apiClient.get(endpoint);
        setData(res.data);
      } catch (err) {
        console.error(`Failed to fetch ${currentTypeName}:`, err);
        setData([]);
      } finally {
        setSubmitting(false);
      }
    };
    fetchData();
  }, [currentTypeName]);

  const handleTextSelect = async (noteId, content) => {
    if (currentTypeName !== 'Notes') return;
    const selectionObj = window.getSelection();
    if (!selectionObj || selectionObj.rangeCount === 0) return;
    const text = selectionObj.toString().trim();
    if (!text) return;

    const range = selectionObj.getRangeAt(0);
    const preSelectionRange = range.cloneRange();

    let noteContentContainer = range.startContainer.parentElement;
    while(noteContentContainer && !noteContentContainer.classList.contains('note-content')) {
        noteContentContainer = noteContentContainer.parentElement;
    }
    if (!noteContentContainer) {
        noteContentContainer = document.getElementById(`note-${noteId}`)?.querySelector('.note-content');
    }

    let start, end;
    if (!noteContentContainer) {
        console.warn("Could not determine note content container for accurate offset calculation.");
        const simpleStart = content.indexOf(text);
        if (simpleStart === -1) return; // Text not found in content, should not happen
        start = simpleStart;
        end = start + text.length;
    } else {
        preSelectionRange.selectNodeContents(noteContentContainer);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        start = preSelectionRange.toString().length;
        end = start + text.length;
    }

    setSelection({ text, start, end });
    setSelectedNoteId(noteId);
    setShowFabOptions(true);
    setNewTypeForExistingText(''); // Reset dropdown

    try {
      const res = await apiClient.get(`/nodes/by-name/${encodeURIComponent(text)}`);
      setExistingNode(res.data || null);
    } catch {
      setExistingNode(null);
    }
  };

  const tagSelectionManually = async (type) => {
    if (!selection.text || selectedNoteId == null || currentTypeName !== 'Notes') return;
    try {
      await apiClient.post(`/notes/${selectedNoteId}/mentions/add`, {
        name_segment: selection.text,
        type: type,
        start_pos: selection.start,
        end_pos: selection.end
      });
      setSelection({ text: '', start: null, end: null });
      setSelectedNoteId(null);
      setShowFabOptions(false);
      await apiClient.post('/retag-entity-everywhere', { name: selection.text, type: type });
    } catch (err) {
      console.error('Failed to manually tag:', err);
      alert('Error tagging word. Check console. ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRetagExistingTextAsNewType = async () => {
    if (!selection.text || selectedNoteId == null || !newTypeForExistingText || currentTypeName !== 'Notes') {
      alert("Please select a new type for the re-tag action.");
      return;
    }
    try {
      await apiClient.post(`/notes/${selectedNoteId}/mentions/add`, {
        name_segment: selection.text,
        type: newTypeForExistingText,
        start_pos: selection.start,
        end_pos: selection.end
      });

      await apiClient.post('/retag-entity-everywhere', { name: selection.text, type: newTypeForExistingText });

      setSelection({ text: '', start: null, end: null });
      setSelectedNoteId(null);
      setShowFabOptions(false);
      setNewTypeForExistingText('');
    } catch (err) {
      console.error('Failed to re-tag existing text:', err);
      alert('Error re-tagging. Check console. ' + (err.response?.data?.error || err.message));
    }
  };

  const tagWithPersonTag = async (tagLabel) => {
    // This is now effectively the same as tagSelectionManually('PERSON')
    // The specific tagLabel (e.g. "Player Character") is not directly used to add a tag to DM.nodes here.
    // That would require a separate mechanism or endpoint.
    await tagSelectionManually('PERSON');
  };

  const startEdit = (note) => {
    setEditNoteId(note.id);
    setEditContent(note.content);
  };

  const saveEdit = async (id) => {
    setSubmitting(true);
    try {
      await apiClient.put(`/notes/${id}`, { content: editContent });
      setData(currentData =>
        currentData.map(note =>
          note.id === id ? { ...note, content: editContent, updated_at: new Date().toISOString() } : note
        )
      );
      setEditNoteId(null);
      setEditContent('');
    } catch (err) {
      console.error('Failed to update note:', err);
      alert('Error updating note: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNote = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    setSubmitting(true);
    try {
      await apiClient.delete(`/notes/${id}`);
      setData(data.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
      alert('Error deleting note: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const submitNewNote = async () => {
    if (!newNoteContent.trim()) return; // Keep check for content
    setSubmitting(true);
    try {
      const payload = {
        content: newNoteContent,
        title: newNoteTitle.trim() // Include title in payload
      };
      const res = await apiClient.post('/add-note', payload);
      // Backend response for /add-note now includes a 'note' object with id, title, content, created_at
      // and a 'nodes' array for tagged entities.
      const newNoteData = res.data.note;

      const newNoteToAdd = {
        id: newNoteData.id,
        title: newNoteData.title, // Use title from backend response
        content: newNoteData.content, // Use content from backend response
        created_at: newNoteData.created_at,
      };
      setData(currentData => [newNoteToAdd, ...currentData]);
      setNewNoteTitle(''); // Reset title state
      setNewNoteContent('');
      setShowNewNoteForm(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Failed to submit new note:', err);
      alert('Error submitting new note: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const sortedData = useMemo(() => {
    const currentData = Array.isArray(data) ? data : [];
    if (currentTypeName === 'Notes') {
      return [...currentData].sort((a, b) => {
        const dateA = a && a.created_at ? new Date(a.created_at) : 0;
        const dateB = b && b.created_at ? new Date(b.created_at) : 0;
        const idA = a && a.id ? a.id : 0;
        const idB = b && b.id ? b.id : 0;
        return sortByRecent ? dateB - dateA : idA - idB;
      });
    }
    if (currentData.length > 0 && currentData[0].hasOwnProperty('name')) {
        return [...currentData].sort((a,b) => (a.name || "").localeCompare(b.name || ""));
    }
    return currentData;
  }, [data, sortByRecent, currentTypeName]);

  return (
    <>
      {currentTypeName === 'Notes' && (
        <div className="sort-bar">
          <button className="button" onClick={() => setSortByRecent(!sortByRecent)}>
            Sort by {sortByRecent ? 'Most Recent First' : 'Creation Order (Oldest First)'}
          </button>
        </div>
      )}

      {submitting && data.length === 0 && <p>Loading your {currentTypeName}...</p>}

      {currentTypeName === 'Notes' ? (
        <ul className="note-list">
          {sortedData.map((n) => (
            <li
              key={n.id}
              id={`note-${n.id}`}
              className={`note-card ${highlightNoteId === n.id ? 'highlighted' : ''}`}
            >
              <div className="entity-meta">
                <a
                  href={`/#note-${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setHighlightNoteId(n.id);
                    if (window.location.hash !== `#note-${n.id}`) {
                        window.location.hash = `note-${n.id}`;
                    } else {
                        const el = document.getElementById(`note-${n.id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="entity-link"
                >
                  <strong>{n.title || `Note #${n.id}`}</strong>
                </a>
                <em className="note-timestamp">
                  ({new Date(n.created_at).toLocaleString()})
                </em>
              </div>
              {editNoteId === n.id ? (
                <>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                  />
                  <div className="button-row">
                    <button className="button" onClick={() => saveEdit(n.id)} disabled={submitting}>Save</button>
                    <button className="button button-secondary" onClick={() => setEditNoteId(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="note-content"
                    onMouseUp={() => handleTextSelect(n.id, n.content)}
                  >
                    {n.content}
                  </div>
                  <div className="button-row">
                    <button className="button button-delete-note" onClick={() => deleteNote(n.id)} disabled={submitting}>Delete</button>
                    <button className="button button-edit-note" onClick={() => startEdit(n)}>Edit</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="entity-list">
          {sortedData.map((item) => (
            <li key={item.id}>
              <a href={`/node/${item.id}`} className="entity-link">{item.name}</a>
            </li>
          ))}
        </ul>
      )}

      {currentTypeName === 'Notes' && !showNewNoteForm && !showFabOptions && (
        <button onClick={() => setShowNewNoteForm(true)} className="fab" title="Add New Note">
          +
        </button>
      )}

      {currentTypeName === 'Notes' && showFabOptions && (
        <div className="popup-box">
          <p style={{ marginBottom: '0.5rem' }}>Tag "<em>{selection.text}</em>" as:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {existingNode ? (
              <>
                <p>This text is already tagged as: <strong>{existingNode.name}</strong> (Type: {existingNode.type}, Node ID: {existingNode.id}).</p>
                {existingNode.type === 'PERSON' && (
                  <>
                    <button onClick={() => tagWithPersonTag('Player Character')}>👤 Tag this instance as a Person</button>
                    <button onClick={() => tagWithPersonTag('Party Member')}>👤 Tag this instance as a Person</button>
                  </>
                )}
                <div className="retag-section">
                  <p>Or, change the tag for this specific instance of "<em>{selection.text}</em>" as:</p>
                  <select
                    value={newTypeForExistingText}
                    onChange={(e) => setNewTypeForExistingText(e.target.value)}
                  >
                    <option value="">-- Select New Type --</option>
                    {entityTypesForTagging.map(type => (
                      <option key={type} value={type}>{type.charAt(0) + type.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRetagExistingTextAsNewType}
                    disabled={!newTypeForExistingText || newTypeForExistingText === existingNode.type}
                    className="button"
                    title={newTypeForExistingText === existingNode.type ? "Select a different type to re-tag this specific mention." : ""}
                  >
                    Save New Tag for This Mention
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>Tag "<em>{selection.text}</em>" as:</p>
                <button onClick={() => tagSelectionManually('PERSON')}>👤 Tag as a Person</button>
                <button onClick={() => tagSelectionManually('LOCATION')}>🏠 Tag as a Location</button>
                <button onClick={() => tagSelectionManually('ITEM')}>📜 Tag as an Item</button>
                <button onClick={() => tagSelectionManually('SPELL')}>🪄 Tag as a Spell</button>
                <button onClick={() => tagSelectionManually('MONSTER')}>💀 Tag as a Monster</button>
              </>
            )}
            <button onClick={() => setShowFabOptions(false)} className="button button-secondary" style={{marginTop: '1rem'}}>Cancel Tagging</button>
          </div>
        </div>
      )}

      {currentTypeName === 'Notes' && showNewNoteForm && (
        <div className="popup-box" style={{ bottom: '20px', right: '20px', width: 'auto', minWidth: '350px', maxWidth: '600px' }}>
          <div style={{ margin: '0 auto' }}>
            <h3 className="form-page-container-subheader">New Note</h3>
            <div className="form-group" style={{ marginBottom: '10px' }}>
              <label htmlFor="newNoteTitle" style={{ display: 'block', marginBottom: '5px' }}>Note Title (Optional):</label>
              <input
                type="text"
                id="newNoteTitle"
                placeholder="Enter a title for your note (optional)"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="newNoteContent" style={{ display: 'block', marginBottom: '5px' }}>Note Content:</label>
              <textarea
                id="newNoteContent"
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                rows={5}
                placeholder="Write your campaign note here..."
              />
              <div className="button-row">
                <button onClick={submitNewNote} disabled={submitting || !newNoteContent.trim()} className="button">
                  {submitting ? 'Saving...' : 'Save This Note'}
                </button>
                <button onClick={() => setShowNewNoteForm(false)} className="button button-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HomePage;
