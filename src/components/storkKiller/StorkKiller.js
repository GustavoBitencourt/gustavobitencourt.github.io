import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import './StorkKiller.css';

const StorkKiller = () => {
  const canvasRef = useRef(null);
  const gameEngineRef = useRef(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [health, setHealth] = useState(3);
  const animationFrameRef = useRef(null);
  const imagesRef = useRef({});
  const lastUpdateRef = useRef(Date.now());
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [joystickAngle, setJoystickAngle] = useState(null);
  const joystickRef = useRef(null);

  // Detectar mobile
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Carregar imagens
  useEffect(() => {
    const images = {};
    let loadedCount = 0;
    const totalImages = 3;

    const onImageLoad = () => {
      loadedCount += 1;
      console.log(`Image loaded: ${loadedCount}/${totalImages}`);
      if (loadedCount === totalImages) {
        imagesRef.current = images;
        console.log('All images loaded:', images);
      }
    };

    const onImageError = (name) => {
      console.error(`Failed to load image: ${name}`);
      loadedCount += 1;
      if (loadedCount === totalImages) {
        imagesRef.current = images;
      }
    };

    // Usar process.env.PUBLIC_URL para caminho correto
    const basePath = process.env.PUBLIC_URL || '';

    // Carregar cegonha
    const storkImg = new Image();
    storkImg.src = `${basePath}/images/StorkWithAk.png`;
    storkImg.onload = () => {
      console.log('Stork image loaded successfully');
      onImageLoad();
    };
    storkImg.onerror = () => onImageError('stork');
    images.stork = storkImg;

    // Carregar inimigo
    const enemyImg = new Image();
    enemyImg.src = `${basePath}/images/enemy.png`;
    enemyImg.onload = () => {
      console.log('Enemy image loaded successfully');
      onImageLoad();
    };
    enemyImg.onerror = () => onImageError('enemy');
    images.enemy = enemyImg;

    // Carregar munição
    const bulletImg = new Image();
    bulletImg.src = `${basePath}/images/ammunition.png`;
    bulletImg.onload = () => {
      console.log('Bullet image loaded successfully');
      onImageLoad();
    };
    bulletImg.onerror = () => onImageError('bullet');
    images.bullet = bulletImg;
  }, []);

  // Joystick handler
  const handleJoystickStart = (e) => {
    if (!gameEngineRef.current) return;
    const touch = e.touches ? e.touches[0] : e;
    updateJoystickPosition(touch);
  };

  const handleJoystickMove = (e) => {
    if (!gameEngineRef.current) return;
    const touch = e.touches ? e.touches[0] : e;
    updateJoystickPosition(touch);
  };

  const updateJoystickPosition = (touch) => {
    if (!joystickRef.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxDistance = 50;

    if (distance < 5) {
      setJoystickAngle(null);
      if (gameEngineRef.current) {
        gameEngineRef.current.handleKeyUp('ArrowLeft');
        gameEngineRef.current.handleKeyUp('ArrowRight');
        gameEngineRef.current.handleKeyUp('ArrowUp');
        gameEngineRef.current.handleKeyUp('ArrowDown');
      }
      return;
    }

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    const clampedDistance = Math.min(distance, maxDistance);
    setJoystickAngle({ angle, distance: clampedDistance, maxDistance });

    if (gameEngineRef.current) {
      // Limpar direções anteriores
      gameEngineRef.current.handleKeyUp('ArrowLeft');
      gameEngineRef.current.handleKeyUp('ArrowRight');
      gameEngineRef.current.handleKeyUp('ArrowUp');
      gameEngineRef.current.handleKeyUp('ArrowDown');

      // Aplicar nova direção (8 direções)
      if (angle > 315 || angle < 45) {
        // Direita
        gameEngineRef.current.handleKeyDown('ArrowRight');
      } else if (angle >= 45 && angle < 135) {
        // Cima-Direita (prioriza cima)
        gameEngineRef.current.handleKeyDown('ArrowUp');
        gameEngineRef.current.handleKeyDown('ArrowRight');
      } else if (angle >= 135 && angle < 180) {
        // Cima
        gameEngineRef.current.handleKeyDown('ArrowUp');
      } else if (angle >= 180 && angle < 225) {
        // Cima-Esquerda
        gameEngineRef.current.handleKeyDown('ArrowUp');
        gameEngineRef.current.handleKeyDown('ArrowLeft');
      } else if (angle >= 225 && angle < 315) {
        // Esquerda
        gameEngineRef.current.handleKeyDown('ArrowLeft');
      } else if (angle >= 315 || angle < 45) {
        // Baixo-Direita
        gameEngineRef.current.handleKeyDown('ArrowDown');
        gameEngineRef.current.handleKeyDown('ArrowRight');
      }
    }
  };

  const handleJoystickEnd = () => {
    setJoystickAngle(null);
    if (gameEngineRef.current) {
      gameEngineRef.current.handleKeyUp('ArrowLeft');
      gameEngineRef.current.handleKeyUp('ArrowRight');
      gameEngineRef.current.handleKeyUp('ArrowUp');
      gameEngineRef.current.handleKeyUp('ArrowDown');
    }
  };

  // Inicializar jogo
  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }

    console.log('Starting game, canvas:', canvas);
    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    console.log('Images:', imagesRef.current);

    const engine = new GameEngine(canvas, imagesRef.current);
    gameEngineRef.current = engine;

    // Event listeners para desktop
    const handleKeyDown = (e) => engine.handleKeyDown(e.key);
    const handleKeyUp = (e) => engine.handleKeyUp(e.key);
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      engine.handleMouseMove(x, y);
    };
    const handleMouseDown = () => engine.handleMouseDown();
    const handleMouseUp = () => engine.handleMouseUp();

    // Touch events para mobile
    const handleTouchMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
      const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
      engine.handleMouseMove(x, y);
    };

    if (!isMobile) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mouseup', handleMouseUp);
    } else {
      canvas.addEventListener('touchmove', handleTouchMove);
    }

    // Game loop
    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      engine.update(deltaTime / 1000);
      engine.draw();

      // Atualizar estado React
      setScore(engine.score);
      setWave(engine.wave);
      setHealth(engine.health);

      if (engine.gameOver) {
        console.log('Game Over!');
        setGameOver(true);
        setGameStarted(false);
      } else {
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (!isMobile) {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mouseup', handleMouseUp);
      } else {
        canvas.removeEventListener('touchmove', handleTouchMove);
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameStarted, isMobile]);

  const startGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setWave(1);
    setHealth(3);
    setJoystickAngle(null);
    lastUpdateRef.current = Date.now();
  };

  const restartGame = () => {
    startGame();
  };

  const handleShoot = () => {
    if (gameEngineRef.current) {
      gameEngineRef.current.shoot();
    }
  };

  return (
    <div className={`stork-killer-container ${gameStarted && isMobile ? 'mobile-fullscreen' : ''}`}>
      {!gameStarted && (
        <>
          <div className="stork-killer-header">
            <h1>🦤 Stork Killer 🔫</h1>
            <p>Mate os inimigos antes que cheguem até você!</p>
          </div>

          <div className="game-info">
            <div className="info-item">
              <span className="label">Score:</span>
              <span className="value">{score}</span>
            </div>
            <div className="info-item">
              <span className="label">Wave:</span>
              <span className="value">{wave}</span>
            </div>
            <div className="info-item">
              <span className="label">Health:</span>
              <span className="value health-color">{health}</span>
            </div>
          </div>
        </>
      )}

      <div className={`game-canvas-wrapper ${gameStarted && isMobile ? 'mobile-game' : ''}`}>
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="game-canvas"
        />

        {gameStarted && isMobile && (
          <div className="mobile-hud">
            <div className="mobile-score">Score: {score}</div>
            <div className="mobile-wave">Wave: {wave}</div>
            <div className="mobile-health">❤️ {health}</div>
          </div>
        )}

        {gameStarted && isMobile && (
          <>
            {/* Joystick na esquerda */}
            <div
              ref={joystickRef}
              className="joystick-base"
              onMouseDown={handleJoystickStart}
              onMouseMove={handleJoystickMove}
              onMouseUp={handleJoystickEnd}
              onMouseLeave={handleJoystickEnd}
              onTouchStart={handleJoystickStart}
              onTouchMove={handleJoystickMove}
              onTouchEnd={handleJoystickEnd}
            >
              <div className="joystick-background">
                {joystickAngle && (
                  <div
                    className="joystick-stick"
                    style={{
                      transform: `translate(${Math.cos((joystickAngle.angle * Math.PI) / 180) * (joystickAngle.distance / joystickAngle.maxDistance) * 40}px, ${Math.sin((joystickAngle.angle * Math.PI) / 180) * (joystickAngle.distance / joystickAngle.maxDistance) * 40}px)`,
                    }}
                  />
                )}
                {!joystickAngle && <div className="joystick-stick" />}
              </div>
            </div>

            {/* Botão de atirar na direita */}
            <button
              className="mobile-shoot-btn"
              onMouseDown={handleShoot}
              onTouchStart={handleShoot}
            >
              🔫
            </button>
          </>
        )}
      </div>

      {!gameStarted && (
        <>
          <div className="controls-info">
            <div className="controls-section">
              <h3>⌨️ Controles</h3>
              <ul>
                <li><strong>← → ↑ ↓</strong> ou <strong>WASD</strong> - Mover</li>
                <li><strong>🖱️ Mouse</strong> - Mirar</li>
                <li><strong>🖱️ Click</strong> ou <strong>Espaço</strong> - Atirar</li>
              </ul>
            </div>

            <div className="game-buttons">
              <button className="btn btn-start" onClick={startGame}>
                🎮 Iniciar Jogo
              </button>
              {gameOver && (
                <>
                  <button className="btn btn-restart" onClick={restartGame}>
                    🔄 Jogar Novamente
                  </button>
                  <div className="game-over-info">
                    <p>Você chegou até a Wave {wave}!</p>
                    <p>Score Final: {score}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="game-rules">
            <h3>📋 Como Jogar</h3>
            <ul>
              <li>Inimigos aparecem na tela</li>
              <li>Cada inimigo = 10 pontos</li>
              <li>Você tem 3 vidas</li>
              <li>A cada 15 kills, você sobe de wave</li>
              <li>Waves aumentam a dificuldade</li>
              <li>Game Over quando perder todas as vidas</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default StorkKiller;
