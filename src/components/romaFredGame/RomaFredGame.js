import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createMusic } from './music.js';
import { createDinoManager, DINO_TYPES } from './dinos.js';
import { createSfx } from './sfx.js';
import './RomaFredGame.css';

const MODELS = `${process.env.PUBLIC_URL || ''}/assets/models`;
const MATA_PATH = `${MODELS}/mata_caverna.glb`;
const FESTA_PATH = `${MODELS}/festa_balada.glb`;
const CHAR_PATH = `${MODELS}/romanele_animado.glb`;

/* Constantes (metros, segundos) */
const WALK_SPEED = 1.25;      // velocidade para a qual o ciclo de andar foi feito
const RUN_SPEED = 3.4;        // velocidade para a qual o ciclo de correr foi feito
const GRAVITY = 16;
const JUMP_VEL = 5.2;
const RADIUS = 0.32;
const HEIGHT = 1.84;
const BPM = 120, SPB = 60 / BPM; // público, luzes e danças do Romanele são todos a 120 BPM
const PERSON_R = 0.16, PLAYER_PEOPLE_R = 0.22;

const GROUPS = [
  ['Dancar', 'Dança com bastão'], ['Dancar1', 'Dança 1 · braços pra cima'], ['Dancar2', 'Dança 2 · passinho'],
  ['Parado', 'Parado'], ['Andar', 'Andar'], ['Correr', 'Correr'],
  ['Pular', 'Pulo completo'], ['PuloInicio', 'Pulo: impulso'], ['PuloNoAr', 'Pulo: no ar'], ['PuloAterrissagem', 'Pulo: aterrissagem'],
  ['Ataque1', 'Ataque 1 · paulada de cima'], ['Ataque2', 'Ataque 2 · paulada lateral'],
];

/* Marcadores da festa: [nome no GLB, botão, aviso] */
const PLACES = [
  ['SpawnPlayer', 'Entrada', 'Na entrada'],
  ['PistaCentro', 'Pista', 'No meio da pista'],
  ['BarTerreo', 'Bar', 'No bar do térreo'],
  ['DJ_Posicao', 'DJ', 'Na cabine do DJ'],
  ['EscadaBase', 'Escada', 'No pé da escada'],
  ['EscadaTopo', 'Topo da escada', 'No topo da escada'],
  ['Camarote_Vista', 'Camarote', 'No camarote, com vista para a pista'],
  ['Camarote_Vista_Sul', 'Camarote sul', 'No camarote sul'],
  ['BarCamarote', 'Bar do camarote', 'No bar do camarote'],
];

const RomaFredGame = () => {
  const rootRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const $ = (id) => root.querySelector(`#rf-${id}`);
    let disposed = false;
    let started = false;
    let busy = false; // trocando de mundo
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
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 600);

    // Ambiente da mata: céu, sol e luz hemisférica
    const mataFog = new THREE.Fog(0xb9c8c9, 35, 150);
    const mataLights = new THREE.Group(); scene.add(mataLights);
    const sky = new Sky(); sky.scale.setScalar(450); mataLights.add(sky);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(-35));
    sky.material.uniforms.turbidity.value = 6;
    sky.material.uniforms.rayleigh.value = 1.4;
    sky.material.uniforms.mieCoefficient.value = 0.006;
    sky.material.uniforms.mieDirectionalG.value = 0.8;
    sky.material.uniforms.sunPosition.value.copy(sunDir);

    const hemi = new THREE.HemisphereLight(0xdcecff, 0x4c5a35, 1.25); mataLights.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    mataLights.add(sun, sun.target);

    // Ambiente da festa: escuro, neblina roxa e uma luz suave no rosto que segue o jogador
    const festaFog = new THREE.FogExp2(0x1a0b24, 0.018);
    const festaBg = new THREE.Color(0x05030a);
    const festaLights = new THREE.Group(); festaLights.visible = false; scene.add(festaLights);
    festaLights.add(new THREE.HemisphereLight(0x8a5cff, 0x200a18, 0.55));
    festaLights.add(new THREE.AmbientLight(0x3a2050, 0.35));
    const fill = new THREE.PointLight(0xffd9c4, 7, 7, 2); festaLights.add(fill);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.5, 0.5, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    let useBloom = !isTouch;

    /* ── carregamento ── */
    const loader = new GLTFLoader();
    const progress = { mata: 0, char: 0, festa: 0, raptor: 0, trex: 0, inflavel: 0 };
    const SIZE_HINT = { mata: 13659160, char: 17057072, festa: 21971364, raptor: 1502832, trex: 1515896, inflavel: 1099968 };
    let progressKeys = ['mata', 'char', 'raptor', 'trex', 'inflavel'];
    function showProgress() {
      const loaded = progressKeys.reduce((s, k) => s + progress[k], 0);
      const total = progressKeys.reduce((s, k) => s + SIZE_HINT[k], 0);
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

    /* ── mundos ── */
    const worlds = {};   // { mata, festa }: { root, octree, markers, people, personObjs, mixer }
    let world = null;
    let model, mixer, club, dinos, feet = [];
    const actions = {}, clips = {};
    const flames = []; const fireLights = [];

    function setupMata(gltf) {
      const env = gltf.scene; scene.add(env);
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
      worlds.mata = {
        name: 'mata', root: env, octree: buildOctree(env, colliders),
        markers: { SpawnPlayer: env.getObjectByName('SpawnPlayer') }, people: [], personObjs: [], mixer: null,
      };
    }

    // Dinossauros: vêm quando o Romanele sai 2 m da caverna e caem com uma bastada
    function setupDinos(templates) {
      const caveMouth = new THREE.Vector3();
      worlds.mata.root.getObjectByName('EntradaCaverna').getWorldPosition(caveMouth);
      dinos = createDinoManager({
        scene, templates, caveMouth,
        onWave: (n, count) => toast(n === 1 ? `Dinossauros vindo! (${count})` : `Onda ${n}: ${count} dinossauros`),
        onDown: (count, d) => {
          clubSound(true);
          $('chip-dinos').innerHTML = `Dinos <b>${count} no chão</b>`;
          toast(`${d.cfg.label} derrubado!`);
        },
        onPlayerHit: (dx, dz) => {
          // empurrão da mordida / rabada
          stopDance();
          player.vel.x += dx * 3.2; player.vel.z += dz * 3.2;
          if (player.onFloor) { player.vel.y = 2; player.onFloor = false; player.airTime = 0.01; }
          const el = $('hurt'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
          toast('O dino pegou o Romanele!');
        },
      });
    }

    function setupFesta(gltf) {
      const party = gltf.scene; party.visible = false; scene.add(party);
      const colliders = [], markers = {}, people = [], personObjs = [];
      party.traverse((o) => {
        if (o.name && o.name.startsWith('Colisao')) { o.visible = false; if (o.isMesh) colliders.push(o); return; }
        if (o.isMesh) {
          const m = o.material;
          if (m.userData && m.userData.blending === 'additive') { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; o.renderOrder = 10; }
          if (m.name === 'Vidro') m.depthWrite = false;
        }
        if (o.userData && o.userData.marcador) markers[o.name] = o;
      });
      party.updateMatrixWorld(true);
      party.traverse((o) => {
        if (o.userData && o.userData.pessoa) { const p = new THREE.Vector3(); o.getWorldPosition(p); people.push([p.x, p.y, p.z]); personObjs.push(o); }
      });
      const octree = buildOctree(party, colliders);
      const partyMixer = new THREE.AnimationMixer(party);
      for (const c of gltf.animations) partyMixer.clipAction(c).play();
      partyMixer.update(0.001);
      party.updateMatrixWorld(true);
      // dançarinos com esqueleto: limites a partir da pose atual, com folga para os braços erguidos
      party.traverse((o) => { if (o.isSkinnedMesh) { o.computeBoundingSphere(); o.boundingSphere.radius = o.boundingSphere.radius * 1.5 + 0.3; } });
      worlds.festa = { name: 'festa', root: party, octree, markers, people, personObjs, mixer: partyMixer };
    }

    function buildOctree(env, colliders) {
      const octree = new Octree();
      const colGroup = new THREE.Group();
      env.updateMatrixWorld(true);
      for (const c of colliders) { const m = c.clone(); m.matrix.copy(c.matrixWorld); m.matrixAutoUpdate = false; colGroup.add(m); }
      octree.fromGraphNode(colGroup);
      return octree;
    }

    function setupCharacter(gltf) {
      model = gltf.scene; scene.add(model);
      model.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
        if (o.name === 'Bastao') club = o;
      });
      feet = ['LeftFoot', 'RightFoot'].map((n) => ({ bone: model.getObjectByName(n), minH: Infinity, armed: true, cool: 0 }));
      mixer = new THREE.AnimationMixer(model);
      for (const c of gltf.animations) { clips[c.name] = c; actions[c.name] = mixer.clipAction(c); }
      mixer.addEventListener('finished', onActionFinished);
      buildClipList();
    }

    function setWorld(name, markerName = 'SpawnPlayer') {
      world = worlds[name];
      const festa = name === 'festa';
      if (worlds.mata) worlds.mata.root.visible = !festa;
      if (worlds.festa) worlds.festa.root.visible = festa;
      mataLights.visible = !festa;
      festaLights.visible = festa;
      scene.fog = festa ? festaFog : mataFog;
      scene.background = festa ? festaBg : null;
      renderer.toneMappingExposure = festa ? 1.0 : 0.95;
      if (!festa && music.on) toggleMusic();
      if (dinos) { dinos.reset(); dinos.setVisible(!festa); }
      root.dataset.world = name;
      $('brand-where').textContent = festa ? 'na Xalassa' : 'na Mata';
      $('world').textContent = festa ? 'Voltar para a mata' : 'Ir para a Xalassa';
      exitViewer(); stopDance();
      player.attacking = false; player.queued = false; player.jumpTimer = -1; player.landing = 0;
      placeAt(markerName);
      play(clipFor('Parado'), { fade: 0.2 });
    }

    /* ── estado do jogador ── */
    const player = {
      capsule: new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS),
      vel: new THREE.Vector3(), onFloor: false, airTime: 0, yaw: 0,
      club: true, attacking: false, attackIndex: 0, queued: false, jumpTimer: -1, landing: 0,
      mode: 'play', current: null, stateLabel: 'Parado', dance: null, danceNext: 1, swingId: 0,
    };
    const input = { f: 0, b: 0, l: 0, r: 0, walk: false, stick: new THREE.Vector2(), stickWalk: false };
    const cam = { yaw: Math.PI, pitch: 0.32, dist: 4.4, target: new THREE.Vector3(), pos: new THREE.Vector3() };
    let partyClock = 0;

    function placeAt(name) {
      const mk = world.markers[name]; if (!mk) return;
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      mk.getWorldPosition(p); mk.getWorldQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      player.yaw = Math.atan2(fwd.x, fwd.z);
      player.capsule.start.set(p.x, p.y + RADIUS + 0.02, p.z);
      player.capsule.end.set(p.x, p.y + HEIGHT - RADIUS, p.z);
      player.vel.set(0, 0, 0);
      cam.yaw = player.yaw + Math.PI;
      cam.pitch = name.startsWith('Camarote') ? 0.42 : (world.name === 'festa' ? 0.28 : 0.32);
      model.position.set(p.x, p.y, p.z); model.rotation.y = player.yaw;
      cam.target.set(p.x, p.y + 1.45, p.z);
      cam.pos.copy(cam.target).add(new THREE.Vector3(Math.sin(cam.yaw), 0.35, Math.cos(cam.yaw)).multiplyScalar(cam.dist));
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

    /* ── dança (no tempo da festa) ── */
    function danceName(which) {
      if (which === 3 || (which === 0 && player.club)) return 'Dancar_ComBastao';
      return which === 2 ? 'Dancar2_SemBastao' : 'Dancar1_SemBastao';
    }
    function startDance(which = 0) {
      if (!started || player.mode !== 'play' || !player.onFloor || player.attacking || player.jumpTimer >= 0) return;
      if (which === 3 && !player.club) setClub(true, false);
      if ((which === 1 || which === 2) && player.club) setClub(false, false);
      if (which === 0 && !player.club) { which = player.danceNext; player.danceNext = which === 1 ? 2 : 1; }
      const name = danceName(which);
      player.dance = name;
      const a = play(name, { fade: 0.3 });
      if (a) a.time = partyClock % a.getClip().duration;
      setState('Dançando');
    }
    function stopDance() { player.dance = null; }

    function setClub(isOn, announce = true) {
      player.club = isOn; if (club) club.visible = isOn;
      $('chip-club').className = 'chip' + (isOn ? '' : ' off');
      $('chip-club').innerHTML = `Bastão <b>${isOn ? 'Na mão' : 'Guardado'}</b>`;
      if (announce) toast(isOn ? 'Pegou o bastão' : 'Guardou o bastão');
      if (player.mode === 'play' && !player.attacking && player.current) {
        if (player.dance) { startDance(isOn ? 3 : 1); return; }
        const n = player.current.getClip().name.replace(/_(Com|Sem)Bastao$/, '');
        if (!n.startsWith('Dancar')) play(clipFor(n), { fade: 0.25, sync: true });
      }
    }

    function attack() {
      if (!started || player.mode !== 'play') return;
      if (!player.club) { toast('Pegue o bastão (Q) para atacar'); return; }
      if (!player.onFloor || player.jumpTimer >= 0) return;
      stopDance();
      if (player.attacking) {
        const a = player.current; if (a && a.time / a.getClip().duration > 0.45) player.queued = true;
        return;
      }
      startAttack();
    }
    function startAttack() {
      player.attacking = true; player.queued = false; player.swingId += 1;
      swingSound = { id: player.swingId, done: false };
      if (dinos && world === worlds.mata) {
        const yaw = dinos.aim(model.position.x, model.position.z, player.yaw);
        if (yaw !== null) player.yaw = yaw;
      }
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
      stopDance();
      if (Math.hypot(player.vel.x, player.vel.z) > 0.6) {
        // pulo em movimento: decola na hora e mantém o embalo
        player.vel.y = JUMP_VEL; player.onFloor = false; player.airTime = 0.01; player.landing = 0;
        sfx.play('salto');
        play(clipFor('PuloNoAr'), { fade: 0.12 }); setState('Pulando');
        return;
      }
      player.jumpTimer = 0;
      play(clipFor('PuloInicio'), { fade: 0.08, once: true, timeScale: 1.8 });
    }

    /* ── modo visualizador de animações ── */
    function buildClipList() {
      const box = $('clip-list'); box.innerHTML = '';
      for (const [label, suf] of [['Com bastão', 'ComBastao'], ['Sem bastão', 'SemBastao']]) {
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
      player.mode = 'viewer'; player.attacking = false; player.queued = false; player.jumpTimer = -1; player.vel.set(0, 0, 0); player.dance = null;
      setClub(name.endsWith('ComBastao'), false);
      const a = play(name, { fade: 0.2 });
      if (a && name.startsWith('Dancar')) a.time = partyClock % a.getClip().duration;
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
      $('anims-toggle').textContent = collapsed ? 'Mostrar' : 'Ocultar';
      $('anims-toggle').setAttribute('aria-expanded', String(!collapsed));
    });
    if (window.innerWidth < 900 || window.innerHeight < 640 || isTouch) $('anims-toggle').click();
    on($('opts-toggle'), 'click', () => {
      const open = root.classList.toggle('opts-open');
      $('opts-toggle').setAttribute('aria-expanded', String(open)); $('opts-toggle').textContent = open ? 'Fechar' : 'Opções';
    });
    const closeOpts = () => { if (root.classList.contains('opts-open')) $('opts-toggle').click(); };

    // Botões "Ir para" dentro da festa
    function goToPlace(marker, msg) {
      if (world !== worlds.festa || !world.markers[marker]) return;
      exitViewer(); stopDance(); placeAt(marker); renderer.domElement.focus(); closeOpts(); toast(msg);
    }
    for (const [marker, label, msg] of PLACES) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.textContent = label;
      b.dataset.go = marker;
      on(b, 'click', () => goToPlace(marker, msg));
      $('places').appendChild(b);
    }

    let toastTimer;
    function toast(msg) {
      const t = $('toast'); t.textContent = msg; t.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
    }
    function setState(label) {
      if (player.stateLabel !== label) { player.stateLabel = label; $('chip-state').innerHTML = `Estado <b>${label}</b>`; }
    }

    /* ── som: batida house de 120 BPM gerada ao vivo, no tempo das luzes ── */
    const music = createMusic(SPB);
    function toggleMusic() {
      if (music.on) { music.stop(); $('music').textContent = 'Ligar som'; $('music').setAttribute('aria-pressed', 'false'); }
      else {
        music.start(partyClock); $('music').textContent = 'Desligar som'; $('music').setAttribute('aria-pressed', 'true');
        toast('Som ligado: 120 BPM, no tempo das luzes');
      }
    }
    on($('music'), 'click', toggleMusic);
    on($('bloom'), 'click', () => {
      useBloom = !useBloom; $('bloom').setAttribute('aria-pressed', String(useBloom));
      toast(useBloom ? 'Brilho das luzes ligado' : 'Brilho desligado (mais leve)');
    });
    $('bloom').setAttribute('aria-pressed', String(useBloom));

    /* ── troca de mundo: mata ⇄ Xalassa ── */
    async function goToFesta() {
      if (!worlds.festa) {
        busy = true;
        progressKeys = ['festa'];
        $('loadtitle').innerHTML = 'Indo para a <span>Xalassa</span>';
        $('loadcopy').textContent = 'Carregando a balada à fantasia: 339 pessoas dançando, DJ, luzes e dois andares. São cerca de 22 MB.';
        $('loadcopy').hidden = false; $('loadprog').hidden = false; $('play').hidden = true; $('back').hidden = true;
        $('loading').classList.add('festa-load'); $('loading').hidden = false;
        showProgress();
        try {
          const gltf = await loadGLB(FESTA_PATH, 'festa');
          if (disposed) return;
          setupFesta(gltf);
        } catch (err) {
          console.error(err);
          if (!disposed) {
            $('loadtxt').innerHTML = '<span class="err">Não foi possível carregar a festa. Tente de novo.</span>';
            setTimeout(() => { if (!disposed) $('loading').hidden = true; }, 2500);
          }
          busy = false;
          return;
        }
        $('loading').hidden = true;
        busy = false;
      }
      setWorld('festa', 'SpawnPlayer');
      toast('Bem-vindo à Xalassa! Aperte E para dançar e ligue o som no painel');
    }
    on($('world'), 'click', () => {
      if (busy || !started) return;
      closeOpts();
      if (world === worlds.festa) { setWorld('mata', 'SpawnPlayer'); toast('De volta à mata'); }
      else goToFesta();
      renderer.domElement.focus();
    });

    /* ── entrada ── */
    const keyMap = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
    on(window, 'keydown', (e) => {
      if (!started || busy) return;
      if (e.target.closest && e.target.closest('button')) { if (e.code === 'Space' || e.code === 'Enter') return; }
      if (keyMap[e.code]) { input[keyMap[e.code]] = 1; if (player.mode === 'viewer') exitViewer(); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.walk = true;
      if (e.code === 'Space') { jump(); e.preventDefault(); }
      if (e.code === 'KeyF') attack();
      if (e.repeat) return;
      if (e.code === 'KeyQ') setClub(!player.club);
      if (e.code === 'KeyE') startDance(0);
      if (e.code === 'Digit1') startDance(1);
      if (e.code === 'Digit2') startDance(2);
      if (e.code === 'Digit3') startDance(3);
    });
    on(window, 'keyup', (e) => {
      if (keyMap[e.code]) input[keyMap[e.code]] = 0;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.walk = false;
    });
    on(window, 'blur', () => { input.f = input.b = input.l = input.r = 0; input.walk = false; });

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
      cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 1.8, 10); e.preventDefault();
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
      on($('t-dance'), 'pointerdown', (e) => { e.preventDefault(); startDance(0); });
      on($('t-up'), 'pointerdown', (e) => {
        e.preventDefault(); if (world !== worlds.festa) return;
        exitViewer(); stopDance(); placeAt('Camarote_Vista');
      });
      on($('t-walk'), 'pointerdown', (e) => {
        e.preventDefault(); input.stickWalk = !input.stickWalk; $('t-walk').classList.toggle('hot', input.stickWalk);
      });
    }

    on(window, 'resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ── simulação ── */
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), wish = new THREE.Vector3();
    const ray = new THREE.Ray();
    function pushOutOfPeople() {
      const c = player.capsule.start, feet = c.y - RADIUS, minD = PERSON_R + PLAYER_PEOPLE_R;
      for (const p of world.people) {
        if (Math.abs(p[1] - feet) > 1.2) continue;
        const dx = c.x - p[0], dz = c.z - p[2]; const d2 = dx * dx + dz * dz;
        if (d2 < minD * minD && d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (minD - d) / d;
          player.capsule.translate(tmp2.set(dx * k, 0, dz * k));
        }
      }
    }
    function updatePlayer(dt) {
      const octree = world.octree;
      // direção desejada a partir do yaw da câmera
      let ix = input.r - input.l, iz = input.f - input.b;
      let mag = Math.min(1, Math.hypot(ix, iz));
      if (input.stick.lengthSq() > 0.01) { ix = input.stick.x; iz = -input.stick.y; mag = Math.min(1, input.stick.length()); }
      if (mag > 0.1 && player.dance) stopDance();
      const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
      const rgtX = Math.cos(cam.yaw), rgtZ = -Math.sin(cam.yaw);
      wish.set(fwdX * iz + rgtX * ix, 0, fwdZ * iz + rgtZ * ix);
      if (wish.lengthSq() > 1e-6) wish.normalize();
      // corre por padrão; Shift (ou o botão ANDAR no celular) faz ele caminhar
      const running = !(input.walk || input.stickWalk);
      const locked = !started || player.mode !== 'play' || player.attacking || player.jumpTimer >= 0 || player.landing > 0 || player.dance;
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
        if (player.jumpTimer > 0.2 && player.onFloor) { player.vel.y = JUMP_VEL; player.onFloor = false; player.airTime = 0.01; sfx.play('salto'); }
        if (player.jumpTimer > 0.26) { player.jumpTimer = -1; play(clipFor('PuloNoAr'), { fade: 0.12 }); }
      }

      if (!player.onFloor) player.vel.y -= GRAVITY * dt;
      else if (player.vel.y < 0) player.vel.y = 0;

      player.capsule.translate(tmp.copy(player.vel).multiplyScalar(dt));
      pushOutOfPeople();
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
        if (h && h.distance < RADIUS + 0.3) { player.capsule.translate(tmp.set(0, -(h.distance - RADIUS), 0)); player.onFloor = true; }
      }
      if (player.onFloor) player.vel.y = Math.max(player.vel.y, 0);
      if (!player.onFloor) player.airTime += dt;

      // aterrissagem
      if (player.onFloor && player.airTime > 0.18) {
        // quanto mais tempo no ar, mais forte a queda
        sfx.play('queda', { volume: THREE.MathUtils.clamp(0.5 + player.airTime * 0.6, 0.5, 1) });
        const moving = Math.hypot(player.vel.x, player.vel.z) > 0.6;
        if (!moving && player.mode === 'play' && !player.attacking) {
          player.landing = 0.35; play(clipFor('PuloAterrissagem'), { fade: 0.08, once: true, timeScale: 1.25 });
        }
        player.airTime = 0;
      } else if (player.onFloor) player.airTime = 0;
      if (player.landing > 0) player.landing -= dt;

      // caiu para fora do mundo
      if (player.capsule.start.y < -10) placeAt('SpawnPlayer');

      model.position.set(player.capsule.start.x, player.capsule.start.y - RADIUS, player.capsule.start.z);
      model.rotation.y = player.yaw;
    }

    function updateAnimation() {
      if (player.dance && player.mode === 'play') {
        const a = player.current;
        if (a && a.getClip().name === player.dance) {
          const dur = a.getClip().duration, want = partyClock % dur, diff = Math.abs(a.time - want);
          if (diff > 0.06 && diff < dur - 0.06) a.time = want;
        }
        setState('Dançando');
        return;
      }
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
      const hit = world.octree.rayIntersect(ray);
      if (hit && hit.distance < dist + 0.3) dist = Math.max(0.6, hit.distance - 0.3);
      const want = tmp2.copy(cam.target).addScaledVector(dir, dist);
      cam.pos.lerp(want, 1 - Math.exp(-12 * dt));
      camera.position.copy(cam.pos); camera.lookAt(cam.target);
    }

    // mata: interior da caverna escurece conforme entra
    const caveZ = { mouth: -10.5, deep: -16 };
    function updateMata(t) {
      const p = model.position;
      const inX = 1 - THREE.MathUtils.smoothstep(Math.abs(p.x), 4.5, 6.5);
      const depth = THREE.MathUtils.smoothstep(-p.z, -caveZ.mouth, -caveZ.deep) * inX;
      hemi.intensity = THREE.MathUtils.lerp(1.25, 0.32, depth);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.25, depth);
      setPlace(depth > 0.5 ? 'Caverna' : (Math.hypot(p.x, p.z + 3) < 16 ? 'Clareira' : 'Mata'));
      // fogo tremulando
      for (const L of fireLights) L.intensity = L.userData.base * (0.82 + 0.12 * Math.sin(t * 11.3 + L.id) + 0.08 * Math.sin(t * 23.7 + L.id * 2.1));
      for (const f of flames) { f.scale.y = 1 + 0.08 * Math.sin(t * 13 + f.id); f.scale.x = 1 + 0.05 * Math.sin(t * 9.1 + f.id * 1.7); }
      // sombras do sol acompanham o jogador
      sun.target.position.copy(p); sun.position.copy(p).addScaledVector(sunDir, 70);
    }

    // festa: pessoas entre a câmera e o Romanele somem para ele não sumir na multidão
    function areaOf(p) {
      if (p.y > 2.5) return p.x < -12.4 ? 'Bar do camarote' : 'Camarote';
      if (p.x < -12.4 && Math.abs(p.z) < 2.8) return 'Entrada';
      if (p.z < -9.2 && p.x > -7.6 && p.x < 3.6) return 'Bar';
      if (p.x > 9.5) return 'Palco';
      return 'Pista';
    }
    let lastBeat = -1;
    function updateFesta() {
      const { people, personObjs } = world;
      const ax = cam.pos.x, ay = cam.pos.y, az = cam.pos.z;
      const abx = cam.target.x - ax, aby = cam.target.y - 0.3 - ay, abz = cam.target.z - az;
      const L2 = Math.max(abx * abx + aby * aby + abz * abz, 1e-6);
      for (let i = 0; i < people.length; i++) {
        const p = people[i], px = p[0], py = p[1] + 1.1, pz = p[2];
        let t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / L2; t = Math.min(1, Math.max(0, t));
        const dx = ax + abx * t - px, dy = ay + aby * t - py, dz = az + abz * t - pz;
        const cx = px - ax, cz = pz - az, cy = (py - ay) * 0.5;
        const hide = (t < 0.9 && (dx * dx + dy * dy * 0.25 + dz * dz) < 0.6) || (cx * cx + cy * cy + cz * cz) < 2.5;
        if (personObjs[i].visible === hide) personObjs[i].visible = !hide;
      }
      fill.position.set(cam.pos.x * 0.5 + model.position.x * 0.5, model.position.y + 2.0, cam.pos.z * 0.5 + model.position.z * 0.5);
      setPlace(areaOf(model.position));
      const beat = Math.floor(partyClock / SPB);
      const isOn = (partyClock / SPB - beat) < 0.25;
      if (isOn !== (lastBeat === 1)) { $('chip-beat').classList.toggle('on', isOn); lastBeat = isOn ? 1 : 0; }
    }
    function setPlace(label) {
      const el = $('chip-place'); if (el.dataset.v !== label) { el.dataset.v = label; el.innerHTML = `Local <b>${label}</b>`; }
    }

    /* ── loop ── */
    const timer = new THREE.Timer();
    function stepParty(dt) {
      const partyMixer = world.mixer;
      if (partyMixer && music.on) {
        const pt = music.partyTime(); const d = pt - partyClock;
        if (d > -0.1 && d < 0.3) partyMixer.update(Math.max(0, d)); else partyMixer.setTime(pt);
        partyClock = Math.max(partyClock, pt);
      } else {
        partyClock += dt;
        if (partyMixer) partyMixer.update(dt);
      }
    }
    function frame() {
      timer.update();
      step(Math.min(timer.getDelta(), 1 / 20), true);
    }
    /* ── sons do Romanele ── */
    const sfx = createSfx();
    let swingSound = { id: -1, done: true };
    const footPos = new THREE.Vector3();
    const clubRay = new THREE.Ray();

    // passos: toca quando o pé desce e encosta no chão (segue a animação, andando ou correndo)
    function updateFootsteps(dt) {
      if (!feet.length || !feet[0].bone) return;
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const walking = started && player.mode === 'play' && player.onFloor && !player.dance && !player.attacking && speed > 0.3;
      for (const f of feet) {
        f.bone.getWorldPosition(footPos);
        const h = footPos.y - model.position.y;
        if (player.onFloor) f.minH = Math.min(f.minH, h);   // altura do tornozelo com o pé apoiado
        f.cool -= dt;
        if (h > f.minH + 0.09) f.armed = true;
        else if (f.armed && h < f.minH + 0.035) {
          f.armed = false;
          if (walking && f.cool <= 0) {
            f.cool = 0.18;
            const running = speed > 2.15;
            sfx.play('passo', { volume: running ? 1 : 0.6, rate: running ? 1.05 : 1 });
          }
        }
      }
    }

    // bastada: "hit" se encostar num dino, no cenário ou numa pessoa; senão, "swosh" no vento
    function clubTouches() {
      const p = model.position, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
      if (dinos && world === worlds.mata && dinos.touches(p.x, p.y, p.z, player.yaw)) return true;
      // raios curtos no caminho do bastão (frente e ±30°, na altura do peito e da cintura)
      for (const h of [1.05, 0.6]) {
        for (const off of [0, -0.5, 0.5]) {
          clubRay.origin.set(p.x, p.y + h, p.z);
          clubRay.direction.set(Math.sin(player.yaw + off), 0, Math.cos(player.yaw + off));
          const hit = world.octree.rayIntersect(clubRay);
          if (hit && hit.distance < 1.35) return true;
        }
      }
      for (const q of world.people) {
        const dx = q[0] - p.x, dz = q[2] - p.z, d = Math.hypot(dx, dz);
        if (d < 1.4 && Math.abs(q[1] - p.y) < 1.2 && (dx * fx + dz * fz) / Math.max(d, 1e-3) > 0.3) return true;
      }
      return false;
    }
    function clubSound(hit) {
      if (swingSound.done || swingSound.id !== player.swingId) return;
      swingSound.done = true;
      sfx.play(hit ? 'tacoHit' : 'tacoSwosh');
    }
    function updateSwingSound() {
      const a = player.current;
      if (!player.attacking || swingSound.done || !a || !a.getClip().name.startsWith('Ataque')) return;
      if (a.time / a.getClip().duration >= 0.38) clubSound(clubTouches());
    }

    function step(dt, render) {
      const t = timer.getElapsed();
      stepParty(dt);
      const steps = 4;
      for (let i = 0; i < steps; i++) updatePlayer(dt / steps);
      updateAnimation();
      mixer.update(dt);
      updateFootsteps(dt);
      updateCamera(dt);
      const festa = world === worlds.festa;
      if (festa) updateFesta(); else updateMata(t);
      if (!festa && started && dinos) {
        const a = player.current, clipName = a ? a.getClip().name : '';
        const swing = player.attacking && clipName.startsWith('Ataque')
          ? { id: player.swingId, name: clipName, progress: a.time / a.getClip().duration } : null;
        const p = model.position;
        dinos.update(dt, { octree: world.octree, player: { x: p.x, y: p.y, z: p.z, yaw: player.yaw }, swing });
      }
      updateSwingSound();
      if (!render) return;
      if (festa && useBloom) composer.render(); else renderer.render(scene, camera);
    }

    // tela inicial: "Jogar" aparece quando tudo carregou
    on($('play'), 'click', () => {
      started = true;
      sfx.unlock();
      $('loading').hidden = true;
      canvas.focus();
    });

    (async () => {
      try {
        const dinoKeys = Object.keys(DINO_TYPES);
        const [mataGltf, charGltf, ...dinoGltfs] = await Promise.all([
          loadGLB(MATA_PATH, 'mata'), loadGLB(CHAR_PATH, 'char'),
          ...dinoKeys.map((k) => loadGLB(`${MODELS}/${DINO_TYPES[k].file}`, k)),
        ]);
        if (disposed) return;
        setupMata(mataGltf);
        setupCharacter(charGltf);
        setupDinos(Object.fromEntries(dinoKeys.map((k, i) => [k, dinoGltfs[i]])));
        setClub(true, false);
        setWorld('mata', 'SpawnPlayer');
        play(clipFor('Parado'), { fade: 0 });
        renderer.setAnimationLoop(frame);
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
      music.dispose();
      sfx.dispose();
      cleanups.forEach((fn) => fn());
      if (mixer) mixer.stopAllAction();
      if (worlds.festa) worlds.festa.mixer.stopAllAction();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            Object.values(m).forEach((v) => v && v.isTexture && v.dispose());
            m.dispose();
          });
        }
      });
      composer.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return (
    <div className="rf-root" ref={rootRef} data-world="mata">
      <div id="rf-stage" aria-label="Cena 3D do Romanele" />

      <div id="rf-loading" role="status" aria-live="polite">
        <div className="card">
          <h1 id="rf-loadtitle">Romanele <span>na Mata</span></h1>
          <p id="rf-loadcopy">Carregando o personagem riggado, a mata com a caverna e os dinossauros. São cerca de 35&nbsp;MB.</p>
          <div id="rf-loadprog">
            <div className="bar" aria-hidden="true"><i id="rf-loadbar" /></div>
            <div id="rf-loadtxt">0%</div>
          </div>
          <button id="rf-play" type="button" hidden>Jogar</button>
          <Link to="/" id="rf-back" className="rf-back">← Voltar ao portfólio</Link>
        </div>
      </div>

      <div className="hud" id="rf-brand">
        <h1>Romanele <span id="rf-brand-where">na Mata</span></h1>
        <div className="chips">
          <span className="chip" id="rf-chip-state">Estado <b>Parado</b></span>
          <span className="chip" id="rf-chip-club">Bastão <b>Na mão</b></span>
          <span className="chip" id="rf-chip-place">Local <b>Caverna</b></span>
          <span className="chip beat only-festa" id="rf-chip-beat"><i />120 BPM</span>
          <span className="chip only-mata" id="rf-chip-dinos">Dinos <b>0 no chão</b></span>
        </div>
      </div>

      <div className="hud panel" id="rf-keys" aria-label="Controles">
        <div className="k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>andar</span>
        <div className="k"><kbd>Shift</kbd></div><span>caminhar (segurar)</span>
        <div className="k"><kbd>Espaço</kbd></div><span>pular</span>
        <div className="k"><kbd>E</kbd><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div><span>dançar (no ritmo da festa)</span>
        <div className="k"><kbd>Q</kbd></div><span>pegar / guardar bastão</span>
        <div className="k"><kbd>Clique</kbd><kbd>F</kbd></div><span>atacar (com bastão)</span>
        <div className="k"><kbd>Arrastar</kbd><kbd>Roda</kbd></div><span>girar e aproximar câmera</span>
      </div>

      <div className="hud" id="rf-topright">
        <button className="btn" id="rf-world" type="button">Ir para a Xalassa</button>
        <button className="btn ghost" id="rf-opts-toggle" type="button" aria-expanded="false" aria-controls="rf-side">Opções</button>
      </div>

      <aside className="hud" id="rf-side" aria-label="Opções">
        <section className="panel box only-festa">
          <header><h2>Ir para</h2></header>
          <div className="row" id="rf-places" />
          <div className="row" style={{ paddingTop: 0 }}>
            <button className="btn ghost" type="button" id="rf-music" aria-pressed="false">Ligar som</button>
            <button className="btn ghost" type="button" id="rf-bloom" aria-pressed="true">Brilho das luzes</button>
          </div>
        </section>
        <section className="panel box" id="rf-anims" aria-label="Animações do Romanele">
          <header>
            <h2>Animações</h2>
            <button className="btn ghost" id="rf-anims-toggle" type="button" aria-expanded="true">Ocultar</button>
          </header>
          <div className="list" id="rf-clip-list" />
        </section>
      </aside>

      <div className="hud panel" id="rf-viewer-bar" hidden>
        <span>Visualizando <strong id="rf-viewer-name" /></span>
        <button className="btn" id="rf-viewer-exit" type="button">Voltar a jogar</button>
      </div>

      <div className="hud panel" id="rf-toast" role="status" aria-live="polite" />
      <div id="rf-hurt" aria-hidden="true" />

      <div className="hud" id="rf-touch" aria-hidden="true">
        <div id="rf-stick"><div id="rf-knob" /></div>
        <div id="rf-tbtns">
          <button id="rf-t-club" type="button">BASTÃO</button>
          <button id="rf-t-dance" type="button">DANÇAR</button>
          <button id="rf-t-walk" type="button">ANDAR</button>
          <button id="rf-t-jump" type="button">PULAR</button>
          <button id="rf-t-atk" type="button">ATACAR</button>
          <button id="rf-t-up" className="only-festa" type="button">CAMAROTE</button>
        </div>
      </div>
    </div>
  );
};

export default RomaFredGame;
