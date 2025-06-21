import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import MainLayout from './components/MainLayout'; // Import MainLayout
import HomePage from './components/HomePage';
import NoteEntry from './components/NoteEntry';
import NodePage from './components/NodePage';
import EditNotePage from './components/EditNotePage';
import NameGenerator from './components/NameGenerator'; // Import NameGenerator
import RegistrationPage from './components/RegistrationPage'; // Import RegistrationPage
import LoginPage from './components/LoginPage'; // Import LoginPage
import PrivateRoute from './components/PrivateRoute'; // Import PrivateRoute

function App() {
  return (
    <Router>
      <Routes>
        {/* Protected routes that use MainLayout */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path=":entityType" element={<HomePage />} />
          <Route path="notes/entry" element={<NoteEntry />} />
          <Route path="node/:nodeId" element={<NodePage />} />
          <Route path="notes/:id/edit" element={<EditNotePage />} />
          <Route path="tools/name-generator" element={<NameGenerator />} />
        </Route>

        {/* Standalone routes for authentication (no MainLayout) */}
        <Route path="/register" element={<RegistrationPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </Router>
  );
}

export default App;
