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
import { createWater } from './water.js';
import { createGrass } from './grass.js';
import { createAmbience } from './ambience.js';
import { createCar, CAR_ANCHOR, CAR_ENTRY } from './car.js';
import { createCopos, flyCupIcon } from './copos.js';
import './RomaFredGame.css';

const MODELS = `${process.env.PUBLIC_URL || ''}/assets/models`;
const MATA_PATH = `${MODELS}/mata_caverna.glb`;
const FESTA_PATH = `${MODELS}/festa_balada.glb`;
const CHAR_PATH = `${MODELS}/romanele_animado.glb`;
const CAR_PATH = `${MODELS}/carro_pedra.glb`;
const COPO_PATH = `${MODELS}/copo_kit.glb`;
const CUP_ICON = `${process.env.PUBLIC_URL || ''}/assets/ui/copo_kit.png`;

/* Constantes (metros, segundos) */
const WALK_SPEED = 1.25;      // velocidade para a qual o ciclo de andar foi feito
const RUN_SPEED = 3.4;        // velocidade para a qual o ciclo de correr foi feito
const DRIVE_SPEED = RUN_SPEED * 1.5; // no carro (sem chão e sem motor, só as pernas dele): 1,5× a corrida
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
    const progress = { mata: 0, char: 0, festa: 0, raptor: 0, trex: 0, inflavel: 0, carro: 0, copo: 0 };
    const SIZE_HINT = { mata: 13659160, char: 17057072, festa: 21971364, raptor: 1502832, trex: 1515896, inflavel: 1099968, carro: 3246880, copo: 371660 };
    let progressKeys = ['mata', 'char', 'raptor', 'trex', 'inflavel', 'carro', 'copo'];
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
    let model, mixer, club, dinos, hips, feet = [];
    const camFocus = new THREE.Vector3(); let camBlend = 0, camDistMul = 1; // alvo da câmera (suavizado ao entrar/sair do carro)
    let aiming = false, aimBlend = 0, lastLook = -10; // PC: mira com o botão direito e último movimento do mouse
    let car = null; // carro de pedra (car.js)
    let copos = null, cupCount = 0; // copo de kit da Xalassa (copos.js)
    const actions = {}, clips = {};
    const flames = []; const fireLights = [];
    let water = null; // rio interativo (water.js)
    let grass = null; // grama que se dobra (grass.js)

    // Romanele com os pés dentro do rio?
    const inWater = () => !!(water && world === worlds.mata && water.isWet(model.position.x, model.position.y, model.position.z));
    // som com volume e lado (esquerda/direita) pela posição em relação à câmera
    const camFwd = new THREE.Vector3();
    function play3D(name, x, y, z, volume = 1, rate = 1) {
      const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 45) return;
      camera.getWorldDirection(camFwd);
      const rx = -camFwd.z, rz = camFwd.x, rl = Math.hypot(rx, rz) || 1;
      const pan = THREE.MathUtils.clamp((dx * rx + dz * rz) / rl / Math.max(d, 1.5), -1, 1) * 0.85;
      sfx.play(name, { volume: volume / (1 + (d / 7) * (d / 7)), rate, pan });
    }
    // eventos de água dos dinossauros (os do Romanele seguem a animação dele)
    function waterSound(e) {
      if (e.key === 'player' || !water) return;
      if (e.type === 'step') play3D('passoAgua', e.x, water.level, e.z, 0.75 + 0.5 * e.strength, 0.78);
      else if (e.type === 'splash') play3D('splashAgua', e.x, water.level, e.z, 0.7 + 0.4 * e.strength, 0.88);
      else if (e.type === 'fall') play3D('splashAgua', e.x, water.level, e.z, 1.3, 0.75);
    }

    function setupMata(gltf) {
      const env = gltf.scene; scene.add(env);
      const colliders = [], limits = [];
      let waterMesh = null;
      env.traverse((o) => {
        // Colisao_Limite: parede invisível só para o Romanele (os dinos passam)
        if (o.name && o.name.startsWith('Colisao')) { o.visible = false; if (o.isMesh) (o.name.startsWith('Colisao_Limite') ? limits : colliders).push(o); return; }
        if (o.isMesh && o.userData && o.userData.colisao === 'visivel') colliders.push(o); // terreno/calçada visíveis que também são chão
        if (o.isMesh && o.userData && o.userData.agua) waterMesh = o;
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
      if (waterMesh) {
        try { water = createWater({ renderer, scene, mesh: waterMesh, onEvent: waterSound }); water.setSunDirection(sunDir); } catch (err) { console.warn('Água interativa desativada:', err); }
      }
      try { grass = createGrass(env); } catch (err) { console.warn('Grama interativa desativada:', err); }
      const zOf = (name, fallback) => { const o = env.getObjectByName(name); if (!o) return fallback; const v = new THREE.Vector3(); o.getWorldPosition(v); return v.z; };
      const riverBox = waterMesh ? new THREE.Box3().setFromObject(waterMesh) : null;
      worlds.mata = {
        name: 'mata', root: env, octree: buildOctree(env, colliders),
        limitOctree: limits.length ? buildOctree(env, limits) : null,
        markers: { SpawnPlayer: env.getObjectByName('SpawnPlayer') }, people: [], personObjs: [], mixer: null,
        zones: { exitZ: zOf('SaidaMata', Infinity), asphaltZ: zOf('InicioAsfalto', Infinity), riverBox },
      };
    }

    // Dinossauros: vêm quando o Romanele sai 2 m da caverna e caem com uma bastada
    function setupDinos(templates) {
      const caveMouth = new THREE.Vector3();
      worlds.mata.root.getObjectByName('EntradaCaverna').getWorldPosition(caveMouth);
      dinos = createDinoManager({
        scene, templates, caveMouth, exitZ: worlds.mata.zones.exitZ,
        onWave: (n, count) => toast(n === 1 ? `Dinossauros vindo! (${count})` : `Onda ${n}: ${count} dinossauros`),
        onDown: (count, d) => {
          clubSound(true);
          $('chip-dinos').innerHTML = `Dinos <b>${count} no chão</b>`;
          toast(`${d.cfg.label} derrubado!`);
          cupFromDino(d); // +1 copo de kit voando da cabeça do dino
        },
        onPlayerHit: (dx, dz) => {
          if (inCar()) return; // dentro do carro a mordida não empurra
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
      hips = model.getObjectByName('Hips');
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
      if (water) water.setVisible(!festa);
      if (inCar()) leaveCarNow();
      if (player.mode === 'drink') cancelDrink();
      if (car) car.setVisible(!festa);
      ambience.setActive(!festa);
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
      if (inCar() || player.mode === 'drink') return; // no carro (ou bebendo) o bastão fica guardado
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
        // mirando (botão direito) a ajuda é pequena: o golpe vai para onde ele mira
        const yaw = dinos.aim(model.position.x, model.position.z, player.yaw, aiming ? 25 : 100);
        if (yaw !== null) player.yaw = yaw;
      }
      player.attackIndex = player.attackIndex % 2 + 1;
      play(`Ataque${player.attackIndex}_ComBastao`, { fade: 0.12, once: true, timeScale: 1.05 });
    }
    function onActionFinished(e) {
      const name = e.action.getClip().name;
      if (player.mode === 'drink' && name !== 'Beber') return; // bebendo: ignora o fim de outro clipe (ex.: aterrissagem)
      if (name.startsWith('Ataque')) {
        if (player.queued && player.club) { startAttack(); return; }
        player.attacking = false;
        play(clipFor('Parado'), { fade: 0.3 });
      } else if (name.startsWith('PuloAterrissagem')) {
        player.landing = 0; play(clipFor('Parado'), { fade: 0.3 });
      } else if (name === 'Carro_Entrar' && player.mode === 'car-enter') {
        finishEnter();
      } else if (name === 'Carro_Sair' && player.mode === 'car-exit') {
        carInfo.pendingExit = true;   // termina depois do mixer.update (a raiz muda de lugar)
      } else if (name === 'Beber' && player.mode === 'drink') {
        finishDrink();
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
      if (inCar()) { toast('Saia do carro (C) para ver as animações'); return; }
      if (player.mode === 'drink') return;
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
      if (e.code === 'KeyC') toggleCar();
      if (e.code === 'KeyB') drink();
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

    const canvas = renderer.domElement;

    // PC: mouse capturado (pointer lock). Mexer o mouse só gira a câmera em volta do Romanele;
    // botão direito segurado = mira (ele vira para onde a câmera aponta); clique esquerdo = bastada
    const isLocked = () => document.pointerLockElement === canvas;
    function lockMouse() {
      if (isTouch || !started || isLocked()) return;
      try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* sem pointer lock */ }
    }
    function setAiming(v) {
      if (aiming === v) return;
      aiming = v;
      root.classList.toggle('aiming', v);
    }
    if (!isTouch) {
      on(document, 'pointerlockchange', () => {
        if (!isLocked()) { setAiming(false); if (started) toast('Clique na tela para voltar a controlar a câmera'); }
      });
      on(document, 'mousemove', (e) => {
        if (!isLocked()) return;
        cam.yaw -= e.movementX * 0.0026;
        cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * 0.0022, -0.25, 1.15);
        lastLook = timer.getElapsed();
      });
      on(canvas, 'mousedown', (e) => {
        if (!isLocked()) { lockMouse(); return; }   // o clique que captura o mouse não ataca
        if (e.button === 0) attack();
        if (e.button === 2 && !inCar()) setAiming(true);
      });
      on(document, 'mouseup', (e) => { if (e.button === 2) setAiming(false); });
      on(canvas, 'contextmenu', (e) => e.preventDefault());
    }

    // celular (e PC sem pointer lock): arrastar um dedo / o mouse fora dos controles gira a câmera
    let drag = null;
    on(canvas, 'pointerdown', (e) => {
      if (!isTouch && e.pointerType === 'mouse') return;   // no PC o mouse é tratado acima
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
      on($('t-car'), 'pointerdown', (e) => { e.preventDefault(); toggleCar(); });
      on($('t-drink'), 'pointerdown', (e) => { e.preventDefault(); drink(); });
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
      const usingStick = input.stick.lengthSq() > 0.01;
      const tank = !isTouch && !usingStick;   // PC: a direção dele não depende da câmera
      let ix = input.r - input.l, iz = input.f - input.b;
      let mag = Math.min(1, Math.hypot(ix, iz));
      if (usingStick) { ix = input.stick.x; iz = -input.stick.y; mag = Math.min(1, input.stick.length()); }
      if (mag > 0.1 && player.dance) stopDance();
      // corre por padrão; Shift (ou o botão ANDAR no celular) faz ele caminhar
      const running = !(input.walk || input.stickWalk);
      const locked = !started || player.mode !== 'play' || player.attacking || player.jumpTimer >= 0 || player.landing > 0 || player.dance;
      let target;
      if (tank) {
        if (aiming) {
          // mira: vira para onde a câmera aponta (a mira fica no centro da tela)
          let d = cam.yaw + Math.PI - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
          player.yaw += d * (1 - Math.exp(-18 * dt));
        } else if (!locked) {
          // A/D viram o Romanele; a câmera vira junto e mantém o ângulo que o jogador escolheu
          const turn = (input.l - input.r) * 2.6 * dt;
          player.yaw += turn; cam.yaw += turn;
        }
        // W anda para a frente dele, S dá ré (caminhando de costas); mirando, sempre caminha
        wish.set(Math.sin(player.yaw) * iz, 0, Math.cos(player.yaw) * iz);
        target = locked || iz === 0 ? 0 : (iz < 0 || aiming || !running ? WALK_SPEED : RUN_SPEED);
      } else {
        // celular: direção a partir do yaw da câmera (como antes)
        const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
        const rgtX = Math.cos(cam.yaw), rgtZ = -Math.sin(cam.yaw);
        wish.set(fwdX * iz + rgtX * ix, 0, fwdZ * iz + rgtZ * ix);
        if (wish.lengthSq() > 1e-6) wish.normalize();
        target = locked ? 0 : mag * (running ? RUN_SPEED : WALK_SPEED);
      }

      const hv = tmp.set(player.vel.x, 0, player.vel.z);
      const desired = tmp2.copy(wish).multiplyScalar(target);
      const accel = player.onFloor ? (target > hv.length() ? 9 : 12) : 2.5;
      hv.lerp(desired, 1 - Math.exp(-accel * dt));
      player.vel.x = hv.x; player.vel.z = hv.z;

      if (!tank && target > 0.05) {
        const want = Math.atan2(wish.x, wish.z);
        let d = want - player.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        player.yaw += d * (1 - Math.exp(-10 * dt));
      }

      // tempo do pulo: decola perto do fim do clipe de impulso
      if (player.jumpTimer >= 0) {
        player.jumpTimer += dt;
        if (player.jumpTimer > 0.2 && player.onFloor) { player.vel.y = JUMP_VEL; player.onFloor = false; player.airTime = 0.01; sfx.play('salto'); if (inWater()) sfx.play('passoAgua', { volume: 1, rate: 0.9 }); }
        if (player.jumpTimer > 0.26) { player.jumpTimer = -1; play(clipFor('PuloNoAr'), { fade: 0.12 }); }
      }

      if (!player.onFloor) player.vel.y -= GRAVITY * dt;
      else if (player.vel.y < 0) player.vel.y = 0;

      player.capsule.translate(tmp.copy(player.vel).multiplyScalar(dt));
      pushOutOfPeople();
      if (car && world === worlds.mata) {
        // o carro é sólido; logo depois de sair (a porta fica rente à lataria) empurra devagar, sem tranco
        if (carInfo.nudge > 0) {
          carInfo.nudge -= dt;
          nudgeCap.copy(player.capsule); car.pushOut(nudgeCap, RADIUS);
          player.capsule.translate(carTmp2.subVectors(nudgeCap.start, player.capsule.start).multiplyScalar(1 - Math.exp(-10 * dt)));
        } else car.pushOut(player.capsule, RADIUS);
      }
      const wasOnFloor = player.onFloor;
      player.onFloor = false;
      for (let i = 0; i < 3; i++) {
        const hit = octree.capsuleIntersect(player.capsule);
        if (!hit) break;
        if (hit.normal.y > 0.55) player.onFloor = true;
        else player.vel.addScaledVector(hit.normal, -hit.normal.dot(player.vel));
        player.capsule.translate(hit.normal.multiplyScalar(hit.depth));
      }
      // limites laterais do mapa (paredes invisíveis): só empurra na horizontal
      if (world.limitOctree) {
        for (let i = 0; i < 2; i++) {
          const hit = world.limitOctree.capsuleIntersect(player.capsule);
          if (!hit) break;
          hit.normal.y = 0; if (hit.normal.lengthSq() < 1e-6) break; hit.normal.normalize();
          player.vel.addScaledVector(hit.normal, -Math.min(0, hit.normal.dot(player.vel)));
          player.capsule.translate(hit.normal.multiplyScalar(hit.depth));
        }
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
        if (inWater()) sfx.play('splashAgua', { volume: THREE.MathUtils.clamp(0.45 + player.airTime * 0.7, 0.5, 1.1) });
        else sfx.play('queda', { volume: THREE.MathUtils.clamp(0.5 + player.airTime * 0.6, 0.5, 1) });
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
      if (inCar()) return; // no carro as animações são escolhidas em updateCarMode
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
      // andando de costas (S no PC): ciclo de andar tocado ao contrário
      const fwd = player.vel.x * Math.sin(player.yaw) + player.vel.z * Math.cos(player.yaw);
      if (fwd < -0.15) {
        play(clipFor('Andar'), { fade: 0.25, sync: true, timeScale: -THREE.MathUtils.clamp(speed / WALK_SPEED, 0.55, 1.3) }); setState('Andando de costas');
        return;
      }
      if (speed > 2.15) {
        play(clipFor('Correr'), { fade: 0.25, sync: true, timeScale: THREE.MathUtils.clamp(speed / RUN_SPEED, 0.7, 1.25) }); setState('Correndo');
      } else if (speed > 0.15) {
        play(clipFor('Andar'), { fade: 0.25, sync: true, timeScale: THREE.MathUtils.clamp(speed / WALK_SPEED, 0.55, 1.6) }); setState('Andando');
      } else { play(clipFor('Parado'), { fade: 0.3 }); setState('Parado'); }
    }

    function updateCamera(dt) {
      // entrando/saindo do carro a raiz fica no banco e quem se move é o corpo: a câmera segue
      // o quadril e desliza suavemente nas trocas, sem corte
      const moving = player.mode === 'car-enter' || player.mode === 'car-exit';
      if (moving && hips) {
        hips.getWorldPosition(camFocus); camFocus.y += 0.53;
      } else camFocus.set(model.position.x, model.position.y + 1.45, model.position.z);
      if (moving || camBlend > 0) {
        camBlend = Math.max(0, camBlend - dt);
        cam.target.lerp(camFocus, 1 - Math.exp(-7 * dt));
      } else cam.target.copy(camFocus);
      // mira por cima do ombro: câmera mais perto e o Romanele um pouco à esquerda da mira
      aimBlend += ((aiming ? 1 : 0) - aimBlend) * (1 - Math.exp(-10 * dt));
      if (aimBlend > 0.001) cam.target.add(tmp2.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)).multiplyScalar(0.6 * aimBlend));
      const driving = player.mode === 'car';
      const looking = drag || timer.getElapsed() - lastLook < 1.2;   // o jogador está olhando em volta
      if (driving && !looking && Math.abs(car.state.speed) > 1) {
        // dirigindo: a câmera vai voltando para trás do carro
        const want = car.state.yaw + (car.state.speed > 0 ? Math.PI : 0);
        let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        cam.yaw += d * (1 - Math.exp(-1.6 * dt));
      }
      const cp = Math.cos(cam.pitch);
      const dir = tmp.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp).normalize();
      // no carro a câmera se afasta um pouco; a troca de distância é suave para não dar corte
      camDistMul += ((inCar() ? 1.45 : 1) - camDistMul) * (1 - Math.exp(-2.5 * dt));
      let dist = cam.dist * camDistMul * (1 - 0.28 * aimBlend);
      ray.origin.copy(cam.target); ray.direction.copy(dir);
      const hit = world.octree.rayIntersect(ray);
      if (hit && hit.distance < dist + 0.3) dist = Math.max(0.6, hit.distance - 0.3);
      const want = tmp2.copy(cam.target).addScaledVector(dir, dist);
      cam.pos.lerp(want, 1 - Math.exp(-12 * dt));
      camera.position.copy(cam.pos); camera.lookAt(cam.target);
    }

    // mata: interior da caverna escurece conforme entra
    const caveZ = { mouth: -10.5, deep: -16 };
    function updateMata(t, dt) {
      const p = model.position;
      const inX = 1 - THREE.MathUtils.smoothstep(Math.abs(p.x), 4.5, 6.5);
      const depth = THREE.MathUtils.smoothstep(-p.z, -caveZ.mouth, -caveZ.deep) * inX;
      hemi.intensity = THREE.MathUtils.lerp(1.25, 0.32, depth);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 1.25, depth);
      const zn = world.zones, rb = zn.riverBox;
      const inRiver = rb && p.z > rb.min.z && p.z < rb.max.z && p.y < rb.max.y + 0.1;
      setPlace(depth > 0.5 ? 'Caverna' : p.z > zn.asphaltZ ? 'Cidade' : p.z > zn.exitZ ? 'Estrada'
        : inRiver ? 'Rio' : (Math.hypot(p.x, p.z + 3) < 16 ? 'Clareira' : 'Mata'));
      // fogo tremulando
      for (const L of fireLights) L.intensity = L.userData.base * (0.82 + 0.12 * Math.sin(t * 11.3 + L.id) + 0.08 * Math.sin(t * 23.7 + L.id * 2.1));
      for (const f of flames) { f.scale.y = 1 + 0.08 * Math.sin(t * 13 + f.id); f.scale.x = 1 + 0.05 * Math.sin(t * 9.1 + f.id * 1.7); }
      // sombras do sol acompanham o jogador
      sun.target.position.copy(p); sun.position.copy(p).addScaledVector(sunDir, 70);
      sky.position.copy(camera.position); // o mapa vai até ~560 m: o domo do céu acompanha a câmera
      // som ambiente: mistura as regiões conforme o Romanele anda (e abafa dentro da caverna)
      const ss = THREE.MathUtils.smoothstep;
      const road = ss(p.z, zn.exitZ - 10, zn.exitZ + 25), city = ss(p.z, zn.asphaltZ - 45, zn.asphaltZ + 10);
      const dRiver = rb ? Math.max(rb.min.z - p.z, p.z - rb.max.z, 0) : 999;
      // a natureza (mata e campo) vai sumindo aos poucos conforme ele se aproxima da cidade
      const nearCity = ss(p.z, zn.exitZ - 40, zn.asphaltZ);
      const nature = 1 - 0.7 * nearCity;
      ambience.update(dt, {
        mata: (1 - road) * nature * (1 - 0.75 * depth),
        estrada: road * (1 - city) * nature,
        cidade: city,
        rio: (1 - ss(dRiver, 0, 45)) * (1 - 0.85 * depth),
      });
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

    /* ── carro de pedra: anda com as pernas do Romanele (sem chão, sem motor) ── */
    const carTmp = new THREE.Vector3(), carTmp2 = new THREE.Vector3();
    const carInfo = { label: '', hinted: false, toldDrive: false, t: 0, club: true };
    const carEntry = CAR_ENTRY.clone(), carExit = CAR_ENTRY.clone(); // ajustados pelas animações em setupCar
    const carInv = new THREE.Matrix4(), carWp = new THREE.Vector3();
    const nudgeCap = new Capsule();
    function inCar() { return player.mode.startsWith('car'); }
    function setupCar(gltf) {
      car = createCar({ scene, gltf });
      // clipes do Romanele (entrar, sair, parado e dirigindo) tocam no mixer dele
      for (const c of Object.values(car.romClips)) { clips[c.name] = c; actions[c.name] = mixer.clipAction(c); }
      // estacionado no começo da estrada de chão, logo depois do rio e da saída da mata
      const zn = worlds.mata.zones;
      car.park(worlds.mata.octree, 2.4, Number.isFinite(zn.exitZ) ? zn.exitZ + 14 : 163, 0);
      // onde o corpo dele realmente está no 1º quadro de "entrar" e no último de "sair"
      // (relativo ao banco), para trocar de animação sem o corpo pular
      const stand = measureHips('Parado_SemBastao', false);
      const enter0 = measureHips('Carro_Entrar', false), exitEnd = measureHips('Carro_Sair', true);
      if (stand && enter0) carEntry.copy(CAR_ANCHOR).add(carTmp.set(enter0.x - stand.x, 0, enter0.z - stand.z));
      if (stand && exitEnd) carExit.copy(CAR_ANCHOR).add(carTmp.set(exitEnd.x - stand.x, 0, exitEnd.z - stand.z));
    }
    // posição do quadril (no espaço do Romanele) num quadro de um clipe, sem mexer na pose atual
    function measureHips(clipName, atEnd) {
      const clip = clips[clipName]; if (!clip || !hips) return null;
      const savedP = model.position.clone(), savedQ = model.quaternion.clone();
      model.position.set(0, 0, 0); model.quaternion.identity();
      const m = new THREE.AnimationMixer(model), a = m.clipAction(clip);
      a.play(); m.setTime(atEnd ? clip.duration - 1e-3 : 0);
      model.updateMatrixWorld(true);
      const v = hips.getWorldPosition(new THREE.Vector3());
      m.stopAllAction(); m.uncacheRoot(model);
      model.position.copy(savedP); model.quaternion.copy(savedQ);
      mixer.update(0);   // reaplica a pose de agora
      return v;
    }
    function nearCar() {
      if (!car || world !== worlds.mata || !car.root.visible) return false;
      const e = car.worldOf(carEntry, carTmp), p = model.position;
      return Math.hypot(e.x - p.x, e.z - p.z) < 6 && Math.abs(e.y - p.y) < 1.5;
    }
    function toggleCar() {
      if (!started || busy || !car) return;
      if (player.mode === 'car') { exitCar(); return; }
      if (player.mode === 'viewer') exitViewer();
      if (player.mode !== 'play' || player.attacking || player.jumpTimer >= 0 || !player.onFloor) return;
      if (!nearCar()) { if (world === worlds.mata) toast('Chegue perto da porta do carro (na estrada) para entrar'); return; }
      stopDance(); setAiming(false);
      carInfo.club = player.club;
      player.club = false; if (club) club.visible = false;   // guarda o bastão sem mexer no chip
      player.mode = 'car-approach'; player.vel.set(0, 0, 0); carInfo.t = 0;
      setState('Indo para o carro');
    }
    // põe a raiz do Romanele no banco do motorista (mesmo ponto usado no Blender)
    function placeInCar() {
      car.worldOf(CAR_ANCHOR, model.position);
      model.quaternion.copy(car.root.quaternion);
      player.capsule.start.set(model.position.x, model.position.y + RADIUS, model.position.z);
      player.capsule.end.set(model.position.x, model.position.y + HEIGHT - RADIUS, model.position.z);
    }
    // próximo ponto do caminho até a porta (lado +X do carro), contornando o carro pelas quinas
    function approachWaypoint(p) {
      carInv.copy(car.root.matrixWorld).invert();
      const lp = carTmp2.copy(p).applyMatrix4(carInv), h = car.half, m = 0.75;
      if (lp.x >= carEntry.x - 0.35) return car.worldOf(carEntry, carWp);         // já do lado da porta
      const zc = lp.z > h.zf ? h.zf + m : lp.z < -h.zb ? -(h.zb + m) : null;
      if (zc !== null) return car.worldOf(carTmp2.set(h.x + m, 0, zc), carWp);    // na frente/atrás: quina do lado da porta
      // do lado oposto: vai até a quina mais próxima da porta (atrás) ou da frente
      const back = Math.abs(lp.z + h.zb) <= Math.abs(lp.z - h.zf);
      return car.worldOf(carTmp2.set(-(h.x + m), 0, back ? -(h.zb + m) : h.zf + m), carWp);
    }
    // caminha sozinho até a porta (sem teleporte), vira para a frente do carro e começa a entrar
    function updateApproach(dt) {
      const p = model.position, entry = car.worldOf(carEntry, carTmp);
      const w = approachWaypoint(p), final = w.distanceToSquared(entry) < 1e-4;
      const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz);
      carInfo.t += dt;
      let a = (!final || d > 0.45 ? Math.atan2(dx, dz) : car.state.yaw) - player.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
      player.yaw += a * (1 - Math.exp(-10 * dt));
      if (!final || (d > 0.04 && carInfo.t < 12)) {
        const sp = final ? Math.min(WALK_SPEED, d * 3 + 0.35) : WALK_SPEED, k = Math.min(1, (sp * dt) / Math.max(d, 1e-4));
        player.capsule.translate(carTmp2.set(dx * k, (entry.y - p.y) * Math.min(1, 10 * dt), dz * k));
        play(clipFor('Andar'), { fade: 0.2, sync: true, timeScale: THREE.MathUtils.clamp(sp / WALK_SPEED, 0.6, 1.2) });
        carInfo.settle = 0;
      } else {
        player.capsule.translate(carTmp2.set(dx, 0, dz));
        play(clipFor('Parado'), { fade: 0.15 });
        carInfo.settle = (carInfo.settle || 0) + dt;
        if (carInfo.settle > 0.18 && Math.abs(a) < 0.08) { startEnter(); return; }
      }
      model.position.set(player.capsule.start.x, player.capsule.start.y - RADIUS, player.capsule.start.z);
      model.rotation.set(0, player.yaw, 0);
    }
    function startEnter() {
      player.mode = 'car-enter';
      placeInCar();
      play('Carro_Entrar', { fade: 0, once: true, timeScale: 1.1 });
      car.play('Porta_Entrar', { once: true, timeScale: 1.1, fade: 0.1 });
      setState('Entrando no carro');
    }
    function finishEnter() {
      player.mode = 'car'; camBlend = 0.8;
      play('Carro_Parado', { fade: 0.2 }); car.play('Parado', { fade: 0.2 });
      setState('No carro');
      if (!carInfo.toldDrive) { carInfo.toldDrive = true; toast('W/S: pernas pra frente e pra trás · A/D: volante · C: sair'); }
    }
    function updateCarMode(dt) {
      if (player.mode === 'car-approach') { updateApproach(dt); return; }
      if (player.mode === 'car') {
        let throttle = input.f - input.b, steer = input.l - input.r;
        if (input.stick.lengthSq() > 0.01) { throttle = -input.stick.y; steer = -input.stick.x; }
        const sp = car.drive(dt, { throttle, steer, maxSpeed: DRIVE_SPEED, octree: world.octree, limitOctree: world.limitOctree });
        const s = Math.abs(sp);
        if (s > 0.25) {
          // as pernas correm no ritmo das rodas (o ciclo foi feito para 5,1 m/s)
          play('Carro_Dirigir', { fade: 0.25, timeScale: Math.sign(sp) * THREE.MathUtils.clamp(s / DRIVE_SPEED, 0.3, 1.25) });
          car.play('Rodando', { fade: 0.2, timeScale: sp / DRIVE_SPEED });
          setState(s > DRIVE_SPEED * 0.8 ? 'Pisando fundo' : sp < 0 ? 'Dando ré' : 'Dirigindo');
        } else {
          play('Carro_Parado', { fade: 0.35 }); car.play('Parado', { fade: 0.3 });
          setState('No carro');
        }
        player.yaw = car.state.yaw;
        player.vel.set(Math.sin(car.state.yaw) * sp, 0, Math.cos(car.state.yaw) * sp);
      }
      placeInCar();
      player.onFloor = true; player.airTime = 0;
    }
    function exitCar() {
      if (Math.abs(car.state.speed) > 1.2) { toast('Pare o carro para sair (solte o W)'); return; }
      car.state.speed = 0; player.vel.set(0, 0, 0);
      player.mode = 'car-exit';
      play('Carro_Sair', { fade: 0.25, once: true, timeScale: 1.1 });
      car.play('Porta_Sair', { once: true, timeScale: 1.1, fade: 0.15 });
      setState('Saindo do carro');
    }
    function restoreClub() { player.club = carInfo.club; if (club) club.visible = player.club; }
    function finishExit() {
      camBlend = 0.8; carInfo.nudge = 0.6;
      const e = car.worldOf(carExit, carTmp);   // onde o corpo terminou a animação de sair
      player.yaw = car.state.yaw;
      player.capsule.start.set(e.x, e.y + RADIUS + 0.02, e.z);
      player.capsule.end.set(e.x, e.y + HEIGHT - RADIUS, e.z);
      for (let i = 0; i < 3; i++) {   // se a porta abriu encostada em algo, empurra para fora
        const hit = world.octree.capsuleIntersect(player.capsule); if (!hit) break;
        player.capsule.translate(hit.normal.multiplyScalar(hit.depth));
      }
      model.position.set(player.capsule.start.x, player.capsule.start.y - RADIUS, player.capsule.start.z);
      model.rotation.set(0, player.yaw, 0);
      player.mode = 'play'; player.onFloor = true; player.vel.set(0, 0, 0);
      restoreClub();
      play(clipFor('Parado'), { fade: 0 });   // o último quadro de "sair" já é ele em pé ao lado da porta
      car.play('Parado', { fade: 0.2 });
      setState('Parado');
    }
    function leaveCarNow() {   // trocou de mundo com ele no carro
      player.mode = 'play'; restoreClub();
      model.rotation.set(0, player.yaw, 0);
      if (car) { car.state.speed = 0; car.play('Parado', { fade: 0 }); }
    }
    function updateCarHint() {
      const near = player.mode === 'play' && nearCar();
      const label = player.mode === 'car' ? 'SAIR' : near ? 'CARRO' : '';
      if (label !== carInfo.label) {
        carInfo.label = label;
        const b = $('t-car'); b.classList.toggle('show', !!label); if (label) b.textContent = label;
      }
      if (near && !carInfo.hinted) { carInfo.hinted = true; toast(isTouch ? 'Toque em CARRO para entrar' : 'Aperte C para entrar no carro'); }
    }

    /* ── copo de kit: cada dino derrubado vale um copo; com B ele vira o copo e joga no chão ── */
    const cupTmp = new THREE.Vector3(), cupHead = new THREE.Vector3();
    function setCupCount(n, dir = 0) {
      cupCount = Math.max(0, n);
      $('copos-n').textContent = String(cupCount);
      const box = $('copos');
      box.classList.toggle('empty', cupCount === 0);
      box.setAttribute('aria-label', `${cupCount} ${cupCount === 1 ? 'copo' : 'copos'} de kit`);
      if (dir) { box.classList.remove('bump-up', 'bump-down'); void box.offsetWidth; box.classList.add(dir > 0 ? 'bump-up' : 'bump-down'); }
      $('t-drink').classList.toggle('off', cupCount === 0);
    }
    function setupCopos(gltf) {
      copos = createCopos({ model, gltf });
      if (copos.clip) { clips.Beber = copos.clip; actions.Beber = mixer.clipAction(copos.clip); }
      setCupCount(0);
    }
    // ponto de saída do copinho: a cabeça do dino (osso mais alto com "cabeça"/"head" no nome)
    function dinoHead(d, out) {
      if (d.headBone === undefined) {
        let best = null, by = -Infinity;
        d.obj.updateMatrixWorld(true);
        d.obj.traverse((o) => {
          if (o.isBone && /cabe|head/i.test(o.name)) { o.getWorldPosition(cupTmp); if (cupTmp.y > by) { by = cupTmp.y; best = o; } }
        });
        d.headBone = best;
      }
      if (d.headBone) return d.headBone.getWorldPosition(out).add(cupTmp.set(0, 0.3, 0));
      return out.copy(d.obj.position).add(cupTmp.set(0, 2.1, 0));
    }
    function cupFromDino(d) {
      const p = dinoHead(d, cupHead).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      const from = p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 }
        : { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      flyCupIcon({
        from, toEl: $('copos-ico'), src: CUP_ICON, layer: root,
        onArrive: () => { if (disposed) return; setCupCount(cupCount + 1, 1); if (copos) copos.plim(Math.min(cupCount, 12)); },
      });
    }
    function drink() {
      if (!started || busy || !copos || !copos.clip) return;
      if (player.mode === 'viewer') exitViewer();
      if (player.mode !== 'play' || player.attacking || player.jumpTimer >= 0 || !player.onFloor) return;
      if (cupCount <= 0) { toast('Derrube um dinossauro para ganhar um copo de kit'); return; }
      stopDance();
      setCupCount(cupCount - 1, -1);              // pegou o copo: o contador desce 1
      if (club) club.visible = false;             // a mão direita segura o copo
      player.mode = 'drink'; player.vel.x = 0; player.vel.z = 0;
      copos.setHeld(true);
      play('Beber', { fade: 0.15, once: true });
      copos.scheduleDrinkSounds();
      setState('Bebendo o kit');
    }
    function endDrink() {
      copos.setHeld(false);
      player.mode = 'play';
      if (club) club.visible = player.club;
      setState('Parado');
    }
    function finishDrink() {
      copos.dropOnGround(world.root, world.octree);   // o copo fica largado no chão
      endDrink();
      play(clipFor('Parado'), { fade: 0.3 });
    }
    function cancelDrink() { copos.cancelSounds(); endDrink(); }

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
    const ambience = createAmbience();   // som ambiente da mata, rio, estrada e cidade
    let swingSound = { id: -1, done: true };
    const footPos = new THREE.Vector3();
    const clubRay = new THREE.Ray();

    // passos: toca quando o pé desce e encosta no chão (segue a animação, andando ou correndo)
    function updateFootsteps(dt) {
      if (!feet.length || !feet[0].bone) return;
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const walking = started && (player.mode === 'play' || player.mode === 'car') && player.onFloor && !player.dance && !player.attacking && speed > 0.3;
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
            if (inWater()) sfx.play('passoAgua', { volume: running ? 1 : 0.7, rate: running ? 1.05 : 0.95 });
            else sfx.play('passo', { volume: running ? 1 : 0.6, rate: running ? 1.05 : 1 });
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
      if (inCar()) updateCarMode(dt);
      else for (let i = 0; i < steps; i++) updatePlayer(dt / steps);
      updateAnimation();
      mixer.update(dt);
      if (carInfo.pendingExit) { carInfo.pendingExit = false; finishExit(); mixer.update(0); }
      if (car && world === worlds.mata) { car.update(dt); updateCarHint(); }
      updateFootsteps(dt);
      updateCamera(dt);
      const festa = world === worlds.festa;
      if (festa) updateFesta(); else updateMata(t, dt);
      if (!festa && started && dinos) {
        const a = player.current, clipName = a ? a.getClip().name : '';
        const swing = player.attacking && clipName.startsWith('Ataque')
          ? { id: player.swingId, name: clipName, progress: a.time / a.getClip().duration } : null;
        const p = model.position;
        dinos.update(dt, { octree: world.octree, player: { x: p.x, y: p.y, z: p.z, yaw: player.yaw }, swing });
      }
      // água: Romanele e dinossauros empurram a superfície do rio
      if (!festa && water) {
        const p = model.position;
        const bodies = [{ key: 'player', x: p.x, y: p.y, z: p.z, r: 0.34, vy: player.vel.y }];
        if (dinos) for (const d of dinos.list) {
          if (d.state === 'delay' || !d.obj.visible) continue;
          const q = d.obj.position;
          bodies.push({ key: d, x: q.x, y: q.y, z: q.z, r: 0.55, state: d.state, yaw: d.yaw, stride: 1.1 });
        }
        water.update(dt, bodies);
      }
      // grama: o Romanele e os dinos empurram as plantas; dino caído amassa em volta
      if (!festa && grass) {
        const p = model.position, others = [];
        if (dinos) for (const d of dinos.list) {
          if (d.state === 'delay' || !d.obj.visible || d.state === 'sink') continue;
          const lying = d.state === 'down' || d.state === 'lying';
          others.push({ x: d.obj.position.x, z: d.obj.position.z, r: lying ? 1.9 : 1.2, s: 1 });
        }
        grass.update(dt, { x: p.x, z: p.z }, others);
      }
      updateSwingSound();
      if (!render) return;
      if (festa && useBloom) composer.render(); else renderer.render(scene, camera);
    }

    // tela inicial: "Jogar" aparece quando tudo carregou
    on($('play'), 'click', () => {
      started = true;
      sfx.unlock();
      ambience.unlock();
      if (copos) copos.unlock();
      $('loading').hidden = true;
      canvas.focus();
      lockMouse();   // PC: o mouse passa a girar a câmera (Esc solta)
    });

    (async () => {
      try {
        const dinoKeys = Object.keys(DINO_TYPES);
        const [mataGltf, charGltf, carGltf, copoGltf, ...dinoGltfs] = await Promise.all([
          loadGLB(MATA_PATH, 'mata'), loadGLB(CHAR_PATH, 'char'), loadGLB(CAR_PATH, 'carro'), loadGLB(COPO_PATH, 'copo'),
          ...dinoKeys.map((k) => loadGLB(`${MODELS}/${DINO_TYPES[k].file}`, k)),
        ]);
        if (disposed) return;
        setupMata(mataGltf);
        setupCharacter(charGltf);
        setupCar(carGltf);
        setupCopos(copoGltf);
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
      ambience.dispose();
      if (water) water.dispose();
      if (car) car.dispose();
      if (copos) copos.dispose();
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
          <p id="rf-loadcopy">Carregando o personagem riggado, a mata com a caverna, os dinossauros e o carro de pedra. São cerca de 38&nbsp;MB.</p>
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
        <div className="panel empty" id="rf-copos" role="status" aria-label="0 copos de kit" title="Copos de kit: derrube dinossauros para ganhar, B para beber">
          <img id="rf-copos-ico" src={`${process.env.PUBLIC_URL || ''}/assets/ui/copo_kit.png`} alt="" />
          <div className="txt"><b id="rf-copos-n">0</b><small>copos de kit</small></div>
        </div>
      </div>

      <div className="hud panel" id="rf-keys" aria-label="Controles">
        <div className="k"><kbd>W</kbd><kbd>S</kbd></div><span>andar para frente / de costas</span>
        <div className="k"><kbd>A</kbd><kbd>D</kbd></div><span>virar</span>
        <div className="k"><kbd>Mouse</kbd></div><span>olhar em volta</span>
        <div className="k"><kbd>Botão direito</kbd></div><span>mirar (segurar)</span>
        <div className="k"><kbd>Shift</kbd></div><span>caminhar (segurar)</span>
        <div className="k"><kbd>Espaço</kbd></div><span>pular</span>
        <div className="k"><kbd>E</kbd><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div><span>dançar (no ritmo da festa)</span>
        <div className="k"><kbd>Q</kbd></div><span>pegar / guardar bastão</span>
        <div className="k only-mata"><kbd>C</kbd></div><span className="only-mata">entrar / sair do carro (na estrada)</span>
        <div className="k"><kbd>B</kbd></div><span>beber um copo de kit</span>
        <div className="k"><kbd>Clique</kbd><kbd>F</kbd></div><span>atacar (com bastão)</span>
        <div className="k"><kbd>Roda</kbd></div><span>aproximar câmera</span>
        <div className="k"><kbd>Esc</kbd></div><span>soltar o mouse</span>
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

      <div id="rf-crosshair" aria-hidden="true" />
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
          <button id="rf-t-car" className="only-mata" type="button">CARRO</button>
          <button id="rf-t-drink" className="off" type="button">BEBER</button>
        </div>
      </div>
    </div>
  );
};

export default RomaFredGame;
