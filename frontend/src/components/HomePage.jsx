import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../App.css';
import { useLocation } from 'react-router-dom';

const tabOptions = ['Notes', 'People', 'Places', 'Items', 'Spells'];

const HomePage = () => {
  const [activeTab, setActiveTab] = useState('Notes');
  const [data, setData] = useState([]);
  const [sortByRecent, setSortByRecent] = useState(true);
  const [editNoteId, setEditNoteId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [showNewNoteForm, setShowNewNoteForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selection, setSelection] = useState({ text: '', start: null, end: null });
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [showFabOptions, setShowFabOptions] = useState(false);
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [partyMembers, setPartyMembers] = useState([]);
  const [existingNode, setExistingNode] = useState(null);

  const fetchCharacters = async () => {
    const parseTags = (tags) => {
      if (Array.isArray(tags)) return tags;
      try {
        // Safely parse PostgreSQL-style array string to JS array
        return JSON.parse(tags.replace(/^{/, '[').replace(/}$/, ']'));
      } catch {
        return [];
      }
    };
  
    try {
      const res = await axios.get('http://localhost:4000/api/entities/by-type/PERSON');
  
      const pcs = res.data.filter(p => parseTags(p.tags).includes('Player Character'));
      const party = res.data.filter(p => parseTags(p.tags).includes('Party Member'));
  
      setPlayerCharacters(pcs);
      setPartyMembers(party);
    } catch (err) {
      console.error('Failed to fetch PC/Party data', err);
    }
  };
  const location = useLocation();
  const [highlightNoteId, setHighlightNoteId] = useState(null);
  
  useEffect(() => {
    const hash = location.hash;
    if (hash.startsWith('#note-')) {
      const id = parseInt(hash.replace('#note-', ''), 10);
      setHighlightNoteId(id);
      setActiveTab('Notes');
      setTimeout(() => {
        const el = document.getElementById(`note-${id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlighted');
          setTimeout(() => el.classList.remove('highlighted'), 3000);
        }
      }, 300); // Delay to wait for render
    }
  }, [location, data]);

  useEffect(() => {
    const typeMap = {
      Notes: 'NOTES',
      People: 'PERSON',
      Places: 'LOCATION',
      Items: 'ITEM',
      Spells: 'SPELL'
    };
    const fetchData = async () => {
      try {
        const endpoint = activeTab === 'Notes' ? 'notes' : `entities/by-type/${typeMap[activeTab]}`;
        const res = await axios.get(`http://localhost:4000/api/${endpoint}`);
        setData(res.data);
      } catch (err) {
        console.error('Failed to fetch data', err);
        setData([]);
      }
    };

    fetchData();
    fetchCharacters();
  }, [activeTab]);

  const handleTextSelect = async (noteId, content) => {
    const selectionObj = window.getSelection();
    const text = selectionObj.toString().trim();
    if (!text) return;

    const start = content.indexOf(text);
    const end = start + text.length;
    if (start === -1) return;

    setSelection({ text, start, end });
    setSelectedNoteId(noteId);
    setShowFabOptions(true);

    try {
      const res = await axios.get(`http://localhost:4000/api/nodes/by-name/${encodeURIComponent(text)}`);
      setExistingNode(res.data || null);
    } catch {
      setExistingNode(null);
    }
  };

  const tagSelectionManually = async (type) => {
    if (!selection.text || selectedNoteId == null) return;
    try {
      await axios.post('http://localhost:4000/api/manual-tag', {
        name: selection.text,
        note_id: selectedNoteId,
        type,
        start_pos: selection.start,
        end_pos: selection.end
      });
      setSelection({ text: '', start: null, end: null });
      setSelectedNoteId(null);
      setShowFabOptions(false);
      await axios.post('http://localhost:4000/api/retag-entity-everywhere', {
        name: selection.text,
        type
      });
      await fetchCharacters();
    } catch (err) {
      console.error('Failed to manually tag:', err);
      alert('Error tagging word. Check console.');
    }
  };

  const tagWithPersonTag = async (tagLabel) => {
    if (!selection.text || selectedNoteId == null) return;
    try {
      await axios.post('http://localhost:4000/api/manual-tag', {
        name: selection.text,
        note_id: selectedNoteId,
        type: 'PERSON',
        start_pos: selection.start,
        end_pos: selection.end,
        tag: tagLabel
      });
      setSelection({ text: '', start: null, end: null });
      setSelectedNoteId(null);
      setShowFabOptions(false);
      await axios.post('http://localhost:4000/api/retag-entity-everywhere', {
        name: selection.text,
        type: 'PERSON'
      });
      await fetchCharacters();  // <--- Ensures sidebar is updated immediately
    } catch (err) {
      console.error('Failed to tag with person label:', err);
      alert('Error tagging with PC/Party label.');
    }
  };

  const startEdit = (note) => {
    setEditNoteId(note.id);
    setEditContent(note.content);
  };

  const saveEdit = async (id) => {
    try {
      await axios.put(`http://localhost:4000/api/notes/${id}`, { content: editContent });
      setEditNoteId(null);
      setEditContent('');
      const res = await axios.get('http://localhost:4000/api/notes');
      setData(res.data);
    } catch (err) {
      console.error('Failed to update note:', err);
    }
  };

  const deleteNote = async (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      await axios.delete(`http://localhost:4000/api/notes/${id}`);
      setData(data.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const submitNewNote = async () => {
    if (!newNoteContent.trim()) return;
    setSubmitting(true);
    try {
      await axios.post('http://localhost:4000/api/add-note', {
        content: newNoteContent
      });
      setNewNoteContent('');
      setShowNewNoteForm(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const refreshed = await axios.get('http://localhost:4000/api/notes');
      setData(refreshed.data);
    } catch (err) {
      console.error('Failed to submit new note:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-wrapper">
      <h2 className="entity-header">D&D Campaign Notes</h2>
      <div className="navbar">
        {tabOptions.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={tab === activeTab ? 'active' : ''}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Notes' ? (
        <>
          <div className="sort-bar">
            <button className="button" onClick={() => setSortByRecent(!sortByRecent)}>
              Sort by {sortByRecent ? 'Note Number' : 'Most Recent'}
            </button>
          </div>
          <ul className="note-list">
            {[...data]
              .sort((a, b) =>
                sortByRecent
                  ? new Date(b.created_at) - new Date(a.created_at)
                  : a.id - b.id
              )
              .map((n) => (
                  <li
                    key={n.id}
                    id={`note-${n.id}`}
                    className={`note-card ${highlightNoteId === n.id ? 'highlighted' : ''}`}
                  >
                  <div className="entity-meta">
                  <a
                  href={`/#note-${n.id}`}
                  className="entity-link"
                  style={{ textDecoration: 'none' }}
                >
                  <strong>Note #{n.id}</strong>
                </a>
                    <em>({new Date(n.created_at).toLocaleString()})</em>
                  </div>
                  {editNoteId === n.id ? (
                    <>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                      />
                      <div className="button-row">
                        <button className="button" onClick={() => saveEdit(n.id)}>Save</button>
                        <button className="button" onClick={() => setEditNoteId(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div className="mention-entry">
                      <div
                        className="note-content"
                        onMouseUp={() => handleTextSelect(n.id, n.content)}
                      >
                        {n.content}
                      </div>
                      <div className="button-row">
                        <button className="button" onClick={() => startEdit(n)}>Edit</button>
                        <button className="button" onClick={() => deleteNote(n.id)}>Delete</button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </>
      ) : (
        <ul className="entity-list">
          {data.map((n) => (
            <li key={n.id}>
              <a href={`/node/${n.id}`} className="entity-link">{n.name}</a>
            </li>
          ))}
        </ul>
      )}

      {!showNewNoteForm && !showFabOptions && (
        <button onClick={() => setShowNewNoteForm(true)} className="fab">
          +
        </button>
      )}

      {showFabOptions && (
        <div className="popup-box">
          <p style={{ marginBottom: '0.5rem' }}>Tag "{selection.text}" as:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {existingNode?.type === 'PERSON' ? (
              <>
                <p><em>{selection.text}</em> is already tagged as a Person.</p>
                <button onClick={() => tagWithPersonTag('Player Character')}>Add Player Character Tag</button>
                <button onClick={() => tagWithPersonTag('Party Member')}>Add Party Member Tag</button>
              </>
            ) : existingNode ? (
              <p><em>{selection.text}</em> is already tagged as {existingNode.type}.</p>
            ) : (
              <>
                <button onClick={() => tagSelectionManually('PERSON')}>Tag as Person</button>
                <button onClick={() => tagSelectionManually('LOCATION')}>Tag as Location</button>
                <button onClick={() => tagSelectionManually('ITEM')}>Tag as Item</button>
                <button onClick={() => tagSelectionManually('SPELL')}>Tag as Spell</button>
                <button onClick={() => tagSelectionManually('MONSTER')}>Tag as Monster</button>
              </>
            )}
            <button onClick={() => setShowFabOptions(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showNewNoteForm && (
        <div className="popup-box" style={{ bottom: 0, left: 0, right: 0, width: '100%' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <h4 className="entity-header">New Note</h4>
            <textarea
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              rows={3}
              placeholder="Enter your note here..."
            />
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={submitNewNote} disabled={submitting || !newNoteContent.trim()}>
                {submitting ? 'Saving...' : 'Save Note'}
              </button>
              <button onClick={() => setShowNewNoteForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

        <div className="pc-sidebar">
          <h3>Player Character</h3>
          {playerCharacters.map((pc) => (
            <div key={pc.id} className="pc-tile">
              <a href={`/node/${pc.id}`} className="entity-link">
                <h4>{pc.name}</h4>
              </a>
              <small className="tag pc">PC</small>
            </div>
          ))}

          <h3>Party Members</h3>
          {partyMembers.map((member) => (
            <div key={member.id} className="pc-tile">
              <a href={`/node/${member.id}`} className="entity-link">
                <h4>{member.name}</h4>
              </a>
              <small className="tag party">Party</small>
            </div>
          ))}
        </div>
    </div>
  );
};

export default HomePage;
