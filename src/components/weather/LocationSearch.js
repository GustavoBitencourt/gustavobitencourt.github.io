import React, { useEffect, useRef, useState } from 'react';
import './LocationSearch.css';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

// Destaca o trecho digitado dentro do nome da cidade
const highlight = (text, term) => {
  const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const idx = normalize(text).indexOf(normalize(term.trim()));
  if (idx === -1 || !term.trim()) return text;
  const end = idx + term.trim().length;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, end)}</mark>
      {text.slice(end)}
    </>
  );
};

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const LocateIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const LocationSearch = ({ onLocationSelect, onUseCurrentLocation }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [noResults, setNoResults] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Busca em tempo real com debounce e cancelamento da requisição anterior
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < MIN_CHARS) {
      setSearchResults([]);
      setNoResults(false);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=7&language=pt&format=json`,
          { signal: controller.signal }
        );
        const data = await response.json();
        const results = data.results || [];
        setSearchResults(results);
        setNoResults(results.length === 0);
        setActiveIndex(results.length ? 0 : -1);
        setOpen(true);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Erro na busca de localização:', error);
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, []);

  const selectLocation = (location) => {
    onLocationSelect(location);
    setSearchResults([]);
    setSearchTerm('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const choice = searchResults[activeIndex] || searchResults[0];
    if (choice) selectLocation(choice);
  };

  const handleKeyDown = (e) => {
    if (!open || !searchResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showDropdown = open && searchTerm.trim().length >= MIN_CHARS && (searchResults.length > 0 || noResults);

  return (
    <div className="location-search" ref={containerRef}>
      <form onSubmit={handleSubmit} className={`search-form ${showDropdown ? 'is-open' : ''}`} role="search">
        <div className="search-input-container">
          <span className="search-leading-icon">
            {searching ? <span className="search-spinner" /> : <SearchIcon />}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar cidade, região ou país..."
            className="search-input"
            autoComplete="off"
            spellCheck="false"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="location-search-results"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `location-option-${activeIndex}` : undefined}
          />
          {searchTerm && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                setSearchTerm('');
                inputRef.current?.focus();
              }}
              aria-label="Limpar busca"
            >
              ×
            </button>
          )}
          {onUseCurrentLocation && (
            <button
              type="button"
              className="search-locate"
              onClick={onUseCurrentLocation}
              title="Usar minha localização"
              aria-label="Usar minha localização"
            >
              <LocateIcon />
            </button>
          )}
        </div>
      </form>

      {showDropdown && (
        <ul className="search-results" id="location-search-results" role="listbox">
          {noResults && <li className="search-empty">Nenhum lugar encontrado para “{searchTerm.trim()}”</li>}
          {searchResults.map((location, i) => (
            <li
              key={location.id || `${location.latitude}-${location.longitude}`}
              id={`location-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`search-result-item ${i === activeIndex ? 'active' : ''}`}
              onPointerEnter={() => setActiveIndex(i)}
              onClick={() => selectLocation(location)}
            >
              {location.country_code ? (
                <img
                  className="result-flag"
                  src={`https://flagcdn.com/w40/${location.country_code.toLowerCase()}.png`}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="result-flag placeholder">📍</span>
              )}
              <div className="result-text">
                <div className="location-name">{highlight(location.name, searchTerm)}</div>
                <div className="location-sub">
                  {[location.admin1, location.country].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="location-coords">
                {location.latitude.toFixed(2)}°, {location.longitude.toFixed(2)}°
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocationSearch;
