import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/*
  Dinossauros da mata: aparecem quando o Romanele sai 2 m da caverna, rugem, correm/pulam até ele,
  mordem ou dão rabada, e caem com uma única bastada. Não entram na caverna: se ele volta para
  dentro, ficam esperando na boca da caverna, rugindo. Também não saem da mata: depois que ele
  passa da saída (marcador SaidaMata) não vêm mais ondas e os que estavam atrás dele param na borda.

  Todos os GLBs têm os mesmos clipes: Parado, Andar, Correr, Pular, Rugir, Atacar, Atacar2,
  TomarDano, Cair, Cair2, CairTras. As locomoções ficam no lugar; quem move é o código.
*/

const CLIP_SPEED = { Andar: 1.25, Correr: 3.4, Pular: 2.2 };
const GRAVITY = 16;
const BODY_R = 0.45;          // raio do corpo (colisão com o cenário)
const DINO_GAP = 1.7;         // distância mínima entre dinos
const PLAYER_GAP = 1.25;      // distância mínima entre o dino e o Romanele
const CLUB_REACH = 2.4;       // alcance da bastada (centro a centro)
const CLUB_ARC = Math.cos(THREE.MathUtils.degToRad(70));
const CAVE_HALF_W = 7;        // meia largura da área da caverna
const OUTSIDE_MARGIN = 2;     // ele precisa sair 2 m da caverna

export const DINO_TYPES = {
  raptor: {
    file: 'dino_raptor_montaria.glb', label: 'Raptor',
    run: 3.7, hop: 2.4, walk: 1.4, bite: 1.75, gait: 'Correr', near: 'Pular',
  },
  trex: {
    file: 'dino_trex_montaria.glb', label: 'T-Rex',
    run: 3.0, hop: 2.2, walk: 1.3, bite: 1.8, gait: 'Correr', near: 'Andar',
  },
  inflavel: {
    file: 'dino_trex_inflavel.glb', label: 'T-Rex inflável',
    run: 2.8, hop: 2.3, walk: 1.25, bite: 1.45, gait: 'Pular', near: 'Andar',
  },
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createDinoManager({ scene, templates, caveMouth, exitZ = Infinity, onPlayerHit, onDown, onWave, onSound }) {
  const group = new THREE.Group();
  group.name = 'Dinos';
  scene.add(group);

  const boundaryZ = caveMouth.z + OUTSIDE_MARGIN;
  const dinos = [];
  let wave = 0;
  let nextWaveIn = 0;
  let active = false;       // a primeira onda já foi disparada
  let downs = 0;
  let lastSwingHit = -1;
  let invulnerable = 0;

  const tmp = new THREE.Vector3();
  const ray = new THREE.Ray();
  const down = new THREE.Vector3(0, -1, 0);

  const inCaveArea = (x, z) => z < boundaryZ && Math.abs(x - caveMouth.x) < CAVE_HALF_W;
  const EXIT_STOP = 3;         // param a 3 m antes da saída da mata
  const leftForest = (z) => z > exitZ - 1;

  /* ── criação ── */
  // o GLTFLoader tira o ponto do nome dos ossos ("foot.L" vira "footL")
  function findBone(obj, name) {
    return obj.getObjectByName(name) || obj.getObjectByName(name.replace(/[.:/[\]]/g, '')) || obj.getObjectByName(name.replace('.', '_'));
  }
  function groundAt(octree, x, z) {
    ray.origin.set(x, 40, z); ray.direction.copy(down);
    const hit = octree.rayIntersect(ray);
    return hit ? hit.position.y : null;
  }

  function spawn(type, octree, player) {
    const tpl = templates[type];
    for (let tries = 0; tries < 12; tries++) {
      // em leque na frente da caverna, entre 16 e 24 m do Romanele
      const ang = rand(-1.25, 1.25);
      const dist = rand(16, 24);
      const x = THREE.MathUtils.clamp(player.x + Math.sin(ang) * dist, -26, 26);
      const z = THREE.MathUtils.clamp(player.z + Math.cos(ang) * dist, boundaryZ + 3, exitZ - EXIT_STOP - 4);
      if (inCaveArea(x, z)) continue;
      const y = groundAt(octree, x, z);
      if (y === null || y > player.y + 4 || y < player.y - 4) continue;

      const obj = SkeletonUtils.clone(tpl.scene);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      obj.position.set(x, y, z);
      group.add(obj);

      const mixer = new THREE.AnimationMixer(obj);
      const actions = {};
      for (const c of tpl.animations) actions[c.name] = mixer.clipAction(c);
      const d = {
        type, cfg: DINO_TYPES[type], obj, mixer, actions, current: null,
        capsule: new Capsule(new THREE.Vector3(x, y + BODY_R, z), new THREE.Vector3(x, y + 1.3, z), BODY_R),
        vel: new THREE.Vector3(), onFloor: false,
        yaw: Math.atan2(player.x - x, player.z - z),
        state: 'delay', timer: rand(0, 1.4), speed: 0,
        attackHit: false, roarIn: rand(3, 6), sinkT: 0,
        vocalIn: rand(4, 9), stepCool: 0,
        feet: ['foot.L', 'foot.R'].map((n) => ({ bone: findBone(obj, n), minH: Infinity, armed: true })).filter((f) => f.bone),
      };
      obj.rotation.y = d.yaw;
      obj.visible = false;
      mixer.addEventListener('finished', (e) => onFinished(d, e.action.getClip().name));
      dinos.push(d);
      return d;
    }
    return null;
  }

  function startWave(octree, player) {
    wave += 1;
    const count = Math.min(2 + wave, 7);
    const types = Object.keys(DINO_TYPES);
    for (let i = 0; i < count; i++) spawn(i < types.length ? types[i] : pick(types), octree, player);
    onWave && onWave(wave, count);
  }

  /* ── animação ── */
  function play(d, name, { fade = 0.2, once = false, timeScale = 1 } = {}) {
    const next = d.actions[name]; if (!next) return null;
    const prev = d.current;
    if (prev === next && !once) { next.setEffectiveTimeScale(timeScale); return next; }
    next.enabled = true;
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset();
    next.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev && prev !== next) prev.fadeOut(fade);
    d.current = next;
    if (name === 'Rugir' && onSound) onSound('rugido', d);
    return next;
  }

  /* ── sons: passos (quando o pé desce e encosta no chão) e rugidos soltos na correria ── */
  const footW = new THREE.Vector3();
  const LOCOMOTION = { chase: 1, circle: 1 };
  function sounds(d, dt, player) {
    if (!onSound || !d.obj.visible) return;
    d.stepCool -= dt;
    const moving = LOCOMOTION[d.state] && d.speed > 0.3 && d.onFloor;
    if (d.feet.length) {
      d.obj.updateMatrixWorld(true);
      for (const f of d.feet) {
        f.bone.getWorldPosition(footW);
        const h = footW.y - d.obj.position.y;
        if (moving) f.minH = Math.min(f.minH, h);   // altura do pé apoiado
        if (h > f.minH + 0.08) f.armed = true;
        else if (f.armed && h < f.minH + 0.03) {
          f.armed = false;
          if (moving && d.stepCool <= 0) { d.stepCool = 0.12; onSound('passo', d, THREE.MathUtils.clamp(d.speed / 3.4, 0.45, 1)); }
        }
      }
    }
    // correndo atrás dele, ruge de vez em quando (sorteia o rugido no som)
    if (d.state === 'chase') {
      d.vocalIn -= dt;
      if (d.vocalIn <= 0) {
        d.vocalIn = rand(7, 14);
        if (Math.hypot(player.x - d.obj.position.x, player.z - d.obj.position.z) < 35) onSound('rugido', d);
      }
    }
  }

  function onFinished(d, name) {
    if (d.state === 'roar' && name === 'Rugir') { d.state = 'chase'; return; }
    if (d.state === 'attack' && name.startsWith('Atacar')) { d.state = 'recover'; d.timer = rand(1.0, 1.8); play(d, 'Parado', { fade: 0.25 }); return; }
    if (d.state === 'flinch' && name === 'TomarDano') { d.state = 'chase'; return; }
    if (d.state === 'waitRoar' && name === 'Rugir') { d.state = 'wait'; play(d, 'Parado', { fade: 0.3 }); return; }
    if (d.state === 'down' && name.startsWith('Cair')) { d.state = 'lying'; d.timer = 3.5; }
  }

  /* ── bastada do Romanele ── */
  function knockDown(d, player, swingName) {
    d.state = 'down'; d.speed = 0; d.vel.x = d.vel.z = 0;
    let fall = 'CairTras';
    if (swingName.startsWith('Ataque2')) {
      // paulada lateral: tomba para o lado oposto ao do Romanele
      const rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw); // direita do dino
      const side = (player.x - d.obj.position.x) * rx + (player.z - d.obj.position.z) * rz;
      fall = side > 0 ? 'Cair' : 'Cair2';
    }
    play(d, fall, { fade: 0.08, once: true });
    downs += 1;
    onDown && onDown(downs, d);
    // os vizinhos levam um tranco com o tombo
    for (const o of dinos) {
      if (o === d || !isAlive(o) || o.state === 'delay') continue;
      if (o.obj.position.distanceTo(d.obj.position) < 2.6 && o.state !== 'attack') {
        o.state = 'flinch'; play(o, 'TomarDano', { fade: 0.08, once: true });
      }
    }
  }

  const isAlive = (d) => d.state !== 'down' && d.state !== 'lying' && d.state !== 'sink';

  function checkClub(player, swing) {
    // swing: { id, name, progress } enquanto o Romanele ataca; acerta no meio do golpe
    if (!swing || swing.progress < 0.3 || swing.progress > 0.62 || swing.id === lastSwingHit) return;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let any = false;
    for (const d of dinos) {
      if (!isAlive(d) || d.state === 'delay') continue;
      const dx = d.obj.position.x - player.x, dz = d.obj.position.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CLUB_REACH || Math.abs(d.obj.position.y - player.y) > 1.5) continue;
      if (dist > 0.4 && (dx * fx + dz * fz) / dist < CLUB_ARC) continue;
      knockDown(d, player, swing.name);
      any = true;
      if (swing.name.startsWith('Ataque1')) break; // paulada de cima acerta um só
    }
    if (any) lastSwingHit = swing.id;
  }

  /* ── ataque do dino ── */
  function checkBite(d, player) {
    const a = d.current; if (!a || d.attackHit) return;
    const name = a.getClip().name, t = a.time;
    const dx = player.x - d.obj.position.x, dz = player.z - d.obj.position.z;
    const dist = Math.hypot(dx, dz);
    let hit = false;
    if (name === 'Atacar' && t >= 0.38 && t <= 0.5) {
      // mordida: precisa estar na frente
      const fx = Math.sin(d.yaw), fz = Math.cos(d.yaw);
      hit = dist < d.cfg.bite + 0.35 && (dx * fx + dz * fz) / Math.max(dist, 1e-3) > 0.4;
    } else if (name === 'Atacar2' && t >= 0.4 && t <= 0.6) {
      // giro com rabada: acerta em volta
      hit = dist < 2.4;
    }
    if (hit && Math.abs(d.obj.position.y - player.y) < 1.5) {
      d.attackHit = true;
      if (invulnerable > 0) return;
      invulnerable = 1.2; // um tempinho sem levar outro golpe
      onPlayerHit && onPlayerHit(dx / Math.max(dist, 1e-3), dz / Math.max(dist, 1e-3), d);
    }
  }

  /* ── física ── */
  function move(d, dt, octree) {
    d.vel.x = Math.sin(d.yaw) * d.speed;
    d.vel.z = Math.cos(d.yaw) * d.speed;
    if (!d.onFloor) d.vel.y -= GRAVITY * dt; else d.vel.y = Math.max(d.vel.y, 0);
    d.capsule.translate(tmp.copy(d.vel).multiplyScalar(dt));
    d.onFloor = false;
    for (let i = 0; i < 3; i++) {
      const hit = octree.capsuleIntersect(d.capsule);
      if (!hit) break;
      if (hit.normal.y > 0.5) d.onFloor = true;
      d.capsule.translate(hit.normal.multiplyScalar(hit.depth));
    }
    if (!d.onFloor) {
      // gruda no chão em descidas suaves
      ray.origin.copy(d.capsule.start); ray.direction.copy(down);
      const h = octree.rayIntersect(ray);
      if (h && h.distance < BODY_R + 0.35) { d.capsule.translate(tmp.set(0, -(h.distance - BODY_R), 0)); d.onFloor = true; }
    }
    // não entra na caverna
    const c = d.capsule.start;
    if (inCaveArea(c.x, c.z - 0.3)) d.capsule.translate(tmp.set(0, 0, boundaryZ + 0.3 - c.z));
    if (c.z > exitZ - EXIT_STOP + 0.5) d.capsule.translate(tmp.set(0, 0, exitZ - EXIT_STOP + 0.5 - c.z));
    if (c.y < -20) { const g = groundAt(octree, c.x, c.z) || 0; d.capsule.translate(tmp.set(0, g + BODY_R - c.y, 0)); }
  }

  function separate(player) {
    for (let i = 0; i < dinos.length; i++) {
      const a = dinos[i]; if (!isAlive(a) || a.state === 'delay') continue;
      const ca = a.capsule.start;
      // do Romanele (só o dino é empurrado)
      let dx = ca.x - player.x, dz = ca.z - player.z, d2 = dx * dx + dz * dz;
      if (d2 < PLAYER_GAP * PLAYER_GAP && d2 > 1e-6) {
        const d = Math.sqrt(d2), k = (PLAYER_GAP - d) / d;
        a.capsule.translate(tmp.set(dx * k, 0, dz * k));
      }
      for (let j = i + 1; j < dinos.length; j++) {
        const b = dinos[j]; if (b.state === 'delay' || b.state === 'sink') continue;
        const cb = b.capsule.start;
        dx = ca.x - cb.x; dz = ca.z - cb.z; d2 = dx * dx + dz * dz;
        if (d2 < DINO_GAP * DINO_GAP && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (DINO_GAP - d) / d * 0.5;
          a.capsule.translate(tmp.set(dx * k, 0, dz * k));
          if (isAlive(b)) b.capsule.translate(tmp.set(-dx * k, 0, -dz * k));
        }
      }
    }
  }

  function turnTo(d, tx, tz, dt, rate = 4) {
    const want = Math.atan2(tx - d.obj.position.x, tz - d.obj.position.z);
    const diff = wrapAngle(want - d.yaw);
    d.yaw += THREE.MathUtils.clamp(diff, -rate * dt, rate * dt);
    return Math.abs(diff);
  }

  function locomote(d, name, speed) {
    d.speed = speed;
    play(d, name, { fade: 0.25, timeScale: THREE.MathUtils.clamp(speed / CLIP_SPEED[name], 0.6, 1.5) });
  }

  /* ── cérebro de cada dino ── */
  function think(d, dt, player, playerOutside) {
    const p = d.obj.position;
    const distP = Math.hypot(player.x - p.x, player.z - p.z);

    switch (d.state) {
      case 'delay':
        d.timer -= dt;
        if (d.timer <= 0) {
          d.obj.visible = true;
          d.state = 'roar'; d.speed = 0;
          play(d, 'Rugir', { fade: 0, once: true });     // entrada
        }
        break;
      case 'roar':
      case 'flinch':
      case 'waitRoar':
        d.speed = 0;
        turnTo(d, player.x, player.z, dt, 2);
        break;
      case 'recover':
        d.speed = 0;
        turnTo(d, player.x, player.z, dt, 3);
        d.timer -= dt;
        if (d.timer <= 0) d.state = 'chase';
        break;
      case 'attack':
        d.speed = 0;
        if (d.current && d.current.time < 0.3) turnTo(d, player.x, player.z, dt, 5);
        checkBite(d, player);
        break;
      case 'wait':
      case 'chase': {
        // alvo: o Romanele; se ele está na caverna, a borda dela
        let tx = player.x, tz = player.z;
        const gone = leftForest(player.z);
        if (!playerOutside) {
          tx = THREE.MathUtils.clamp(player.x, caveMouth.x - CAVE_HALF_W + 1.5, caveMouth.x + CAVE_HALF_W - 1.5);
          tz = boundaryZ + 0.6;
        } else if (gone) {
          // ele saiu da mata: vão até a borda e ficam rugindo ali
          tx = THREE.MathUtils.clamp(p.x, player.x - 6, player.x + 6);
          tz = exitZ - EXIT_STOP;
        }
        // um dino ataca por vez; os outros rodeiam a uns 3,5 m esperando a vez
        const someoneAttacking = dinos.some((o) => o !== d && o.state === 'attack');
        if (someoneAttacking && playerOutside && !gone && distP < 4.5) {
          d.state = 'circle'; d.timer = rand(0.8, 1.6); d.circleDir = Math.random() < 0.5 ? -1 : 1;
          break;
        }
        const distT = Math.hypot(tx - p.x, tz - p.z);
        const off = turnTo(d, tx, tz, dt, d.state === 'wait' ? 2.5 : 4);
        if (distP < d.cfg.bite && off < 0.6 && !someoneAttacking && !gone) {
          d.state = 'attack'; d.attackHit = false; d.speed = 0;
          play(d, Math.random() < 0.6 ? 'Atacar' : 'Atacar2', { fade: 0.12, once: true });
          break;
        }
        if ((!playerOutside || gone) && (distT < 1.2 || (gone && p.z > exitZ - EXIT_STOP - 0.5))) {
          // esperando na boca da caverna: olha para ele e ruge de vez em quando
          d.state = 'wait'; d.speed = 0;
          turnTo(d, player.x, player.z, dt, 2.5);
          play(d, 'Parado', { fade: 0.3 });
          d.roarIn -= dt;
          if (d.roarIn <= 0) { d.roarIn = rand(4, 8); d.state = 'waitRoar'; play(d, 'Rugir', { fade: 0.2, once: true }); }
          break;
        }
        d.state = 'chase';
        const slow = off > 1.2 ? 0.45 : 1; // diminui para fazer curvas fechadas
        if (distT > 7) locomote(d, d.cfg.gait, (d.cfg.gait === 'Pular' ? d.cfg.hop : d.cfg.run) * slow);
        else if (distT > 3) locomote(d, d.cfg.near, (d.cfg.near === 'Pular' ? d.cfg.hop : d.cfg.walk + 0.4) * slow);
        else locomote(d, 'Andar', d.cfg.walk * slow);
        break;
      }
      case 'circle': {
        // anda de lado em volta do Romanele, mantendo distância
        const ang = Math.atan2(p.x - player.x, p.z - player.z) + d.circleDir * 0.9;
        const r = Math.max(distP, 3.5);
        const tx = player.x + Math.sin(ang) * r, tz = player.z + Math.cos(ang) * r;
        turnTo(d, tx, tz, dt, 3);
        locomote(d, 'Andar', d.cfg.walk);
        d.timer -= dt;
        if (d.timer <= 0) d.state = 'chase';
        break;
      }
      case 'down':
        d.speed = 0;
        break;
      case 'lying':
        d.timer -= dt;
        if (d.timer <= 0) { d.state = 'sink'; d.sinkT = 0; }
        break;
      case 'sink':
        // afunda no chão e some
        d.sinkT += dt;
        d.capsule.translate(tmp.set(0, -0.8 * dt, 0));
        if (d.sinkT > 1.6) d.dead = true;
        break;
      default:
        break;
    }
  }

  /* ── API ── */
  function update(dt, { octree, player, swing }) {
    const playerOutside = !inCaveArea(player.x, player.z);
    const gone = leftForest(player.z);
    if (!active && playerOutside && !gone) { active = true; startWave(octree, player); }
    invulnerable = Math.max(0, invulnerable - dt);

    checkClub(player, swing);

    for (const d of dinos) {
      think(d, dt, player, playerOutside);
      if (d.state !== 'delay') {
        if (d.state === 'sink') { /* sem física: só desce */ } else move(d, dt, octree);
      }
    }
    separate(player);

    for (let i = dinos.length - 1; i >= 0; i--) {
      const d = dinos[i];
      if (d.dead) { group.remove(d.obj); d.mixer.stopAllAction(); d.mixer.uncacheRoot(d.obj); dinos.splice(i, 1); continue; }
      d.obj.position.set(d.capsule.start.x, d.capsule.start.y - BODY_R, d.capsule.start.z);
      d.obj.rotation.y = d.yaw;
      d.mixer.update(dt);
      sounds(d, dt, player);
    }

    // próxima onda quando todos caíram (só se ele estiver fora da caverna)
    if (active && !dinos.some(isAlive)) {
      nextWaveIn -= dt;
      if (nextWaveIn <= 0 && playerOutside && !gone) { nextWaveIn = 5; startWave(octree, player); }
    } else nextWaveIn = 5;
  }

  function reset() {
    for (const d of dinos) { group.remove(d.obj); d.mixer.stopAllAction(); d.mixer.uncacheRoot(d.obj); }
    dinos.length = 0; wave = 0; active = false; nextWaveIn = 0; lastSwingHit = -1; invulnerable = 0;
  }

  // mira automática da bastada: direção do dino vivo mais próximo à frente (até ±100°, 3 m)
  function aim(px, pz, yaw, maxDeg = 100) {
    let best = null, bestD = 3;
    for (const d of dinos) {
      if (!isAlive(d) || d.state === 'delay') continue;
      const dx = d.obj.position.x - px, dz = d.obj.position.z - pz, dist = Math.hypot(dx, dz);
      if (dist > bestD) continue;
      const ang = Math.atan2(dx, dz);
      if (Math.abs(wrapAngle(ang - yaw)) > THREE.MathUtils.degToRad(maxDeg)) continue;
      best = ang; bestD = dist;
    }
    return best;
  }

  // a bastada encosta em algum dino (inclusive um já caído)? usado para o som de "hit"
  function touches(px, py, pz, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    return dinos.some((d) => {
      if (d.state === 'delay' || d.state === 'sink') return false;
      const dx = d.obj.position.x - px, dz = d.obj.position.z - pz, dist = Math.hypot(dx, dz);
      if (dist > CLUB_REACH || Math.abs(d.obj.position.y - py) > 1.5) return false;
      return dist < 0.4 || (dx * fx + dz * fz) / dist >= CLUB_ARC;
    });
  }

  return {
    group, update, reset, aim, touches,
    setVisible(v) { group.visible = v; },
    get downs() { return downs; },
    get wave() { return wave; },
    get alive() { return dinos.filter(isAlive).length; },
    get list() { return dinos; },
  };
}
