import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hostRoom, hostAnyRoom, openGuestPeer, listRooms, roomPeerId } from './pongNet';
import './Pong.css';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 8;
const PADDLE_SPEED = 6;
const BALL_SPEED = 5;
const MAX_BALL_SPEED = 15;
const WIN_SCORE = 5;
const JOIN_TIMEOUT = 12000;
const HEARTBEAT_TIMEOUT = 6000;

const serveBall = (dir) => ({
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT / 2,
  dx: BALL_SPEED * dir,
  dy: BALL_SPEED * 0.8 * (Math.random() < 0.5 ? -1 : 1)
});

const createState = () => ({
  player1: { x: 20, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
  player2: { x: CANVAS_WIDTH - 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
  ball: serveBall(Math.random() < 0.5 ? 1 : -1),
  player1Score: 0,
  player2Score: 0
});

// Move o paddle por teclado (up/down) ou seguindo o dedo/mouse (target = Y no canvas)
const movePaddle = (paddle, input) => {
  if (input.target !== null && input.target !== undefined) {
    const diff = input.target - (paddle.y + PADDLE_HEIGHT / 2);
    paddle.y += Math.max(-PADDLE_SPEED * 1.5, Math.min(PADDLE_SPEED * 1.5, diff));
  } else {
    if (input.up) paddle.y -= PADDLE_SPEED;
    if (input.down) paddle.y += PADDLE_SPEED;
  }
  paddle.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, paddle.y));
};

const bounceOffPaddle = (ball, paddle, direction) => {
  const currentSpeed = Math.hypot(ball.dx, ball.dy);
  const newSpeed = Math.min(MAX_BALL_SPEED, currentSpeed * 1.05); // +5% por rebatida
  const deltaY = (ball.y - (paddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
  ball.dy = deltaY * newSpeed * 0.75;
  ball.dx = direction * Math.sqrt(Math.max(newSpeed * newSpeed - ball.dy * ball.dy, (newSpeed * 0.5) ** 2));
};

// Avança um quadro da física. Retorna 'point', 'over' ou null.
const stepGame = (state, input1, input2) => {
  const { player1, player2, ball } = state;
  const r = BALL_SIZE / 2;

  movePaddle(player1, input1);
  movePaddle(player2, input2);

  const prevX = ball.x;
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.y - r <= 0 || ball.y + r >= CANVAS_HEIGHT) {
    ball.dy = -ball.dy;
    ball.y = ball.y - r <= 0 ? r : CANVAS_HEIGHT - r;
  }

  // Colisão considerando a trajetória (evita a bola "atravessar" em alta velocidade)
  const p1Face = player1.x + PADDLE_WIDTH;
  if (ball.dx < 0 && prevX - r >= p1Face && ball.x - r <= p1Face &&
      ball.y >= player1.y - r && ball.y <= player1.y + PADDLE_HEIGHT + r) {
    ball.x = p1Face + r;
    bounceOffPaddle(ball, player1, 1);
  }
  const p2Face = player2.x;
  if (ball.dx > 0 && prevX + r <= p2Face && ball.x + r >= p2Face &&
      ball.y >= player2.y - r && ball.y <= player2.y + PADDLE_HEIGHT + r) {
    ball.x = p2Face - r;
    bounceOffPaddle(ball, player2, -1);
  }

  if (ball.x + r < 0) {
    state.player2Score += 1;
    state.ball = serveBall(1);
    return state.player2Score >= WIN_SCORE ? 'over' : 'point';
  }
  if (ball.x - r > CANVAS_WIDTH) {
    state.player1Score += 1;
    state.ball = serveBall(-1);
    return state.player1Score >= WIN_SCORE ? 'over' : 'point';
  }
  return null;
};

const drawGame = (ctx, state) => {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#00ffcc';
  ctx.fillRect(state.player1.x, state.player1.y, PADDLE_WIDTH, PADDLE_HEIGHT);

  ctx.fillStyle = '#ff6b9d';
  ctx.fillRect(state.player2.x, state.player2.y, PADDLE_WIDTH, PADDLE_HEIGHT);

  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_SIZE / 2, 0, Math.PI * 2);
  ctx.fill();
};

const Pong = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // screen: menu | local | lobby | online
  const [screen, setScreen] = useState('menu');
  // phase: idle | waiting | connecting | countdown | playing | over | closed
  const [phase, setPhase] = useState('idle');
  const [countdown, setCountdown] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState(null);
  const [role, setRole] = useState(null); // host | guest
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const stateRef = useRef(createState());
  const keysRef = useRef({ w: false, s: false, up: false, down: false });
  const touchRef = useRef({ left: null, right: null, any: null });
  const pointersRef = useRef(new Map());
  const remoteInputRef = useRef({ up: false, down: false, target: null });
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const timersRef = useRef([]);
  const leavingRef = useRef(false);
  const lastSentInputRef = useRef('');
  const lastSeenRef = useRef(0);
  const remoteGoneRef = useRef(null);
  const screenRef = useRef(screen);
  const roleRef = useRef(role);
  const phaseRef = useRef(phase);

  screenRef.current = screen;
  roleRef.current = role;

  const updatePhase = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const send = useCallback((msg) => {
    const conn = connRef.current;
    if (conn && conn.open) conn.send(msg);
  }, []);

  const setRoomInUrl = useCallback((value) => {
    setSearchParams(value ? { sala: String(value) } : {}, { replace: true });
  }, [setSearchParams]);

  // ---------- Entradas ----------
  const myInput = () => ({
    up: keysRef.current.w || keysRef.current.up,
    down: keysRef.current.s || keysRef.current.down,
    target: touchRef.current.any
  });

  const localInputs = () => [
    { up: keysRef.current.w, down: keysRef.current.s, target: touchRef.current.left },
    { up: keysRef.current.up, down: keysRef.current.down, target: touchRef.current.right }
  ];

  useEffect(() => {
    const map = { w: 'w', s: 's', arrowup: 'up', arrowdown: 'down' };
    const handle = (pressed) => (e) => {
      const key = map[e.key.toLowerCase()];
      if (!key || e.target.tagName === 'INPUT') return;
      keysRef.current[key] = pressed;
      if (phaseRef.current === 'playing') e.preventDefault();
    };
    const down = handle(true);
    const up = handle(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Toque/mouse: o paddle segue o dedo. No modo local, cada metade da tela controla um jogador.
  const handlePointer = (e) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture?.(e.pointerId);
    if (e.type === 'pointermove' && !pointersRef.current.has(e.pointerId)) return;
    const rect = frameRef.current.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    let side = pointersRef.current.get(e.pointerId);
    if (!side) {
      side = screenRef.current === 'local' ? (e.clientX - rect.left < rect.width / 2 ? 'left' : 'right') : 'any';
      pointersRef.current.set(e.pointerId, side);
    }
    touchRef.current[side] = y;
  };

  const releasePointer = (e) => {
    const side = pointersRef.current.get(e.pointerId);
    if (side) touchRef.current[side] = null;
    pointersRef.current.delete(e.pointerId);
  };

  // ---------- Desenho (sempre ativo) ----------
  useEffect(() => {
    let raf;
    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) drawGame(canvas.getContext('2d'), stateRef.current);

      // Convidado envia seus comandos quando mudam
      if (roleRef.current === 'guest' && screenRef.current === 'online') {
        const input = myInput();
        if (input.target !== null) input.target = Math.round(input.target);
        const serialized = JSON.stringify(input);
        if (serialized !== lastSentInputRef.current) {
          lastSentInputRef.current = serialized;
          send({ t: 'in', ...input });
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send]);

  // ---------- Partida (local ou anfitrião) ----------
  const finishMatch = useCallback((winnerSide) => {
    const s = stateRef.current;
    setWinner(winnerSide);
    updatePhase('over');
    send({ t: 'phase', phase: 'over', winner: winnerSide, scores: [s.player1Score, s.player2Score] });
  }, [send, updatePhase]);

  const runCountdown = useCallback((n) => {
    setCountdown(n);
    if (n === 0) {
      updatePhase('playing');
      send({ t: 'phase', phase: 'playing' });
      return;
    }
    updatePhase('countdown');
    send({ t: 'phase', phase: 'countdown', count: n });
    timersRef.current.push(setTimeout(() => runCountdown(n - 1), 800));
  }, [send, updatePhase]);

  const startMatch = useCallback(() => {
    clearTimers();
    stateRef.current = createState();
    setScores([0, 0]);
    setWinner(null);
    runCountdown(3);
  }, [runCountdown]);

  useEffect(() => {
    const simulates = screen === 'local' || (screen === 'online' && role === 'host');
    if (phase !== 'playing' || !simulates) return undefined;

    const loop = setInterval(() => {
      const s = stateRef.current;
      const [in1, in2] = screen === 'local' ? localInputs() : [myInput(), remoteInputRef.current];
      const event = stepGame(s, in1, in2);
      if (event) setScores([s.player1Score, s.player2Score]);

      if (screen === 'online') {
        send({
          t: 's',
          a: Math.round(s.player1.y),
          b: Math.round(s.player2.y),
          x: Math.round(s.ball.x * 10) / 10,
          y: Math.round(s.ball.y * 10) / 10,
          p: [s.player1Score, s.player2Score]
        });
      }
      if (event === 'over') finishMatch(s.player1Score >= WIN_SCORE ? 1 : 2);
    }, 1000 / 60);

    return () => clearInterval(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, screen, role, send, finishMatch]);

  // ---------- Online: encerrar ----------
  const resetOnline = useCallback(() => {
    clearTimers();
    leavingRef.current = true;
    remoteGoneRef.current = null;
    if (connRef.current) {
      try {
        if (connRef.current.open) connRef.current.send({ t: 'bye' });
      } catch {
        // conexão já encerrada
      }
      connRef.current.close();
    }
    if (peerRef.current) peerRef.current.destroy();
    connRef.current = null;
    peerRef.current = null;
    remoteInputRef.current = { up: false, down: false, target: null };
    lastSentInputRef.current = '';
    stateRef.current = createState();
    setScores([0, 0]);
    setWinner(null);
    setRole(null);
    setRoom(null);
    setTimeout(() => {
      leavingRef.current = false;
    }, 0);
  }, []);

  // Avisar o outro jogador ao fechar a aba ou sair da rota
  useEffect(() => {
    const sayBye = () => {
      try {
        if (connRef.current?.open) connRef.current.send({ t: 'bye' });
      } catch {
        // conexão já encerrada
      }
    };
    const onPageHide = () => {
      sayBye();
      if (peerRef.current) peerRef.current.destroy();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      sayBye();
      clearTimers();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  // Batimento: detecta quedas em que o WebRTC não avisa (aba encerrada, internet caiu)
  useEffect(() => {
    const id = setInterval(() => {
      const conn = connRef.current;
      if (!conn || !conn.open) return;
      conn.send({ t: 'ping' });
      if (Date.now() - lastSeenRef.current > HEARTBEAT_TIMEOUT) remoteGoneRef.current?.();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Online: anfitrião ----------
  const becomeHost = useCallback((peer, roomNumber) => {
    peerRef.current = peer;
    setRole('host');
    setRoom(roomNumber);
    setScreen('online');
    updatePhase('waiting');
    setRoomInUrl(roomNumber);
    stateRef.current = createState();

    peer.on('disconnected', () => {
      if (!leavingRef.current && !peer.destroyed) peer.reconnect();
    });

    peer.on('connection', (conn) => {
      const type = conn.metadata?.type;

      if (type === 'probe') {
        conn.on('open', () => {
          conn.send({ t: 'status', players: connRef.current ? 2 : 1 });
          setTimeout(() => conn.close(), 1500);
        });
        return;
      }

      if (connRef.current) {
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }

      connRef.current = conn;
      // Se a conexão P2P nunca abrir (rede bloqueada), liberar a vaga
      const pendingTimer = setTimeout(() => {
        if (!conn.open && connRef.current === conn) {
          connRef.current = null;
          conn.close();
        }
      }, JOIN_TIMEOUT);
      conn.on('open', () => {
        clearTimeout(pendingTimer);
        lastSeenRef.current = Date.now();
        remoteGoneRef.current = onGuestLeft;
        setNotice(null);
        conn.send({ t: 'welcome', room: roomNumber });
        startMatch();
      });
      conn.on('data', (msg) => {
        lastSeenRef.current = Date.now();
        if (msg?.t === 'in') remoteInputRef.current = { up: !!msg.up, down: !!msg.down, target: msg.target ?? null };
        if (msg?.t === 'again' && phaseRef.current === 'over') startMatch();
        if (msg?.t === 'bye') onGuestLeft();
      });
      const onGuestLeft = () => {
        if (connRef.current !== conn) return;
        connRef.current = null;
        remoteGoneRef.current = null;
        conn.close();
        clearTimers();
        remoteInputRef.current = { up: false, down: false, target: null };
        stateRef.current = createState();
        setScores([0, 0]);
        setWinner(null);
        if (!leavingRef.current) {
          setNotice('O oponente saiu. Aguardando outro jogador...');
          updatePhase('waiting');
        }
      };
      conn.on('close', onGuestLeft);
      conn.on('error', onGuestLeft);
    });
  }, [setRoomInUrl, startMatch, updatePhase]);

  const createRoom = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const occupied = rooms.map((r) => r.room);
      const { peer, room: roomNumber } = await hostAnyRoom(occupied);
      becomeHost(peer, roomNumber);
    } catch (err) {
      setNotice(err.message || 'Não foi possível criar a sala.');
    } finally {
      setBusy(false);
    }
  };

  const claimRoom = useCallback(async (roomNumber) => {
    try {
      const peer = await hostRoom(roomNumber);
      becomeHost(peer, roomNumber);
      return true;
    } catch (err) {
      return err.type === 'unavailable-id' ? false : Promise.reject(err);
    }
  }, [becomeHost]);

  // ---------- Online: convidado ----------
  const joinRoom = useCallback(async (roomNumber, { claimIfEmpty = false } = {}) => {
    resetOnline();
    setScreen('online');
    setRole('guest');
    setRoom(roomNumber);
    setNotice(null);
    updatePhase('connecting');
    setRoomInUrl(roomNumber);

    let peer;
    try {
      peer = await openGuestPeer();
    } catch {
      setNotice('Não foi possível conectar ao servidor do jogo. Tente novamente.');
      updatePhase('closed');
      return;
    }
    peerRef.current = peer;

    const conn = peer.connect(roomPeerId(roomNumber), { metadata: { type: 'join' }, serialization: 'json' });
    connRef.current = conn;
    let opened = false;

    const timeout = setTimeout(() => {
      if (opened || connRef.current !== conn) return;
      setNotice('Não foi possível conectar ao anfitrião. Algumas redes (4G, empresas) bloqueiam conexões P2P.');
      updatePhase('closed');
    }, JOIN_TIMEOUT);
    timersRef.current.push(timeout);

    peer.on('error', async (err) => {
      if (err.type !== 'peer-unavailable' || connRef.current !== conn) return;
      clearTimeout(timeout);
      peer.destroy();
      peerRef.current = null;
      connRef.current = null;
      // Sala vazia: quem entrou pelo link vira o anfitrião
      if (claimIfEmpty) {
        try {
          if (await claimRoom(roomNumber)) return;
        } catch {
          // segue para a mensagem abaixo
        }
      }
      setNotice(`A sala ${roomNumber} não está mais aberta.`);
      setRole(null);
      updatePhase('closed');
    });

    const onHostLeft = () => {
      if (leavingRef.current || connRef.current !== conn || phaseRef.current === 'closed') return;
      connRef.current = null;
      remoteGoneRef.current = null;
      conn.close();
      setNotice('O anfitrião saiu da sala.');
      updatePhase('closed');
    };

    conn.on('open', () => {
      opened = true;
      clearTimeout(timeout);
      lastSeenRef.current = Date.now();
      remoteGoneRef.current = onHostLeft;
    });

    conn.on('data', (msg) => {
      lastSeenRef.current = Date.now();
      if (!msg) return;
      if (msg.t === 'bye') {
        onHostLeft();
      } else if (msg.t === 's') {
        const s = stateRef.current;
        s.player1.y = msg.a;
        s.player2.y = msg.b;
        s.ball.x = msg.x;
        s.ball.y = msg.y;
        if (msg.p[0] !== s.player1Score || msg.p[1] !== s.player2Score) {
          s.player1Score = msg.p[0];
          s.player2Score = msg.p[1];
          setScores([...msg.p]);
        }
      } else if (msg.t === 'welcome') {
        stateRef.current = createState();
        setScores([0, 0]);
      } else if (msg.t === 'full') {
        setNotice(`A sala ${roomNumber} já está cheia.`);
        updatePhase('closed');
      } else if (msg.t === 'phase') {
        if (msg.phase === 'countdown') {
          if (msg.count === 3) {
            stateRef.current = createState();
            setScores([0, 0]);
            setWinner(null);
          }
          setCountdown(msg.count);
        }
        if (msg.phase === 'over') {
          setWinner(msg.winner);
          setScores(msg.scores);
        }
        updatePhase(msg.phase);
      }
    });

    conn.on('close', onHostLeft);
  }, [claimRoom, resetOnline, setRoomInUrl, updatePhase]);

  // ---------- Lobby ----------
  const refreshRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      setRooms(await listRooms());
    } catch {
      setNotice('Não foi possível listar as salas. Verifique sua conexão.');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  const openLobby = () => {
    resetOnline();
    setRoomInUrl(null);
    setNotice(null);
    setScreen('lobby');
    updatePhase('idle');
    refreshRooms();
  };

  useEffect(() => {
    if (screen !== 'lobby') return undefined;
    const id = setInterval(refreshRooms, 10000);
    return () => clearInterval(id);
  }, [screen, refreshRooms]);

  const goToMenu = () => {
    resetOnline();
    setRoomInUrl(null);
    setNotice(null);
    setScreen('menu');
    updatePhase('idle');
  };

  const startLocal = () => {
    resetOnline();
    setScreen('local');
    startMatch();
  };

  // Entrar direto pelo link (#/pong?sala=3)
  const urlRoom = Number(searchParams.get('sala'));
  const handledUrlRef = useRef(false);
  useEffect(() => {
    if (handledUrlRef.current) return;
    handledUrlRef.current = true;
    if (urlRoom >= 1) joinRoom(urlRoom, { claimIfEmpty: true });
  }, [urlRoom, joinRoom]);

  const shareLink = room ? `${window.location.origin}${window.location.pathname}#/pong?sala=${room}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie o link da sala:', shareLink);
    }
  };

  const playAgain = () => {
    if (screen === 'online' && role === 'guest') send({ t: 'again' });
    else startMatch();
  };

  // ---------- Textos ----------
  const names = screen === 'online'
    ? (role === 'host' ? ['Você', 'Oponente'] : ['Oponente', 'Você'])
    : ['Jogador 1', 'Jogador 2'];
  const winnerName = winner ? names[winner - 1] : '';
  const youWon = screen === 'online' && winner && names[winner - 1] === 'Você';

  const renderOverlay = () => {
    if (screen === 'menu') {
      return (
        <div className="pong-panel">
          <h2>Pong</h2>
          <p>Primeiro a {WIN_SCORE} pontos vence!</p>
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={startLocal}>🎮 Jogar local</button>
            <button className="pong-btn secondary" onClick={openLobby}>🌐 Jogar online</button>
          </div>
        </div>
      );
    }

    if (screen === 'lobby') {
      return (
        <div className="pong-panel lobby">
          <h2>Salas online</h2>
          <div className="pong-room-list">
            {loadingRooms && rooms.length === 0 && <p className="pong-muted">Procurando salas...</p>}
            {!loadingRooms && rooms.length === 0 && <p className="pong-muted">Nenhuma sala aberta. Crie a primeira!</p>}
            {rooms.map(({ room: number, players }) => (
              <div key={number} className={`pong-room ${players >= 2 ? 'full' : ''}`}>
                <span className="pong-room-name">Sala {number}</span>
                <span className="pong-room-players">{players}/2 jogadores</span>
                <button
                  className="pong-btn small"
                  disabled={players >= 2}
                  onClick={() => joinRoom(number)}
                >
                  {players >= 2 ? 'Cheia' : 'Entrar'}
                </button>
              </div>
            ))}
          </div>
          {notice && <p className="pong-notice">{notice}</p>}
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={createRoom} disabled={busy}>
              {busy ? 'Criando...' : '➕ Criar sala'}
            </button>
            <button className="pong-btn ghost" onClick={refreshRooms} disabled={loadingRooms}>
              {loadingRooms ? 'Atualizando...' : '↻ Atualizar'}
            </button>
            <button className="pong-btn ghost" onClick={goToMenu}>Voltar</button>
          </div>
        </div>
      );
    }

    if (phase === 'waiting') {
      return (
        <div className="pong-panel">
          <h2>Sala {room}</h2>
          {notice && <p className="pong-notice">{notice}</p>}
          <p className="pong-waiting"><span className="pong-dot" /> Aguardando oponente (1/2)</p>
          <p className="pong-muted">Envie o link para alguém entrar direto na sala:</p>
          <div className="pong-share">
            <input readOnly value={shareLink} onFocus={(e) => e.target.select()} />
            <button className="pong-btn small" onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar'}</button>
          </div>
          <button className="pong-btn ghost" onClick={openLobby}>Fechar sala</button>
        </div>
      );
    }

    if (phase === 'connecting') {
      return (
        <div className="pong-panel">
          <h2>Sala {room}</h2>
          <p className="pong-waiting"><span className="pong-dot" /> Conectando...</p>
          <button className="pong-btn ghost" onClick={openLobby}>Cancelar</button>
        </div>
      );
    }

    if (phase === 'closed') {
      return (
        <div className="pong-panel">
          <h2>Ops!</h2>
          <p className="pong-notice">{notice}</p>
          <div className="pong-actions">
            {room && (
              <button className="pong-btn primary" onClick={() => joinRoom(room, { claimIfEmpty: true })}>
                Tentar de novo
              </button>
            )}
            <button className="pong-btn ghost" onClick={openLobby}>Ver salas</button>
          </div>
        </div>
      );
    }

    if (phase === 'countdown') {
      return <div className="pong-countdown" key={countdown}>{countdown}</div>;
    }

    if (phase === 'over') {
      return (
        <div className="pong-panel">
          <h2>{screen === 'online' ? (youWon ? 'Você venceu! 🏆' : 'Você perdeu!') : `${winnerName} venceu! 🏆`}</h2>
          <p>{names[0]}: {scores[0]} | {names[1]}: {scores[1]}</p>
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={playAgain}>Jogar novamente</button>
            <button className="pong-btn ghost" onClick={screen === 'online' ? openLobby : goToMenu}>
              {screen === 'online' ? 'Sair da sala' : 'Menu'}
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const overlay = renderOverlay();
  const isOnline = screen === 'online';
  const mySide = role === 'host' ? 'esquerda (ciano)' : 'direita (rosa)';

  return (
    <div className="pong-container">
      <div className="pong-header">
        <h1>🎮 Pong</h1>
        <div className="pong-score">
          <div className="player-score player1-score">
            <span>{names[0]}</span>
            <strong>{scores[0]}</strong>
          </div>
          <div className="separator">vs</div>
          <div className="player-score player2-score">
            <span>{names[1]}</span>
            <strong>{scores[1]}</strong>
          </div>
        </div>
      </div>

      <div className="pong-game-wrapper">
        <div
          className="pong-frame"
          ref={frameRef}
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        >
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="pong-canvas" />
          {overlay && (
            <div
              className={`game-overlay ${phase === 'countdown' ? 'transparent' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {overlay}
            </div>
          )}
        </div>
      </div>

      {isOnline && role && ['countdown', 'playing', 'over'].includes(phase) && (
        <div className="pong-online-bar">
          <span>🌐 Sala {room} · Você controla a raquete da {mySide}</span>
          <button className="pong-btn small ghost" onClick={openLobby}>Sair da sala</button>
        </div>
      )}

      {isOnline ? (
        <div className="pong-instructions">
          <div className={`instruction-column ${role === 'host' ? 'player1-instructions' : 'player2-instructions'}`}>
            <h3>🎮 Seus controles</h3>
            <ul>
              <li><strong>W / ↑</strong> - Mover para cima</li>
              <li><strong>S / ↓</strong> - Mover para baixo</li>
              <li><strong>Toque/arraste</strong> na tela - a raquete segue o dedo</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="pong-instructions">
          <div className="instruction-column player1-instructions">
            <h3>🎮 Jogador 1 (esquerda)</h3>
            <ul>
              <li><strong>W</strong> - Mover para cima</li>
              <li><strong>S</strong> - Mover para baixo</li>
              <li><strong>Toque</strong> na metade esquerda da tela</li>
            </ul>
          </div>

          <div className="instruction-column player2-instructions">
            <h3>🎮 Jogador 2 (direita)</h3>
            <ul>
              <li><strong>↑ Seta Para Cima</strong> - Mover para cima</li>
              <li><strong>↓ Seta Para Baixo</strong> - Mover para baixo</li>
              <li><strong>Toque</strong> na metade direita da tela</li>
            </ul>
          </div>
        </div>
      )}

      <div className="pong-rules">
        <h3>Regras:</h3>
        <ul>
          <li>Use seu paddle para rebater a bola</li>
          <li>Se a bola passar por você, o adversário marca um ponto</li>
          <li>Primeiro a chegar em {WIN_SCORE} pontos vence</li>
          <li>A bola aumenta de velocidade a cada rebatida</li>
          <li>Online: crie uma sala e envie o link, ou entre em uma sala aberta</li>
        </ul>
      </div>
    </div>
  );
};

export default Pong;
