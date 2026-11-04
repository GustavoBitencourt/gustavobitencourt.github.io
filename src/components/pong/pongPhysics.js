// Física e desenho do Pong.
//  - 2 jogadores: campo clássico 800x400, raquetes nas laterais.
//  - 3 a 6 jogadores: polígono com N gols iguais alternados com N paredes, todos à mesma
//    distância do centro (3 = hexágono, 4 = octógono, 5 = decágono, 6 = dodecágono).
//    Cada jogador vê o próprio gol embaixo.
// Os modos compartilham o formato de estado: { mode, scores, balls, effects, balloons, fx, pw, ... }
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
  shrink: { icon: '🤏', label: 'Raquetes encolhidas', color: '#e17055', frames: 10 * FPS, owner: true },
  reverse: { icon: '↩️', label: 'Bola de ré!', color: '#ff7675', frames: 0 },
  fog: { icon: '🌫️', label: 'Neblina no meio da quadra!', color: '#b2bec3', frames: 7 * FPS },
  drunk: { icon: '🥴', label: 'Bola bêbada!', color: '#e84393', frames: 6 * FPS },
  magnet: { icon: '🧲', label: 'Ímã na raquete', color: '#d63031', frames: 9 * FPS, owner: true },
  snipe: { icon: '🎯', label: 'Tiro certeiro', color: '#00b894', frames: 0, owner: true },
  turbo: { icon: '🚀', label: 'Raquete turbo', color: '#ffeaa7', frames: 10 * FPS, owner: true },
  bumpers: { icon: '🎱', label: 'Pinball! Bumpers na quadra', color: '#fd9644', frames: 9 * FPS },
  hover: { icon: '⏸️', label: 'Bola parada no ar!', color: '#81ecec', frames: Math.round(1.3 * FPS) },
  mystery: { icon: '🎲', label: 'Surpresa!', color: '#f368e0', frames: 0 },
  tiny: { icon: '🔹', label: 'Bola mini!', color: '#48dbfb', frames: 10 * FPS },
  wind: { icon: '💨', label: 'Ventania na quadra!', color: '#c8d6e5', frames: 8 * FPS },
  blackout: { icon: '🔦', label: 'Apagão!', color: '#576574', frames: 6 * FPS },
  sloth: { icon: '🐌', label: 'Raquetes lentas', color: '#10ac84', frames: 8 * FPS, owner: true },
  double: { icon: '💰', label: 'Gol em dobro', color: '#f9ca24', frames: 0, owner: true },
  portals: { icon: '🌌', label: 'Portais na quadra!', color: '#a55eea', frames: 9 * FPS },
  ice: { icon: '🧊', label: 'Raquetes escorregando', color: '#7ed6df', frames: 8 * FPS, owner: true },
  bomb: { icon: '💣', label: 'Bomba! A bola vai explodir...', color: '#ff3838', frames: 4 * FPS },
  hidden: { icon: '🫥', label: 'Raquetes invisíveis', color: '#95afc0', frames: 6 * FPS, owner: true },
  swap: { icon: '🔀', label: 'Troca-troca de raquetes!', color: '#e056fd', frames: 0 },
  split: { icon: '💥', label: 'Estilhaço! Mais duas bolas', color: '#ff6348', frames: 0 },
  center: { icon: '🧭', label: 'Bola de volta ao centro!', color: '#7bed9f', frames: 0 },
  boomerang: { icon: '🪃', label: 'Bumerangue', color: '#e1b12c', frames: 0, owner: true },
  accel: { icon: '📈', label: 'Bola acelerando sem parar!', color: '#ff4757', frames: 5 * FPS },
  square: { icon: '🟥', label: 'Bola quadrada! Quica torto', color: '#ff6b81', frames: 8 * FPS },
  pulse: { icon: '💓', label: 'Bola pulsante!', color: '#ff7f50', frames: 8 * FPS },
  hunt: { icon: '👑', label: 'Caça ao líder!', color: '#ffd32a', frames: 7 * FPS },
  shieldAll: { icon: '🧱', label: 'Escudo para todos!', color: '#cd6133', frames: 0 },
  steal: { icon: '🦹', label: 'Ladrão de ponto', color: '#8e44ad', frames: 0, owner: true },
  dizzy: { icon: '😵', label: 'Quadra tonta!', color: '#c56cf0', frames: 6 * FPS },
  upside: { icon: '🙃', label: 'Quadra de ponta-cabeça!', color: '#3ae374', frames: 5 * FPS },
  barrier: { icon: '🚧', label: 'Barreira no meio da quadra!', color: '#ffb142', frames: 9 * FPS },
  shake: { icon: '📳', label: 'Raquetes tremendo', color: '#d1ccc0', frames: 6 * FPS, owner: true },
  honey: { icon: '🍯', label: 'Raquete de mel', color: '#f0932b', frames: 9 * FPS, owner: true },
  rain: { icon: '🌧️', label: 'Chuva de balões!', color: '#70a1ff', frames: 0 },
  orbit: { icon: '🪐', label: 'Bola em órbita!', color: '#a4b0be', frames: Math.round(2.2 * FPS) },
  decoys: { icon: '👥', label: 'Bolas falsas!', color: '#dfe4ea', frames: 6 * FPS },
  bouncy: { icon: '🏀', label: 'Paredes elásticas!', color: '#e67e22', frames: 8 * FPS },
  repel: { icon: '💫', label: 'Repulsão no meio da quadra!', color: '#18dcff', frames: 7 * FPS },
  lottery: { icon: '🎰', label: 'Loteria de raquetes!', color: '#fbc531', frames: 8 * FPS }
};
// Poderes que só fazem sentido com a bola já rápida: só surgem depois de LATE_HITS rebatidas no ponto
const LATE_POWERS = ['slow', 'hover'];
const LATE_HITS = 10;
export const POWER_TYPES = Object.keys(POWERS);

const BALLOON_R = 18;
const BALLOON_LIFE = 12 * FPS;
const HITS_PER_BALLOON = 3;
const MAX_BALLOONS = 2; // até 2 balões na tela ao mesmo tempo
const DOUBLE_BALLOON_CHANCE = 0.2; // às vezes surgem 2 de uma vez
const BALLOON_GAP = 90; // distância mínima entre dois balões
const BUMPER_R = 20;
const TURBO_MUL = 2; // raquete turbo: 2x mais rápida
const BIG_BASE = 5; // primeira bola gigante: 5x; cada balão igual dobra de novo
const MAX_BIG_STACKS = 3; // 5x, 10x, 20x
const MAX_SPEED_LEVEL = 3; // rápida: 2x, 4x, 8x / lenta: ½, ¼, ⅛
const MAX_GROW_STACKS = 2;
const MAX_BALLS = 4;
const MAX_BALLOONS_RAIN = 4; // chuva de balões pode passar do limite normal
const ACCEL_RATE = 1.012; // bola acelerando: velocidade multiplicada por quadro
const HUNT_PULL = 0.2;
const REPEL_PUSH = 0.24;
const ORBIT_RATE = 0.075; // rad por quadro
const BOUNCY_BOOST = 1.12; // paredes elásticas
const SQUARE_JITTER = 0.4; // bola quadrada: desvio máximo ao quicar (rad)
const SHAKE_PX = 16; // raquetes tremendo
const HONEY_HOLD = 36; // raquete de mel: segura a bola por 0,6 s
const BARRIER_HALF = 48;
const BARRIER_THICK = 4;
const DECOY_COUNT = 2;
const CURVE_RATE = 0.016; // rad por quadro, por nível de efeito
const GRAVITY_PULL = 0.22; // aceleração em direção ao centro (a velocidade é mantida)
const SHRINK_FACTOR = 0.55;
const DRUNK_SWAY = 0.07; // rad por quadro no auge do balanço da bola bêbada
const MAGNET_PULL = 0.2; // aceleração em direção à raquete com ímã (a velocidade é mantida)
const MAGNET_RANGE = 260; // o ímã só puxa a bola que está chegando perto do gol
const SNIPE_BOOST = 2.4; // tiro certeiro: velocidade da rebatida multiplicada
const SNIPE_MAX = 2; // tiro certeiro pode passar do limite normal de velocidade (até 2x)
const TINY_FACTOR = 0.5; // bola mini: metade do tamanho
const WIND_FORCE = 0.12; // ventania: empurra a direção da bola (a velocidade é mantida)
const SLOTH_MUL = 0.45; // raquetes lentas: velocidade das raquetes dos adversários
const ICE_KEEP = 0.94; // raquete escorregando: quanto do movimento anterior continua
const PORTAL_R = 20;
const PORTAL_COOLDOWN = 25; // quadros até a bola poder usar um portal de novo
const MAX_WALL_BOUNCES = 5; // 3+ jogadores: depois de 5 batidas seguidas sem raquete, a bola vai para um gol
const LIGHT_R = 105; // apagão: raio da luz em volta de cada raquete
// Anti-loop (3+ jogadores): se as mesmas duas raquetes trocarem a bola mais de MAX_RALLY vezes seguidas,
// a próxima rebatida sai em direção ao gol de outro jogador
const MAX_RALLY = 4;

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
  shield: filled(n, () => false),
  fog: 0,
  drunk: 0,
  magnet: filled(n, () => 0),
  snipe: filled(n, () => false),
  turbo: filled(n, () => 0),
  bumpers: 0,
  hover: 0,
  tiny: 0,
  wind: { frames: 0, angle: 0 },
  blackout: 0,
  sloth: filled(n, () => 0),
  double: filled(n, () => false),
  portals: 0,
  ice: filled(n, () => 0),
  bomb: 0,
  hidden: filled(n, () => 0),
  accel: 0,
  square: 0,
  pulse: 0,
  hunt: 0,
  huntTarget: 0,
  dizzy: 0,
  upside: 0,
  barrier: 0,
  orbit: 0,
  orbitDir: 1,
  bouncy: 0,
  repel: 0,
  decoys: 0,
  shake: filled(n, () => 0),
  honey: filled(n, () => 0)
});

const ballRadius = (s) =>
  (s.effects.big.stacks > 0 ? BALL_R * BIG_BASE * 2 ** (s.effects.big.stacks - 1) : BALL_R) *
  (s.effects.tiny > 0 ? TINY_FACTOR : 1) *
  (s.effects.pulse > 0 ? 1.15 + 0.85 * Math.sin(s.tick / 10) : 1); // pulsante: de 0,3x a 2x
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
  if (e.fog > 0) e.fog -= 1;
  if (e.drunk > 0) e.drunk -= 1;
  const dec = (v) => (v > 0 ? v - 1 : 0);
  e.invert = e.invert.map(dec);
  e.freeze = e.freeze.map(dec);
  e.shrink = e.shrink.map(dec);
  e.magnet = e.magnet.map(dec);
  e.turbo = e.turbo.map(dec);
  e.sloth = e.sloth.map(dec);
  if (e.tiny > 0) e.tiny -= 1;
  if (e.wind.frames > 0) e.wind.frames -= 1;
  if (e.blackout > 0) e.blackout -= 1;
  if (e.portals > 0) e.portals -= 1;
  e.ice = e.ice.map(dec);
  e.hidden = e.hidden.map(dec);
  e.shake = e.shake.map(dec);
  e.honey = e.honey.map(dec);
  ['accel', 'square', 'pulse', 'hunt', 'dizzy', 'upside', 'barrier', 'orbit', 'bouncy', 'repel', 'decoys'].forEach((k) => {
    if (e[k] > 0) e[k] -= 1;
  });
  if (!e.decoys) s.decoys = [];
  if (e.bomb > 0) {
    e.bomb -= 1;
    if (e.bomb === 0) s.boom = true; // explode no próximo passo da bola
  }
  if (e.bumpers > 0) e.bumpers -= 1;
  s.balloons.forEach((b) => {
    b.age += 1;
  });
  s.balloons = s.balloons.filter((b) => b.age <= BALLOON_LIFE);
};

// Gol: tudo volta ao normal
const resetPowers = (s) => {
  s.effects = newEffects(s.scores.length);
  s.balloons = [];
  s.decoys = [];
  s.rallyHits = 0;
};

// Poderes que ainda não podem surgir neste ponto
const notYet = (s) => ((s.rallyHits || 0) < LATE_HITS ? LATE_POWERS : []);

const randomPower = (exclude = []) => {
  const options = POWER_TYPES.filter((t) => !exclude.includes(t));
  return options[Math.floor(Math.random() * options.length)];
};

// A cada 2 rebatidas surge um balão (às vezes dois), até 2 na tela, longe um do outro
const onPaddleHit = (s, spawnBalloon) => {
  s.hits += 1;
  s.rallyHits = (s.rallyHits || 0) + 1;
  if (!s.powersEnabled || s.hits % HITS_PER_BALLOON !== 0) return;
  const wanted = Math.random() < DOUBLE_BALLOON_CHANCE ? 2 : 1;
  for (let k = 0; k < wanted && s.balloons.length < MAX_BALLOONS; k++) {
    let pos = null;
    for (let tries = 0; tries < 12 && !pos; tries++) {
      const p = spawnBalloon();
      if (s.balloons.every((b) => Math.hypot(b.x - p.x, b.y - p.y) >= BALLOON_GAP)) pos = p;
    }
    if (!pos) return;
    s.balloons.push({ ...pos, type: randomPower([...s.balloons.map((b) => b.type), ...notYet(s)]), age: 0 });
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

const activatePower = (s, requested, ball, silent = false) => {
  let type = requested;
  if (type === 'mystery') {
    // Surpresa: dois poderes aleatórios de uma vez
    // (sem ninguém ter tocado na bola, só sorteia poderes que não dependem de dono)
    const ownerless = ball.lt === null || ball.lt === undefined;
    const skip = ['mystery', ...notYet(s), ...(ownerless ? POWER_TYPES.filter((t) => POWERS[t].owner) : [])];
    const picks = [randomPower(skip)];
    picks.push(randomPower([...skip, picks[0]]));
    picks.forEach((t) => activatePower(s, t, ball, true));
    s.fx.push('power');
    s.pw.push({ t: 'mystery', o: ball.lt ?? null, k: picks });
    return;
  }
  const owner = ball.lt;
  // Poderes de jogador precisam de alguém que tenha tocado na bola
  if (POWERS[type].owner && (owner === null || owner === undefined)) type = 'zigzag';
  // Ladrão sem ninguém para roubar (ou que daria a vitória): vira gol em dobro
  let victim = null;
  if (type === 'steal') {
    victim = leaderIndex(s, owner);
    if (victim === null || s.scores[owner] + 1 >= s.winScore) type = 'double';
  }
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
  if (type === 'reverse') {
    s.balls.forEach((b) => {
      b.dx = -b.dx;
      b.dy = -b.dy;
    });
  }
  if (type === 'fog') e.fog = frames;
  if (type === 'drunk') e.drunk = frames;
  if (type === 'magnet') e.magnet[owner] = frames;
  if (type === 'snipe') e.snipe[owner] = true;
  if (type === 'turbo') e.turbo[owner] = frames;
  if (type === 'bumpers') e.bumpers = frames;
  if (type === 'hover') e.hover = frames;
  if (type === 'tiny') e.tiny = frames;
  if (type === 'wind') e.wind = { frames, angle: Math.random() * Math.PI * 2 };
  if (type === 'blackout') e.blackout = frames;
  if (type === 'sloth') e.sloth = others(e.sloth, frames);
  if (type === 'double') e.double[owner] = true;
  if (type === 'portals') e.portals = frames;
  if (type === 'ice') e.ice = others(e.ice, frames);
  if (type === 'bomb') e.bomb = frames;
  if (type === 'split') {
    const speed = Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy));
    const dir = Math.atan2(ball.dy, ball.dx);
    [-0.6, 0.6].forEach((a) => {
      if (s.balls.length >= MAX_BALLS) return;
      s.balls.push({ x: ball.x, y: ball.y, dx: Math.cos(dir + a) * speed, dy: Math.sin(dir + a) * speed, slow: false, lt: ball.lt });
    });
  }
  if (type === 'center') {
    const c = fieldCenter(s);
    s.balls.forEach((b) => {
      b.x = c.x;
      b.y = c.y;
      b.held = null;
      randomizeDirection(s, b);
    });
  }
  if (type === 'boomerang') {
    // A bola volta para o gol de quem tocou por último
    const speed = Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy));
    if (s.mode === 2) {
      const tx = owner === 0 ? 0 : CLASSIC_W;
      const ty = CLASSIC_H / 2 + (Math.random() - 0.5) * 200;
      const dl = Math.hypot(tx - ball.x, ty - ball.y) || 1;
      ball.dx = ((tx - ball.x) / dl) * speed;
      ball.dy = ((ty - ball.y) / dl) * speed;
      keepHorizontalEnough(s, ball);
    } else {
      aimAtGoal(polyGeometry(s.mode), ball, owner, 0.2 + Math.random() * 0.6, speed);
    }
  }
  if (type === 'accel') e.accel = frames;
  if (type === 'square') e.square = frames;
  if (type === 'pulse') e.pulse = frames;
  if (type === 'hunt') {
    e.hunt = frames;
    e.huntTarget = leaderIndex(s, null) ?? Math.floor(Math.random() * s.scores.length);
  }
  if (type === 'shieldAll') e.shield = e.shield.map(() => true);
  if (type === 'steal') {
    s.scores[victim] -= 1;
    s.scores[owner] += 1;
    s.scoreChanged = true;
  }
  if (type === 'dizzy') e.dizzy = frames;
  if (type === 'upside') e.upside = frames;
  if (type === 'barrier') e.barrier = frames;
  if (type === 'shake') e.shake = others(e.shake, frames);
  if (type === 'honey') e.honey[owner] = frames;
  if (type === 'rain') {
    for (let k = 0; k < 3 && s.balloons.length < MAX_BALLOONS_RAIN; k++) {
      const p = balloonSpot(s);
      s.balloons.push({ ...p, type: randomPower(['rain', ...s.balloons.map((b) => b.type), ...notYet(s)]), age: 0 });
    }
  }
  if (type === 'orbit') {
    e.orbit = frames;
    e.orbitDir = Math.random() < 0.5 ? -1 : 1;
  }
  if (type === 'decoys') {
    e.decoys = frames;
    const speed = Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy));
    const dir = Math.atan2(ball.dy, ball.dx);
    s.decoys = Array.from({ length: DECOY_COUNT }, (_, k) => {
      const a = dir + (k === 0 ? -0.5 : 0.5);
      return { x: ball.x, y: ball.y, dx: Math.cos(a) * speed, dy: Math.sin(a) * speed };
    });
  }
  if (type === 'bouncy') e.bouncy = frames;
  if (type === 'repel') e.repel = frames;
  if (type === 'lottery') {
    // Cada raquete ganha um tamanho sorteado: gigante ou encolhida
    for (let i = 0; i < s.scores.length; i++) {
      if (Math.random() < 0.5) {
        e.grow[i] = { stacks: 1, frames };
        e.shrink[i] = 0;
      } else {
        e.grow[i] = { stacks: 0, frames: 0 };
        e.shrink[i] = frames;
      }
    }
  }
  if (type === 'hidden') e.hidden = others(e.hidden, frames);
  if (type === 'swap') {
    // Cada raquete vai para a posição da outra (no clássico, troca a altura das duas)
    if (s.mode === 2) {
      const y = s.player1.y;
      s.player1.y = s.player2.y;
      s.player2.y = y;
    } else {
      s.paddles = s.paddles.map((_, i) => s.paddles[(i + 1) % s.paddles.length]);
    }
  }

  if (silent) return;
  s.fx.push('power');
  s.pw.push(victim !== null && type === 'steal' ? { t: type, o: owner, v: victim } : { t: type, o: owner ?? null });
};

// Quem tem mais pontos (sem empate e com pelo menos 1 ponto), ignorando 'skip'
const leaderIndex = (s, skip) => {
  let best = null;
  s.scores.forEach((v, i) => {
    if (i === skip || v <= 0) return;
    if (best === null || v > s.scores[best]) best = i;
  });
  if (best === null) return null;
  return s.scores.filter((v, i) => i !== skip && v === s.scores[best]).length > 1 ? null : best;
};

const balloonSpot = (s) => {
  if (s.mode === 2) return spawnClassicBalloon();
  const g = polyGeometry(s.mode);
  const a = Math.random() * Math.PI * 2;
  const d = Math.random() * g.spawnR;
  return { x: POLY_C + Math.cos(a) * d, y: POLY_C + Math.sin(a) * d };
};

const checkBalloon = (s, ball, r) => {
  const hit = s.balloons.find((b) => Math.hypot(ball.x - b.x, ball.y - balloonY(s, b)) < r + BALLOON_R);
  if (!hit) return;
  s.balloons = s.balloons.filter((b) => b !== hit);
  activatePower(s, hit.type, ball);
};

// Bumpers de pinball: posições fixas perto do meio da quadra
const bumperSpots = (s) => {
  if (s.mode === 2) return [{ x: CLASSIC_W / 2, y: CLASSIC_H / 2 }, { x: CLASSIC_W / 2 - 120, y: 110 }, { x: CLASSIC_W / 2 + 120, y: CLASSIC_H - 110 }];
  return [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    return { x: POLY_C + Math.cos(a) * 85, y: POLY_C + Math.sin(a) * 85 };
  });
};

// Portais: um par fixo; a bola entra num e sai do outro com a mesma velocidade
const portalSpots = (s) => {
  if (s.mode === 2) return [{ x: 190, y: 95 }, { x: CLASSIC_W - 190, y: CLASSIC_H - 95 }];
  return [{ x: POLY_C - 87, y: POLY_C - 50 }, { x: POLY_C + 87, y: POLY_C - 50 }]; // entre os bumpers
};

const checkPortals = (s, ball, r) => {
  if (!(s.effects.portals > 0)) return;
  if (s.tick - (ball.portalAt ?? -999) < PORTAL_COOLDOWN) return;
  const spots = portalSpots(s);
  const k = spots.findIndex((p) => Math.hypot(ball.x - p.x, ball.y - p.y) < PORTAL_R);
  if (k < 0) return;
  const out = spots[1 - k];
  const sp = Math.hypot(ball.dx, ball.dy) || 1;
  ball.x = out.x + (ball.dx / sp) * (PORTAL_R + r + 2);
  ball.y = out.y + (ball.dy / sp) * (PORTAL_R + r + 2);
  ball.portalAt = s.tick;
  s.fx.push('swerve');
};

// Bola quica nos bumpers (mantém a velocidade, sai um pouco mais rápida)
const checkBumpers = (s, ball, r) => {
  if (!(s.effects.bumpers > 0)) return;
  bumperSpots(s).forEach((p) => {
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= r + BUMPER_R || d === 0) return;
    const n = { x: dx / d, y: dy / d };
    const vn = dot(ball.dx, ball.dy, n);
    if (vn < 0) {
      ball.dx -= 2 * vn * n.x;
      ball.dy -= 2 * vn * n.y;
      s.fx.push('wall');
    }
    ball.x = p.x + n.x * (r + BUMPER_R);
    ball.y = p.y + n.y * (r + BUMPER_R);
    ball.wallHits = (ball.wallHits || 0) + 1;
    keepHorizontalEnough(s, ball);
  });
};

// No clássico, não deixa a bola ficar vertical demais
const keepHorizontalEnough = (s, b) => {
  if (s.mode !== 2) return;
  const sp = Math.hypot(b.dx, b.dy);
  if (Math.abs(b.dx) < sp * 0.35) b.dx = Math.sign(b.dx || 1) * sp * 0.35;
};

// Ponto da face da raquete do jogador i, se a bola b estiver chegando ao gol dele (perto o bastante)
const magnetTarget = (s, i, b) => {
  if (s.mode === 2) {
    const p = i === 0 ? s.player1 : s.player2;
    const faceX = i === 0 ? p.x + PADDLE_W : p.x;
    const coming = i === 0 ? b.dx < 0 : b.dx > 0;
    if (!coming || Math.abs(b.x - faceX) > MAGNET_RANGE) return null;
    return { x: faceX, y: p.y + classicPaddleH(s, i) / 2 };
  }
  const g = polyGeometry(s.mode);
  const { A, u, n, L } = g.goals[i];
  if (dot(b.dx, b.dy, n) >= 0 || dot(b.x - A.x, b.y - A.y, n) > MAGNET_RANGE) return null;
  const along = s.paddles[i] * L;
  return { x: A.x + u.x * along + n.x * POLY_PADDLE_OFFSET, y: A.y + u.y * along + n.y * POLY_PADDLE_OFFSET };
};

// Puxa a direção da bola para um ponto, mantendo a velocidade
const pullToward = (b, x, y, force) => {
  const sp = Math.hypot(b.dx, b.dy);
  const gx = x - b.x;
  const gy = y - b.y;
  const gl = Math.hypot(gx, gy) || 1;
  b.dx += (gx / gl) * force;
  b.dy += (gy / gl) * force;
  const nl = Math.hypot(b.dx, b.dy) || 1;
  b.dx *= sp / nl;
  b.dy *= sp / nl;
};

const BOMB_BOOST = 1.7;
// Bola acelerando, caça ao líder, repulsão e órbita
const applyMorePowers = (s) => {
  const e = s.effects;
  if (!e.accel && !e.hunt && !e.repel && !e.orbit) return;
  const cap = (s.mode === 2 ? CLASSIC_MAX_SPEED : POLY_MAX_SPEED) * 1.3;
  const c = fieldCenter(s);
  let target = null;
  if (e.hunt) {
    if (s.mode === 2) target = { x: e.huntTarget === 0 ? 0 : CLASSIC_W, y: CLASSIC_H / 2 };
    else target = polyGeometry(s.mode).goals[e.huntTarget].mid;
  }
  s.balls.forEach((b) => {
    if (b.slow || b.held) return;
    if (e.accel) {
      const sp = Math.hypot(b.dx, b.dy) || 1;
      const next = Math.min(cap, sp * ACCEL_RATE);
      b.dx *= next / sp;
      b.dy *= next / sp;
    }
    if (target) pullToward(b, target.x, target.y, HUNT_PULL);
    if (e.repel) pullToward(b, c.x, c.y, -REPEL_PUSH);
    if (e.orbit) {
      const a = ORBIT_RATE * e.orbitDir;
      const dx = b.dx * Math.cos(a) - b.dy * Math.sin(a);
      b.dy = b.dx * Math.sin(a) + b.dy * Math.cos(a);
      b.dx = dx;
    }
    keepHorizontalEnough(s, b);
  });
};

// Paredes elásticas (acelera) e bola quadrada (quica torto)
const onWallBounce = (s, ball) => {
  const e = s.effects;
  if (e.square > 0) {
    const a = (Math.random() * 2 - 1) * SQUARE_JITTER;
    const dx = ball.dx * Math.cos(a) - ball.dy * Math.sin(a);
    ball.dy = ball.dx * Math.sin(a) + ball.dy * Math.cos(a);
    ball.dx = dx;
    keepHorizontalEnough(s, ball);
  }
  if (e.bouncy > 0) {
    const cap = (s.mode === 2 ? CLASSIC_MAX_SPEED : POLY_MAX_SPEED) * 1.3;
    const sp = Math.hypot(ball.dx, ball.dy) || 1;
    const next = Math.min(cap, sp * BOUNCY_BOOST);
    ball.dx *= next / sp;
    ball.dy *= next / sp;
  }
};

// Barreira: no clássico sobe e desce no meio; nos polígonos gira em volta do centro
const barrierSegment = (s) => {
  if (s.mode === 2) {
    const y = CLASSIC_H / 2 + Math.sin(s.tick / 40) * 110;
    return { a: { x: CLASSIC_W / 2, y: y - BARRIER_HALF }, b: { x: CLASSIC_W / 2, y: y + BARRIER_HALF } };
  }
  const ang = s.tick / 50;
  const ux = Math.cos(ang) * BARRIER_HALF * 1.4;
  const uy = Math.sin(ang) * BARRIER_HALF * 1.4;
  return { a: { x: POLY_C - ux, y: POLY_C - uy }, b: { x: POLY_C + ux, y: POLY_C + uy } };
};

const checkBarrier = (s, ball, r) => {
  if (!(s.effects.barrier > 0)) return;
  const { a, b } = barrierSegment(s);
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const t = clamp(((ball.x - a.x) * vx + (ball.y - a.y) * vy) / (vx * vx + vy * vy), 0, 1);
  const px = a.x + vx * t;
  const py = a.y + vy * t;
  const d = Math.hypot(ball.x - px, ball.y - py);
  const min = r + BARRIER_THICK;
  if (d >= min || d === 0) return;
  const n = { x: (ball.x - px) / d, y: (ball.y - py) / d };
  const vn = dot(ball.dx, ball.dy, n);
  if (vn < 0) {
    ball.dx -= 2 * vn * n.x;
    ball.dy -= 2 * vn * n.y;
    ball.wallHits = (ball.wallHits || 0) + 1;
    s.fx.push('wall');
    keepHorizontalEnough(s, ball);
  }
  ball.x = px + n.x * min;
  ball.y = py + n.y * min;
};

// Bolas falsas: só quicam por tudo e somem; não fazem gol nem pegam balões
const stepDecoys = (s) => {
  if (!s.decoys || !s.decoys.length) return;
  const r = BALL_R;
  if (s.mode === 2) {
    s.decoys.forEach((d) => {
      d.x += d.dx;
      d.y += d.dy;
      if ((d.y < r && d.dy < 0) || (d.y > CLASSIC_H - r && d.dy > 0)) d.dy = -d.dy;
      if ((d.x < r && d.dx < 0) || (d.x > CLASSIC_W - r && d.dx > 0)) d.dx = -d.dx;
    });
    return;
  }
  const g = polyGeometry(s.mode);
  const sides = [...g.goals, ...g.walls];
  s.decoys.forEach((d) => {
    d.x += d.dx;
    d.y += d.dy;
    sides.forEach(({ A, n }) => {
      const dist = dot(d.x - A.x, d.y - A.y, n);
      if (dist < POLY_PADDLE_OFFSET && dot(d.dx, d.dy, n) < 0) reflectOn(d, n, dist, POLY_PADDLE_OFFSET);
    });
  });
};

const explodeBomb = (s) => {
  if (!s.boom) return;
  s.boom = false;
  const cap = s.mode === 2 ? CLASSIC_MAX_SPEED * 1.4 : POLY_MAX_SPEED * 1.4;
  s.balls.forEach((b) => {
    randomizeDirection(s, b);
    const sp = Math.hypot(b.dx, b.dy) || 1;
    const next = Math.min(cap, sp * BOMB_BOOST);
    b.dx *= next / sp;
    b.dy *= next / sp;
    b.wallHits = 0;
  });
  s.fx.push('snipe');
};

// Efeito (curva), buraco negro, bola bêbada e ímã mudam a direção da bola, mantendo a velocidade
const applyBending = (s) => {
  const { stacks, dir } = s.effects.curve;
  const gravity = s.effects.gravity > 0;
  const drunk = s.effects.drunk > 0;
  const magnets = s.effects.magnet.map((f, i) => (f > 0 ? i : -1)).filter((i) => i >= 0);
  const wind = s.effects.wind.frames > 0 ? s.effects.wind.angle : null;
  if (!stacks && !gravity && !drunk && !magnets.length && wind === null) return;
  const c = fieldCenter(s);
  s.balls.forEach((b, k) => {
    if (b.slow || b.held) return;
    if (stacks) {
      const a = CURVE_RATE * stacks * dir;
      const dx = b.dx * Math.cos(a) - b.dy * Math.sin(a);
      b.dy = b.dx * Math.sin(a) + b.dy * Math.cos(a);
      b.dx = dx;
    }
    if (gravity) pullToward(b, c.x, c.y, GRAVITY_PULL);
    if (drunk) {
      // balança de um lado para o outro, como quem saiu da festa
      const a = Math.sin(s.tick / 9 + k * 2) * DRUNK_SWAY;
      const dx = b.dx * Math.cos(a) - b.dy * Math.sin(a);
      b.dy = b.dx * Math.sin(a) + b.dy * Math.cos(a);
      b.dx = dx;
    }
    magnets.forEach((i) => {
      const p = magnetTarget(s, i, b);
      if (p) pullToward(b, p.x, p.y, MAGNET_PULL);
    });
    if (wind !== null) pullToward(b, b.x + Math.cos(wind) * 100, b.y + Math.sin(wind) * 100, WIND_FORCE);
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
  const next = s.effects.invert[i] > 0 ? flipInput(input, s.mode) : { ...input };
  next.ice = s.effects.ice[i] > 0;
  next.shake = s.effects.shake[i] > 0;
  next.speed = (s.effects.turbo[i] > 0 ? TURBO_MUL : 1) * (s.effects.sloth[i] > 0 ? SLOTH_MUL : 1);
  return next;
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
  // Fantasma: some por completo e só aparece num piscar rápido de vez em quando
  if (s.effects.ghost > 0) {
    if (s.tick % 50 >= 6) return;
    ctx.globalAlpha = 0.9;
  }
  const fast = s.effects.speed.level > 0;
  ctx.shadowColor = fast ? '#ff4757' : color;
  ctx.shadowBlur = fast ? 20 : 12;
  ctx.fillStyle = color;
  if (s.effects.square > 0) {
    // Bola quadrada, girando
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(s.tick / 8);
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
};

const drawDecoys = (ctx, s) => {
  if (!s.decoys || !s.decoys.length) return;
  const lt = s.balls[0]?.lt ?? null;
  s.decoys.forEach((d) => drawBall(ctx, s, { x: d.x, y: d.y, lt }));
};

const drawBarrier = (ctx, s) => {
  if (!(s.effects.barrier > 0)) return;
  const { a, b } = barrierSegment(s);
  ctx.save();
  ctx.globalAlpha = s.effects.barrier < 2 * FPS && Math.floor(s.effects.barrier / 8) % 2 === 0 ? 0.4 : 1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffb142';
  ctx.shadowColor = '#ffb142';
  ctx.shadowBlur = 12;
  ctx.lineWidth = BARRIER_THICK * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
};

// Repulsão: ondas saindo do centro
const drawRepel = (ctx, s, x, y) => {
  if (!(s.effects.repel > 0)) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(24,220,255,0.45)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const rad = ((s.tick * 1.5 + k * 30) % 90) + 6;
    ctx.globalAlpha = 1 - rad / 96;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
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

// Neblina: esconde a bola no meio da quadra
const drawFog = (ctx, s, cx, cy, w, h, round) => {
  if (!(s.effects.fog > 0)) return;
  const a = 0.94 * Math.min(1, s.effects.fog / 30); // some devagar no fim
  const fog = (alpha) => `rgba(190,200,205,${alpha})`;
  if (round) {
    const grad = ctx.createRadialGradient(cx, cy, w * 0.35, cx, cy, w);
    grad.addColorStop(0, fog(a));
    grad.addColorStop(1, fog(0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, w, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const grad = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    grad.addColorStop(0, fog(0));
    grad.addColorStop(0.3, fog(a));
    grad.addColorStop(0.7, fog(a));
    grad.addColorStop(1, fog(0));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - w, cy - h / 2, 2 * w, h);
  }
};

const drawPortals = (ctx, s) => {
  if (!(s.effects.portals > 0)) return;
  const fading = s.effects.portals < 2 * FPS && Math.floor(s.effects.portals / 8) % 2 === 0;
  portalSpots(s).forEach((p, k) => {
    const color = k === 0 ? '#ff9f43' : '#4dabf7';
    ctx.save();
    ctx.globalAlpha = fading ? 0.4 : 1;
    ctx.translate(p.x, p.y);
    ctx.rotate((s.tick / 12) * (k === 0 ? 1 : -1));
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, PORTAL_R);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(0.7, color);
    grad.addColorStop(1, 'rgba(255,255,255,0.2)');
    ctx.fillStyle = grad;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, PORTAL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, PORTAL_R - 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  });
};

const paddleHidden = (s, i) => s.effects.hidden[i] > 0 && s.tick % 50 >= 5;

const drawBumpers = (ctx, s) => {
  if (!(s.effects.bumpers > 0)) return;
  const fading = s.effects.bumpers < 2 * FPS && Math.floor(s.effects.bumpers / 8) % 2 === 0;
  bumperSpots(s).forEach((p, k) => {
    const pulse = 1 + Math.sin(s.tick / 7 + k) * 0.06;
    ctx.globalAlpha = fading ? 0.4 : 1;
    const grad = ctx.createRadialGradient(p.x - 6, p.y - 6, 2, p.x, p.y, BUMPER_R * pulse);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#fd9644');
    grad.addColorStop(1, '#c0392b');
    ctx.shadowColor = '#fd9644';
    ctx.shadowBlur = 14;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BUMPER_R * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
};

// Ventania: riscos atravessando a quadra na direção do vento
const drawWind = (ctx, s, w, h) => {
  if (!(s.effects.wind.frames > 0)) return;
  const { angle } = s.effects.wind;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  ctx.save();
  ctx.strokeStyle = 'rgba(200,214,229,0.35)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    // posição pseudoaleatória fixa por risco, andando com o tempo
    const along = ((s.tick * 4 + k * 173) % (w + h)) - h / 2;
    const across = ((k * 97) % h) - h / 2;
    const x = w / 2 + cos * (along - w / 2) - sin * across;
    const y = h / 2 + sin * (along - w / 2) + cos * across;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - cos * 26, y - sin * 26);
    ctx.stroke();
  }
  ctx.restore();
};

// Apagão: tudo escuro, só com luz em volta de cada raquete
const drawBlackout = (ctx, s, size, lights) => {
  if (!(s.effects.blackout > 0)) return;
  const a = 0.95 * Math.min(1, s.effects.blackout / 30); // volta a luz devagar no fim
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath();
  ctx.rect(-size, -size, size * 3, size * 3);
  lights.forEach((p) => {
    ctx.moveTo(p.x + LIGHT_R, p.y);
    ctx.arc(p.x, p.y, LIGHT_R, 0, Math.PI * 2, true);
  });
  ctx.fill('evenodd');
  ctx.restore();
};

// Bola parada no ar: anel pulsando em volta
// Bomba: anel vermelho que pisca cada vez mais rápido
const drawFuse = (ctx, s, ball) => {
  if (!(s.effects.bomb > 0) || s.effects.ghost > 0) return;
  const rate = s.effects.bomb > 2 * FPS ? 14 : s.effects.bomb > FPS ? 7 : 3;
  if (Math.floor(s.tick / rate) % 2) return;
  ctx.save();
  ctx.strokeStyle = '#ff3838';
  ctx.shadowColor = '#ff3838';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballRadius(s) + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawHoverRing = (ctx, s, ball) => {
  if (!(s.effects.hover > 0) || s.effects.ghost > 0) return;
  ctx.strokeStyle = 'rgba(129,236,236,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballRadius(s) + 6 + Math.sin(s.tick / 4) * 3, 0, Math.PI * 2);
  ctx.stroke();
};

// Raquete com ímã (vermelho), tiro certeiro carregado (verde) ou turbo (amarelo) brilha
const powerGlow = (ctx, s, i, draw) => {
  const color = s.effects.magnet[i] > 0 ? '#ff4d4d' : s.effects.snipe[i] ? '#2ee6a6' : s.effects.turbo[i] > 0 ? '#ffeaa7' : null;
  if (!color) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + Math.sin(s.tick / 5) * 5;
  ctx.lineWidth = 2.5;
  draw();
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
  balloons: [],
  decoys: [],
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
  let move = 0;
  if (!input.frozen) {
    const speed = PADDLE_SPEED * (input.speed || 1);
    if (input.target !== null && input.target !== undefined) {
      const max = speed * (input.bot ? input.botSpeed || 0.8 : 1.5);
      move = clamp(input.target - (paddle.y + h / 2), -max, max);
    } else {
      if (input.up) move -= speed;
      if (input.down) move += speed;
    }
  }
  // Escorregando: a raquete demora para acelerar e para frear
  paddle.v = input.ice ? (paddle.v || 0) * ICE_KEEP + move * (1 - ICE_KEEP) : move;
  const jitter = input.shake ? (Math.random() - 0.5) * SHAKE_PX : 0;
  const y = clamp(paddle.y + paddle.v + jitter, 0, CLASSIC_H - h);
  if (y !== paddle.y + paddle.v + jitter) paddle.v = 0;
  paddle.y = y;
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
  if (ball.held) {
    // Grudada na raquete de mel: acompanha a raquete e depois sai
    const p = ball.held.i === 0 ? s.player1 : s.player2;
    const h = classicPaddleH(s, ball.held.i);
    ball.x = ball.held.i === 0 ? p.x + PADDLE_W + r : p.x - r;
    ball.y = p.y + clamp(ball.held.off, 0, h);
    ball.held.frames -= 1;
    if (ball.held.frames <= 0) ball.held = null;
    return null;
  }
  const steps = substepsFor(ball, mul);
  const paddles = [[s.player1, 1, 0], [s.player2, -1, 1]];

  for (let i = 0; i < steps; i++) {
    const v = stepVector(ball, mul, steps);
    ball.x += v.x;
    ball.y += v.y;

    if (ball.y - r <= 0 && ball.dy < 0) {
      ball.y = r;
      ball.dy = -ball.dy;
      onWallBounce(s, ball);
      s.fx.push('wall');
    } else if (ball.y + r >= CLASSIC_H && ball.dy > 0) {
      ball.y = CLASSIC_H - r;
      ball.dy = -ball.dy;
      onWallBounce(s, ball);
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
        if (s.effects.honey[idx] > 0) ball.held = { i: idx, frames: HONEY_HOLD, off: ball.y - paddle.y };
        if (s.effects.snipe[idx]) {
          // Tiro certeiro: rápido, no canto mais longe da raquete do adversário
          s.effects.snipe[idx] = false;
          const opp = idx === 0 ? s.player2 : s.player1;
          const oppCenter = opp.y + classicPaddleH(s, 1 - idx) / 2;
          const ty = oppCenter < CLASSIC_H / 2 ? CLASSIC_H - 25 : 25;
          const tx = idx === 0 ? CLASSIC_W : 0;
          const speed = Math.min(CLASSIC_MAX_SPEED * SNIPE_MAX, Math.max(BALL_SPEED, Math.hypot(ball.dx, ball.dy)) * SNIPE_BOOST);
          const dl = Math.hypot(tx - ball.x, ty - ball.y) || 1;
          ball.dx = ((tx - ball.x) / dl) * speed;
          ball.dy = ((ty - ball.y) / dl) * speed;
          s.fx.push('snipe');
        }
        onPaddleHit(s, spawnClassicBalloon);
        break;
      }
    }

    checkBalloon(s, ball, r);
    checkBumpers(s, ball, r);
    checkPortals(s, ball, r);
    checkBarrier(s, ball, r);

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
      const double = s.effects.double[scorer];
      s.scores[scorer] += double ? 2 : 1;
      resetPowers(s);
      // Saque vai para quem sofreu o gol
      s.balls = [serveClassic(scorer === 0 ? 1 : -1)];
      s.serveFrames = SERVE_DELAY_FRAMES;
      s.fx.push('goal');
      return { type: s.scores[scorer] >= s.winScore ? 'over' : 'point', scorer, conceded: 1 - scorer, double };
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
  // Bola parada no ar: as raquetes se mexem, a bola espera
  if (s.effects.hover > 0) {
    s.effects.hover -= 1;
    return null;
  }

  explodeBomb(s);
  stepDecoys(s);
  applyBending(s);
  applyMorePowers(s);
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
    if (paddleHidden(s, i)) return;
    const h = classicPaddleH(s, i);
    ctx.fillStyle = COLORS[i];
    ctx.fillRect(p.x, p.y, PADDLE_W, h);
    powerGlow(ctx, s, i, () => ctx.strokeRect(p.x - 3, p.y - 3, PADDLE_W + 6, h + 6));
    frostOutline(ctx, s, i, () => ctx.strokeRect(p.x - 2, p.y - 2, PADDLE_W + 4, h + 4));
  });

  drawBumpers(ctx, s);
  drawPortals(ctx, s);
  drawBarrier(ctx, s);
  drawRepel(ctx, s, s.mode === 2 ? CLASSIC_W / 2 : POLY_C, s.mode === 2 ? CLASSIC_H / 2 : POLY_C);

  s.balloons.forEach((b) => {
    const by = balloonY(s, b);
    balloonBody(ctx, b.x, by, b.type, b.age || 0);
    balloonIcon(ctx, b.x, by, b.type);
  });

  s.balls.forEach((ball) => {
    drawBall(ctx, s, ball);
    drawHoverRing(ctx, s, ball);
    drawFuse(ctx, s, ball);
  });
  drawDecoys(ctx, s);
  drawFog(ctx, s, CLASSIC_W / 2, CLASSIC_H / 2, 190, CLASSIC_H, false);
  drawWind(ctx, s, CLASSIC_W, CLASSIC_H);
  drawBlackout(ctx, s, CLASSIC_W, [s.player1, s.player2].map((p, i) => ({ x: p.x + PADDLE_W / 2, y: p.y + classicPaddleH(s, i) / 2 })));
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
  // a partir de 4 jogadores sobra margem para os nomes nas laterais (o de 4 é um pouco maior)
  const R = n === 3 ? 285 : n === 4 ? 255 : 235;
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
  balloons: [],
  decoys: [],
  hits: 0,
  tick: 0,
  serveFrames: 0,
  fx: [],
  pw: []
});

// Esquerda/direita na tela de cada jogador (gol embaixo): esquerda aumenta t
const movePolyPaddle = (s, g, i, input = {}) => {
  const half = polyPaddleLen(s, g, i) / 2 / g.goals[i].L;
  let move = 0;
  if (!input.frozen) {
    const speed = g.paddleSpeed * (input.speed || 1);
    if (input.target !== null && input.target !== undefined) {
      const max = speed * (input.bot ? input.botSpeed || 0.8 : 1.5);
      move = clamp(input.target - s.paddles[i], -max, max);
    } else {
      if (input.left) move += speed;
      if (input.right) move -= speed;
    }
  }
  if (!s.pvel) s.pvel = filled(g.n, () => 0);
  // Escorregando: a raquete demora para acelerar e para frear
  s.pvel[i] = input.ice ? s.pvel[i] * ICE_KEEP + move * (1 - ICE_KEEP) : move;
  const jitter = input.shake ? ((Math.random() - 0.5) * SHAKE_PX) / g.goals[i].L : 0;
  const t = clamp(s.paddles[i] + s.pvel[i] + jitter, half, 1 - half);
  if (t !== s.paddles[i] + s.pvel[i] + jitter) s.pvel[i] = 0;
  s.paddles[i] = t;
};

const reflectOn = (ball, n, d, r) => {
  const vn = dot(ball.dx, ball.dy, n);
  ball.dx -= 2 * vn * n.x;
  ball.dy -= 2 * vn * n.y;
  ball.x += n.x * (r - d);
  ball.y += n.y * (r - d);
};

const dot = (ax, ay, b) => ax * b.x + ay * b.y;

// Manda a bola para o ponto t (0..1) do gol j, com a velocidade dada
const aimAtGoal = (g, ball, j, t, speed) => {
  const { A, u, L } = g.goals[j];
  const tx = A.x + u.x * t * L;
  const ty = A.y + u.y * t * L;
  const dl = Math.hypot(tx - ball.x, ty - ball.y) || 1;
  ball.dx = ((tx - ball.x) / dl) * speed;
  ball.dy = ((ty - ball.y) / dl) * speed;
};

// Conta as trocas seguidas entre as mesmas duas raquetes (a ordem não importa; a mesma raquete duas vezes também conta)
const countRally = (ball, prev, i) => {
  const key = prev === null || prev === undefined ? null : [prev, i].sort().join('-');
  if (key && key === ball.pair) ball.rally += 1;
  else {
    ball.pair = key;
    ball.rally = key ? 1 : 0;
  }
  return ball.rally;
};

const movePolyBall = (s, g, ball, r, mul) => {
  if (ball.held) {
    // Grudada na raquete de mel: acompanha a raquete e depois sai
    const { A, u, n, L } = g.goals[ball.held.i];
    const len = polyPaddleLen(s, g, ball.held.i);
    const c = s.paddles[ball.held.i] * L;
    const along = clamp(c + ball.held.off, c - len / 2, c + len / 2);
    ball.x = A.x + u.x * along + n.x * (POLY_PADDLE_OFFSET + r);
    ball.y = A.y + u.y * along + n.y * (POLY_PADDLE_OFFSET + r);
    ball.held.frames -= 1;
    if (ball.held.frames <= 0) ball.held = null;
    return null;
  }
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
      const prev = ball.lt;
      ball.lt = i;
      ball.wallHits = 0;
      s.fx.push('hit');
      if (s.effects.honey[i] > 0) ball.held = { i, frames: HONEY_HOLD, off: s0 - c };
      const others = (exclude) => Array.from({ length: g.n }, (_, j) => j).filter((j) => !exclude.includes(j));
      if (s.effects.snipe[i]) {
        // Tiro certeiro: rápido, no canto do gol de um adversário, longe da raquete dele
        s.effects.snipe[i] = false;
        const opps = others([i]);
        const j = opps[Math.floor(Math.random() * opps.length)];
        aimAtGoal(g, ball, j, s.paddles[j] < 0.5 ? 0.88 : 0.12, Math.min(POLY_MAX_SPEED * SNIPE_MAX, speed * SNIPE_BOOST));
        ball.pair = null;
        ball.rally = 0;
        s.fx.push('snipe');
      } else if (countRally(ball, prev, i) > MAX_RALLY) {
        // Duas raquetes presas trocando a bola (ex.: num canto): ela sai em direção ao gol de outro jogador
        const opts = others([prev, i]);
        const j = opts.length ? opts[Math.floor(Math.random() * opts.length)] : others([i])[0];
        aimAtGoal(g, ball, j, 0.2 + Math.random() * 0.6, speed);
        ball.pair = null;
        ball.rally = 0;
        s.fx.push('swerve');
      }
      onPaddleHit(s, spawn);
      break;
    }

    // Paredes
    for (const { A, n } of g.walls) {
      const d = dot(ball.x - A.x, ball.y - A.y, n);
      if (d < r && dot(ball.dx, ball.dy, n) < 0) {
        reflectOn(ball, n, d, r);
        ball.wallHits = (ball.wallHits || 0) + 1;
        onWallBounce(s, ball);
        s.fx.push('wall');
      }
    }

    checkBalloon(s, ball, r);
    checkBumpers(s, ball, r);
    checkPortals(s, ball, r);
    checkBarrier(s, ball, r);

    // Presa batendo só nas paredes: depois de 5 batidas seguidas sem tocar numa raquete, vai para um gol
    if ((ball.wallHits || 0) >= MAX_WALL_BOUNCES) {
      ball.wallHits = 0;
      const j = Math.floor(Math.random() * g.n);
      aimAtGoal(g, ball, j, 0.2 + Math.random() * 0.6, Math.max(SERVE_SPEED, Math.hypot(ball.dx, ball.dy)));
      s.fx.push('swerve');
    }

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
      const double = scorer !== null && scorer !== undefined && s.effects.double[scorer];
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

      s.scores[scorer] += double ? 2 : 1;
      s.fx.push('goal');
      s.balls = [servePolyBall(g, i)];
      return { type: s.scores[scorer] >= s.winScore ? 'over' : 'point', scorer, conceded: i, double };
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
  // Bola parada no ar: as raquetes se mexem, a bola espera
  if (s.effects.hover > 0) {
    s.effects.hover -= 1;
    return null;
  }

  explodeBomb(s);
  stepDecoys(s);
  applyBending(s);
  applyMorePowers(s);
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
    if (paddleHidden(s, i)) return;
    const corners = [pt(s0, d0), pt(s1, d0), pt(s1, d1), pt(s0, d1)];
    const path = () => {
      ctx.beginPath();
      corners.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };
    ctx.fillStyle = COLORS[i];
    path();
    ctx.fill();
    powerGlow(ctx, s, i, () => {
      path();
      ctx.stroke();
    });
    frostOutline(ctx, s, i, () => {
      path();
      ctx.stroke();
    });
  });

  drawBumpers(ctx, s);
  drawPortals(ctx, s);
  drawBarrier(ctx, s);
  drawRepel(ctx, s, s.mode === 2 ? CLASSIC_W / 2 : POLY_C, s.mode === 2 ? CLASSIC_H / 2 : POLY_C);

  // Balões (a posição gira com o campo; são desenhados depois, sempre de pé)
  const balloonsOnScreen = s.balloons.map((b) => ({ b, p: toScreen({ x: b.x, y: balloonY(s, b) }, angle) }));

  // Bolas na cor de quem tocou por último
  s.balls.forEach((ball) => {
    drawBall(ctx, s, ball);
    drawHoverRing(ctx, s, ball);
    drawFuse(ctx, s, ball);
  });
  drawDecoys(ctx, s);
  drawFog(ctx, s, POLY_C, POLY_C, g.R * 0.6, 0, true);
  drawWind(ctx, s, POLY_SIZE, POLY_SIZE);
  drawBlackout(ctx, s, POLY_SIZE, g.goals.map(({ A, u, n, L }, i) => ({
    x: A.x + u.x * s.paddles[i] * L + n.x * POLY_PADDLE_OFFSET,
    y: A.y + u.y * s.paddles[i] * L + n.y * POLY_PADDLE_OFFSET
  })));

  ctx.restore();

  balloonsOnScreen.forEach(({ b, p }) => {
    balloonBody(ctx, p.x, p.y, b.type, b.age || 0);
    balloonIcon(ctx, p.x, p.y, b.type);
  });

  // Nomes e placar de cada gol (texto sempre na horizontal)
  ctx.textBaseline = 'middle';
  g.goals.forEach(({ mid, n }, i) => {
    const p = toScreen(mid, angle);
    const raw = labels[i] || `Jogador ${i + 1}`;
    const max = g.n === 4 ? 10 : g.n < 4 ? 12 : 9; // no de 4 o campo é maior e sobra menos espaço nas laterais
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
const drawField = (ctx, state, viewIndex, labels) =>
  state.mode >= 3 ? drawPoly(ctx, state, viewIndex, labels) : drawClassic(ctx, state);

export const drawGame = (ctx, state, viewIndex, labels) => {
  const e = state.effects;
  const tilt = (e.upside > 0 ? Math.PI : 0) + (e.dizzy > 0 ? Math.sin(state.tick / 18) * 0.22 : 0);
  if (!tilt) {
    drawField(ctx, state, viewIndex, labels);
    return;
  }
  const { w, h } = canvasSize(state.mode);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);
  if (e.dizzy > 0) ctx.scale(0.86, 0.86);
  ctx.translate(-w / 2, -h / 2);
  drawField(ctx, state, viewIndex, labels);
  ctx.restore();
};

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
  if (e.fog) chips.push({ key: 'fog', icon: '🌫️', text: `${secs(e.fog)}s`, color: POWERS.fog.color });
  if (e.drunk) chips.push({ key: 'drunk', icon: '🥴', text: `${secs(e.drunk)}s`, color: POWERS.drunk.color });
  if (e.bumpers) chips.push({ key: 'bumpers', icon: '🎱', text: `${secs(e.bumpers)}s`, color: POWERS.bumpers.color });
  if (e.tiny) chips.push({ key: 'tiny', icon: '🔹', text: `${secs(e.tiny)}s`, color: POWERS.tiny.color });
  if (e.wind.frames) chips.push({ key: 'wind', icon: '💨', text: `${secs(e.wind.frames)}s`, color: POWERS.wind.color });
  if (e.blackout) chips.push({ key: 'blackout', icon: '🔦', text: `${secs(e.blackout)}s`, color: POWERS.blackout.color });
  if (e.portals) chips.push({ key: 'portals', icon: '🌌', text: `${secs(e.portals)}s`, color: POWERS.portals.color });
  if (e.hover) chips.push({ key: 'hover', icon: '⏸️', text: `${secs(e.hover)}s`, color: POWERS.hover.color });
  const perPlayer = (list, key, icon, withTime = true) => list.forEach((f, i) => {
    if (f) chips.push({ key: `${key}-${i}`, icon, text: withTime ? `${secs(f)}s` : '', color: COLORS[i], owner: i });
  });
  perPlayer(e.grow.map((g) => (g.stacks ? g.frames : 0)), 'grow', '📏');
  perPlayer(e.shrink, 'shrink', '🤏');
  perPlayer(e.freeze, 'freeze', '❄️');
  perPlayer(e.invert, 'invert', '🔄');
  perPlayer(e.shield.map((v) => (v ? 1 : 0)), 'shield', '🛡️', false);
  perPlayer(e.magnet, 'magnet', '🧲');
  perPlayer(e.snipe.map((v) => (v ? 1 : 0)), 'snipe', '🎯', false);
  perPlayer(e.turbo, 'turbo', '🚀');
  perPlayer(e.sloth, 'sloth', '🐌');
  perPlayer(e.ice, 'ice', '🧊');
  perPlayer(e.hidden, 'hidden', '🫥');
  perPlayer(e.shake, 'shake', '📳');
  perPlayer(e.honey, 'honey', '🍯');
  ['accel', 'square', 'pulse', 'hunt', 'dizzy', 'upside', 'barrier', 'orbit', 'bouncy', 'repel', 'decoys'].forEach((k) => {
    if (e[k]) chips.push({ key: k, icon: POWERS[k].icon, text: `${secs(e[k])}s`, color: POWERS[k].color });
  });
  if (e.bomb) chips.push({ key: 'bomb', icon: '💣', text: `${secs(e.bomb)}s`, color: POWERS.bomb.color });
  perPlayer(e.double.map((v) => (v ? 1 : 0)), 'double', '💰', false);
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
      sh: e.shield.map((v) => (v ? 1 : 0)),
      fg: secs(e.fog),
      dk: secs(e.drunk),
      mg: e.magnet.map(secs),
      sn: e.snipe.map((v) => (v ? 1 : 0)),
      tb: e.turbo.map(secs),
      bm: secs(e.bumpers),
      hv: e.hover, // em quadros: dura pouco mais de 1 s
      tn: secs(e.tiny),
      wd: [secs(e.wind.frames), Math.round(e.wind.angle * 100) / 100],
      bo: e.blackout, // em quadros: a luz volta devagar no fim
      sl: e.sloth.map(secs),
      db: e.double.map((v) => (v ? 1 : 0)),
      pt: secs(e.portals),
      ic: e.ice.map(secs),
      bb: e.bomb, // em quadros: o pavio pisca cada vez mais rápido
      hd: e.hidden.map(secs),
      // em quadros (alguns efeitos animam pelo tempo restante)
      x2: [e.accel, e.square, e.pulse, e.hunt, e.dizzy, e.upside, e.barrier, e.orbit, e.bouncy, e.repel, e.decoys],
      sk2: e.shake.map(secs),
      hn: e.honey.map(secs)
    },
    dc: (s.decoys || []).map((d) => [round1(d.x), round1(d.y)]),
    bl: s.balloons.map((b) => [round1(b.x), round1(balloonY(s, b)), POWER_TYPES.indexOf(b.type), b.age])
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
      shield: e.sh.map(Boolean),
      fog: (e.fg || 0) * FPS,
      drunk: (e.dk || 0) * FPS,
      magnet: arr(e.mg),
      snipe: (e.sn || filled(n, () => 0)).map(Boolean),
      turbo: arr(e.tb),
      bumpers: (e.bm || 0) * FPS,
      hover: e.hv || 0,
      tiny: (e.tn || 0) * FPS,
      wind: { frames: (e.wd?.[0] || 0) * FPS, angle: e.wd?.[1] || 0 },
      blackout: e.bo || 0,
      sloth: arr(e.sl),
      double: (e.db || filled(n, () => 0)).map(Boolean),
      portals: (e.pt || 0) * FPS,
      ice: arr(e.ic),
      bomb: e.bb || 0,
      hidden: arr(e.hd),
      shake: arr(e.sk2),
      honey: arr(e.hn),
      huntTarget: 0,
      orbitDir: 1
    };
    const x2 = e.x2 || [];
    ['accel', 'square', 'pulse', 'hunt', 'dizzy', 'upside', 'barrier', 'orbit', 'bouncy', 'repel', 'decoys'].forEach((k, idx) => {
      s.effects[k] = x2[idx] || 0;
    });
  }
  s.decoys = (msg.dc || []).map(([x, y]) => ({ x, y, dx: 0, dy: 0 }));
  s.balloons = (msg.bl || []).map(([x, y, type, age]) => ({ x, y, type: POWER_TYPES[type], age, fixed: true }));
  if (s.mode >= 3 && msg.q) s.paddles = msg.q;
  if (s.mode === 2) {
    s.player1.y = msg.a;
    s.player2.y = msg.b;
  }
  const changed = msg.p.some((v, i) => v !== s.scores[i]);
  if (changed) s.scores = [...msg.p];
  return changed;
};
