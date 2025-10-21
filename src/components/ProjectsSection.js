import React from 'react';
import './ProjectsSection.css';

const ProjectsSection = ({ t }) => {
  const handleTCCRedirect = () => {
    window.open('https://www.gustavobit.com/tcc-express-supermarket-fe', '_blank');
  };

  return (
    <section id="projects">
      <div className="projects-container">
        <div className="projects-header">
          <h1>{t('projects-title')}</h1>
          <p>{t('projects-description')}</p>
        </div>
        
        <div className="projects-grid">
          <div className="project-card">
            <div className="project-image">
              <img 
                src="/images/tcc-app-screenshot.png" 
                alt={t('tcc-express-supermarket')}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="image-placeholder" style={{display: 'none'}}>
                <div className="placeholder-icon">
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#00ffcc" strokeWidth="2" fill="none"/>
                    <path d="14 2V8H20" stroke="#00ffcc" strokeWidth="2" fill="none"/>
                    <path d="16 13H8" stroke="#00ffcc" strokeWidth="2"/>
                    <path d="16 17H8" stroke="#00ffcc" strokeWidth="2"/>
                    <path d="10 9H9H8" stroke="#00ffcc" strokeWidth="2"/>
                  </svg>
                </div>
                <p>{t('image-coming-soon')}</p>
              </div>
            </div>
            
            <div className="project-content">
              <h3>{t('tcc-express-supermarket')}</h3>
              <div className="project-tech">
                <span className="tech-tag">Node.js</span>
                <span className="tech-tag">React.js</span>
                <span className="tech-tag">E-commerce</span>
              </div>
              <p>{t('tcc-project-description')}</p>
              
              <div className="project-features">
                <h4>{t('key-features')}</h4>
                <ul>
                  <li>{t('feature-ecommerce')}</li>
                  <li>{t('feature-barcode')}</li>
                  <li>{t('feature-location')}</li>
                </ul>
              </div>
              
              <button 
                className="project-btn"
                onClick={handleTCCRedirect}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M15 3H21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {t('view-project')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;