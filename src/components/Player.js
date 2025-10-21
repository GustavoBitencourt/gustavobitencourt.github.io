import React from 'react';
import './Player.css';

const Player = () => {
  const handleWatchOnYouTube = () => {
    window.open('https://www.youtube.com/watch?v=9iewb1lvvLA', '_blank');
  };

  return (
    <div className="player-container">
      <div className="player-wrapper">
        <div className="video-blocked">
          <div className="youtube-icon">
            <svg width="80" height="56" viewBox="0 0 80 56" fill="none">
              <path d="M78.32 8.72C77.44 5.36 74.8 2.72 71.44 1.84C65.12 0 40 0 40 0S14.88 0 8.56 1.84C5.2 2.72 2.56 5.36 1.68 8.72C0 15.04 0 28 0 28S0 40.96 1.68 47.28C2.56 50.64 5.2 53.28 8.56 54.16C14.88 56 40 56 40 56S65.12 56 71.44 54.16C74.8 53.28 77.44 50.64 78.32 47.28C80 40.96 80 28 80 28S80 15.04 78.32 8.72Z" fill="#FF0000"/>
              <path d="M32 40L52 28L32 16V40Z" fill="white"/>
            </svg>
          </div>
          <h2>Vídeo Indisponível</h2>
          <p>Este vídeo apresenta conteúdo de LiveMode O&O, que bloqueou a exibição neste site ou aplicativo.</p>
          <button 
            className="watch-on-youtube-btn"
            onClick={handleWatchOnYouTube}
          >
            <svg width="24" height="17" viewBox="0 0 24 17" fill="none">
              <path d="M23.496 2.616C23.232 1.608 22.464 0.816 21.48 0.552C19.632 0 12 0 12 0S4.368 0 2.52 0.552C1.536 0.816 0.768 1.608 0.504 2.616C0 4.512 0 8.4 0 8.4S0 12.288 0.504 14.184C0.768 15.192 1.536 15.984 2.52 16.248C4.368 16.8 12 16.8 12 16.8S19.632 16.8 21.48 16.248C22.464 15.984 23.232 15.192 23.496 14.184C24 12.288 24 8.4 24 8.4S24 4.512 23.496 2.616Z" fill="#FF0000"/>
              <path d="M9.6 12L15.6 8.4L9.6 4.8V12Z" fill="white"/>
            </svg>
            Assistir no YouTube
          </button>
        </div>
      </div>
    </div>
  );
};

export default Player;