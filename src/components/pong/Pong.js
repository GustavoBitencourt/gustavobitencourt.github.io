import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hostRoom, hostNewRoom, claimListingSlot, openGuestPeer, listRooms, roomPeerId, CODE_PATTERN } from './pongNet';
import { playSound, unlockAudio, getVolume, setVolume } from './pongSound';
import './Pong.css';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 8;
const PADDLE_SPEED = 6;
const BALL_SPEED = 5;
const MAX_BALL_SPEED = 15;
const SERVE_SPEED = 2.2; // saque lento até o primeiro toque numa raquete
const WIN_OPTIONS = [3, 5, 10];
const DEFAULT_WIN = 5;
const JOIN_TIMEOUT = 12000;
const HEARTBEAT_TIMEOUT = 6000;
const SERVE_DELAY_FRAMES = 60; // 1 s de pausa após cada gol (loop a 60 FPS)
const NAME_MAX = 16;
const NAME_KEY = 'pong-player-name';

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

const serveBall = (dir) => ({
  x: CANVAS_WIDTH / 2,
  y: CANVAS_HEIGHT / 2,
  dx: SERVE_SPEED * 0.9 * dir,
  dy: SERVE_SPEED * 0.45 * (Math.random() < 0.5 ? -1 : 1),
  slow: true
});

const createState = (winScore = DEFAULT_WIN) => ({
  winScore,
  player1: { x: 20, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
  player2: { x: CANVAS_WIDTH - 30, y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2 },
  ball: serveBall(Math.random() < 0.5 ? 1 : -1),
  player1Score: 0,
  player2Score: 0,
  serveFrames: 0,
  lastScorer: 0,
  fx: []
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
  // Primeiro toque após o saque lento volta à velocidade normal; depois, +5% por rebatida
  const newSpeed = ball.slow ? BALL_SPEED : Math.min(MAX_BALL_SPEED, currentSpeed * 1.05);
  ball.slow = false;
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

  // Pausa após gol: bola parada no centro, raquetes livres
  if (state.serveFrames > 0) {
    state.serveFrames -= 1;
    return null;
  }

  const prevX = ball.x;
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.y - r <= 0 || ball.y + r >= CANVAS_HEIGHT) {
    ball.dy = -ball.dy;
    ball.y = ball.y - r <= 0 ? r : CANVAS_HEIGHT - r;
    state.fx.push('wall');
  }

  // Colisão considerando a trajetória (evita a bola "atravessar" em alta velocidade)
  const p1Face = player1.x + PADDLE_WIDTH;
  if (ball.dx < 0 && prevX - r >= p1Face && ball.x - r <= p1Face &&
      ball.y >= player1.y - r && ball.y <= player1.y + PADDLE_HEIGHT + r) {
    ball.x = p1Face + r;
    bounceOffPaddle(ball, player1, 1);
    state.fx.push('hit');
  }
  const p2Face = player2.x;
  if (ball.dx > 0 && prevX + r <= p2Face && ball.x + r >= p2Face &&
      ball.y >= player2.y - r && ball.y <= player2.y + PADDLE_HEIGHT + r) {
    ball.x = p2Face - r;
    bounceOffPaddle(ball, player2, -1);
    state.fx.push('hit');
  }

  const scored = ball.x + r < 0 ? 2 : ball.x - r > CANVAS_WIDTH ? 1 : 0;
  if (scored) {
    if (scored === 1) state.player1Score += 1;
    else state.player2Score += 1;
    state.lastScorer = scored;
    // Saque vai para quem sofreu o gol
    state.ball = serveBall(scored === 1 ? 1 : -1);
    state.serveFrames = SERVE_DELAY_FRAMES;
    state.fx.push('goal');
    const total = scored === 1 ? state.player1Score : state.player2Score;
    return total >= state.winScore ? 'over' : 'point';
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
  const [goalBanner, setGoalBanner] = useState(null); // { scorer, id }
  const [myName, setMyName] = useState(() => cleanName(localStorage.getItem(NAME_KEY)));
  const [remoteName, setRemoteName] = useState('');
  const [volume, setVolumeState] = useState(getVolume);
  const [showVolume, setShowVolume] = useState(false);
  const [winScore, setWinScore] = useState(DEFAULT_WIN);
  const [ready, setReady] = useState({ host: false, guest: false }); // revanche online
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);

  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const stateRef = useRef(createState());
  const keysRef = useRef({ w: false, s: false, up: false, down: false });
  const touchRef = useRef({ left: null, right: null, any: null });
  const pointersRef = useRef(new Map());
  const remoteInputRef = useRef({ up: false, down: false, target: null });
  const peerRef = useRef(null);
  const slotPeerRef = useRef(null); // vaga de anúncio no lobby (só anfitrião)
  const connRef = useRef(null);
  const timersRef = useRef([]);
  const leavingRef = useRef(false);
  const lastSentInputRef = useRef('');
  const lastSeenRef = useRef(0);
  const remoteGoneRef = useRef(null);
  const screenRef = useRef(screen);
  const roleRef = useRef(role);
  const phaseRef = useRef(phase);
  const myNameRef = useRef(myName);
  const winScoreRef = useRef(winScore);
  const readyRef = useRef({ host: false, guest: false });
  const goalTimerRef = useRef(null);
  const lastVolumeRef = useRef(getVolume() || 0.6);

  myNameRef.current = myName;
  winScoreRef.current = winScore;

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

  const showGoal = useCallback((scorer) => {
    clearTimeout(goalTimerRef.current);
    setGoalBanner({ scorer, id: Date.now() });
    goalTimerRef.current = setTimeout(() => setGoalBanner(null), (SERVE_DELAY_FRAMES / 60) * 1000);
  }, []);

  // O navegador só libera áudio depois de uma interação
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      clearTimeout(goalTimerRef.current);
    };
  }, []);

  // Fechar a barra de volume ao clicar fora dela
  useEffect(() => {
    if (!showVolume) return undefined;
    const close = (e) => {
      if (!e.target.closest('.pong-volume')) setShowVolume(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [showVolume]);

  const changeVolume = (value) => {
    setVolume(value);
    setVolumeState(value);
    if (value > 0) lastVolumeRef.current = value;
  };

  const toggleMute = () => {
    changeVolume(volume > 0 ? 0 : lastVolumeRef.current || 0.6);
    if (volume === 0) playSound('hit');
  };

  const changeName = (value) => {
    const name = value.slice(0, NAME_MAX);
    setMyName(name);
    localStorage.setItem(NAME_KEY, cleanName(name));
  };

  // ---------- Tela cheia (só o tabuleiro) ----------
  useEffect(() => {
    const onChange = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(!!el && el === frameRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // iPhone não tem tela cheia para elementos: usamos um modo "maximizado" via CSS
  useEffect(() => {
    if (!pseudoFull) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPseudoFull(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [pseudoFull]);

  const toggleFullscreen = () => {
    const el = frameRef.current;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (pseudoFull) {
      setPseudoFull(false);
      return;
    }
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (request) {
      Promise.resolve(request.call(el)).catch(() => setPseudoFull(true));
    } else {
      setPseudoFull(true);
    }
  };

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
    // Área real do jogo dentro do canvas (pode haver faixas pretas em tela cheia)
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
    const offsetX = (rect.width - CANVAS_WIDTH * scale) / 2;
    const offsetY = (rect.height - CANVAS_HEIGHT * scale) / 2;
    const x = (e.clientX - rect.left - offsetX) / scale;
    const y = Math.max(0, Math.min(CANVAS_HEIGHT, (e.clientY - rect.top - offsetY) / scale));
    let side = pointersRef.current.get(e.pointerId);
    if (!side) {
      side = screenRef.current === 'local' ? (x < CANVAS_WIDTH / 2 ? 'left' : 'right') : 'any';
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
    setGoalBanner(null);
    updatePhase('over');
    playSound('win');
    send({ t: 'phase', phase: 'over', winner: winnerSide, scores: [s.player1Score, s.player2Score] });
  }, [send, updatePhase]);

  const runCountdown = useCallback((n) => {
    setCountdown(n);
    playSound(n === 0 ? 'go' : 'beep');
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
    readyRef.current = { host: false, guest: false };
    setReady({ host: false, guest: false });
    stateRef.current = createState(winScoreRef.current);
    setScores([0, 0]);
    setWinner(null);
    setGoalBanner(null);
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
      if (event === 'point') showGoal(s.lastScorer);
      const fx = s.fx;
      s.fx = [];
      fx.forEach(playSound);

      if (screen === 'online') {
        const msg = {
          t: 's',
          a: Math.round(s.player1.y),
          b: Math.round(s.player2.y),
          x: Math.round(s.ball.x * 10) / 10,
          y: Math.round(s.ball.y * 10) / 10,
          p: [s.player1Score, s.player2Score]
        };
        if (fx.length) msg.f = fx;
        if (event === 'point') msg.g = s.lastScorer;
        send(msg);
      }
      if (event === 'over') finishMatch(s.player1Score >= s.winScore ? 1 : 2);
    }, 1000 / 60);

    return () => clearInterval(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, screen, role, send, finishMatch, showGoal]);

  // Revanche online: só recomeça quando os dois confirmam
  const markReady = useCallback((who) => {
    readyRef.current = { ...readyRef.current, [who]: true };
    const { host, guest } = readyRef.current;
    setReady({ host, guest });
    send({ t: 'ready', host, guest });
    if (host && guest) startMatch();
  }, [send, startMatch]);

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
    if (slotPeerRef.current) slotPeerRef.current.destroy();
    slotPeerRef.current = null;
    connRef.current = null;
    peerRef.current = null;
    remoteInputRef.current = { up: false, down: false, target: null };
    lastSentInputRef.current = '';
    stateRef.current = createState();
    setScores([0, 0]);
    setWinner(null);
    setGoalBanner(null);
    setRemoteName('');
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
      if (slotPeerRef.current) slotPeerRef.current.destroy();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      sayBye();
      clearTimers();
      if (peerRef.current) peerRef.current.destroy();
      if (slotPeerRef.current) slotPeerRef.current.destroy();
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
  const becomeHost = useCallback((peer, code) => {
    peerRef.current = peer;
    setRole('host');
    setRoom(code);
    setScreen('online');
    updatePhase('waiting');
    setRoomInUrl(code);
    stateRef.current = createState();

    peer.on('disconnected', () => {
      if (!leavingRef.current && !peer.destroyed) peer.reconnect();
    });

    const answerProbe = (conn) => {
      conn.on('open', () => {
        conn.send({ t: 'status', code, players: connRef.current ? 2 : 1, host: cleanName(myNameRef.current), win: winScoreRef.current });
        setTimeout(() => conn.close(), 1500);
      });
    };

    // Anunciar a sala no lobby (se houver vaga livre)
    claimListingSlot().then((slotPeer) => {
      if (!slotPeer) return;
      if (peerRef.current !== peer || peer.destroyed) {
        slotPeer.destroy();
        return;
      }
      slotPeerRef.current = slotPeer;
      slotPeer.on('connection', (conn) => {
        if (conn.metadata?.type === 'probe') answerProbe(conn);
        else conn.close();
      });
      slotPeer.on('disconnected', () => {
        if (!slotPeer.destroyed) slotPeer.reconnect();
      });
    });

    peer.on('connection', (conn) => {
      const type = conn.metadata?.type;

      if (type === 'probe') {
        answerProbe(conn);
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
      setRemoteName(cleanName(conn.metadata?.name));
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
        conn.send({ t: 'welcome', room: code, name: cleanName(myNameRef.current), win: winScoreRef.current });
        startMatch();
      });
      conn.on('data', (msg) => {
        lastSeenRef.current = Date.now();
        if (msg?.t === 'in') remoteInputRef.current = { up: !!msg.up, down: !!msg.down, target: msg.target ?? null };
        if (msg?.t === 'again' && phaseRef.current === 'over') markReady('guest');
        if (msg?.t === 'bye') onGuestLeft();
      });
      const onGuestLeft = () => {
        if (connRef.current !== conn) return;
        connRef.current = null;
        remoteGoneRef.current = null;
        conn.close();
        clearTimers();
        remoteInputRef.current = { up: false, down: false, target: null };
        stateRef.current = createState(winScoreRef.current);
        setScores([0, 0]);
        setWinner(null);
        readyRef.current = { host: false, guest: false };
        setReady({ host: false, guest: false });
        if (!leavingRef.current) {
          setNotice('O oponente saiu. Aguardando outro jogador...');
          setRemoteName('');
          updatePhase('waiting');
        }
      };
      conn.on('close', onGuestLeft);
      conn.on('error', onGuestLeft);
    });
  }, [setRoomInUrl, startMatch, updatePhase, markReady]);

  const createRoom = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { peer, code } = await hostNewRoom();
      becomeHost(peer, code);
    } catch (err) {
      setNotice(err.message || 'Não foi possível criar a sala.');
    } finally {
      setBusy(false);
    }
  };

  const claimRoom = useCallback(async (code) => {
    try {
      const peer = await hostRoom(code);
      becomeHost(peer, code);
      return true;
    } catch (err) {
      return err.type === 'unavailable-id' ? false : Promise.reject(err);
    }
  }, [becomeHost]);

  // ---------- Online: convidado ----------
  const joinRoom = useCallback(async (code, { claimIfEmpty = false } = {}) => {
    resetOnline();
    setScreen('online');
    setRole('guest');
    setRoom(code);
    setNotice(null);
    updatePhase('connecting');
    setRoomInUrl(code);

    let peer;
    try {
      peer = await openGuestPeer();
    } catch {
      setNotice('Não foi possível conectar ao servidor do jogo. Tente novamente.');
      updatePhase('closed');
      return;
    }
    peerRef.current = peer;

    const conn = peer.connect(roomPeerId(code), { metadata: { type: 'join', name: cleanName(myNameRef.current) }, serialization: 'json' });
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
          if (await claimRoom(code)) return;
        } catch {
          // segue para a mensagem abaixo
        }
      }
      setNotice(`A sala ${code.toUpperCase()} não está mais aberta.`);
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
        if (msg.f) msg.f.forEach(playSound);
        if (msg.g) showGoal(msg.g);
      } else if (msg.t === 'welcome') {
        const win = WIN_OPTIONS.includes(msg.win) ? msg.win : DEFAULT_WIN;
        setWinScore(win);
        stateRef.current = createState(win);
        setScores([0, 0]);
        setRemoteName(cleanName(msg.name));
      } else if (msg.t === 'ready') {
        setReady({ host: !!msg.host, guest: !!msg.guest });
      } else if (msg.t === 'full') {
        setNotice(`A sala ${code.toUpperCase()} já está cheia.`);
        updatePhase('closed');
      } else if (msg.t === 'phase') {
        if (msg.phase === 'countdown') {
          if (msg.count === 3) {
            stateRef.current = createState(winScoreRef.current);
            setScores([0, 0]);
            setWinner(null);
            setGoalBanner(null);
            setReady({ host: false, guest: false });
          }
          setCountdown(msg.count);
          playSound('beep');
        }
        if (msg.phase === 'playing') playSound('go');
        if (msg.phase === 'over') {
          setWinner(msg.winner);
          setScores(msg.scores);
          setGoalBanner(null);
          playSound('win');
        }
        updatePhase(msg.phase);
      }
    });

    conn.on('close', onHostLeft);
  }, [claimRoom, resetOnline, setRoomInUrl, updatePhase, showGoal]);

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
  const urlRoom = (searchParams.get('sala') || '').trim().toLowerCase();
  const handledUrlRef = useRef(false);
  useEffect(() => {
    if (handledUrlRef.current) return;
    handledUrlRef.current = true;
    if (CODE_PATTERN.test(urlRoom)) joinRoom(urlRoom, { claimIfEmpty: true });
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
    if (screen !== 'online') startMatch();
    else if (role === 'host') markReady('host');
    else {
      setReady((r) => ({ ...r, guest: true }));
      send({ t: 'again' });
    }
  };

  // ---------- Textos ----------
  const roomLabel = room ? room.toUpperCase() : '';
  const mine = cleanName(myName);
  const names = screen === 'online'
    ? (role === 'host'
      ? [mine || 'Jogador 1', remoteName || 'Jogador 2']
      : [remoteName || 'Jogador 1', mine || 'Jogador 2'])
    : ['Jogador 1', 'Jogador 2'];
  // Índice (0/1) do jogador desta tela no modo online
  const myIndex = screen === 'online' && role ? (role === 'host' ? 0 : 1) : null;
  const winnerName = winner ? names[winner - 1] : '';
  const meReady = myIndex === 0 ? ready.host : myIndex === 1 ? ready.guest : false;
  const otherReady = myIndex === 0 ? ready.guest : myIndex === 1 ? ready.host : false;
  const readyCount = (ready.host ? 1 : 0) + (ready.guest ? 1 : 0);
  const youWon = myIndex !== null && winner === myIndex + 1;

  const winSelector = (
    <div className="pong-win-select" role="radiogroup" aria-label="Gols para vencer">
      <span>Gols para vencer:</span>
      {WIN_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={winScore === option}
          className={winScore === option ? 'active' : ''}
          onClick={() => setWinScore(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );

  const nameField = (
    <label className="pong-name-field">
      <span>Seu nome (opcional)</span>
      <input
        type="text"
        value={myName}
        maxLength={NAME_MAX}
        placeholder={role === 'guest' ? 'Jogador 2' : 'Jogador 1'}
        onChange={(e) => changeName(e.target.value)}
      />
    </label>
  );

  const renderOverlay = () => {
    if (screen === 'menu') {
      return (
        <div className="pong-panel">
          <h2>Pong</h2>
          <p>Primeiro a {winScore} gols vence!</p>
          {winSelector}
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
          {nameField}
          <div className="pong-room-list">
            {loadingRooms && rooms.length === 0 && <p className="pong-muted">Procurando salas...</p>}
            {!loadingRooms && rooms.length === 0 && <p className="pong-muted">Nenhuma sala aberta. Crie a primeira!</p>}
            {rooms.map(({ code, players, host, win }) => (
              <div key={code} className={`pong-room ${players >= 2 ? 'full' : ''}`}>
                <span className="pong-room-name">
                  Sala {code.toUpperCase()}
                  {host && <small> · {host}</small>}
                </span>
                <span className="pong-room-players">
                  {players}/2{win ? ` · até ${win}` : ''}
                </span>
                <button
                  className="pong-btn small"
                  disabled={players >= 2}
                  onClick={() => joinRoom(code)}
                >
                  {players >= 2 ? 'Cheia' : 'Entrar'}
                </button>
              </div>
            ))}
          </div>
          {notice && <p className="pong-notice">{notice}</p>}
          {winSelector}
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
          <h2>Sala {roomLabel}</h2>
          {notice && <p className="pong-notice">{notice}</p>}
          <p className="pong-waiting"><span className="pong-dot" /> Aguardando oponente (1/2)</p>
          <p className="pong-muted">Partida até {winScore} gols</p>
          {nameField}
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
          <h2>Sala {roomLabel}</h2>
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
          {screen === 'online' && (meReady || otherReady) && (
            <p className="pong-waiting">
              <span className="pong-dot" />
              {meReady ? 'Aguardando o oponente confirmar' : `${names[1 - myIndex]} quer jogar de novo!`} ({readyCount}/2)
            </p>
          )}
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={playAgain} disabled={screen === 'online' && meReady}>
              {screen === 'online' && meReady ? `Pronto (${readyCount}/2)` : 'Jogar novamente'}
            </button>
            <button className="pong-btn ghost" onClick={screen === 'online' ? openLobby : goToMenu}>
              {screen === 'online' ? 'Sair da sala' : 'Menu'}
            </button>
          </div>
        </div>
      );
    }

    if (phase === 'playing' && goalBanner) {
      return (
        <div className="pong-goal" key={goalBanner.id}>
          <strong>⚽ Gol de {names[goalBanner.scorer - 1]}!</strong>
          <span>Prepare-se...</span>
          <div className="pong-goal-bar" />
        </div>
      );
    }

    return null;
  };

  const overlay = renderOverlay();
  // Contagem e aviso de gol ficam por cima do jogo sem bloquear os controles
  const passiveOverlay = phase === 'countdown' || (phase === 'playing' && !!goalBanner);
  const volumeIcon = volume === 0 ? '🔇' : volume < 0.4 ? '🔈' : volume < 0.75 ? '🔉' : '🔊';
  const isOnline = screen === 'online';
  const mySide = role === 'host' ? 'esquerda (ciano)' : 'direita (rosa)';

  return (
    <div className="pong-container">
      <div className="pong-header">
        <h1>🎮 Pong</h1>
        <div className="pong-volume">
          <button
            className="pong-volume-btn"
            onClick={() => setShowVolume((v) => !v)}
            aria-label="Volume do som"
            aria-expanded={showVolume}
            title="Volume do som"
          >
            {volumeIcon}
          </button>
          {showVolume && (
            <div className="pong-volume-pop">
              <button className="pong-volume-mute" onClick={toggleMute} aria-label={volume === 0 ? 'Ativar som' : 'Silenciar'}>
                {volume === 0 ? '🔇' : '🔊'}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(volume * 100)}
                onChange={(e) => changeVolume(Number(e.target.value) / 100)}
                onPointerUp={() => playSound('hit')}
                aria-label="Volume"
              />
              <span className="pong-volume-value">{Math.round(volume * 100)}%</span>
            </div>
          )}
        </div>
        <div className="pong-score">
          <div className="player-score player1-score">
            <span className="pong-score-name">{names[0]}</span>
            {myIndex === 0 && <em className="pong-you">você</em>}
            <strong>{scores[0]}</strong>
          </div>
          <div className="separator">vs</div>
          <div className="player-score player2-score">
            <span className="pong-score-name">{names[1]}</span>
            {myIndex === 1 && <em className="pong-you">você</em>}
            <strong>{scores[1]}</strong>
          </div>
        </div>
      </div>

      <div className="pong-game-wrapper">
        <div
          className={`pong-frame ${overlay && !passiveOverlay ? 'has-panel' : ''} ${isFullscreen || pseudoFull ? 'is-full' : ''} ${pseudoFull ? 'pseudo-full' : ''}`}
          ref={frameRef}
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        >
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="pong-canvas" />
          {(isFullscreen || pseudoFull) && (
            <div className="pong-hud">
              <span className="p1">{names[0]}</span>
              <strong>{scores[0]} : {scores[1]}</strong>
              <span className="p2">{names[1]}</span>
            </div>
          )}
          <button
            type="button"
            className="pong-fs-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleFullscreen}
            title={isFullscreen || pseudoFull ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
            aria-label={isFullscreen || pseudoFull ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {isFullscreen || pseudoFull ? '✕' : '⛶'}
          </button>
          {overlay && (
            <div
              className={`pong-overlay ${passiveOverlay ? 'transparent' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {overlay}
            </div>
          )}
        </div>
      </div>

      {isOnline && role && ['countdown', 'playing', 'over'].includes(phase) && (
        <div className="pong-online-bar">
          <span>🌐 Sala {roomLabel} · Você controla a raquete da {mySide}</span>
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
          <li>Primeiro a chegar em {winScore} gols vence (escolha 3, 5 ou 10)</li>
          <li>A bola aumenta de velocidade a cada rebatida</li>
          <li>Online: crie uma sala e envie o link, ou entre em uma sala aberta</li>
        </ul>
      </div>
    </div>
  );
};

export default Pong;
