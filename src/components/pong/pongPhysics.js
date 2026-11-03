// Física e desenho do Pong.
//  - 2 jogadores: campo clássico 800x400, raquetes nas laterais.
//  - 3 a 6 jogadores: polígono com N gols iguais alternados com N paredes, todos à mesma
//    distância do centro (3 = hexágono, 4 = octógono, 5 = decágono, 6 = dodecágono).
//    Cada jogador vê o próprio gol embaixo.
// Os modos compartilham o formato de estado: { mode, scores, balls, effects, balloon, fx, pw, ... }
// e stepGame devolve null ou { type: 'point' | 'over' | 'nopoint', scorer, conceded, reason, penalty }.
//
// Colisões usam círculo x retângulo em subpassos: pega a raquete inteira (inclusive as quinas)
// e evita que a bola atravesse algo mesmo em alta velocidade.

export const COLORS = ['#00ffcc', '#ff6b9d', '#b388ff', '#ffa94d', '#4dabf7', '#a9e34b'];
export const COLOR_NAMES = ['ciano', 'rosa', 'roxo', 'laranja', 'azul', 'verde'];
export const BALL_COLOR = '#ffd700';
export const WIN_OPTIONS = [3, 5, 10];
export const DEFAULT_WIN = 5;
export const PLAYER_OPTIONS = [2, 3, 4, 5, 6];
export const FIELD_NAMES = { 2: 'clássico', 3: 'hexágono', 4: 'octógono', 5: 'decágono', 6: 'dodecágono' };
export const SERVE_DELAY_FRAMES = 60; // 1 s de pausa após cada gol (loop a 60 FPS)

const FPS = 60;
const BALL_R = 4;
const BALL_SPEED = 5;
const SERVE_SPEED = 3; // saque mais lento que o normal até o primeiro toque numa raquete
const MAX_FRAME_DISTANCE = 32; // limite de deslocamento por quadro (mesmo com a bola rápida)
const SUBSTEP = 3; // tamanho máximo de cada subpasso de colisão (px)

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const filled = (n, make) => Array.from({ length: n }, make);

// =====================================================================
// Balões de poder
// =====================================================================
// owner: o poder vale para quem tocou por último na bola (ou para os adversários dele)
export const POWERS = {
  big: { icon: '🔵', label: 'Bola gigante!', color: '#ff9f43', frames: 10 * FPS },
  fast: { icon: '⚡', label: 'Bola mais rápida!', color: '#ff4757', frames: 8 * FPS },
  slow: { icon: '🐢', label: 'Bola mais lenta!', color: '#54a0ff', frames: 15 * FPS },
  multi: { icon: '⚽', label: 'Mais uma bola em jogo!', color: '#2ed573', frames: 0 },
  curve: { icon: '🌀', label: 'Bola com efeito!', color: '#a29bfe', frames: 8 * FPS },
  ghost: { icon: '👻', label: 'Bola fantasma!', color: '#dfe6e9', frames: 6 * FPS },
  zigzag: { icon: '🌪️', label: 'Desvio maluco!', color: '#55efc4', frames: 0 },
  gravity: { icon: '🕳️', label: 'Buraco negro no meio da quadra!', color: '#6c5ce7', frames: 8 * FPS },
  teleport: { icon: '✨', label: 'Teleporte!', color: '#fdcb6e', frames: 0 },
  grow: { icon: '📏', label: 'Raquete gigante', color: '#00d2d3', frames: 12 * FPS, owner: true },
  invert: { icon: '🔄', label: 'Controles invertidos', color: '#fd79a8', frames: 7 * FPS, owner: true },
  shield: { icon: '🛡️', label: 'Escudo no gol', color: '#feca57', frames: 0, owner: true },
  freeze: { icon: '❄️', label: 'Raquetes congeladas', color: '#74b9ff', frames: Math.round(2.5 * FPS), owner: true },
  shrink: { icon: '🤏', label: 'Raquetes encolhidas', color: '#e17055', frames: 10 * FPS, owner: true }
};
export const POWER_TYPES = Object.keys(POWERS);

const BALLOON_R = 18;
const BALLOON_LIFE = 12 * FPS;
const HITS_PER_BALLOON = 2;
const BIG_BASE = 5; // primeira bola gigante: 5x; cada balão igual dobra de novo
const MAX_BIG_STACKS = 3; // 5x, 10x, 20x
const MAX_SPEED_LEVEL = 3; // rápida: 2x, 4x, 8x / lenta: ½, ¼, ⅛
const MAX_GROW_STACKS = 2;
const MAX_BALLS = 3;
const CURVE_RATE = 0.016; // rad por quadro, por nível de efeito
const GRAVITY_PULL = 0.22; // aceleração em direção ao centro (a velocidade é mantida)
const SHRINK_FACTOR = 0.55;

const newEffects = (n) => ({
  big: { stacks: 0, frames: 0 },
  speed: { level: 0, frames: 0 },
  curve: { stacks: 0, frames: 0, dir: 1 },
  ghost: 0,
  gravity: 0,
  grow: filled(n, () => ({ stacks: 0, frames: 0 })),
  invert: filled(n, () => 0),
  freeze: filled(n, () => 0),
  shrink: filled(n, () => 0),
  shield: filled(n, () => false)
});

const ballRadius = (s) => (s.effects.big.stacks > 0 ? BALL_R * BIG_BASE * 2 ** (s.effects.big.stacks - 1) : BALL_R);
const speedMul = (s) => 2 ** s.effects.speed.level;

// Fator de tamanho da raquete do jogador i (raquete gigante e encolhida)
const paddleScale = (s, i, growPerStack) =>
  (1 + growPerStack * s.effects.grow[i].stacks) * (s.effects.shrink[i] > 0 ? SHRINK_FACTOR : 1);

const balloonY = (s, b) => (b.fixed ? b.y : b.y + Math.sin(s.tick / 18 + b.x) * 7);

const tickPowers = (s) => {
  s.tick += 1;
  const e = s.effects;
  const countdown = (obj, resetKey) => {
    if (obj.frames > 0) {
      obj.frames -= 1;
      if (obj.frames === 0) obj[resetKey] = 0;
    }
  };
  countdown(e.big, 'stacks');
  countdown(e.speed, 'level');
  countdown(e.curve, 'stacks');
  e.grow.forEach((g) => countdown(g, 'stacks'));
  if (e.ghost > 0) e.ghost -= 1;
  if (e.gravity > 0) e.gravity -= 1;
  const dec = (v) => (v > 0 ? v - 1 : 0);
  e.invert = e.invert.map(dec);
  e.freeze = e.freeze.map(dec);
  e.shrink = e.shrink.map(dec);
  if (s.balloon) {
    s.balloon.age += 1;
    if (s.balloon.age > BALLOON_LIFE) s.balloon = null;
  }
};

// Gol: tudo volta ao normal
const resetPowers = (s) => {
  s.effects = newEffects(s.scores.length);
  s.balloon = null;
};

const onPaddleHit = (s, spawnBalloon) => {
  s.hits += 1;
  if (s.powersEnabled && s.hits % HITS_PER_BALLOON === 0 && !s.balloon) {
    const pos = spawnBalloon();
    s.balloon = { ...pos, type: POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)], age: 0 };
  }
};

const fieldCenter = (s) => (s.mode === 2 ? { x: CLASSIC_W / 2, y: CLASSIC_H / 2 } : { x: POLY_C, y: POLY_C });

// Redireciona a bola para um ângulo aleatório, mantendo a velocidade
const randomizeDirection = (s, ball) => {
  const speed = Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy));
  let a = Math.random() * Math.PI * 2;
  // No clássico, evita direções quase verticais (a bola ficaria "presa" quicando)
  if (s.mode === 2) a = (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.6;
  ball.dx = Math.cos(a) * speed;
  ball.dy = Math.sin(a) * speed;
  ball.slow = false;
};

const activatePower = (s, requested, ball) => {
  let type = requested;
  const owner = ball.lt;
  // Poderes de jogador precisam de alguém que tenha tocado na bola
  if (POWERS[type].owner && (owner === null || owner === undefined)) type = 'zigzag';
  const e = s.effects;
  const { frames } = POWERS[type];
  const others = (arr, value) => arr.map((v, i) => (i === owner ? v : value));

  if (type === 'big') {
    e.big.stacks = Math.min(MAX_BIG_STACKS, e.big.stacks + 1);
    e.big.frames = frames;
  }
  if (type === 'fast' || type === 'slow') {
    // Rápida e lenta se acumulam e se anulam: cada balão sobe ou desce um nível (2x por nível)
    e.speed.level = clamp(e.speed.level + (type === 'fast' ? 1 : -1), -MAX_SPEED_LEVEL, MAX_SPEED_LEVEL);
    e.speed.frames = e.speed.level === 0 ? 0 : frames;
  }
  if (type === 'multi' && s.balls.length < MAX_BALLS) {
    const a = (Math.random() < 0.5 ? -1 : 1) * 0.7;
    const speed = Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy));
    const dir = Math.atan2(ball.dy, ball.dx) + a;
    s.balls.push({ x: ball.x, y: ball.y, dx: Math.cos(dir) * speed, dy: Math.sin(dir) * speed, slow: false, lt: ball.lt });
  }
  if (type === 'curve') {
    if (e.curve.stacks === 0) e.curve.dir = Math.random() < 0.5 ? -1 : 1;
    e.curve.stacks = Math.min(3, e.curve.stacks + 1);
    e.curve.frames = frames;
  }
  if (type === 'ghost') e.ghost = frames;
  if (type === 'gravity') e.gravity = frames;
  if (type === 'zigzag') s.balls.forEach((b) => randomizeDirection(s, b));
  if (type === 'teleport') {
    const c = fieldCenter(s);
    const spread = s.mode === 2 ? { x: 220, y: 120 } : { x: 110, y: 110 };
    s.balls.forEach((b) => {
      b.x = c.x + (Math.random() - 0.5) * 2 * spread.x;
      b.y = c.y + (Math.random() - 0.5) * 2 * spread.y;
    });
  }
  if (type === 'grow') {
    e.grow[owner].stacks = Math.min(MAX_GROW_STACKS, e.grow[owner].stacks + 1);
    e.grow[owner].frames = frames;
  }
  if (type === 'invert') e.invert = others(e.invert, frames);
  if (type === 'freeze') e.freeze = others(e.freeze, frames);
  if (type === 'shrink') e.shrink = others(e.shrink, frames);
  if (type === 'shield') e.shield[owner] = true;

  s.fx.push('power');
  s.pw.push({ t: type, o: owner ?? null });
};

const checkBalloon = (s, ball, r) => {
  const b = s.balloon;
  if (!b) return;
  if (Math.hypot(ball.x - b.x, ball.y - balloonY(s, b)) < r + BALLOON_R) {
    s.balloon = null;
    activatePower(s, b.type, ball);
  }
};

// No clássico, não deixa a bola ficar vertical demais
const keepHorizontalEnough = (s, b) => {
  if (s.mode !== 2) return;
  const sp = Math.hypot(b.dx, b.dy);
  if (Math.abs(b.dx) < sp * 0.35) b.dx = Math.sign(b.dx || 1) * sp * 0.35;
};

// Efeito (curva) e buraco negro mudam a direção da bola, mantendo a velocidade
const applyBending = (s) => {
  const { stacks, dir } = s.effects.curve;
  const gravity = s.effects.gravity > 0;
  if (!stacks && !gravity) return;
  const c = fieldCenter(s);
  s.balls.forEach((b) => {
    if (b.slow) return;
    const sp = Math.hypot(b.dx, b.dy);
    if (stacks) {
      const a = CURVE_RATE * stacks * dir;
      const dx = b.dx * Math.cos(a) - b.dy * Math.sin(a);
      b.dy = b.dx * Math.sin(a) + b.dy * Math.cos(a);
      b.dx = dx;
    }
    if (gravity) {
      const gx = c.x - b.x;
      const gy = c.y - b.y;
      const gl = Math.hypot(gx, gy) || 1;
      b.dx += (gx / gl) * GRAVITY_PULL;
      b.dy += (gy / gl) * GRAVITY_PULL;
      const nl = Math.hypot(b.dx, b.dy);
      b.dx *= sp / nl;
      b.dy *= sp / nl;
    }
    keepHorizontalEnough(s, b);
  });
};

// Deslocamento de um subpasso, considerando os poderes de velocidade
const stepVector = (ball, mul, steps) => {
  let vx = ball.dx * mul;
  let vy = ball.dy * mul;
  const sp = Math.hypot(vx, vy);
  if (sp > MAX_FRAME_DISTANCE) {
    vx *= MAX_FRAME_DISTANCE / sp;
    vy *= MAX_FRAME_DISTANCE / sp;
  }
  return { x: vx / steps, y: vy / steps };
};

const substepsFor = (ball, mul) => Math.max(1, Math.ceil(Math.min(MAX_FRAME_DISTANCE, Math.hypot(ball.dx, ball.dy) * mul) / SUBSTEP));

// Controles invertidos (troca direções e espelha o dedo) e congelados (não se move)
const flipInput = (input = {}, mode) => ({
  ...input,
  up: !!input.down,
  down: !!input.up,
  left: !!input.right,
  right: !!input.left,
  target: input.target === null || input.target === undefined ? null : mode === 2 ? CLASSIC_H - input.target : 1 - input.target
});

const effectiveInputs = (s, inputs) => inputs.map((input, i) => {
  if (s.effects.freeze[i] > 0) return { frozen: true };
  return s.effects.invert[i] > 0 ? flipInput(input, s.mode) : input;
});

const balloonIcon = (ctx, x, y, type) => {
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(POWERS[type].icon, x, y + 1);
};

const balloonBody = (ctx, x, y, type, age) => {
  const { color } = POWERS[type];
  const fading = age > BALLOON_LIFE - 2 * FPS && Math.floor(age / 8) % 2 === 0; // pisca antes de sumir
  ctx.globalAlpha = fading ? 0.45 : 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + BALLOON_R + 4);
  ctx.quadraticCurveTo(x - 6, y + BALLOON_R + 14, x, y + BALLOON_R + 24);
  ctx.stroke();
  const grad = ctx.createRadialGradient(x - 6, y - 7, 2, x, y, BALLOON_R * 1.15);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, color);
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, BALLOON_R * 0.9, BALLOON_R * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + BALLOON_R + 5);
  ctx.lineTo(x + 4, y + BALLOON_R + 5);
  ctx.lineTo(x, y + BALLOON_R);
  ctx.fill();
  ctx.globalAlpha = 1;
};

const drawBall = (ctx, s, ball) => {
  const color = ball.lt !== null && ball.lt !== undefined ? COLORS[ball.lt] : BALL_COLOR;
  const r = ballRadius(s) + (s.mode >= 3 ? 1 : 0);
  // Fantasma: quase invisível, pisca de vez em quando
  if (s.effects.ghost > 0) ctx.globalAlpha = s.tick % 45 < 7 ? 0.9 : 0.08;
  const fast = s.effects.speed.level > 0;
  ctx.shadowColor = fast ? '#ff4757' : color;
  ctx.shadowBlur = fast ? 20 : 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
};

const drawGravityWell = (ctx, s, x, y) => {
  if (!s.effects.gravity) return;
  const pulse = 1 + Math.sin(s.tick / 6) * 0.15;
  const grad = ctx.createRadialGradient(x, y, 2, x, y, 46 * pulse);
  grad.addColorStop(0, 'rgba(0,0,0,0.95)');
  grad.addColorStop(0.45, 'rgba(108,92,231,0.55)');
  grad.addColorStop(1, 'rgba(108,92,231,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 46 * pulse, 0, Math.PI * 2);
  ctx.fill();
};

const drawShieldLine = (ctx, x0, y0, x1, y1, color) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = '#feca57';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  ctx.setLineDash([14, 6]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
};

// Raquete congelada ganha um contorno gelado
const frostOutline = (ctx, s, i, draw) => {
  if (!(s.effects.freeze[i] > 0)) return;
  ctx.save();
  ctx.strokeStyle = '#dff6ff';
  ctx.shadowColor = '#74b9ff';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  draw();
  ctx.restore();
};

// =====================================================================
// Modo clássico (2 jogadores)
// =====================================================================
export const CLASSIC_W = 800;
export const CLASSIC_H = 400;
const PADDLE_W = 10;
const PADDLE_H = 80;
const PADDLE_SPEED = 6;
const CLASSIC_MAX_SPEED = 15;

const classicPaddleH = (s, i) => PADDLE_H * paddleScale(s, i, 0.6);

const serveClassic = (dir) => ({
  x: CLASSIC_W / 2,
  y: CLASSIC_H / 2,
  dx: SERVE_SPEED * 0.9 * dir,
  dy: SERVE_SPEED * 0.45 * (Math.random() < 0.5 ? -1 : 1),
  slow: true,
  lt: null
});

const createClassic = (winScore, powersEnabled) => ({
  mode: 2,
  winScore,
  powersEnabled,
  scores: [0, 0],
  player1: { x: 20, y: CLASSIC_H / 2 - PADDLE_H / 2, h: PADDLE_H },
  player2: { x: CLASSIC_W - 30, y: CLASSIC_H / 2 - PADDLE_H / 2, h: PADDLE_H },
  balls: [serveClassic(Math.random() < 0.5 ? 1 : -1)],
  effects: newEffects(2),
  balloon: null,
  hits: 0,
  tick: 0,
  serveFrames: 0,
  fx: [],
  pw: []
});

// Teclado (up/down) ou seguindo o dedo/bot (target = Y no campo)
const moveClassicPaddle = (s, i, input = {}) => {
  const paddle = i === 0 ? s.player1 : s.player2;
  // Tamanho mudou (raquete gigante/encolhida): mantém o centro no lugar
  const h = classicPaddleH(s, i);
  if (paddle.h !== h) {
    paddle.y += ((paddle.h || h) - h) / 2;
    paddle.h = h;
  }
  if (!input.frozen) {
    if (input.target !== null && input.target !== undefined) {
      const max = PADDLE_SPEED * (input.bot ? input.botSpeed || 0.8 : 1.5);
      paddle.y += clamp(input.target - (paddle.y + h / 2), -max, max);
    } else {
      if (input.up) paddle.y -= PADDLE_SPEED;
      if (input.down) paddle.y += PADDLE_SPEED;
    }
  }
  paddle.y = clamp(paddle.y, 0, CLASSIC_H - h);
};

const bounceClassic = (ball, paddle, h, direction) => {
  const currentSpeed = Math.hypot(ball.dx, ball.dy);
  // Primeiro toque após o saque lento volta à velocidade normal; depois, +5% por rebatida
  const newSpeed = ball.slow ? BALL_SPEED : Math.min(CLASSIC_MAX_SPEED, currentSpeed * 1.05);
  ball.slow = false;
  const deltaY = clamp((ball.y - (paddle.y + h / 2)) / (h / 2), -1, 1);
  ball.dy = deltaY * newSpeed * 0.75;
  ball.dx = direction * Math.sqrt(Math.max(newSpeed * newSpeed - ball.dy * ball.dy, (newSpeed * 0.5) ** 2));
};

const circleHitsRect = (cx, cy, r, x, y, w, h) => {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
};

const spawnClassicBalloon = () => ({
  x: CLASSIC_W / 2 + (Math.random() - 0.5) * 260,
  y: 70 + Math.random() * (CLASSIC_H - 140)
});

const moveClassicBall = (s, ball, r, mul) => {
  const steps = substepsFor(ball, mul);
  const paddles = [[s.player1, 1, 0], [s.player2, -1, 1]];

  for (let i = 0; i < steps; i++) {
    const v = stepVector(ball, mul, steps);
    ball.x += v.x;
    ball.y += v.y;

    if (ball.y - r <= 0 && ball.dy < 0) {
      ball.y = r;
      ball.dy = -ball.dy;
      s.fx.push('wall');
    } else if (ball.y + r >= CLASSIC_H && ball.dy > 0) {
      ball.y = CLASSIC_H - r;
      ball.dy = -ball.dy;
      s.fx.push('wall');
    }

    for (const [paddle, dir, idx] of paddles) {
      const h = classicPaddleH(s, idx);
      const towardGoal = ball.dx * dir < 0;
      // Centro da bola não passou (com folga de um raio) da parte de trás da raquete:
      // raspões na quina de trás também rebatem, para não parecer que a raquete está furada
      const notBehind = dir > 0 ? ball.x > paddle.x - r : ball.x < paddle.x + PADDLE_W + r;
      if (towardGoal && notBehind && circleHitsRect(ball.x, ball.y, r, paddle.x, paddle.y, PADDLE_W, h)) {
        ball.x = dir > 0 ? paddle.x + PADDLE_W + r : paddle.x - r;
        bounceClassic(ball, paddle, h, dir);
        ball.lt = idx;
        s.fx.push('hit');
        onPaddleHit(s, spawnClassicBalloon);
        break;
      }
    }

    checkBalloon(s, ball, r);

    // Escudo: defende uma bola na linha do gol
    if (ball.x - r <= 0 && ball.dx < 0 && s.effects.shield[0]) {
      s.effects.shield[0] = false;
      ball.x = r;
      ball.dx = -ball.dx;
      s.fx.push('wall');
    } else if (ball.x + r >= CLASSIC_W && ball.dx > 0 && s.effects.shield[1]) {
      s.effects.shield[1] = false;
      ball.x = CLASSIC_W - r;
      ball.dx = -ball.dx;
      s.fx.push('wall');
    }

    if (ball.x + r < 0 || ball.x - r > CLASSIC_W) {
      const scorer = ball.x < CLASSIC_W / 2 ? 1 : 0;
      s.scores[scorer] += 1;
      resetPowers(s);
      // Saque vai para quem sofreu o gol
      s.balls = [serveClassic(scorer === 0 ? 1 : -1)];
      s.serveFrames = SERVE_DELAY_FRAMES;
      s.fx.push('goal');
      return { type: s.scores[scorer] >= s.winScore ? 'over' : 'point', scorer, conceded: 1 - scorer };
    }
  }
  return null;
};

const stepClassic = (s, rawInputs) => {
  const inputs = effectiveInputs(s, rawInputs);
  moveClassicPaddle(s, 0, inputs[0]);
  moveClassicPaddle(s, 1, inputs[1]);
  tickPowers(s);

  if (s.serveFrames > 0) {
    s.serveFrames -= 1;
    return null;
  }

  applyBending(s);
  const r = ballRadius(s);
  const mul = speedMul(s);
  for (const ball of [...s.balls]) {
    const event = moveClassicBall(s, ball, r, mul);
    if (event) return event;
  }
  return null;
};

const drawClassic = (ctx, s) => {
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

  drawGravityWell(ctx, s, CLASSIC_W / 2, CLASSIC_H / 2);

  if (s.effects.shield[0]) drawShieldLine(ctx, 3, 0, 3, CLASSIC_H, COLORS[0]);
  if (s.effects.shield[1]) drawShieldLine(ctx, CLASSIC_W - 3, 0, CLASSIC_W - 3, CLASSIC_H, COLORS[1]);

  [s.player1, s.player2].forEach((p, i) => {
    const h = classicPaddleH(s, i);
    ctx.fillStyle = COLORS[i];
    ctx.fillRect(p.x, p.y, PADDLE_W, h);
    frostOutline(ctx, s, i, () => ctx.strokeRect(p.x - 2, p.y - 2, PADDLE_W + 4, h + 4));
  });

  if (s.balloon) {
    const by = balloonY(s, s.balloon);
    balloonBody(ctx, s.balloon.x, by, s.balloon.type, s.balloon.age || 0);
    balloonIcon(ctx, s.balloon.x, by, s.balloon.type);
  }

  s.balls.forEach((ball) => drawBall(ctx, s, ball));
};

// =====================================================================
// Modo polígono (3 a 6 jogadores)
// =====================================================================
export const POLY_SIZE = 600;
export const POLY_C = POLY_SIZE / 2;
const POLY_PADDLE_THICK = 8;
const POLY_PADDLE_OFFSET = 16; // face da raquete fica 16px para dentro da linha do gol
const POLY_MAX_SPEED = 12;

const makeSide = (A, B) => {
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  const nl = Math.hypot(POLY_C - mid.x, POLY_C - mid.y);
  const n = { x: (POLY_C - mid.x) / nl, y: (POLY_C - mid.y) / nl }; // normal apontando para dentro
  return { A, B, L, u, n, mid };
};

// Geometria do campo para n jogadores: gols centrados em ângulos iguais (o do jogador 0 embaixo),
// paredes ligando um gol ao próximo. Todos os vértices ficam no mesmo círculo (campo convexo).
const geometryCache = {};
const polyGeometry = (n) => {
  if (geometryCache[n]) return geometryCache[n];
  const R = n === 3 ? 285 : 235; // a partir de 4 jogadores sobra margem para os nomes nas laterais
  const step = (2 * Math.PI) / n;
  const goalAngle = n === 3 ? step / 2 : step * 0.62; // a partir de 4 jogadores os gols ficam maiores que as paredes
  const at = (a) => ({ x: POLY_C + R * Math.cos(a), y: POLY_C + R * Math.sin(a) });
  const goals = [];
  const walls = [];
  const verts = [];
  for (let i = 0; i < n; i++) {
    const theta = Math.PI / 2 + i * step;
    const A = at(theta - goalAngle / 2);
    const B = at(theta + goalAngle / 2);
    goals.push(makeSide(A, B));
    walls.push(makeSide(B, at(theta + step - goalAngle / 2)));
    verts.push(A, B);
  }
  const L = goals[0].L;
  const paddleLen = n === 3 ? 70 : clamp(L * 0.3, 46, 70);
  const geom = {
    n,
    R,
    step,
    goals,
    walls,
    verts,
    paddleLen,
    paddleSpeed: 6 / L, // em fração do lado por quadro
    halfSpan: R * Math.sin(goalAngle / 2), // metade da largura do gol de baixo na tela
    spawnR: R * 0.38
  };
  geometryCache[n] = geom;
  return geom;
};

const polyPaddleLen = (s, g, i) => g.paddleLen * paddleScale(s, i, 0.5);

/** Converte a posição X do dedo (tela do jogador, gol embaixo) na posição da raquete (0..1). */
export const polyTouchToTarget = (x, n) => {
  const { halfSpan } = polyGeometry(n);
  return clamp((POLY_C + halfSpan - x) / (2 * halfSpan), 0, 1);
};

const servePolyBall = (g, towardPlayer) => {
  const { n } = g.goals[towardPlayer];
  const angle = (Math.random() - 0.5) * 0.5;
  const dx = -n.x * Math.cos(angle) + n.y * Math.sin(angle);
  const dy = -n.y * Math.cos(angle) - n.x * Math.sin(angle);
  return { x: POLY_C, y: POLY_C, dx: dx * SERVE_SPEED, dy: dy * SERVE_SPEED, slow: true, lt: null };
};

const createPoly = (n, winScore, powersEnabled) => ({
  mode: n,
  winScore,
  powersEnabled,
  scores: filled(n, () => 0),
  paddles: filled(n, () => 0.5),
  balls: [servePolyBall(polyGeometry(n), Math.floor(Math.random() * n))],
  effects: newEffects(n),
  balloon: null,
  hits: 0,
  tick: 0,
  serveFrames: 0,
  fx: [],
  pw: []
});

// Esquerda/direita na tela de cada jogador (gol embaixo): esquerda aumenta t
const movePolyPaddle = (s, g, i, input = {}) => {
  const half = polyPaddleLen(s, g, i) / 2 / g.goals[i].L;
  let t = s.paddles[i];
  if (!input.frozen) {
    if (input.target !== null && input.target !== undefined) {
      const max = g.paddleSpeed * (input.bot ? input.botSpeed || 0.8 : 1.5);
      t += clamp(input.target - t, -max, max);
    } else {
      if (input.left) t += g.paddleSpeed;
      if (input.right) t -= g.paddleSpeed;
    }
  }
  s.paddles[i] = clamp(t, half, 1 - half);
};

const reflectOn = (ball, n, d, r) => {
  const vn = dot(ball.dx, ball.dy, n);
  ball.dx -= 2 * vn * n.x;
  ball.dy -= 2 * vn * n.y;
  ball.x += n.x * (r - d);
  ball.y += n.y * (r - d);
};

const dot = (ax, ay, b) => ax * b.x + ay * b.y;

const movePolyBall = (s, g, ball, r, mul) => {
  const steps = substepsFor(ball, mul);
  const spawn = () => {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * g.spawnR;
    return { x: POLY_C + Math.cos(a) * d, y: POLY_C + Math.sin(a) * d };
  };

  for (let step = 0; step < steps; step++) {
    const v = stepVector(ball, mul, steps);
    ball.x += v.x;
    ball.y += v.y;

    // Raquetes (retângulo no sistema do gol: s ao longo do lado, d para dentro do campo)
    for (let i = 0; i < g.n; i++) {
      const { A, u, n, L } = g.goals[i];
      const len = polyPaddleLen(s, g, i);
      const rx = ball.x - A.x;
      const ry = ball.y - A.y;
      const s0 = rx * u.x + ry * u.y;
      const d0 = rx * n.x + ry * n.y;
      const c = s.paddles[i] * L;
      const cs = clamp(s0, c - len / 2, c + len / 2);
      const cd = clamp(d0, POLY_PADDLE_OFFSET - POLY_PADDLE_THICK, POLY_PADDLE_OFFSET);
      const vn = dot(ball.dx, ball.dy, n);
      const notBehind = d0 > POLY_PADDLE_OFFSET - POLY_PADDLE_THICK - r; // folga de um raio (quinas de trás)
      if (vn >= 0 || !notBehind || Math.hypot(s0 - cs, d0 - cd) >= r) continue;

      const offset = clamp((s0 - c) / (len / 2), -1, 1);
      const angle = offset * 0.95; // até ~55° de desvio
      const speed = ball.slow ? BALL_SPEED : Math.min(POLY_MAX_SPEED, Math.hypot(ball.dx, ball.dy) * 1.05);
      ball.slow = false;
      ball.dx = (n.x * Math.cos(angle) + u.x * Math.sin(angle)) * speed;
      ball.dy = (n.y * Math.cos(angle) + u.y * Math.sin(angle)) * speed;
      ball.x = A.x + u.x * s0 + n.x * (POLY_PADDLE_OFFSET + r);
      ball.y = A.y + u.y * s0 + n.y * (POLY_PADDLE_OFFSET + r);
      ball.lt = i;
      s.fx.push('hit');
      onPaddleHit(s, spawn);
      break;
    }

    // Paredes
    for (const { A, n } of g.walls) {
      const d = dot(ball.x - A.x, ball.y - A.y, n);
      if (d < r && dot(ball.dx, ball.dy, n) < 0) {
        reflectOn(ball, n, d, r);
        s.fx.push('wall');
      }
    }

    checkBalloon(s, ball, r);

    for (let i = 0; i < g.n; i++) {
      const { A, n } = g.goals[i];
      const d = dot(ball.x - A.x, ball.y - A.y, n);

      // Escudo: defende uma bola na linha do gol
      if (s.effects.shield[i] && d < r && dot(ball.dx, ball.dy, n) < 0) {
        s.effects.shield[i] = false;
        reflectOn(ball, n, d, r);
        s.fx.push('wall');
        continue;
      }

      // Gol: a bola passou inteira pela linha do gol do jogador i
      if (d >= -r) continue;

      const scorer = ball.lt;
      s.serveFrames = SERVE_DELAY_FRAMES;
      resetPowers(s);

      if (scorer === null || scorer === undefined) {
        // Ninguém tocou: não muda nada
        s.fx.push('wall');
        s.balls = [servePolyBall(g, (i + 1) % g.n)];
        return { type: 'nopoint', scorer: null, conceded: i, reason: 'none' };
      }

      if (scorer === i) {
        // Gol contra: perde 1 ponto (sem ficar negativo)
        const penalty = s.scores[i] > 0;
        if (penalty) s.scores[i] -= 1;
        s.fx.push('wall');
        s.balls = [servePolyBall(g, (i + 1) % g.n)];
        return { type: 'nopoint', scorer: null, conceded: i, reason: 'own', penalty };
      }

      s.scores[scorer] += 1;
      s.fx.push('goal');
      s.balls = [servePolyBall(g, i)];
      return { type: s.scores[scorer] >= s.winScore ? 'over' : 'point', scorer, conceded: i };
    }
  }

  // Segurança numérica: bola fora do campo sem passar por um gol
  if (Math.hypot(ball.x - POLY_C, ball.y - POLY_C) > g.R + 60 + r) {
    s.balls = s.balls.filter((b) => b !== ball);
    if (!s.balls.length) s.balls = [servePolyBall(g, Math.floor(Math.random() * g.n))];
  }
  return null;
};

const stepPoly = (s, rawInputs) => {
  const g = polyGeometry(s.mode);
  const inputs = effectiveInputs(s, rawInputs);
  for (let i = 0; i < g.n; i++) movePolyPaddle(s, g, i, inputs[i]);
  tickPowers(s);

  if (s.serveFrames > 0) {
    s.serveFrames -= 1;
    return null;
  }

  applyBending(s);
  const r = ballRadius(s);
  const mul = speedMul(s);
  for (const ball of [...s.balls]) {
    const event = movePolyBall(s, g, ball, r, mul);
    if (event) return event;
  }
  return null;
};

const toScreen = (p, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x - POLY_C;
  const y = p.y - POLY_C;
  return { x: POLY_C + x * cos - y * sin, y: POLY_C + x * sin + y * cos };
};

const drawPoly = (ctx, s, viewIndex = 0, labels = []) => {
  const g = polyGeometry(s.mode);
  const angle = -viewIndex * g.step; // gira para o gol do jogador ficar embaixo

  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, POLY_SIZE, POLY_SIZE);

  ctx.save();
  ctx.translate(POLY_C, POLY_C);
  ctx.rotate(angle);
  ctx.translate(-POLY_C, -POLY_C);

  // Campo
  ctx.beginPath();
  g.verts.forEach((v, k) => (k ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
  ctx.closePath();
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  // Círculo central
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(POLY_C, POLY_C, 50, 0, Math.PI * 2);
  ctx.stroke();

  drawGravityWell(ctx, s, POLY_C, POLY_C);

  // Paredes
  ctx.lineCap = 'round';
  g.walls.forEach((side) => {
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(side.A.x, side.A.y);
    ctx.lineTo(side.B.x, side.B.y);
    ctx.stroke();
  });

  // Linhas de gol (cor de cada jogador) e escudos
  g.goals.forEach((side, i) => {
    if (s.effects.shield[i]) {
      drawShieldLine(ctx, side.A.x, side.A.y, side.B.x, side.B.y, COLORS[i]);
      return;
    }
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
  g.goals.forEach(({ A, u, n, L }, i) => {
    const len = polyPaddleLen(s, g, i);
    const c = s.paddles[i] * L;
    const s0 = c - len / 2;
    const s1 = c + len / 2;
    const d0 = POLY_PADDLE_OFFSET - POLY_PADDLE_THICK;
    const d1 = POLY_PADDLE_OFFSET;
    const pt = (sv, d) => ({ x: A.x + u.x * sv + n.x * d, y: A.y + u.y * sv + n.y * d });
    const corners = [pt(s0, d0), pt(s1, d0), pt(s1, d1), pt(s0, d1)];
    const path = () => {
      ctx.beginPath();
      corners.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    ctx.fillStyle = COLORS[i];
    path();
    ctx.fill();
    frostOutline(ctx, s, i, () => {
      path();
      ctx.stroke();
    });
  });

  // Balão (o corpo gira com o campo; o ícone é desenhado depois, sempre de pé)
  let balloonScreen = null;
  if (s.balloon) {
    const by = balloonY(s, s.balloon);
    balloonScreen = toScreen({ x: s.balloon.x, y: by }, angle);
  }

  // Bolas na cor de quem tocou por último
  s.balls.forEach((ball) => drawBall(ctx, s, ball));

  ctx.restore();

  if (balloonScreen) {
    balloonBody(ctx, balloonScreen.x, balloonScreen.y, s.balloon.type, s.balloon.age || 0);
    balloonIcon(ctx, balloonScreen.x, balloonScreen.y, s.balloon.type);
  }

  // Nomes e placar de cada gol (texto sempre na horizontal)
  ctx.textBaseline = 'middle';
  g.goals.forEach(({ mid, n }, i) => {
    const p = toScreen(mid, angle);
    const raw = labels[i] || `Jogador ${i + 1}`;
    const max = g.n <= 4 ? 12 : 9;
    const name = raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
    const text = `${name} · ${s.scores[i]}`;
    ctx.fillStyle = COLORS[i];

    if (g.n === 3) {
      // Hexágono: gol de baixo centralizado; os de cima nos cantos livres do canvas
      ctx.font = 'bold 13px "Fira Code", monospace';
      let x = POLY_C;
      let y = p.y + 30;
      ctx.textAlign = 'center';
      if (p.y < POLY_C) {
        y = 78; // abaixo do botão de tela cheia
        ctx.textAlign = p.x < POLY_C ? 'left' : 'right';
        x = p.x < POLY_C ? 14 : POLY_SIZE - 14;
      }
      ctx.fillText(text, x, y);
      return;
    }

    // Demais campos: nome e placar em duas linhas do lado de fora do gol, alinhados para fora
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const out = { x: -(n.x * cos - n.y * sin), y: -(n.x * sin + n.y * cos) }; // direção para fora, na tela
    const sideways = Math.abs(out.x) > 0.45;
    const base = toScreen(mid, angle);
    const dist = sideways ? 12 : 22;
    let x = base.x + out.x * dist;
    let y = base.y + out.y * dist;
    ctx.font = 'bold 12px "Fira Code", monospace';
    const w = Math.max(ctx.measureText(name).width, 20);
    if (sideways) {
      ctx.textAlign = out.x < 0 ? 'right' : 'left';
      x = out.x < 0 ? Math.max(x, 8 + w) : Math.min(x, POLY_SIZE - 8 - w);
    } else {
      ctx.textAlign = 'center';
      x = clamp(x, 8 + w / 2, POLY_SIZE - 8 - w / 2);
    }
    y = clamp(y, 18, POLY_SIZE - 18);
    ctx.fillText(name, x, y - 7);
    ctx.font = 'bold 14px "Fira Code", monospace';
    ctx.fillText(String(s.scores[i]), x, y + 9);
  });
};

// =====================================================================
// Bots (modo "sozinho")
// =====================================================================
// Bots "humanos": erram mais quanto mais rápida a bola, reagem um pouco devagar e às vezes vacilam
export const BOT_TUNING = {
  errorBase: 0.35, // erro em "meias raquetes"
  errorPerSpeed: 0.11, // erro extra por px/quadro de velocidade da bola
  blunderChance: 0.12, // chance de cada decisão sair bem errada
  speed: 0.8, // velocidade da raquete do bot (fração da velocidade normal)
  reach: 0.6 // só reage quando a bola está a menos dessa fração do campo
};

export const createBotBrain = () => ({ err: 0, timer: 0, blunder: false });

// Reflete y dentro de [min, max] como se a bola quicasse nas paredes
const foldInto = (v, min, max) => {
  const span = max - min;
  let t = (v - min) % (2 * span);
  if (t < 0) t += 2 * span;
  return min + (t <= span ? t : 2 * span - t);
};

/** Comando do bot para o jogador i: segue a previsão de onde a bola vai chegar, com erro. */
export const botInput = (s, i, brain) => {
  const T = BOT_TUNING;
  brain.timer -= 1;
  if (brain.timer <= 0) {
    brain.err = Math.random() * 2 - 1; // -1..1
    brain.blunder = Math.random() < T.blunderChance;
    brain.timer = 25 + Math.floor(Math.random() * 25);
  }
  // Erro em "meias raquetes": cresce com a velocidade da bola mais rápida
  const fastest = Math.max(0, ...s.balls.map((b) => Math.hypot(b.dx, b.dy))) * speedMul(s);
  const miss = brain.err * (T.errorBase + T.errorPerSpeed * fastest) * (brain.blunder ? 2.6 : 1);

  if (s.mode === 2) {
    const paddle = i === 0 ? s.player1 : s.player2;
    const faceX = i === 0 ? paddle.x + PADDLE_W : paddle.x;
    let best = null;
    s.balls.forEach((b) => {
      const coming = i === 0 ? b.dx < 0 : b.dx > 0;
      if (!coming || Math.abs(b.dx) < 0.01) return;
      const time = (faceX - b.x) / b.dx;
      // Só reage quando a bola está chegando ao seu lado da quadra
      if (time < 0 || Math.abs(faceX - b.x) > CLASSIC_W * T.reach) return;
      if (!best || time < best.time) best = { time, y: foldInto(b.y + b.dy * time, BALL_R, CLASSIC_H - BALL_R) };
    });
    const half = classicPaddleH(s, i) / 2;
    const target = best ? best.y + miss * half : CLASSIC_H / 2 + brain.err * 30;
    return { target, bot: true, botSpeed: T.speed };
  }

  const g = polyGeometry(s.mode);
  const { A, u, n, L } = g.goals[i];
  let best = null;
  s.balls.forEach((b) => {
    const vn = dot(b.dx, b.dy, n);
    if (vn >= -0.01) return;
    const dist = dot(b.x - A.x, b.y - A.y, n) - POLY_PADDLE_OFFSET;
    const time = dist / -vn;
    if (time < 0 || dist > g.R * 2 * T.reach) return;
    const px = b.x + b.dx * time;
    const py = b.y + b.dy * time;
    const along = dot(px - A.x, py - A.y, u) / L;
    if (!best || time < best.time) best = { time, t: along };
  });
  const half = polyPaddleLen(s, g, i) / 2 / L;
  const target = best ? clamp(best.t, 0, 1) + miss * half : 0.5 + brain.err * 0.12;
  return { target, bot: true, botSpeed: T.speed };
};

// =====================================================================
// API comum
// =====================================================================
export const canvasSize = (mode) => (mode >= 3 ? { w: POLY_SIZE, h: POLY_SIZE } : { w: CLASSIC_W, h: CLASSIC_H });
export const createGameState = (mode, winScore = DEFAULT_WIN, powersEnabled = true) =>
  mode >= 3 ? createPoly(mode, winScore, powersEnabled) : createClassic(winScore, powersEnabled);
export const stepGame = (state, inputs) => (state.mode >= 3 ? stepPoly(state, inputs) : stepClassic(state, inputs));
export const drawGame = (ctx, state, viewIndex, labels) =>
  state.mode >= 3 ? drawPoly(ctx, state, viewIndex, labels) : drawClassic(ctx, state);

const secs = (frames) => Math.ceil(frames / FPS);
const SPEED_LABELS = { 1: '2x', 2: '4x', 3: '8x', '-1': '½', '-2': '¼', '-3': '⅛' };

/**
 * Lista dos poderes ativos para exibir na tela: [{ key, icon, text, color, owner }]
 * (owner = índice do jogador, para os poderes individuais).
 */
export const effectChips = (s) => {
  const e = s.effects;
  const chips = [];
  if (e.big.stacks) chips.push({ key: 'big', icon: '🔵', text: `${BIG_BASE * 2 ** (e.big.stacks - 1)}x · ${secs(e.big.frames)}s`, color: POWERS.big.color });
  if (e.speed.level > 0) chips.push({ key: 'fast', icon: '⚡', text: `${SPEED_LABELS[e.speed.level]} · ${secs(e.speed.frames)}s`, color: POWERS.fast.color });
  if (e.speed.level < 0) chips.push({ key: 'slow', icon: '🐢', text: `${SPEED_LABELS[e.speed.level]} · ${secs(e.speed.frames)}s`, color: POWERS.slow.color });
  if (e.curve.stacks) chips.push({ key: 'curve', icon: '🌀', text: `${secs(e.curve.frames)}s`, color: POWERS.curve.color });
  if (e.ghost) chips.push({ key: 'ghost', icon: '👻', text: `${secs(e.ghost)}s`, color: POWERS.ghost.color });
  if (e.gravity) chips.push({ key: 'gravity', icon: '🕳️', text: `${secs(e.gravity)}s`, color: POWERS.gravity.color });
  const perPlayer = (list, key, icon, withTime = true) => list.forEach((f, i) => {
    if (f) chips.push({ key: `${key}-${i}`, icon, text: withTime ? `${secs(f)}s` : '', color: COLORS[i], owner: i });
  });
  perPlayer(e.grow.map((g) => (g.stacks ? g.frames : 0)), 'grow', '📏');
  perPlayer(e.shrink, 'shrink', '🤏');
  perPlayer(e.freeze, 'freeze', '❄️');
  perPlayer(e.invert, 'invert', '🔄');
  perPlayer(e.shield.map((v) => (v ? 1 : 0)), 'shield', '🛡️', false);
  return chips;
};

const round1 = (v) => Math.round(v * 10) / 10;

// Estado compacto enviado do anfitrião para os convidados
export const packState = (s) => {
  const e = s.effects;
  const msg = {
    t: 's',
    bs: s.balls.map((b) => [round1(b.x), round1(b.y), b.lt ?? -1]),
    p: s.scores,
    e: {
      b: [e.big.stacks, secs(e.big.frames)],
      v: [e.speed.level, secs(e.speed.frames)],
      c: [e.curve.stacks, secs(e.curve.frames)],
      g: secs(e.ghost),
      gv: secs(e.gravity),
      gr: e.grow.map((g) => [g.stacks, secs(g.frames)]),
      i: e.invert.map(secs),
      fz: e.freeze.map(secs),
      sk: e.shrink.map(secs),
      sh: e.shield.map((v) => (v ? 1 : 0))
    },
    bl: s.balloon ? [round1(s.balloon.x), round1(balloonY(s, s.balloon)), POWER_TYPES.indexOf(s.balloon.type), s.balloon.age] : null
  };
  if (s.mode >= 3) msg.q = s.paddles.map((v) => Math.round(v * 1000) / 1000);
  else {
    msg.a = Math.round(s.player1.y);
    msg.b = Math.round(s.player2.y);
  }
  return msg;
};

export const applyPacked = (s, msg) => {
  s.tick += 1;
  s.balls = (msg.bs || []).map(([x, y, lt]) => ({ x, y, dx: 0, dy: 0, lt: lt >= 0 ? lt : null }));
  const e = msg.e;
  if (e && e.b) {
    const n = s.scores.length;
    const arr = (list) => (list || filled(n, () => 0)).map((f) => f * FPS);
    s.effects = {
      big: { stacks: e.b[0], frames: e.b[1] * FPS },
      speed: { level: e.v[0], frames: e.v[1] * FPS },
      curve: { stacks: e.c[0], frames: e.c[1] * FPS, dir: 1 },
      ghost: e.g * FPS,
      gravity: (e.gv || 0) * FPS,
      grow: e.gr.map(([stacks, f]) => ({ stacks, frames: f * FPS })),
      invert: arr(e.i),
      freeze: arr(e.fz),
      shrink: arr(e.sk),
      shield: e.sh.map(Boolean)
    };
  }
  s.balloon = msg.bl ? { x: msg.bl[0], y: msg.bl[1], type: POWER_TYPES[msg.bl[2]], age: msg.bl[3], fixed: true } : null;
  if (s.mode >= 3 && msg.q) s.paddles = msg.q;
  if (s.mode === 2) {
    s.player1.y = msg.a;
    s.player2.y = msg.b;
  }
  const changed = msg.p.some((v, i) => v !== s.scores[i]);
  if (changed) s.scores = [...msg.p];
  return changed;
};
