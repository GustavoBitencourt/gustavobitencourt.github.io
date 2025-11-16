import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Snake.css';

const Snake = () => {
  const canvasRef = useRef(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('snakeHighScore');
    return saved ? parseInt(saved) : 0;
  });

  const GRID_SIZE = 20;
  const TILE_COUNT = 20;

  const gameStateRef = useRef({
    snake: [{ x: 10, y: 10 }],
    food: { x: 15, y: 15 },
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    score: 0,
  });

  // Inicializar jogo
  const initGame = useCallback(() => {
    gameStateRef.current = {
      snake: [{ x: 10, y: 10 }],
      food: { x: 15, y: 15 },
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      score: 0,
    };
    setScore(0);
    setGameOver(false);
    setGameRunning(true);
  }, []);

  // Gerar nova comida
  const generateFood = useCallback(() => {
    let newFood = null;
    let foodInSnake = true;
    
    while (foodInSnake) {
      newFood = {
        x: Math.floor(Math.random() * TILE_COUNT),
        y: Math.floor(Math.random() * TILE_COUNT),
      };
      
      const temp = newFood;
      foodInSnake = gameStateRef.current.snake.some((segment) => {
        return segment.x === temp.x && segment.y === temp.y;
      });
    }
    
    return newFood;
  }, [TILE_COUNT]);

  // Atualizar jogo
  const updateGame = useCallback(() => {
    const state = gameStateRef.current;

    // Atualizar direção
    state.direction = state.nextDirection;

    // Calcular nova cabeça
    const head = state.snake[state.snake.length - 1];
    const newHead = {
      x: (head.x + state.direction.x + TILE_COUNT) % TILE_COUNT,
      y: (head.y + state.direction.y + TILE_COUNT) % TILE_COUNT,
    };

    // Verificar colisão com o corpo
    if (state.snake.some((segment) => segment.x === newHead.x && segment.y === newHead.y)) {
      setGameOver(true);
      setGameRunning(false);
      if (state.score > highScore) {
        setHighScore(state.score);
        localStorage.setItem('snakeHighScore', state.score.toString());
      }
      return;
    }

    // Adicionar nova cabeça
    state.snake.push(newHead);

    // Verificar se comeu a comida
    if (newHead.x === state.food.x && newHead.y === state.food.y) {
      state.score += 10;
      setScore(state.score);
      state.food = generateFood();
    } else {
      // Remover cauda se não comeu
      state.snake.shift();
    }
  }, [generateFood, highScore]);

  // Desenhar jogo
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const state = gameStateRef.current;

    // Limpar canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Desenhar grade
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= TILE_COUNT; i++) {
      const pos = (i * GRID_SIZE);
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    // Desenhar comida
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(
      state.food.x * GRID_SIZE + 1,
      state.food.y * GRID_SIZE + 1,
      GRID_SIZE - 2,
      GRID_SIZE - 2
    );

    // Desenhar cobra
    state.snake.forEach((segment, index) => {
      if (index === state.snake.length - 1) {
        // Cabeça
        ctx.fillStyle = '#00ffcc';
      } else {
        // Corpo
        ctx.fillStyle = '#00cc99';
      }
      ctx.fillRect(
        segment.x * GRID_SIZE + 1,
        segment.y * GRID_SIZE + 1,
        GRID_SIZE - 2,
        GRID_SIZE - 2
      );
    });
  }, []);

  // Loop do jogo
  useEffect(() => {
    if (!gameRunning) return;

    const gameLoop = setInterval(() => {
      updateGame();
      drawGame();
    }, 100);

    return () => clearInterval(gameLoop);
  }, [gameRunning, updateGame, drawGame]);

  // Desenhar inicial
  useEffect(() => {
    drawGame();
  }, [drawGame]);

  // Controles do teclado
  useEffect(() => {
    const handleKeyPress = (e) => {
      const state = gameStateRef.current;

      switch (e.key.toLowerCase()) {
        case 'arrowup':
        case 'w':
          if (state.direction.y === 0) {
            state.nextDirection = { x: 0, y: -1 };
            e.preventDefault();
          }
          break;
        case 'arrowdown':
        case 's':
          if (state.direction.y === 0) {
            state.nextDirection = { x: 0, y: 1 };
            e.preventDefault();
          }
          break;
        case 'arrowleft':
        case 'a':
          if (state.direction.x === 0) {
            state.nextDirection = { x: -1, y: 0 };
            e.preventDefault();
          }
          break;
        case 'arrowright':
        case 'd':
          if (state.direction.x === 0) {
            state.nextDirection = { x: 1, y: 0 };
            e.preventDefault();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="snake-container">
      <div className="snake-header">
        <h1>🐍 Jogo da Cobrinha</h1>
        <div className="score-board">
          <div className="score">
            <span>Pontuação:</span>
            <strong>{score}</strong>
          </div>
          <div className="high-score">
            <span>Maior Pontuação:</span>
            <strong>{highScore}</strong>
          </div>
        </div>
      </div>

      <div className="snake-game-wrapper">
        <canvas
          ref={canvasRef}
          width={TILE_COUNT * GRID_SIZE}
          height={TILE_COUNT * GRID_SIZE}
          className="snake-canvas"
        />

        {!gameRunning && !gameOver && (
          <div className="game-overlay">
            <div className="start-screen">
              <h2>Jogo da Cobrinha</h2>
              <p>Use as Setas do Teclado ou WASD para controlar</p>
              <button onClick={initGame} className="start-button">
                Iniciar Jogo
              </button>
            </div>
          </div>
        )}

        {gameOver && !gameRunning && (
          <div className="game-overlay">
            <div className="game-over-screen">
              <h2>Fim de Jogo!</h2>
              <p>Pontuação Final: {score}</p>
              {score > 0 && score === highScore && (
                <p className="new-record">🏆 Novo Recorde! 🏆</p>
              )}
              <button onClick={initGame} className="restart-button">
                Jogar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      {!gameRunning && (
        <div className="snake-instructions">
          <h3>Como Jogar:</h3>
          <ul>
            <li>Use <strong>Setas do Teclado</strong> ou <strong>WASD</strong> para mover a cobrinha</li>
            <li>Coma a <span className="food-color">comida vermelha</span> para crescer e ganhar pontos</li>
            <li>Não bata nas paredes ou em você mesmo</li>
            <li>Cada comida comida = 10 pontos</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default Snake;
