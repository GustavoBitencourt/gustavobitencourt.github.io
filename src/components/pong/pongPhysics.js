// Física e desenho do Pong.
//  - Modo 2 jogadores: campo clássico 800x400, raquetes nas laterais.
//  - Modo 3 jogadores: hexágono regular com lados alternados gol/parede (3 gols iguais e
//    equidistantes do centro). Cada jogador vê o próprio gol embaixo.
// Os dois modos compartilham o formato de estado: { mode, scores, balls, effects, balloon, fx, pw, ... }
// e stepGame devolve null ou { type: 'point' | 'over' | 'nopoint', scorer, conceded, reason }.
//
// Colisões usam círculo x retângulo em subpassos: pega a raquete inteira (inclusive as quinas)
// e evita que a bola atravesse algo mesmo em alta velocidade.

export const COLORS = ['#00ffcc', '#ff6b9d', '#b388ff'];
export const COLOR_NAMES = ['ciano', 'rosa', 'roxo'];
export const BALL_COLOR = '#ffd700';
export const WIN_OPTIONS = [3, 5, 10];
export const DEFAULT_WIN = 5;
export const SERVE_DELAY_FRAMES = 60; // 1 s de pausa após cada gol (loop a 60 FPS)

const FPS = 60;
const BALL_R = 4;
const BALL_SPEED = 5;
const SERVE_SPEED = 2.2; // saque lento até o primeiro toque numa raquete
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
  grow: { icon: '📏', label: 'Raquete gigante', color: '#00d2d3', frames: 12 * FPS, owner: true },
  invert: { icon: '🔄', label: 'Controles invertidos', color: '#fd79a8', frames: 7 * FPS, owner: true },
  shield: { icon: '🛡️', label: 'Escudo no gol', color: '#feca57', frames: 0, owner: true }
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

const newEffects = (n) => ({
  big: { stacks: 0, frames: 0 },
  speed: { level: 0, frames: 0 },
  curve: { stacks: 0, frames: 0, dir: 1 },
  ghost: 0,
  grow: filled(n, () => ({ stacks: 0, frames: 0 })),
  invert: filled(n, () => 0),
  shield: filled(n, () => false)
});

const ballRadius = (s) => (s.effects.big.stacks > 0 ? BALL_R * BIG_BASE * 2 ** (s.effects.big.stacks - 1) : BALL_R);
const speedMul = (s) => 2 ** s.effects.speed.level;

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
  if (e.ghost > 0) e.ghost -= 1;
  e.grow.forEach((g, i) => {
    if (g.frames > 0) {
      g.frames -= 1;
      if (g.frames === 0) setGrow(s, i, 0);
    }
  });
  e.invert = e.invert.map((v) => (v > 0 ? v - 1 : 0));
  if (s.balloon) {
    s.balloon.age += 1;
    if (s.balloon.age > BALLOON_LIFE) s.balloon = null;
  }
};

// Gol: tudo volta ao normal
const resetPowers = (s) => {
  for (let i = 0; i < s.scores.length; i++) setGrow(s, i, 0);
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
  if (type === 'zigzag') s.balls.forEach((b) => randomizeDirection(s, b));
  if (type === 'grow') {
    setGrow(s, owner, Math.min(MAX_GROW_STACKS, e.grow[owner].stacks + 1));
    e.grow[owner].frames = frames;
  }
  if (type === 'invert') {
    e.invert = e.invert.map((v, i) => (i === owner ? v : frames));
  }
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

// Bola com efeito: a direção gira um pouco a cada quadro
const applyCurve = (s) => {
  const { stacks, dir } = s.effects.curve;
  if (!stacks) return;
  const a = CURVE_RATE * stacks * dir;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  s.balls.forEach((b) => {
    if (b.slow) return;
    const dx = b.dx * cos - b.dy * sin;
    b.dy = b.dx * sin + b.dy * cos;
    b.dx = dx;
    // No clássico, não deixa a bola ficar vertical demais
    if (s.mode === 2 && Math.abs(b.dx) < Math.hypot(b.dx, b.dy) * 0.35) {
      b.dx = Math.sign(b.dx || 1) * Math.hypot(b.dx, b.dy) * 0.35;
    }
  });
};

// Batida na parede também acelera (como uma rebatida), exceto no saque lento
const accelerate = (ball, max) => {
  if (ball.slow) return;
  const sp = Math.hypot(ball.dx, ball.dy);
  const ns = Math.min(max, sp * 1.05);
  ball.dx *= ns / sp;
  ball.dy *= ns / sp;
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

// Controles invertidos: troca as direções e espelha o alvo do dedo
const flipInput = (input = {}, mode) => ({
  up: !!input.down,
  down: !!input.up,
  left: !!input.right,
  right: !!input.left,
  target: input.target === null || input.target === undefined ? null : mode === 3 ? 1 - input.target : CLASSIC_H - input.target
});

const effectiveInputs = (s, inputs) => inputs.map((input, i) => (s.effects.invert[i] > 0 ? flipInput(input, s.mode) : input));

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
  const r = ballRadius(s) + (s.mode === 3 ? 1 : 0);
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

// =====================================================================
// Modo clássico (2 jogadores)
// =====================================================================
export const CLASSIC_W = 800;
export const CLASSIC_H = 400;
const PADDLE_W = 10;
const PADDLE_H = 80;
const PADDLE_SPEED = 6;
const CLASSIC_MAX_SPEED = 15;

const classicPaddleH = (stacks) => PADDLE_H * (1 + 0.6 * stacks);

// Muda o tamanho da raquete mantendo o centro no lugar
function setGrow(s, i, stacks) {
  const g = s.effects.grow[i];
  if (s.mode === 2) {
    const paddle = i === 0 ? s.player1 : s.player2;
    const oldH = classicPaddleH(g.stacks);
    const newH = classicPaddleH(stacks);
    paddle.y = clamp(paddle.y - (newH - oldH) / 2, 0, CLASSIC_H - newH);
  }
  g.stacks = stacks;
}

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
  player1: { x: 20, y: CLASSIC_H / 2 - PADDLE_H / 2 },
  player2: { x: CLASSIC_W - 30, y: CLASSIC_H / 2 - PADDLE_H / 2 },
  balls: [serveClassic(Math.random() < 0.5 ? 1 : -1)],
  effects: newEffects(2),
  balloon: null,
  hits: 0,
  tick: 0,
  serveFrames: 0,
  fx: [],
  pw: []
});

// Teclado (up/down) ou seguindo o dedo (target = Y no campo)
const moveClassicPaddle = (paddle, h, input = {}) => {
  if (input.target !== null && input.target !== undefined) {
    const diff = input.target - (paddle.y + h / 2);
    paddle.y += clamp(diff, -PADDLE_SPEED * 1.5, PADDLE_SPEED * 1.5);
  } else {
    if (input.up) paddle.y -= PADDLE_SPEED;
    if (input.down) paddle.y += PADDLE_SPEED;
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
      accelerate(ball, CLASSIC_MAX_SPEED);
      s.fx.push('wall');
    } else if (ball.y + r >= CLASSIC_H && ball.dy > 0) {
      ball.y = CLASSIC_H - r;
      ball.dy = -ball.dy;
      accelerate(ball, CLASSIC_MAX_SPEED);
      s.fx.push('wall');
    }

    for (const [paddle, dir, idx] of paddles) {
      const h = classicPaddleH(s.effects.grow[idx].stacks);
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
  moveClassicPaddle(s.player1, classicPaddleH(s.effects.grow[0].stacks), inputs[0]);
  moveClassicPaddle(s.player2, classicPaddleH(s.effects.grow[1].stacks), inputs[1]);
  tickPowers(s);

  if (s.serveFrames > 0) {
    s.serveFrames -= 1;
    return null;
  }

  applyCurve(s);
  const r = ballRadius(s);
  const mul = speedMul(s);
  for (const ball of [...s.balls]) {
    const event = moveClassicBall(s, ball, r, mul);
    if (event) return event;
  }
  return null;
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

  if (s.effects.shield[0]) drawShieldLine(ctx, 3, 0, 3, CLASSIC_H, COLORS[0]);
  if (s.effects.shield[1]) drawShieldLine(ctx, CLASSIC_W - 3, 0, CLASSIC_W - 3, CLASSIC_H, COLORS[1]);

  ctx.fillStyle = COLORS[0];
  ctx.fillRect(s.player1.x, s.player1.y, PADDLE_W, classicPaddleH(s.effects.grow[0].stacks));
  ctx.fillStyle = COLORS[1];
  ctx.fillRect(s.player2.x, s.player2.y, PADDLE_W, classicPaddleH(s.effects.grow[1].stacks));

  if (s.balloon) {
    const by = balloonY(s, s.balloon);
    balloonBody(ctx, s.balloon.x, by, s.balloon.type, s.balloon.age || 0);
    balloonIcon(ctx, s.balloon.x, by, s.balloon.type);
  }

  s.balls.forEach((ball) => drawBall(ctx, s, ball));
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

const hexPaddleLen = (stacks) => HEX_PADDLE_LEN * (1 + 0.5 * stacks);
const hexHalf = (stacks) => hexPaddleLen(stacks) / 2 / HEX_R; // limite do centro da raquete (fração do lado)

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
export const hexTouchToTarget = (x) => clamp((HEX_C + HEX_R / 2 - x) / HEX_R, 0, 1);

const serveHexBall = (towardPlayer) => {
  const { n } = GOAL_SIDES[towardPlayer];
  const angle = (Math.random() - 0.5) * 0.5;
  const dx = -n.x * Math.cos(angle) + n.y * Math.sin(angle);
  const dy = -n.y * Math.cos(angle) - n.x * Math.sin(angle);
  return { x: HEX_C, y: HEX_C, dx: dx * SERVE_SPEED, dy: dy * SERVE_SPEED, slow: true, lt: null };
};

const createHex = (winScore, powersEnabled) => ({
  mode: 3,
  winScore,
  powersEnabled,
  scores: [0, 0, 0],
  paddles: [0.5, 0.5, 0.5],
  balls: [serveHexBall(Math.floor(Math.random() * 3))],
  effects: newEffects(3),
  balloon: null,
  hits: 0,
  tick: 0,
  serveFrames: 0,
  fx: [],
  pw: []
});

// Esquerda/direita na tela de cada jogador (gol embaixo): esquerda aumenta t
const moveHexPaddle = (s, i, input = {}) => {
  const half = hexHalf(s.effects.grow[i].stacks);
  let t = s.paddles[i];
  if (input.target !== null && input.target !== undefined) {
    t += clamp(input.target - t, -HEX_PADDLE_SPEED * 1.5, HEX_PADDLE_SPEED * 1.5);
  } else {
    if (input.left) t += HEX_PADDLE_SPEED;
    if (input.right) t -= HEX_PADDLE_SPEED;
  }
  s.paddles[i] = clamp(t, half, 1 - half);
};

const spawnHexBalloon = () => {
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * 110;
  return { x: HEX_C + Math.cos(a) * d, y: HEX_C + Math.sin(a) * d };
};

const reflectOn = (ball, n, d, r) => {
  const vn = dot(ball.dx, ball.dy, n);
  ball.dx -= 2 * vn * n.x;
  ball.dy -= 2 * vn * n.y;
  ball.x += n.x * (r - d);
  ball.y += n.y * (r - d);
};

const moveHexBall = (s, ball, r, mul) => {
  const steps = substepsFor(ball, mul);

  for (let step = 0; step < steps; step++) {
    const v = stepVector(ball, mul, steps);
    ball.x += v.x;
    ball.y += v.y;

    // Raquetes (retângulo no sistema do gol: s ao longo do lado, d para dentro do campo)
    for (let i = 0; i < 3; i++) {
      const { A, u, n, L } = GOAL_SIDES[i];
      const len = hexPaddleLen(s.effects.grow[i].stacks);
      const rx = ball.x - A.x;
      const ry = ball.y - A.y;
      const s0 = rx * u.x + ry * u.y;
      const d0 = rx * n.x + ry * n.y;
      const c = s.paddles[i] * L;
      const cs = clamp(s0, c - len / 2, c + len / 2);
      const cd = clamp(d0, HEX_PADDLE_OFFSET - HEX_PADDLE_THICK, HEX_PADDLE_OFFSET);
      const vn = dot(ball.dx, ball.dy, n);
      const notBehind = d0 > HEX_PADDLE_OFFSET - HEX_PADDLE_THICK - r; // folga de um raio (quinas de trás)
      if (vn >= 0 || !notBehind || Math.hypot(s0 - cs, d0 - cd) >= r) continue;

      const offset = clamp((s0 - c) / (len / 2), -1, 1);
      const angle = offset * 0.95; // até ~55° de desvio
      const speed = ball.slow ? BALL_SPEED : Math.min(HEX_MAX_SPEED, Math.hypot(ball.dx, ball.dy) * 1.05);
      ball.slow = false;
      ball.dx = (n.x * Math.cos(angle) + u.x * Math.sin(angle)) * speed;
      ball.dy = (n.y * Math.cos(angle) + u.y * Math.sin(angle)) * speed;
      ball.x = A.x + u.x * s0 + n.x * (HEX_PADDLE_OFFSET + r);
      ball.y = A.y + u.y * s0 + n.y * (HEX_PADDLE_OFFSET + r);
      ball.lt = i;
      s.fx.push('hit');
      onPaddleHit(s, spawnHexBalloon);
      break;
    }

    // Paredes
    for (let k = 1; k < 6; k += 2) {
      const { A, n } = SIDES[k];
      const d = dot(ball.x - A.x, ball.y - A.y, n);
      if (d < r && dot(ball.dx, ball.dy, n) < 0) {
        reflectOn(ball, n, d, r);
        accelerate(ball, HEX_MAX_SPEED);
        s.fx.push('wall');
      }
    }

    checkBalloon(s, ball, r);

    for (let i = 0; i < 3; i++) {
      const { A, n } = GOAL_SIDES[i];
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

      if (scorer === null || scorer === undefined || scorer === i) {
        // Gol contra ou ninguém tocou: não vale ponto
        s.fx.push('wall');
        s.balls = [serveHexBall((i + 1) % 3)];
        return { type: 'nopoint', scorer: null, conceded: i, reason: scorer === i ? 'own' : 'none' };
      }

      s.scores[scorer] += 1;
      s.fx.push('goal');
      s.balls = [serveHexBall(i)];
      return { type: s.scores[scorer] >= s.winScore ? 'over' : 'point', scorer, conceded: i };
    }
  }

  // Segurança numérica: bola fora do campo sem passar por um gol
  if (Math.hypot(ball.x - HEX_C, ball.y - HEX_C) > HEX_R + 60 + r) {
    s.balls = s.balls.filter((b) => b !== ball);
    if (!s.balls.length) s.balls = [serveHexBall(Math.floor(Math.random() * 3))];
  }
  return null;
};

const stepHex = (s, rawInputs) => {
  const inputs = effectiveInputs(s, rawInputs);
  for (let i = 0; i < 3; i++) moveHexPaddle(s, i, inputs[i]);
  tickPowers(s);

  if (s.serveFrames > 0) {
    s.serveFrames -= 1;
    return null;
  }

  applyCurve(s);
  const r = ballRadius(s);
  const mul = speedMul(s);
  for (const ball of [...s.balls]) {
    const event = moveHexBall(s, ball, r, mul);
    if (event) return event;
  }
  return null;
};

const toScreen = (p, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = p.x - HEX_C;
  const y = p.y - HEX_C;
  return { x: HEX_C + x * cos - y * sin, y: HEX_C + x * sin + y * cos };
};

const drawHex = (ctx, s, viewIndex = 0, labels = []) => {
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

  // Linhas de gol (cor de cada jogador) e escudos
  GOAL_SIDES.forEach((side, i) => {
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
  GOAL_SIDES.forEach(({ A, u, n, L }, i) => {
    const len = hexPaddleLen(s.effects.grow[i].stacks);
    const c = s.paddles[i] * L;
    const s0 = c - len / 2;
    const s1 = c + len / 2;
    const d0 = HEX_PADDLE_OFFSET - HEX_PADDLE_THICK;
    const d1 = HEX_PADDLE_OFFSET;
    const pt = (sv, d) => ({ x: A.x + u.x * sv + n.x * d, y: A.y + u.y * sv + n.y * d });
    const corners = [pt(s0, d0), pt(s1, d0), pt(s1, d1), pt(s0, d1)];
    ctx.fillStyle = COLORS[i];
    ctx.beginPath();
    corners.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
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

  // Nomes e placar de cada gol (texto sempre na horizontal). O gol de baixo fica centralizado
  // abaixo do campo; os gols de cima vão para os cantos livres do canvas, sem cobrir o jogo.
  ctx.font = 'bold 13px "Fira Code", monospace';
  ctx.textBaseline = 'middle';
  GOAL_SIDES.forEach(({ mid }, i) => {
    const p = toScreen(mid, angle);
    const raw = labels[i] || `Jogador ${i + 1}`;
    const name = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw;
    const text = `${name} · ${s.scores[i]}`;
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
export const createGameState = (mode, winScore = DEFAULT_WIN, powersEnabled = true) =>
  mode === 3 ? createHex(winScore, powersEnabled) : createClassic(winScore, powersEnabled);
export const stepGame = (state, inputs) => (state.mode === 3 ? stepHex(state, inputs) : stepClassic(state, inputs));
export const drawGame = (ctx, state, viewIndex, labels) =>
  state.mode === 3 ? drawHex(ctx, state, viewIndex, labels) : drawClassic(ctx, state);

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
  e.grow.forEach((g, i) => {
    if (g.stacks) chips.push({ key: `grow-${i}`, icon: '📏', text: `${secs(g.frames)}s`, color: COLORS[i], owner: i });
  });
  e.invert.forEach((f, i) => {
    if (f) chips.push({ key: `invert-${i}`, icon: '🔄', text: `${secs(f)}s`, color: COLORS[i], owner: i });
  });
  e.shield.forEach((on, i) => {
    if (on) chips.push({ key: `shield-${i}`, icon: '🛡️', text: '', color: COLORS[i], owner: i });
  });
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
      gr: e.grow.map((g) => [g.stacks, secs(g.frames)]),
      i: e.invert.map(secs),
      sh: e.shield.map((v) => (v ? 1 : 0))
    },
    bl: s.balloon ? [round1(s.balloon.x), round1(balloonY(s, s.balloon)), POWER_TYPES.indexOf(s.balloon.type), s.balloon.age] : null
  };
  if (s.mode === 3) msg.q = s.paddles.map((v) => Math.round(v * 1000) / 1000);
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
    s.effects = {
      big: { stacks: e.b[0], frames: e.b[1] * FPS },
      speed: { level: e.v[0], frames: e.v[1] * FPS },
      curve: { stacks: e.c[0], frames: e.c[1] * FPS, dir: 1 },
      ghost: e.g * FPS,
      grow: e.gr.map(([stacks, f]) => ({ stacks, frames: f * FPS })),
      invert: e.i.map((f) => f * FPS),
      shield: e.sh.map(Boolean)
    };
  }
  s.balloon = msg.bl ? { x: msg.bl[0], y: msg.bl[1], type: POWER_TYPES[msg.bl[2]], age: msg.bl[3], fixed: true } : null;
  if (s.mode === 3 && msg.q) s.paddles = msg.q;
  if (s.mode !== 3) {
    s.player1.y = msg.a;
    s.player2.y = msg.b;
  }
  const changed = msg.p.some((v, i) => v !== s.scores[i]);
  if (changed) s.scores = [...msg.p];
  return changed;
};
