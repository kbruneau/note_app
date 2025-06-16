import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import NoteEntry from './components/NoteEntry';
import HomePage from './components/HomePage';
import NodePage from './components/NodePage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/note" element={<NoteEntry />} />
        <Route path="/node/:nodeId" element={<NodePage />} />
      </Routes>
    </Router>
  );
}

export default App;
