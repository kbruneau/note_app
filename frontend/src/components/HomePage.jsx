import React, { useState, useEffect, useMemo } from 'react';
import apiClient from '../services/apiClient';
import '../App.css';
import { useLocation, useParams } from 'react-router-dom'; // Ensure useParams is imported

const HomePage = () => {
  const { entityType } = useParams(); // Get entityType from URL, will be undefined for root path
  const location = useLocation(); // Still needed for hash linking

  // Determine current view type based on entityType param or default to 'Notes'
  const currentTypeName = useMemo(() => {
    if (!entityType) return 'Notes'; // Default for root path
    // Capitalize first letter, useful for display and matching keys in typeMap
    const name = entityType.charAt(0).toUpperCase() + entityType.slice(1);
    // If your tabOptions array was available, you could validate against it:
    // const validTabs = ['Notes', 'People', 'Places', 'Items', 'Spells'];
    // return validTabs.includes(name) ? name : 'Notes'; // Fallback to Notes if entityType is invalid
    return name; // Assuming entityType from URL will match a defined category
  }, [entityType]);

  const [data, setData] = useState([]); // Holds notes or entities based on currentTypeName
  const [sortByRecent, setSortByRecent] = useState(true); // Notes specific
  const [editNoteId, setEditNoteId] = useState(null); // Notes specific
  const [editContent, setEditContent] = useState(''); // Notes specific
  const [newNoteContent, setNewNoteContent] = useState(''); // Notes specific
  const [showNewNoteForm, setShowNewNoteForm] = useState(false); // Notes specific
  const [submitting, setSubmitting] = useState(false); // General loading/submitting state

  // FAB tagging menu state - remains as it's tied to note content selection
  const [selection, setSelection] = useState({ text: '', start: null, end: null });
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [showFabOptions, setShowFabOptions] = useState(false);
  const [existingNode, setExistingNode] = useState(null);

  const [highlightNoteId, setHighlightNoteId] = useState(null);

  // Effect for highlighting note based on URL hash
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

  // Main data fetching effect based on currentTypeName
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


  // --- Notes specific functions (to remain, but conditional on currentTypeName) ---
  const handleTextSelect = async (noteId, content) => {
    if (currentTypeName !== 'Notes') return;
    const selectionObj = window.getSelection();
    if (!selectionObj || selectionObj.rangeCount === 0) return;
    const text = selectionObj.toString().trim();
    if (!text) return;

    const range = selectionObj.getRangeAt(0);
    const preSelectionRange = range.cloneRange();

    // Attempt to get a reference to the full note content container
    let noteContentContainer = range.startContainer.parentElement;
    while(noteContentContainer && !noteContentContainer.classList.contains('note-content')) {
        noteContentContainer = noteContentContainer.parentElement;
    }
    if (!noteContentContainer) { // Fallback if specific container not found
        noteContentContainer = document.getElementById(`note-${noteId}`)?.querySelector('.note-content');
    }
    if (!noteContentContainer) {
        console.warn("Could not determine note content container for accurate offset calculation.");
        // Fallback to basic indexOf if more accurate offset fails
        const simpleStart = content.indexOf(text);
        if (simpleStart === -1) return;
        setSelection({ text, start: simpleStart, end: simpleStart + text.length });

    } else {
        preSelectionRange.selectNodeContents(noteContentContainer);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;
        const end = start + text.length;
        setSelection({ text, start, end });
    }

    setSelectedNoteId(noteId);
    setShowFabOptions(true);

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
      // Sidebar data is in MainLayout; consider a shared state or callback if immediate sidebar refresh is needed.
    } catch (err) {
      console.error('Failed to manually tag:', err);
      alert('Error tagging word. Check console. ' + (err.response?.data?.error || err.message));
    }
  };

  const tagWithPersonTag = async (tagLabel) => {
    if (!selection.text || selectedNoteId == null || currentTypeName !== 'Notes') return;
    try {
      await apiClient.post(`/notes/${selectedNoteId}/mentions/add`, {
        name_segment: selection.text,
        type: 'PERSON',
        start_pos: selection.start,
        end_pos: selection.end
      });
      setSelection({ text: '', start: null, end: null });
      setSelectedNoteId(null);
      setShowFabOptions(false);

      await apiClient.post('/retag-entity-everywhere', { name: selection.text, type: 'PERSON' });
    } catch (err) {
      console.error('Failed to tag with person tag:', err);
      alert('Error tagging as Person. Check console. ' + (err.response?.data?.error || err.message));
    }
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
    if (!newNoteContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post('/add-note', { content: newNoteContent });
      const newNoteData = res.data;
      const newNoteToAdd = {
        id: newNoteData.id,
        content: newNoteContent,
        created_at: newNoteData.created_at,
      };
      setData(currentData => [newNoteToAdd, ...currentData]);
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
            Sort by {sortByRecent ? 'Most Recent' : 'Note Number (ID)'}
          </button>
        </div>
      )}

      {submitting && data.length === 0 && <p>Loading {currentTypeName}...</p>}

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
                    // Manually update hash, as react-router might not scroll to it if already on page
                    if (window.location.hash !== `#note-${n.id}`) {
                        window.location.hash = `note-${n.id}`;
                    } else { // If hash is already set, manually trigger scroll again
                        const el = document.getElementById(`note-${n.id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="entity-link"
                >
                  <strong>Note #{n.id}</strong>
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
              {/* You can display other properties of entities here if needed */}
              {/* e.g., <p><small>Type: {item.type}</small></p> */}
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
          <p style={{ marginBottom: '0.5rem' }}>Tag "{selection.text}" as:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {existingNode?.type === 'PERSON' ? (
              <>
                <p><em>{selection.text}</em> is already tagged as a Person.</p>
                <button onClick={() => tagWithPersonTag('Player Character')}>👤 Add Player Character Tag</button>
                <button onClick={() => tagWithPersonTag('Party Member')}>👤 Add Party Member Tag</button>
              </>
            ) : existingNode ? (
              <p><em>{selection.text}</em> is already tagged as {existingNode.type}.</p>
            ) : (
              <>
                <button onClick={() => tagSelectionManually('PERSON')}>👤 Tag as Person</button>
                <button onClick={() => tagSelectionManually('LOCATION')}>🏠 Tag as Location</button>
                <button onClick={() => tagSelectionManually('ITEM')}>📜 Tag as Item</button>
                <button onClick={() => tagSelectionManually('SPELL')}>🪄 Tag as Spell</button>
                <button onClick={() => tagSelectionManually('MONSTER')}>💀 Tag as Monster</button>
              </>
            )}
            <button onClick={() => setShowFabOptions(false)} className="button button-secondary">Cancel</button>
          </div>
        </div>
      )}

      {currentTypeName === 'Notes' && showNewNoteForm && (
        <div className="popup-box" style={{ bottom: '20px', right: '20px', width: 'auto', minWidth: '300px', maxWidth: '500px' }}>
          <div style={{ margin: '0 auto' }}>
            <h3 className="form-page-container-subheader">New Note</h3> {/* Using a more generic subheader class */}
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              rows={5}
              placeholder="Enter your campaign note here..."
            />
            <div className="button-row">
              <button onClick={submitNewNote} disabled={submitting || !newNoteContent.trim()} className="button">
                {submitting ? 'Saving...' : 'Save Note'}
              </button>
              <button onClick={() => setShowNewNoteForm(false)} className="button button-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HomePage;
