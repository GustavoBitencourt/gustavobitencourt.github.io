import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Pong.css';

const Pong = () => {
  const canvasRef = useRef(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [winner, setWinner] = useState(null);

  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 400;
  const PADDLE_WIDTH = 10;
  const PADDLE_HEIGHT = 80;
  const BALL_SIZE = 8;
  const PADDLE_SPEED = 6;
  const BALL_SPEED = 5;
  const WIN_SCORE = 5;

  const gameStateRef = useRef({
    player1: { x: 20, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, dy: 0 },
    player2: { x: CANVAS_WIDTH - 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, dy: 0 },
    ball: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT / 2,
      dx: BALL_SPEED,
      dy: BALL_SPEED,
    },
    player1Score: 0,
    player2Score: 0,
  });

  const keysPressed = useRef({
    arrowUp: false,
    arrowDown: false,
    w: false,
    s: false,
  });

  // Inicializar jogo
  const initGame = useCallback(() => {
    gameStateRef.current = {
      player1: { x: 20, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, dy: 0 },
      player2: { x: CANVAS_WIDTH - 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2, dy: 0 },
      ball: {
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        dx: BALL_SPEED,
        dy: BALL_SPEED,
      },
      player1Score: 0,
      player2Score: 0,
    };
    setPlayer1Score(0);
    setPlayer2Score(0);
    setGameOver(false);
    setWinner(null);
    setGameRunning(true);
  }, []);

  // Atualizar jogo
  const updateGame = useCallback(() => {
    const state = gameStateRef.current;
    const { player1, player2, ball } = state;

    // Mover paddles
    if (keysPressed.current.arrowUp && player1.y > 0) {
      player1.y -= PADDLE_SPEED;
    }
    if (keysPressed.current.arrowDown && player1.y < CANVAS_HEIGHT - PADDLE_HEIGHT) {
      player1.y += PADDLE_SPEED;
    }
    if (keysPressed.current.w && player2.y > 0) {
      player2.y -= PADDLE_SPEED;
    }
    if (keysPressed.current.s && player2.y < CANVAS_HEIGHT - PADDLE_HEIGHT) {
      player2.y += PADDLE_SPEED;
    }

    // Mover bola
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Colisão com topo e fundo
    if (ball.y - BALL_SIZE / 2 <= 0 || ball.y + BALL_SIZE / 2 >= CANVAS_HEIGHT) {
      ball.dy = -ball.dy;
      ball.y = ball.y - BALL_SIZE / 2 <= 0 ? BALL_SIZE / 2 : CANVAS_HEIGHT - BALL_SIZE / 2;
    }

    // Colisão com paddles
    // Player 1
    if (
      ball.x - BALL_SIZE / 2 <= player1.x + PADDLE_WIDTH &&
      ball.x - BALL_SIZE / 2 >= player1.x &&
      ball.y >= player1.y &&
      ball.y <= player1.y + PADDLE_HEIGHT
    ) {
      const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      const newSpeed = currentSpeed * 1.05; // Aumenta 5% de velocidade
      ball.dx = (newSpeed / currentSpeed) * Math.abs(ball.dx);
      ball.x = player1.x + PADDLE_WIDTH + BALL_SIZE / 2;
      const deltaY = ball.y - (player1.y + PADDLE_HEIGHT / 2);
      ball.dy = (deltaY / (PADDLE_HEIGHT / 2)) * newSpeed;
    }

    // Player 2
    if (
      ball.x + BALL_SIZE / 2 >= player2.x &&
      ball.x + BALL_SIZE / 2 <= player2.x + PADDLE_WIDTH &&
      ball.y >= player2.y &&
      ball.y <= player2.y + PADDLE_HEIGHT
    ) {
      const currentSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
      const newSpeed = currentSpeed * 1.05; // Aumenta 5% de velocidade
      ball.dx = -(newSpeed / currentSpeed) * Math.abs(ball.dx);
      ball.x = player2.x - BALL_SIZE / 2;
      const deltaY = ball.y - (player2.y + PADDLE_HEIGHT / 2);
      ball.dy = (deltaY / (PADDLE_HEIGHT / 2)) * newSpeed;
    }

    // Verificar pontos (bola saiu pela esquerda)
    if (ball.x + BALL_SIZE / 2 < 0) {
      state.player2Score += 1;
      setPlayer2Score(state.player2Score);

      if (state.player2Score >= WIN_SCORE) {
        setGameOver(true);
        setGameRunning(false);
        setWinner('Jogador 2');
      } else {
        // Resetar bola
        ball.x = CANVAS_WIDTH / 2;
        ball.y = CANVAS_HEIGHT / 2;
        ball.dx = BALL_SPEED;
        ball.dy = BALL_SPEED;
      }
    }

    // Verificar pontos (bola saiu pela direita)
    if (ball.x - BALL_SIZE / 2 > CANVAS_WIDTH) {
      state.player1Score += 1;
      setPlayer1Score(state.player1Score);

      if (state.player1Score >= WIN_SCORE) {
        setGameOver(true);
        setGameRunning(false);
        setWinner('Jogador 1');
      } else {
        // Resetar bola
        ball.x = CANVAS_WIDTH / 2;
        ball.y = CANVAS_HEIGHT / 2;
        ball.dx = -BALL_SPEED;
        ball.dy = BALL_SPEED;
      }
    }
  }, []);

  // Desenhar jogo
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const state = gameStateRef.current;

    // Fundo
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Linha do meio
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Player 1 paddle
    ctx.fillStyle = '#00ffcc';
    ctx.fillRect(state.player1.x, state.player1.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Player 2 paddle
    ctx.fillStyle = '#ff6b9d';
    ctx.fillRect(state.player2.x, state.player2.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Bola
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  // Loop do jogo
  useEffect(() => {
    if (!gameRunning) return;

    const gameLoop = setInterval(() => {
      updateGame();
      drawGame();
    }, 1000 / 60); // 60 FPS

    return () => clearInterval(gameLoop);
  }, [gameRunning, updateGame, drawGame]);

  // Desenhar inicial
  useEffect(() => {
    drawGame();
  }, [drawGame]);

  // Controles do teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key.toLowerCase()) {
        case 'arrowup':
          keysPressed.current.arrowUp = true;
          e.preventDefault();
          break;
        case 'arrowdown':
          keysPressed.current.arrowDown = true;
          e.preventDefault();
          break;
        case 'w':
          keysPressed.current.w = true;
          e.preventDefault();
          break;
        case 's':
          keysPressed.current.s = true;
          e.preventDefault();
          break;
        default:
          break;
      }
    };

    const handleKeyUp = (e) => {
      switch (e.key.toLowerCase()) {
        case 'arrowup':
          keysPressed.current.arrowUp = false;
          break;
        case 'arrowdown':
          keysPressed.current.arrowDown = false;
          break;
        case 'w':
          keysPressed.current.w = false;
          break;
        case 's':
          keysPressed.current.s = false;
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="pong-container">
      <div className="pong-header">
        <h1>🎮 Pong</h1>
        <div className="pong-score">
          <div className="player-score player1-score">
            <span>Jogador 1</span>
            <strong>{player1Score}</strong>
          </div>
          <div className="separator">vs</div>
          <div className="player-score player2-score">
            <span>Jogador 2</span>
            <strong>{player2Score}</strong>
          </div>
        </div>
      </div>

      <div className="pong-game-wrapper">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="pong-canvas"
        />

        {!gameRunning && !gameOver && (
          <div className="game-overlay">
            <div className="start-screen">
              <h2>Pong</h2>
              <p>Primero a 5 pontos vence!</p>
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
              <p>{winner} Venceu! 🏆</p>
              <p>Jogador 1: {player1Score} | Jogador 2: {player2Score}</p>
              <button onClick={initGame} className="restart-button">
                Jogar Novamente
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pong-instructions">
        <div className="instruction-column player1-instructions">
          <h3>🎮 Jogador 1</h3>
          <ul>
            <li><strong>↑ Seta Para Cima</strong> - Mover para cima</li>
            <li><strong>↓ Seta Para Baixo</strong> - Mover para baixo</li>
          </ul>
        </div>

        <div className="instruction-column player2-instructions">
          <h3>🎮 Jogador 2</h3>
          <ul>
            <li><strong>W</strong> - Mover para cima</li>
            <li><strong>S</strong> - Mover para baixo</li>
          </ul>
        </div>
      </div>

      <div className="pong-rules">
        <h3>Regras:</h3>
        <ul>
          <li>Use seu paddle para rebater a bola</li>
          <li>Se a bola passar por você, o adversário marca um ponto</li>
          <li>Primeiro a chegar em 5 pontos vence</li>
          <li>A bola aumenta de velocidade a cada rebatida</li>
        </ul>
      </div>
    </div>
  );
};

export default Pong;
