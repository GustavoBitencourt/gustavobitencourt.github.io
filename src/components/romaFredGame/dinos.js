import * as THREE from 'three';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/*
  Dinossauros da mata: aparecem quando o Romanele sai 2 m da caverna, rugem, correm/pulam até ele,
  mordem ou dão rabada, e caem com uma única bastada. Não entram na caverna: se ele volta para
  dentro, ficam esperando na boca da caverna, rugindo. Também não saem da mata: depois que ele
  passa da saída (marcador SaidaMata) não vêm mais ondas e os que estavam atrás dele param na borda.

  O mesmo gerenciador também cuida de uma "arena" na cidade (o calçadão até perto do Bar do Zé),
  e há variações dos três modelos (cor, tamanho e velocidade diferentes) em DINO_TYPES.

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
  /* variações: mesmo esqueleto e animações de um dos três, com outra cor (giro de matiz no corpo),
     outro tamanho, outra camisa no montador e outro jeito de correr */
  raptorRoxo: {
    base: 'raptor', label: 'Raptor roxo', look: { hue: 2.3, sat: 1.15, val: 0.95, shirt: 0x3a2a52 }, scale: 0.92,
    run: 4.1, hop: 2.7, walk: 1.55, bite: 1.7, gait: 'Correr', near: 'Pular',
  },
  raptorFogo: {
    base: 'raptor', label: 'Raptor de fogo', look: { hue: -1.9, sat: 1.35, val: 1.05, shirt: 0x1e1e1e }, scale: 1.06,
    run: 3.9, hop: 2.9, walk: 1.45, bite: 1.85, gait: 'Pular', near: 'Pular',
  },
  trexFilhote: {
    base: 'trex', label: 'T-Rex filhote', look: { hue: 0.9, sat: 1.1, val: 1.15, shirt: 0xf2c94c }, scale: 0.66,
    run: 3.9, hop: 2.6, walk: 1.7, bite: 1.35, gait: 'Correr', near: 'Pular',
  },
  trexAlbino: {
    base: 'trex', label: 'T-Rex albino', look: { hue: 0, sat: 0.12, val: 1.5, shirt: 0x8a1f1f }, scale: 1.2,
    run: 2.7, hop: 2.0, walk: 1.2, bite: 2.1, gait: 'Correr', near: 'Andar',
  },
  inflavelAzul: {
    base: 'inflavel', label: 'T-Rex inflável azul', look: { hue: 2.9, sat: 1.1, val: 1.0 }, scale: 1.0,
    run: 3.1, hop: 2.5, walk: 1.3, bite: 1.45, gait: 'Pular', near: 'Pular',
  },
};
// tipos com arquivo próprio (os que precisam ser baixados)
export const DINO_BASES = Object.keys(DINO_TYPES).filter((k) => !DINO_TYPES[k].base);

// cor das variações: gira a matiz das cores de vértice do corpo (espaço YIQ) e ajusta saturação/brilho
const HUE_GLSL = `
  { const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYIQ * diffuseColor.rgb;
    float h = atan(yiq.z, yiq.y) + uHue, ch = length(yiq.yz) * uSat;
    diffuseColor.rgb = max(toRGB * vec3(yiq.x * uVal, ch * cos(h), ch * sin(h)), vec3(0.0)); }`;
function variantMaterial(m, look) {
  const n = m.clone();
  if (look.shirt !== undefined && m.name === 'Rider_Camisa') n.color.setHex(look.shirt);
  if (/_Inflavel$/.test(m.name)) {
    const u = { uHue: { value: look.hue || 0 }, uSat: { value: look.sat ?? 1 }, uVal: { value: look.val ?? 1 } };
    n.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = 'uniform float uHue;\nuniform float uSat;\nuniform float uVal;\n'
        + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${HUE_GLSL}`);
    };
    n.customProgramCacheKey = () => 'dino-hue';
  }
  return n;
}

const LOOK_CACHE = {};
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/*
  arena (opcional): em vez da mata com a caverna, uma área da cidade feita de retângulos {x0,x1,z0,z1}.
  Os dinos aparecem quando o Romanele entra nela, não saem dela, e se ele sai ficam na borda rugindo.
*/
export function createDinoManager({ scene, templates, caveMouth = null, exitZ = Infinity, arena = null, types = null, firstTypes = null, name = 'Dinos', onPlayerHit, onDown, onWave, onSound }) {
  const group = new THREE.Group();
  group.name = name;
  scene.add(group);

  const typeKeys = types || Object.keys(DINO_TYPES);
  const boundaryZ = caveMouth ? caveMouth.z + OUTSIDE_MARGIN : -Infinity;
  const dinos = [];
  let wave = 0;
  let nextWaveIn = 0;
  let active = false;       // a primeira onda já foi disparada
  let downs = 0;
  let lastSwingHit = -1;
  let invulnerable = 0;
  let playerDown = false;   // Romanele paralisado (sem vida): os dinos param de atacar e ficam rodeando
  const pending = [];       // dinos da onda que ainda vão nascer (um por quadro, para não travar)

  const tmp = new THREE.Vector3();
  const ray = new THREE.Ray();
  const down = new THREE.Vector3(0, -1, 0);

  const inCaveArea = (x, z) => !!caveMouth && z < boundaryZ && Math.abs(x - caveMouth.x) < CAVE_HALF_W;
  const EXIT_STOP = 3;         // param a 3 m antes da saída da mata
  const leftForest = (pl) => (arena ? !arenaInside(pl.x, pl.z) : pl.z > exitZ - 1);

  /* ── arena da cidade ── */
  function arenaInside(x, z, m = 0) {
    return arena.rects.some((r) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m);
  }
  function arenaClamp(x, z, out, m = 0.3) {
    let best = null, bd = Infinity;
    for (const r of arena.rects) {
      const cx = THREE.MathUtils.clamp(x, r.x0 + m, r.x1 - m), cz = THREE.MathUtils.clamp(z, r.z0 + m, r.z1 - m);
      const dd = (cx - x) ** 2 + (cz - z) ** 2;
      if (dd < bd) { bd = dd; best = [cx, cz]; }
    }
    out.x = best[0]; out.z = best[1]; return bd;
  }
  const arenaArea = arena ? arena.rects.map((r) => (r.x1 - r.x0) * (r.z1 - r.z0)) : [];
  function arenaSpawnPoint(player, minD) {
    const tot = arenaArea.reduce((a, b) => a + b, 0);
    let k = Math.random() * tot, i = 0;
    while (k > arenaArea[i] && i < arenaArea.length - 1) { k -= arenaArea[i]; i += 1; }
    const r = arena.rects[i];
    const x = rand(r.x0 + 1, r.x1 - 1), z = rand(r.z0 + 1, r.z1 - 1);
    const dist = Math.hypot(x - player.x, z - player.z);
    if (dist < minD || dist > 32) return null;
    if (arena.avoid && arena.avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) return null;
    return { x, z };
  }
  const edgeTmp = { x: 0, z: 0 };

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

  // materiais das variações (um jogo por tipo, compartilhado entre os dinos daquele tipo e entre a mata e a cidade)
  function dress(obj, type) {
    const look = DINO_TYPES[type].look; if (!look) return;
    const cache = LOOK_CACHE[type] || (LOOK_CACHE[type] = new Map());
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => { if (!cache.has(m)) cache.set(m, variantMaterial(m, look)); return cache.get(m); };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }

  function spawn(type, octree, player) {
    const cfg = DINO_TYPES[type];
    const tpl = templates[type] || templates[cfg.base];
    if (!tpl) return null;
    for (let tries = 0; tries < (arena ? 40 : 12); tries++) {
      let x, z;
      if (arena) {
        // em qualquer ponto da área, entre 12 e 32 m do Romanele (se não achar, aceita mais perto)
        const s = arenaSpawnPoint(player, tries < 30 ? 12 : 7); if (!s) continue;
        x = s.x; z = s.z;
      } else {
        // em leque na frente da caverna, entre 16 e 24 m do Romanele
        const ang = rand(-1.25, 1.25);
        const dist = rand(16, 24);
        x = THREE.MathUtils.clamp(player.x + Math.sin(ang) * dist, -26, 26);
        z = THREE.MathUtils.clamp(player.z + Math.cos(ang) * dist, boundaryZ + 3, exitZ - EXIT_STOP - 4);
        if (inCaveArea(x, z)) continue;
      }
      const y = groundAt(octree, x, z);
      if (y === null) continue;
      if (arena ? (y < arena.floorY[0] || y > arena.floorY[1]) : (y > player.y + 4 || y < player.y - 4)) continue;

      const obj = SkeletonUtils.clone(tpl.scene);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      dress(obj, type);
      obj.scale.setScalar(cfg.scale || 1);
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
    // primeira onda: os da lista inicial (os três clássicos na mata); depois, sorteio entre todos os tipos
    const first = wave === 1 && firstTypes ? firstTypes : [];
    for (let i = 0; i < count; i++) pending.push(i < first.length ? first[i] : pick(typeKeys));
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
      if (invulnerable > 0 || playerDown) return;
      invulnerable = 1.2; // um tempinho sem levar outro golpe
      onPlayerHit && onPlayerHit(dx / Math.max(dist, 1e-3), dz / Math.max(dist, 1e-3), d);
    }
  }

  /* ── física ── */
  function move(d, dt, octree) {
    d.vel.x = Math.sin(d.yaw) * d.speed;
    d.vel.z = Math.cos(d.yaw) * d.speed;
    if (!d.onFloor) d.vel.y -= GRAVITY * dt; else d.vel.y = Math.max(d.vel.y, 0);
    const x0 = d.capsule.start.x, z0 = d.capsule.start.z;
    d.capsule.translate(tmp.copy(d.vel).multiplyScalar(dt));
    d.onFloor = false;
    for (let i = 0; i < 3; i++) {
      const hit = octree.capsuleIntersect(d.capsule);
      if (!hit) break;
      if (hit.normal.y > 0.5) d.onFloor = true;
      if (hit.normal.y < -0.5) d.vel.y = Math.min(d.vel.y, 0);   // bateu a cabeça em algo: para de subir
      d.capsule.translate(hit.normal.multiplyScalar(hit.depth));
    }
    if (!d.onFloor) {
      // gruda no chão em descidas suaves
      ray.origin.copy(d.capsule.start); ray.direction.copy(down);
      const h = octree.rayIntersect(ray);
      if (h && h.distance < BODY_R + 0.35) { d.capsule.translate(tmp.set(0, -(h.distance - BODY_R), 0)); d.onFloor = true; }
    }
    const c = d.capsule.start;
    // quanto andou de verdade neste passo (o "cérebro" usa para saber se empacou)
    if (!d.lastMove) d.lastMove = { x: 0, z: 0 };
    d.lastMove.x = c.x - x0; d.lastMove.z = c.z - z0;
    if (arena) {
      // não sai da área da cidade
      if (arenaClamp(c.x, c.z, edgeTmp) > 1e-6) d.capsule.translate(tmp.set(edgeTmp.x - c.x, 0, edgeTmp.z - c.z));
    } else {
      // não entra na caverna
      if (inCaveArea(c.x, c.z - 0.3)) d.capsule.translate(tmp.set(0, 0, boundaryZ + 0.3 - c.z));
      if (c.z > exitZ - EXIT_STOP + 0.5) d.capsule.translate(tmp.set(0, 0, exitZ - EXIT_STOP + 0.5 - c.z));
    }
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
        const gone = leftForest(player);
        if (!playerOutside) {
          tx = THREE.MathUtils.clamp(player.x, caveMouth.x - CAVE_HALF_W + 1.5, caveMouth.x + CAVE_HALF_W - 1.5);
          tz = boundaryZ + 0.6;
        } else if (gone && arena) {
          // ele saiu da área: vão até a borda mais perto dele (cada um num ponto) e ficam rugindo ali
          if (d.edgeOff === undefined) d.edgeOff = [rand(-3.5, 3.5), rand(-3.5, 3.5)];
          arenaClamp(player.x + d.edgeOff[0], player.z + d.edgeOff[1], edgeTmp, 0.8);
          tx = edgeTmp.x; tz = edgeTmp.z;
        } else if (gone) {
          // ele saiu da mata: vão até a borda e ficam rugindo ali
          tx = THREE.MathUtils.clamp(p.x, player.x - 6, player.x + 6);
          tz = exitZ - EXIT_STOP;
        }
        // Romanele paralisado: chegam perto, param em volta dele e rugem (não atacam mais)
        if (playerDown && playerOutside && !gone && distP < 4.2) {
          d.state = 'wait'; d.speed = 0;
          turnTo(d, player.x, player.z, dt, 2.5);
          play(d, 'Parado', { fade: 0.3 });
          d.roarIn -= dt;
          if (d.roarIn <= 0) { d.roarIn = rand(3, 7); d.state = 'waitRoar'; play(d, 'Rugir', { fade: 0.2, once: true }); }
          break;
        }
        // um dino ataca por vez; os outros rodeiam a uns 3,5 m esperando a vez
        const someoneAttacking = dinos.some((o) => o !== d && o.state === 'attack');
        if (someoneAttacking && playerOutside && !gone && distP < 4.5) {
          d.state = 'circle'; d.timer = rand(0.8, 1.6); d.circleDir = Math.random() < 0.5 ? -1 : 1;
          break;
        }
        let distT = Math.hypot(tx - p.x, tz - p.z);
        let detour = false;
        if (arena && distT > 3) {
          // na cidade: contorna o chafariz pela praça quando ele está entre o dino e o alvo
          for (const a of arena.avoid || []) {
            const rn = a.r - 1.5;
            if (Math.abs(p.z - a.z) < rn + 1 && Math.abs(p.x - a.x) < rn + 5 && Math.sign(tx - a.x) !== Math.sign(p.x - a.x) && Math.abs(tx - a.x) > 2) {
              const side = Math.sign(p.z - a.z) || (d.obj.id % 2 ? 1 : -1);
              tx = a.x; tz = a.z + side * (rn + 2); detour = true; break;
            }
          }
          // se o caminho reto sai da área (ex.: canto da praça), entra primeiro na faixa do calçadão
          const sx = p.x + (tx - p.x) / distT * 1.6, sz = p.z + (tz - p.z) / distT * 1.6;
          if (!detour && arena.spineZ !== undefined && !arenaInside(sx, sz, 0.4)) {
            tx = p.x + Math.sign(tx - p.x) * 2.5; tz = THREE.MathUtils.clamp(p.z, arena.spineZ - 4.5, arena.spineZ + 4.5); detour = true;
          }
          if (detour) distT = Math.hypot(tx - p.x, tz - p.z) + 4;
        }
        // não chega mais perto do alvo (empacou em fradinho, banco, tronco): dá um pulinho por cima
        // (quanto o último passo dele andou na direção do alvo; não depende do alvo estar fugindo)
        const along = distT > 0.5 && d.lastMove ? (d.lastMove.x * (tx - p.x) + d.lastMove.z * (tz - p.z)) / Math.hypot(tx - p.x, tz - p.z) : Infinity;
        if (d.state === 'chase' && d.speed > 1 && d.onFloor && along < d.speed * dt * 0.25) d.stuckT = (d.stuckT || 0) + dt;
        else d.stuckT = Math.max(0, (d.stuckT || 0) - dt);
        if (d.stuckT > 0.6) {
          // primeira vez ali: pulinho; se continua no mesmo lugar, recua para o lado por um tempinho
          d.stuckT = 0;
          const same = d.stuckAt && Math.hypot(p.x - d.stuckAt.x, p.z - d.stuckAt.z) < 0.8;
          d.stuckAt = { x: p.x, z: p.z };
          if (!same) { d.vel.y = 8.2; d.onFloor = false; d.yaw += rand(-0.5, 0.5); }
          else {
            d.unstickT = rand(1.0, 1.6);
            const side = Math.random() < 0.5 ? -1 : 1, back = Math.atan2(tx - p.x, tz - p.z) + Math.PI + side * 0.9;
            d.unstickTo = arena && arena.spineZ !== undefined
              ? { x: p.x - Math.sign(tx - p.x) * 1.5, z: arena.spineZ + rand(-2.5, 2.5) }
              : { x: p.x + Math.sin(back) * 3, z: p.z + Math.cos(back) * 3 };
          }
        }
        if (d.unstickT > 0) {
          d.unstickT -= dt; tx = d.unstickTo.x; tz = d.unstickTo.z; distT = Math.hypot(tx - p.x, tz - p.z) + 4;
        }
        const off = turnTo(d, tx, tz, dt, d.state === 'wait' ? 2.5 : 4);
        if (distP < d.cfg.bite && off < 0.6 && !someoneAttacking && !gone && !playerDown) {
          d.state = 'attack'; d.attackHit = false; d.speed = 0;
          play(d, Math.random() < 0.6 ? 'Atacar' : 'Atacar2', { fade: 0.12, once: true });
          break;
        }
        if ((!playerOutside || gone) && (distT < 1.2 || (gone && (arena ? distT < 2.5 : p.z > exitZ - EXIT_STOP - 0.5)))) {
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
    const gone = leftForest(player);
    if (!active && playerOutside && !gone) { active = true; startWave(octree, player); }
    invulnerable = Math.max(0, invulnerable - dt);
    if (pending.length) spawn(pending.shift(), octree, player);   // um por quadro: sem travadinha na onda nova

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
    if (active && !pending.length && !dinos.some(isAlive)) {
      nextWaveIn -= dt;
      if (nextWaveIn <= 0 && playerOutside && !gone) { nextWaveIn = 5; startWave(octree, player); }
    } else nextWaveIn = 5;
  }

  function reset() {
    for (const d of dinos) { group.remove(d.obj); d.mixer.stopAllAction(); d.mixer.uncacheRoot(d.obj); }
    dinos.length = 0; pending.length = 0; wave = 0; active = false; nextWaveIn = 0; lastSwingHit = -1; invulnerable = 0;
  }

  // mira automática da bastada: direção do dino vivo mais próximo à frente (até ±100°, 3 m)
  function aim(px, pz, yaw, maxDeg = 100, out = null) {
    let best = null, bestD = 3;
    for (const d of dinos) {
      if (!isAlive(d) || d.state === 'delay') continue;
      const dx = d.obj.position.x - px, dz = d.obj.position.z - pz, dist = Math.hypot(dx, dz);
      if (dist > bestD) continue;
      const ang = Math.atan2(dx, dz);
      if (Math.abs(wrapAngle(ang - yaw)) > THREE.MathUtils.degToRad(maxDeg)) continue;
      best = ang; bestD = dist;
    }
    if (out) out.dist = bestD;
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

  // aquece: monta um de cada tipo na frente da câmera e desenha um quadro, para os shaders e texturas
  // ficarem prontos no carregamento (senão a primeira aparição de cada tipo dá uma travadinha)
  function prewarm(renderer, camera) {
    const tmpObjs = [], wasVisible = group.visible;
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    typeKeys.forEach((type, i) => {
      const cfg = DINO_TYPES[type]; const tpl = templates[type] || templates[cfg.base]; if (!tpl) return;
      const obj = SkeletonUtils.clone(tpl.scene);
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
      dress(obj, type); obj.scale.setScalar(cfg.scale || 1);
      obj.position.copy(camera.position).addScaledVector(fwd, 8).add(new THREE.Vector3((i - typeKeys.length / 2) * 0.6, -1, 0));
      group.add(obj); tmpObjs.push(obj);
    });
    group.visible = true;
    renderer.render(scene, camera);
    for (const o of tmpObjs) group.remove(o);
    group.visible = wasVisible;
  }

  return {
    group, update, reset, aim, touches, prewarm,
    setVisible(v) { group.visible = v; },
    setPlayerDown(v) { playerDown = !!v; },
    grace(s) { invulnerable = Math.max(invulnerable, s); },     // tempinho sem levar golpe (ao levantar)
    get downs() { return downs; },
    get wave() { return wave; },
    get alive() { return dinos.filter(isAlive).length; },
    get list() { return dinos; },
  };
}

// vários grupos de dinos (mata e calçadão) com a mesma interface de um só
export function combineDinoManagers(managers) {
  const info = { dist: 0 };
  return {
    managers,
    update(dt, args) { for (const m of managers) m.update(dt, args); },
    reset() { for (const m of managers) m.reset(); },
    prewarm(renderer, camera) { for (const m of managers) m.prewarm(renderer, camera); },
    setVisible(v) { for (const m of managers) m.setVisible(v); },
    setPlayerDown(v) { for (const m of managers) m.setPlayerDown(v); },
    grace(s) { for (const m of managers) m.grace(s); },
    aim(px, pz, yaw, maxDeg = 100) {
      let best = null, bestD = Infinity;
      for (const m of managers) {
        const a = m.aim(px, pz, yaw, maxDeg, info);
        if (a !== null && info.dist < bestD) { best = a; bestD = info.dist; }
      }
      return best;
    },
    touches(px, py, pz, yaw) { return managers.some((m) => m.touches(px, py, pz, yaw)); },
    get downs() { return managers.reduce((s, m) => s + m.downs, 0); },
    get alive() { return managers.reduce((s, m) => s + m.alive, 0); },
    get list() { return managers.length === 1 ? managers[0].list : managers.flatMap((m) => m.list); },
  };
}
