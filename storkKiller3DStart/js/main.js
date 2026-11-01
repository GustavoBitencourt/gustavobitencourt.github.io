import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBloodSystem } from './blood.js';
import { createVultureManager, VULTURE_CONFIG } from './vultures.js';
import { prepararSelva } from './selva.js';
import { prepararPantano } from './pantano.js';
import { Buggy, MotoristaCegonha } from './carro.js';
import { Moto, PilotoMoto } from './moto.js';
import { clipLevantarMoto, LEVANTAR_MOTO } from './levantar_moto.js';
import { clipsBicada, BICADA } from './bicada_cegonha.js';
import { prepararPantanoEstrada } from './pantano_estrada.js';
import { SomBuggy } from './som_carro.js';
import { criarAmbienteNatureza, criarSomChuva } from './natureza.js';
import { criarDesafio } from './desafio.js';

/* ═══════════════════════════════════════
   RENDERER
═══════════════════════════════════════ */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('canvas-container').appendChild(renderer.domElement);

/* ═══════════════════════════════════════
   SCENE
═══════════════════════════════════════ */
const scene = new THREE.Scene();

// Gradient sky (azul de dia: claro no horizonte, mais saturado no topo)
const SKY_HORIZON = new THREE.Color('#cfe8ff');
const bgGeo = new THREE.SphereGeometry(400, 32, 32);
const bgMat = new THREE.ShaderMaterial({
  uniforms: {
    colorTop: { value: new THREE.Color('#2f7fd8') },
    colorBottom: { value: SKY_HORIZON },
  },
  vertexShader: `
    varying vec3 vPos;
    void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }
  `,
  fragmentShader: `
    varying vec3 vPos; uniform vec3 colorTop, colorBottom;
    void main(){
      float t = pow(clamp(normalize(vPos).y, 0.0, 1.0), 0.6);
      gl_FragColor = vec4(mix(colorBottom, colorTop, t), 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});
// O domo acompanha a câmera, então o céu nunca "acaba" mesmo nas bordas dos mapas grandes
const skyDome = new THREE.Mesh(bgGeo, bgMat);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

/* ═══════════════════════════════════════
   CAMERA
═══════════════════════════════════════ */
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
camera.position.set(0, 2.5, 7);

/* ═══════════════════════════════════════
   CHARACTERS CONFIG & SELECTION
   Permite expansão futura com novos personagens
═══════════════════════════════════════ */
const CHARACTERS = [
  {
    id: 'stork',
    name: 'Cegonha',
    role: 'Predador Aéreo',
    desc: 'Personagem com rigging completo de caminhada (WASD), voo 3D, respiração/parado no solo, poses de sentar/levantar, AK-47 com animações próprias e bicada sem a arma (no chão e em investida no voo).',
    tags: ['Caminhada & Voo com Rigging', 'Parado & Sentar (X)', 'AK-47 (G / R)', 'Bicada (B)', 'Disponível'],
    status: 'available',
    statusLabel: 'Disponível',
    buttonText: 'Jogar com a Cegonha',
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 13c3.5-4.5 9-6 13-3.5 2 1.2 4 3.5 6 3.5-3 1-6 0-8 2-3 3-5 5-11 1 3-1 4.5-2 0-3z"/>
      <circle cx="17.5" cy="8.5" r="1.5" fill="currentColor"/>
      <path d="M7 15l-3 5"/>
      <path d="M11 15l-2 5"/>
    </svg>`,
    modelPath: 'assets/models/stork_with_ak_carro.glb',   // 12 clips + 6 do carro (Draco)
    menuNome: 'Cegonha',
    menuPapel: 'Visualizador 3D',
  },
  {
    id: 'urubu',
    name: 'Urubu',
    role: 'Predador Noturno',
    desc: 'Ave com rigging completo de voo, decolagem, pouso e bicadas tanto no ar quanto no chão.',
    tags: ['Voo & Pouso com Rigging', 'Bicadas Ar & Chão (E)', 'Disponível'],
    status: 'available',
    statusLabel: 'Disponível',
    buttonText: 'Jogar com o Urubu',
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 11c3-3 8-5 13-2 3 2 5 3 7 2-2 3-5 4-8 4-4 0-8-2-12-4z"/>
      <circle cx="17.5" cy="8.5" r="1.5" fill="currentColor"/>
      <path d="M7 13l-2 5"/>
      <path d="M11 13l-1 5"/>
    </svg>`,
    modelPath: 'assets/models/urubu_model.glb',
    menuNome: 'Urubu',
    menuPapel: 'Visualizador 3D',
  },
  {
    id: 'fase_2',
    name: 'Fase 2',
    role: 'Pântano',
    desc: 'Entre direto na Fase 2: pântano com chuva e relâmpagos, o dobro de urubus e eles ficam mais rápidos a cada abate.',
    tags: ['Fase 2 Direta', 'Chuva & Relâmpagos', 'Disponível'],
    status: 'available',
    statusLabel: 'Fase 2',
    buttonText: 'Jogar Fase 2',
    faseInicial: 2,
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.5 14a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 8.5 3.5 3.5 0 0 0 6 15.5h11.5z"/>
      <path d="M8 18l-1 2.5"/>
      <path d="M12 18l-1 2.5"/>
      <path d="M16 18l-1 2.5"/>
    </svg>`,
    menuNome: 'Fase 2',
    menuPapel: 'Pântano com chuva',
  },
  {
    id: 'test_car',
    name: 'Testar Carro',
    role: 'Fase 3 · Buggy e moto',
    desc: 'Entre direto na Fase 3 para pilotar o Buggy em solo plano com a Cegonha armada. Teste aceleração, marcha a ré, freio de mão e drift.',
    tags: ['Fase 3 Direta', 'Entrar / Sair (E)', 'WASD Pilotar', 'Disponível'],
    status: 'available',
    statusLabel: 'Fase 3',
    buttonText: 'Testar Carro',
    isCarTest: true,
    faseInicial: 3,
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.7 2 11.1 2 11.5V16c0 .6.4 1 1 1h2"/>
      <circle cx="7" cy="17" r="2"/>
      <path d="M9 17h6"/>
      <circle cx="17" cy="17" r="2"/>
    </svg>`,
    modelPath: 'assets/models/stork_with_ak_carro.glb',
    menuNome: 'Fase 3',
    menuPapel: 'Buggy e moto na estrada',
  }
];

let isGameActive = false;
let selectedCharacter = null;

// Lista "Outros modos" da tela inicial: visualizadores e a fase 3 (o destaque é o botão de jogar)
function renderMenuList() {
  const lista = document.getElementById('menu-list');
  if (!lista) return;
  lista.innerHTML = '';

  CHARACTERS.filter(c => c.status === 'available').forEach(char => {
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="menu-item" type="button" data-char-id="${char.id}">
        ${char.iconSvg}
        <span class="menu-item-texto">
          <span class="menu-item-nome">${char.menuNome ?? char.name}</span>
          <span class="menu-item-papel">${char.menuPapel ?? char.role}</span>
        </span>
      </button>
    `;
    li.querySelector('button').addEventListener('click', () => {
      if (char.faseInicial) {
        startKillerGame(char.faseInicial);
      } else {
        gameMode = 'viewer';
        selectCharacter(char);
      }
    });
    lista.appendChild(li);
  });
}

// Inicializa a lista de modos
renderMenuList();

/* ═══════════════════════════════════════
   ORBIT CONTROLS
═══════════════════════════════════════ */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.5;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2 + 0.15;
controls.target.set(0, 1, 0);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;
controls.update();

/* ═══════════════════════════════════════
   LIGHTS
═══════════════════════════════════════ */
// Luz de céu (azul vindo de cima) e de chão (tom quente refletido de baixo)
const hemiLight = new THREE.HemisphereLight(0xbfdcff, 0x5a4a3a, 1.1);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff0e8, 2.8);
keyLight.position.set(5, 10, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 60;
keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -10;
keyLight.shadow.camera.right = keyLight.shadow.camera.top = 10;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7090ff, 0.8);
fillLight.position.set(-5, 4, -4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xa78bfa, 1.0);
rimLight.position.set(0, 6, -8);
scene.add(rimLight);

// Intensidades originais, para o pântano (noite com chuva) poder escurecer e depois devolver o dia
const dayLights = [hemiLight, keyLight, fillLight, rimLight].map(light => ({ light, base: light.intensity }));

/* ═══════════════════════════════════════
   FLOOR
═══════════════════════════════════════ */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(70, 120),
  new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.3, roughness: 0.7 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(120, 150, 0x3333aa, 0x1a1a3a);
grid.position.y = 0.001;
scene.add(grid);

// Neblina com a cor do horizonte, para o chão se fundir ao céu na distância
scene.fog = new THREE.FogExp2(SKY_HORIZON.getHex(), 0.018);

/* ═══════════════════════════════════════
   PIVOT
═══════════════════════════════════════ */
const pivot = new THREE.Group();
scene.add(pivot);

/* ═══════════════════════════════════════
   STATE & MULTI-CHARACTER REPOSITORY
═══════════════════════════════════════ */
const GROUND_Y = 0;          // Altitude de repouso no chão
const FLY_TARGET_Y = 4.5;    // Altitude de voo de cruzeiro
const MOVE_SPEED = 0.048;    // Velocidade no solo
const FLY_SPEED = 0.06;      // Velocidade voando

let isFlying = false;
let flyProgress = 0;          // 0 = solo, 1 = voo pleno
let flyTimeAccum = 0;         // Tempo decorrido em voo
let flapTime = 0;
const FLAP_FREQ_FLY = 3.8;    // Frequência de batimento

let isDancing = false;
let isWalking = false;
let wasAirborne = false;      // Rastreia se estava no ar para disparar pouso

// Velocity & vetores de câmera
const velocity = new THREE.Vector3();
const targetVel = new THREE.Vector3();
const camFwd = new THREE.Vector3();
const camRight = new THREE.Vector3();

// Repositório de personagens carregados
const characterData = {};
let activeCharData = null;

const loader = new GLTFLoader();
// selva.glb vem com compressão Draco; decoder da mesma versão do three do importmap
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/libs/draco/gltf/');
loader.setDRACOLoader(dracoLoader);
const loadingEl = document.getElementById('loading');

/**
 * Remove drift linear acumulado nos eixos X, Y e Z do osso Raiz (root motion)
 * para transformar qualquer animação em um ciclo perfeitamente in-place.
 * Isso garante que ao final do ciclo de caminhada ou de voo e ao parar ou retomar
 * o movimento, o personagem continue do ponto exato onde está, sem teleporte para trás.
 */
function makeClipInPlace(clip) {
  if (!clip || !clip.tracks) return;
  clip.tracks.forEach(track => {
    const trackName = track.name.toLowerCase();
    if (trackName.includes('raiz.position') || (trackName.includes('raiz') && trackName.endsWith('.position'))) {
      const times = track.times;
      const values = track.values;
      const count = times.length;
      if (count > 1) {
        const t0 = times[0];
        const tEnd = times[count - 1];
        const duration = tEnd - t0;
        if (duration > 0) {
          const dx = values[(count - 1) * 3] - values[0];
          const dy = values[(count - 1) * 3 + 1] - values[1];
          const dz = values[(count - 1) * 3 + 2] - values[2];

          // Neutraliza o drift linear mantendo o balanço e a oscilação natural de cada passo
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001 || Math.abs(dz) > 0.001) {
            for (let k = 0; k < count; k++) {
              const progress = (times[k] - t0) / duration;
              if (Math.abs(dx) > 0.001) values[k * 3] -= progress * dx;
              if (Math.abs(dy) > 0.001) values[k * 3 + 1] -= progress * dy;
              if (Math.abs(dz) > 0.001) values[k * 3 + 2] -= progress * dz;
            }
          }
        }
      }
    }
  });
}

// Cópia profunda do clip, antes de makeClipInPlace alterar os keyframes
function cloneClipRaw(clip) {
  const tracks = clip.tracks.map(t => {
    const copy = new t.constructor(t.name, t.times.slice(), t.values.slice());
    copy.setInterpolation(t.getInterpolation());
    return copy;
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function loadCharacter(charId, onComplete) {
  if (characterData[charId] && characterData[charId].isLoaded) {
    if (onComplete) onComplete(characterData[charId]);
    return;
  }

  const charDef = CHARACTERS.find(c => c.id === charId);
  if (!charDef || !charDef.modelPath) return;

  loader.load(
    charDef.modelPath,
    (gltf) => {
      const model = gltf.scene;

      /* ── Arma (AK-47) embutida no modelo, se houver ── */
      const akMesh = model.getObjectByName('AK47');
      const akFlashMesh = model.getObjectByName('AK47_Flash');
      const weapon = akMesh ? {
        mesh: akMesh,
        flashMesh: akFlashMesh,
        muzzle: model.getObjectByName('Cano_AK'),    // ponto de saída das balas
        gripBone: model.getObjectByName('Arma'),     // eixo +Y local = direção do cano
        flashBone: model.getObjectByName('Flash_AK'), // escala ~100x nos frames de tiro
      } : null;
      if (weapon) {
        weapon.mesh.visible = false;
        if (weapon.flashMesh) weapon.flashMesh.visible = false;
      }

      // A arma não entra no cálculo de escala, para a cegonha manter o mesmo tamanho de antes
      const isWeaponPart = (obj) => {
        for (let o = obj; o; o = o.parent) {
          if (o === akMesh || o === akFlashMesh) return true;
        }
        return false;
      };
      const bodyBox = () => {
        const b = new THREE.Box3();
        model.updateMatrixWorld(true);
        model.traverse(child => {
          if (child.isMesh && !isWeaponPart(child)) b.expandByObject(child);
        });
        return b;
      };

      // Escala e centraliza o modelo para tamanho proporcional padrão (3 unidades)
      const box = bodyBox();
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 3.0 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));

      // Posiciona sobre o piso
      const box2 = bodyBox();
      model.position.y -= box2.min.y;

      let charSkeleton = null;
      model.traverse(child => {
        if (child.isSkinnedMesh) {
          charSkeleton = child.skeleton;
        }
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
        }
      });

      /* ── Animações & Rigging ── */
      let charMixer = null;
      let charWalkAction = null;
      let charFlyAction = null;
      let charGlideAction = null;
      let charTakeoffAction = null;
      let charLandingAction = null;
      let charIdleAction = null;
      let charSitAction = null;
      let charSittingAction = null;
      let charStandAction = null;
      let charPeckAirAction = null;
      let charPeckGroundAction = null;
      let charAttackAction = null;
      let charDanceAction = null;
      let charCaindoAction = null;
      // Variantes armadas (Cegonha_AK_*)
      const akActions = { hold: null, shoot: null, walk: null, walkShoot: null, fly: null, flyShoot: null };

      // Cegonha: bicadas no chão e no voo (js/bicada_cegonha.js). Já vêm no .glb; se faltarem
      // (outro .glb), são montadas aqui a partir do próprio rig
      if (charId === 'stork' && gltf.animations?.length) {
        const faltam = [BICADA.CHAO.NOME, BICADA.AR.NOME].filter(n => !THREE.AnimationClip.findByName(gltf.animations, n));
        const raizRig = model.getObjectByName('Raiz');
        if (faltam.length && raizRig) {
          try {
            gltf.animations.push(...clipsBicada(raizRig, gltf.animations).filter(c => faltam.includes(c.name)));
            console.log('[StorKiller] Bicadas da cegonha montadas no código:', faltam.join(', '));
          } catch (err) {
            console.warn('[StorKiller] Não foi possível montar as bicadas da cegonha:', err);
          }
        }
      }

      // Clips originais (com root motion), usados pelos urubus inimigos: nas mortes,
      // decolagem e pouso a subida/queda do corpo está no osso Raiz e não pode ser removida
      const rawClips = (gltf.animations || []).map(cloneClipRaw);

      if (gltf.animations && gltf.animations.length > 0) {
        charMixer = new THREE.AnimationMixer(model);

        gltf.animations.forEach((clip, i) => {
          console.log(`[StorKiller] ${charDef.name} Anim[${i}]: "${clip.name}"`);
          const n = clip.name.toLowerCase();

          // Tranco e morte só existem para os urubus inimigos (Morte_Ataque, Atingido_Voo...
          // casariam com 'ataque'/'voo' abaixo e substituiriam os clips do personagem)
          if (n.includes('morte') || n.includes('atingido')) return;
          // Clips do carro/moto são do MotoristaCegonha/PilotoMoto (usam os originais, com o pulo para dentro/fora)
          if (n.includes('carro') || n.includes('buggystork') || n.includes('moto')) return;

          // Neutraliza root motion no clipe para ciclo in-place contínuo sem saltos
          makeClipInPlace(clip);

          if (/(^|_)ak(_|$)/.test(n)) {
            const action = charMixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat);
            const shooting = n.includes('atirando');
            if (n.includes('caminh')) akActions[shooting ? 'walkShoot' : 'walk'] = action;
            else if (n.includes('voo')) akActions[shooting ? 'flyShoot' : 'fly'] = action;
            else if (n.includes('atirar')) akActions.shoot = action;
            else if (n.includes('segurar')) akActions.hold = action;
            console.log(`[StorKiller] ${charDef.name} Rigging armado registrado: "${clip.name}"`);
          } else if (n.includes('ataque') || n.includes('attack')) {
            charAttackAction = charMixer.clipAction(clip);
            charAttackAction.setLoop(THREE.LoopOnce, 1);
            charAttackAction.clampWhenFinished = false;
            console.log(`[StorKiller] ${charDef.name} Rigging ataque registrado: "${clip.name}"`);
          } else if (n.includes('sentada') || n.includes('sitting')) {
            charSittingAction = charMixer.clipAction(clip);
            charSittingAction.setLoop(THREE.LoopRepeat);
            console.log(`[StorKiller] ${charDef.name} Rigging sentada registrado: "${clip.name}"`);
          } else if (n.includes('sentar') || n.includes('sit_down')) {
            charSitAction = charMixer.clipAction(clip);
            charSitAction.setLoop(THREE.LoopOnce, 1);
            charSitAction.clampWhenFinished = true;
            console.log(`[StorKiller] ${charDef.name} Rigging sentar registrado: "${clip.name}"`);
          } else if (n.includes('levantar') || n.includes('stand')) {
            charStandAction = charMixer.clipAction(clip);
            charStandAction.setLoop(THREE.LoopOnce, 1);
            charStandAction.clampWhenFinished = true;
            console.log(`[StorKiller] ${charDef.name} Rigging levantar registrado: "${clip.name}"`);
          } else if (n.includes('bicada_ar') || (n.includes('bicad') && (n.includes('ar') || n.includes('air')))) {
            charPeckAirAction = charMixer.clipAction(clip);
            charPeckAirAction.setLoop(THREE.LoopOnce, 1);
            charPeckAirAction.clampWhenFinished = false;
            console.log(`[StorKiller] ${charDef.name} Rigging bicada ar registrado: "${clip.name}"`);
          } else if (n.includes('bicada_chao') || (n.includes('bicad') && (n.includes('chao') || n.includes('ground')))) {
            charPeckGroundAction = charMixer.clipAction(clip);
            charPeckGroundAction.setLoop(THREE.LoopOnce, 1);
            charPeckGroundAction.clampWhenFinished = false;
            console.log(`[StorKiller] ${charDef.name} Rigging bicada chão registrado: "${clip.name}"`);
          } else if (n.includes('decolagem') || n.includes('takeoff')) {
            charTakeoffAction = charMixer.clipAction(clip);
            charTakeoffAction.setLoop(THREE.LoopOnce, 1);
            charTakeoffAction.clampWhenFinished = true;
            console.log(`[StorKiller] ${charDef.name} Rigging decolagem registrado: "${clip.name}"`);
          } else if (n.includes('pouso') || n.includes('landing')) {
            charLandingAction = charMixer.clipAction(clip);
            charLandingAction.setLoop(THREE.LoopOnce, 1);
            charLandingAction.clampWhenFinished = true;
            console.log(`[StorKiller] ${charDef.name} Rigging pouso registrado: "${clip.name}"`);
          } else if (n.includes('planar') || n.includes('glide')) {
            charGlideAction = charMixer.clipAction(clip);
            charGlideAction.setLoop(THREE.LoopRepeat);
            console.log(`[StorKiller] ${charDef.name} Rigging planar registrado: "${clip.name}"`);
          } else if (n.includes('parado') || n.includes('idle')) {
            charIdleAction = charMixer.clipAction(clip);
            charIdleAction.setLoop(THREE.LoopRepeat);
            console.log(`[StorKiller] ${charDef.name} Rigging parado registrado: "${clip.name}"`);
          } else if (n.includes('caminh') || n.includes('walk') || n.includes('andar')) {
            charWalkAction = charMixer.clipAction(clip);
            charWalkAction.setLoop(THREE.LoopRepeat);
            console.log(`[StorKiller] ${charDef.name} Rigging caminhada registrado: "${clip.name}"`);
          } else if (n.includes('voo') || n.includes('fly') || n.includes('voando')) {
            charFlyAction = charMixer.clipAction(clip);
            charFlyAction.setLoop(THREE.LoopRepeat);
            console.log(`[StorKiller] ${charDef.name} Rigging voo registrado: "${clip.name}"`);
          } else if (n.includes('dance')) {
            charDanceAction = charMixer.clipAction(clip);
            charDanceAction.setLoop(THREE.LoopRepeat);
          } else if (n.includes('caindo')) {
            charCaindoAction = charMixer.clipAction(clip);
            charCaindoAction.setLoop(THREE.LoopOnce, 1);
            charCaindoAction.clampWhenFinished = true;
          }
        });

        // Se houver apenas 1 animação e nenhuma ação atribuída acima:
        if (!charWalkAction && !charFlyAction && gltf.animations.length === 1) {
          const onlyClip = gltf.animations[0];
          makeClipInPlace(onlyClip);
          const n = onlyClip.name.toLowerCase();
          if (n.includes('caminh') || n.includes('walk') || n.includes('andar')) {
            charWalkAction = charMixer.clipAction(onlyClip);
            charWalkAction.setLoop(THREE.LoopRepeat);
          } else {
            charFlyAction = charMixer.clipAction(onlyClip);
            charFlyAction.setLoop(THREE.LoopRepeat);
          }
        }
      }

      /* ── Procedural wing bones (fallback apenas se NÃO houver rigging de voo) ── */
      const charWingBones = [];
      if (!charFlyAction) {
        const wingKeywords = ['wing', 'asa', 'feather', 'pena', 'flap'];
        model.traverse(child => {
          const name = child.name.toLowerCase();
          if (wingKeywords.some(k => name.includes(k))) {
            let side = 1;
            if (name.includes('left') || name.includes('esq')) side = -1;
            else if (name.includes('right') || name.includes('dir')) side = 1;
            else {
              const b = new THREE.Box3().setFromObject(child);
              const c = b.getCenter(new THREE.Vector3());
              side = c.z >= 0 ? 1 : -1;
            }

            charWingBones.push({
              obj: child,
              side,
              restRotX: child.rotation.x,
              restRotY: child.rotation.y,
              restRotZ: child.rotation.z,
            });
          }
        });
      }

      characterData[charId] = {
        def: charDef,
        model,
        mixer: charMixer,
        skeleton: charSkeleton,
        walkAction: charWalkAction,
        flyAction: charFlyAction,
        glideAction: charGlideAction,
        takeoffAction: charTakeoffAction,
        landingAction: charLandingAction,
        idleAction: charIdleAction,
        sitAction: charSitAction,
        sittingAction: charSittingAction,
        standAction: charStandAction,
        peckAirAction: charPeckAirAction,
        peckGroundAction: charPeckGroundAction,
        attackAction: charAttackAction,
        danceAction: charDanceAction,
        caindoAction: charCaindoAction,
        // idle/walk/fly acima são trocadas pelas variantes armadas em applyWeaponActions()
        baseActions: { idle: charIdleAction, walk: charWalkAction, fly: charFlyAction },
        akActions,
        weapon: (weapon && akActions.hold) ? weapon : null,
        rawClips,
        wingBones: charWingBones,
        hasRigging: !!charSkeleton || (gltf.animations && gltf.animations.length > 0),
        isLoaded: true,
      };

      if (onComplete) onComplete(characterData[charId]);
    },
    (xhr) => {
      if (xhr.total && loadingEl && loadingEl.querySelector('p')) {
        loadingEl.querySelector('p').textContent =
          `Carregando ${charDef.name}… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
      }
    },
    (err) => {
      console.error(`Erro ao carregar modelo ${charDef.name}:`, err);
    }
  );
}

function selectCharacter(char) {
  if (char.status !== 'available') return;
  selectedCharacter = char;

  if (!characterData[char.id] || !characterData[char.id].isLoaded) {
    const papel = document.querySelector(`.menu-item[data-char-id="${char.id}"] .menu-item-papel`);
    if (papel) papel.textContent = 'Carregando 3D…';

    loadCharacter(char.id, (data) => {
      if (selectedCharacter && selectedCharacter.id === char.id) {
        applyActiveCharacter(data);
      }
    });
    return;
  }

  applyActiveCharacter(characterData[char.id]);
}

function applyActiveCharacter(charData) {
  pararMenuFundo();

  // Limpa estado do personagem anterior
  if (activeCharData && activeCharData.model) {
    if (activeCharData.walkAction) activeCharData.walkAction.stop();
    if (activeCharData.flyAction) activeCharData.flyAction.stop();
    if (activeCharData.idleAction) activeCharData.idleAction.stop();
    if (activeCharData.takeoffAction) activeCharData.takeoffAction.stop();
    if (activeCharData.landingAction) activeCharData.landingAction.stop();
    if (activeCharData.sitAction) activeCharData.sitAction.stop();
    if (activeCharData.sittingAction) activeCharData.sittingAction.stop();
    if (activeCharData.standAction) activeCharData.standAction.stop();
    if (activeCharData.peckAirAction) activeCharData.peckAirAction.stop();
    if (activeCharData.peckGroundAction) activeCharData.peckGroundAction.stop();
    if (activeCharData.danceAction) activeCharData.danceAction.stop();
    if (activeCharData.mixer) activeCharData.mixer.stopAllAction();
    if (activeCharData.skeleton) activeCharData.skeleton.pose();
    pivot.remove(activeCharData.model);
  }

  activeCharData = charData;

  // Personagem sempre entra desarmado
  isArmed = false;
  isShooting = false;
  applyWeaponActions(false);
  updateWeaponVisibility();
  clearBullets();

  // Mantém a centralização e alinhamento calculados no loadCharacter e reseta a rotação frontal
  activeCharData.model.rotation.set(0, 0, 0);

  pivot.add(activeCharData.model);

  // Reseta estado espacial e controles
  pivot.position.set(0, 0, 0);
  controls.target.set(0, 1, 0);
  controls.reset();
  isFlying = false;
  flyProgress = 0;
  wasAirborne = false;
  isDancing = false;
  isWalking = false;
  isPecking = false;
  zerarBicada();
  isSitting = false;
  isTransitioningSit = false;
  velocity.set(0, 0, 0);

  // Inicia animação de repouso no solo se existir (Cegonha_Parado ou Urubu_Parado)
  if (activeCharData.idleAction && !isFlying) {
    activeCharData.idleAction.reset().fadeIn(0.25).play();
  }

  isGameActive = true;
  controls.autoRotate = false;

  // Esconde tela de seleção
  const charSelectScreen = document.getElementById('char-select-screen');
  if (charSelectScreen) charSelectScreen.classList.add('hidden');

  // Mostra HUD e títulos
  const hud = document.getElementById('hud');
  if (hud) hud.classList.remove('hidden');

  const title = document.getElementById('title');
  if (title) title.classList.remove('hidden');

  const subtitle = document.getElementById('char-active-subtitle');
  if (subtitle) subtitle.innerHTML = `Visualizador 3D &middot; ${charData.def.name}`;

  // Se o personagem possuir dança, exibe o badge
  const danceBadge = document.getElementById('dance-badge');
  if (danceBadge) {
    danceBadge.style.display = charData.danceAction ? 'flex' : 'none';
  }

  // Se o personagem possuir bicadas (no ar ou no chão), exibe o badge
  const peckBadge = document.getElementById('peck-badge');
  if (peckBadge) {
    peckBadge.style.display = (charData.peckAirAction || charData.peckGroundAction) ? 'flex' : 'none';
  }

  // Se o personagem possuir ataque aéreo, exibe o badge
  const attackBadge = document.getElementById('attack-badge');
  if (attackBadge) {
    attackBadge.style.display = charData.attackAction ? 'flex' : 'none';
  }

  // Se o personagem possuir animação de sentar/levantar, exibe o badge
  const sitBadge = document.getElementById('sit-badge');
  if (sitBadge) {
    sitBadge.style.display = (charData.sitAction || charData.sittingAction) ? 'flex' : 'none';
    sitBadge.classList.remove('active');
    const label = sitBadge.querySelector('.badge-label');
    if (label) label.textContent = 'Sentar';
  }

  // Se o personagem possuir arma, exibe os badges de pegar/soltar e atirar
  const armBadge = document.getElementById('arm-badge');
  const shootBadge = document.getElementById('shoot-badge');
  if (armBadge) armBadge.style.display = charData.weapon ? 'flex' : 'none';
  if (shootBadge) shootBadge.style.display = charData.weapon ? 'flex' : 'none';
  updateWeaponHud();

  if (gameMode === 'killer') enterKillerMode(killerInitialPhase);
}

function openCharacterSelect() {
  if (gameMode === 'killer') exitKillerMode();
  isGameActive = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  if (isFlying) exitFly();
  if (activeCharData?.flyAction) activeCharData.flyAction.fadeOut(0.2);
  if (activeCharData?.walkAction) activeCharData.walkAction.fadeOut(0.2);
  if (activeCharData?.idleAction) activeCharData.idleAction.fadeOut(0.2);
  if (activeCharData?.sitAction) activeCharData.sitAction.stop();
  if (activeCharData?.sittingAction) activeCharData.sittingAction.stop();
  if (activeCharData?.standAction) activeCharData.standAction.stop();
  if (activeCharData?.peckAirAction) activeCharData.peckAirAction.stop();
  if (activeCharData?.peckGroundAction) activeCharData.peckGroundAction.stop();
  if (activeCharData?.attackAction) activeCharData.attackAction.stop();
  if (activeCharData?.takeoffAction) activeCharData.takeoffAction.stop();
  if (activeCharData?.landingAction) activeCharData.landingAction.stop();
  stopDance();
  soltarTodosGatilhos();
  isWalking = false;
  isPecking = false;
  zerarBicada();
  isAttacking = false;
  isSitting = false;
  isTransitioningSit = false;

  const charSelectScreen = document.getElementById('char-select-screen');
  if (charSelectScreen) charSelectScreen.classList.remove('hidden');

  const hud = document.getElementById('hud');
  if (hud) hud.classList.add('hidden');

  const title = document.getElementById('title');
  if (title) title.classList.add('hidden');

  iniciarMenuFundo();
}

/* ═══════════════════════════════════════
   TELA INICIAL: FUNDO ANIMADO
   A fase 1 (selva) renderizada atrás do menu, com a cegonha voando
   para destinos aleatórios e a câmera dando uma volta lenta.
═══════════════════════════════════════ */
const MENU = {
  CAM_RAIO: 34,        // órbita da câmera em volta do centro da clareira
  CAM_ALTURA: 12,
  CAM_VEL: 0.035,      // rad/s
  OLHAR_CEGONHA: 0.4,  // quanto o olhar da câmera puxa para a cegonha (0 = centro, 1 = nela)
  VOO_RAIO: 16,        // a cegonha voa dentro desse raio (fica sempre em quadro)
  VOO_ALT_MIN: 9,
  VOO_ALT_MAX: 16,
  VOO_VEL: 7,          // unidades/s
  VOO_CURVA: 0.9,      // rapidez com que ela vira para o próximo destino
};
let menuAtivo = false;
// Som ambiente da tela inicial (vento, pássaros, insetos), bem baixinho
const natureza = criarAmbienteNatureza();
// o navegador só libera áudio depois de um clique/tecla
window.addEventListener('pointerdown', () => natureza.desbloquear());
window.addEventListener('keydown', () => natureza.desbloquear());
document.getElementById('menu-som-btn')?.addEventListener('click', (e) => {
  const mudo = natureza.alternarMudo();
  e.currentTarget.classList.toggle('mudo', mudo);
  e.currentTarget.title = mudo ? 'Ligar som ambiente' : 'Silenciar som ambiente';
});
let menuCamAng = 0;
let menuInclina = 0;
const menuVel = new THREE.Vector3();
const menuAlvo = new THREE.Vector3();
const menuOlhar = new THREE.Vector3();
const _menuDir = new THREE.Vector3();

function novoDestinoMenu() {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * MENU.VOO_RAIO;
  const alt = MENU.VOO_ALT_MIN + Math.random() * (MENU.VOO_ALT_MAX - MENU.VOO_ALT_MIN);
  menuAlvo.set(Math.cos(a) * r, alt, Math.sin(a) * r);
}

function iniciarMenuFundo() {
  const data = characterData.stork;
  if (menuAtivo || isGameActive || !data?.isLoaded) return;   // sem a cegonha ainda: chamado de novo ao carregar
  menuAtivo = true;

  // Só a cegonha no pivot, voando (sem a AK)
  if (activeCharData?.model && activeCharData !== data) pivot.remove(activeCharData.model);
  data.mixer?.stopAllAction();
  pivot.add(data.model);
  data.model.rotation.set(0, 0, 0, 'YXZ');   // rumo, depois sobe/desce e inclinação na curva
  if (data.weapon) {
    data.weapon.mesh.visible = false;
    if (data.weapon.flashMesh) data.weapon.flashMesh.visible = false;
  }
  (data.baseActions?.fly ?? data.flyAction)?.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();

  pivot.position.set(0, (MENU.VOO_ALT_MIN + MENU.VOO_ALT_MAX) / 2, 0);
  menuVel.set(1, 0, 0).multiplyScalar(MENU.VOO_VEL);
  menuInclina = 0;
  novoDestinoMenu();
  menuOlhar.set(0, MENU.VOO_ALT_MIN, 0);

  controls.enabled = false;
  setMapa('selva');            // sem a selva carregada ainda, fica a grade até ela chegar
  natureza.tocar();
}

// Ao escolher um modo: devolve a cegonha e a câmera ao normal
function pararMenuFundo() {
  if (!menuAtivo) return;
  menuAtivo = false;
  natureza.parar();
  const data = characterData.stork;
  data.mixer?.stopAllAction();
  pivot.remove(data.model);
  data.model.rotation.set(0, 0, 0, 'XYZ');
  pivot.position.set(0, 0, 0);
  controls.enabled = true;
  setMapa('grade');
}

function atualizarMenuFundo(delta) {
  const dt = Math.min(delta, 0.05);
  const data = characterData.stork;

  // Voo: segue para um destino aleatório com curvas suaves; ao chegar perto, escolhe outro
  const p = pivot.position;
  _menuDir.subVectors(menuAlvo, p);
  if (_menuDir.length() < 4) novoDestinoMenu();
  _menuDir.normalize().multiplyScalar(MENU.VOO_VEL);
  const rumoAntes = Math.atan2(menuVel.x, menuVel.z);
  menuVel.lerp(_menuDir, Math.min(1, dt * MENU.VOO_CURVA)).setLength(MENU.VOO_VEL);
  p.addScaledVector(menuVel, dt);

  // Orientação: de frente para onde voa, inclina nas curvas e no sobe/desce
  const rumo = Math.atan2(menuVel.x, menuVel.z);
  let giro = rumo - rumoAntes;
  if (giro > Math.PI) giro -= Math.PI * 2;
  if (giro < -Math.PI) giro += Math.PI * 2;
  const inclinaAlvo = THREE.MathUtils.clamp(-(giro / Math.max(dt, 1e-3)) * 0.6, -0.6, 0.6);
  menuInclina += (inclinaAlvo - menuInclina) * Math.min(1, dt * 3);
  const subida = Math.atan2(menuVel.y, Math.hypot(menuVel.x, menuVel.z));
  data.model.rotation.set(-subida * 0.8, rumo, menuInclina);

  // Vento na vegetação da selva
  if (mapaAtual === 'selva') selva.update(dt, []);

  // Câmera: volta lenta pela clareira, olhando entre o centro e a cegonha
  menuCamAng += dt * MENU.CAM_VEL;
  camera.position.set(Math.cos(menuCamAng) * MENU.CAM_RAIO, MENU.CAM_ALTURA, Math.sin(menuCamAng) * MENU.CAM_RAIO);
  camera.position.y = Math.max(camera.position.y, groundAt(camera.position.x, camera.position.z) + 2);
  _menuDir.set(p.x * MENU.OLHAR_CEGONHA, p.y * MENU.OLHAR_CEGONHA + 4 * (1 - MENU.OLHAR_CEGONHA), p.z * MENU.OLHAR_CEGONHA);
  menuOlhar.lerp(_menuDir, Math.min(1, dt * 1.5));
  camera.lookAt(menuOlhar);
}


// Pré-carrega Cegonha e Urubu
loadCharacter('stork', (stork) => {
  carregarMapas(stork.model.scale.x);
  carregarBuggy(stork.model.scale.x);
  carregarMoto(stork.model.scale.x);
  carregarEstrada(stork.model.scale.x);
  iniciarMenuFundo();   // tela inicial: cegonha voando sobre a selva
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    setTimeout(() => loadingEl.remove(), 700);
  }
});
loadCharacter('urubu');

/* ═══════════════════════════════════════
   KEYBOARD & INTERACTIONS
═══════════════════════════════════════ */
const keys = {};
let spacePrev = false;
let isPecking = false;
let isAttacking = false;
let isSitting = false;
let isTransitioningSit = false;
let isArmed = false;
let isShooting = false;

/* ═══════════════════════════════════════
   ARMA (AK-47)
   Armada, idle/walk/fly do personagem passam a apontar para as variantes
   Cegonha_AK_*; assim toda a máquina de estados abaixo continua igual.
═══════════════════════════════════════ */
const WEAPON_CROSSFADE = 0.15;  // Pernas/corpo são os mesmos entre andar e andar atirando
const BULLET_SPEED = 45;        // unidades/s
const BULLET_LIFE = 1.2;        // s
const FLASH_SHOT_SCALE = 10;    // Flash_AK fica em 1 fora do tiro e ~100 no frame do disparo

function isFadingOut(action) {
  const w = action._weightInterpolant;
  return !!w && w.sampleValues[1] === 0;
}

// Troca as ações de idle/walk/fly pelas variantes corretas (desarmada, armada, atirando),
// fazendo crossfade da que estiver tocando para manter a pose contínua
function applyWeaponActions(crossfade = true) {
  const d = activeCharData;
  if (!d?.baseActions) return;
  const ak = d.akActions;
  const armed = isArmed && !!d.weapon;
  const shooting = armed && isShooting;

  const next = {
    idleAction: armed ? ((shooting && ak.shoot) || ak.hold) : d.baseActions.idle,
    walkAction: armed ? ((shooting && ak.walkShoot) || ak.walk || ak.hold) : d.baseActions.walk,
    flyAction: armed ? ((shooting && ak.flyShoot) || ak.fly || d.baseActions.fly) : d.baseActions.fly,
  };

  Object.keys(next).forEach(key => {
    const prev = d[key];
    const nextAction = next[key];
    if (prev === nextAction) return;
    d[key] = nextAction;
    if (!crossfade || cegonhaNoCarro() || !prev || !nextAction) return;
    if (prev.isRunning() && !isFadingOut(prev)) {
      // Mesmo ciclo (andar ↔ andar atirando): mantém a fase das pernas/asas
      const sameCycle = Math.abs(prev.getClip().duration - nextAction.getClip().duration) < 0.01;
      nextAction.reset();
      if (sameCycle) nextAction.time = prev.time;
      nextAction.timeScale = prev.timeScale;
      nextAction.fadeIn(WEAPON_CROSSFADE).play();
      prev.fadeOut(WEAPON_CROSSFADE);
    }
  });
}

function updateWeaponVisibility() {
  const w = activeCharData?.weapon;
  if (!w) return;
  w.mesh.visible = isArmed;
  if (w.flashMesh) w.flashMesh.visible = isArmed;
}

function updateWeaponHud() {
  const armBadge = document.getElementById('arm-badge');
  if (armBadge) {
    armBadge.classList.toggle('active', isArmed);
    const label = armBadge.querySelector('.badge-label');
    if (label) label.textContent = isArmed ? 'Soltar Arma' : 'Pegar Arma';
  }
  const shootBadge = document.getElementById('shoot-badge');
  if (shootBadge) {
    shootBadge.classList.toggle('disabled', !isArmed);
    shootBadge.classList.toggle('active', isShooting);
  }
  // A cegonha só bica sem a arma (com a AK na mão os mesmos botões atiram)
  const peckBadge = document.getElementById('peck-badge');
  if (peckBadge) peckBadge.classList.toggle('disabled', isArmed && !!activeCharData?.weapon);
  // Não há rigging de sentar armada: sentar fica bloqueado enquanto segura a arma
  const sitBadge = document.getElementById('sit-badge');
  if (sitBadge) sitBadge.classList.toggle('disabled', isArmed);
}

function setArmed(armed) {
  if (bicada) return;
  if (cegonhaNoCarro()) {
    // Dirigindo dá para pegar/guardar a AK (a pose troca suave); entrando/saindo, não
    const condutor = condutorAtivo();
    if (!condutor.dirigindo || !activeCharData?.weapon || isArmed === armed) return;
    isArmed = armed;
    if (!armed) {
      isShooting = false;
      if (isAiming) setAiming(false);
    }
    updateWeaponVisibility();
    condutor.definirArma(armed);
    updateWeaponHud();
    return;
  }
  if (!activeCharData?.weapon || isArmed === armed) return;
  if (isTransitioningSit) return;

  // Sentada: levanta primeiro (rigging desarmado) e só então pega a arma
  if (armed && isSitting) {
    standUp(() => setArmed(true));
    return;
  }

  isArmed = armed;
  if (!armed) {
    isShooting = false;
    if (isAiming) setAiming(false);
  }
  stopDance();
  updateWeaponVisibility();
  applyWeaponActions();
  updateWeaponHud();
}

function toggleArmed() {
  if (!isGameActive) return;
  setArmed(!isArmed);
}

function setShooting(shooting) {
  if (shooting && (!isGameActive || !isArmed)) return;
  if (isShooting === shooting) return;
  isShooting = shooting;
  applyWeaponActions();
  updateWeaponHud();
}

/* ── Gatilho ──
   Apertar dispara UM tiro na hora (com o clarão do cano). Só se continuar segurando
   por TIRO.SEGURAR é que entra a rajada (animação de tiro, bala a cada clarão).
   Soltar para a rajada na hora. Mouse, R/F e o botão da HUD contam como "dedos"
   separados: o gatilho só solta quando todos soltarem. */
const TIRO = {
  SEGURAR: 0.18,      // s segurando até virar rajada
  CLARAO: 0.06,       // s do clarão do tiro avulso
};
const gatilho = { dedos: new Set(), tempo: 0 };
let claraoManual = 0;

function apertarGatilho(dedo) {
  if (!isGameActive) return;
  if (!isArmed) {            // sem a arma, o mesmo botão de atacar dá a bicada (o botão "Atirar" do HUD não)
    if (dedo !== 'hud') performPeck();
    return;
  }
  if (!activeCharData?.weapon) return;
  if (cegonhaNoCarro() && !condutorAtivo().dirigindo) return;   // entrando/saindo do veículo (ou caindo da moto)
  if (autoEntrada?.fase === 'levantando') return;              // as mãos estão na moto
  if (gatilho.dedos.has(dedo)) return;
  const primeiro = gatilho.dedos.size === 0;
  gatilho.dedos.add(dedo);
  if (primeiro) {
    gatilho.tempo = 0;
    spawnBullet();
    claraoManual = TIRO.CLARAO;
  }
}

function soltarGatilho(dedo) {
  gatilho.dedos.delete(dedo);
  if (gatilho.dedos.size === 0) setShooting(false);
}

function soltarTodosGatilhos() {
  gatilho.dedos.clear();
  setShooting(false);
}

// Roda todo frame: segurando o bastante, começa a rajada
function atualizarGatilho(delta) {
  if (gatilho.dedos.size === 0) return;
  if (!isArmed) { soltarTodosGatilhos(); return; }
  gatilho.tempo += delta;
  if (gatilho.tempo >= TIRO.SEGURAR && !isShooting) setShooting(true);
}

/* ── Projéteis: nascem no Cano_AK em cada frame de clarão da animação ── */
const bullets = [];
const bulletGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6).rotateX(Math.PI / 2);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
const _bulletPos = new THREE.Vector3();
const _bulletDir = new THREE.Vector3();
const _gripQuat = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _aimRay = new THREE.Ray();
const _aimPoint = new THREE.Vector3();
const _storkFwd = new THREE.Vector3();
const AIM_CONE_COS = Math.cos(THREE.MathUtils.degToRad(55));   // mira vale até 55° da frente da cegonha
const _bulletPrev = new THREE.Vector3();
let lastFlashScale = 1;

// Ponto do mundo sob a mira (centro da tela): urubu, chão ou bem longe
function calcularPontoMira(alvo) {
  _aimRay.origin.copy(camera.position);
  camera.getWorldDirection(_aimRay.direction);
  let aimDist = AIM_DISTANCE;
  const groundY = groundAt(pivot.position.x, pivot.position.z);
  if (_aimRay.direction.y < -1e-4) aimDist = Math.min(aimDist, (groundY - _aimRay.origin.y) / _aimRay.direction.y);
  const target = vultures.raycast(_aimRay);
  if (target && target.distance < aimDist) alvo.copy(target.point);
  else _aimRay.at(aimDist, alvo);
  return alvo;
}

/* ── Pose de mira: a AK aponta para onde a mira está ──
   A Arma e os braços mecânicos que a seguram são irmãos (filhos do Corpo). Mirando, os três
   giram juntos, como um bloco, em volta do ponto dos ombros: o cano aponta para o ponto
   sob a mira e as mãos continuam na arma. Roda depois do mixer (que recoloca a pose da
   animação a cada frame, então o giro não acumula) e antes das balas saírem. */
const MIRA_POSE = {
  MAX_GRAUS: 100,      // giro máximo da arma em relação à pose da animação
};
const _miraAlvo = new THREE.Vector3();
const _miraCano = new THREE.Vector3();
const _miraDir = new THREE.Vector3();
const _miraPivo = new THREE.Vector3();
const _miraAux = new THREE.Vector3();
const _miraQ = new THREE.Quaternion();
const _miraQArma = new THREE.Quaternion();
const _miraM = new THREE.Matrix4();
const _miraGiro = new THREE.Matrix4();
const _miraT = new THREE.Matrix4();
const _miraQAlvo = new THREE.Quaternion();
let ossosMira = null;

function pegarOssosMira() {
  const m = activeCharData?.model;
  if (!m) return null;
  if (ossosMira?.modelo === m) return ossosMira;
  const arma = m.getObjectByName('Arma');
  const cano = m.getObjectByName('Cano_AK');
  const dir = m.getObjectByName('Braco_Mecanico_Direita');
  const esq = m.getObjectByName('Braco_Mecanico_Esquerda');
  ossosMira = arma && cano && dir && esq ? { modelo: m, arma, cano, dir, esq } : null;
  return ossosMira;
}

// O mixer só reescreve um osso quando o valor da animação muda: numa pose parada a Arma não
// seria "desgirada". Por isso a pose da animação é guardada antes do giro e devolvida no
// começo do frame seguinte (antes do mixer).
function restaurarPoseMira() {
  const o = ossosMira;
  if (!o?.salvos) return;
  for (const sv of o.salvos) {
    if (!sv.usado) continue;
    sv.osso.position.copy(sv.p);
    sv.osso.quaternion.copy(sv.q);
    sv.osso.scale.copy(sv.s);
    sv.usado = false;
  }
}

function apontarArmaParaMira() {
  if (aimBlend < 0.01 || !isKillerMode() || !isArmed) return;
  const o = pegarOssosMira();
  if (!o) return;
  // no carro/moto o braço esquerdo está no volante/guidão: gira só a arma e o braço direito
  const noCarro = cegonhaNoCarro();
  if (noCarro && !condutorAtivo().dirigindo) return;
  const ossos = noCarro ? [o.arma, o.dir] : [o.arma, o.dir, o.esq];

  // guarda a pose da animação (devolvida por restaurarPoseMira no próximo frame)
  o.salvos ??= [o.arma, o.dir, o.esq].map(osso => ({
    osso, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), usado: false,
  }));
  for (const sv of o.salvos) {
    if (!ossos.includes(sv.osso)) continue;
    sv.p.copy(sv.osso.position);
    sv.q.copy(sv.osso.quaternion);
    sv.s.copy(sv.osso.scale);
    sv.usado = true;
  }

  calcularPontoMira(_miraAlvo);
  const max = THREE.MathUtils.degToRad(MIRA_POSE.MAX_GRAUS);
  o.modelo.updateMatrixWorld(true);
  // 2 passadas: girar em volta dos ombros desloca a boca do cano; a 2ª corrige essa sobra
  for (let passada = 0; passada < 2; passada++) {
    // direção atual do cano (eixo +Y local da Arma) e direção até o ponto sob a mira
    o.arma.getWorldQuaternion(_miraQArma);
    _miraDir.set(0, 1, 0).applyQuaternion(_miraQArma).normalize();
    o.cano.getWorldPosition(_miraCano);
    _miraAux.subVectors(_miraAlvo, _miraCano);
    if (_miraAux.lengthSq() < 1e-6) return;
    _miraAux.normalize();

    // giro mínimo que leva o cano até a mira (limitado), entrando junto com o zoom da mira
    _miraQAlvo.setFromUnitVectors(_miraDir, _miraAux);
    const ang = 2 * Math.acos(THREE.MathUtils.clamp(_miraQAlvo.w, -1, 1));
    let peso = aimBlend;
    if (ang > max) peso *= max / ang;
    _miraQ.identity().slerp(_miraQAlvo, peso);

    // pivô: ombros (raiz dos braços que seguram a arma)
    _miraPivo.set(0, 0, 0);
    for (const b of ossos) if (b !== o.arma) _miraPivo.add(b.getWorldPosition(_miraAux));
    _miraPivo.divideScalar(ossos.length - 1);

    // W' = T(pivô) · R · T(−pivô) · W   →   local' = Pai⁻¹ · W'
    _miraGiro.makeTranslation(_miraPivo.x, _miraPivo.y, _miraPivo.z)
      .multiply(_miraT.makeRotationFromQuaternion(_miraQ))
      .multiply(_miraT.makeTranslation(-_miraPivo.x, -_miraPivo.y, -_miraPivo.z));
    for (const b of ossos) {
      _miraM.copy(_miraGiro).multiply(b.matrixWorld);
      _miraM.premultiply(_miraT.copy(b.parent.matrixWorld).invert());
      _miraM.decompose(b.position, b.quaternion, b.scale);
    }
    o.modelo.updateMatrixWorld(true);   // o cano (de onde a bala sai) já na pose nova
  }
}

function spawnBullet() {
  const w = activeCharData?.weapon;
  if (!w?.muzzle || !w.gripBone) return;

  w.muzzle.getWorldPosition(_bulletPos);
  if (isKillerMode()) {
    // Modo jogo: a bala sai do cano em direção ao ponto sob a mira (centro da tela)
    calcularPontoMira(_aimPoint);
    _bulletDir.subVectors(_aimPoint, _bulletPos).normalize();

    // Sem mirar, a mira só vale dentro do cone à frente da cegonha; se ela estiver virada
    // para outro lado (o mouse só olha em volta), atira reto para onde ela aponta.
    // Mirando (botão direito), ela acompanha o mouse e o tiro vai sempre para a mira.
    const yaw = cegonhaNoCarro() ? veiculoAtivo().rumo : (pivot.children[0]?.rotation.y ?? 0);
    _storkFwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    const horiz = Math.hypot(_bulletDir.x, _bulletDir.z);
    if (!isAiming && (horiz < 1e-4 || (_bulletDir.x * _storkFwd.x + _bulletDir.z * _storkFwd.z) / horiz < AIM_CONE_COS)) {
      _bulletDir.copy(_storkFwd);
    }
  } else {
    // O cano fica no eixo +Y local do osso Arma (Cano_AK está a +0.53 em Y dele)
    w.gripBone.getWorldQuaternion(_gripQuat);
    _bulletDir.set(0, 1, 0).applyQuaternion(_gripQuat).normalize();
  }

  const mesh = new THREE.Mesh(bulletGeo, bulletMat);
  mesh.position.copy(_bulletPos);
  mesh.quaternion.setFromUnitVectors(_zAxis, _bulletDir);
  scene.add(mesh);
  bullets.push({ mesh, vel: _bulletDir.clone().multiplyScalar(BULLET_SPEED), life: BULLET_LIFE });
  playShotSound();
}

function updateBullets(delta) {
  // Detecta o frame de disparo pela escala do osso Flash_AK
  const w = activeCharData?.weapon;
  if (w?.flashBone && isArmed) {
    const s = w.flashBone.scale.x;
    if (isShooting && s > FLASH_SHOT_SCALE && lastFlashScale <= FLASH_SHOT_SCALE) spawnBullet();
    lastFlashScale = s;
    // Tiro avulso: acende o clarão do cano por um instante (depois da detecção, para não contar como tiro)
    if (claraoManual > 0) {
      claraoManual -= delta;
      if (s < FLASH_SHOT_SCALE) w.flashBone.scale.setScalar(100);
    }
  } else {
    lastFlashScale = 1;
    claraoManual = 0;
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    _bulletPrev.copy(b.mesh.position);
    b.mesh.position.addScaledVector(b.vel, delta);
    b.life -= delta;

    // Testa o trecho percorrido neste frame (a bala é rápida demais para testar só a ponta)
    const hit = isKillerMode() && vultures.hitSegment(_bulletPrev, b.mesh.position);
    // Pântanos: troncos, copas, raízes, chão e água param a bala (o que vier primeiro)
    const obstaculo = isKillerMode() && bateBalaNoMapa(_bulletPrev, b.mesh.position);
    if (obstaculo && (!hit || obstaculo.distancia < hit.t * _bulletPrev.distanceTo(b.mesh.position))) {
      impactoNoMapa(obstaculo.ponto, 2.5);
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }
    if (hit) {
      _bulletDir.copy(b.vel).normalize();
      vultures.damage(hit.vulture, hit.point, _bulletDir);
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }
    // urubus que rondam a trilha do desafio
    if (isKillerMode() && fase === 3 && desafio.ativo && desafio.acertarBala(_bulletPrev, b.mesh.position)) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }

    const bp = b.mesh.position;
    if (bp.y < groundAt(bp.x, bp.z)) {
      if (isKillerMode() && mapaAtual === 'selva') selva.impacto(bp, 1.5);
      scene.remove(b.mesh);
      bullets.splice(i, 1);
      continue;
    }
    if (b.life <= 0) {
      scene.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

function clearBullets() {
  bullets.forEach(b => scene.remove(b.mesh));
  bullets.length = 0;
}

/* ── Som do tiro: rajada curta de ruído sintetizado ── */
let audioCtx = null;

/* ── Trovão do pântano: ruído grave que chega um pouco depois do clarão ── */
function trovao() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dur = 3;
    const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    let marrom = 0;
    for (let i = 0; i < data.length; i++) {
      marrom = (marrom + 0.02 * (Math.random() * 2 - 1)) / 1.02;   // ruído "marrom": estrondo grave
      data[i] = marrom * 3.5 * Math.pow(1 - i / data.length, 2);
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const filtro = audioCtx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 180;
    const ganho = audioCtx.createGain();
    ganho.gain.value = 0.9;
    src.connect(filtro).connect(ganho).connect(audioCtx.destination);
    src.start(audioCtx.currentTime + 0.4 + Math.random() * 1.2);
  } catch (e) {
    // Áudio indisponível: segue sem som
  }
}

/* ── Som do tiro: assets/audios/ak-47_storkiller.mp3 ──
   O arquivo é UM disparo (estampido em ~0,03 s e eco até ~2,5 s, depois silêncio).
   Cada bala toca o começo dele; na rajada o eco é cortado mais cedo e há um limite de
   vozes, para os ecos não embolarem. */
const SOM_TIRO = {
  ARQUIVO: 'assets/audios/ak-47_storkiller.mp3',
  INICIO: 0.02,       // s: pula o silêncio antes do estampido
  DUR_AVULSO: 1.4,    // s de som num tiro avulso (com eco)
  DUR_RAJADA: 0.55,   // s de som por bala na rajada
  VOLUME: 0.225,      // o arquivo passa do máximo (pico 1,19): toca bem mais baixo
  MAX_VOZES: 8,
};
const somTiroCtx = THREE.AudioContext.getContext();   // o mesmo do buggy e da natureza
let somTiroBuffer = null;
const vozesTiro = [];
fetch(SOM_TIRO.ARQUIVO)
  .then(r => r.arrayBuffer())
  .then(dados => somTiroCtx.decodeAudioData(dados))
  .then(buf => { somTiroBuffer = buf; })
  .catch(err => console.warn('[StorKiller] Não foi possível carregar o som do tiro:', err));

function playShotSound() {
  const ctx = somTiroCtx;
  if (!somTiroBuffer) return;
  if (ctx.state !== 'running') ctx.resume();
  const dur = isShooting ? SOM_TIRO.DUR_RAJADA : SOM_TIRO.DUR_AVULSO;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = somTiroBuffer;
  src.playbackRate.value = 0.96 + Math.random() * 0.08;   // cada tiro um pouco diferente
  const g = ctx.createGain();
  g.gain.setValueAtTime(SOM_TIRO.VOLUME, t);
  g.gain.setValueAtTime(SOM_TIRO.VOLUME, t + dur * 0.5);
  g.gain.linearRampToValueAtTime(0, t + dur);             // corta o eco sem estalo
  src.connect(g).connect(ctx.destination);
  src.start(t, SOM_TIRO.INICIO, dur + 0.05);
  vozesTiro.push(src);
  src.onended = () => {
    const i = vozesTiro.indexOf(src);
    if (i >= 0) vozesTiro.splice(i, 1);
  };
  if (vozesTiro.length > SOM_TIRO.MAX_VOZES) vozesTiro.shift().stop();
}

/* ═══════════════════════════════════════
   MODO CEGONHA KILLER
   Jogo em terceira pessoa: câmera a distância fixa atrás da cegonha,
   mouse gira a visão (pointer lock), urubus inimigos aparecem e atacam.
═══════════════════════════════════════ */
let gameMode = 'viewer';   // 'viewer' = visualizador | 'killer' = jogo

/* ── Mapas do modo Killer: fase 1 = selva, fase 2 = pântano (substituem o chão em grade) ── */
let selva = null;          // vento/toque/altura da selva (js/selva.js)
let selvaRoot = null;
let pantano = null;        // chuva, relâmpagos, água e colisão 3D do pântano (js/pantano.js)
let pantanoRoot = null;
let pantanoFalhou = false;
let estrada = null;        // pântano com estrada de chão e lago raso, da fase 3 (js/pantano_estrada.js)
let estradaRoot = null;    // grupo com a mesma escala do buggy: lá dentro tudo é em metros do mapa
let estradaFalhou = false;
let escalaEstrada = 1;
// A fase 3 tem dois mapas no mesmo módulo (pantano_estrada.js): o da fase e a trilha do DESAFIO.
// 'estrada'/'estradaRoot' apontam para o que está em uso; usarMapaEstrada() troca.
let mapaFase3 = null;      // { api, root }
let mapaDesafio = null;    // { api, root } — assets/models/desafio_trilha.glb
let desafioFalhou = false;
let mapaAtual = 'grade';   // 'grade' | 'selva' | 'pantano' | 'estrada'
const mapaToques = [];
const personagensEstrada = [];
const _storkLocal = new THREE.Vector3();   // pés da cegonha em metros do mapa (sempre o mesmo objeto)
const DIA_NO_PANTANO = 0.25;   // quanto sobra das luzes do dia no pântano (o módulo põe lua e relâmpagos)
const somChuva = criarSomChuva();   // barulho da chuva caindo, enquanto o pântano (fase 2) está na tela
const DIA_NA_ESTRADA = 0.55;   // na estrada o mapa põe o próprio sol e céu nublado

// Altura do chão em (x, z) no mapa atual (no pântano, chão ou superfície da água)
function groundAt(x, z) {
  if (mapaAtual === 'selva') return selva.alturaEm(x, z);
  if (mapaAtual === 'pantano') return pantano.alturaPiso(x, z);
  // Estrada: pisa no fundo do lago raso (a água passa da canela)
  if (mapaAtual === 'estrada') return estrada.alturaChao(x / escalaEstrada, z / escalaEstrada) * escalaEstrada;
  return GROUND_Y;
}

function setMapa(nome) {
  if (nome === 'selva' && !selva) nome = 'grade';
  if (nome === 'pantano' && !pantano) nome = selva ? 'selva' : 'grade';
  if (nome === 'estrada' && !estrada) nome = 'grade';
  mapaAtual = nome;

  floor.visible = nome === 'grade';
  grid.visible = nome === 'grade';
  if (selvaRoot) selvaRoot.visible = nome === 'selva';
  if (pantanoRoot) pantanoRoot.visible = nome === 'pantano';
  if (estradaRoot) estradaRoot.visible = nome === 'estrada';

  // Primeiro desliga o ambiente do mapa anterior (devolve o dia), depois liga o do novo
  const noPantano = nome === 'pantano';
  const naEstrada = nome === 'estrada';
  if (pantano && !noPantano) pantano.desativar();
  if (estrada && !naEstrada) estrada.desativar();
  if (noPantano) pantano.ativar(scene);
  if (naEstrada) estrada.ativar(scene);
  if (noPantano) somChuva.tocar();
  else somChuva.parar();
  skyDome.visible = !noPantano && !naEstrada;
  const luzDia = noPantano ? DIA_NO_PANTANO : naEstrada ? DIA_NA_ESTRADA : 1;
  dayLights.forEach(({ light, base }) => { light.intensity = base * luzDia; });

  // Coloca a cegonha em cima do terreno (sem esperar a interpolação de altitude; no menu ela está voando)
  if (!isFlying && !menuAtivo) pivot.position.y = groundAt(pivot.position.x, pivot.position.z);
}

function mapaDaFase() {
  return fase === 3 ? 'estrada' : fase === 2 ? 'pantano' : 'selva';
}

// O mapa é preparado em metros (raiz ainda sem pai) e só depois vai para o grupo escalado:
// assim alturaChao, superficie, profundidade e colisão falam a mesma língua do buggy.
function carregarEstrada(escala) {
  carregarMapa('assets/models/pantano_estrada.glb', 'pantano_estrada.glb', (raiz, malhas) => {
    estrada = prepararPantanoEstrada(raiz, { camera });
    estrada.definirEscala(escala);
    escalaEstrada = escala;
    estradaRoot = new THREE.Group();
    estradaRoot.scale.setScalar(escala);
    estradaRoot.add(raiz);
    estradaRoot.visible = false;
    scene.add(estradaRoot);
    mapaFase3 = { api: estrada, root: estradaRoot };
    const c = estrada.colisores;
    console.log(`[StorKiller] Pântano com estrada carregado: ${malhas} malhas, ${c.capsulas.length} troncos/galhos, ${c.copas.length} copas, ${c.baixos.length} obstáculos baixos`);
    if (isKillerMode() && fase === 3) {
      setMapa('estrada');
      prepararCarroFase3();
    }
    carregarTrilhaDesafio(escala);
  }, () => { estradaFalhou = true; });
}

// Trilha do desafio da fase 3 (pântano → floresta → zona rural → cidade → deserto → oásis).
// Mesmo módulo e mesma escala do mapa da fase 3; fica escondida até a cegonha entrar no desafio.
function carregarTrilhaDesafio(escala) {
  carregarMapa('assets/models/desafio_trilha.glb', 'desafio_trilha.glb', (raiz, malhas) => {
    const api = prepararPantanoEstrada(raiz, { camera, neblina: 0.0052 });
    api.definirEscala(escala);
    const root = new THREE.Group();
    root.name = 'Desafio_Trilha';
    root.scale.setScalar(escala);
    root.add(raiz);
    root.visible = false;
    scene.add(root);
    mapaDesafio = { api, root };
    const c = api.colisores;
    console.log(`[StorKiller] Trilha do desafio carregada: ${malhas} malhas, ${c.capsulas.length} troncos, ${c.copas.length} copas, ${c.baixos.length} obstáculos baixos, ${c.caixas.length} construções`);
  }, () => { desafioFalhou = true; });
}

// Troca o mapa da estrada em uso ('fase3' ou 'desafio'): ambiente, chão dos veículos, colisão, tiros...
function usarMapaEstrada(qual) {
  const alvo = qual === 'desafio' ? mapaDesafio : mapaFase3;
  if (!alvo) return false;
  if (estrada && estrada !== alvo.api) {
    estrada.desativar();
    if (estradaRoot) estradaRoot.visible = false;
  }
  estrada = alvo.api;
  estradaRoot = alvo.root;
  if (isKillerMode() && fase === 3) setMapa('estrada');
  ligarVeiculoAoMapa(buggy);
  ligarVeiculoAoMapa(moto);
  updateKillerHud();
  return true;
}

// Saindo da fase 3 (ou recomeçando): o desafio acaba na hora e o mapa da fase volta a ser o padrão
function encerrarDesafio() {
  desafio.abortar();
  if (mapaFase3 && estrada !== mapaFase3.api) {
    estrada?.desativar();
    if (estradaRoot) estradaRoot.visible = false;
    estrada = mapaFase3.api;
    estradaRoot = mapaFase3.root;
  }
}

// Bala que andou de p0 até p1 (mundo) bateu em árvore, copa, obstáculo, chão ou água do mapa atual?
const _balaA = new THREE.Vector3();
const _balaDir = new THREE.Vector3();
function bateBalaNoMapa(p0, p1) {
  if (mapaAtual === 'pantano') return pantano.bateBala(p0, p1);
  if (mapaAtual === 'estrada') {
    _balaA.copy(p0).divideScalar(escalaEstrada);
    _balaDir.subVectors(p1, p0).divideScalar(escalaEstrada);
    const dist = _balaDir.length();
    if (dist < 1e-6) return null;
    const r = estrada.raycast(_balaA, _balaDir, dist);
    if (r) {
      r.ponto.multiplyScalar(escalaEstrada);
      r.distancia *= escalaEstrada;
    }
    return r;
  }
  return null;
}

// Sacode as plantas em volta de um ponto do mundo (tiro que bateu em algo)
function impactoNoMapa(ponto, raio) {
  if (mapaAtual === 'pantano') pantano.impacto(ponto, raio);
  else if (mapaAtual === 'estrada') estrada.impacto(_balaA.copy(ponto).divideScalar(escalaEstrada), raio);
  else if (mapaAtual === 'selva') selva.impacto(ponto, raio);
}

function carregarMapa(url, nome, onOk, onErro) {
  loader.load(
    url,
    (gltf) => {
      let malhas = 0;
      gltf.scene.traverse(o => { if (o.isMesh) malhas++; });
      if (!malhas) {
        console.warn(`[StorKiller] ${nome} não tem nenhuma malha (exportação vazia).`);
        onErro();
        return;
      }
      onOk(gltf.scene, malhas);
    },
    undefined,
    (err) => {
      console.warn(`[StorKiller] Não foi possível carregar ${nome}:`, err);
      onErro();
    },
  );
}

// Os mapas foram feitos para a cegonha no tamanho real (~1,5 m); o jogo a aumenta para ~2,4,
// então eles crescem na mesma proporção. Por isso só carregam depois da cegonha.
function carregarMapas(escala) {
  carregarMapa('assets/models/selva.glb', 'selva.glb', (raiz, malhas) => {
    selvaRoot = raiz;
    selvaRoot.scale.setScalar(escala);
    selva = prepararSelva(selvaRoot, { raioToque: 1.1 * escala });
    selvaRoot.visible = false;
    scene.add(selvaRoot);
    console.log(`[StorKiller] Selva carregada: ${malhas} malhas, ${selva.colisores.length} troncos com colisão`);
    if ((isKillerMode() && mapaDaFase() === 'selva') || menuAtivo) setMapa('selva');
    carregarPantano(escala);
  }, () => carregarPantano(escala));
}

function carregarPantano(escala) {
  carregarMapa('assets/models/pantano.glb', 'pantano.glb', (raiz, malhas) => {
    pantanoRoot = raiz;
    pantanoRoot.scale.setScalar(escala);
    pantano = prepararPantano(pantanoRoot, { camera, raioToque: 1.5 * escala });
    pantano.onRelampago = trovao;
    pantanoRoot.visible = false;
    scene.add(pantanoRoot);
    const c = pantano.colisores;
    console.log(`[StorKiller] Pântano carregado: ${malhas} malhas, ${c.capsulas.length} troncos/galhos, ${c.copas.length} copas, ${c.baixos.length} obstáculos baixos`);
    if (isKillerMode() && mapaDaFase() === 'pantano') setMapa('pantano');
  }, () => { pantanoFalhou = true; });
}

/* ── Colisão da cegonha com o mapa ── */
const STORK_COLLIDER = { HEIGHT: 1.2, RADIUS: 0.8 };   // esfera no meio do corpo (pés + 1,2)
const _storkPrevFeet = new THREE.Vector3();
const _storkCenter = new THREE.Vector3();
const _storkPrevCenter = new THREE.Vector3();
const _storkTouch = new THREE.Vector3();
const STORK_CARRO = { ALTURA: 0.7, RAIO: 0.35 };   // esfera da cegonha contra o buggy (metros do carro; cabe entre a caixa e a Cegonha_Entrada)
const STORK_MOTO = { ALTURA: 0.7, RAIO: 0.3 };     // idem contra a moto (no pezinho ela deita 9° para o lado da subida)

function colidirCegonhaComMapa(noChao) {
  if (mapaAtual === 'selva') {
    // Selva: não atravessa troncos nem sai do mapa
    if (noChao) selva.resolverColisao(pivot.position, 0.5);
    const lim = selva.limites;
    if (lim) {
      pivot.position.x = THREE.MathUtils.clamp(pivot.position.x, lim.min.x + 1, lim.max.x - 1);
      pivot.position.z = THREE.MathUtils.clamp(pivot.position.z, lim.min.z + 1, lim.max.z - 1);
    }
  } else if (mapaAtual === 'pantano') {
    // Pântano: troncos, raízes e copas (no ar também). No chão só corrige o plano:
    // a altura dos pés continua com a máquina de voo/pouso
    _storkCenter.copy(pivot.position).y += STORK_COLLIDER.HEIGHT;
    _storkPrevCenter.copy(_storkPrevFeet).y += STORK_COLLIDER.HEIGHT;
    pantano.resolverColisao(_storkCenter, STORK_COLLIDER.RADIUS, { anterior: _storkPrevCenter, chao: false });
    pivot.position.x = _storkCenter.x;
    pivot.position.z = _storkCenter.z;
    if (!noChao) pivot.position.y = _storkCenter.y - STORK_COLLIDER.HEIGHT;
  } else if (mapaAtual === 'estrada') {
    // Mesma ideia do pântano, convertendo para metros do mapa e de volta
    const e = escalaEstrada;
    _storkCenter.copy(pivot.position).setY(pivot.position.y + STORK_COLLIDER.HEIGHT).divideScalar(e);
    _storkPrevCenter.copy(_storkPrevFeet).setY(_storkPrevFeet.y + STORK_COLLIDER.HEIGHT).divideScalar(e);
    estrada.resolverColisao(_storkCenter, STORK_COLLIDER.RADIUS / e, { anterior: _storkPrevCenter, chao: false });
    _storkCenter.multiplyScalar(e);
    pivot.position.x = _storkCenter.x;
    pivot.position.z = _storkCenter.z;
    if (!noChao) pivot.position.y = _storkCenter.y - STORK_COLLIDER.HEIGHT;
  }

  // Fase 3: o buggy é sólido para a cegonha a pé (empurra para o lado; por cima só se cair em cima)
  if (fase === 3 && buggy && buggyRoot?.visible && !cegonhaNoCarro() && !autoEntrada) {
    const e = buggyRoot.scale.x;
    _storkCenter.copy(pivot.position).y += STORK_CARRO.ALTURA * e;   // centro do corpo (≈ pés + 0,7 m)
    if (buggy.resolverColisao(_storkCenter, STORK_CARRO.RAIO)) {      // raio em metros do carro
      pivot.position.x = _storkCenter.x;
      pivot.position.z = _storkCenter.z;
      if (!noChao) pivot.position.y = _storkCenter.y - STORK_CARRO.ALTURA * e;
    }
  }
  if (fase === 3 && moto && motoRoot?.visible && !cegonhaNoCarro() && !autoEntrada) {
    const e = motoRoot.scale.x;
    _storkCenter.copy(pivot.position).y += STORK_MOTO.ALTURA * e;
    if (moto.resolverColisao(_storkCenter, STORK_MOTO.RAIO)) {
      pivot.position.x = _storkCenter.x;
      pivot.position.z = _storkCenter.z;
      if (!noChao) pivot.position.y = _storkCenter.y - STORK_MOTO.ALTURA * e;
    }
  }
}

/* ── Fases do modo Killer ── */
const FASE1_META = 10;                   // urubus abatidos para concluir a selva
const FASE2_META = 15;                   // urubus abatidos para concluir o pântano
const FASE2_VELOCIDADE_POR_ABATE = 0.05; // +5% de velocidade dos urubus a cada abate no pântano
const FASE_AJUSTES = {
  1: {
    maxVultures: VULTURE_CONFIG.MAX_VULTURES,
    maxAttackers: VULTURE_CONFIG.MAX_ATTACKERS,
    spawnMin: VULTURE_CONFIG.SPAWN_MIN,
    spawnMax: VULTURE_CONFIG.SPAWN_MAX,
    speed: 1,
  },
  2: {
    // O dobro de urubus: limite dobrado e aparecendo no dobro do ritmo
    maxVultures: VULTURE_CONFIG.MAX_VULTURES * 2,
    maxAttackers: VULTURE_CONFIG.MAX_ATTACKERS + 1,
    spawnMin: VULTURE_CONFIG.SPAWN_MIN / 2,
    spawnMax: VULTURE_CONFIG.SPAWN_MAX / 2,
    speed: 1,
  },
  3: {
    // Por enquanto sem urubus: fase para testar o buggy (aumente maxVultures para ligar)
    maxVultures: 0,
    maxAttackers: VULTURE_CONFIG.MAX_ATTACKERS,
    spawnMin: VULTURE_CONFIG.SPAWN_MIN,
    spawnMax: VULTURE_CONFIG.SPAWN_MAX,
    speed: 1,
  },
};
const TRANSICAO_FASE = 3.5;   // s de aviso de "fase concluída" antes de trocar o mapa

let fase = 1;
let faseKills = 0;
let faseConcluida = false;
let transicaoTimer = 0;
let bannerTimer = null;

function velocidadeUrubusFase2() {
  return 1 + faseKills * FASE2_VELOCIDADE_POR_ABATE;
}

function iniciarFase1() {
  encerrarDesafio();
  fase = 1;
  faseKills = 0;
  faseConcluida = false;
  transicaoTimer = 0;
  esconderCarro();
  vultures.configure(FASE_AJUSTES[1]);
  setMapa('selva');
  mostrarBanner('Fase 1 — Selva', `Abata ${FASE1_META} urubus`, 3000);
}

function concluirFase(n) {
  faseConcluida = true;
  transicaoTimer = TRANSICAO_FASE;
  vultures.configure({ maxVultures: 0 });   // param de chegar urubus durante o aviso
  const meta = n === 1 ? FASE1_META : FASE2_META;
  const proxima = n === 1 ? 'Pântano' : 'Buggy e moto';
  mostrarBanner(`Fase ${n} concluída!`, `${meta} urubus abatidos · Próxima fase: ${proxima}`, 0);
}

function iniciarFase2() {
  encerrarDesafio();
  fase = 2;
  faseKills = 0;
  faseConcluida = false;
  vultures.clear();
  blood.clear();
  clearBullets();
  // Recomeça no centro do pântano (ponto livre de árvores)
  pivot.position.set(0, pivot.position.y, 0);
  velocity.set(0, 0, 0);
  setMapa('pantano');
  vultures.configure({ ...FASE_AJUSTES[2], speed: velocidadeUrubusFase2() });
  mostrarBanner('Fase 2 — Pântano', 'O dobro de urubus · eles ficam mais rápidos a cada abate', 3500);
  updateKillerHud();
}

function iniciarFase3() {
  encerrarDesafio();
  fase = 3;
  faseKills = 0;
  faseConcluida = false;
  vultures.clear();
  blood.clear();
  clearBullets();
  // Recomeça a pé, no centro do chão plano, com o buggy estacionado à frente
  if (isFlying) exitFly();
  flyProgress = 0;
  wasAirborne = false;
  pivot.position.set(0, 0, 0);
  velocity.set(0, 0, 0);
  setMapa('estrada');
  vultures.configure(FASE_AJUSTES[3]);
  prepararCarroFase3();
  mostrarBanner('Fase 3 — Buggy e moto',
    buggy ? textoFase3() : (buggyFalhou ? 'Não foi possível carregar o buggy' : 'Carregando o buggy…'), 4500);
  updateKillerHud();
}

// Roda a cada frame no modo Killer: espera o aviso e o mapa da próxima fase carregar
function atualizarFases(delta) {
  if (!faseConcluida) return;
  transicaoTimer -= delta;
  if (transicaoTimer > 0) return;
  if (fase === 1) {
    if (pantano || pantanoFalhou) iniciarFase2();
    else mostrarBanner('Fase 1 concluída!', 'Carregando o pântano…', 0);
  } else if (fase === 2) {
    if ((buggy || buggyFalhou) && (moto || motoFalhou) && (estrada || estradaFalhou)) iniciarFase3();
    else mostrarBanner('Fase 2 concluída!', 'Carregando os veículos e a estrada…', 0);
  }
}

/* ── Fase 3: buggy e moto no pântano com estrada (por enquanto só para testar os veículos, sem urubus) ── */
let buggy = null;          // física do carro (js/carro.js)
let buggyRoot = null;      // grupo com a mesma escala da cegonha (a física roda em metros dentro dele)
let buggyFalhou = false;
let motorista = null;      // anima a cegonha entrando, dirigindo (e atirando) e saindo
let moto = null;           // física da moto (js/moto.js)
let motoRoot = null;       // grupo com a mesma escala do buggy (metros da moto = metros do mapa)
let motoFalhou = false;
let piloto = null;         // anima a cegonha subindo, pilotando, descendo e caindo da moto
const CARRO = {
  // Sem o mapa da estrada (falhou ao carregar): chão plano, carro estacionado aqui
  POS: new THREE.Vector3(0, 0, 9),  // mundo
  RUMO: Math.PI / 2,
  LIMITE: 64,                       // raio do chão plano (mundo) que o carro não atravessa
  DIST_CEGONHA: 3,                  // a cegonha começa a pé a essa distância da porta (mundo)
  CAM_EXTRA: 3.5,                   // câmera mais afastada enquanto está no carro
  CAM_SEGUE: 1200,                  // ms sem mexer o mouse até a câmera voltar para trás do carro
};
const MOTO = {
  // a moto começa estacionada ao lado direito do buggy (o lado oposto à porta), um pouco para trás,
  // virada para o mesmo lado: sai andando sem bater nele (metros do mapa, centro a centro)
  LADO: 2.6,
  ATRAS: 1.6,
  CAM_EXTRA: 1.5,                   // câmera um pouco mais afastada pilotando (a moto é menor que o buggy)
  DIST_SUBIR: 1.7,                  // distância (metros da moto) do ponto de subida em que o E funciona
};
const _modeloOffset = new THREE.Vector3();
const _tmpCarro = new THREE.Vector3();
const _tmpCarro2 = new THREE.Vector3();
let _modeloEscala = 1;
let carCamBlend = 0;
let camExtraVeiculo = 0;   // quanto a câmera se afasta no veículo atual (buggy ou moto)
let ultimoMovMouse = 0;
let dicaCarroAtual = '';

// Quem está com a cegonha agora (entrando, dirigindo, saindo, caindo...): motorista do buggy, piloto da moto ou ninguém
function condutorAtivo() {
  if (motorista && motorista.estado !== 'fora') return motorista;
  if (piloto && piloto.estado !== 'fora') return piloto;
  return null;
}
function veiculoDe(condutor) { return condutor === piloto ? moto : buggy; }
function veiculoAtivo() { const c = condutorAtivo(); return c ? veiculoDe(c) : null; }
function rootDe(veiculo) { return veiculo === moto ? motoRoot : buggyRoot; }
function nomeDe(veiculo) { return veiculo === moto ? 'a moto' : 'o buggy'; }

function textoFase3() {
  return (moto ? 'Aperte E perto do buggy ou da moto para pegar um deles' : 'Vá até a porta do buggy e aperte E para entrar')
    + ' · leve o veículo até o DESAFIO sinalizado (anel de luz) para correr contra o relógio';
}

function carregarBuggy(escala) {
  carregarMapa('assets/models/buggy.glb', 'buggy.glb', (raiz) => {
    buggyRoot = new THREE.Group();
    buggyRoot.scale.setScalar(escala);
    buggyRoot.add(raiz);
    raiz.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    buggyRoot.visible = false;
    scene.add(buggyRoot);
    buggyRoot.updateMatrixWorld(true);
    // Chão/colisão/piso são ligados ao mapa da fase em ligarVeiculoAoMapa()
    buggy = new Buggy(raiz, {});
    console.log('[StorKiller] Buggy carregado');
    criarSomBuggy(escala);
    if (isKillerMode() && fase === 3) {
      prepararCarroFase3();
      mostrarBanner('Fase 3 — Buggy e moto', textoFase3(), 4500);
    }
  }, () => { buggyFalhou = true; });
}

function carregarMoto(escala) {
  carregarMapa('assets/models/moto_jogo.glb', 'moto_jogo.glb', (raiz) => {
    motoRoot = new THREE.Group();
    motoRoot.scale.setScalar(escala);
    motoRoot.add(raiz);
    raiz.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    motoRoot.visible = false;
    scene.add(motoRoot);
    motoRoot.updateMatrixWorld(true);
    moto = new Moto(raiz, {});
    console.log('[StorKiller] Moto carregada');
    criarSomMoto(escala);
    // carregou com a fase 3 já rodando: só põe a moto na estrada (não mexe no buggy nem na cegonha)
    if (isKillerMode() && fase === 3 && buggyRoot?.visible) {
      criarPiloto();
      posicionarMotoFase3();
    }
  }, () => { motoFalhou = true; });
}

/* ── Som dos veículos (js/som_carro.js): motor, pneus na terra/grama, água, batidas ── */
const SOM_BUGGY = {
  PASTA: 'assets/audios/sons_carro/sons/',
  VOLUME: 0.25,         // volume geral do carro (1/4 do original; motor, piso e água têm ajuste próprio no SomBuggy)
  DIST_REF: 7,          // metros até o som começar a cair com a distância (escalado como o carro)
};
const SOM_MOTO = {
  PASTA: 'assets/audios/sons_moto/sons/',   // mesmos nomes do buggy + queda_* e raspando_* (moto caindo/escorregando)
  VOLUME: 0.25,         // mesmo nível do buggy (motor, piso e água têm ajuste próprio no SomBuggy)
  DIST_REF: 5,          // a moto é menor: o som começa a cair mais perto
};
let somBuggy = null;
let somMoto = null;
let audioListener = null;

function ouvido() {
  // O "ouvido" do jogo fica na câmera; o som sai do próprio veículo (posicional)
  if (!audioListener) {
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
  }
  return audioListener;
}

// Cria o SomBuggy de um veículo; quando os sons carregam, chama pronto(som)
function criarSomVeiculo(veiculo, nome, pasta, distRef, pronto) {
  try {
    const som = new SomBuggy(veiculo, ouvido(), { pasta, distanciaRef: distRef });
    som.definirVolume(0);                        // mudo até a fase 3 mostrar o veículo
    // o navegador só libera áudio depois de um clique/tecla
    const liberar = () => som.desbloquear();
    window.addEventListener('pointerdown', liberar);
    window.addEventListener('keydown', liberar);
    som.carregar().then(() => {
      pronto(som);
      console.log(`[StorKiller] Sons d${nome} carregados`);
    }).catch(err => console.warn(`[StorKiller] Não foi possível carregar os sons d${nome}:`, err));
  } catch (err) {
    console.warn(`[StorKiller] Áudio d${nome} indisponível:`, err);
  }
}

function criarSomBuggy(escala) {
  criarSomVeiculo(buggy, 'o buggy', SOM_BUGGY.PASTA, SOM_BUGGY.DIST_REF * escala, (som) => {
    somBuggy = som;
    if (isKillerMode() && fase === 3 && buggyRoot?.visible) som.definirVolume(SOM_BUGGY.VOLUME);
    if (motorista?.dirigindo) som.ligar();
  });
}

function criarSomMoto(escala) {
  criarSomVeiculo(moto, 'a moto', SOM_MOTO.PASTA, SOM_MOTO.DIST_REF * escala, (som) => {
    somMoto = som;
    if (isKillerMode() && fase === 3 && motoRoot?.visible) som.definirVolume(SOM_MOTO.VOLUME);
    if (piloto?.dirigindo) som.ligar();
  });
}

// Liga/desliga o volume dos dois veículos (pausa, fim da fase)
function volumeVeiculos(ligado) {
  somBuggy?.definirVolume(ligado && buggyRoot?.visible ? SOM_BUGGY.VOLUME : 0);
  somMoto?.definirVolume(ligado && motoRoot?.visible ? SOM_MOTO.VOLUME : 0);
}

function cegonhaNoCarro() {
  return !!condutorAtivo();
}

// Liga um veículo ao chão do mapa atual (em metros = coordenadas do grupo do veículo).
// Os dois veículos também são sólidos um para o outro.
function ligarVeiculoAoMapa(v) {
  if (!v) return;
  let base;
  if (mapaAtual === 'estrada') {
    // mesmo grupo/escala do mapa: alturaChao, árvores, tipo de piso e água do lago
    const o = estrada.paraBuggy();
    v.alturaChao = o.alturaChao;
    base = o.resolverColisao;
    v.superficie = o.superficie;
    v.profundidade = o.profundidade;
  } else {
    // chão plano com um limite redondo
    const limite = CARRO.LIMITE / rootDe(v).scale.x;
    v.alturaChao = () => 0;
    base = (centro, raio) => {
      const d = Math.hypot(centro.x, centro.z);
      if (d + raio > limite) {
        const k = (limite - raio) / d;
        centro.x *= k;
        centro.z *= k;
      }
    };
    v.superficie = null;
    v.profundidade = null;
  }
  v._colisaoMundo = (centro, raio, op) => {
    const contato = base(centro, raio, op);
    return colidirComOutroVeiculo(v, centro, raio) ?? contato;
  };
}

// centro em metros do veículo v (grupo escalado) contra as caixas do outro veículo (que trabalham no mundo)
const _colVeic = new THREE.Vector3();
function colidirComOutroVeiculo(v, centro, raio) {
  const outro = v === moto ? buggy : moto;
  const root = rootDe(outro);
  if (!outro || !root?.visible) return null;
  const e = root.scale.x;
  _colVeic.copy(centro).multiplyScalar(e);
  const contato = outro.resolverColisao(_colVeic, raio);
  if (contato) centro.copy(_colVeic).divideScalar(e);
  return contato;
}

function prepararCarroFase3() {
  if (!buggy) return;
  if (!motorista) {
    try {
      // Clips originais: Entrar/Sair levam a cegonha para dentro e para fora do carro pelo osso Raiz
      motorista = new MotoristaCegonha({
        cegonha: activeCharData.model,
        mixer: activeCharData.mixer,
        clips: activeCharData.rawClips,
        buggy,
        cena: scene,
        alturaChao: (x, z) => groundAt(x, z),   // onde ela pisa ao sair (mundo)
        armada: () => isArmed,                  // entra/dirige/sai com ou sem a AK
        distanciaEntrar: 2.5 * buggyRoot.scale.x,
      });
      motorista.onSaiu = () => {
        somBuggy?.desligar();
        devolverCegonhaAoPivot();
      };
      motorista.onEntrou = () => somBuggy?.ligar();   // partida + motor
    } catch (err) {
      console.error('[StorKiller] Não foi possível preparar a cegonha motorista:', err);
      buggyFalhou = true;
      return;
    }
  }
  criarPiloto();
  ligarVeiculoAoMapa(buggy);
  if (mapaAtual === 'estrada') {
    // O mapa diz onde o carro começa: parado na estrada
    buggy.posicionar(estrada.inicioCarro.posicao, estrada.inicioCarro.rumo);
  } else {
    buggy.posicionar(_tmpCarro.copy(CARRO.POS).divideScalar(buggyRoot.scale.x), CARRO.RUMO);
  }
  buggyRoot.visible = true;
  buggyRoot.updateMatrixWorld(true);
  buggy.no.updateMatrixWorld(true);
  posicionarMotoFase3();
  volumeVeiculos(true);

  // A cegonha começa a pé, ao lado da porta esquerda e de frente para o carro
  if (!cegonhaNoCarro()) {
    const porta = buggy.pontoEntrada(_tmpCarro);
    buggy.no.getWorldPosition(_tmpCarro2);
    const dx = porta.x - _tmpCarro2.x, dz = porta.z - _tmpCarro2.z;
    const d = Math.hypot(dx, dz) || 1;
    pivot.position.set(porta.x + dx / d * CARRO.DIST_CEGONHA, 0, porta.z + dz / d * CARRO.DIST_CEGONHA);
    pivot.position.y = groundAt(pivot.position.x, pivot.position.z);
    if (pivot.children[0]) pivot.children[0].rotation.y = Math.atan2(-dx, -dz);
    camYaw = Math.atan2(dx, dz);   // câmera atrás da cegonha, olhando para o carro
  }
}

// PilotoMoto: usa a mesma cegonha e o mesmo mixer do motorista do buggy (só um dos dois fica com ela por vez)
function criarPiloto() {
  if (moto && !piloto && !motoFalhou && activeCharData?.mixer) {
    try {
      piloto = new PilotoMoto({
        cegonha: activeCharData.model,
        mixer: activeCharData.mixer,
        clips: activeCharData.rawClips,
        moto,
        cena: scene,
        alturaChao: (x, z) => groundAt(x, z),   // onde ela pisa ao descer / pousa na queda (mundo)
        armada: () => isArmed,
        distanciaEntrar: MOTO.DIST_SUBIR * motoRoot.scale.x,
        // no voo da queda ela não atravessa árvores (centro e raio no mundo)
        resolverColisao: (c, r) => {
          if (mapaAtual !== 'estrada') return null;
          const e = escalaEstrada;
          c.divideScalar(e);
          const contato = estrada.resolverColisao(c, r / e, { chao: false });
          c.multiplyScalar(e);
          return contato;
        },
      });
      piloto.onSaiu = () => {
        somMoto?.desligar();
        devolverCegonhaAoPivot();
      };
      piloto.onEntrou = () => somMoto?.ligar();
      // o som da queda (pancada no piso + raspando) e o motor morrendo vêm do som_carro.js, lendo a moto
      piloto.onQueda = () => {
        soltarTodosGatilhos();
        mouseShooting = false;
        if (isAiming) setAiming(false);
      };
      piloto.onCaiu = () => mostrarBanner('Caiu da moto!', 'Chegue perto e aperte E para levantar a moto', 2500);
    } catch (err) {
      console.error('[StorKiller] Não foi possível preparar a cegonha piloto:', err);
      motoFalhou = true;
      piloto = null;
    }
  }
}

// A moto fica estacionada ao lado do buggy, virada para o mesmo lado
function posicionarMotoFase3() {
  if (!moto || !piloto || !buggy || condutorAtivo() === piloto) return;
  ligarVeiculoAoMapa(moto);
  ligarVeiculoAoMapa(buggy);     // agora o buggy também bate na moto
  const f = buggy.frente;                 // esquerda do buggy = (f.z, -f.x); a moto vai para a direita
  _tmpCarro2.set(buggy.pos.x - f.x * MOTO.ATRAS - f.z * MOTO.LADO, 0, buggy.pos.z - f.z * MOTO.ATRAS + f.x * MOTO.LADO);
  moto.posicionar(_tmpCarro2, buggy.rumo);
  motoRoot.visible = true;
  motoRoot.updateMatrixWorld(true);
  volumeVeiculos(!jogoPausado);
}

// E: perto de um veículo, ela caminha sozinha até o lado dele e entra/sobe; dirigindo (parado), sai/desce
function alternarCarro() {
  if (!isKillerMode() || fase !== 3 || !motorista || (!buggyRoot.visible && !motoRoot?.visible) || bicada) return;
  const condutor = condutorAtivo();
  if (condutor?.dirigindo && desafio.bloqueiaSaida()) {
    mostrarBanner('Desafio em andamento', 'Não dá para sair do veículo agora · Enter volta ao checkpoint · Backspace desiste', 2200);
    return;
  }
  if (!condutor) {
    if (autoEntrada) {            // E de novo cancela a caminhada até o veículo
      if (autoEntrada.fase !== 'levantando') cancelarAutoEntrada();   // com a moto subindo, termina de levantar
      return;
    }
    const alvo = veiculoParaChamar();
    if (alvo) iniciarAutoEntrada(alvo);
  } else if (condutor.dirigindo) {
    condutor.sair();
  }
}

function entrarAgora(condutor) {
  autoEntrada = null;
  stopDance();
  isWalking = false;
  velocity.set(0, 0, 0);
  const m = activeCharData.model;
  _modeloOffset.copy(m.position);
  _modeloEscala = m.scale.x;
  condutor.entrar();
}

/* ── Caminhada automática até a porta ──
   O clip de entrar do veículo (ex.: Cegonha_BuggyStork_Entrar, Cegonha_Moto_Entrar) começa com a cegonha num ponto
   e numa direção exatos ao lado dele. Ela anda até lá (contornando o veículo), termina de virar e só então o clip
   começa: a troca acontece sem salto nenhum. */
const ENTRADA = {
  RAIO_CHAMADA: 12,   // distância (mundo) do veículo em que o E já manda ela ir até a porta
  RAIO_CAIDA: 40,     // moto caída: depois do tombo ela costuma pousar longe — o E a chama de mais longe
  CHEGOU: 0.06,       // distância (mundo) que conta como "chegou" no ponto do Entrar
  PONTO: 0.4,         // distância (mundo) para passar ao próximo ponto do contorno
  GIRO: 9,            // rapidez para terminar de virar até a direção do Entrar
  ESPERA: 0.2,        // s parada antes de entrar (a caminhada termina de virar "parado")
  TEMPO_MAX: 12,      // s: se travar em algo no caminho, desiste
  // contorno do veículo (em metros dele: frente = +Z, esquerda/porta = +X), calculado das caixas dele
  FOLGA: 0.45,        // distância da lataria ao passar em volta (≈ raio da cegonha + margem)
  FOLGA_PONTAS: 0.9,  // distância da frente/traseira ao virar a quina
  ANTES_DA_PORTA: 1.3,
};
// { veiculo, condutor, pontos: [Vector3 mundo], alvo, yaw, fase: 'andando' | 'virando' | 'levantando', espera, tempo,
//   levantar (moto caída: ao chegar ela levanta a moto e depois vai até o ponto de subida) }
let autoEntrada = null;
const _mEntrada = new THREE.Matrix4();
const _mAux = new THREE.Matrix4();
const _mRaiz = new THREE.Matrix4();
const _pEntrada = new THREE.Vector3();
const _qEntrada = new THREE.Quaternion();
const _sEntrada = new THREE.Vector3();
const _eEntrada = new THREE.Euler();
const _autoDir = new THREE.Vector3();
const _refMoto = new THREE.Object3D();   // referencial "em pé" do banco da moto (onde o Entrar dela começa)

function cegonhaNoChao() {
  return !isFlying && pivot.position.y - groundAt(pivot.position.x, pivot.position.z) < 0.1;
}

// Veículo parado e perto o bastante para o E chamar (o mais perto, se os dois estiverem)
function veiculoParaChamar() {
  if (!cegonhaNoChao()) return null;
  let melhor = null, dMelhor = Infinity;
  const candidatos = [[buggy, motorista, buggyRoot]];
  if (piloto) candidatos.push([moto, piloto, motoRoot]);
  for (const [v, condutor, root] of candidatos) {
    if (!v || !condutor || !root?.visible || Math.abs(v.velocidade) > 0.5) continue;
    if (v === moto && moto.caida && !moto.parada) continue;   // ainda escorregando
    v.no.getWorldPosition(_tmpCarro);
    const d = Math.hypot(pivot.position.x - _tmpCarro.x, pivot.position.z - _tmpCarro.z);
    const limite = v === moto && moto.caida ? ENTRADA.RAIO_CAIDA : ENTRADA.RAIO_CHAMADA;
    if (d < limite && d < dMelhor) { dMelhor = d; melhor = { veiculo: v, condutor }; }
  }
  return melhor;
}

// Matriz local da Raiz no 1º frame de um clip
function raizNoInicio(clip, alvo) {
  const p = clip.tracks.find(t => t.name === 'Raiz.position');
  const q = clip.tracks.find(t => t.name === 'Raiz.quaternion');
  return alvo.compose(
    _pEntrada.set(p.values[0], p.values[1], p.values[2]),
    _qEntrada.set(q.values[0], q.values[1], q.values[2], q.values[3]),
    _sEntrada.set(1, 1, 1));
}

// Onde o pivot precisa estar (e para que lado o modelo olha) para a Raiz do "parado"
// coincidir com a Raiz do 1º frame do Entrar:  M_modelo = Banco · Rig · R_entrar · R_parado⁻¹ · Rig⁻¹
// (na moto o "banco" é o referencial em pé dela, sem a inclinação do pezinho — é nele que o Entrar roda)
function calcularInicioEntrada(veiculo, armada) {
  const clips = activeCharData.rawClips;
  const pre = veiculo.prefixoCegonha ?? 'Cegonha_Carro_';   // ex.: Cegonha_BuggyStork_ / Cegonha_Moto_ (vem do glb do veículo)
  const entrar = THREE.AnimationClip.findByName(clips, armada ? pre + 'Entrar' : pre + 'Entrar_SemArma');
  const parado = THREE.AnimationClip.findByName(clips, armada ? 'Cegonha_AK_Segurar' : 'Cegonha_Parado');
  const m = activeCharData.model;
  const rig = m.getObjectByName('Raiz')?.parent;
  if (!entrar || !parado || !rig) return null;
  rig.updateMatrix();
  let banco;
  if (veiculo === moto) {
    banco = moto.referenciaReta(_refMoto);
  } else {
    banco = veiculo.assento;
    banco.updateWorldMatrix(true, false);
  }
  const esc = m.scale.x / banco.getWorldScale(_sEntrada).x;   // mesma escala que entrar() usa
  _mEntrada.copy(banco.matrixWorld)
    .multiply(_mAux.makeScale(esc, esc, esc))
    .multiply(rig.matrix)
    .multiply(raizNoInicio(entrar, _mRaiz));
  _mAux.copy(rig.matrix).multiply(raizNoInicio(parado, _mRaiz)).invert();
  _mEntrada.multiply(_mAux).decompose(_pEntrada, _qEntrada, _sEntrada);
  const alvo = _pEntrada.clone().sub(m.position);   // pivot = posição do modelo − offset de centralização
  alvo.y = groundAt(alvo.x, alvo.z);
  return { alvo, yaw: _eEntrada.setFromQuaternion(_qEntrada, 'YXZ').y };
}

// Moto caída: ela fica do lado para onde a moto tombou (onde estão o guidão e o banco, no chão),
// perto do guidão e de frente para a moto. Em metros da moto: esquerda = +X, frente = +Z.
function inicioLevantarMoto() {
  const lado = Math.sign(moto.inclinacao) || 1;                     // + = deitada para a esquerda
  const mV = matrizVeiculo(moto);
  const alvo = new THREE.Vector3(lado * LEVANTAR_MOTO.DISTANCIA, 0, LEVANTAR_MOTO.FRENTE).applyMatrix4(mV);
  alvo.y = groundAt(alvo.x, alvo.z);
  const f = moto.frente;                                            // olhando para a moto: −lado × esquerda
  const dir = new THREE.Vector3(-lado * f.z, 0, lado * f.x);
  return { alvo, yaw: Math.atan2(dir.x, dir.z), dir };
}

// Ela chegou ao lado da moto caída: agacha, segura o guidão e levanta a moto (anda junto com ela)
function comecarLevantarMoto(a) {
  if (!moto.caida || !moto.parada) { autoEntrada = null; return; }
  if (isAiming) setAiming(false);
  isWalking = false;
  velocity.set(0, 0, 0);
  const mixer = activeCharData.mixer;
  let clip = null;
  try {
    clip = clipLevantarMoto(activeCharData.rawClips, isArmed);
  } catch (err) {
    console.warn('[StorKiller] Sem a animação de levantar a moto:', err);
  }
  if (clip) {
    mixer.stopAllAction();
    a.acao = mixer.clipAction(clip);
    a.acao.setLoop(THREE.LoopOnce, 1);
    a.acao.clampWhenFinished = true;
    a.acao.reset().play();
  }
  a.fase = 'levantando';
  a.t = 0;
  a.dur = clip ? clip.duration : LEVANTAR_MOTO.MOTO_INICIO + LEVANTAR_MOTO.MOTO_DUR;
  a.motoSubindo = false;
  a.de = pivot.position.clone();
  const ini = inicioLevantarMoto();
  a.ate = a.de.clone().addScaledVector(ini.dir, LEVANTAR_MOTO.AVANCO * motoRoot.scale.x);
}

// Frame a frame do levantar; no fim ela vai sozinha até o ponto de subida
function passoLevantarMoto(a, delta) {
  a.t += delta;
  const L = LEVANTAR_MOTO;
  if (!a.motoSubindo && a.t >= L.MOTO_INICIO) {
    a.motoSubindo = true;
    moto.levantar();
    if (moto._levantar) moto._levantar.dur = L.MOTO_DUR;
  }
  // anda junto com a moto enquanto ela sobe (o guidão vem na direção dela)
  const u = THREE.MathUtils.smoothstep(a.t, L.MOTO_INICIO, L.MOTO_INICIO + L.MOTO_DUR);
  pivot.position.lerpVectors(a.de, a.ate, u);
  pivot.position.y = groundAt(pivot.position.x, pivot.position.z);
  velocity.set(0, 0, 0);
  if (a.t < a.dur || moto.caida) return;
  // moto em pé no pezinho: volta para a pose a pé e caminha até onde o "subir" começa
  autoEntrada = null;
  retomarAnimacaoAPe();
  iniciarAutoEntrada({ veiculo: moto, condutor: piloto });
}

// Ela desistiu no meio (tecla, voo...): devolve as animações a pé; a moto termina de subir sozinha
function cancelarAutoEntrada() {
  const a = autoEntrada;
  autoEntrada = null;
  if (a?.fase === 'levantando' && !isFlying && !cegonhaNoCarro()) retomarAnimacaoAPe();
}

// Caminho até a porta contornando o veículo; chega por trás da porta, já de frente para onde o Entrar começa
// Retângulo da carroceria (caixa principal do veículo, em metros dele)
function contornoVeiculo(veiculo) {
  const [x0, x1, , , z0, z1] = veiculo.caixas?.[0] ?? [-0.95, 0.95, 0, 0.95, -2.05, 2.25];
  const E = ENTRADA;
  return {
    meiaLargura: Math.max(-x0, x1),
    lado: Math.max(-x0, x1) + E.FOLGA + 0.3,     // por onde ela passa ao lado do veículo
    frente: z1 + E.FOLGA_PONTAS,
    tras: z0 - E.FOLGA_PONTAS,
  };
}

// Referencial do veículo sem inclinação (a moto no pezinho fica deitada 9°)
const _mVeiculo = new THREE.Matrix4();
function matrizVeiculo(veiculo) {
  if (veiculo === moto) {
    moto.referenciaReta(_refMoto);
    // a referência fica no banco: volta para o centro da moto (posição de moto.pos, mesma rotação)
    return _mVeiculo.compose(moto.posMundo(_pEntrada), _refMoto.quaternion, _refMoto.scale);
  }
  veiculo.no.updateWorldMatrix(true, false);
  return _mVeiculo.copy(veiculo.no.matrixWorld);
}

function pontosAteAPorta(veiculo, alvo, caida = false) {
  const E = ENTRADA;
  const C = contornoVeiculo(veiculo);
  const mV = matrizVeiculo(veiculo);
  _mAux.copy(mV).invert();
  const l = pivot.position.clone().applyMatrix4(_mAux);            // cegonha em metros do veículo
  const portaL = alvo.clone().applyMatrix4(_mAux);
  const locais = [];
  if (caida) {
    // moto deitada: o lado certo é onde ela tombou (portaL.x negativo = direita); contorna pela frente ou por trás
    const s = Math.sign(portaL.x) || 1;
    const larg = 1.25;                                   // deitada ela ocupa ~1,2 m para o lado em que caiu
    if (s * l.x < larg) {
      const z = l.z >= 0.1 ? C.frente : C.tras;
      if (s * l.x < -C.meiaLargura && l.z < C.frente - 0.3 && l.z > C.tras + 0.3) locais.push(new THREE.Vector3(-s * C.lado, 0, z));
      locais.push(new THREE.Vector3(s * (larg + 0.4), 0, z));
    }
  } else if (l.x < C.lado - 0.45) {
    // não está do lado da porta: vai pela frente ou por trás, o que estiver mais perto
    const z = l.z >= 0.1 ? C.frente : C.tras;
    if (l.x < -C.meiaLargura && l.z < C.frente - 0.3 && l.z > C.tras + 0.3) locais.push(new THREE.Vector3(-C.lado, 0, z));
    locais.push(new THREE.Vector3(C.lado, 0, z));
  }
  if (!caida) locais.push(new THREE.Vector3(Math.max(C.lado, portaL.x), 0, portaL.z - E.ANTES_DA_PORTA));
  const pontos = locais.map(p => {
    p.applyMatrix4(mV);
    p.y = groundAt(p.x, p.z);
    return p;
  });
  pontos.push(alvo);
  return pontos;
}

function iniciarAutoEntrada({ veiculo, condutor }) {
  const caida = veiculo === moto && moto.caida;
  const ini = caida ? inicioLevantarMoto() : calcularInicioEntrada(veiculo, isArmed);
  if (!ini) return;
  if (isAiming) setAiming(false);
  autoEntrada = {
    veiculo, condutor, levantar: caida,
    // moto caída: contorna a moto (como no subir) até o lado do guidão
    pontos: pontosAteAPorta(veiculo, ini.alvo, caida),
    alvo: ini.alvo, yaw: ini.yaw, fase: 'andando', espera: 0, tempo: 0,
  };
}

// Roda no bloco de movimento a pé. Devolve a direção/passo deste frame (_autoDir, com .passo) ou null.
function passoAutoEntrada(delta, speed) {
  const a = autoEntrada;
  if (!a) return null;
  const tecla = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] ||
    keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'];
  a.tempo += delta;
  if (tecla || isFlying || cegonhaNoCarro() || Math.abs(a.veiculo.velocidade) > 0.5 ||
      (a.fase !== 'levantando' && a.tempo > ENTRADA.TEMPO_MAX)) {
    cancelarAutoEntrada();     // o jogador assumiu o controle (ou algo travou o caminho)
    return null;
  }
  if (a.fase === 'levantando') {
    passoLevantarMoto(a, delta);
    return null;
  }

  if (a.fase === 'andando') {
    const alvo = a.pontos[0];
    const ultimo = a.pontos.length === 1;
    const dx = alvo.x - pivot.position.x, dz = alvo.z - pivot.position.z;
    const d = Math.hypot(dx, dz);
    if (d < (ultimo ? ENTRADA.CHEGOU : ENTRADA.PONTO)) {
      if (!ultimo) {
        a.pontos.shift();
        return passoAutoEntrada(0, speed);
      }
      a.fase = 'virando';
    } else {
      // no último trecho desacelera até parar exatamente no ponto
      _autoDir.set(dx / d, 0, dz / d);
      _autoDir.passo = ultimo ? Math.min(speed, Math.max(d * 0.2, 0.004)) : speed;
      return _autoDir;
    }
  }

  // Parada no ponto: termina de virar para a direção do Entrar e entra
  pivot.position.x = a.alvo.x;
  pivot.position.z = a.alvo.z;
  velocity.set(0, 0, 0);
  const m = pivot.children[0];
  if (!m) return null;
  m.rotation.y = lerpAngle(m.rotation.y, a.yaw, Math.min(1, delta * ENTRADA.GIRO));
  let dif = (a.yaw - m.rotation.y) % (Math.PI * 2);
  if (dif > Math.PI) dif -= Math.PI * 2;
  if (dif < -Math.PI) dif += Math.PI * 2;
  if (Math.abs(dif) < 0.02) {
    a.espera += delta;
    if (a.espera >= ENTRADA.ESPERA && !isWalking) {
      m.rotation.y = a.yaw;
      if (a.levantar) {
        comecarLevantarMoto(a);
        return null;
      }
      autoEntrada = null;
      entrarAgora(a.condutor);
    }
  }
  return null;
}

// Leva o pivot (centro da câmera) para outro ponto sem corte: a diferença some aos poucos
const camSuave = new THREE.Vector3();
function moverPivotSemCorte(novo) {
  camSuave.add(pivot.position).sub(novo);
  pivot.position.copy(novo);
}

// Quando a animação de sair (ou o pouso da queda) termina, a cegonha volta a ser filha do pivot (controle a pé)
const _qSaida = new THREE.Quaternion();
function devolverCegonhaAoPivot() {
  const m = activeCharData.model;
  moverPivotSemCorte(_tmpCarro.copy(m.position).sub(_modeloOffset));   // _terminouSair a deixou no mundo, na porta
  // ela termina virada para onde o veículo aponta (ou para onde ia, na queda da moto)
  const yaw = _eEntrada.setFromQuaternion(m.getWorldQuaternion(_qSaida), 'YXZ').y;
  fontePivot = 'pe';
  pivot.add(m);
  m.position.copy(_modeloOffset);
  m.rotation.set(0, yaw, 0);
  m.scale.setScalar(_modeloEscala);
  retomarAnimacaoAPe();
}

// Devolve o mixer para a máquina de estados a pé (Sair termina no AK_Segurar ou no Parado, sem a arma)
function retomarAnimacaoAPe() {
  activeCharData.mixer.stopAllAction();
  applyWeaponActions(false);
  activeCharData.idleAction?.reset().play();
  isWalking = false;
  wasAirborne = false;
  velocity.set(0, 0, 0);
}

// Sair do modo/fase no meio do veículo: tira a cegonha na hora, sem animação
function tirarDoCarroNaMarra() {
  const condutor = condutorAtivo();
  if (!condutor) return;
  const veiculo = veiculoDe(condutor);
  const m = activeCharData.model;
  pivot.add(m);
  m.position.copy(_modeloOffset);
  m.rotation.set(0, veiculo.rumo, 0);
  m.scale.setScalar(_modeloEscala);
  condutor.estado = 'fora';
  condutor._pendente = null;
  veiculo.ocupado = false;
  if (veiculo === moto) moto.apoio = 1;
  retomarAnimacaoAPe();
}

function esconderCarro() {
  autoEntrada = null;
  fontePivot = 'pe';
  tirarDoCarroNaMarra();
  for (const som of [somBuggy, somMoto]) {
    if (!som) continue;
    som.desligar();
    som.definirVolume(0);
  }
  if (buggyRoot) buggyRoot.visible = false;
  if (motoRoot) motoRoot.visible = false;
  atualizarDicaCarro('');
}

let fontePivot = 'pe';   // de onde vem o centro da câmera: 'pe' (cegonha a pé), 'corpo' (entrando/saindo), 'carro'
let _raizCegonha = null;
function raizCegonha() {
  return _raizCegonha ??= activeCharData.model.getObjectByName('Raiz') ?? activeCharData.model;
}

// Roda ANTES do mixer.update (ordem pedida pelo carro.js e pelo moto.js). Devolve true se a cegonha está num veículo.
function atualizarCarro(dt) {
  // no desafio só o veículo escolhido fica no mapa (o outro some até voltar)
  if (!isKillerMode() || fase !== 3 || !motorista || (!buggyRoot?.visible && !motoRoot?.visible)) return false;
  const W = (keys['KeyW'] || keys['ArrowUp']) ? 1 : 0;
  const S = (keys['KeyS'] || keys['ArrowDown']) ? 1 : 0;
  const volante = ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0) - ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0);
  // contagem do desafio / troca de mapa: freio de mão puxado
  const comandos = desafio.travado()
    ? { acelerar: 0, frear: 0, volante: 0, freioDeMao: true }
    : { acelerar: W, frear: S, volante, freioDeMao: !!keys['Space'] };

  const cBuggy = motorista.dirigindo ? comandos : null;
  if (buggyRoot.visible) {
    buggy.update(dt, cBuggy);
    somBuggy?.update(dt, cBuggy);   // lê rpm, marcha, piso/água das rodas e batidas do buggy
  }
  motorista.update(dt, { atirando: isShooting });

  const motoAtiva = !!(piloto && motoRoot?.visible);
  if (motoAtiva) {
    const cMoto = piloto.dirigindo ? comandos : null;
    moto.update(dt, cMoto);
    somMoto?.update(dt, cMoto);
    piloto.update(dt, { atirando: isShooting });
  }

  const condutor = condutorAtivo();
  if (condutor) {
    // Entrando/saindo/caindo: câmera acompanha o corpo dela; dirigindo: acompanha o veículo
    const fonte = condutor.dirigindo ? 'carro' : 'corpo';
    if (fonte === 'carro') {
      veiculoDe(condutor).no.getWorldPosition(_tmpCarro);
    } else {
      raizCegonha().getWorldPosition(_tmpCarro);
      _tmpCarro.y = groundAt(_tmpCarro.x, _tmpCarro.z);
    }
    if (fonte !== fontePivot) moverPivotSemCorte(_tmpCarro);
    else pivot.position.copy(_tmpCarro);
    fontePivot = fonte;
    spacePrev = !!keys['Space'];                 // Espaço é freio de mão: não pode virar "voar" ao sair
  }

  let dica = '';
  if (!condutor) {
    if (autoEntrada) {
      if (autoEntrada.fase === 'levantando') dica = 'Levantando a moto…';
      else if (autoEntrada.levantar) dica = 'Indo levantar a moto… (E cancela)';
      else dica = `Indo até ${nomeDe(autoEntrada.veiculo)}… (E cancela)`;
    } else {
      const alvo = veiculoParaChamar();
      if (alvo?.veiculo === moto) dica = moto.caida ? 'E — levantar a moto' : 'E — subir na moto';
      else if (alvo) dica = 'E — entrar no buggy';
    }
  } else if (condutor.estado === 'levantando') {
    dica = 'Levantando a moto…';
  } else if (condutor.dirigindo) {
    const veiculo = veiculoDe(condutor);
    const kmh = Math.round(Math.abs(veiculo.velocidadeKmh));
    const dicaDesafio = desafio.dica();
    if (dicaDesafio) {
      dica = `${kmh} km/h · ${dicaDesafio}`;
    } else if (veiculo === moto) {
      const sair = condutor.podeSair() ? 'E desce' : 'pare para descer';
      dica = `${kmh} km/h · ${moto.marcha}ª · W acelera · S freia/empurra para trás · A/D inclina · Espaço freio traseiro · ${sair}`;
    } else {
      const sair = condutor.podeSair() ? 'E sai' : 'pare para sair';
      dica = `${kmh} km/h · W acelera · S freia/ré · A/D volante · Espaço freio de mão · ${sair}`;
    }
  }
  if (!condutor && desafio.ativo && !autoEntrada) {
    dica = moto?.caida ? 'E — levantar a moto · Enter volta ao checkpoint' : (dica || 'Enter volta ao checkpoint · Backspace desiste');
  }
  atualizarDicaCarro(dica);
  return !!condutor;
}

function atualizarDicaCarro(texto) {
  if (texto === dicaCarroAtual) return;
  dicaCarroAtual = texto;
  const el = document.getElementById('car-hint');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('visible', !!texto);
}

function mostrarBanner(titulo, texto, duracaoMs) {
  const el = document.getElementById('phase-banner');
  if (!el) return;
  el.querySelector('.phase-banner-title').textContent = titulo;
  el.querySelector('.phase-banner-text').textContent = texto;
  el.classList.add('show');
  clearTimeout(bannerTimer);
  if (duracaoMs > 0) bannerTimer = setTimeout(() => el.classList.remove('show'), duracaoMs);
}

function esconderBanner() {
  clearTimeout(bannerTimer);
  document.getElementById('phase-banner')?.classList.remove('show');
}

const TPS = {
  DIST: 8.5,          // distância fixa da câmera até a cegonha
  HEIGHT: 2.0,        // altura do ponto observado acima dos pés
  SHOULDER: 0.9,      // deslocamento para a direita (mira por cima do ombro)
  PITCH_MIN: -0.3,
  PITCH_MAX: 1.15,
  SENS: 0.0025,       // sensibilidade do mouse
  MIN_CAM_Y: 0.4,     // altura mínima da câmera acima do chão
  FOV: 50,
};
// Mirando (botão direito): câmera colada no ombro, zoom e liberdade total para olhar
const AIM = {
  DIST: 3.6,
  HEIGHT: 2.3,
  SHOULDER: 1.15,
  PITCH_MIN: -1.35,   // quase vertical para cima (urubus no alto)
  PITCH_MAX: 1.3,
  SENS: 0.0016,       // mais fino para acertar o alvo
  FOV: 32,
  BLEND_SPEED: 10,    // rapidez da transição normal ↔ mirando
  TURN_SPEED: 25,     // rapidez com que a cegonha acompanha o mouse
};
const PLAYER_BODY_HEIGHT = 1.4;   // centro do corpo da cegonha acima dos pés
const AIM_DISTANCE = 80;

let camYaw = Math.PI;      // câmera começa atrás da cegonha (ela olha para +Z)
let isAiming = false;
let aimBlend = 0;          // 0 = câmera normal, 1 = mirando
let camPitch = 0.25;
let mouseShooting = false;
let killCount = 0;
let damageCount = 0;

const _tpsTarget = new THREE.Vector3();
const _tpsRight = new THREE.Vector3();
const _playerBody = new THREE.Vector3();

const blood = createBloodSystem(scene, { groundAt });
const vultures = createVultureManager({
  scene,
  blood,
  groundAt,
  // No pântano os urubus desviam de troncos e copas, e nunca nascem dentro de uma copa
  collide: (centro, raio, anterior) => {
    if (mapaAtual === 'pantano') pantano.resolverColisao(centro, raio, { anterior });
  },
  isFree: (centro, raio) => mapaAtual !== 'pantano' || pantano.penetracao(centro, raio) === 0,
  onPlayerHit: () => {
    damageCount++;
    updateKillerHud();
    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.remove('show');
      void flash.offsetWidth;   // reinicia a animação CSS
      flash.classList.add('show');
    }
  },
  onKill: () => {
    killCount++;
    faseKills++;
    if (faseConcluida) {
      // abates durante o aviso de fase concluída não mudam nada
    } else if (fase === 1 && faseKills >= FASE1_META) {
      concluirFase(1);
    } else if (fase === 2) {
      vultures.configure({ speed: velocidadeUrubusFase2() });
      if (faseKills >= FASE2_META) concluirFase(2);
    }
    updateKillerHud();
  },
});

/* ── Desafio da fase 3 (js/desafio.js): corrida pela trilha com o veículo em que a cegonha chegou ── */
function flashDano() {
  const flash = document.getElementById('damage-flash');
  if (!flash) return;
  flash.classList.remove('show');
  void flash.offsetWidth;   // reinicia a animação CSS
  flash.classList.add('show');
}

// Põe o veículo parado em posM (metros do mapa) virado para rumo; a cegonha dentro vai junto
function posicionarVeiculoDesafio(v, posM, rumo) {
  v.posicionar(posM, rumo);
  const root = rootDe(v);
  root?.updateMatrixWorld(true);
  v.no.updateMatrixWorld(true);
  if (condutorAtivo() && veiculoDe(condutorAtivo()) === v) {
    v.no.getWorldPosition(_tmpCarro);
    pivot.position.copy(_tmpCarro);
    camSuave.set(0, 0, 0);
  }
}

// Caiu da moto no desafio e pediu o checkpoint (ou acabou a corrida a pé): moto em pé no lugar e a cegonha já montada
function recolocarNaMoto(posM, rumo) {
  if (!moto || !piloto) return;
  autoEntrada = null;
  if (condutorAtivo()) tirarDoCarroNaMarra();
  if (isFlying) exitFly();
  moto.posicionar(posM, rumo);
  motoRoot.visible = true;
  motoRoot.updateMatrixWorld(true);
  moto.no.updateMatrixWorld(true);
  stopDance();
  isWalking = false;
  velocity.set(0, 0, 0);
  const m = activeCharData.model;
  _modeloOffset.copy(m.position);
  _modeloEscala = m.scale.x;
  piloto.armada = isArmed;
  piloto._arma = isArmed ? 1 : 0;
  moto.ocupado = true;
  moto.inclinacao = 0;
  piloto._comecarDirigir();
  moto.no.getWorldPosition(_tmpCarro);
  pivot.position.copy(_tmpCarro);
  camSuave.set(0, 0, 0);
  fontePivot = 'carro';
}

const desafio = criarDesafio({
  scene,
  camera,
  escala: () => escalaEstrada,
  mapa: (qual) => (qual === 'desafio' ? mapaDesafio : mapaFase3),
  usarMapa: (qual) => usarMapaEstrada(qual),
  condutor: () => {
    const c = condutorAtivo();
    if (!c) return null;
    const v = veiculoDe(c);
    return { veiculo: v, tipo: v === moto ? 'moto' : 'buggy', dirigindo: c.dirigindo, estado: c.estado };
  },
  veiculo: (tipo) => (tipo === 'moto' ? moto : tipo === 'buggy' ? buggy : null),
  mostrarSo: (tipo) => {
    if (buggyRoot) buggyRoot.visible = tipo !== 'moto';
    if (motoRoot) motoRoot.visible = !!piloto && tipo !== 'buggy';
    volumeVeiculos(!jogoPausado);
  },
  posicionar: posicionarVeiculoDesafio,
  recolocarNaMoto,
  olharPara: (rumo) => { camYaw = rumo + Math.PI; },
  banner: (titulo, texto, ms) => mostrarBanner(titulo, texto, ms),
  dano: () => { damageCount++; updateKillerHud(); flashDano(); },
  sangue: (ponto, dir) => blood.burst(ponto, dir, 16),
  fonteUrubu: () => {
    const u = characterData.urubu;
    return u?.isLoaded && u.model ? { model: u.model, clips: u.rawClips } : null;
  },
});

function isKillerMode() {
  return gameMode === 'killer' && isGameActive;
}

let killerInitialPhase = 1;

function startKillerGame(faseInicial = 1) {
  gameMode = 'killer';
  killerInitialPhase = faseInicial;
  const stork = CHARACTERS.find(c => c.id === 'stork');
  if (stork) selectCharacter(stork);
}

function enterKillerMode(faseInicial = killerInitialPhase) {
  controls.enabled = false;
  camYaw = Math.PI;
  camPitch = 0.25;
  killCount = 0;
  damageCount = 0;
  mouseShooting = false;
  vultures.clear();
  blood.clear();
  setArmed(true);
  if (faseInicial === 3) {
    iniciarFase3();
  } else if (faseInicial === 2) {
    iniciarFase2();
  } else {
    iniciarFase1();
  }
  updateKillerHud();
  document.body.classList.add('killer-mode');
  const subtitle = document.getElementById('char-active-subtitle');
  if (subtitle) {
    subtitle.innerHTML = faseInicial === 3 ? 'Fase 3 &middot; Buggy e moto'
      : faseInicial === 2 ? 'Cegonha Killer &middot; Fase 2 &middot; Pântano'
      : 'Cegonha Killer &middot; Abata os urubus';
  }
}

/* ── Pausa (dentro das fases) ──
   O tempo do jogo para (delta = 0): urubus, balas, sangue, animações, física do carro,
   relâmpagos e a troca de fase congelam. Controles são ignorados, o mouse é solto e os
   sons do carro e da chuva param até continuar. Botão no canto ou tecla P. */
let jogoPausado = false;

function definirPausa(pausar) {
  if (pausar && !isKillerMode()) return;
  if (jogoPausado === pausar) return;
  jogoPausado = pausar;
  document.body.classList.toggle('pausado', pausar);
  const btn = document.getElementById('pause-btn');
  if (btn) {
    btn.classList.toggle('pausado', pausar);
    btn.title = pausar ? 'Continuar (P)' : 'Pausar (P)';
    const rotulo = btn.querySelector('.pause-rotulo');
    if (rotulo) rotulo.textContent = pausar ? 'Continuar' : 'Pausar';
  }
  if (pausar) {
    soltarTodosGatilhos();
    mouseShooting = false;
    setAiming(false);
    for (const k in keys) keys[k] = false;     // nada fica "segurado" ao voltar
    if (document.pointerLockElement) document.exitPointerLock();
    volumeVeiculos(false);
    somChuva.parar();
  } else {
    if (fase === 3) volumeVeiculos(true);
    if (mapaAtual === 'pantano') somChuva.tocar();
  }
}

function exitKillerMode() {
  definirPausa(false);
  encerrarDesafio();
  esconderCarro();
  setMapa('grade');
  esconderBanner();
  faseConcluida = false;
  setAiming(false);
  aimBlend = 0;
  camera.fov = TPS.FOV;
  camera.updateProjectionMatrix();
  if (document.pointerLockElement) document.exitPointerLock();
  controls.enabled = true;
  mouseShooting = false;
  vultures.clear();
  blood.clear();
  document.body.classList.remove('killer-mode');
  gameMode = 'viewer';
}

function updateKillerHud() {
  const kills = document.getElementById('kill-count');
  if (kills) kills.textContent = killCount;
  const faseEl = document.getElementById('phase-count');
  if (faseEl) {
    faseEl.textContent = fase === 1 ? `1 · ${Math.min(faseKills, FASE1_META)}/${FASE1_META}`
      : fase === 2 ? `2 · ${Math.min(faseKills, FASE2_META)}/${FASE2_META}`
      : desafio?.ativo ? '3 · Desafio' : '3 · Veículos';
  }
  const vel = document.getElementById('vulture-speed');
  if (vel) vel.textContent = `×${velocidadeUrubusFase2().toFixed(2)}`;
  document.getElementById('vulture-speed-stat')?.classList.toggle('visible', fase === 2);
  const dmg = document.getElementById('damage-count');
  if (dmg) dmg.textContent = damageCount;
}

function setAiming(aiming) {
  if (aiming && !(isKillerMode() && isArmed)) aiming = false;
  isAiming = aiming;
  document.body.classList.toggle('aiming', aiming);
}

function updateThirdPersonCamera(delta) {
  aimBlend += ((isAiming ? 1 : 0) - aimBlend) * Math.min(1, delta * AIM.BLEND_SPEED);
  const lerp = (a, b) => a + (b - a) * aimBlend;

  // Ao sair da mira, o pitch volta suavemente para a faixa da câmera normal
  if (!isAiming) {
    const clamped = THREE.MathUtils.clamp(camPitch, TPS.PITCH_MIN, TPS.PITCH_MAX);
    camPitch += (clamped - camPitch) * Math.min(1, delta * 6);
  }

  const condutor = condutorAtivo();
  const veiculo = condutor ? veiculoDe(condutor) : null;
  // Entrando/saindo a câmera fica onde está; só dirigindo ela se afasta um pouco
  carCamBlend += ((condutor?.dirigindo ? 1 : 0) - carCamBlend) * Math.min(1, delta * 2);
  camSuave.multiplyScalar(Math.exp(-delta * 4));
  if (condutor?.dirigindo && !isAiming && Math.abs(veiculo.velocidade) > 2 && performance.now() - ultimoMovMouse > CARRO.CAM_SEGUE) {
    camYaw = lerpAngle(camYaw, veiculo.rumo + Math.PI, Math.min(1, delta * 2));
  }

  if (veiculo) camExtraVeiculo = veiculo === moto ? MOTO.CAM_EXTRA : CARRO.CAM_EXTRA;   // vale até a câmera voltar
  const dist = lerp(TPS.DIST, AIM.DIST) + carCamBlend * camExtraVeiculo;
  _tpsTarget.set(
    pivot.position.x + camSuave.x,
    pivot.position.y + camSuave.y + lerp(TPS.HEIGHT, AIM.HEIGHT),
    pivot.position.z + camSuave.z,
  );
  _tpsRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).multiplyScalar(lerp(TPS.SHOULDER, AIM.SHOULDER));
  _tpsTarget.add(_tpsRight);

  const cp = Math.cos(camPitch);
  camera.position.set(
    _tpsTarget.x + Math.sin(camYaw) * cp * dist,
    _tpsTarget.y + Math.sin(camPitch) * dist,
    _tpsTarget.z + Math.cos(camYaw) * cp * dist,
  );
  const minY = groundAt(camera.position.x, camera.position.z) + TPS.MIN_CAM_Y;
  camera.position.y = Math.max(minY, camera.position.y);
  camera.lookAt(_tpsTarget);

  const fov = lerp(TPS.FOV, AIM.FOV);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/* ── Mouse: clique trava o cursor; mover gira a câmera; botão esquerdo atira ── */
renderer.domElement.addEventListener('mousedown', e => {
  if (!isKillerMode() || jogoPausado) return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }
  if (e.button === 0) {
    mouseShooting = true;
    apertarGatilho('mouse');
  } else if (e.button === 2) {
    setAiming(true);
  }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0 && mouseShooting) {
    mouseShooting = false;
    soltarGatilho('mouse');
  } else if (e.button === 2) {
    setAiming(false);
  }
});
// Botão direito é a mira: sem menu de contexto no jogo
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => {
  if (!isKillerMode() || document.pointerLockElement !== renderer.domElement) return;
  const sens = isAiming ? AIM.SENS : TPS.SENS;
  ultimoMovMouse = performance.now();
  camYaw -= e.movementX * sens;
  // Mirando: olha livremente para cima/baixo; fora da mira o retorno à faixa normal é suave
  const pitchMin = isAiming ? AIM.PITCH_MIN : Math.min(TPS.PITCH_MIN, camPitch);
  const pitchMax = isAiming ? AIM.PITCH_MAX : Math.max(TPS.PITCH_MAX, camPitch);
  camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * sens, pitchMin, pitchMax);
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('pointer-locked', locked);
  if (!locked && mouseShooting) {
    mouseShooting = false;
    soltarGatilho('mouse');
  }
  if (!locked) setAiming(false);
});

document.getElementById('play-killer-btn')?.addEventListener('click', () => startKillerGame(1));

/* ── Sentar / Levantar (no chão) ── */
function toggleSit() {
  if (!isGameActive || isFlying || wasAirborne || isWalking || isPecking || isAttacking || isTransitioningSit) return;
  if (isArmed) return;
  if (!activeCharData?.sitAction && !activeCharData?.sittingAction) return;

  const sitBadge = document.getElementById('sit-badge');

  if (!isSitting) {
    // Parado -> Sentar -> Sentada
    isSitting = true;
    isTransitioningSit = true;

    if (sitBadge) {
      sitBadge.classList.add('active');
      const label = sitBadge.querySelector('.badge-label');
      if (label) label.textContent = 'Levantar';
    }

    if (activeCharData.idleAction) activeCharData.idleAction.fadeOut(0.2);

    if (activeCharData.sitAction) {
      activeCharData.sitAction.reset().fadeIn(0.15).play();
      const dur = activeCharData.sitAction.getClip().duration;
      setTimeout(() => {
        isTransitioningSit = false;
        if (isSitting && activeCharData.sittingAction) {
          activeCharData.sittingAction.reset().fadeIn(0.25).play();
          if (activeCharData.sitAction) activeCharData.sitAction.fadeOut(0.25);
        }
      }, Math.max(300, (dur - 0.2) * 1000));
    } else if (activeCharData.sittingAction) {
      isTransitioningSit = false;
      activeCharData.sittingAction.reset().fadeIn(0.25).play();
    }
  } else {
    // Sentada -> Levantar -> Parado
    standUp();
  }
}

function standUp(onComplete) {
  if (!isSitting || isTransitioningSit) {
    if (onComplete) onComplete();
    return;
  }

  isSitting = false;
  isTransitioningSit = true;

  const sitBadge = document.getElementById('sit-badge');
  if (sitBadge) {
    sitBadge.classList.remove('active');
    const label = sitBadge.querySelector('.badge-label');
    if (label) label.textContent = 'Sentar';
  }

  if (activeCharData?.sittingAction) activeCharData.sittingAction.fadeOut(0.2);
  if (activeCharData?.sitAction) activeCharData.sitAction.fadeOut(0.15);

  if (activeCharData?.standAction) {
    activeCharData.standAction.reset().fadeIn(0.15).play();
    const dur = activeCharData.standAction.getClip().duration;
    setTimeout(() => {
      isTransitioningSit = false;
      if (activeCharData?.standAction) activeCharData.standAction.fadeOut(0.2);
      if (!isFlying && !isWalking && activeCharData?.idleAction && !isPecking && !isAttacking) {
        activeCharData.idleAction.reset().fadeIn(0.25).play();
      }
      if (onComplete) onComplete();
    }, Math.max(300, (dur - 0.2) * 1000));
  } else {
    isTransitioningSit = false;
    if (!isFlying && !isWalking && activeCharData?.idleAction && !isPecking && !isAttacking) {
      activeCharData.idleAction.reset().fadeIn(0.25).play();
    }
    if (onComplete) onComplete();
  }
}

/* ── Bicada (no ar ou no chão) ── */
function performPeck() {
  if (!isGameActive || isPecking || isAttacking) return;
  if (ehCegonha()) {
    iniciarBicadaCegonha();
    return;
  }

  const inAir = isFlying || wasAirborne || (pivot.position.y > 0.08);
  const peckAction = inAir ? activeCharData?.peckAirAction : activeCharData?.peckGroundAction;
  if (!peckAction) return;

  isPecking = true;
  const badge = document.getElementById('peck-badge');
  if (badge) badge.classList.add('active');

  // Fade out suave da ação concorrente
  if (!inAir) {
    if (activeCharData?.walkAction) activeCharData.walkAction.fadeOut(0.12);
    if (activeCharData?.idleAction) activeCharData.idleAction.fadeOut(0.12);
  } else {
    if (activeCharData?.flyAction) activeCharData.flyAction.fadeOut(0.12);
  }

  peckAction.reset().fadeIn(0.08).play();

  const clipDuration = peckAction.getClip().duration;
  setTimeout(() => {
    isPecking = false;
    if (badge) badge.classList.remove('active');
    peckAction.fadeOut(0.2);

    // Retoma a animação apropriada de acordo com o estado do personagem
    if (isFlying || wasAirborne || pivot.position.y > 0.08) {
      if (activeCharData?.flyAction && !activeCharData.flyAction.isRunning() && !isAttacking) {
        activeCharData.flyAction.reset().fadeIn(0.2).play();
      }
    } else {
      if (isWalking && activeCharData?.walkAction) {
        activeCharData.walkAction.reset().fadeIn(0.15).play();
      } else if (activeCharData?.idleAction && !activeCharData.idleAction.isRunning()) {
        activeCharData.idleAction.reset().fadeIn(0.25).play();
      }
    }
  }, Math.max(300, (clipDuration - 0.15) * 1000));
}

/* ── Bicada da cegonha (só sem a arma) ──
   No chão: vira para a mira (ou para o urubu mais perto dela) e bica para a frente, sem sair do lugar.
   No voo: bate as asas, dispara para a frente atrás do urubu (sobe/desce junto) e termina com a bicada reta.
   O bico acerta quem estiver no caminho dele durante o golpe (BICADA.*.GOLPE, tempos do clip). */
const BICADA_JOGO = {
  MIRA_CHAO: 5,               // (mundo) no chão ela vira para um urubu até essa distância...
  CONE_CHAO: Math.cos(THREE.MathUtils.degToRad(55)),   // ...e até esse ângulo da mira
  MIRA_AR: 16,                // no voo a investida persegue um urubu até essa distância
  CONE_AR: Math.cos(THREE.MathUtils.degToRad(40)),
  FOLGA: 0.35,                // folga em volta do bico, somada à esfera do urubu
  ENGATE: 1.2,                // na investida: a essa distância a mais do bico ela já recolhe o pescoço e bica
  DANO_CHAO: 1,               // como um tiro: 1ª bicada dá o tranco, a 2ª mata
  DANO_AR: 2,                 // a investida no voo mata de uma vez
  VEL_AR: 0.2,                // velocidade da investida (por quadro; o voo normal é FLY_SPEED)
  ARRANQUE: 0.3,              // quão rápido ela chega nessa velocidade (fração por quadro)
  FREIO_ACERTO: 0.35,         // ao acertar no voo, a velocidade cai para essa fração (o tranco do golpe)
  GIRO: 12,                   // rapidez para virar para a mira / para o urubu
  GIRO_AR: 3.5,               // durante a investida ela corrige a rota atrás do urubu mais devagar
  ALTURA_MAX: 3,              // quanto a investida sobe ou desce atrás do urubu (mundo)
  INCLINACAO_MAX: 0.3,        // inclinação máxima do corpo na investida (rad; a pose já vem deitada)
};
let bicada = null;            // { tipo: 'chao' | 'ar', acao, t, dur, alvo, acertou, yaw }
let alturaInvestida = 0;      // ajuste da altura de voo durante a investida (volta a 0 depois)
const _bicBase = new THREE.Vector3();
const _bicPonta = new THREE.Vector3();
const _bicDir = new THREE.Vector3();
const _bicQ = new THREE.Quaternion();
let _bicOssos = null;

function ehCegonha() {
  return activeCharData?.def?.id === 'stork';
}

function cegonhaNoAr() {
  return isFlying || pivot.position.y - groundAt(pivot.position.x, pivot.position.z) > 0.3;
}

function zerarBicada() {
  bicada = null;
  alturaInvestida = 0;
  document.getElementById('peck-badge')?.classList.remove('active');
}

// Segmento do pescoço até a ponta do bico, no mundo (em _bicBase e _bicPonta)
function segmentoBico() {
  const m = activeCharData.model;
  if (_bicOssos?.modelo !== m) _bicOssos = { modelo: m, pescoco: m.getObjectByName('Pescoco_2'), cabeca: m.getObjectByName('Cabeca') };
  const { pescoco, cabeca } = _bicOssos;
  if (!pescoco || !cabeca) return false;
  pescoco.getWorldPosition(_bicBase);
  cabeca.getWorldPosition(_bicPonta);
  const esc = cabeca.getWorldScale(_bicDir).x;
  _bicDir.set(0, 1, 0).applyQuaternion(cabeca.getWorldQuaternion(_bicQ));
  _bicPonta.addScaledVector(_bicDir, BICADA.BICO * esc);
  return true;
}

function iniciarBicadaCegonha() {
  if (isArmed || bicada || jogoPausado) return;            // com a AK na mão ela atira
  if (cegonhaNoCarro() || autoEntrada || isSitting || isTransitioningSit) return;
  const noAr = cegonhaNoAr();
  const acao = noAr ? activeCharData.peckAirAction : activeCharData.peckGroundAction;
  const m = pivot.children[0];
  if (!acao || !m) return;
  stopDance();
  // Para onde: no jogo, para a mira (onde a câmera olha); no visualizador, para onde ela já está virada.
  // Se tiver um urubu perto dessa direção, ela vai nele.
  const yaw = isKillerMode() ? camYaw + Math.PI : m.rotation.y;
  _bicDir.set(Math.sin(yaw), 0, Math.cos(yaw));
  _playerBody.copy(pivot.position).y += PLAYER_BODY_HEIGHT;
  const alvo = isKillerMode()
    ? vultures.alvoNaFrente(_playerBody, _bicDir, noAr ? BICADA_JOGO.MIRA_AR : BICADA_JOGO.MIRA_CHAO,
      noAr ? BICADA_JOGO.CONE_AR : BICADA_JOGO.CONE_CHAO)
    : null;
  bicada = { tipo: noAr ? 'ar' : 'chao', acao, t: 0, dur: acao.getClip().duration, alvo, acertou: false, yaw };
  isPecking = true;
  document.getElementById('peck-badge')?.classList.add('active');
  // a bicada toma o lugar da animação atual (parado/caminhada no chão, voo no ar)
  for (const a of [activeCharData.idleAction, activeCharData.walkAction, activeCharData.flyAction,
    activeCharData.takeoffAction, activeCharData.landingAction]) a?.fadeOut(0.1);
  acao.reset().fadeIn(0.08).play();
  tocarSomBicada(noAr ? 'investida' : 'golpe');
}

// Roda a cada quadro (antes do movimento): vira, ajusta a altura da investida, testa o acerto e termina
function atualizarBicada(delta) {
  const b = bicada;
  if (!b) {
    alturaInvestida *= Math.exp(-delta * 2.5);
    return;
  }
  b.t += delta;
  const m = pivot.children[0];
  if (b.alvo && !b.acertou && vultures.vivo(b.alvo)) {
    b.yaw = Math.atan2(b.alvo.bodyPos.x - pivot.position.x, b.alvo.bodyPos.z - pivot.position.z);
  } else {
    b.alvo = null;
  }
  const giro = b.tipo === 'ar' && b.t > BICADA.AR.IMPULSO[0] ? BICADA_JOGO.GIRO_AR : BICADA_JOGO.GIRO;
  if (m) m.rotation.y = lerpAngle(m.rotation.y, b.yaw, Math.min(1, delta * giro));

  // Investida: a altura do voo acompanha o corpo do urubu
  if (b.tipo === 'ar') {
    let alvoAlt = 0;
    if (b.alvo && isFlying) {
      const base = groundAt(pivot.position.x, pivot.position.z) + flyProgress * FLY_TARGET_Y;
      alvoAlt = THREE.MathUtils.clamp(b.alvo.bodyPos.y - PLAYER_BODY_HEIGHT - base, -BICADA_JOGO.ALTURA_MAX, BICADA_JOGO.ALTURA_MAX);
    }
    alturaInvestida += (alvoAlt - alturaInvestida) * Math.min(1, delta * 4);
  } else {
    alturaInvestida *= Math.exp(-delta * 2.5);
  }

  // Investida: o urubu chegou ao alcance no meio da "flecha" -> pula para a bicada final (o golpe sai na hora certa)
  if (b.tipo === 'ar' && !b.acertou && b.t < BICADA.AR.ENGATE && isKillerMode() && segmentoBico() &&
      vultures.hitMelee(_bicBase, _bicPonta, BICADA_JOGO.FOLGA + BICADA_JOGO.ENGATE)) {
    b.t = BICADA.AR.ENGATE;
    b.acao.time = BICADA.AR.ENGATE;
  }

  // O bico acertou alguém?
  const t = Math.min(b.t, b.dur);
  const [g0, g1] = b.tipo === 'ar' ? BICADA.AR.GOLPE : BICADA.CHAO.GOLPE;
  if (!b.acertou && isKillerMode() && t >= g0 && t <= g1 && segmentoBico()) {
    const hit = vultures.hitMelee(_bicBase, _bicPonta, BICADA_JOGO.FOLGA);
    if (hit) {
      b.acertou = true;
      _bicDir.subVectors(_bicPonta, _bicBase).normalize();
      vultures.damage(hit.vulture, hit.point, _bicDir, b.tipo === 'ar' ? BICADA_JOGO.DANO_AR : BICADA_JOGO.DANO_CHAO);
      if (b.tipo === 'ar') velocity.multiplyScalar(BICADA_JOGO.FREIO_ACERTO);
      tocarSomBicada('acerto');
    }
  }
  if (b.t >= b.dur - 0.1) terminarBicada();
}

// Fim da bicada: volta para o voo, a caminhada ou o parado (o fim dos clips é a pose deles)
function terminarBicada() {
  const b = bicada;
  bicada = null;
  isPecking = false;
  document.getElementById('peck-badge')?.classList.remove('active');
  if (!b) return;
  b.acao.fadeOut(0.15);
  if (cegonhaNoAr()) {
    activeCharData.flyAction?.reset().fadeIn(0.15).play();
  } else if (isWalking && activeCharData.walkAction) {
    activeCharData.walkAction.reset().fadeIn(0.15).play();
  } else {
    activeCharData.idleAction?.reset().fadeIn(0.2).play();
  }
}

// Durante a investida no voo (até acertar), a velocidade é a dela, na direção para onde está virada
function investindo() {
  const b = bicada;
  if (!b || b.tipo !== 'ar' || b.acertou) return false;
  const t = b.t;
  return t >= BICADA.AR.IMPULSO[0] && t <= BICADA.AR.IMPULSO[1];
}

/* ── Sons da bicada (gerados na hora: ar cortado na investida, estalo do bico, pancada no urubu) ── */
const SOM_BICADA = { VOLUME: 0.35 };
let _ruidoBicada = null;
function tocarSomBicada(tipo) {
  const ctx = somTiroCtx;
  if (ctx.state !== 'running') ctx.resume();
  if (!_ruidoBicada) {
    _ruidoBicada = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    const d = _ruidoBicada.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime;
  const v = SOM_BICADA.VOLUME;
  const ruido = (dur, freqA, freqB, q, pico, ataque) => {
    const src = ctx.createBufferSource();
    src.buffer = _ruidoBicada;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(freqA, t0);
    filtro.frequency.exponentialRampToValueAtTime(freqB, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(pico, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filtro).connect(g).connect(ctx.destination);
    src.start(t0, Math.random() * 0.3, dur + 0.05);
  };
  if (tipo === 'investida') {
    ruido(0.75, 350, 1600, 0.8, 0.55 * v, 0.3);              // ar passando: sobe junto com a velocidade
  } else if (tipo === 'golpe') {
    ruido(0.22, 900, 2600, 1.2, 0.35 * v, 0.06);             // o pescoço cortando o ar
  } else {
    ruido(0.09, 2400, 1200, 2.5, 1.2 * v, 0.004);            // estalo do bico
    const osc = ctx.createOscillator();                      // pancada no corpo do urubu
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t0);
    osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(1.4 * v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  }
}

/* ── Ataque Aéreo / Bote em Voo (Urubu_Ataque) ── */
function performAttack() {
  if (!isGameActive || isAttacking || isPecking) return;

  // Se não possuir ataque dedicado mas possuir bicada, executa bicada
  if (!activeCharData?.attackAction) {
    performPeck();
    return;
  }

  const inAir = isFlying || wasAirborne || (pivot.position.y > 0.08);
  if (!inAir) {
    // No chão, executa bicada no solo
    performPeck();
    return;
  }

  isAttacking = true;
  const badge = document.getElementById('attack-badge');
  if (badge) badge.classList.add('active');

  // Urubu_Ataque começa exatamente na pose de Urubu_Voo:
  if (activeCharData.flyAction) {
    activeCharData.flyAction.crossFadeTo(activeCharData.attackAction, 0.15, true);
  }
  activeCharData.attackAction.reset().fadeIn(0.12).play();

  // Impulso dinâmico de velocidade no código durante o bote (entre 0.25s e 1.05s)
  const attackDuration = activeCharData.attackAction.getClip().duration;
  const startTime = performance.now();

  const boostInterval = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed >= 0.25 && elapsed <= 1.05) {
      camera.getWorldDirection(camFwd);
      targetVel.addScaledVector(camFwd, MOVE_SPEED * 1.6);
    }
  }, 16);

  setTimeout(() => {
    clearInterval(boostInterval);
    isAttacking = false;
    if (badge) badge.classList.remove('active');

    // Termina exatamente na pose de Urubu_Voo: volta ao voo normal sem salto
    if (activeCharData.flyAction) {
      activeCharData.attackAction.crossFadeTo(activeCharData.flyAction, 0.2, true);
      activeCharData.flyAction.reset().fadeIn(0.2).play();
    }
    activeCharData.attackAction.fadeOut(0.25);
  }, Math.max(400, (attackDuration - 0.15) * 1000));
}

/* ── Dance animation (toggle on C ou clique HUD) ── */
function toggleDance() {
  if (!activeCharData?.danceAction) return;
  isDancing = !isDancing;
  const badge = document.getElementById('dance-badge');

  if (isDancing) {
    if (activeCharData.walkAction) activeCharData.walkAction.fadeOut(0.2);
    isWalking = false;

    activeCharData.danceAction.reset().fadeIn(0.25).play();
    if (badge) badge.classList.add('active');
  } else {
    stopDance();
  }
}

function stopDance() {
  if (!isDancing && !activeCharData?.danceAction?.isRunning()) return;
  isDancing = false;
  if (activeCharData?.danceAction) activeCharData.danceAction.fadeOut(0.25);
  const badge = document.getElementById('dance-badge');
  if (badge) badge.classList.remove('active');

  // Se ainda estiver voando ou no ar, retoma o rigging de voo
  if ((isFlying || wasAirborne) && activeCharData?.flyAction && !activeCharData.flyAction.isRunning() && !isPecking && !isAttacking) {
    activeCharData.flyAction.reset().fadeIn(0.2).play();
  }
}

/* ── Landing trigger: executa pouso suave ao tocar com os pés no chão ── */
function triggerLanding() {
  if (activeCharData?.flyAction) {
    activeCharData.flyAction.fadeOut(0.3);
  }

  // Se possuir animação de pouso (como Urubu_Pouso):
  if (activeCharData?.landingAction) {
    activeCharData.landingAction.reset().fadeIn(0.12).play();
    const duration = activeCharData.landingAction.getClip().duration;
    setTimeout(() => {
      if (!isFlying && !wasAirborne) {
        if (activeCharData?.landingAction) activeCharData.landingAction.fadeOut(0.25);
        if (activeCharData?.idleAction && !isWalking && !isPecking && !isSitting) {
          activeCharData.idleAction.reset().fadeIn(0.25).play();
        }
      }
    }, Math.max(300, (duration - 0.2) * 1000));
  } else if (activeCharData?.caindoAction) {
    activeCharData.caindoAction.reset().fadeIn(0.12).play();
  } else if (activeCharData?.idleAction && !isWalking && !isPecking && !isSitting) {
    activeCharData.idleAction.reset().fadeIn(0.25).play();
  }
}

window.addEventListener('keydown', e => {
  if (!isGameActive) {
    if (e.code === 'Enter') startKillerGame();
    return;
  }
  if (e.code === 'KeyP' && !e.repeat && isKillerMode()) {
    definirPausa(!jogoPausado);
    return;
  }
  if (jogoPausado) return;
  // Desafio da fase 3: Enter = último checkpoint, Backspace = desiste
  if (!e.repeat && isKillerMode() && fase === 3 && desafio.tecla(e.code)) {
    e.preventDefault();
    return;
  }
  keys[e.code] = true;

  // Trigger Sentar/Levantar on 'x' or 'X'
  if (e.code === 'KeyX' || e.key === 'x' || e.key === 'X') {
    toggleSit();
  }

  // Trigger Ataque Aéreo on 'q' or 'Q'
  if (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') {
    performAttack();
  }

  // Bicada: B sempre; E e F só no visualizador (no jogo o E é dos veículos e F/R/clique esquerdo atacam:
  // com a AK atiram, sem ela bicam — ver apertarGatilho)
  if (!e.repeat && (e.code === 'KeyB' || (gameMode !== 'killer' && (e.code === 'KeyE' || e.code === 'KeyF')))) {
    performPeck();
  }

  // Trigger Dança on 'c' or 'C'
  if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') {
    toggleDance();
  }

  // Pegar / Soltar arma on 'g' or 'G'
  if (e.code === 'KeyG' && !e.repeat) {
    toggleArmed();
  }

  // R (no modo Killer, F também — como no carro): toque = 1 tiro, segurando = rajada
  if ((e.code === 'KeyR' || (e.code === 'KeyF' && gameMode === 'killer')) && !e.repeat) {
    apertarGatilho(e.code);
  }

  // Fase 3: E entra no buggy / sobe na moto (o mais perto) ou sai/desce (parado)
  if (e.code === 'KeyE' && !e.repeat) {
    alternarCarro();
  }

  // Prevent page scroll on arrows/space
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => {
  if (!isGameActive) return;
  keys[e.code] = false;
  if (e.code === 'KeyR' || e.code === 'KeyF') soltarGatilho(e.code);
});
window.addEventListener('blur', soltarTodosGatilhos);

document.getElementById('sit-badge')?.addEventListener('click', () => {
  if (!isGameActive) return;
  toggleSit();
});
document.getElementById('peck-badge')?.addEventListener('click', () => {
  if (!isGameActive) return;
  performPeck();
});
document.getElementById('attack-badge')?.addEventListener('click', () => {
  if (!isGameActive) return;
  performAttack();
});
document.getElementById('dance-badge')?.addEventListener('click', () => {
  if (!isGameActive) return;
  toggleDance();
});
document.getElementById('fly-badge')?.addEventListener('click', () => {
  if (!isGameActive) return;
  if (!isFlying) enterFly();
  else exitFly();
});
document.getElementById('arm-badge')?.addEventListener('click', toggleArmed);
const shootBadgeEl = document.getElementById('shoot-badge');
shootBadgeEl?.addEventListener('pointerdown', () => apertarGatilho('hud'));
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
  shootBadgeEl?.addEventListener(ev, () => soltarGatilho('hud'))
);
document.getElementById('change-char-badge')?.addEventListener('click', openCharacterSelect);
document.getElementById('menu-voltar-btn')?.addEventListener('click', openCharacterSelect);
document.getElementById('pause-btn')?.addEventListener('click', () => definirPausa(!jogoPausado));

function enterFly() {
  isFlying = true;
  flyTimeAccum = 0;
  stopDance();

  // Se estiver sentada ao levantar voo, reseta o estado de sentada
  if (isSitting) {
    isSitting = false;
    isTransitioningSit = false;
    if (activeCharData?.sittingAction) activeCharData.sittingAction.fadeOut(0.2);
    if (activeCharData?.sitAction) activeCharData.sitAction.fadeOut(0.2);
    const sitBadge = document.getElementById('sit-badge');
    if (sitBadge) {
      sitBadge.classList.remove('active');
      const label = sitBadge.querySelector('.badge-label');
      if (label) label.textContent = 'Sentar';
    }
  }

  // Para caminhada e repouso do solo
  if (isWalking) {
    isWalking = false;
    if (activeCharData?.walkAction) activeCharData.walkAction.fadeOut(0.2);
  }
  if (activeCharData?.idleAction) {
    activeCharData.idleAction.fadeOut(0.2);
  }

  // Se possuir animação de decolagem específica (como Urubu_Decolagem):
  if (activeCharData?.takeoffAction) {
    activeCharData.takeoffAction.reset().fadeIn(0.12).play();
    const duration = activeCharData.takeoffAction.getClip().duration;
    setTimeout(() => {
      if (isFlying) {
        if (activeCharData?.flyAction && !isPecking && !isAttacking) activeCharData.flyAction.reset().fadeIn(0.25).play();
        if (activeCharData?.takeoffAction) activeCharData.takeoffAction.fadeOut(0.25);
      }
    }, Math.max(300, (duration - 0.25) * 1000));
  } else if (activeCharData?.flyAction) {
    activeCharData.flyAction.reset().fadeIn(0.25).play();
  }

  // Unlock polar angle so camera can look from below
  controls.maxPolarAngle = Math.PI * 0.85;

  // Update HUD
  document.getElementById('fly-badge').classList.add('flying');
  document.getElementById('fly-status').classList.add('visible');
}

function exitFly() {
  isFlying = false;
  controls.maxPolarAngle = Math.PI / 2 + 0.15;

  document.getElementById('fly-badge').classList.remove('flying');
  document.getElementById('fly-status').classList.remove('visible');
}

/* ── Reset on double click ── */
renderer.domElement.addEventListener('dblclick', () => {
  // No modo Killer o clique é tiro: duplo clique não pode resetar a cena
  if (!isGameActive || gameMode === 'killer') return;
  pivot.position.set(0, 0, 0);
  controls.target.set(0, 1, 0);
  controls.reset();
  if (isFlying) exitFly();
  if (activeCharData?.flyAction) activeCharData.flyAction.stop();
  if (activeCharData?.walkAction) activeCharData.walkAction.stop();
  if (activeCharData?.idleAction) activeCharData.idleAction.stop();
  if (activeCharData?.takeoffAction) activeCharData.takeoffAction.stop();
  if (activeCharData?.landingAction) activeCharData.landingAction.stop();
  if (activeCharData?.sitAction) activeCharData.sitAction.stop();
  if (activeCharData?.sittingAction) activeCharData.sittingAction.stop();
  if (activeCharData?.standAction) activeCharData.standAction.stop();
  if (activeCharData?.peckAirAction) activeCharData.peckAirAction.stop();
  if (activeCharData?.peckGroundAction) activeCharData.peckGroundAction.stop();
  if (activeCharData?.attackAction) activeCharData.attackAction.stop();
  if (activeCharData?.mixer) activeCharData.mixer.stopAllAction();
  if (activeCharData?.skeleton) activeCharData.skeleton.pose();
  stopDance();
  // Mantém a arma na mão, mas para de atirar (sem crossfade: tudo foi parado acima)
  isShooting = false;
  applyWeaponActions(false);
  updateWeaponHud();
  clearBullets();
  isWalking = false;
  isPecking = false;
  zerarBicada();
  isAttacking = false;
  isSitting = false;
  isTransitioningSit = false;
  wasAirborne = false;
  flyProgress = 0;
  velocity.set(0, 0, 0);
  if (pivot.children.length > 0) pivot.children[0].rotation.y = 0;
  if (activeCharData?.idleAction) activeCharData.idleAction.reset().fadeIn(0.2).play();
  const sitBadge = document.getElementById('sit-badge');
  if (sitBadge) {
    sitBadge.classList.remove('active');
    const label = sitBadge.querySelector('.badge-label');
    if (label) label.textContent = 'Sentar';
  }
});

/* ═══════════════════════════════════════
   PARTICLES
═══════════════════════════════════════ */
const N = 300;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 28;
  pPos[i * 3 + 1] = Math.random() * 14;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
  color: 0xaabbff, size: 0.04, transparent: true, opacity: 0.45, sizeAttenuation: true,
})));

/* ═══════════════════════════════════════
   RESIZE
═══════════════════════════════════════ */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ═══════════════════════════════════════
   ANIMATION LOOP
═══════════════════════════════════════ */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = jogoPausado ? (clock.getDelta(), 0) : clock.getDelta();   // pausado: o mundo congela

  /* ── Buggy e moto (fase 3): física + cegonha motorista/piloto, antes do mixer ── */
  const noCarro = atualizarCarro(delta);

  /* ── Mixer ── */
  restaurarPoseMira();   // desfaz o giro de mira do frame anterior antes da animação
  if (activeCharData && activeCharData.mixer) {
    activeCharData.mixer.update(delta);
  }
  // Tela inicial: a cegonha do fundo (se ainda não for o personagem ativo, o mixer dela não roda acima)
  if (menuAtivo) {
    const fundo = characterData.stork;
    if (fundo.mixer && fundo !== activeCharData) fundo.mixer.update(delta);
    atualizarMenuFundo(delta);
  }

  /* ── Urubus inimigos (modo Killer) ── */
  if (isKillerMode()) {
    const urubu = characterData.urubu;
    if (!vultures.hasSource() && urubu?.isLoaded) vultures.setSource(urubu.model, urubu.rawClips);
    _playerBody.copy(pivot.position).y += PLAYER_BODY_HEIGHT;
    vultures.update(delta, {
      playerPos: pivot.position,
      playerBody: _playerBody,
      playerAirborne: isFlying || pivot.position.y > 0.15,
    });
  }

  /* ── Projéteis da AK (dependem da pose recém-atualizada pelo mixer) ── */
  apontarArmaParaMira();
  atualizarGatilho(delta);
  updateBullets(delta);
  blood.update(delta);

  /* ── Vegetação do mapa: vento + plantas se dobrando com quem passa ── */
  if (isKillerMode() && mapaAtual === 'selva') {
    vultures.groundedPositions(mapaToques);
    if (pivot.position.y - groundAt(pivot.position.x, pivot.position.z) < 0.5) mapaToques.push(pivot.position);
    selva.update(delta, mapaToques);
  } else if (isKillerMode() && mapaAtual === 'pantano') {
    // Toque em 3D: o corpo de quem voa encostando nas copas também sacode as folhas
    vultures.bodyPositions(mapaToques);
    mapaToques.push(_storkTouch.copy(pivot.position).setY(pivot.position.y + STORK_COLLIDER.HEIGHT));
    pantano.update(delta, mapaToques);
  } else if (isKillerMode() && mapaAtual === 'estrada') {
    // Poeira, respingos, barro e marcas das rodas + plantas amassadas pela cegonha a pé
    personagensEstrada.length = 0;
    if (!cegonhaNoCarro()) personagensEstrada.push(_storkLocal.copy(pivot.position).divideScalar(escalaEstrada));
    estrada.update(delta, {
      veiculos: [buggyRoot?.visible ? buggy : null, motoRoot?.visible ? moto : null],
      personagens: personagensEstrada,
    });
  }
  /* ── Desafio da fase 3: marcador, cronômetro, checkpoints, urubus da trilha ── */
  if (isKillerMode() && fase === 3) desafio.update(delta);

  /* ── Fases (aviso de fase concluída e troca para o pântano) ── */
  if (isKillerMode()) atualizarFases(delta);

  /* ── Only process gameplay controls and motion when game is active ── */
  if (isGameActive && activeCharData && !noCarro && !jogoPausado) {
    _storkPrevFeet.copy(pivot.position);

    /* ── Toggle fly on Space (edge-triggered) ── */
    const spaceNow = !!keys['Space'];
    if (spaceNow && !spacePrev && !bicada && !(fase === 3 && desafio.bloqueiaVoo())) {
      if (!isFlying) enterFly();
      else exitFly();
    }
    spacePrev = spaceNow;

    /* ── Fly progress (smooth transition 0→1 or 1→0) ── */
    const flyTarget = isFlying ? 1 : 0;
    flyProgress += (flyTarget - flyProgress) * Math.min(delta * 2.0, 1);

    /* ── Altitude: pivot Y interpolates with fly progress ── */
    const groundY = groundAt(pivot.position.x, pivot.position.z);
    atualizarBicada(delta);   // bicada da cegonha: vira, altura da investida, acerto
    const targetAltitude = groundY + flyProgress * FLY_TARGET_Y + alturaInvestida;
    const altitudeRate = (!isFlying && flyProgress < 0.05) ? 15 : 2.5;
    pivot.position.y += (targetAltitude - pivot.position.y) * Math.min(delta * altitudeRate, 1);

    // Keep orbit target at model's actual height
    const modelCenterY = pivot.position.y + 1.5;
    controls.target.y += (modelCenterY - controls.target.y) * 0.08;

    /* ── Detecção de toque dos pés no chão ao pousar ── */
    const isAirborne = pivot.position.y - groundY > 0.08 || flyProgress > 0.03;
    if (isAirborne) {
      wasAirborne = true;
      // Garante que o rigging de voo esteja ativo no ar se disponível e não estiver bicando, atacando ou decolando
      if (activeCharData.flyAction && !activeCharData.flyAction.isRunning() && !isDancing && !isPecking && !isAttacking && !activeCharData.takeoffAction?.isRunning()) {
        activeCharData.flyAction.reset().fadeIn(0.2).play();
      }
      if (activeCharData.flyAction && activeCharData.flyAction.isRunning() && !isAttacking) {
        const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
        const targetTimeScale = 1.0 + Math.min(speed2d / FLY_SPEED, 1.0) * 0.35;
        activeCharData.flyAction.timeScale += (targetTimeScale - activeCharData.flyAction.timeScale) * 0.1;
      }
    } else if (wasAirborne && !isAirborne) {
      wasAirborne = false;
      triggerLanding();
    }

    /* ── Walking animation state machine com rigging ── */
    // Caminhada automática até a porta do buggy (fase 3)
    const autoDir = passoAutoEntrada(delta, MOVE_SPEED);
    const movingAnyNow = !isFlying && (!!autoDir ||
      !!keys['KeyW'] || !!keys['KeyS'] || !!keys['KeyA'] || !!keys['KeyD'] ||
      !!keys['ArrowUp'] || !!keys['ArrowDown'] || !!keys['ArrowLeft'] || !!keys['ArrowRight']
    );

    // Se estiver sentada e o jogador pressionar teclas de movimento, levanta automaticamente
    if (movingAnyNow && isSitting && !isTransitioningSit) {
      standUp();
    }

    if (movingAnyNow && !isWalking && !isSitting) {
      isWalking = true;
      stopDance();
      if (activeCharData.idleAction) activeCharData.idleAction.fadeOut(0.15);
      if (activeCharData.walkAction && !isPecking) {
        activeCharData.walkAction.reset().fadeIn(0.15).play();
      }
    } else if (!movingAnyNow && isWalking) {
      isWalking = false;
      if (activeCharData.walkAction) {
        activeCharData.walkAction.fadeOut(0.2);
      }
      if (activeCharData.idleAction && !isPecking && !isFlying && !isSitting) {
        activeCharData.idleAction.reset().fadeIn(0.25).play();
      }
    }

    // Ajusta velocidade da animação de caminhada com a velocidade real
    if (isWalking && activeCharData.walkAction && activeCharData.walkAction.isRunning()) {
      const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
      const targetScale = Math.max(0.7, Math.min(1.4, (speed2d / MOVE_SPEED) * 1.1));
      activeCharData.walkAction.timeScale = targetScale;
    }

    /* ── Movement ── */
    const speed = MOVE_SPEED + flyProgress * (FLY_SPEED - MOVE_SPEED);

    camera.getWorldDirection(camFwd);
    if (!isFlying || flyProgress < 0.5) { camFwd.y = 0; }
    camFwd.normalize();
    camRight.crossVectors(camFwd, camera.up).normalize();

    targetVel.set(0, 0, 0);
    if (keys['ArrowLeft'] || keys['KeyA']) targetVel.addScaledVector(camRight, -speed);
    if (keys['ArrowRight'] || keys['KeyD']) targetVel.addScaledVector(camRight, speed);
    if (keys['ArrowUp'] || keys['KeyW']) targetVel.addScaledVector(camFwd, speed);
    if (keys['ArrowDown'] || keys['KeyS']) targetVel.addScaledVector(camFwd, -speed);
    if (autoDir) targetVel.copy(autoDir).multiplyScalar(autoDir.passo);
    // Bicando no chão ela fica parada; na investida do voo a velocidade é a dela, para onde está virada
    if (bicada?.tipo === 'chao') targetVel.set(0, 0, 0);
    const investida = investindo();
    if (investida && pivot.children[0]) {
      const yawI = pivot.children[0].rotation.y;
      targetVel.set(Math.sin(yawI), 0, Math.cos(yawI)).multiplyScalar(BICADA_JOGO.VEL_AR);
    }

    // Flying: shift+up/down for altitude adjustment
    if (isFlying) {
      if (keys['ShiftLeft'] || keys['ShiftRight']) targetVel.y += speed * 0.6;
      if (keys['ControlLeft'] || keys['ControlRight']) targetVel.y -= speed * 0.6;
    }

    velocity.lerp(targetVel, autoDir ? 0.3 : investida ? BICADA_JOGO.ARRANQUE : 0.12);

    const moveLen = velocity.lengthSq();
    if (moveLen > 1e-8) {
      const hMove = new THREE.Vector3(velocity.x, 0, velocity.z);
      pivot.position.x += velocity.x;
      pivot.position.z += velocity.z;
      controls.target.x += velocity.x;
      controls.target.z += velocity.z;

      // Rotate model toward horizontal movement (só WASD/setas viram a cegonha; o mouse só olha)
      if (pivot.children.length > 0 && hMove.lengthSq() > 1e-6 && !isAiming && !bicada) {
        const angle = Math.atan2(hMove.x, hMove.z);
        pivot.children[0].rotation.y = lerpAngle(pivot.children[0].rotation.y, angle, 0.15);
      }
    }

    // Colisão com o mapa (troncos, copas, limites)
    if (isKillerMode()) {
      const noChao = !isFlying && pivot.position.y - groundAt(pivot.position.x, pivot.position.z) < 0.1;
      colidirCegonhaComMapa(noChao);
    }

    // Mirando (botão direito): a cegonha vira junto com o mouse, de frente para a mira
    if (isAiming && pivot.children.length > 0) {
      pivot.children[0].rotation.y = lerpAngle(pivot.children[0].rotation.y, camYaw + Math.PI, Math.min(1, delta * AIM.TURN_SPEED));
    }
  } else {
    velocity.set(0, 0, 0);
  }

  /* ── Tilt model forward when flying fast ── */
  if (pivot.children.length > 0 && !menuAtivo) {
    const mdl = pivot.children[0];
    const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
    const tiltTarget = isFlying ? -Math.min(speed2d * 4.0, bicada ? BICADA_JOGO.INCLINACAO_MAX : Infinity) : 0;
    mdl.rotation.x += (tiltTarget - mdl.rotation.x) * 0.08;

    // Body bob while flying (fallback quando não há rigging de voo, como no Urubu)
    if (!activeCharData?.flyAction) {
      if (flyProgress > 0.1) {
        flyTimeAccum += delta;
        const bob = Math.sin(flyTimeAccum * FLAP_FREQ_FLY * 0.5) * 0.04 * flyProgress;
        mdl.position.y += (bob - (mdl._lastBob || 0));
        mdl._lastBob = bob;
      } else {
        if (mdl._lastBob) {
          mdl.position.y -= mdl._lastBob;
          mdl._lastBob = 0;
        }
      }
    }
  }

  /* ── Procedural wing flap (apenas como fallback se NÃO houver rigging de voo e houver wingBones) ── */
  if (!activeCharData?.flyAction && activeCharData?.wingBones?.length > 0 && flyProgress > 0.05) {
    flapTime += delta * FLAP_FREQ_FLY * flyProgress;

    activeCharData.wingBones.forEach(w => {
      const amp = 0.23 * flyProgress;
      const flapY = Math.sin(flapTime) * amp + 0.04 * flyProgress;
      const tiltUp = (0.13 + 0.02 * Math.sin(flapTime)) * flyProgress;

      w.obj.rotation.y = w.restRotY + flapY * w.side;
      w.obj.rotation.x = w.restRotX - tiltUp * w.side;
      w.obj.rotation.z = w.restRotZ;
    });
  } else if (!activeCharData?.flyAction && activeCharData?.wingBones?.length > 0 && flyProgress <= 0.05) {
    activeCharData.wingBones.forEach(w => {
      w.obj.rotation.y += (w.restRotY - w.obj.rotation.y) * 0.1;
      w.obj.rotation.x += (w.restRotX - w.obj.rotation.x) * 0.1;
      w.obj.rotation.z += (w.restRotZ - w.obj.rotation.z) * 0.1;
    });
  }

  /* ── Shadow follows model position ── */
  keyLight.position.x = pivot.position.x + 5;
  keyLight.position.z = pivot.position.z + 6;
  keyLight.target.position.copy(pivot.position);
  keyLight.target.updateMatrixWorld();

  /* ── Particles ── (congelam na pausa) */
  for (let i = 0; i < N && !jogoPausado; i++) {
    pPos[i * 3 + 1] += 0.003 + flyProgress * 0.005;
    if (pPos[i * 3 + 1] > 14) {
      pPos[i * 3] = (Math.random() - 0.5) * 28;
      pPos[i * 3 + 1] = 0;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
    }
  }
  pGeo.attributes.position.needsUpdate = true;

  if (isKillerMode()) updateThirdPersonCamera(delta);
  else if (!menuAtivo) controls.update();
  skyDome.position.copy(camera.position);
  renderer.render(scene, camera);
}

animate();
