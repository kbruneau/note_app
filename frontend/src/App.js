import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MainLayout from './components/MainLayout'; // Import MainLayout
import HomePage from './components/HomePage';
import NoteEntry from './components/NoteEntry';
import NodePage from './components/NodePage';
import EditNotePage from './components/EditNotePage';
import NameGenerator from './components/NameGenerator'; // Import NameGenerator

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}> {/* Parent route using MainLayout */}
          <Route index element={<HomePage />} /> {/* Default for / (e.g., Notes tab) */}
          {/* Route for entity types like /people, /places. HomePage will handle :entityType */}
          <Route path=":entityType" element={<HomePage />} />
          <Route path="notes/entry" element={<NoteEntry />} /> {/* New path */}
          <Route path="node/:nodeId" element={<NodePage />} />
          <Route path="notes/:id/edit" element={<EditNotePage />} /> {/* Path kept similar for notes edit */}
          <Route path="tools/name-generator" element={<NameGenerator />} /> {/* New path */}
        </Route>
        {/* Other routes that should NOT use MainLayout can be defined here */}
      </Routes>
    </Router>
  );
}

export default App;
