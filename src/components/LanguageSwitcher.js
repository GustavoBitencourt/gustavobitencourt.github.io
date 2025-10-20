import React, { useState } from 'react';
import { languageConfig } from '../utils/translations';

const LanguageSwitcher = ({ currentLanguage, onLanguageChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleLanguageSelect = (language) => {
    onLanguageChange(language);
    setIsOpen(false);
  };

  const currentConfig = languageConfig[currentLanguage];

  return (
    <div className={`language-switcher ${isOpen ? 'active' : ''}`}>
      <button 
        className="language-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flag">{currentConfig.flag}</span>
        <span className="lang-text">{currentConfig.text}</span>
        <span className="arrow">▼</span>
      </button>
      
      <div className="language-dropdown">
        {Object.entries(languageConfig).map(([code, config]) => (
          <div
            key={code}
            className={`language-option ${currentLanguage === code ? 'active' : ''}`}
            onClick={() => handleLanguageSelect(code)}
          >
            <span className="flag">{config.flag}</span>
            <span>{config.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LanguageSwitcher;