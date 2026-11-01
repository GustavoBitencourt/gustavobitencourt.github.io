import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ═══════════════════════════════════════
   URUBUS INIMIGOS (IA)
   Ciclo de vida: chegam de longe → rondam a cegonha → atacam de vez
   em quando (rasante, bicada no ar ou pousam e bicam no chão) → às
   vezes vão embora. 1º tiro = tranco, 2º tiro = morte.

   Convenção do modelo: origem do objeto no chão sob o urubu. No Voo o
   corpo fica ~1,9 acima da origem; nas mortes o clip já leva o corpo
   até o chão, então o código só faz o objeto cair até y = 0.
═══════════════════════════════════════ */
export const VULTURE_CONFIG = {
  MAX_VULTURES: 3,          // cada urubu tem ~390 mil vértices: suba com cuidado
  MAX_ATTACKERS: 2,         // quantos podem atacar ao mesmo tempo
  FIRST_SPAWN: 2,           // s até o primeiro aparecer
  SPAWN_MIN: 4,             // s entre aparições
  SPAWN_MAX: 9,
  SPAWN_RADIUS: 34,
  SPAWN_HEIGHT: 8,
  DESPAWN_RADIUS: 46,
  FLY_SPEED: 5.5,
  DIVE_SPEED: 13,
  WALK_SPEED: 1.4,
  CIRCLE_RADIUS_MIN: 5,
  CIRCLE_RADIUS_MAX: 9,
  CIRCLE_ALT_MIN: 1.5,      // altura da origem acima dos pés da cegonha
  CIRCLE_ALT_MAX: 4,
  CIRCLE_TIME_MIN: 3,
  CIRCLE_TIME_MAX: 7,
  LEAVE_CHANCE: 0.22,       // chance de ir embora a cada decisão (após já ter atacado)
  MAX_STAY: 45,             // s; depois disso sempre vai embora
  HIT_RADIUS: 0.8,          // esfera de acerto em volta do osso Corpo
  HITS_TO_KILL: 2,
  CORPSE_TIME: 10,          // s caído antes de afundar no chão
  CAST_SHADOWS: true,
};
const CFG = VULTURE_CONFIG;

const LOOPING = new Set(['Voo', 'Planar', 'Parado', 'Caminhada']);
const ATTACK_STATES = new Set([
  'dive_setup', 'dive', 'hover_approach', 'hover_peck',
  'land_approach', 'landing', 'walk', 'ground_peck', 'ground_idle', 'takeoff',
]);
const GROUND_ANIMS = new Set(['Parado', 'Caminhada', 'Bicada_Chao', 'Atingido_Chao']);
const DEATH_BY_ANIM = {
  Ataque: 'Morte_Ataque',
  Bicada_Ar: 'Morte_Bicada_Ar',
  Bicada_Chao: 'Morte_Bicada_Chao',
  Parado: 'Morte_Chao',
  Caminhada: 'Morte_Chao',
  Atingido_Chao: 'Morte_Chao',
  // Voo, Planar, Pouso, Decolagem, Atingido_Voo → Morte_Voo
};

const rand = (a, b) => a + Math.random() * (b - a);

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Grounded = estados em que o urubu está com os pés no chão (colisão só no plano)
const GROUND_STATES = new Set(['landing', 'walk', 'ground_peck', 'ground_idle', 'takeoff']);
const BODY_RADIUS = 0.8;      // esfera do corpo para colidir com árvores/copas

/**
 * groundAt(x, z)              → altura do chão do mapa atual (sem mapa, y = 0)
 * collide(centro, raio, ant)  → empurra a esfera para fora dos obstáculos (opcional, ex.: pântano)
 * isFree(centro, raio)        → true se a esfera não está dentro de nenhum obstáculo (opcional)
 */
export function createVultureManager({
  scene, blood, onPlayerHit, onKill,
  groundAt = () => 0, collide = null, isFree = null,
}) {
  const vultures = [];
  let source = null;          // { model, clips, scale }
  let spawnTimer = CFG.FIRST_SPAWN;

  // Ajustes por fase (configure()): quantos urubus e quão rápidos
  const tuning = {
    maxVultures: CFG.MAX_VULTURES,
    maxAttackers: CFG.MAX_ATTACKERS,
    spawnMin: CFG.SPAWN_MIN,
    spawnMax: CFG.SPAWN_MAX,
    speed: 1,                 // multiplicador de velocidade de voo, rasante e caminhada
  };
  const flySpeed = () => CFG.FLY_SPEED * tuning.speed;
  const diveSpeed = () => CFG.DIVE_SPEED * tuning.speed;
  const walkSpeed = () => CFG.WALK_SPEED * Math.min(tuning.speed, 2);   // a pé não vale correr demais

  function configure(opts) {
    Object.assign(tuning, opts);
  }

  const _d = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _closest = new THREE.Vector3();
  const _seg = new THREE.Vector3();
  const _sphere = new THREE.Sphere();
  const _before = new THREE.Vector3();
  const _offset = new THREE.Vector3();
  const _center = new THREE.Vector3();
  const _prevCenter = new THREE.Vector3();
  const _centerBefore = new THREE.Vector3();

  /* ── Fonte do modelo (o urubu já carregado na seleção de personagem) ── */
  function setSource(model, clips) {
    source = { model, clips, scale: model.scale.x };
  }

  function hasSource() {
    return !!source;
  }

  /* ── Animação ── */
  function playAnim(v, key, fade = 0.25) {
    const next = v.actions[key];
    if (!next) return;
    if (v.current === next) {
      next.reset().play();            // reinicia (ex.: segunda bicada seguida)
    } else {
      next.reset().play();
      if (v.current && fade > 0) v.current.crossFadeTo(next, fade, false);
      else {
        if (v.current) v.current.stop();
        next.setEffectiveWeight(1);
      }
    }
    v.current = next;
    v.animKey = key;
    v.animTime = 0;
  }

  const animDone = (v, margin = 0.12) => v.animTime >= v.current.getClip().duration - margin;
  const crossed = (v, t, dt) => v.animTime >= t && v.animTime - dt < t;

  /* ── Movimento ── */
  function faceDir(v, x, z, dt, rate = 4) {
    if (x * x + z * z < 1e-6) return;
    v.root.rotation.y = lerpAngle(v.root.rotation.y, Math.atan2(x, z), Math.min(1, rate * dt));
  }

  function facePoint(v, p, dt, rate = 6) {
    faceDir(v, p.x - v.root.position.x, p.z - v.root.position.z, dt, rate);
  }

  // Anda/voa em direção ao alvo; devolve a distância que faltava
  function steer(v, target, speed, dt, turnRate = 4) {
    _d.subVectors(target, v.root.position);
    const dist = _d.length();
    if (dist > 1e-4) {
      v.root.position.addScaledVector(_d, Math.min(dist, speed * dt) / dist);
      faceDir(v, _d.x, _d.z, dt, turnRate);
    }
    return dist;
  }

  function horizontalDist(a, b) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  // Alterna batida de asas e planeio enquanto ronda/viaja
  function flyAnim(v, dt) {
    if (v.animKey !== 'Voo' && v.animKey !== 'Planar') playAnim(v, 'Voo', 0.3);
    v.glideTimer -= dt;
    if (v.glideTimer <= 0) {
      v.glideTimer = rand(2, 4.5);
      playAnim(v, v.animKey === 'Voo' && Math.random() < 0.55 ? 'Planar' : 'Voo', 0.5);
    }
  }

  function tryHitPlayer(v, ctx, range) {
    if (v.dealtHit) return;
    if (v.bodyPos.distanceTo(ctx.playerBody) < range) {
      v.dealtHit = true;
      if (onPlayerHit) onPlayerHit(v);
    }
  }

  /* ── Estados ── */
  function setState(v, state) {
    v.state = state;
    v.stateTime = 0;
  }

  function enterCircle(v, ctx) {
    setState(v, 'circle');
    v.circleAngle = Math.atan2(v.root.position.z - ctx.playerPos.z, v.root.position.x - ctx.playerPos.x);
    v.circleRadius = rand(CFG.CIRCLE_RADIUS_MIN, CFG.CIRCLE_RADIUS_MAX);
    v.circleAlt = rand(CFG.CIRCLE_ALT_MIN, CFG.CIRCLE_ALT_MAX);
    v.circleDir = Math.random() < 0.5 ? 1 : -1;
    v.circleDuration = rand(CFG.CIRCLE_TIME_MIN, CFG.CIRCLE_TIME_MAX);
  }

  function startLeave(v, ctx) {
    setState(v, 'leave');
    _d.subVectors(v.root.position, ctx.playerPos).setY(0);
    if (_d.lengthSq() < 1e-4) _d.set(1, 0, 0);
    _d.normalize();
    v.leaveDir = _d.clone();
  }

  function decide(v, ctx) {
    if (v.attacksDone > 0 && (Math.random() < CFG.LEAVE_CHANCE || v.age > CFG.MAX_STAY)) {
      startLeave(v, ctx);
      return;
    }
    const attackers = vultures.filter(o => ATTACK_STATES.has(o.state)).length;
    if (attackers >= tuning.maxAttackers || Math.random() < 0.2) {
      enterCircle(v, ctx);
      return;
    }

    const options = ['dive', 'hover'];
    if (!ctx.playerAirborne) options.push('ground', 'ground');
    const pick = options[Math.floor(Math.random() * options.length)];

    if (pick === 'dive') {
      // Toma distância antes do rasante, do lado em que já está
      setState(v, 'dive_setup');
      _d.subVectors(v.root.position, ctx.playerPos).setY(0);
      if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1);
      _d.normalize().multiplyScalar(9);
      v.target = new THREE.Vector3(ctx.playerPos.x + _d.x, ctx.playerPos.y + 1.5, ctx.playerPos.z + _d.z);
    } else if (pick === 'hover') {
      setState(v, 'hover_approach');
    } else {
      setState(v, 'land_approach');
      const a = Math.random() * Math.PI * 2;
      const lx = ctx.playerPos.x + Math.cos(a) * 3.2;
      const lz = ctx.playerPos.z + Math.sin(a) * 3.2;
      v.target = new THREE.Vector3(lx, groundAt(lx, lz), lz);
    }
  }

  /* ── Spawn / remoção ── */
  function spawn(ctx) {
    const model = SkeletonUtils.clone(source.model);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(source.scale);
    model.traverse(c => {
      if (c.isMesh) {
        c.castShadow = CFG.CAST_SHADOWS;
        c.receiveShadow = true;
        c.frustumCulled = false;
      }
    });

    const root = new THREE.Group();
    root.add(model);
    const a = Math.random() * Math.PI * 2;
    root.position.set(
      ctx.playerPos.x + Math.cos(a) * CFG.SPAWN_RADIUS,
      ctx.playerPos.y + CFG.SPAWN_HEIGHT,
      ctx.playerPos.z + Math.sin(a) * CFG.SPAWN_RADIUS,
    );
    if (isFree) {
      // Nunca nasce dentro de uma copa: sobe até achar espaço livre
      const centro = root.position.clone();
      centro.y += 1.9;
      for (let i = 0; i < 20 && !isFree(centro, BODY_RADIUS); i++) centro.y += 2;
      root.position.y = centro.y - 1.9;
    }
    scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    source.clips.forEach(clip => {
      const key = clip.name.replace(/^Urubu_/, '');
      const action = mixer.clipAction(clip);
      if (LOOPING.has(key)) {
        action.setLoop(THREE.LoopRepeat);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;   // morte: fica caído no último frame
      }
      actions[key] = action;
    });

    const v = {
      root, model, mixer, actions,
      current: null, animKey: null, animTime: 0,
      bodyBone: model.getObjectByName('Corpo'),
      bodyPos: new THREE.Vector3(),
      hp: CFG.HITS_TO_KILL,
      state: 'arrive', stateTime: 0, age: 0,
      glideTimer: rand(2, 4),
      attacksDone: 0,
      dealtHit: false,
      fallVel: 0,
    };
    // Ronda alvo já definida para a chegada
    v.circleAngle = a;
    v.circleRadius = rand(CFG.CIRCLE_RADIUS_MIN, CFG.CIRCLE_RADIUS_MAX);
    v.circleAlt = rand(CFG.CIRCLE_ALT_MIN, CFG.CIRCLE_ALT_MAX);
    v.circleDir = Math.random() < 0.5 ? 1 : -1;
    v.circleDuration = rand(CFG.CIRCLE_TIME_MIN, CFG.CIRCLE_TIME_MAX);

    playAnim(v, 'Voo', 0);
    vultures.push(v);
  }

  function remove(v) {
    const i = vultures.indexOf(v);
    if (i >= 0) vultures.splice(i, 1);
    v.mixer.stopAllAction();
    v.mixer.uncacheRoot(v.model);
    v.model.traverse(c => { if (c.isSkinnedMesh) c.skeleton.dispose(); });
    scene.remove(v.root);
  }

  function clear() {
    [...vultures].forEach(remove);
    spawnTimer = CFG.FIRST_SPAWN;
  }

  /* ── Dano ── (dano = quantos "tiros" vale: a investida da cegonha no voo vale 2 = mata) */
  function damage(v, point, dir, dano = 1) {
    blood.burst(point, dir, v.state === 'dead' ? 10 : 20);
    if (v.state === 'dying' || v.state === 'dead') return 'corpse';

    v.hp -= dano;
    if (v.hp <= 0) {
      die(v);
      return 'killed';
    }

    // Na decolagem/pouso o corpo está entre o chão e o ar: só sangra, sem tranco
    if (v.animKey === 'Decolagem' || v.animKey === 'Pouso') return 'hit';

    v.hitGrounded = GROUND_ANIMS.has(v.animKey);
    setState(v, 'hit');
    playAnim(v, v.hitGrounded ? 'Atingido_Chao' : 'Atingido_Voo', 0.1);
    return 'hit';
  }

  function die(v) {
    const deathKey = DEATH_BY_ANIM[v.animKey] || 'Morte_Voo';
    setState(v, 'dying');
    v.fallVel = 0;
    playAnim(v, deathKey, 0.1);
    if (onKill) onKill(v);
  }

  /* ── Mira / colisão de balas ── */
  function raycast(ray) {
    let best = null;
    for (const v of vultures) {
      if (v.state === 'dead') continue;
      _sphere.set(v.bodyPos, CFG.HIT_RADIUS);
      if (ray.intersectSphere(_sphere, _t)) {
        const dist = _t.distanceTo(ray.origin);
        if (!best || dist < best.distance) best = { vulture: v, point: _t.clone(), distance: dist };
      }
    }
    return best;
  }

  // Bala que andou de p0 até p1 neste frame: acertou algum urubu?
  function hitSegment(p0, p1) {
    _seg.subVectors(p1, p0);
    const lenSq = _seg.lengthSq();
    let best = null;
    for (const v of vultures) {
      const t = lenSq > 0 ? THREE.MathUtils.clamp(_d.subVectors(v.bodyPos, p0).dot(_seg) / lenSq, 0, 1) : 0;
      _closest.copy(p0).addScaledVector(_seg, t);
      if (_closest.distanceToSquared(v.bodyPos) <= CFG.HIT_RADIUS * CFG.HIT_RADIUS && (!best || t < best.t)) {
        best = { vulture: v, point: _closest.clone(), t };
      }
    }
    return best;
  }

  /* ── Bicada da cegonha (corpo a corpo) ── */
  const vivo = (v) => vultures.includes(v) && v.state !== 'dying' && v.state !== 'dead';

  // Urubu vivo mais perto da direção (horizontal) dir a partir de origem, dentro do alcance e do cone (cosseno)
  function alvoNaFrente(origem, dir, alcance, cosCone) {
    let best = null, nota = Infinity;
    for (const v of vultures) {
      if (!vivo(v)) continue;
      _d.subVectors(v.bodyPos, origem);
      const dist = _d.length();
      const h = Math.hypot(_d.x, _d.z);
      if (dist > alcance || h < 1e-4) continue;
      const cos = (_d.x * dir.x + _d.z * dir.z) / h;
      if (cos < cosCone) continue;
      const n = dist * (2 - cos);            // perto e bem na frente ganha
      if (n < nota) { nota = n; best = v; }
    }
    return best;
  }

  // O bico (segmento p0 -> p1) encostou em algum urubu vivo? raio = folga em volta do bico
  function hitMelee(p0, p1, raio = 0) {
    _seg.subVectors(p1, p0);
    const lenSq = _seg.lengthSq();
    const r = CFG.HIT_RADIUS + raio;
    let best = null;
    for (const v of vultures) {
      if (!vivo(v)) continue;
      const t = lenSq > 0 ? THREE.MathUtils.clamp(_d.subVectors(v.bodyPos, p0).dot(_seg) / lenSq, 0, 1) : 0;
      _closest.copy(p0).addScaledVector(_seg, t);
      const d2 = _closest.distanceToSquared(v.bodyPos);
      if (d2 <= r * r && (!best || d2 < best.d2)) best = { vulture: v, point: _closest.clone(), d2 };
    }
    return best;
  }

  /* ── Atualização por frame ── */
  function updateVulture(v, ctx, dt) {
    v.age += dt;
    v.stateTime += dt;
    v.animTime += dt;
    const pos = v.root.position;
    const P = ctx.playerPos;

    switch (v.state) {
      case 'arrive':
      case 'circle': {
        v.circleAngle += v.circleDir * (flySpeed() / v.circleRadius) * dt;
        _t.set(
          P.x + Math.cos(v.circleAngle) * v.circleRadius,
          P.y + v.circleAlt,
          P.z + Math.sin(v.circleAngle) * v.circleRadius,
        );
        const dist = steer(v, _t, flySpeed() * (v.state === 'arrive' ? 1.3 : 1.15), dt, 3);
        flyAnim(v, dt);
        if (v.state === 'arrive' && dist < 2) enterCircle(v, ctx);
        else if (v.state === 'circle' && v.stateTime > v.circleDuration) decide(v, ctx);
        break;
      }

      case 'dive_setup': {
        flyAnim(v, dt);
        if (steer(v, v.target, flySpeed() * 1.2, dt, 4) < 1.2 || v.stateTime > 6) {
          setState(v, 'dive');
          v.dealtHit = false;
          // Mira no corpo da cegonha (o corpo do urubu fica ~1,9 acima da origem)
          v.diveDir = new THREE.Vector3(P.x, P.y - 0.5, P.z).sub(pos).normalize();
          playAnim(v, 'Ataque', 0.15);
        }
        break;
      }

      case 'dive': {
        // Mesmo impulso do ataque do jogador: bote entre 0,25 s e 1,05 s do clip
        const t = v.animTime;
        const speed = (t >= 0.25 && t <= 1.05) ? diveSpeed() : 3 * tuning.speed;
        pos.addScaledVector(v.diveDir, speed * dt);
        // Passada a cegonha, não continua descendo: o corpo (~1,8 acima da origem) não raspa no chão
        pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) - 0.8);
        faceDir(v, v.diveDir.x, v.diveDir.z, dt, 10);
        tryHitPlayer(v, ctx, 1.8);
        if (animDone(v, 0.15)) {
          v.attacksDone++;
          playAnim(v, 'Voo', 0.2);
          enterCircle(v, ctx);
        }
        break;
      }

      case 'hover_approach': {
        flyAnim(v, dt);
        _d.subVectors(pos, P).setY(0);
        if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1);
        _d.normalize();
        _t.set(P.x + _d.x * 1.9, P.y + 0.4, P.z + _d.z * 1.9);
        steer(v, _t, flySpeed(), dt, 4);
        if (pos.distanceTo(_t) < 0.4 || v.stateTime > 8) {
          setState(v, 'hover_peck');
          v.pecksLeft = Math.floor(rand(1, 4));
          v.dealtHit = false;
          playAnim(v, 'Bicada_Ar', 0.15);
        }
        break;
      }

      case 'hover_peck': {
        // Paira acompanhando a cegonha, sempre de frente para ela
        _d.subVectors(pos, P).setY(0);
        if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1);
        _d.normalize();
        _t.set(P.x + _d.x * 1.9, P.y + 0.4, P.z + _d.z * 1.9);
        _seg.subVectors(_t, pos);
        pos.addScaledVector(_seg, Math.min(1, 3 * dt));
        facePoint(v, P, dt, 8);
        if (crossed(v, 0.45, dt)) tryHitPlayer(v, ctx, 2.8);
        if (animDone(v, 0.1)) {
          v.pecksLeft--;
          if (v.pecksLeft > 0) {
            v.dealtHit = false;
            playAnim(v, 'Bicada_Ar', 0.1);
          } else {
            v.attacksDone++;
            playAnim(v, 'Voo', 0.2);
            enterCircle(v, ctx);
          }
        }
        break;
      }

      case 'land_approach': {
        flyAnim(v, dt);
        // Desiste se a cegonha decolou no meio do caminho
        if (ctx.playerAirborne) { enterCircle(v, ctx); break; }
        if (steer(v, v.target, flySpeed(), dt, 4) < 0.3) {
          pos.y = groundAt(pos.x, pos.z);
          setState(v, 'landing');
          playAnim(v, 'Pouso', 0.2);
        }
        break;
      }

      case 'landing': {
        facePoint(v, P, dt, 3);
        if (animDone(v, 0.2)) {
          setState(v, 'walk');
          playAnim(v, 'Caminhada', 0.2);
        }
        break;
      }

      case 'walk': {
        const dist = horizontalDist(pos, P);
        if (ctx.playerAirborne || dist > 10 || v.stateTime > 7) {
          setState(v, 'takeoff');
          playAnim(v, 'Decolagem', 0.2);
          break;
        }
        if (dist > 1.5) {
          _t.set(P.x, pos.y, P.z);
          steer(v, _t, walkSpeed(), dt, 6);
          pos.y = groundAt(pos.x, pos.z);   // acompanha o relevo do terreno
        } else {
          setState(v, 'ground_peck');
          v.pecksLeft = Math.floor(rand(1, 3));
          v.dealtHit = false;
          playAnim(v, 'Bicada_Chao', 0.15);
        }
        break;
      }

      case 'ground_peck': {
        facePoint(v, P, dt, 8);
        if (crossed(v, 0.55, dt)) tryHitPlayer(v, ctx, 2.4);
        if (animDone(v, 0.1)) {
          v.pecksLeft--;
          if (v.pecksLeft > 0 && horizontalDist(pos, P) < 2) {
            v.dealtHit = false;
            playAnim(v, 'Bicada_Chao', 0.1);
          } else {
            v.attacksDone++;
            setState(v, 'ground_idle');
            v.idleTime = rand(0.6, 1.5);
            playAnim(v, 'Parado', 0.2);
          }
        }
        break;
      }

      case 'ground_idle': {
        facePoint(v, P, dt, 3);
        if (v.stateTime > v.idleTime || ctx.playerAirborne) {
          setState(v, 'takeoff');
          playAnim(v, 'Decolagem', 0.2);
        }
        break;
      }

      case 'takeoff': {
        // A subida do corpo até a altura de voo já está no clip
        if (animDone(v, 0.25)) {
          playAnim(v, 'Voo', 0.25);
          if (v.fleeAfterTakeoff) startLeave(v, ctx);
          else enterCircle(v, ctx);
          v.fleeAfterTakeoff = false;
        }
        break;
      }

      case 'hit': {
        // Tranco: recua um pouco no ar
        if (!v.hitGrounded) {
          _d.set(Math.sin(v.root.rotation.y), 0, Math.cos(v.root.rotation.y));
          pos.addScaledVector(_d, -1.2 * dt);
        }
        if (animDone(v, 0.1)) {
          // Ferido, metade das vezes foge
          const flee = Math.random() < 0.5;
          if (v.hitGrounded) {
            v.fleeAfterTakeoff = flee;
            setState(v, 'ground_idle');
            v.idleTime = 0.3;
            playAnim(v, 'Parado', 0.15);
          } else {
            playAnim(v, 'Voo', 0.15);
            if (flee) startLeave(v, ctx);
            else enterCircle(v, ctx);
          }
        }
        break;
      }

      case 'leave': {
        flyAnim(v, dt);
        _t.copy(P).addScaledVector(v.leaveDir, CFG.DESPAWN_RADIUS + 10);
        _t.y = P.y + 10;
        steer(v, _t, flySpeed() * 1.25, dt, 3);
        if (horizontalDist(pos, P) > CFG.DESPAWN_RADIUS) remove(v);
        break;
      }

      case 'dying': {
        // Para de se mover no plano; só cai até o chão (a pose da queda está no clip)
        const ground = groundAt(pos.x, pos.z);
        if (pos.y > ground) {
          v.fallVel -= 9.8 * dt;
          pos.y = Math.max(ground, pos.y + v.fallVel * dt);
        } else if (pos.y < ground) {
          pos.y = Math.min(ground, pos.y + 4 * dt);
        }
        if (pos.y === ground && animDone(v, 0)) {
          setState(v, 'dead');
          blood.pool(v.bodyPos, rand(0.6, 0.9));
        }
        break;
      }

      case 'dead': {
        // Depois de um tempo, afunda no chão e some
        if (v.stateTime > CFG.CORPSE_TIME) {
          pos.y -= 0.3 * dt;
          if (v.stateTime > CFG.CORPSE_TIME + 3) remove(v);
        }
        break;
      }
    }
  }

  /**
   * ctx = { playerPos: Vector3 (pés), playerBody: Vector3 (centro do corpo), playerAirborne: bool }
   */
  function update(delta, ctx) {
    if (!source) return;
    const dt = Math.min(delta, 0.05);

    spawnTimer -= dt;
    const alive = vultures.filter(v => v.state !== 'dead' && v.state !== 'dying').length;
    if (spawnTimer <= 0) {
      if (alive < tuning.maxVultures) spawn(ctx);
      spawnTimer = rand(tuning.spawnMin, tuning.spawnMax);
    }

    for (const v of [...vultures]) {
      v.mixer.update(dt);
      v.root.updateMatrixWorld(true);
      if (v.bodyBone) v.bodyBone.getWorldPosition(v.bodyPos);
      else v.bodyPos.copy(v.root.position).y += 1.5;
      _before.copy(v.root.position);
      updateVulture(v, ctx, dt);
      if (collide && vultures.includes(v)) collideVulture(v);
    }
  }

  // Esfera do corpo contra árvores/copas: o deslocamento da esfera move o urubu inteiro
  function collideVulture(v) {
    if (v.state === 'dying' || v.state === 'dead') return;
    _offset.subVectors(v.bodyPos, _before);                 // corpo em relação à origem (pose deste frame)
    _center.copy(v.root.position).add(_offset);
    _prevCenter.copy(_before).add(_offset);
    _centerBefore.copy(_center);
    collide(_center, BODY_RADIUS, _prevCenter);
    _center.sub(_centerBefore);
    if (GROUND_STATES.has(v.state) || (v.state === 'hit' && v.hitGrounded)) _center.y = 0;
    v.root.position.add(_center);
  }

  // Posições (pés) dos urubus perto do chão, para a vegetação se dobrar com eles
  function groundedPositions(out = []) {
    out.length = 0;
    for (const v of vultures) {
      const p = v.root.position;
      if (p.y - groundAt(p.x, p.z) < 0.5) out.push(p);
    }
    return out;
  }

  // Centro do corpo de cada urubu vivo ou caído (toque 3D na vegetação do pântano)
  function bodyPositions(out = []) {
    out.length = 0;
    for (const v of vultures) out.push(v.bodyPos);
    return out;
  }

  return {
    setSource, hasSource, configure, update, raycast, hitSegment, damage, clear,
    groundedPositions, bodyPositions, alvoNaFrente, hitMelee, vivo,
  };
}
