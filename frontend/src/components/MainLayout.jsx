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

  const navigate = useNavigate();
  const location = useLocation();

  const fetchCharacters = async () => {
    try {
      const res = await apiClient.get('/entities/by-type/PERSON');
      const allPersons = res.data || [];
      // Assuming tags are already JSON arrays from the backend
      const pcs = allPersons.filter(p => p.tags && p.tags.includes('Player Character'));
      const party = allPersons.filter(p => p.tags && p.tags.includes('Party Member'));
      setPlayerCharacters(pcs);
      setPartyMembers(party);
    } catch (err) {
      console.error('Failed to fetch PC/Party data for sidebar:', err);
    }
  };

  // Fetch characters on initial mount
  useEffect(() => {
    fetchCharacters();
  }, []);

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
    // setActiveTab(tabName); // This will be set by the useEffect listening to location.pathname
  };

  return (
    <div className="app-container"> {/* Outermost container for flex layout */}
      <div className="app-wrapper"> {/* Main content area, takes remaining space */}
        <div className="page-header-banner">
          <Link to="/" style={{ textDecoration: 'none' }}> {/* Make title a link to home */}
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

        {/* Content of the current route will be rendered here */}
        <Outlet />
      </div>

      <div className="pc-sidebar">
        <h3>Player Characters</h3>
        {playerCharacters.length > 0 ? playerCharacters.map((pc) => (
          <div key={pc.id} className="pc-tile">
            <Link to={`/node/${pc.id}`} className="entity-link">
              <h4>{pc.name}</h4>
            </Link>
            {/* Assuming tags is an array */}
            {pc.tags && pc.tags.map(tag => <small key={tag} className="tag pc">{tag}</small>)}
          </div>
        )) : <p>No Player Characters found.</p>}

        <h3>Party Members</h3>
        {partyMembers.length > 0 ? partyMembers.map((member) => (
          <div key={member.id} className="pc-tile">
            <Link to={`/node/${member.id}`} className="entity-link">
              <h4>{member.name}</h4>
            </Link>
            {member.tags && member.tags.map(tag => <small key={tag} className="tag party">{tag}</small>)}
          </div>
        )) : <p>No Party Members found.</p>}
      </div>
    </div>
  );
};

export default MainLayout;
