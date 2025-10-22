import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import StarryBackground from './components/StarryBackground';
import LanguageSwitcher from './components/LanguageSwitcher';
import IntroSection from './components/IntroSection';
import SkillsSection from './components/SkillsSection';
import ProjectsSection from './components/ProjectsSection';
import ContactSection from './components/ContactSection';
import Player from './components/Player';
import CS2 from './components/CS2';
import TestInventory from './components/TestInventory';
import SimpleInventoryTest from './components/SimpleInventoryTest';
import { useLanguage } from './hooks/useLanguage';
import './App.css';

function App() {
  const { currentLanguage, changeLanguage, t } = useLanguage();

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={
            <>
              <div className="hero-section">
                <StarryBackground />
                <LanguageSwitcher 
                  currentLanguage={currentLanguage} 
                  onLanguageChange={changeLanguage} 
                />
                <IntroSection t={t} />
              </div>
              <SkillsSection t={t} />
              <ProjectsSection t={t} />
              <ContactSection t={t} />
            </>
          } />
          <Route path="/player" element={<Player />} />
          <Route path="/cs2" element={<CS2 />} />
          <Route path="/test-inventory" element={<TestInventory />} />
          <Route path="/simple-test" element={<SimpleInventoryTest />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;