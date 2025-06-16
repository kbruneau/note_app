import React, { useState, useEffect } from 'react';
import axios from 'axios';

const NameGenerator = () => {
  const [options, setOptions] = useState({});
  const [selectedRace, setSelectedRace] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [generatedName, setGeneratedName] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:4000/api/name-options')
      .then(res => setOptions(res.data))
      .catch(err => console.error(err));
  }, []);

  const handleGenerate = () => {
    if (!selectedRace || !selectedOption) return;

    axios.get('http://localhost:4000/api/random-name', {
      params: { race: selectedRace, option: selectedOption }
    })
      .then(res => setGeneratedName(res.data))
      .catch(err => console.error(err));
  };

  return (
    <div>
      <h2>D&D Name Generator</h2>

      <label>Race:</label>
      <select value={selectedRace} onChange={e => {
        setSelectedRace(e.target.value);
        setSelectedOption(''); // reset option when race changes
      }}>
        <option value="">-- Select Race --</option>
        {Object.keys(options).map(race => (
          <option key={race} value={race}>{race}</option>
        ))}
      </select>

      <label>Option:</label>
      <select value={selectedOption} onChange={e => setSelectedOption(e.target.value)}>
        <option value="">-- Select Option --</option>
        {(options[selectedRace] || []).map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>

      <button onClick={handleGenerate} disabled={!selectedRace || !selectedOption}>
        Generate Name
      </button>

      {generatedName && (
        <div>
          <h3>🎲 You rolled {generatedName.roll}:</h3>
          <strong>{generatedName.name}</strong> ({generatedName.race} {generatedName.option})
        </div>
      )}
    </div>
  );
};

export default NameGenerator;
