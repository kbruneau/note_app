import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../services/apiClient';
import '../App.css'; // Assuming App.css contains all necessary global styles

const tabOptions = ['Notes', 'People', 'Places', 'Items', 'Spells'];
const tabPaths = {
  'Notes': '/', // Or '/notes' if that's the preferred route for notes
  'People': '/people',
  'Places': '/places',
  'Items': '/items',
  'Spells': '/spells',
};

const MainLayout = () => {
  const [activeTab, setActiveTab] = useState('Notes');
  const [playerCharacters, setPlayerCharacters] = useState([]);
  const [partyMembers, setPartyMembers] = useState([]);
  const [pcSortMode, setPcSortMode] = useState('current'); // 'current', 'az', 'za'
  const [partySortMode, setPartySortMode] = useState('current'); // 'current', 'az', 'za'

  const navigate = useNavigate();
  const location = useLocation();

  const fetchCharacters = async () => {
    try {
      const res = await apiClient.get('/entities/by-type/PERSON');
      const allPersons = res.data || [];
      const pcs = allPersons.filter(p => p.tags && p.tags.includes('Player Character'));
      const party = allPersons.filter(p => p.tags && p.tags.includes('Party Member'));
      setPlayerCharacters(pcs);
      setPartyMembers(party);
    } catch (err) {
      console.error('Failed to fetch PC/Party data for sidebar:', err);
      // Potentially set them to empty arrays on error
      setPlayerCharacters([]);
      setPartyMembers([]);
    }
  };

  // Fetch characters on initial mount
  useEffect(() => {
    fetchCharacters();
  }, []);

  const handleRemoveSidebarTag = async (nodeId, tagToRemove) => {
    if (!window.confirm(`Are you sure you want to remove the "${tagToRemove}" tag from this character?`)) {
      return;
    }
    try {
      await apiClient.delete(`/nodes/${nodeId}/tags`, { data: { tag_to_remove: tagToRemove } });
      // Refresh the character lists
      fetchCharacters();
      alert(`Tag "${tagToRemove}" removed successfully.`);
    } catch (err) {
      console.error(`Failed to remove tag "${tagToRemove}":`, err);
      alert(`Failed to remove tag: ${err.response?.data?.message || err.message}`);
    }
  };

  // Determine activeTab based on current URL path
  useEffect(() => {
    const currentPath = location.pathname;
    let foundTab = 'Notes'; // Default
    for (const [tabName, path] of Object.entries(tabPaths)) {
      // Handle base path for "Notes" and exact matches for others
      if (path === '/' && currentPath === '/') {
        foundTab = tabName;
        break;
      } else if (path !== '/' && currentPath.startsWith(path)) {
        foundTab = tabName;
        break;
      }
    }
    setActiveTab(foundTab);
  }, [location.pathname]);

  const handleTabClick = (tabName) => {
    const path = tabPaths[tabName] || '/';
    navigate(path);
  };

  const handleSortToggle = (listType) => {
    if (listType === 'pc') {
      setPcSortMode(prevMode => {
        if (prevMode === 'current') return 'az';
        if (prevMode === 'az') return 'za';
        return 'current';
      });
    } else if (listType === 'party') {
      setPartySortMode(prevMode => {
        if (prevMode === 'current') return 'az';
        if (prevMode === 'az') return 'za';
        return 'current';
      });
    }
  };

  let displayedPcs = [...playerCharacters];
  if (pcSortMode === 'az') {
    displayedPcs.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
  } else if (pcSortMode === 'za') {
    displayedPcs.sort((a, b) => (b.name || "").toLowerCase().localeCompare((a.name || "").toLowerCase()));
  }
  // If 'current', displayedPcs remains the fetched order

  let displayedPartyMembers = [...partyMembers];
  if (partySortMode === 'az') {
    displayedPartyMembers.sort((a, b) => (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase()));
  } else if (partySortMode === 'za') {
    displayedPartyMembers.sort((a, b) => (b.name || "").toLowerCase().localeCompare((a.name || "").toLowerCase()));
  }
  // If 'current', displayedPartyMembers remains the fetched order


  return (
    <div className="app-container"> {/* Outermost container, flex-direction: column */}
      <div className="page-header-banner"> {/* First child of app-container */}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <h2 className="entity-header">D&D Campaign Notes</h2>
        </Link>
        <nav className="navbar">
          {tabOptions.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={activeTab === tab ? 'active' : ''}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="app-content-area"> {/* Second child of app-container, flex-direction: row */}
        <div className="app-wrapper"> {/* First child of app-content-area, for Outlet */}
          <Outlet />
        </div>

        <div className="pc-sidebar"> {/* Second child of app-content-area */}
          <div className="sidebar-section-header">
            <h3>Player Characters</h3>
            <button onClick={() => handleSortToggle('pc')} className="button-icon button-sort-sidebar" title={`Sort PC List (${pcSortMode})`}>
              {pcSortMode === 'current' ? 'A-Z' : pcSortMode === 'az' ? 'Z-A' : ' デフォルト'} {/* Default/Original sort order */}
            </button>
          </div>
          {displayedPcs.length > 0 ? displayedPcs.map((pc) => (
            <div key={pc.id} className="pc-tile">
              <div className="pc-tile-info">
                <Link to={`/node/${pc.id}`} className="entity-link">
                  <h4>{pc.name}</h4>
                </Link>
                {/* Filter out the specific 'Player Character' tag before mapping, if other tags exist */}
                {pc.tags && pc.tags.filter(tag => tag !== "Player Character").map(tag =>
                  <small key={tag} className="tag pc-general-tag">{tag}</small>
                )}
              </div>
              <button
                onClick={() => handleRemoveSidebarTag(pc.id, "Player Character")}
                className="button-icon button-remove-sidebar-tag"
                title="Remove from Player Characters"
              >×</button>
            </div>
          )) : <p>No Player Characters found.</p>}

          <div className="sidebar-section-header">
            <h3>Party Members</h3>
            <button onClick={() => handleSortToggle('party')} className="button-icon button-sort-sidebar" title={`Sort Party List (${partySortMode})`}>
              {partySortMode === 'current' ? 'A-Z' : partySortMode === 'az' ? 'Z-A' : 'デフォルト'}
            </button>
          </div>
          {displayedPartyMembers.length > 0 ? displayedPartyMembers.map((member) => (
            <div key={member.id} className="pc-tile">
              <div className="pc-tile-info">
                <Link to={`/node/${member.id}`} className="entity-link">
                  <h4>{member.name}</h4>
                </Link>
                {member.tags && member.tags.filter(tag => tag !== "Party Member").map(tag =>
                  <small key={tag} className="tag party-general-tag">{tag}</small>
                )}
              </div>
              <button
                onClick={() => handleRemoveSidebarTag(member.id, "Party Member")}
                className="button-icon button-remove-sidebar-tag"
                title="Remove from Party Members"
              >×</button>
            </div>
          )) : <p>No Party Members found.</p>}
        </div>
      </div>
  );
};

export default MainLayout;
