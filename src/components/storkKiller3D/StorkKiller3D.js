import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBloodSystem } from './blood.js';
import { createVultureManager } from './vultures.js';
import './StorkKiller3D.css';

/* ═══════════════════════════════════════════════════════
   CHARACTERS CONFIG
═══════════════════════════════════════════════════════ */
const CHARACTERS = [
  {
    id: 'stork',
    name: 'Cegonha',
    role: 'Predador Aéreo',
    desc: 'Personagem com rigging completo de caminhada (WASD), voo 3D, respiração/parado no solo, poses de sentar/levantar e AK-47 com animações próprias.',
    tags: ['Caminhada & Voo com Rigging', 'Parado & Sentar (X)', 'AK-47 (G / R)', 'Disponível'],
    status: 'available',
    statusLabel: 'Disponível',
    buttonText: 'Jogar com a Cegonha',
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 13c3.5-4.5 9-6 13-3.5 2 1.2 4 3.5 6 3.5-3 1-6 0-8 2-3 3-5 5-11 1 3-1 4.5-2 0-3z"/>
      <circle cx="17.5" cy="8.5" r="1.5" fill="currentColor"/>
      <path d="M7 15l-3 5"/>
      <path d="M11 15l-2 5"/>
    </svg>`,
    modelPath: `${process.env.PUBLIC_URL || ''}/assets/models/stork_with_ak.glb`,
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
    modelPath: `${process.env.PUBLIC_URL || ''}/assets/models/urubu_model.glb`,
  },
  {
    id: 'cyber_raven',
    name: 'Corvo Cibernético',
    role: 'Em Breve',
    desc: 'Unidade mecatrônica com asas a jato e visão computacional avançada.',
    tags: ['Propulsão a Jato', 'Radar Óptico', 'Em Breve'],
    status: 'locked',
    statusLabel: 'Bloqueado',
    buttonText: 'Em Breve',
    iconSvg: `<svg class="char-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>`,
  },
];

const StorkKiller3D = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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
    container.appendChild(renderer.domElement);

    /* ═══════════════════════════════════════
       SCENE
    ═══════════════════════════════════════ */
    const scene = new THREE.Scene();

    const SKY_HORIZON = new THREE.Color('#cfe8ff');
    const bgGeo = new THREE.SphereGeometry(80, 32, 32);
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
          float t = pow(clamp(vPos.y / 80.0, 0.0, 1.0), 0.6);
          gl_FragColor = vec4(mix(colorBottom, colorTop, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(bgGeo, bgMat));

    /* ═══════════════════════════════════════
       CAMERA & CONTROLS
    ═══════════════════════════════════════ */
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 500);
    camera.position.set(0, 2.5, 7);

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
    scene.add(new THREE.HemisphereLight(0xbfdcff, 0x5a4a3a, 1.1));

    const keyLight = new THREE.DirectionalLight(0xfff0e8, 2.8);
    keyLight.position.set(5, 10, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 60;
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

    /* ═══════════════════════════════════════
       FLOOR & GRID
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

    scene.fog = new THREE.FogExp2(SKY_HORIZON.getHex(), 0.018);

    /* ═══════════════════════════════════════
       PIVOT & STATE
    ═══════════════════════════════════════ */
    const pivot = new THREE.Group();
    scene.add(pivot);

    const GROUND_Y = 0;
    const FLY_TARGET_Y = 4.5;
    const MOVE_SPEED = 0.048;
    const FLY_SPEED = 0.06;

    let isGameActive = false;
    let selectedCharacter = null;
    let gameMode = 'viewer';

    let isFlying = false;
    let flyProgress = 0;
    let flyTimeAccum = 0;
    let flapTime = 0;
    const FLAP_FREQ_FLY = 3.8;

    let isDancing = false;
    let isWalking = false;
    let wasAirborne = false;

    const velocity = new THREE.Vector3();
    const targetVel = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    const camRight = new THREE.Vector3();

    // Character repository
    const characterData = {};
    let activeCharData = null;

    const loader = new GLTFLoader();

    /* ═══════════════════════════════════════
       ROOT MOTION REMOVAL
    ═══════════════════════════════════════ */
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

    function cloneClipRaw(clip) {
      const tracks = clip.tracks.map(t => {
        const copy = new t.constructor(t.name, t.times.slice(), t.values.slice());
        copy.setInterpolation(t.getInterpolation());
        return copy;
      });
      return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    }

    /* ═══════════════════════════════════════
       LOAD CHARACTER
    ═══════════════════════════════════════ */
    function loadCharacter(charId, onComplete) {
      if (characterData[charId] && characterData[charId].isLoaded) {
        if (onComplete) onComplete(characterData[charId]);
        return;
      }

      const charDef = CHARACTERS.find(c => c.id === charId);
      if (!charDef || !charDef.modelPath) return;

      const loadingEl = container.querySelector('.stork-loading-overlay p');

      loader.load(
        charDef.modelPath,
        (gltf) => {
          const model = gltf.scene;

          const akMesh = model.getObjectByName('AK47');
          const akFlashMesh = model.getObjectByName('AK47_Flash');
          const weapon = akMesh ? {
            mesh: akMesh,
            flashMesh: akFlashMesh,
            muzzle: model.getObjectByName('Cano_AK'),
            gripBone: model.getObjectByName('Arma'),
            flashBone: model.getObjectByName('Flash_AK'),
          } : null;
          if (weapon) {
            weapon.mesh.visible = false;
            if (weapon.flashMesh) weapon.flashMesh.visible = false;
          }

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

          const box = bodyBox();
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const scale = 3.0 / Math.max(size.x, size.y, size.z);
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));

          const box2 = bodyBox();
          model.position.y -= box2.min.y;

          let charSkeleton = null;
          model.traverse(child => {
            if (child.isSkinnedMesh) charSkeleton = child.skeleton;
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false;
            }
          });

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
          const akActions = { hold: null, shoot: null, walk: null, walkShoot: null, fly: null, flyShoot: null };

          const rawClips = (gltf.animations || []).map(cloneClipRaw);

          if (gltf.animations && gltf.animations.length > 0) {
            charMixer = new THREE.AnimationMixer(model);

            gltf.animations.forEach((clip) => {
              const n = clip.name.toLowerCase();

              if (n.includes('morte') || n.includes('atingido')) return;

              makeClipInPlace(clip);

              if (/(^|_)ak(_|$)/.test(n)) {
                const action = charMixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat);
                const shooting = n.includes('atirando');
                if (n.includes('caminh')) akActions[shooting ? 'walkShoot' : 'walk'] = action;
                else if (n.includes('voo')) akActions[shooting ? 'flyShoot' : 'fly'] = action;
                else if (n.includes('atirar')) akActions.shoot = action;
                else if (n.includes('segurar')) akActions.hold = action;
              } else if (n.includes('ataque') || n.includes('attack')) {
                charAttackAction = charMixer.clipAction(clip);
                charAttackAction.setLoop(THREE.LoopOnce, 1);
                charAttackAction.clampWhenFinished = false;
              } else if (n.includes('sentada') || n.includes('sitting')) {
                charSittingAction = charMixer.clipAction(clip);
                charSittingAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('sentar') || n.includes('sit_down')) {
                charSitAction = charMixer.clipAction(clip);
                charSitAction.setLoop(THREE.LoopOnce, 1);
                charSitAction.clampWhenFinished = true;
              } else if (n.includes('levantar') || n.includes('stand')) {
                charStandAction = charMixer.clipAction(clip);
                charStandAction.setLoop(THREE.LoopOnce, 1);
                charStandAction.clampWhenFinished = true;
              } else if (n.includes('bicada_ar') || (n.includes('bicad') && (n.includes('ar') || n.includes('air')))) {
                charPeckAirAction = charMixer.clipAction(clip);
                charPeckAirAction.setLoop(THREE.LoopOnce, 1);
                charPeckAirAction.clampWhenFinished = false;
              } else if (n.includes('bicada_chao') || (n.includes('bicad') && (n.includes('chao') || n.includes('ground')))) {
                charPeckGroundAction = charMixer.clipAction(clip);
                charPeckGroundAction.setLoop(THREE.LoopOnce, 1);
                charPeckGroundAction.clampWhenFinished = false;
              } else if (n.includes('decolagem') || n.includes('takeoff')) {
                charTakeoffAction = charMixer.clipAction(clip);
                charTakeoffAction.setLoop(THREE.LoopOnce, 1);
                charTakeoffAction.clampWhenFinished = true;
              } else if (n.includes('pouso') || n.includes('landing')) {
                charLandingAction = charMixer.clipAction(clip);
                charLandingAction.setLoop(THREE.LoopOnce, 1);
                charLandingAction.clampWhenFinished = true;
              } else if (n.includes('planar') || n.includes('glide')) {
                charGlideAction = charMixer.clipAction(clip);
                charGlideAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('parado') || n.includes('idle')) {
                charIdleAction = charMixer.clipAction(clip);
                charIdleAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('caminh') || n.includes('walk') || n.includes('andar')) {
                charWalkAction = charMixer.clipAction(clip);
                charWalkAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('voo') || n.includes('fly') || n.includes('voando')) {
                charFlyAction = charMixer.clipAction(clip);
                charFlyAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('dance')) {
                charDanceAction = charMixer.clipAction(clip);
                charDanceAction.setLoop(THREE.LoopRepeat);
              } else if (n.includes('caindo')) {
                charCaindoAction = charMixer.clipAction(clip);
                charCaindoAction.setLoop(THREE.LoopOnce, 1);
                charCaindoAction.clampWhenFinished = true;
              }
            });

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
                  obj: child, side,
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
          if (xhr.total && loadingEl) {
            loadingEl.textContent = `Carregando ${charDef.name}… ${Math.round(xhr.loaded / xhr.total * 100)}%`;
          }
        },
        (err) => {
          console.error(`Erro ao carregar modelo ${charDef.name}:`, err);
        }
      );
    }

    /* ═══════════════════════════════════════
       WEAPON STATE
    ═══════════════════════════════════════ */
    const WEAPON_CROSSFADE = 0.15;
    const BULLET_SPEED = 45;
    const BULLET_LIFE = 1.2;
    const FLASH_SHOT_SCALE = 10;

    let isArmed = false;
    let isShooting = false;

    function isFadingOut(action) {
      const w = action._weightInterpolant;
      return !!w && w.sampleValues[1] === 0;
    }

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
        if (!crossfade || !prev || !nextAction) return;
        if (prev.isRunning() && !isFadingOut(prev)) {
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
      const armBadge = container.querySelector('#arm-badge');
      if (armBadge) {
        armBadge.classList.toggle('active', isArmed);
        const label = armBadge.querySelector('.badge-label');
        if (label) label.textContent = isArmed ? 'Soltar Arma' : 'Pegar Arma';
      }
      const shootBadge = container.querySelector('#shoot-badge');
      if (shootBadge) {
        shootBadge.classList.toggle('disabled', !isArmed);
        shootBadge.classList.toggle('active', isShooting);
      }
      const sitBadge = container.querySelector('#sit-badge');
      if (sitBadge) sitBadge.classList.toggle('disabled', isArmed);
    }

    function setArmed(armed) {
      if (!activeCharData?.weapon || isArmed === armed) return;
      if (isTransitioningSit) return;
      if (armed && isSitting) { standUp(() => setArmed(true)); return; }
      isArmed = armed;
      if (!armed) isShooting = false;
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

    /* ═══════════════════════════════════════
       BULLETS
    ═══════════════════════════════════════ */
    const bullets = [];
    const bulletGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 6).rotateX(Math.PI / 2);
    const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    const _bulletPos = new THREE.Vector3();
    const _bulletDir = new THREE.Vector3();
    const _gripQuat = new THREE.Quaternion();
    const _zAxis = new THREE.Vector3(0, 0, 1);
    const _aimRay = new THREE.Ray();
    const _aimPoint = new THREE.Vector3();
    const _bulletPrev = new THREE.Vector3();
    let lastFlashScale = 1;

    const AIM_DISTANCE = 80;

    function spawnBullet() {
      const w = activeCharData?.weapon;
      if (!w?.muzzle || !w.gripBone) return;
      w.muzzle.getWorldPosition(_bulletPos);
      if (isKillerMode()) {
        _aimRay.origin.copy(camera.position);
        camera.getWorldDirection(_aimRay.direction);
        let aimDist = AIM_DISTANCE;
        if (_aimRay.direction.y < -1e-4) aimDist = Math.min(aimDist, -_aimRay.origin.y / _aimRay.direction.y);
        const target = vultures.raycast(_aimRay);
        if (target && target.distance < aimDist) _aimPoint.copy(target.point);
        else _aimRay.at(aimDist, _aimPoint);
        _bulletDir.subVectors(_aimPoint, _bulletPos).normalize();
      } else {
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
      const w = activeCharData?.weapon;
      if (w?.flashBone && isArmed) {
        const s = w.flashBone.scale.x;
        if (s > FLASH_SHOT_SCALE && lastFlashScale <= FLASH_SHOT_SCALE) spawnBullet();
        lastFlashScale = s;
      } else {
        lastFlashScale = 1;
      }
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        _bulletPrev.copy(b.mesh.position);
        b.mesh.position.addScaledVector(b.vel, delta);
        b.life -= delta;
        const hit = isKillerMode() && vultures.hitSegment(_bulletPrev, b.mesh.position);
        if (hit) {
          _bulletDir.copy(b.vel).normalize();
          vultures.damage(hit.vulture, hit.point, _bulletDir);
          scene.remove(b.mesh);
          bullets.splice(i, 1);
          continue;
        }
        if (b.life <= 0 || b.mesh.position.y < 0) {
          scene.remove(b.mesh);
          bullets.splice(i, 1);
        }
      }
    }

    function clearBullets() {
      bullets.forEach(b => scene.remove(b.mesh));
      bullets.length = 0;
    }

    /* ── Shot sound ── */
    let audioCtx = null;
    let shotNoise = null;
    function playShotSound() {
      try {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const len = Math.floor(audioCtx.sampleRate * 0.12);
          shotNoise = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
          const data = shotNoise.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }
        const src = audioCtx.createBufferSource();
        src.buffer = shotNoise;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;
        const gain = audioCtx.createGain();
        gain.gain.value = 0.25;
        src.connect(filter).connect(gain).connect(audioCtx.destination);
        src.start();
      } catch (e) { /* audio unavailable */ }
    }

    /* ═══════════════════════════════════════
       KILLER MODE (TPS)
    ═══════════════════════════════════════ */
    const TPS = {
      DIST: 6.5,
      HEIGHT: 2.0,
      SHOULDER: 0.9,
      PITCH_MIN: -0.3,
      PITCH_MAX: 1.15,
      SENS: 0.0025,
      MIN_CAM_Y: 0.4,
    };
    const PLAYER_BODY_HEIGHT = 1.4;

    let camYaw = Math.PI;
    let camPitch = 0.25;
    let mouseShooting = false;
    let killCount = 0;
    let damageCount = 0;

    const _tpsTarget = new THREE.Vector3();
    const _tpsRight = new THREE.Vector3();
    const _playerBody = new THREE.Vector3();

    const blood = createBloodSystem(scene);
    const vultures = createVultureManager({
      scene,
      blood,
      onPlayerHit: () => {
        damageCount++;
        updateKillerHud();
        const flash = container.querySelector('#damage-flash');
        if (flash) {
          flash.classList.remove('show');
          void flash.offsetWidth;
          flash.classList.add('show');
        }
      },
      onKill: () => {
        killCount++;
        updateKillerHud();
      },
    });

    function isKillerMode() {
      return gameMode === 'killer' && isGameActive;
    }

    function startKillerGame() {
      gameMode = 'killer';
      const stork = CHARACTERS.find(c => c.id === 'stork');
      if (stork) selectCharacter(stork);
    }

    function enterKillerMode() {
      controls.enabled = false;
      camYaw = Math.PI;
      camPitch = 0.25;
      killCount = 0;
      damageCount = 0;
      mouseShooting = false;
      vultures.clear();
      blood.clear();
      setArmed(true);
      updateKillerHud();
      document.body.classList.add('killer-mode');
      const subtitle = container.querySelector('#char-active-subtitle');
      if (subtitle) subtitle.innerHTML = 'Cegonha Killer &middot; Abata os urubus';
    }

    function exitKillerMode() {
      if (document.pointerLockElement) document.exitPointerLock();
      controls.enabled = true;
      mouseShooting = false;
      vultures.clear();
      blood.clear();
      document.body.classList.remove('killer-mode');
      gameMode = 'viewer';
    }

    function updateKillerHud() {
      const kills = container.querySelector('#kill-count');
      if (kills) kills.textContent = killCount;
      const dmg = container.querySelector('#damage-count');
      if (dmg) dmg.textContent = damageCount;
    }

    function updateThirdPersonCamera() {
      _tpsTarget.set(pivot.position.x, pivot.position.y + TPS.HEIGHT, pivot.position.z);
      _tpsRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).multiplyScalar(TPS.SHOULDER);
      _tpsTarget.add(_tpsRight);
      const cp = Math.cos(camPitch);
      camera.position.set(
        _tpsTarget.x + Math.sin(camYaw) * cp * TPS.DIST,
        _tpsTarget.y + Math.sin(camPitch) * TPS.DIST,
        _tpsTarget.z + Math.cos(camYaw) * cp * TPS.DIST,
      );
      camera.position.y = Math.max(TPS.MIN_CAM_Y, camera.position.y);
      camera.lookAt(_tpsTarget);
    }

    function lerpAngle(a, b, t) {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    }

    /* ═══════════════════════════════════════
       SIT / STAND / PECK / ATTACK / DANCE
    ═══════════════════════════════════════ */
    let isPecking = false;
    let isAttacking = false;
    let isSitting = false;
    let isTransitioningSit = false;

    function toggleSit() {
      if (!isGameActive || isFlying || wasAirborne || isWalking || isPecking || isAttacking || isTransitioningSit) return;
      if (isArmed) return;
      if (!activeCharData?.sitAction && !activeCharData?.sittingAction) return;

      const sitBadge = container.querySelector('#sit-badge');
      if (!isSitting) {
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
        standUp();
      }
    }

    function standUp(onComplete) {
      if (!isSitting || isTransitioningSit) { if (onComplete) onComplete(); return; }
      isSitting = false;
      isTransitioningSit = true;
      const sitBadge = container.querySelector('#sit-badge');
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

    function performPeck() {
      if (!isGameActive || isPecking || isAttacking) return;
      const inAir = isFlying || wasAirborne || (pivot.position.y > 0.08);
      const peckAction = inAir ? activeCharData?.peckAirAction : activeCharData?.peckGroundAction;
      if (!peckAction) return;
      isPecking = true;
      const badge = container.querySelector('#peck-badge');
      if (badge) badge.classList.add('active');
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

    function performAttack() {
      if (!isGameActive || isAttacking || isPecking) return;
      if (!activeCharData?.attackAction) { performPeck(); return; }
      const inAir = isFlying || wasAirborne || (pivot.position.y > 0.08);
      if (!inAir) { performPeck(); return; }
      isAttacking = true;
      const badge = container.querySelector('#attack-badge');
      if (badge) badge.classList.add('active');
      if (activeCharData.flyAction) {
        activeCharData.flyAction.crossFadeTo(activeCharData.attackAction, 0.15, true);
      }
      activeCharData.attackAction.reset().fadeIn(0.12).play();
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
        if (activeCharData.flyAction) {
          activeCharData.attackAction.crossFadeTo(activeCharData.flyAction, 0.2, true);
          activeCharData.flyAction.reset().fadeIn(0.2).play();
        }
        activeCharData.attackAction.fadeOut(0.25);
      }, Math.max(400, (attackDuration - 0.15) * 1000));
    }

    function toggleDance() {
      if (!activeCharData?.danceAction) return;
      isDancing = !isDancing;
      const badge = container.querySelector('#dance-badge');
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
      const badge = container.querySelector('#dance-badge');
      if (badge) badge.classList.remove('active');
      if ((isFlying || wasAirborne) && activeCharData?.flyAction && !activeCharData.flyAction.isRunning() && !isPecking && !isAttacking) {
        activeCharData.flyAction.reset().fadeIn(0.2).play();
      }
    }

    function triggerLanding() {
      if (activeCharData?.flyAction) activeCharData.flyAction.fadeOut(0.3);
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

    /* ═══════════════════════════════════════
       FLY ENTER / EXIT
    ═══════════════════════════════════════ */
    function enterFly() {
      isFlying = true;
      flyTimeAccum = 0;
      stopDance();
      if (isSitting) {
        isSitting = false;
        isTransitioningSit = false;
        if (activeCharData?.sittingAction) activeCharData.sittingAction.fadeOut(0.2);
        if (activeCharData?.sitAction) activeCharData.sitAction.fadeOut(0.2);
        const sitBadge = container.querySelector('#sit-badge');
        if (sitBadge) {
          sitBadge.classList.remove('active');
          const label = sitBadge.querySelector('.badge-label');
          if (label) label.textContent = 'Sentar';
        }
      }
      if (isWalking) {
        isWalking = false;
        if (activeCharData?.walkAction) activeCharData.walkAction.fadeOut(0.2);
      }
      if (activeCharData?.idleAction) activeCharData.idleAction.fadeOut(0.2);
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
      controls.maxPolarAngle = Math.PI * 0.85;
      const flyBadge = container.querySelector('#fly-badge');
      if (flyBadge) flyBadge.classList.add('flying');
      const flyStatus = container.querySelector('#fly-status');
      if (flyStatus) flyStatus.classList.add('visible');
    }

    function exitFly() {
      isFlying = false;
      controls.maxPolarAngle = Math.PI / 2 + 0.15;
      const flyBadge = container.querySelector('#fly-badge');
      if (flyBadge) flyBadge.classList.remove('flying');
      const flyStatus = container.querySelector('#fly-status');
      if (flyStatus) flyStatus.classList.remove('visible');
    }

    /* ═══════════════════════════════════════
       CHARACTER SELECTION
    ═══════════════════════════════════════ */
    function renderCharacterGrid() {
      const grid = container.querySelector('#char-grid');
      if (!grid) return;
      grid.innerHTML = '';

      CHARACTERS.forEach(char => {
        const card = document.createElement('div');
        card.className = `char-card ${char.status}`;
        card.setAttribute('data-char-id', char.id);

        const tagsHtml = char.tags.map(t => `<span class="char-tag">${t}</span>`).join('');
        card.innerHTML = `
          <div class="char-badge-status">${char.statusLabel}</div>
          <div class="char-avatar-box">${char.iconSvg || ''}</div>
          <h2 class="char-name">${char.name}</h2>
          <div class="char-role">${char.role}</div>
          <p class="char-desc">${char.desc}</p>
          <div class="char-tags">${tagsHtml}</div>
          <button class="char-btn" type="button" ${char.status !== 'available' ? 'disabled' : ''}>
            <span>${char.buttonText}</span>
            ${char.status === 'available' ? '<span>&rarr;</span>' : ''}
          </button>
        `;

        if (char.status === 'available') {
          card.addEventListener('click', () => {
            gameMode = 'viewer';
            selectCharacter(char);
          });
        }

        grid.appendChild(card);
      });
    }

    function selectCharacter(char) {
      if (char.status !== 'available') return;
      selectedCharacter = char;

      if (!characterData[char.id] || !characterData[char.id].isLoaded) {
        const btnSpan = container.querySelector(`.char-card[data-char-id="${char.id}"] .char-btn span`);
        if (btnSpan) btnSpan.textContent = 'Carregando 3D…';
        loadCharacter(char.id, (data) => {
          if (selectedCharacter && selectedCharacter.id === char.id) applyActiveCharacter(data);
        });
        return;
      }
      applyActiveCharacter(characterData[char.id]);
    }

    function applyActiveCharacter(charData) {
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
      isArmed = false;
      isShooting = false;
      applyWeaponActions(false);
      updateWeaponVisibility();
      clearBullets();
      activeCharData.model.rotation.set(0, 0, 0);
      pivot.add(activeCharData.model);

      pivot.position.set(0, 0, 0);
      controls.target.set(0, 1, 0);
      controls.reset();
      isFlying = false;
      flyProgress = 0;
      wasAirborne = false;
      isDancing = false;
      isWalking = false;
      isPecking = false;
      isSitting = false;
      isTransitioningSit = false;
      velocity.set(0, 0, 0);

      if (activeCharData.idleAction && !isFlying) {
        activeCharData.idleAction.reset().fadeIn(0.25).play();
      }

      isGameActive = true;
      controls.autoRotate = false;

      const charSelectScreen = container.querySelector('#char-select-screen');
      if (charSelectScreen) charSelectScreen.classList.add('hidden');

      const hud = container.querySelector('#hud');
      if (hud) hud.classList.remove('hidden');

      const title = container.querySelector('#title');
      if (title) title.classList.remove('hidden');

      const subtitle = container.querySelector('#char-active-subtitle');
      if (subtitle) subtitle.innerHTML = `Visualizador 3D &middot; ${charData.def.name}`;

      const danceBadge = container.querySelector('#dance-badge');
      if (danceBadge) danceBadge.style.display = charData.danceAction ? 'flex' : 'none';

      const peckBadge = container.querySelector('#peck-badge');
      if (peckBadge) peckBadge.style.display = (charData.peckAirAction || charData.peckGroundAction) ? 'flex' : 'none';

      const attackBadge = container.querySelector('#attack-badge');
      if (attackBadge) attackBadge.style.display = charData.attackAction ? 'flex' : 'none';

      const sitBadge = container.querySelector('#sit-badge');
      if (sitBadge) {
        sitBadge.style.display = (charData.sitAction || charData.sittingAction) ? 'flex' : 'none';
        sitBadge.classList.remove('active');
        const label = sitBadge.querySelector('.badge-label');
        if (label) label.textContent = 'Sentar';
      }

      const armBadge = container.querySelector('#arm-badge');
      const shootBadge = container.querySelector('#shoot-badge');
      if (armBadge) armBadge.style.display = charData.weapon ? 'flex' : 'none';
      if (shootBadge) shootBadge.style.display = charData.weapon ? 'flex' : 'none';
      updateWeaponHud();

      if (gameMode === 'killer') enterKillerMode();
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
      setShooting(false);
      isWalking = false;
      isPecking = false;
      isAttacking = false;
      isSitting = false;
      isTransitioningSit = false;

      const charSelectScreen = container.querySelector('#char-select-screen');
      if (charSelectScreen) charSelectScreen.classList.remove('hidden');
      const hud = container.querySelector('#hud');
      if (hud) hud.classList.add('hidden');
      const title = container.querySelector('#title');
      if (title) title.classList.add('hidden');
    }

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
       KEYBOARD EVENTS
    ═══════════════════════════════════════ */
    const keys = {};
    let spacePrev = false;

    const handleKeyDown = (e) => {
      if (!isGameActive) {
        if (e.code === 'Enter') {
          gameMode = 'viewer';
          const firstAvail = CHARACTERS.find(c => c.status === 'available');
          if (firstAvail) selectCharacter(firstAvail);
        }
        return;
      }
      keys[e.code] = true;
      if (e.code === 'KeyX' || e.key === 'x' || e.key === 'X') toggleSit();
      if (e.code === 'KeyQ' || e.key === 'q' || e.key === 'Q') performAttack();
      if (['KeyE', 'KeyB', 'KeyF'].includes(e.code) || ['e', 'E', 'b', 'B', 'f', 'F'].includes(e.key)) performPeck();
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') toggleDance();
      if (e.code === 'KeyG' && !e.repeat) toggleArmed();
      if (e.code === 'KeyR') setShooting(true);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };

    const handleKeyUp = (e) => {
      if (!isGameActive) return;
      keys[e.code] = false;
      if (e.code === 'KeyR') setShooting(false);
    };

    const handleBlur = () => setShooting(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    /* ── Mouse for killer mode ── */
    const handleMouseDown = (e) => {
      if (!isKillerMode()) return;
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
      }
      if (e.button === 0) { mouseShooting = true; setShooting(true); }
    };
    const handleMouseUp = (e) => {
      if (e.button === 0 && mouseShooting) {
        mouseShooting = false;
        if (!keys['KeyR']) setShooting(false);
      }
    };
    const handleMouseMove = (e) => {
      if (!isKillerMode() || document.pointerLockElement !== renderer.domElement) return;
      camYaw -= e.movementX * TPS.SENS;
      camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * TPS.SENS, TPS.PITCH_MIN, TPS.PITCH_MAX);
    };
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      document.body.classList.toggle('pointer-locked', locked);
      if (!locked && mouseShooting) { mouseShooting = false; setShooting(false); }
    };

    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    /* ── Double click reset ── */
    const handleDoubleClick = () => {
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
      isShooting = false;
      applyWeaponActions(false);
      updateWeaponHud();
      clearBullets();
      isWalking = false;
      isPecking = false;
      isAttacking = false;
      isSitting = false;
      isTransitioningSit = false;
      wasAirborne = false;
      flyProgress = 0;
      velocity.set(0, 0, 0);
      if (pivot.children.length > 0) pivot.children[0].rotation.y = 0;
      if (activeCharData?.idleAction) activeCharData.idleAction.reset().fadeIn(0.2).play();
      const sitBadge = container.querySelector('#sit-badge');
      if (sitBadge) {
        sitBadge.classList.remove('active');
        const label = sitBadge.querySelector('.badge-label');
        if (label) label.textContent = 'Sentar';
      }
    };
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    /* ═══════════════════════════════════════
       HUD BUTTON EVENTS
    ═══════════════════════════════════════ */
    // These will be set up after container renders
    setTimeout(() => {
      const playKillerBtn = container.querySelector('#play-killer-btn');
      if (playKillerBtn) playKillerBtn.addEventListener('click', startKillerGame);

      const sitBadgeEl = container.querySelector('#sit-badge');
      if (sitBadgeEl) sitBadgeEl.addEventListener('click', () => { if (isGameActive) toggleSit(); });

      const peckBadgeEl = container.querySelector('#peck-badge');
      if (peckBadgeEl) peckBadgeEl.addEventListener('click', () => { if (isGameActive) performPeck(); });

      const attackBadgeEl = container.querySelector('#attack-badge');
      if (attackBadgeEl) attackBadgeEl.addEventListener('click', () => { if (isGameActive) performAttack(); });

      const danceBadgeEl = container.querySelector('#dance-badge');
      if (danceBadgeEl) danceBadgeEl.addEventListener('click', () => { if (isGameActive) toggleDance(); });

      const flyBadgeEl = container.querySelector('#fly-badge');
      if (flyBadgeEl) flyBadgeEl.addEventListener('click', () => {
        if (!isGameActive) return;
        if (!isFlying) enterFly(); else exitFly();
      });

      const armBadgeEl = container.querySelector('#arm-badge');
      if (armBadgeEl) armBadgeEl.addEventListener('click', toggleArmed);

      const shootBadgeEl = container.querySelector('#shoot-badge');
      if (shootBadgeEl) {
        shootBadgeEl.addEventListener('pointerdown', () => setShooting(true));
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
          shootBadgeEl.addEventListener(ev, () => setShooting(false))
        );
      }

      const changeCharBadgeEl = container.querySelector('#change-char-badge');
      if (changeCharBadgeEl) changeCharBadgeEl.addEventListener('click', openCharacterSelect);
    }, 0);

    /* ═══════════════════════════════════════
       RESIZE
    ═══════════════════════════════════════ */
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    /* ═══════════════════════════════════════
       INIT: render grid & preload
    ═══════════════════════════════════════ */
    renderCharacterGrid();

    loadCharacter('stork', () => {
      const loadingOverlay = container.querySelector('.stork-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        setTimeout(() => {
          if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
        }, 700);
      }
    });
    loadCharacter('urubu');

    /* ═══════════════════════════════════════
       ANIMATION LOOP
    ═══════════════════════════════════════ */
    const clock = new THREE.Clock();
    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (activeCharData && activeCharData.mixer) {
        activeCharData.mixer.update(delta);
      }

      if (isKillerMode()) {
        const urubu = characterData.urubu;
        if (!vultures.hasSource() && urubu?.isLoaded) vultures.setSource(urubu.model, urubu.rawClips);
        _playerBody.copy(pivot.position);
        _playerBody.y += PLAYER_BODY_HEIGHT;
        vultures.update(delta, {
          playerPos: pivot.position,
          playerBody: _playerBody,
          playerAirborne: isFlying || pivot.position.y > 0.15,
        });
      }

      updateBullets(delta);
      blood.update(delta);

      if (isGameActive && activeCharData) {
        const spaceNow = !!keys['Space'];
        if (spaceNow && !spacePrev) {
          if (!isFlying) enterFly(); else exitFly();
        }
        spacePrev = spaceNow;

        const flyTarget = isFlying ? 1 : 0;
        flyProgress += (flyTarget - flyProgress) * Math.min(delta * 2.0, 1);

        const targetAltitude = GROUND_Y + flyProgress * FLY_TARGET_Y;
        pivot.position.y += (targetAltitude - pivot.position.y) * Math.min(delta * 2.5, 1);

        const modelCenterY = pivot.position.y + 1.5;
        controls.target.y += (modelCenterY - controls.target.y) * 0.08;

        const isAirborne = pivot.position.y > 0.08 || flyProgress > 0.03;
        if (isAirborne) {
          wasAirborne = true;
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

        const movingAnyNow = !isFlying && (
          !!keys['KeyW'] || !!keys['KeyS'] || !!keys['KeyA'] || !!keys['KeyD'] ||
          !!keys['ArrowUp'] || !!keys['ArrowDown'] || !!keys['ArrowLeft'] || !!keys['ArrowRight']
        );

        if (movingAnyNow && isSitting && !isTransitioningSit) standUp();

        if (movingAnyNow && !isWalking && !isSitting) {
          isWalking = true;
          stopDance();
          if (activeCharData.idleAction) activeCharData.idleAction.fadeOut(0.15);
          if (activeCharData.walkAction && !isPecking) {
            activeCharData.walkAction.reset().fadeIn(0.15).play();
          }
        } else if (!movingAnyNow && isWalking) {
          isWalking = false;
          if (activeCharData.walkAction) activeCharData.walkAction.fadeOut(0.2);
          if (activeCharData.idleAction && !isPecking && !isFlying && !isSitting) {
            activeCharData.idleAction.reset().fadeIn(0.25).play();
          }
        }

        if (isWalking && activeCharData.walkAction && activeCharData.walkAction.isRunning()) {
          const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
          const targetScale = Math.max(0.7, Math.min(1.4, (speed2d / MOVE_SPEED) * 1.1));
          activeCharData.walkAction.timeScale = targetScale;
        }

        const speed = MOVE_SPEED + flyProgress * (FLY_SPEED - MOVE_SPEED);
        camera.getWorldDirection(camFwd);
        if (!isFlying || flyProgress < 0.5) camFwd.y = 0;
        camFwd.normalize();
        camRight.crossVectors(camFwd, camera.up).normalize();

        targetVel.set(0, 0, 0);
        if (keys['ArrowLeft'] || keys['KeyA']) targetVel.addScaledVector(camRight, -speed);
        if (keys['ArrowRight'] || keys['KeyD']) targetVel.addScaledVector(camRight, speed);
        if (keys['ArrowUp'] || keys['KeyW']) targetVel.addScaledVector(camFwd, speed);
        if (keys['ArrowDown'] || keys['KeyS']) targetVel.addScaledVector(camFwd, -speed);

        if (isFlying) {
          if (keys['ShiftLeft'] || keys['ShiftRight']) targetVel.y += speed * 0.6;
          if (keys['ControlLeft'] || keys['ControlRight']) targetVel.y -= speed * 0.6;
        }

        velocity.lerp(targetVel, 0.12);

        const moveLen = velocity.lengthSq();
        if (moveLen > 1e-8) {
          const hMove = new THREE.Vector3(velocity.x, 0, velocity.z);
          pivot.position.x += velocity.x;
          pivot.position.z += velocity.z;
          controls.target.x += velocity.x;
          controls.target.z += velocity.z;

          if (pivot.children.length > 0 && hMove.lengthSq() > 1e-6 && !(isKillerMode() && isArmed)) {
            const angle = Math.atan2(hMove.x, hMove.z);
            pivot.children[0].rotation.y = lerpAngle(pivot.children[0].rotation.y, angle, 0.15);
          }
        }

        if (isKillerMode() && isArmed && pivot.children.length > 0) {
          const aimYaw = camYaw + Math.PI;
          pivot.children[0].rotation.y = lerpAngle(pivot.children[0].rotation.y, aimYaw, Math.min(1, delta * 12));
        }
      } else {
        velocity.set(0, 0, 0);
      }

      // Tilt model in flight
      if (pivot.children.length > 0) {
        const mdl = pivot.children[0];
        const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
        const tiltTarget = isFlying ? -speed2d * 4.0 : 0;
        mdl.rotation.x += (tiltTarget - mdl.rotation.x) * 0.08;

        if (!activeCharData?.flyAction) {
          if (flyProgress > 0.1) {
            flyTimeAccum += delta;
            const bob = Math.sin(flyTimeAccum * FLAP_FREQ_FLY * 0.5) * 0.04 * flyProgress;
            mdl.position.y += (bob - (mdl._lastBob || 0));
            mdl._lastBob = bob;
          } else {
            if (mdl._lastBob) { mdl.position.y -= mdl._lastBob; mdl._lastBob = 0; }
          }
        }
      }

      // Procedural wing flap (fallback)
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

      // Shadow follows model
      keyLight.position.x = pivot.position.x + 5;
      keyLight.position.z = pivot.position.z + 6;
      keyLight.target.position.copy(pivot.position);
      keyLight.target.updateMatrixWorld();

      // Particles
      for (let i = 0; i < N; i++) {
        pPos[i * 3 + 1] += 0.003 + flyProgress * 0.005;
        if (pPos[i * 3 + 1] > 14) {
          pPos[i * 3] = (Math.random() - 0.5) * 28;
          pPos[i * 3 + 1] = 0;
          pPos[i * 3 + 2] = (Math.random() - 0.5) * 28;
        }
      }
      pGeo.attributes.position.needsUpdate = true;

      if (isKillerMode()) updateThirdPersonCamera();
      else controls.update();
      renderer.render(scene, camera);
    };

    animate();

    /* ═══════════════════════════════════════
       CLEANUP
    ═══════════════════════════════════════ */
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);

      if (document.pointerLockElement) document.exitPointerLock();
      document.body.classList.remove('killer-mode', 'pointer-locked');

      vultures.clear();
      blood.clear();

      if (activeCharData?.mixer) activeCharData.mixer.stopAllAction();
      renderer.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      bulletGeo.dispose();
      bulletMat.dispose();
      pGeo.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="stork-killer-3d-wrapper" ref={containerRef}>
      {/* Loading Overlay */}
      <div className="stork-loading-overlay">
        <div className="stork-loader-ring"></div>
        <p>Carregando modelo…</p>
      </div>

      {/* Character Selection Screen */}
      <div id="char-select-screen" className="char-select-overlay">
        <div className="char-select-backdrop"></div>
        <div className="char-select-container">
          <div className="char-select-header">
            <div className="game-tag">
              <span className="game-tag-dot"></span>
              StorKiller 3D
            </div>
            <button id="play-killer-btn" className="play-killer-btn" type="button">
              <span className="play-killer-icon">&#9654;</span>
              <span>Jogar Cegonha Killer</span>
            </button>
            <p className="play-killer-sub">Terceira pessoa com AK-47 &middot; urubus atacando</p>
            <h1 className="char-select-title">Com quem você quer jogar?</h1>
            <p className="char-select-subtitle">Ou escolha um personagem para explorar no visualizador 3D</p>
          </div>
          <div className="char-grid" id="char-grid"></div>
          <div className="char-select-footer">
            <p>Mais personagens serão desbloqueados em futuras atualizações!</p>
          </div>
        </div>
      </div>

      {/* Title */}
      <div id="title" className="hud-layer hidden">
        <h1>StorKiller</h1>
        <p id="char-active-subtitle">Visualizador 3D &middot; Cegonha</p>
      </div>

      {/* Killer Mode HUD */}
      <div id="crosshair" className="killer-only"></div>
      <div id="damage-flash"></div>
      <div id="killer-hud" className="killer-only">
        <div className="killer-stat">
          <span className="killer-stat-label">Urubus abatidos</span>
          <span id="kill-count">0</span>
        </div>
        <div className="killer-stat">
          <span className="killer-stat-label">Ataques sofridos</span>
          <span id="damage-count">0</span>
        </div>
      </div>
      <div id="lock-hint" className="killer-only">
        Clique na tela para controlar a câmera com o mouse
        <small>Botão esquerdo atira &middot; Esc solta o mouse</small>
      </div>

      {/* Fly Status */}
      <div id="fly-status" className="hud-layer">
        <div className="dot"></div>
        <span>Modo Voo</span>
      </div>

      {/* HUD Controls */}
      <div id="hud" className="hud-layer hidden">
        <div className="badge badge-interactive" id="change-char-badge" title="Trocar Personagem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          &nbsp;Trocar Personagem
        </div>
        <div className="badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="7" />
            <line x1="12" y1="2" x2="12" y2="10" />
          </svg>
          <span className="viewer-only">Arrastar orbitar &nbsp;&middot;&nbsp; Scroll zoom</span>
          <span className="killer-only">Mouse olha em volta &nbsp;&middot;&nbsp; Clique atira</span>
        </div>
        <div className="badge">
          <div className="keys">
            <div className="key">&#8592;</div>
            <div className="key">&#8594;</div>
            <div className="key">&#8593;</div>
            <div className="key">&#8595;</div>
          </div>
          &nbsp;Mover
        </div>
        <div className="badge" id="fly-badge">
          <div className="keys">
            <div className="key space">SPACE</div>
          </div>
          &nbsp;Voar / Pousar
        </div>
        <div className="badge badge-interactive" id="peck-badge" title="Dar Bicada (no ar ou no chão)">
          <div className="keys">
            <div className="key">E</div>
          </div>
          &nbsp;Bicar
        </div>
        <div className="badge badge-interactive" id="attack-badge" title="Ataque Aéreo / Bote em Voo">
          <div className="keys">
            <div className="key">Q</div>
          </div>
          &nbsp;Ataque
        </div>
        <div className="badge badge-interactive" id="arm-badge" title="Pegar / Soltar a AK-47">
          <div className="keys">
            <div className="key">G</div>
          </div>
          &nbsp;<span className="badge-label">Pegar Arma</span>
        </div>
        <div className="badge badge-interactive" id="shoot-badge" title="Atirar (segure)">
          <div className="keys">
            <div className="key">R</div>
          </div>
          &nbsp;Atirar
        </div>
        <div className="badge badge-interactive" id="sit-badge" title="Sentar / Levantar (no chão)">
          <div className="keys">
            <div className="key">X</div>
          </div>
          &nbsp;<span className="badge-label">Sentar</span>
        </div>
        <div className="badge" id="dance-badge">
          <div className="keys">
            <div className="key">C</div>
          </div>
          &nbsp;Dançar
        </div>
        <div className="badge viewer-only">
          2&times; clique &rarr; reset
        </div>
      </div>
    </div>
  );
};

export default StorkKiller3D;
