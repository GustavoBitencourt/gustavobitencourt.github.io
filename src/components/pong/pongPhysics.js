// Física e desenho do Pong.
//  - Modo 2 jogadores: campo clássico 800x400, raquetes nas laterais.
//  - Modo 3 jogadores: hexágono regular com lados alternados gol/parede (3 gols iguais e
//    equidistantes do centro). Cada jogador vê o próprio gol embaixo.
// Os dois modos compartilham o formato de estado: { mode, scores, ball, serveFrames, fx, ... }
// e stepGame devolve null ou { type: 'point' | 'over' | 'nopoint', scorer, conceded, reason }.

export const COLORS = ['#00ffcc', '#ff6b9d', '#b388ff'];
export const COLOR_NAMES = ['ciano', 'rosa', 'roxo'];
export const BALL_COLOR = '#ffd700';
export const WIN_OPTIONS = [3, 5, 10];
export const DEFAULT_WIN = 5;
export const SERVE_DELAY_FRAMES = 60; // 1 s de pausa após cada gol (loop a 60 FPS)

const BALL_SIZE = 8;
const BALL_R = BALL_SIZE / 2;
const BALL_SPEED = 5;
const SERVE_SPEED = 2.2; // saque lento até o primeiro toque numa raquete

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// =====================================================================
// Modo clássico (2 jogadores)
// =====================================================================
export const CLASSIC_W = 800;
export const CLASSIC_H = 400;
const PADDLE_W = 10;
const PADDLE_H = 80;
const PADDLE_SPEED = 6;
const CLASSIC_MAX_SPEED = 15;

const serveClassic = (dir) => ({
  x: CLASSIC_W / 2,
  y: CLASSIC_H / 2,
  dx: SERVE_SPEED * 0.9 * dir,
  dy: SERVE_SPEED * 0.45 * (Math.random() < 0.5 ? -1 : 1),
  slow: true
});

const createClassic = (winScore) => ({
  mode: 2,
  winScore,
  scores: [0, 0],
  player1: { x: 20, y: CLASSIC_H / 2 - PADDLE_H / 2 },
  player2: { x: CLASSIC_W - 30, y: CLASSIC_H / 2 - PADDLE_H / 2 },
  ball: serveClassic(Math.random() < 0.5 ? 1 : -1),
  lastTouch: null,
  serveFrames: 0,
  fx: []
});

// Teclado (up/down) ou seguindo o dedo (target = Y no campo)
const moveClassicPaddle = (paddle, input = {}) => {
  if (input.target !== null && input.target !== undefined) {
    const diff = input.target - (paddle.y + PADDLE_H / 2);
    paddle.y += clamp(diff, -PADDLE_SPEED * 1.5, PADDLE_SPEED * 1.5);
  } else {
    if (input.up) paddle.y -= PADDLE_SPEED;
    if (input.down) paddle.y += PADDLE_SPEED;
  }
  paddle.y = clamp(paddle.y, 0, CLASSIC_H - PADDLE_H);
};

const bounceClassic = (ball, paddle, direction) => {
  const currentSpeed = Math.hypot(ball.dx, ball.dy);
  // Primeiro toque após o saque lento volta à velocidade normal; depois, +5% por rebatida
  const newSpeed = ball.slow ? BALL_SPEED : Math.min(CLASSIC_MAX_SPEED, currentSpeed * 1.05);
  ball.slow = false;
  const deltaY = (ball.y - (paddle.y + PADDLE_H / 2)) / (PADDLE_H / 2);
  ball.dy = deltaY * newSpeed * 0.75;
  ball.dx = direction * Math.sqrt(Math.max(newSpeed * newSpeed - ball.dy * ball.dy, (newSpeed * 0.5) ** 2));
};

const stepClassic = (state, inputs) => {
  const { player1, player2, ball } = state;
  const r = BALL_R;

  moveClassicPaddle(player1, inputs[0]);
  moveClassicPaddle(player2, inputs[1]);

  if (state.serveFrames > 0) {
    state.serveFrames -= 1;
    return null;
  }

  const prevX = ball.x;
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.y - r <= 0 || ball.y + r >= CLASSIC_H) {
    ball.dy = -ball.dy;
    ball.y = ball.y - r <= 0 ? r : CLASSIC_H - r;
    state.fx.push('wall');
  }

  // Colisão considerando a trajetória (evita a bola "atravessar" em alta velocidade)
  const p1Face = player1.x + PADDLE_W;
  if (ball.dx < 0 && prevX - r >= p1Face && ball.x - r <= p1Face &&
      ball.y >= player1.y - r && ball.y <= player1.y + PADDLE_H + r) {
    ball.x = p1Face + r;
    bounceClassic(ball, player1, 1);
    state.lastTouch = 0;
    state.fx.push('hit');
  }
  const p2Face = player2.x;
  if (ball.dx > 0 && prevX + r <= p2Face && ball.x + r >= p2Face &&
      ball.y >= player2.y - r && ball.y <= player2.y + PADDLE_H + r) {
    ball.x = p2Face - r;
    bounceClassic(ball, player2, -1);
    state.lastTouch = 1;
    state.fx.push('hit');
  }

  const scorer = ball.x + r < 0 ? 1 : ball.x - r > CLASSIC_W ? 0 : null;
  if (scorer !== null) {
    state.scores[scorer] += 1;
    // Saque vai para quem sofreu o gol
    state.ball = serveClassic(scorer === 0 ? 1 : -1);
    state.lastTouch = null;
    state.serveFrames = SERVE_DELAY_FRAMES;
    state.fx.push('goal');
    return { type: state.scores[scorer] >= state.winScore ? 'over' : 'point', scorer, conceded: 1 - scorer };
  }
  return null;
};

const drawClassic = (ctx, state) => {
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, CLASSIC_W, CLASSIC_H);

  ctx.strokeStyle = 'rgba(0, 255, 204, 0.3)';
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CLASSIC_W / 2, 0);
  ctx.lineTo(CLASSIC_W / 2, CLASSIC_H);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = COLORS[0];
  ctx.fillRect(state.player1.x, state.player1.y, PADDLE_W, PADDLE_H);
  ctx.fillStyle = COLORS[1];
  ctx.fillRect(state.player2.x, state.player2.y, PADDLE_W, PADDLE_H);

  ctx.fillStyle = BALL_COLOR;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
};

// =====================================================================
// Modo hexagonal (3 jogadores)
// =====================================================================
export const HEX_SIZE = 600;
export const HEX_C = HEX_SIZE / 2;
export const HEX_R = 285; // raio circunscrito = comprimento de cada lado
const HEX_PADDLE_LEN = 70;
const HEX_PADDLE_THICK = 8;
const HEX_PADDLE_OFFSET = 16; // face da raquete fica 16px para dentro da linha do gol
const HEX_PADDLE_SPEED = 6 / HEX_R; // em fração do lado por quadro
const HEX_MAX_SPEED = 12;
const HEX_HALF = HEX_PADDLE_LEN / 2 / HEX_R; // limite do centro da raquete (fração do lado)

// Vértices no sentido horário a partir de 60° (y para baixo): o lado 0 fica embaixo.
const VERTS = Array.from({ length: 6 }, (_, k) => {
  const a = ((60 + 60 * k) * Math.PI) / 180;
  return { x: HEX_C + HEX_R * Math.cos(a), y: HEX_C + HEX_R * Math.sin(a) };
});

// Lados pares = gols (jogador k/2); lados ímpares = paredes
const SIDES = VERTS.map((A, k) => {
  const B = VERTS[(k + 1) % 6];
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const nl = Math.hypot(HEX_C - mid.x, HEX_C - mid.y);
  const n = { x: (HEX_C - mid.x) / nl, y: (HEX_C - mid.y) / nl }; // normal apontando para dentro
  return { A, B, L, u, n, mid, goal: k % 2 === 0 ? k / 2 : null };
});
const GOAL_SIDES = [SIDES[0], SIDES[2], SIDES[4]];

const dot = (ax, ay, b) => ax * b.x + ay * b.y;

/** Converte a posição X do dedo (tela do jogador, gol embaixo) na posição da raquete (0..1). */
export const hexTouchToTarget = (x) => clamp((HEX_C + HEX_R / 2 - x) / HEX_R, HEX_HALF, 1 - HEX_HALF);

const serveHex = (state, towardPlayer) => {
  const { n } = GOAL_SIDES[towardPlayer];
  const angle = (Math.random() - 0.5) * 0.5;
  const dx = -n.x * Math.cos(angle) + n.y * Math.sin(angle);
  const dy = -n.y * Math.cos(angle) - n.x * Math.sin(angle);
  state.ball = { x: HEX_C, y: HEX_C, dx: dx * SERVE_SPEED, dy: dy * SERVE_SPEED, slow: true };
  state.lastTouch = null;
};

const createHex = (winScore) => {
  const state = {
    mode: 3,
    winScore,
    scores: [0, 0, 0],
    paddles: [0.5, 0.5, 0.5],
    ball: null,
    lastTouch: null,
    serveFrames: 0,
    fx: []
  };
  serveHex(state, Math.floor(Math.random() * 3));
  return state;
};

// Esquerda/direita na tela de cada jogador (gol embaixo): esquerda aumenta t
const moveHexPaddle = (state, i, input = {}) => {
  let t = state.paddles[i];
  if (input.target !== null && input.target !== undefined) {
    t += clamp(input.target - t, -HEX_PADDLE_SPEED * 1.5, HEX_PADDLE_SPEED * 1.5);
  } else {
    if (input.left) t += HEX_PADDLE_SPEED;
    if (input.right) t -= HEX_PADDLE_SPEED;
  }
  state.paddles[i] = clamp(t, HEX_HALF, 1 - HEX_HALF);
};

const stepHex = (state, inputs) => {
  for (let i = 0; i < 3; i++) moveHexPaddle(state, i, inputs[i]);

  if (state.serveFrames > 0) {
    state.serveFrames -= 1;
    return null;
  }

  const ball = state.ball;
  const r = BALL_R;
  const prev = { x: ball.x, y: ball.y };
  ball.x += ball.dx;
  ball.y += ball.dy;

  // Raquetes: cruzou a face da raquete vindo de dentro do campo?
  for (let i = 0; i < 3; i++) {
    const { A, u, n, L } = GOAL_SIDES[i];
    const vn = dot(ball.dx, ball.dy, n);
    if (vn >= 0) continue;
    const dPrev = dot(prev.x - A.x, prev.y - A.y, n) - HEX_PADDLE_OFFSET;
    const dNow = dot(ball.x - A.x, ball.y - A.y, n) - HEX_PADDLE_OFFSET;
    if (dPrev < r || dNow >= r) continue;
    const f = (dPrev - r) / (dPrev - dNow);
    const hit = { x: prev.x + (ball.x - prev.x) * f, y: prev.y + (ball.y - prev.y) * f };
    const s = dot(hit.x - A.x, hit.y - A.y, u);
    const center = state.paddles[i] * L;
    if (Math.abs(s - center) > HEX_PADDLE_LEN / 2 + r) continue;

    const offset = clamp((s - center) / (HEX_PADDLE_LEN / 2), -1, 1);
    const angle = offset * 0.95; // até ~55° de desvio
    const speed = ball.slow ? BALL_SPEED : Math.min(HEX_MAX_SPEED, Math.hypot(ball.dx, ball.dy) * 1.05);
    ball.slow = false;
    ball.dx = (n.x * Math.cos(angle) + u.x * Math.sin(angle)) * speed;
    ball.dy = (n.y * Math.cos(angle) + u.y * Math.sin(angle)) * speed;
    ball.x = hit.x + n.x * 0.5;
    ball.y = hit.y + n.y * 0.5;
    state.lastTouch = i;
    state.fx.push('hit');
    break;
  }

  // Paredes
  for (let k = 1; k < 6; k += 2) {
    const { A, n } = SIDES[k];
    const d = dot(ball.x - A.x, ball.y - A.y, n);
    const vn = dot(ball.dx, ball.dy, n);
    if (d < r && vn < 0) {
      ball.dx -= 2 * vn * n.x;
      ball.dy -= 2 * vn * n.y;
      ball.x += n.x * (r - d);
      ball.y += n.y * (r - d);
      state.fx.push('wall');
    }
  }

  // Gols: a bola passou inteira pela linha do gol do jogador i
  for (let i = 0; i < 3; i++) {
    const { A, n } = GOAL_SIDES[i];
    if (dot(ball.x - A.x, ball.y - A.y, n) >= -r) continue;

    const scorer = state.lastTouch;
    state.serveFrames = SERVE_DELAY_FRAMES;

    if (scorer === null || scorer === i) {
      // Gol contra ou ninguém tocou: não vale ponto
      state.fx.push('wall');
      serveHex(state, (i + 1) % 3);
      return { type: 'nopoint', scorer: null, conceded: i, reason: scorer === i ? 'own' : 'none' };
    }

    state.scores[scorer] += 1;
    state.fx.push('goal');
    serveHex(state, i);
    return { type: state.scores[scorer] >= state.winScore ? 'over' : 'point', scorer, conceded: i };
  }

  // Segurança numérica: bola fora do campo sem passar por um gol
  if (Math.hypot(ball.x - HEX_C, ball.y - HEX_C) > HEX_R + 40) serveHex(state, Math.floor(Math.random() * 3));
  return null;
};

const toScreen = (p, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x - HEX_C;
  const y = p.y - HEX_C;
  return { x: HEX_C + x * cos - y * sin, y: HEX_C + x * sin + y * cos };
};

const drawHex = (ctx, state, viewIndex = 0, labels = []) => {
  const angle = (-viewIndex * 2 * Math.PI) / 3; // gira para o gol do jogador ficar embaixo

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, HEX_SIZE, HEX_SIZE);

  ctx.save();
  ctx.translate(HEX_C, HEX_C);
  ctx.rotate(angle);
  ctx.translate(-HEX_C, -HEX_C);

  // Campo
  ctx.beginPath();
  VERTS.forEach((v, k) => (k ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Círculo central
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(HEX_C, HEX_C, 50, 0, Math.PI * 2);
  ctx.stroke();

  // Paredes
  ctx.lineCap = 'round';
  SIDES.forEach((side) => {
    if (side.goal !== null) return;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(side.A.x, side.A.y);
    ctx.lineTo(side.B.x, side.B.y);
    ctx.stroke();
  });

  // Linhas de gol (cor de cada jogador)
  GOAL_SIDES.forEach((side, i) => {
    ctx.strokeStyle = COLORS[i];
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(side.A.x, side.A.y);
    ctx.lineTo(side.B.x, side.B.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  // Raquetes
  GOAL_SIDES.forEach(({ A, u, n, L }, i) => {
    const c = state.paddles[i] * L;
    const s0 = c - HEX_PADDLE_LEN / 2;
    const s1 = c + HEX_PADDLE_LEN / 2;
    const d0 = HEX_PADDLE_OFFSET - HEX_PADDLE_THICK;
    const d1 = HEX_PADDLE_OFFSET;
    const pt = (s, d) => ({ x: A.x + u.x * s + n.x * d, y: A.y + u.y * s + n.y * d });
    const corners = [pt(s0, d0), pt(s1, d0), pt(s1, d1), pt(s0, d1)];
    ctx.fillStyle = COLORS[i];
    ctx.beginPath();
    corners.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  });

  // Bola na cor de quem tocou por último
  const ballColor = state.lastTouch !== null ? COLORS[state.lastTouch] : BALL_COLOR;
  ctx.shadowColor = ballColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = ballColor;
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_R + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // Nomes e placar de cada gol (texto sempre na horizontal). O gol de baixo fica centralizado
  // abaixo do campo; os gols de cima vão para os cantos livres do canvas, sem cobrir o jogo.
  ctx.font = 'bold 13px "Fira Code", monospace';
  ctx.textBaseline = 'middle';
  GOAL_SIDES.forEach(({ mid }, i) => {
    const p = toScreen(mid, angle);
    const raw = labels[i] || `Jogador ${i + 1}`;
    const name = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw;
    const text = `${name} · ${state.scores[i]}`;
    let x = HEX_C;
    let y = p.y + 30;
    ctx.textAlign = 'center';
    if (p.y < HEX_C) {
      y = 78; // abaixo do botão de tela cheia
      if (p.x < HEX_C) {
        ctx.textAlign = 'left';
        x = 14;
      } else {
        ctx.textAlign = 'right';
        x = HEX_SIZE - 14;
      }
    }
    ctx.fillStyle = COLORS[i];
    ctx.fillText(text, x, y);
  });
};

// =====================================================================
// API comum
// =====================================================================
export const canvasSize = (mode) => (mode === 3 ? { w: HEX_SIZE, h: HEX_SIZE } : { w: CLASSIC_W, h: CLASSIC_H });
export const createGameState = (mode, winScore = DEFAULT_WIN) => (mode === 3 ? createHex(winScore) : createClassic(winScore));
export const stepGame = (state, inputs) => (state.mode === 3 ? stepHex(state, inputs) : stepClassic(state, inputs));
export const drawGame = (ctx, state, viewIndex, labels) =>
  state.mode === 3 ? drawHex(ctx, state, viewIndex, labels) : drawClassic(ctx, state);

// Estado compacto enviado do anfitrião para os convidados
export const packState = (s) => {
  const base = {
    t: 's',
    x: Math.round(s.ball.x * 10) / 10,
    y: Math.round(s.ball.y * 10) / 10,
    p: s.scores,
    lt: s.lastTouch
  };
  if (s.mode === 3) return { ...base, q: s.paddles.map((v) => Math.round(v * 1000) / 1000) };
  return { ...base, a: Math.round(s.player1.y), b: Math.round(s.player2.y) };
};

export const applyPacked = (s, msg) => {
  s.ball.x = msg.x;
  s.ball.y = msg.y;
  s.lastTouch = msg.lt ?? null;
  if (s.mode === 3 && msg.q) s.paddles = msg.q;
  if (s.mode !== 3) {
    s.player1.y = msg.a;
    s.player2.y = msg.b;
  }
  const changed = msg.p.some((v, i) => v !== s.scores[i]);
  if (changed) s.scores = [...msg.p];
  return changed;
};
