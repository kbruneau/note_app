import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import apiClient from '../services/apiClient';
import './FormPages.css'; // Assuming shared form styling

const CharacterSheetPage = () => {
  const { nodeId } = useParams();
  const navigate = useNavigate();

  const [sheetData, setSheetData] = useState({
    race: '',
    main_class: '',
    level: 1,
    background: '',
    alignment: '',
    experience_points: 0,
    player_name: '',
    race_id: '', // Changed from race: ''
    background_id: '', // Changed from background: ''
  });
  const [nodeName, setNodeName] = useState('');
  const [racesList, setRacesList] = useState([]);
  const [backgroundsList, setBackgroundsList] = useState([]);
  const [classesList, setClassesList] = useState([]);
  const [loading, setLoading] = useState(true); // For overall page load
  const [loadingOptions, setLoadingOptions] = useState(true); // For dropdown options
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchCoreData = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [racesRes, backgroundsRes, classesRes] = await Promise.all([
        apiClient.get('/core-data/races'),
        apiClient.get('/core-data/backgrounds'),
        apiClient.get('/core-data/available-classes'),
      ]);
      setRacesList(racesRes.data || []);
      setBackgroundsList(backgroundsRes.data || []);
      setClassesList(classesRes.data || []); // Expects an array of strings
    } catch (err) {
      console.error('Error fetching core data for dropdowns:', err);
      setError('Failed to load selection options. Please try reloading.');
      // Keep empty lists on error
      setRacesList([]);
      setBackgroundsList([]);
      setClassesList([]);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const fetchCharacterNode = useCallback(async () => {
    try {
      const nodeRes = await apiClient.get(`/nodes/${nodeId}`);
      setNodeName(nodeRes.data.name || 'Character');
      if (nodeRes.data.type !== 'PERSON' && nodeRes.data.is_player_character !== true) {
        // Optional: redirect or show error if not a PC, though backend checkNodeIsPC might handle some cases.
        // For now, we primarily rely on the sheet endpoint's behavior.
      }
    } catch (err) {
      console.error('Error fetching character node:', err);
      setError('Failed to load character details.');
      setNodeName('Character'); // Fallback
    }
  }, [nodeId]);

  const fetchSheetData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/nodes/${nodeId}/character-sheet`);
      if (response.data && Object.keys(response.data).length > 0 && response.data.node_id) { // Check if node_id exists to confirm valid sheet data
        setSheetData({
          race_id: response.data.race_id || '',
          main_class: response.data.main_class || '',
          level: response.data.level === null || response.data.level === undefined ? 1 : Number(response.data.level),
          background_id: response.data.background_id || '',
          alignment: response.data.alignment || '',
          experience_points: response.data.experience_points === null || response.data.experience_points === undefined ? 0 : Number(response.data.experience_points),
          player_name: response.data.player_name || '',
        });
      } else {
        // No sheet data found, reset to initial state with defaults
        setSheetData({
          race_id: '', main_class: '', level: 1, background_id: '',
          alignment: '', experience_points: 0, player_name: ''
        });
      }
      setError('');
    } catch (err) {
      console.error('Error fetching character sheet:', err);
      setError('Failed to load character sheet data. It might not exist yet.');
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    fetchCoreData(); // Fetch dropdown options
    fetchCharacterNode();
    fetchSheetData();
  }, [nodeId, fetchCoreData, fetchCharacterNode, fetchSheetData]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setSheetData(prevData => ({
      ...prevData,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Prepare data, ensuring numbers are numbers
    const payload = {
      ...sheetData,
      level: Number(sheetData.level) || 1,
      experience_points: Number(sheetData.experience_points) || 0,
    };

    try {
      await apiClient.put(`/nodes/${nodeId}/character-sheet`, payload);
      setSuccess('Character sheet saved successfully!');
      // Optionally, re-fetch data to confirm, though PUT should return the saved data
      // fetchSheetData();
    } catch (err) {
      console.error('Error saving character sheet:', err);
      setError(err.response?.data?.error || 'Failed to save character sheet.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !nodeName) { // Initial load state for node name
    return <p>Loading character information...</p>;
  }

  return (
    <div className="form-page-container character-sheet-page">
      <h2>Character Sheet: {nodeName}</h2>
      <button onClick={() => navigate(`/node/${nodeId}`)} className="button-secondary" style={{marginBottom: '1rem'}}>
        Back to Node View
      </button>

      <form onSubmit={handleSubmit}>
        {error && <p className="error-message">{error}</p>}
        {success && <p className="success-message">{success}</p>}

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="player_name">Player Name:</label>
            <input
              type="text"
              id="player_name"
              name="player_name"
              value={sheetData.player_name}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="alignment">Alignment:</label>
            <input
              type="text"
              id="alignment"
              name="alignment"
              value={sheetData.alignment}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="race_id">Race:</label>
            <select id="race_id" name="race_id" value={sheetData.race_id} onChange={handleChange} disabled={loadingOptions}>
              <option value="">{loadingOptions ? 'Loading...' : '-- Select Race --'}</option>
              {racesList.map(race => (
                <option key={race.id} value={race.id}>{race.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="background_id">Background:</label>
            <select id="background_id" name="background_id" value={sheetData.background_id} onChange={handleChange} disabled={loadingOptions}>
              <option value="">{loadingOptions ? 'Loading...' : '-- Select Background --'}</option>
              {backgroundsList.map(bg => (
                <option key={bg.id} value={bg.id}>{bg.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="main_class">Class:</label>
            <select id="main_class" name="main_class" value={sheetData.main_class} onChange={handleChange} disabled={loadingOptions}>
              <option value="">{loadingOptions ? 'Loading...' : '-- Select Class --'}</option>
              {classesList.map(className => (
                <option key={className} value={className}>{className}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="level">Level:</label>
            <input
              type="number"
              id="level"
              name="level"
              value={sheetData.level}
              onChange={handleChange}
              min="1"
            />
          </div>
          <div className="form-group">
            <label htmlFor="experience_points">Experience Points:</label>
            <input
              type="number"
              id="experience_points"
              name="experience_points"
              value={sheetData.experience_points}
              onChange={handleChange}
              min="0"
            />
          </div>
        </div>

        {loading && <p>Saving...</p>}
        <div className="button-row" style={{marginTop: '1rem'}}>
          <button type="submit" disabled={loading}>
            Save Character Sheet
          </button>
        </div>
      </form>
    </div>
  );
};

export default CharacterSheetPage;
