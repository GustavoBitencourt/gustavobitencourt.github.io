import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import './RomaFredGame.css';

const MODELS = `${process.env.PUBLIC_URL || ''}/assets/models`;
const ENV_PATH = `${MODELS}/mata_caverna.glb`;
const CHAR_PATH = `${MODELS}/romanele_animado.glb`;

/* Constantes (metros, segundos) */
const WALK_SPEED = 1.25;      // velocidade para a qual o ciclo de andar foi feito
const RUN_SPEED = 3.4;        // velocidade para a qual o ciclo de correr foi feito
const GRAVITY = 16;
const JUMP_VEL = 5.2;
const RADIUS = 0.32;
const HEIGHT = 1.84;

const GROUPS = [
  ['Parado', 'Parado'], ['Andar', 'Andar'], ['Correr', 'Correr'],
  ['Pular', 'Pulo completo'], ['PuloInicio', 'Pulo: impulso'], ['PuloNoAr', 'Pulo: no ar'], ['PuloAterrissagem', 'Pulo: aterrissagem'],
  ['Ataque1', 'Ataque 1 · paulada de cima'], ['Ataque2', 'Ataque 2 · paulada lateral'],
];

const RomaFredGame = () => {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id) => root.querySelector(`#rf-${id}`);
    let disposed = false;
    let started = false;
    const cleanups = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    const isTouch = window.matchMedia('(pointer: coarse)').matches;

    /* ── renderer / cena ── */
    const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    $('stage').appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;

    const scene = new THREE.Scene();
    const FOG_COLOR = new THREE.Color(0xb9c8c9);
    scene.fog = new THREE.Fog(FOG_COLOR, 35, 150);
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 600);

    const sky = new Sky(); sky.scale.setScalar(450); scene.add(sky);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-35));
    sky.material.uniforms.turbidity.value = 6;
    sky.material.uniforms.rayleigh.value = 1.4;
    sky.material.uniforms.mieCoefficient.value = 0.006;
    sky.material.uniforms.mieDirectionalG.value = 0.8;
    sky.material.uniforms.sunPosition.value.copy(sunDir);

    const hemi = new THREE.HemisphereLight(0xdcecff, 0x4c5a35, 1.25); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    /* ── carregamento ── */
    const loader = new GLTFLoader();
    const progress = { env: 0, char: 0 };
    const SIZE_HINT = { env: 13659160, char: 16618336 };
    function showProgress() {
      const loaded = progress.env + progress.char, total = SIZE_HINT.env + SIZE_HINT.char;
      const p = Math.min(100, Math.round(loaded / total * 100));
      $('loadbar').style.width = p + '%';
      $('loadtxt').textContent = `${p}% · ${(loaded / 1e6).toFixed(1)} de ${(total / 1e6).toFixed(1)} MB`;
    }
    function loadGLB(url, key) {
      return loader.loadAsync(url, (xhr) => {
        if (disposed) return;
        if (xhr.lengthComputable) SIZE_HINT[key] = xhr.total;
        progress[key] = xhr.loaded; showProgress();
      });
    }

    let env, model, mixer, club;
    const actions = {}, clips = {};
    const octree = new Octree();
    const flames = []; const fireLights = [];

    function setupEnvironment(gltf) {
      env = gltf.scene; scene.add(env);
      const colliders = [];
      env.traverse((o) => {
        if (o.name && o.name.startsWith('Colisao')) { o.visible = false; if (o.isMesh) colliders.push(o); return; }
        if (o.isMesh) {
          const re = /Capim|Cavalinha|Folhinhas|Samambaia\d|Arbusto/;
          const grassy = re.test(o.name) || re.test((o.parent && o.parent.name) || '');
          o.castShadow = !grassy; o.receiveShadow = true;
          const m = o.material;
          if (m && m.name === 'Agua') { m.depthWrite = false; m.roughness = 0.05; }
          if (m && m.name === 'Fogo') { m.depthWrite = false; m.blending = THREE.AdditiveBlending; flames.push(o); o.castShadow = false; }
          if (m && m.name === 'Pintura') { m.depthWrite = false; m.polygonOffset = true; m.polygonOffsetFactor = -2; }
        }
        if (o.isLight) { o.userData.base = o.intensity; fireLights.push(o); o.castShadow = false; }
      });
      const colGroup = new THREE.Group();
      env.updateMatrixWorld(true);
      for (const c of colliders) { const m = c.clone(); m.matrix.copy(c.matrixWorld); m.matrixAutoUpdate = false; colGroup.add(m); }
      octree.fromGraphNode(colGroup);
    }

    function setupCharacter(gltf) {
      model = gltf.scene; scene.add(model);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
        if (o.name === 'Bastao') club = o;
      });
      mixer = new THREE.AnimationMixer(model);
      for (const c of gltf.animations) { clips[c.name] = c; actions[c.name] = mixer.clipAction(c); }
      mixer.addEventListener('finished', onActionFinished);
      buildClipList();
    }

    /* ── estado do jogador ── */
    const player = {
      capsule: new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS),
      vel: new THREE.Vector3(), onFloor: false, airTime: 0, yaw: 0,
      club: true, attacking: false, attackIndex: 0, queued: false, jumpTimer: -1, landing: 0,
      mode: 'play', current: null, stateLabel: 'Parado',
    };
    const input = { f: 0, b: 0, l: 0, r: 0, run: false, stick: new THREE.Vector2(), stickRun: false };
    const cam = { yaw: Math.PI, pitch: 0.32, dist: 4.6, target: new THREE.Vector3(), pos: new THREE.Vector3() };

    function placeAtSpawn() {
      const sp = env.getObjectByName('SpawnPlayer');
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      sp.getWorldPosition(p); sp.getWorldQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      player.yaw = Math.atan2(fwd.x, fwd.z);
      player.capsule.start.set(p.x, p.y + RADIUS + 0.02, p.z);
      player.capsule.end.set(p.x, p.y + HEIGHT - RADIUS, p.z);
      player.vel.set(0, 0, 0);
      cam.yaw = player.yaw + Math.PI;
    }

    const clipFor = (base) => `${base}_${player.club ? 'ComBastao' : 'SemBastao'}`;

    function play(name, { fade = 0.22, once = false, timeScale = 1, sync = false } = {}) {
      const next = actions[name]; if (!next) return null;
      const prev = player.current;
      if (prev === next) { next.setEffectiveTimeScale(timeScale); return next; }
      next.enabled = true;
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = once;
      next.reset();
      if (sync && prev && prev.getClip().duration > 0) next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
      next.setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
      if (prev) prev.fadeOut(fade);
      player.current = next;
      return next;
    }

    function setClub(isOn, announce = true) {
      player.club = isOn; if (club) club.visible = isOn;
      $('chip-club').className = 'chip' + (isOn ? '' : ' club-off');
      $('chip-club').innerHTML = `Bastão <b>${isOn ? 'Na mão' : 'Guardado'}</b>`;
      if (announce) toast(isOn ? 'Pegou o bastão' : 'Guardou o bastão');
      if (player.mode === 'play' && !player.attacking && player.current) {
        const n = player.current.getClip().name.replace(/_(Com|Sem)Bastao$/, '');
        play(clipFor(n), { fade: 0.25, sync: true });
      }
    }

    function attack() {
      if (!started || player.mode !== 'play') return;
      if (!player.club) { toast('Pegue o bastão (Q) para atacar'); return; }
      if (!player.onFloor || player.jumpTimer >= 0) return;
      if (player.attacking) {
        const a = player.current; if (a && a.time / a.getClip().duration > 0.45) player.queued = true;
        return;
      }
      startAttack();
    }
    function startAttack() {
      player.attacking = true; player.queued = false;
      player.attackIndex = player.attackIndex % 2 + 1;
      play(`Ataque${player.attackIndex}_ComBastao`, { fade: 0.12, once: true, timeScale: 1.05 });
    }
    function onActionFinished(e) {
      const name = e.action.getClip().name;
      if (name.startsWith('Ataque')) {
        if (player.queued && player.club) { startAttack(); return; }
        player.attacking = false;
        play(clipFor('Parado'), { fade: 0.3 });
      } else if (name.startsWith('PuloAterrissagem')) {
        player.landing = 0; play(clipFor('Parado'), { fade: 0.3 });
      }
    }

    function jump() {
      if (!started || player.mode !== 'play' || !player.onFloor || player.attacking || player.jumpTimer >= 0) return;
      if (Math.hypot(player.vel.x, player.vel.z) > 0.6) {
        // pulo em movimento: decola na hora e mantém o embalo
        player.vel.y = JUMP_VEL; player.onFloor = false; player.airTime = 0.01; player.landing = 0;
        play(clipFor('PuloNoAr'), { fade: 0.12 }); setState('Pulando');
        return;
      }
      player.jumpTimer = 0;
      play(clipFor('PuloInicio'), { fade: 0.08, once: true, timeScale: 1.8 });
    }

    /* ── modo visualizador de animações ── */
    function buildClipList() {
      const box = $('clip-list'); box.innerHTML = '';
      const sections = [['Com bastão', 'ComBastao'], ['Sem bastão', 'SemBastao']];
      for (const [label, suf] of sections) {
        const g = document.createElement('div'); g.className = 'group'; g.textContent = label; box.appendChild(g);
        for (const [base, title] of GROUPS) {
          const name = `${base}_${suf}`; if (!clips[name]) continue;
          const b = document.createElement('button'); b.type = 'button'; b.className = 'clip'; b.dataset.clip = name; b.setAttribute('aria-pressed', 'false');
          b.innerHTML = `<span>${title}</span><small>${clips[name].duration.toFixed(2)} s</small>`;
          b.addEventListener('click', () => enterViewer(name));
          box.appendChild(b);
        }
      }
    }
    function enterViewer(name) {
      player.mode = 'viewer'; player.attacking = false; player.queued = false; player.jumpTimer = -1; player.vel.set(0, 0, 0);
      setClub(name.endsWith('ComBastao'), false);
      play(name, { fade: 0.2, once: false });
      $('viewer-name').textContent = name; $('viewer-bar').hidden = false;
      root.querySelectorAll('.clip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.clip === name)));
      setState('Visualizando');
    }
    function exitViewer() {
      if (player.mode !== 'viewer') return;
      player.mode = 'play'; $('viewer-bar').hidden = true;
      root.querySelectorAll('.clip').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      play(clipFor('Parado'), { fade: 0.25 });
    }
    on($('viewer-exit'), 'click', exitViewer);
    on($('anims-toggle'), 'click', () => {
      const el = $('anims'); const collapsed = el.classList.toggle('collapsed');
      el.querySelector('.list').hidden = collapsed;
      $('anims-toggle').textContent = collapsed ? 'Mostrar' : 'Ocultar';
      $('anims-toggle').setAttribute('aria-expanded', String(!collapsed));
    });
    if (window.innerWidth < 900 || window.innerHeight < 600 || isTouch) $('anims-toggle').click();

    let toastTimer;
    function toast(msg) {
      const t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
    }
    function setState(label) {
      if (player.stateLabel !== label) { player.stateLabel = label; $('chip-state').innerHTML = `Estado <b>${label}</b>`; }
    }

    /* ── entrada ── */
    const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    on(window, 'keydown', (e) => {
      if (!started) return;
      if (e.target.closest && e.target.closest('button')) { if (e.code === 'Space' || e.code === 'Enter') return; }
      if (keyMap[e.code]) { input[keyMap[e.code]] = 1; if (player.mode === 'viewer') exitViewer(); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
      if (e.code === 'Space') { jump(); e.preventDefault(); }
      if (e.code === 'KeyF') attack();
      if (e.code === 'KeyQ' && !e.repeat) setClub(!player.club);
    });
    on(window, 'keyup', (e) => {
      if (keyMap[e.code]) input[keyMap[e.code]] = 0;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
    });
    on(window, 'blur', () => { input.f = input.b = input.l = input.r = 0; input.run = false; });

    // câmera: arrastar com mouse ou um dedo fora dos controles
    const canvas = renderer.domElement;
    let drag = null;
    on(canvas, 'pointerdown', (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId); canvas.focus();
    });
    on(canvas, 'pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      cam.yaw -= dx * 0.006; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -0.25, 1.15);
    });
    on(canvas, 'pointerup', (e) => {
      if (drag && drag.id === e.pointerId && drag.moved < 6 && e.pointerType === 'mouse' && e.button === 0) attack();
      drag = null;
    });
    on(canvas, 'wheel', (e) => {
      cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 2.0, 10); e.preventDefault();
    }, { passive: false });

    // analógico e botões de toque
    {
      const stick = $('stick'), knob = $('knob'); let sid = null;
      const move = (e) => {
        const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let x = (e.clientX - cx) / (r.width / 2), y = (e.clientY - cy) / (r.height / 2);
        const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
        input.stick.set(x, y); knob.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
        if (player.mode === 'viewer' && Math.hypot(x, y) > 0.3) exitViewer();
      };
      on(stick, 'pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); move(e); });
      on(stick, 'pointermove', (e) => { if (e.pointerId === sid) move(e); });
      const end = (e) => { if (e.pointerId !== sid) return; sid = null; input.stick.set(0, 0); knob.style.transform = ''; };
      on(stick, 'pointerup', end); on(stick, 'pointercancel', end);
      on($('t-jump'), 'pointerdown', (e) => { e.preventDefault(); jump(); });
      on($('t-atk'), 'pointerdown', (e) => { e.preventDefault(); attack(); });
      on($('t-club'), 'pointerdown', (e) => { e.preventDefault(); setClub(!player.club); });
      on($('t-run'), 'pointerdown', (e) => {
        e.preventDefault(); input.stickRun = !input.stickRun; $('t-run').classList.toggle('hot', input.stickRun);
      });
    }

    on(window, 'resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ── simulação ── */
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), wish = new THREE.Vector3();
    const ray = new THREE.Ray();
    function updatePlayer(dt) {
      // direção desejada a partir do yaw da câmera
      let ix = input.r - input.l, iz = input.f - input.b;
      let mag = Math.min(1, Math.hypot(ix, iz));
      if (input.stick.lengthSq() > 0.01) { ix = input.stick.x; iz = -input.stick.y; mag = Math.min(1, input.stick.length()); }
      const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
      const rgtX = Math.cos(cam.yaw), rgtZ = -Math.sin(cam.yaw);
      wish.set(fwdX * iz + rgtX * ix, 0, fwdZ * iz + rgtZ * ix);
      if (wish.lengthSq() > 1e-6) wish.normalize();
      const running = input.run || input.stickRun || input.stick.length() > 0.92;
      const locked = player.mode !== 'play' || player.attacking || player.jumpTimer >= 0 || player.landing > 0;
      const target = locked ? 0 : mag * (running ? RUN_SPEED : WALK_SPEED);

      const hv = tmp.set(player.vel.x, 0, player.vel.z);
      const desired = tmp2.copy(wish).multiplyScalar(target);
      const accel = player.onFloor ? (target > hv.length() ? 9 : 12) : 2.5;
      hv.lerp(desired, 1 - Math.exp(-accel * dt));
      player.vel.x = hv.x; player.vel.z = hv.z;

      if (target > 0.05) {
        const want = Math.atan2(wish.x, wish.z);
        let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        player.yaw += d * (1 - Math.exp(-10 * dt));
      }

      // tempo do pulo: decola perto do fim do clipe de impulso
      if (player.jumpTimer >= 0) {
        player.jumpTimer += dt;
        if (player.jumpTimer > 0.2 && player.onFloor) { player.vel.y = JUMP_VEL; player.onFloor = false; player.airTime = 0.01; }
        if (player.jumpTimer > 0.26) { player.jumpTimer = -1; play(clipFor('PuloNoAr'), { fade: 0.12 }); }
      }

      if (!player.onFloor) player.vel.y -= GRAVITY * dt;
      else if (player.vel.y < 0) player.vel.y = 0;

      player.capsule.translate(tmp.copy(player.vel).multiplyScalar(dt));
      const wasOnFloor = player.onFloor;
      player.onFloor = false;
      for (let i = 0; i < 3; i++) {
        const hit = octree.capsuleIntersect(player.capsule);
        if (!hit) break;
        if (hit.normal.y > 0.55) player.onFloor = true;
        else player.vel.addScaledVector(hit.normal, -hit.normal.dot(player.vel));
        player.capsule.translate(hit.normal.multiplyScalar(hit.depth));
      }
      // gruda no chão em pequenos degraus para baixo
      if (!player.onFloor && wasOnFloor && player.vel.y <= 0 && player.jumpTimer < 0) {
        ray.origin.copy(player.capsule.start); ray.direction.set(0, -1, 0);
        const h = octree.rayIntersect(ray);
        if (h && h.distance < RADIUS + 0.25) { player.capsule.translate(tmp.set(0, -(h.distance - RADIUS), 0)); player.onFloor = true; }
      }
      if (player.onFloor) player.vel.y = Math.max(player.vel.y, 0);
      if (!player.onFloor) player.airTime += dt;

      // aterrissagem
      if (player.onFloor && player.airTime > 0.18) {
        const moving = Math.hypot(player.vel.x, player.vel.z) > 0.6;
        if (!moving && player.mode === 'play' && !player.attacking) {
          player.landing = 0.35; play(clipFor('PuloAterrissagem'), { fade: 0.08, once: true, timeScale: 1.25 });
        }
        player.airTime = 0;
      } else if (player.onFloor) player.airTime = 0;
      if (player.landing > 0) player.landing -= dt;

      // caiu para fora do mundo
      if (player.capsule.start.y < -20) placeAtSpawn();

      model.position.set(player.capsule.start.x, player.capsule.start.y - RADIUS, player.capsule.start.z);
      model.rotation.y = player.yaw;
    }

    function updateAnimation() {
      if (player.mode !== 'play' || player.attacking || player.jumpTimer >= 0) {
        if (player.attacking) setState('Atacando');
        else if (player.jumpTimer >= 0) setState('Pulando');
        return;
      }
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (!player.onFloor && (player.airTime > 0.12 || player.vel.y > 0.5)) {
        play(clipFor('PuloNoAr'), { fade: 0.2 }); setState(player.vel.y > 0 ? 'Pulando' : 'No ar'); return;
      }
      if (player.landing > 0 && speed < 0.6) { setState('Aterrissando'); return; }
      if (speed > 2.15) {
        play(clipFor('Correr'), { fade: 0.25, sync: true, timeScale: THREE.MathUtils.clamp(speed / RUN_SPEED, 0.7, 1.25) }); setState('Correndo');
      } else if (speed > 0.15) {
        play(clipFor('Andar'), { fade: 0.25, sync: true, timeScale: THREE.MathUtils.clamp(speed / WALK_SPEED, 0.55, 1.6) }); setState('Andando');
      } else { play(clipFor('Parado'), { fade: 0.3 }); setState('Parado'); }
    }

    function updateCamera(dt) {
      cam.target.set(model.position.x, model.position.y + 1.45, model.position.z);
      const cp = Math.cos(cam.pitch);
      const dir = tmp.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).normalize();
      let dist = cam.dist;
      ray.origin.copy(cam.target); ray.direction.copy(dir);
      const hit = octree.rayIntersect(ray);
      if (hit && hit.distance < dist + 0.3) dist = Math.max(0.6, hit.distance - 0.3);
      const want = tmp2.copy(cam.target).addScaledVector(dir, dist);
      cam.pos.lerp(want, 1 - Math.exp(-12 * dt));
      camera.position.copy(cam.pos); camera.lookAt(cam.target);
    }

    // interior da caverna: diminui a luz do céu conforme entra
    const caveZ = { mouth: -10.5, deep: -16 };
    function updateAmbience(t) {
      const p = model.position;
      const inX = 1 - THREE.MathUtils.smoothstep(Math.abs(p.x), 4.5, 6.5);
      const depth = THREE.MathUtils.smoothstep(-p.z, -caveZ.mouth, -caveZ.deep) * inX;
      hemi.intensity = THREE.MathUtils.lerp(1.25, 0.32, depth);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.25, depth);
      const label = depth > 0.5 ? 'Caverna' : (Math.hypot(p.x, p.z + 3) < 16 ? 'Clareira' : 'Mata');
      const el = $('chip-place'); if (el.dataset.v !== label) { el.dataset.v = label; el.innerHTML = `Local <b>${label}</b>`; }
      // fogo tremulando
      for (const L of fireLights) L.intensity = L.userData.base * (0.82 + 0.12 * Math.sin(t * 11.3 + L.id) + 0.08 * Math.sin(t * 23.7 + L.id * 2.1));
      for (const f of flames) { f.scale.y = 1 + 0.08 * Math.sin(t * 13 + f.id); f.scale.x = 1 + 0.05 * Math.sin(t * 9.1 + f.id * 1.7); }
      // sombras do sol acompanham o jogador
      sun.target.position.copy(p); sun.position.copy(p).addScaledVector(sunDir, 70);
    }

    /* ── loop ── */
    const timer = new THREE.Timer();
    function start() {
      placeAtSpawn();
      setClub(true, false);
      play(clipFor('Parado'), { fade: 0 });
      model.position.copy(player.capsule.start).y -= RADIUS; model.rotation.y = player.yaw;
      cam.target.set(model.position.x, model.position.y + 1.45, model.position.z);
      cam.pos.copy(cam.target).add(new THREE.Vector3(Math.sin(cam.yaw), 0.35, Math.cos(cam.yaw)).multiplyScalar(cam.dist));
      renderer.setAnimationLoop(frame);
    }
    function frame() {
      timer.update();
      const dt = Math.min(timer.getDelta(), 1 / 20);
      const t = timer.getElapsed();
      const steps = 4;
      for (let i = 0; i < steps; i++) updatePlayer(dt / steps);
      updateAnimation();
      mixer.update(dt);
      updateCamera(dt);
      updateAmbience(t);
      renderer.render(scene, camera);
    }

    // tela inicial: "Jogar" aparece quando tudo carregou
    on($('play'), 'click', () => {
      started = true;
      $('loading').hidden = true;
      canvas.focus();
    });

    (async () => {
      try {
        const [envGltf, charGltf] = await Promise.all([loadGLB(ENV_PATH, 'env'), loadGLB(CHAR_PATH, 'char')]);
        if (disposed) return;
        setupEnvironment(envGltf);
        setupCharacter(charGltf);
        start();
        $('loadcopy').hidden = true;
        $('loadprog').hidden = true;
        $('play').hidden = false;
        $('play').focus();
      } catch (err) {
        console.error(err);
        if (!disposed) $('loadtxt').innerHTML = '<span class="err">Não foi possível carregar os modelos. Recarregue a página para tentar de novo.</span>';
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(toastTimer);
      renderer.setAnimationLoop(null);
      cleanups.forEach((fn) => fn());
      if (mixer) mixer.stopAllAction();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            Object.values(m).forEach((v) => v && v.isTexture && v.dispose());
            m.dispose();
          });
        }
      });
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return (
    <div className="rf-root" ref={rootRef}>
      <div id="rf-stage" aria-label="Cena 3D: o personagem na mata pré-histórica" />

      <div id="rf-loading" role="status" aria-live="polite">
        <div className="card">
          <h1>Romanele <span>na Mata</span></h1>
          <p id="rf-loadcopy">Carregando o personagem riggado e a mata com a caverna. São cerca de 30&nbsp;MB.</p>
          <div id="rf-loadprog">
            <div className="bar" aria-hidden="true"><i id="rf-loadbar" /></div>
            <div id="rf-loadtxt">0%</div>
          </div>
          <button id="rf-play" type="button" hidden>Jogar</button>
          <Link to="/" className="rf-back">← Voltar ao portfólio</Link>
        </div>
      </div>

      <div className="hud" id="rf-brand">
        <h1>Romanele <span>na Mata</span></h1>
        <div className="chips">
          <span className="chip" id="rf-chip-state">Estado <b>Parado</b></span>
          <span className="chip" id="rf-chip-club">Bastão <b>Na mão</b></span>
          <span className="chip" id="rf-chip-place">Local <b>Caverna</b></span>
        </div>
      </div>

      <div className="hud panel" id="rf-keys" aria-label="Controles">
        <div className="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>andar</span>
        <div className="k"><kbd>Shift</kbd></div><span>correr</span>
        <div className="k"><kbd>Espaço</kbd></div><span>pular</span>
        <div className="k"><kbd>Clique</kbd><kbd>F</kbd></div><span>atacar (com bastão)</span>
        <div className="k"><kbd>Q</kbd></div><span>pegar / guardar bastão</span>
        <div className="k"><kbd>Arrastar</kbd><kbd>Roda</kbd></div><span>girar e aproximar câmera</span>
      </div>

      <aside className="hud panel" id="rf-anims" aria-label="Animações">
        <header>
          <h2>Animações</h2>
          <button className="btn ghost" id="rf-anims-toggle" type="button" aria-expanded="true">Ocultar</button>
        </header>
        <div className="list" id="rf-clip-list" />
      </aside>

      <div className="hud panel" id="rf-viewer-bar" hidden>
        <span>Visualizando <strong id="rf-viewer-name" /></span>
        <button className="btn" id="rf-viewer-exit" type="button">Voltar a jogar</button>
      </div>

      <div className="hud panel" id="rf-toast" role="status" aria-live="polite" />

      <div className="hud" id="rf-touch" aria-hidden="true">
        <div id="rf-stick"><div id="rf-knob" /></div>
        <div id="rf-tbtns">
          <button id="rf-t-club" type="button">BASTÃO</button>
          <button id="rf-t-run" type="button">CORRER</button>
          <button id="rf-t-jump" type="button">PULAR</button>
          <button id="rf-t-atk" type="button">ATACAR</button>
        </div>
      </div>
    </div>
  );
};

export default RomaFredGame;
