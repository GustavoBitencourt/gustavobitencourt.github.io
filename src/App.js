import React from 'react';
import StarryBackground from './components/StarryBackground';
import LanguageSwitcher from './components/LanguageSwitcher';
import IntroSection from './components/IntroSection';
import SkillsSection from './components/SkillsSection';
import ContactSection from './components/ContactSection';
import { useLanguage } from './hooks/useLanguage';
import './App.css';

function App() {
  const { currentLanguage, changeLanguage, t } = useLanguage();

  return (
    <div className="App">
      <div className="hero-section">
        <StarryBackground />
        <LanguageSwitcher 
          currentLanguage={currentLanguage} 
          onLanguageChange={changeLanguage} 
        />
        <IntroSection t={t} />
      </div>
      <SkillsSection t={t} />
      <ContactSection t={t} />
    </div>
  );
}

export default App;