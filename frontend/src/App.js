import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import NoteEntry from './components/NoteEntry';
import HomePage from './components/HomePage';
import NodePage from './components/NodePage';
import EditNotePage from './components/EditNotePage'; // Import the new component

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/note" element={<NoteEntry />} />
        <Route path="/node/:nodeId" element={<NodePage />} />
        <Route path="/notes/:id/edit" element={<EditNotePage />} /> {/* Add the new route */}
      </Routes>
    </Router>
  );
}

export default App;
