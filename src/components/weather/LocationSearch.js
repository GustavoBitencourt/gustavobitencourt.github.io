import React, { useState } from 'react';
import './LocationSearch.css';

const LocationSearch = ({ onLocationSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const searchLocations = async () => {
    if (!searchTerm.trim()) return;
    
    setSearching(true);
    try {
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=5&language=pt&format=json`
      );
      
      const data = await response.json();
      setSearchResults(data.results || []);
      
    } catch (error) {
      console.error('Erro na busca de localização:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    searchLocations();
  };

  const selectLocation = (location) => {
    onLocationSelect(location);
    setSearchResults([]);
    setSearchTerm('');
  };

  return (
    <div className="location-search">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-container">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cidade, região ou país..."
            className="search-input"
          />
          <button type="submit" className="search-button" disabled={searching}>
            {searching ? '🔄' : '🔍'}
          </button>
        </div>
      </form>

      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((location) => (
            <div
              key={`${location.latitude}-${location.longitude}`}
              className="search-result-item"
              onClick={() => selectLocation(location)}
            >
              <div className="location-name">
                <strong>{location.name}</strong>
                {location.admin1 && `, ${location.admin1}`}
                {location.country && ` - ${location.country}`}
              </div>
              <div className="location-coords">
                📍 {location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LocationSearch;
