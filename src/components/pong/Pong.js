import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { hostRoom, hostNewRoom, claimListingSlot, openGuestPeer, listRooms, roomPeerId, CODE_PATTERN } from './pongNet';
import { playSound, unlockAudio, getVolume, setVolume } from './pongSound';
import {
  COLORS,
  COLOR_NAMES,
  WIN_OPTIONS,
  DEFAULT_WIN,
  SERVE_DELAY_FRAMES,
  canvasSize,
  createGameState,
  stepGame,
  drawGame,
  packState,
  applyPacked,
  hexTouchToTarget,
  activeEffects,
  POWERS
} from './pongPhysics';
import './Pong.css';

const JOIN_TIMEOUT = 12000;
const HEARTBEAT_TIMEOUT = 6000;
const NAME_MAX = 16;
const NAME_KEY = 'pong-player-name';
const PLAYER_OPTIONS = [2, 3];

const cleanName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const emptyInput = () => ({ up: false, down: false, left: false, right: false, target: null });
const filled = (n, value) => Array.from({ length: n }, () => value);

const Pong = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // screen: menu | local | lobby | online
  const [screen, setScreen] = useState('menu');
  // phase: idle | waiting | connecting | countdown | playing | over | closed
  const [phase, setPhase] = useState('idle');
  const [mode, setMode] = useState(2); // número de jogadores da partida
  const [countdown, setCountdown] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [winner, setWinner] = useState(null); // índice do vencedor
  const [role, setRole] = useState(null); // host | guest
  const [myIndex, setMyIndex] = useState(null); // índice deste jogador no online
  const [playerNames, setPlayerNames] = useState(['', '']);
  const [playersCount, setPlayersCount] = useState(1);
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(false);
  const [goalBanner, setGoalBanner] = useState(null); // { kind: goal|own|none, who, id }
  const [myName, setMyName] = useState(() => cleanName(localStorage.getItem(NAME_KEY)));
  const [volume, setVolumeState] = useState(getVolume);
  const [showVolume, setShowVolume] = useState(false);
  const [winScore, setWinScore] = useState(DEFAULT_WIN);
  const [ready, setReady] = useState([false, false]); // revanche online
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pseudoFull, setPseudoFull] = useState(false);
  const [setup, setSetup] = useState(null); // modal: { kind: online|local, players, win }
  const [effects, setEffects] = useState({ big: 0, slow: 0, fast: 0 }); // segundos restantes dos poderes
  const [powerToast, setPowerToast] = useState(null); // { type, id }

  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const stateRef = useRef(createGameState(2));
  const keysRef = useRef({ w: false, s: false, a: false, d: false, up: false, down: false, left: false, right: false });
  const touchRef = useRef({ left: null, right: null, any: null });
  const pointersRef = useRef(new Map());
  const peerRef = useRef(null);
  const slotPeerRef = useRef(null); // vaga de anúncio no lobby (só anfitrião)
  const connRef = useRef(null); // convidado -> anfitrião
  const guestsRef = useRef(new Map()); // anfitrião: índice -> { conn, lastSeen, input }
  const namesRef = useRef(['', '']); // anfitrião: nomes oficiais da sala
  const timersRef = useRef([]);
  const leavingRef = useRef(false);
  const lastSentInputRef = useRef('');
  const lastSeenRef = useRef(0);
  const remoteGoneRef = useRef(null);
  const screenRef = useRef(screen);
  const roleRef = useRef(role);
  const phaseRef = useRef(phase);
  const modeRef = useRef(mode);
  const myIndexRef = useRef(myIndex);
  const myNameRef = useRef(myName);
  const winScoreRef = useRef(winScore);
  const readyRef = useRef([false, false]);
  const labelsRef = useRef([]);
  const goalTimerRef = useRef(null);
  const powerTimerRef = useRef(null);
  const effectsKeyRef = useRef('');
  const lastVolumeRef = useRef(getVolume() || 0.6);

  screenRef.current = screen;
  roleRef.current = role;
  modeRef.current = mode;
  myIndexRef.current = myIndex;
  myNameRef.current = myName;
  winScoreRef.current = winScore;

  const updatePhase = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  // Anfitrião envia para todos os convidados; convidado envia para o anfitrião
  const send = useCallback((msg) => {
    if (roleRef.current === 'host') {
      guestsRef.current.forEach(({ conn }) => {
        if (conn.open) conn.send(msg);
      });
      return;
    }
    const conn = connRef.current;
    if (conn && conn.open) conn.send(msg);
  }, []);

  const setRoomInUrl = useCallback((value) => {
    setSearchParams(value ? { sala: String(value) } : {}, { replace: true });
  }, [setSearchParams]);

  const showGoal = useCallback((kind, who) => {
    clearTimeout(goalTimerRef.current);
    setGoalBanner({ kind, who, id: Date.now() });
    goalTimerRef.current = setTimeout(() => setGoalBanner(null), (SERVE_DELAY_FRAMES / 60) * 1000);
  }, []);

  const showPower = useCallback((type) => {
    if (!POWERS[type]) return;
    clearTimeout(powerTimerRef.current);
    setPowerToast({ type, id: Date.now() });
    powerTimerRef.current = setTimeout(() => setPowerToast(null), 1800);
  }, []);

  // Atualiza os indicadores de poder só quando os segundos mudam
  const syncEffects = useCallback((s) => {
    const next = activeEffects(s);
    const key = `${next.big}|${next.slow}|${next.fast}`;
    if (key !== effectsKeyRef.current) {
      effectsKeyRef.current = key;
      setEffects(next);
    }
  }, []);

  // Troca de modo (2 ou 3 jogadores) reinicia o estado do jogo
  const applyMode = useCallback((nextMode, win = winScoreRef.current) => {
    modeRef.current = nextMode;
    setMode(nextMode);
    stateRef.current = createGameState(nextMode, win);
    setScores(filled(nextMode, 0));
    readyRef.current = filled(nextMode, false);
    setReady(filled(nextMode, false));
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
      clearTimeout(powerTimerRef.current);
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

  // ---------- Nomes ----------
  const broadcastPlayers = useCallback(() => {
    const names = [...namesRef.current];
    const count = 1 + [...guestsRef.current.values()].filter((g) => g.conn.open).length;
    setPlayerNames(names);
    setPlayersCount(count);
    send({ t: 'players', names, n: count });
  }, [send]);

  const changeName = (value) => {
    const name = value.slice(0, NAME_MAX);
    setMyName(name);
    localStorage.setItem(NAME_KEY, cleanName(name));
    if (screenRef.current !== 'online' || myIndexRef.current === null) return;
    if (roleRef.current === 'host') {
      namesRef.current[0] = cleanName(name);
      broadcastPlayers();
    } else {
      send({ t: 'name', name: cleanName(name) });
    }
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
  const myInput = () => {
    const k = keysRef.current;
    return {
      up: k.w || k.up,
      down: k.s || k.down,
      left: k.a || k.left,
      right: k.d || k.right,
      target: touchRef.current.any
    };
  };

  const localInputs = () => {
    const k = keysRef.current;
    return [
      { up: k.w, down: k.s, target: touchRef.current.left },
      { up: k.up, down: k.down, target: touchRef.current.right }
    ];
  };

  useEffect(() => {
    const map = { w: 'w', s: 's', a: 'a', d: 'd', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };
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

  // Toque/mouse: a raquete segue o dedo. No modo local, cada metade da tela controla um jogador.
  const handlePointer = (e) => {
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture?.(e.pointerId);
    if (e.type === 'pointermove' && !pointersRef.current.has(e.pointerId)) return;
    const { w, h } = canvasSize(modeRef.current);
    // Área real do jogo dentro do canvas (pode haver faixas pretas em tela cheia)
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / w, rect.height / h);
    const x = (e.clientX - rect.left - (rect.width - w * scale) / 2) / scale;
    const y = Math.max(0, Math.min(h, (e.clientY - rect.top - (rect.height - h * scale) / 2) / scale));
    let side = pointersRef.current.get(e.pointerId);
    if (!side) {
      side = screenRef.current === 'local' ? (x < w / 2 ? 'left' : 'right') : 'any';
      pointersRef.current.set(e.pointerId, side);
    }
    touchRef.current[side] = modeRef.current === 3 ? hexTouchToTarget(x) : y;
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
      const s = stateRef.current;
      if (canvas && s.mode === modeRef.current) {
        drawGame(canvas.getContext('2d'), s, myIndexRef.current || 0, labelsRef.current);
      }

      // Convidado envia seus comandos quando mudam
      if (roleRef.current === 'guest' && screenRef.current === 'online') {
        const input = myInput();
        if (input.target !== null) input.target = Math.round(input.target * 1000) / 1000;
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
  const finishMatch = useCallback((winnerIndex) => {
    const s = stateRef.current;
    setWinner(winnerIndex);
    setGoalBanner(null);
    updatePhase('over');
    playSound('win');
    send({ t: 'phase', phase: 'over', winner: winnerIndex, scores: s.scores });
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
    const n = modeRef.current;
    readyRef.current = filled(n, false);
    setReady(filled(n, false));
    stateRef.current = createGameState(n, winScoreRef.current);
    setScores(filled(n, 0));
    setWinner(null);
    setGoalBanner(null);
    syncEffects(stateRef.current);
    runCountdown(3);
  }, [runCountdown, syncEffects]);

  useEffect(() => {
    const simulates = screen === 'local' || (screen === 'online' && role === 'host');
    if (phase !== 'playing' || !simulates) return undefined;

    const loop = setInterval(() => {
      const s = stateRef.current;
      let inputs;
      if (screen === 'local') {
        inputs = localInputs();
      } else {
        inputs = [myInput()];
        for (let i = 1; i < s.mode; i++) inputs.push(guestsRef.current.get(i)?.input || emptyInput());
      }

      const event = stepGame(s, inputs);
      if (event && event.type !== 'nopoint') setScores([...s.scores]);
      let banner = null;
      if (event?.type === 'point') banner = { k: 'goal', w: event.scorer };
      if (event?.type === 'nopoint') banner = { k: event.reason, w: event.conceded };
      if (banner) showGoal(banner.k, banner.w);

      const fx = s.fx;
      s.fx = [];
      fx.forEach(playSound);
      const pw = s.pw;
      s.pw = [];
      pw.forEach(showPower);
      syncEffects(s);

      if (screen === 'online') {
        const msg = packState(s);
        if (fx.length) msg.f = fx;
        if (pw.length) msg.pw = pw;
        if (banner) msg.g = banner;
        send(msg);
      }
      if (event?.type === 'over') finishMatch(event.scorer);
    }, 1000 / 60);

    return () => clearInterval(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, screen, role, send, finishMatch, showGoal, showPower, syncEffects]);

  // Revanche online: só recomeça quando todos confirmam
  const markReady = useCallback((index) => {
    readyRef.current = readyRef.current.map((v, i) => (i === index ? true : v));
    setReady([...readyRef.current]);
    send({ t: 'ready', r: readyRef.current });
    if (readyRef.current.every(Boolean)) startMatch();
  }, [send, startMatch]);

  // ---------- Online: encerrar ----------
  const resetOnline = useCallback(() => {
    clearTimers();
    leavingRef.current = true;
    remoteGoneRef.current = null;
    const sayBye = (conn) => {
      try {
        if (conn.open) conn.send({ t: 'bye' });
      } catch {
        // conexão já encerrada
      }
      conn.close();
    };
    if (connRef.current) sayBye(connRef.current);
    guestsRef.current.forEach(({ conn }) => sayBye(conn));
    guestsRef.current = new Map();
    if (peerRef.current) peerRef.current.destroy();
    if (slotPeerRef.current) slotPeerRef.current.destroy();
    slotPeerRef.current = null;
    connRef.current = null;
    peerRef.current = null;
    lastSentInputRef.current = '';
    setWinner(null);
    setGoalBanner(null);
    setRole(null);
    setMyIndex(null);
    setRoom(null);
    setPlayersCount(1);
    setPlayerNames(['', '']);
    applyMode(2, DEFAULT_WIN);
    setTimeout(() => {
      leavingRef.current = false;
    }, 0);
  }, [applyMode]);

  // Avisar os outros jogadores ao fechar a aba ou sair da rota
  useEffect(() => {
    const sayBye = () => {
      const conns = [connRef.current, ...[...guestsRef.current.values()].map((g) => g.conn)];
      conns.forEach((conn) => {
        try {
          if (conn?.open) conn.send({ t: 'bye' });
        } catch {
          // conexão já encerrada
        }
      });
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

  // ---------- Online: anfitrião ----------
  const removeGuest = useRef(null);

  const becomeHost = useCallback((peer, code, players, win) => {
    peerRef.current = peer;
    guestsRef.current = new Map();
    namesRef.current = filled(players, '');
    namesRef.current[0] = cleanName(myNameRef.current);
    winScoreRef.current = win;
    setWinScore(win);
    applyMode(players, win);
    setRole('host');
    roleRef.current = 'host';
    setMyIndex(0);
    setRoom(code);
    setPlayerNames([...namesRef.current]);
    setPlayersCount(1);
    setScreen('online');
    updatePhase('waiting');
    setRoomInUrl(code);

    peer.on('disconnected', () => {
      if (!leavingRef.current && !peer.destroyed) peer.reconnect();
    });

    const openGuests = () => [...guestsRef.current.values()].filter((g) => g.conn.open).length;

    const answerProbe = (conn) => {
      conn.on('open', () => {
        conn.send({
          t: 'status',
          code,
          players: 1 + guestsRef.current.size,
          max: players,
          host: cleanName(myNameRef.current),
          win: winScoreRef.current
        });
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

    // Um jogador saiu: a partida volta para a espera
    const onGuestLeft = (index, conn) => {
      const guest = guestsRef.current.get(index);
      if (!guest || guest.conn !== conn) return;
      guestsRef.current.delete(index);
      conn.close();
      const leftName = namesRef.current[index] || `Jogador ${index + 1}`;
      namesRef.current[index] = '';
      if (leavingRef.current) return;
      clearTimers();
      stateRef.current = createGameState(players, winScoreRef.current);
      setScores(filled(players, 0));
      setWinner(null);
      setGoalBanner(null);
      readyRef.current = filled(players, false);
      setReady(filled(players, false));
      setNotice(`${leftName} saiu. Aguardando jogadores...`);
      updatePhase('waiting');
      send({ t: 'phase', phase: 'waiting', notice: `${leftName} saiu. Aguardando jogadores...` });
      broadcastPlayers();
    };
    removeGuest.current = onGuestLeft;

    peer.on('connection', (conn) => {
      const type = conn.metadata?.type;

      if (type === 'probe') {
        answerProbe(conn);
        return;
      }

      const freeIndex = Array.from({ length: players - 1 }, (_, i) => i + 1).find((i) => !guestsRef.current.has(i));
      if (!freeIndex || phaseRef.current !== 'waiting') {
        conn.on('open', () => {
          conn.send({ t: 'full' });
          setTimeout(() => conn.close(), 500);
        });
        return;
      }

      const guest = { conn, lastSeen: Date.now(), input: emptyInput() };
      guestsRef.current.set(freeIndex, guest);
      namesRef.current[freeIndex] = cleanName(conn.metadata?.name);

      // Se a conexão P2P nunca abrir (rede bloqueada), liberar a vaga
      const pendingTimer = setTimeout(() => {
        if (!conn.open && guestsRef.current.get(freeIndex)?.conn === conn) {
          guestsRef.current.delete(freeIndex);
          namesRef.current[freeIndex] = '';
          conn.close();
        }
      }, JOIN_TIMEOUT);

      conn.on('open', () => {
        clearTimeout(pendingTimer);
        guest.lastSeen = Date.now();
        setNotice(null);
        conn.send({
          t: 'welcome',
          room: code,
          index: freeIndex,
          mode: players,
          win: winScoreRef.current,
          names: namesRef.current
        });
        broadcastPlayers();
        if (openGuests() === players - 1) startMatch();
      });
      conn.on('data', (msg) => {
        guest.lastSeen = Date.now();
        if (!msg) return;
        if (msg.t === 'in') {
          guest.input = { up: !!msg.up, down: !!msg.down, left: !!msg.left, right: !!msg.right, target: msg.target ?? null };
        } else if (msg.t === 'again' && phaseRef.current === 'over') {
          markReady(freeIndex);
        } else if (msg.t === 'name') {
          namesRef.current[freeIndex] = cleanName(msg.name);
          broadcastPlayers();
        } else if (msg.t === 'bye') {
          onGuestLeft(freeIndex, conn);
        }
      });
      conn.on('close', () => onGuestLeft(freeIndex, conn));
      conn.on('error', () => onGuestLeft(freeIndex, conn));
    });
  }, [applyMode, broadcastPlayers, markReady, send, setRoomInUrl, startMatch, updatePhase]);

  // Batimento: detecta quedas em que o WebRTC não avisa (aba encerrada, internet caiu)
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (roleRef.current === 'host') {
        guestsRef.current.forEach((guest, index) => {
          if (!guest.conn.open) return;
          guest.conn.send({ t: 'ping' });
          if (now - guest.lastSeen > HEARTBEAT_TIMEOUT) removeGuest.current?.(index, guest.conn);
        });
        return;
      }
      const conn = connRef.current;
      if (!conn || !conn.open) return;
      conn.send({ t: 'ping' });
      if (now - lastSeenRef.current > HEARTBEAT_TIMEOUT) remoteGoneRef.current?.();
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const createRoom = async ({ players, win }) => {
    setBusy(true);
    setNotice(null);
    try {
      const { peer, code } = await hostNewRoom();
      setSetup(null);
      becomeHost(peer, code, players, win);
    } catch (err) {
      setNotice(err.message || 'Não foi possível criar a sala.');
    } finally {
      setBusy(false);
    }
  };

  const claimRoom = useCallback(async (code) => {
    try {
      const peer = await hostRoom(code);
      becomeHost(peer, code, modeRef.current || 2, winScoreRef.current || DEFAULT_WIN);
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
    roleRef.current = 'guest';
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
        if ((s.mode || 2) !== (msg.q ? 3 : 2)) return;
        if (applyPacked(s, msg)) setScores([...s.scores]);
        syncEffects(s);
        if (msg.f) msg.f.forEach(playSound);
        if (msg.pw) msg.pw.forEach(showPower);
        if (msg.g) showGoal(msg.g.k, msg.g.w);
      } else if (msg.t === 'welcome') {
        const players = PLAYER_OPTIONS.includes(msg.mode) ? msg.mode : 2;
        const win = WIN_OPTIONS.includes(msg.win) ? msg.win : DEFAULT_WIN;
        winScoreRef.current = win;
        setWinScore(win);
        applyMode(players, win);
        setMyIndex(msg.index || 1);
        myIndexRef.current = msg.index || 1;
        setPlayerNames(msg.names || filled(players, ''));
        updatePhase('waiting');
      } else if (msg.t === 'players') {
        setPlayerNames(msg.names || []);
        setPlayersCount(msg.n || 1);
      } else if (msg.t === 'ready') {
        if (Array.isArray(msg.r)) setReady(msg.r);
      } else if (msg.t === 'full') {
        setNotice(`A sala ${code.toUpperCase()} já está cheia ou a partida já começou.`);
        updatePhase('closed');
      } else if (msg.t === 'phase') {
        const n = modeRef.current;
        if (msg.phase === 'countdown') {
          if (msg.count === 3) {
            stateRef.current = createGameState(n, winScoreRef.current);
            setScores(filled(n, 0));
            setWinner(null);
            setGoalBanner(null);
            setReady(filled(n, false));
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
        if (msg.phase === 'waiting') {
          stateRef.current = createGameState(n, winScoreRef.current);
          setScores(filled(n, 0));
          setWinner(null);
          setGoalBanner(null);
          setReady(filled(n, false));
          setNotice(msg.notice || null);
        }
        updatePhase(msg.phase);
      }
    });

    conn.on('close', onHostLeft);
  }, [applyMode, claimRoom, resetOnline, setRoomInUrl, updatePhase, showGoal, showPower, syncEffects]);

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

  const startLocal = (win) => {
    resetOnline();
    setSetup(null);
    winScoreRef.current = win;
    setWinScore(win);
    applyMode(2, win);
    setScreen('local');
    startMatch();
  };

  // Entrar direto pelo link (#/pong?sala=ab3f)
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
    else if (role === 'host') markReady(0);
    else {
      setReady((r) => r.map((v, i) => (i === myIndex ? true : v)));
      send({ t: 'again' });
    }
  };

  // ---------- Textos ----------
  const roomLabel = room ? room.toUpperCase() : '';
  const isOnline = screen === 'online';
  const names = Array.from({ length: mode }, (_, i) => {
    if (!isOnline) return `Jogador ${i + 1}`;
    return (i === myIndex ? cleanName(myName) : playerNames[i]) || `Jogador ${i + 1}`;
  });
  labelsRef.current = names;
  const winnerName = winner !== null ? names[winner] : '';
  const youWon = isOnline && winner !== null && winner === myIndex;
  const meReady = myIndex !== null && !!ready[myIndex];
  const readyCount = ready.filter(Boolean).length;
  const othersReady = ready.some((v, i) => v && i !== myIndex);

  const nameField = (
    <label className="pong-name-field">
      <span>Seu nome (opcional)</span>
      <input
        type="text"
        value={myName}
        maxLength={NAME_MAX}
        placeholder={myIndex !== null ? `Jogador ${myIndex + 1}` : 'Jogador 1'}
        onChange={(e) => changeName(e.target.value)}
      />
    </label>
  );

  const renderOverlay = () => {
    if (screen === 'menu') {
      return (
        <div className="pong-panel">
          <h2>Pong</h2>
          <p>Jogue no mesmo teclado ou online com 2 ou 3 jogadores</p>
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={() => setSetup({ kind: 'local', players: 2, win: winScore })}>
              🎮 Jogar local
            </button>
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
            {rooms.map(({ code, players, max, host, win }) => {
              const cap = max || 2;
              const full = players >= cap;
              return (
                <div key={code} className={`pong-room ${full ? 'full' : ''}`}>
                  <span className="pong-room-name">
                    Sala {code.toUpperCase()}
                    {host && <small> · {host}</small>}
                  </span>
                  <span className="pong-room-players">
                    {players}/{cap}{win ? ` · até ${win}` : ''}
                  </span>
                  <button className="pong-btn small" disabled={full} onClick={() => joinRoom(code)}>
                    {full ? 'Cheia' : 'Entrar'}
                  </button>
                </div>
              );
            })}
          </div>
          {notice && <p className="pong-notice">{notice}</p>}
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={() => setSetup({ kind: 'online', players: 2, win: winScore })} disabled={busy}>
              ➕ Criar sala
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
          <p className="pong-waiting">
            <span className="pong-dot" /> Aguardando jogadores ({playersCount}/{mode})
          </p>
          <p className="pong-muted">{mode} jogadores · até {winScore} gols</p>
          {nameField}
          <p className="pong-muted">Envie o link para entrarem direto na sala:</p>
          <div className="pong-share">
            <input readOnly value={shareLink} onFocus={(e) => e.target.select()} />
            <button className="pong-btn small" onClick={copyLink}>{copied ? 'Copiado!' : 'Copiar'}</button>
          </div>
          <button className="pong-btn ghost" onClick={openLobby}>{role === 'host' ? 'Fechar sala' : 'Sair da sala'}</button>
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
      const othersName = names.filter((_, i) => i !== myIndex && ready[i]).join(' e ');
      return (
        <div className="pong-panel">
          <h2>{isOnline ? (youWon ? 'Você venceu! 🏆' : `${winnerName} venceu!`) : `${winnerName} venceu! 🏆`}</h2>
          <p>{names.map((name, i) => `${name}: ${scores[i] ?? 0}`).join(' | ')}</p>
          {isOnline && (meReady || othersReady) && (
            <p className="pong-waiting">
              <span className="pong-dot" />
              {meReady ? 'Aguardando os outros confirmarem' : `${othersName} quer jogar de novo!`} ({readyCount}/{mode})
            </p>
          )}
          <div className="pong-actions">
            <button className="pong-btn primary" onClick={playAgain} disabled={isOnline && meReady}>
              {isOnline && meReady ? `Pronto (${readyCount}/${mode})` : 'Jogar novamente'}
            </button>
            <button className="pong-btn ghost" onClick={isOnline ? openLobby : goToMenu}>
              {isOnline ? 'Sair da sala' : 'Menu'}
            </button>
          </div>
        </div>
      );
    }

    if (phase === 'playing' && goalBanner) {
      const who = names[goalBanner.who] || '';
      const title = goalBanner.kind === 'goal'
        ? `⚽ Gol de ${who}!`
        : goalBanner.kind === 'own'
          ? `🙈 Gol contra de ${who}!`
          : '🚫 Ninguém tocou na bola';
      return (
        <div className="pong-goal" key={goalBanner.id}>
          <strong>{title}</strong>
          <span>{goalBanner.kind === 'goal' ? 'Prepare-se...' : 'Não vale ponto. Prepare-se...'}</span>
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
  const { w: canvasW, h: canvasH } = canvasSize(mode);
  const full = isFullscreen || pseudoFull;
  const myColor = myIndex !== null ? COLOR_NAMES[myIndex] : '';
  const mySide = mode === 3 ? `${myColor} (seu gol fica embaixo)` : myIndex === 0 ? 'esquerda (ciano)' : 'direita (rosa)';

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
        <div className={`pong-score players-${mode}`}>
          {names.map((name, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="separator">vs</div>}
              <div className="player-score" style={{ borderColor: COLORS[i], background: `${COLORS[i]}1a` }}>
                <span className="pong-score-name">{name}</span>
                {myIndex === i && isOnline && <em className="pong-you">você</em>}
                <strong style={{ color: COLORS[i] }}>{scores[i] ?? 0}</strong>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="pong-game-wrapper">
        <div
          className={`pong-frame mode-${mode} ${overlay && !passiveOverlay ? 'has-panel' : ''} ${full ? 'is-full' : ''} ${pseudoFull ? 'pseudo-full' : ''}`}
          ref={frameRef}
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={releasePointer}
          onPointerCancel={releasePointer}
        >
          <canvas ref={canvasRef} width={canvasW} height={canvasH} className="pong-canvas" />
          {full && mode === 2 && (
            <div className="pong-hud">
              <span style={{ color: COLORS[0] }}>{names[0]}</span>
              <strong>{scores[0]} : {scores[1]}</strong>
              <span style={{ color: COLORS[1] }}>{names[1]}</span>
            </div>
          )}
          {(phase === 'playing' || phase === 'countdown') && (effects.big > 0 || effects.slow > 0 || effects.fast > 0) && (
            <div className="pong-effects">
              {['big', 'slow', 'fast'].map((key) => (effects[key] > 0 ? (
                <span key={key} className="pong-effect" style={{ borderColor: POWERS[key].color }}>
                  {POWERS[key].icon} {effects[key]}s
                </span>
              ) : null))}
            </div>
          )}
          {powerToast && phase === 'playing' && (
            <div className="pong-power-toast" key={powerToast.id} style={{ borderColor: POWERS[powerToast.type].color }}>
              🎈 {POWERS[powerToast.type].icon} {POWERS[powerToast.type].label}
            </div>
          )}
          <button
            type="button"
            className="pong-fs-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleFullscreen}
            title={full ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
            aria-label={full ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            {full ? '✕' : '⛶'}
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
          <span>🌐 Sala {roomLabel} · Você controla a raquete {mode === 3 ? '' : 'da '}{mySide}</span>
          <button className="pong-btn small ghost" onClick={openLobby}>Sair da sala</button>
        </div>
      )}

      {isOnline ? (
        <div className="pong-instructions">
          <div className="instruction-column" style={{ borderColor: myIndex !== null ? COLORS[myIndex] : undefined }}>
            <h3 style={{ color: myIndex !== null ? COLORS[myIndex] : undefined }}>🎮 Seus controles</h3>
            <ul>
              {mode === 3 ? (
                <>
                  <li><strong>A / ←</strong> - Mover para a esquerda</li>
                  <li><strong>D / →</strong> - Mover para a direita</li>
                </>
              ) : (
                <>
                  <li><strong>W / ↑</strong> - Mover para cima</li>
                  <li><strong>S / ↓</strong> - Mover para baixo</li>
                </>
              )}
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
          <li>Use sua raquete para rebater a bola</li>
          <li>A bola sai devagar após cada gol e acelera a cada rebatida</li>
          <li>Primeiro a chegar em {winScore} gols vence</li>
          <li>Online: crie uma sala e envie o link, ou entre em uma sala aberta</li>
          <li>3 jogadores: o gol é de quem tocou por último na bola (a bola fica da cor dele). Gol contra não vale</li>
          <li>🎈 A cada 2 rebatidas surge um balão no meio da quadra. Acerte a bola nele para ativar um poder: 🔵 bola gigante, 🐢 bola lenta, ⚡ bola rápida ou ⚽ duas bolas</li>
        </ul>
      </div>

      {setup && (
        <div className="pong-modal-backdrop" onPointerDown={() => !busy && setSetup(null)}>
          <div
            className="pong-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pong-setup-title"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h2 id="pong-setup-title">{setup.kind === 'online' ? 'Criar sala' : 'Jogar local'}</h2>

            {setup.kind === 'online' && (
              <div className="pong-modal-field">
                <span>Jogadores</span>
                <div className="pong-segment">
                  {PLAYER_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={setup.players === option ? 'active' : ''}
                      onClick={() => setSetup((s) => ({ ...s, players: option }))}
                    >
                      {option === 2 ? '2 · clássico' : '3 · hexágono'}
                    </button>
                  ))}
                </div>
                {setup.players === 3 && (
                  <p className="pong-modal-hint">
                    Campo de 3 gols. Faz o ponto quem tocou por último na bola. Começa quando os 3 entrarem.
                  </p>
                )}
              </div>
            )}

            <div className="pong-modal-field">
              <span>Gols para vencer</span>
              <div className="pong-segment">
                {WIN_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={setup.win === option ? 'active' : ''}
                    onClick={() => setSetup((s) => ({ ...s, win: option }))}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {notice && setup.kind === 'online' && <p className="pong-notice">{notice}</p>}

            <div className="pong-actions">
              <button
                className="pong-btn primary"
                disabled={busy}
                onClick={() => (setup.kind === 'online' ? createRoom(setup) : startLocal(setup.win))}
              >
                {setup.kind === 'online' ? (busy ? 'Criando...' : 'Criar sala') : 'Começar'}
              </button>
              <button className="pong-btn ghost" disabled={busy} onClick={() => setSetup(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pong;
