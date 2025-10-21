import React, { useState, useEffect } from 'react';
import './CS2.css';

const CS2 = () => {
  const [gameState, setGameState] = useState('ready'); // 'ready', 'countdown', 'loaded'
  const [countdown, setCountdown] = useState(3);

  // Função para tocar áudio específico de cada jogador
  const playPlayerSound = (soundFile, repeat = 1) => {
    const playSound = () => {
      const audio = new Audio(`/sounds/${soundFile}`);
      audio.volume = 0.6;
      audio.play().then(() => {
        console.log(`🔊 Som ${soundFile} tocado com sucesso!`);
      }).catch(err => {
        console.log('Erro ao tocar áudio:', err);
      });
    };

    // Tocar o som a quantidade de vezes especificada
    for (let i = 0; i < repeat; i++) {
      setTimeout(() => playSound(), i * 300); // 300ms de intervalo entre repetições
    }
  };

  // Função para iniciar o jogo
  const handleStartGame = () => {
    setGameState('countdown');
  };

  // Contagem regressiva após clicar no botão
  useEffect(() => {
    if (gameState === 'countdown') {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Tocar som do beep para o número "1"
            const beepAudio = new Audio('/sounds/c4_beep2.wav');
            beepAudio.volume = 0.6;
            beepAudio.play().then(() => {
              console.log('🔊 Beep para número 1 tocado com sucesso!');
            }).catch(err => {
              console.log('Erro ao tocar áudio do beep:', err);
            });
            
            // Tocar som após contagem terminar
            setTimeout(() => {
              const audio = new Audio('/sounds/pl_respawn.wav');
              audio.volume = 0.5;
              audio.play().then(() => {
                console.log('🔊 Som de respawn tocado com sucesso!');
              }).catch(err => {
                console.log('Erro ao tocar áudio:', err);
              });
            }, 300);
            
            setTimeout(() => {
              setGameState('loaded');
            }, 500); // Pequeno delay após o "1"
            return 0;
          }
          
          // Tocar som do beep para os números 3 e 2
          const beepAudio = new Audio('/sounds/c4_beep2.wav');
          beepAudio.volume = 0.6;
          beepAudio.play().then(() => {
            console.log(`🔊 Beep para número ${prev} tocado com sucesso!`);
          }).catch(err => {
            console.log('Erro ao tocar áudio do beep:', err);
          });
          
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    }
  }, [gameState]);

  // Tela de preparação
  if (gameState === 'ready') {
    return (
      <div className="cs2-loading">
        <div className="loading-background"></div>
        <div className="ready-container">
          <div className="ready-title">
            <h1>Counter-Strike 2</h1>
            <p>Você está preparado?</p>
          </div>
          <button 
            className="start-button" 
            onClick={handleStartGame}
          >
            <span className="button-text-pt">Vamos Lá!</span>
            <span className="button-text-en">Let's Go!</span>
          </button>
        </div>
      </div>
    );
  }

  // Tela de contagem regressiva
  if (gameState === 'countdown') {
    return (
      <div className="cs2-loading">
        <div className="loading-background"></div>
        <div className="countdown-container">
          {countdown > 0 && (
            <div className="countdown-number" key={countdown}>
              {countdown}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cs2-container">
      <div className="cs2-background">
        <div className="cs2-content">
          <div className="cs2-header">
            <h1 className="cs2-title">Counter-Strike 2</h1>
            <div className="cs2-subtitle">Team Line-Up</div>
          </div>
          
          <div className="cs2-main-content">
            <div className="team-section">
              <h2>Nossa Equipe</h2>
              <p className="team-description">
                Conheça os membros da nossa line de Counter-Strike 2, prontos para dominar os servidores!
              </p>
              
              <div className="team-grid">
                <div 
                  className="player-card"
                  onMouseEnter={() => playPlayerSound('death_taser_m_01.wav')}
                >
                  <div className="player-image-container">
                    <img 
                      src="/images/Romanelex.jpeg" 
                      alt="Romanelex"
                      className="player-image"
                    />
                    <div className="player-overlay">
                      <div className="player-stats">
                        <span>Sniper</span>
                      </div>
                    </div>
                  </div>
                  <div className="player-info">
                    <h3 className="player-nick">Romanelex</h3>
                    <p className="player-role">AWPer</p>
                  </div>
                </div>

                <div 
                  className="player-card"
                  onMouseEnter={() => playPlayerSound('headshot_noarmor_05.wav')}
                >
                  <div className="player-image-container">
                    <img 
                      src="/images/Nando.jpeg" 
                      alt="nando"
                      className="player-image"
                    />
                    <div className="player-overlay">
                      <div className="player-stats">
                        <span>Rifler</span>
                      </div>
                    </div>
                  </div>
                  <div className="player-info">
                    <h3 className="player-nick">nando</h3>
                    <p className="player-role">Entry Fragger</p>
                  </div>
                </div>

                <div 
                  className="player-card"
                  onMouseEnter={() => playPlayerSound('burn_damage4.wav', 2)}
                >
                  <div className="player-image-container">
                    <img 
                      src="/images/GustavoAbu.jpeg" 
                      alt="GustavoAbu"
                      className="player-image"
                    />
                    <div className="player-overlay">
                      <div className="player-stats">
                        <span>Support</span>
                      </div>
                    </div>
                  </div>
                  <div className="player-info">
                    <h3 className="player-nick">GustavoAbu</h3>
                    <p className="player-role">Support</p>
                  </div>
                </div>

                <div 
                  className="player-card"
                  onMouseEnter={() => playPlayerSound('c4_explode1.wav')}
                >
                  <div className="player-image-container">
                    <img 
                      src="/images/laura.jpeg" 
                      alt="laurachaquesz"
                      className="player-image"
                    />
                    <div className="player-overlay">
                      <div className="player-stats">
                        <span>IGL</span>
                      </div>
                    </div>
                  </div>
                  <div className="player-info">
                    <h3 className="player-nick">laurachaquesz</h3>
                    <p className="player-role">In-Game Leader</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CS2;