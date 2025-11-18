import React, { useState, useEffect, useRef } from 'react';
import './Football.css';

const Football = () => {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [isKicking, setIsKicking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [ballPosition, setBallPosition] = useState({ x: 350, y: 420 });
  const [goalkeeper, setGoalkeeper] = useState({ x: 300, y: 120, direction: 1 });
  const [shootPower, setShootPower] = useState(0);
  const [isCharging, setIsCharging] = useState(false);
  const [message, setMessage] = useState('');

  const CANVAS_WIDTH = 700;
  const CANVAS_HEIGHT = 500;
  const GOAL_WIDTH = 250;
  const GOAL_HEIGHT = 120;
  const GOAL_X = (CANVAS_WIDTH - GOAL_WIDTH) / 2;
  const GOAL_Y = 40;

  // Movimento do goleiro
  useEffect(() => {
    if (!gameStarted || isKicking) return;

    const interval = setInterval(() => {
      setGoalkeeper(prev => {
        let newX = prev.x + (prev.direction * 3);
        let newDirection = prev.direction;

        if (newX <= GOAL_X + 20 || newX >= GOAL_X + GOAL_WIDTH - 70) {
          newDirection = -prev.direction;
          newX = prev.x + (newDirection * 3);
        }

        return { ...prev, x: newX, direction: newDirection };
      });
    }, 50);

    return () => clearInterval(interval);
  }, [gameStarted, isKicking, GOAL_X, GOAL_WIDTH]);

  // Desenhar jogo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Limpar canvas
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Desenhar linhas do campo
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Círculo central
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 50, 0, Math.PI * 2);
    ctx.stroke();

    // Desenhar gol
    ctx.fillStyle = '#34495e';
    ctx.fillRect(GOAL_X, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.strokeRect(GOAL_X, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);

    // Rede do gol
    ctx.strokeStyle = '#95a5a6';
    ctx.lineWidth = 1;
    for (let i = 0; i < GOAL_WIDTH; i += 20) {
      ctx.beginPath();
      ctx.moveTo(GOAL_X + i, GOAL_Y);
      ctx.lineTo(GOAL_X + i, GOAL_Y + GOAL_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i < GOAL_HEIGHT; i += 20) {
      ctx.beginPath();
      ctx.moveTo(GOAL_X, GOAL_Y + i);
      ctx.lineTo(GOAL_X + GOAL_WIDTH, GOAL_Y + i);
      ctx.stroke();
    }

    // Desenhar goleiro
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(goalkeeper.x, goalkeeper.y, 50, 80);
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(goalkeeper.x + 25, goalkeeper.y - 15, 20, 0, Math.PI * 2);
    ctx.fill();

    // Desenhar jogador
    if (!isKicking) {
      ctx.fillStyle = '#3498db';
      ctx.fillRect(320, 400, 60, 80);
      ctx.fillStyle = '#2980b9';
      ctx.beginPath();
      ctx.arc(350, 385, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // Desenhar bola
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ballPosition.x, ballPosition.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Desenhar área clicável (círculo de ação) ao redor da bola
    if (!isKicking && gameStarted) {
      ctx.strokeStyle = isCharging ? '#f39c12' : 'rgba(52, 152, 219, 0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(ballPosition.x, ballPosition.y, 50, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Texto de instrução
      if (!isCharging) {
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('CLIQUE AQUI', ballPosition.x, ballPosition.y - 60);
      }
    }

    // Barra de poder no canvas (removida - agora está fora)

  }, [ballPosition, goalkeeper, isCharging, shootPower, isKicking, gameStarted, GOAL_X, GOAL_WIDTH, GOAL_HEIGHT, GOAL_Y]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!gameStarted || isKicking) {
      console.log('Cannot kick:', { gameStarted, isKicking });
      return;
    }
    
    console.log('Starting charge...');
    setIsCharging(true);
    setShootPower(0);
    
    let powerIntervalRef = setInterval(() => {
      setShootPower(prev => {
        const newPower = prev + 3;
        if (newPower >= 100) {
          clearInterval(powerIntervalRef);
          return 100;
        }
        return newPower;
      });
    }, 30);

    const handleMouseUp = (upEvent) => {
      upEvent.preventDefault();
      console.log('Mouse released, kicking...');
      clearInterval(powerIntervalRef);
      setIsCharging(false);
      
      // Usar timeout para garantir que o estado foi atualizado
      setTimeout(() => {
        kick();
      }, 50);
      
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
  };

  const kick = () => {
    if (isKicking) {
      console.log('Already kicking');
      return;
    }

    console.log('Executing kick with power:', shootPower);
    setIsKicking(true);
    setAttempts(prev => prev + 1);
    
    // Direção baseada no poder do chute (mais variação com mais poder)
    const powerFactor = shootPower / 100;
    const randomOffsetX = (Math.random() - 0.5) * GOAL_WIDTH * powerFactor;
    const targetX = GOAL_X + GOAL_WIDTH / 2 + randomOffsetX;
    const targetY = GOAL_Y + GOAL_HEIGHT / 2 + (Math.random() - 0.5) * GOAL_HEIGHT;

    let currentX = ballPosition.x;
    let currentY = ballPosition.y;

    const steps = 30;
    const deltaX = (targetX - currentX) / steps;
    const deltaY = (targetY - currentY) / steps;

    let step = 0;
    const animationInterval = setInterval(() => {
      step++;
      currentX += deltaX;
      currentY += deltaY;

      setBallPosition({ x: currentX, y: currentY });

      if (step >= steps) {
        clearInterval(animationInterval);
        checkGoal(currentX, currentY);
      }
    }, 30);
  };

  const checkGoal = (x, y) => {
    // Verificar se a bola está na área do gol
    const inGoalX = x >= GOAL_X && x <= GOAL_X + GOAL_WIDTH;
    const inGoalY = y >= GOAL_Y && y <= GOAL_Y + GOAL_HEIGHT;

    // Verificar se o goleiro defendeu
    const goalkeeperDefended = x >= goalkeeper.x && x <= goalkeeper.x + 50 && 
                               y >= goalkeeper.y && y <= goalkeeper.y + 80;

    if (inGoalX && inGoalY && !goalkeeperDefended) {
      setScore(prev => prev + 1);
      setMessage('⚽ GOOOOL!');
    } else if (goalkeeperDefended) {
      setMessage('🧤 Defendido!');
    } else {
      setMessage('❌ Para fora!');
    }

    setTimeout(() => {
      setMessage('');
      resetBall();
    }, 1500);
  };

  const resetBall = () => {
    setBallPosition({ x: 350, y: 420 });
    setIsKicking(false);
    setShootPower(0);
  };

  const startGame = () => {
    setGameStarted(true);
    setScore(0);
    setAttempts(0);
    setMessage('');
    resetBall();
  };

  const resetGame = () => {
    setGameStarted(false);
    setScore(0);
    setAttempts(0);
    setMessage('');
    resetBall();
  };

  return (
    <div className="football-game">
      <div className="game-header">
        <h1>⚽ Penalty Kick Game</h1>
        <div className="game-stats">
          <div className="stat">
            <span className="stat-label">Gols:</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tentativas:</span>
            <span className="stat-value">{attempts}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Taxa:</span>
            <span className="stat-value">
              {attempts > 0 ? Math.round((score / attempts) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      {message && (
        <div className={`game-message ${message.includes('GOOL') ? 'goal' : ''}`}>
          {message}
        </div>
      )}

      <div className="game-canvas-container">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={gameStarted ? handleMouseDown : undefined}
          onTouchStart={gameStarted ? handleMouseDown : undefined}
          className={isCharging ? 'charging' : ''}
          style={{ 
            cursor: gameStarted ? 'pointer' : 'default',
            touchAction: 'none'
          }}
        />
      </div>

      {gameStarted && isCharging && (
        <div className="power-bar-container">
          <div className="power-bar">
            <div 
              className="power-fill" 
              style={{ 
                width: `${shootPower}%`,
                backgroundColor: shootPower > 70 ? '#e74c3c' : shootPower > 40 ? '#f39c12' : '#2ecc71'
              }}
            />
          </div>
          <p className="power-text">Poder: {shootPower}%</p>
        </div>
      )}

      <div className="game-controls">
        {!gameStarted ? (
          <button onClick={startGame} className="btn-start">
            Iniciar Jogo
          </button>
        ) : (
          <>
            <div className="instructions">
              <p>🖱️ Clique e segure para carregar o chute, solte para chutar!</p>
              <p style={{ fontSize: '14px', marginTop: '8px', opacity: 0.8 }}>
                Status: {isKicking ? 'Chutando...' : isCharging ? 'Carregando...' : 'Pronto!'}
              </p>
            </div>
            <button onClick={resetGame} className="btn-reset">
              Reiniciar Jogo
            </button>
          </>
        )}
      </div>

      <div className="game-footer">
        <a href="/#/" className="btn-back">← Voltar ao Portfólio</a>
      </div>
    </div>
  );
};

export default Football;
