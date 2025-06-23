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
  const [newlyCreatedTags, setNewlyCreatedTags] = useState([]);
  const [showTagNotifications, setShowTagNotifications] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const addTagNotification = (tagInfo) => {
    // Avoid duplicates if the same tag is somehow added multiple times quickly
    setNewlyCreatedTags(prevTags => {
      if (!prevTags.find(t => t.name === tagInfo.name && t.type === tagInfo.type)) {
        return [...prevTags, tagInfo];
      }
      return prevTags;
    });
    // setShowTagNotifications(true); // Show immediately or let user click bell? Let user click.
  };

  const clearTagNotifications = () => {
    setNewlyCreatedTags([]);
    setShowTagNotifications(false);
  };

  const toggleTagNotifications = () => {
    setShowTagNotifications(prev => !prev);
  };

  const fetchCharacters = async () => {
    try {
      // Fetch detailed player characters
      const pcRes = await apiClient.get('/entities/player-characters-detailed');
      const detailedPcs = pcRes.data || [];
      setPlayerCharacters(detailedPcs);

      // Fetch all persons to then filter for party members (if party members can be non-PCs)
      // Or, if party members are always a subset of all persons and might also have detailed views later,
      // this separate fetch might be refined. For now, keeping it simple.
      const allPersonsRes = await apiClient.get('/entities/by-type/PERSON');
      const allPersons = allPersonsRes.data || [];
      const party = allPersons.filter(p => p.is_party_member === true);
      setPartyMembers(party);

    } catch (err) {
      console.error('Failed to fetch PC/Party data for sidebar:', err);
      setPlayerCharacters([]);
      setPartyMembers([]);
    }
  };

  // Fetch characters on initial mount
  useEffect(() => {
    fetchCharacters();
  }, []);

  const handleRemoveSidebarFlag = async (nodeId, flagToRemove) => {
    // Find the character to get their name and current flag states
    const characterNode = playerCharacters.find(p => p.id === nodeId) || partyMembers.find(p => p.id === nodeId);
    const characterName = characterNode ? characterNode.name : 'this character';
    const flagDescription = flagToRemove === 'is_player_character' ? 'Player Character' : 'Party Member';

    if (!window.confirm(`Are you sure you want to remove the "${flagDescription}" status from ${characterName}?`)) {
      return;
    }
    try {
      // We must send both flags to the backend, preserving the one not being changed.
      const payload = {
        newType: 'PERSON', // Keep type as PERSON
        isPlayerCharacter: flagToRemove === 'is_player_character' ? false : (characterNode ? !!characterNode.is_player_character : false),
        isPartyMember: flagToRemove === 'is_party_member' ? false : (characterNode ? !!characterNode.is_party_member : false),
      };

      await apiClient.patch(`/nodes/${nodeId}/type`, payload);
      fetchCharacters(); // Refresh lists
      alert(`"${flagDescription}" status removed successfully from ${characterName}.`);
    } catch (err) {
      console.error(`Failed to remove ${flagDescription} status for node ${nodeId}:`, err);
      alert(`Failed to remove status: ${err.response?.data?.message || err.message}`);
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
  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
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
        <div className="header-actions">
          <button onClick={handleLogout} className="logout-button">Logout</button>
          <div className="notification-bell-area">
            <button onClick={toggleTagNotifications} className="button-icon notification-bell" title="Show new tags">
              🔔
              {newlyCreatedTags.length > 0 && (
                <span className="notification-badge">{newlyCreatedTags.length}</span>
              )}
            </button>
            {showTagNotifications && newlyCreatedTags.length > 0 && (
              <div className="notifications-dropdown">
                <h4>Newly Created Tags:</h4>
                <ul>
                  {newlyCreatedTags.map((tag, index) => (
                    <li key={index}>{tag.name} ({tag.type})</li>
                  ))}
                </ul>
                <button onClick={clearTagNotifications} className="button button-small">Clear Notifications</button>
              </div>
            )}
             {showTagNotifications && newlyCreatedTags.length === 0 && (
              <div className="notifications-dropdown">
                <p>No new tags yet in this session.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="app-content-area"> {/* Second child of app-container, flex-direction: row */}
        <div className="app-wrapper"> {/* First child of app-content-area, for Outlet */}
          {/* Pass addTagNotification to child components rendered by Outlet */}
          <Outlet context={{ addTagNotification }} />
        </div>

        <div className="pc-sidebar"> {/* Second child of app-content-area */}
          <div className="sidebar-section-header">
            <h3>Player Characters</h3>
            <button onClick={() => handleSortToggle('pc')} className="button-icon button-sort-sidebar" title={`Change sort order for Player Characters`}>
              {pcSortMode === 'current' ? 'Sort A-Z' : pcSortMode === 'az' ? 'Sort Z-A' : 'Original Order'}
            </button>
          </div>
          {displayedPcs.length > 0 ? displayedPcs.map((pc) => (
            <div key={pc.id} className="pc-tile">
              <div className="pc-tile-info">
                <Link to={`/node/${pc.id}`} className="entity-link">
                   <h4>
                     {pc.name}
                     {(pc.race_name || pc.main_class) && (
                       <span className="pc-details-sidebar">
                         {' - '}
                         {pc.race_name && <span>{pc.race_name}</span>}
                         {pc.race_name && pc.main_class && <span> </span>} {/* Space between */}
                         {pc.main_class && <span>{pc.main_class}</span>}
                       </span>
                     )}
                   </h4>
                </Link>
                 {pc.location_name && pc.location_id && (
                   <div className="pc-last-location">
                     <small>Last seen: <Link to={`/node/${pc.location_id}`}>{pc.location_name}</Link></small>
                   </div>
                 )}
                 {/* Optional: Display other tags if needed, excluding "Player Character" */}
                 {/* {pc.tags && pc.tags.filter(tag => tag !== "Player Character").map(tag =>
                  <small key={tag} className="tag pc-general-tag">{tag}</small>
                 )} */}
              </div>
              <button
                onClick={() => handleRemoveSidebarFlag(pc.id, "is_player_character")}
                className="button-text button-remove-sidebar-flag"
                title="Remove from Player Characters"
              >Remove</button>
            </div>
          )) : <p>No Player Characters found.</p>}

          <div className="sidebar-section-header">
            <h3>Party Members</h3>
            <button onClick={() => handleSortToggle('party')} className="button-icon button-sort-sidebar" title={`Change sort order for Party Members`}>
              {partySortMode === 'current' ? 'Sort A-Z' : partySortMode === 'az' ? 'Sort Z-A' : 'Original Order'}
            </button>
          </div>
          {displayedPartyMembers.length > 0 ? displayedPartyMembers.map((member) => (
            <div key={member.id} className="pc-tile">
              <div className="pc-tile-info">
                <Link to={`/node/${member.id}`} className="entity-link">
                  <h4>{member.name}</h4>
                </Link>
                {/* This member.tags logic is now potentially obsolete */}
                {member.tags && member.tags.filter(tag => tag !== "Party Member").map(tag =>
                  <small key={tag} className="tag party-general-tag">{tag}</small>
                )}
              </div>
              <button
                onClick={() => handleRemoveSidebarFlag(member.id, "is_party_member")}
                className="button-text button-remove-sidebar-flag"
                title="Remove from Party Members"
              >Remove</button>
            </div>
          )) : <p>No Party Members found.</p>}
        </div>
      </div>
      </div>
  );
};

export default MainLayout;
