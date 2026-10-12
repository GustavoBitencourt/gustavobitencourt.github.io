import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './StorkKiller3D.css';

const StorkKiller3D = () => {
  const containerRef = useRef(null);
  const [loadingText, setLoadingText] = useState('Carregando modelo…');
  const [isLoading, setIsLoading] = useState(true);
  const [isFlyingState, setIsFlyingState] = useState(false);
  const [isDancingState, setIsDancingState] = useState(false);

  // Refs for functions accessible from outside the animation loop
  const toggleFlyRef = useRef(null);
  const toggleDanceRef = useRef(null);

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
       SCENE & ENVIRONMENT
    ═══════════════════════════════════════ */
    const scene = new THREE.Scene();

    // Gradient sky
    const bgGeo = new THREE.SphereGeometry(80, 32, 32);
    const bgMat = new THREE.ShaderMaterial({
      uniforms: {
        colorTop: { value: new THREE.Color('#0d0d1f') },
        colorBottom: { value: new THREE.Color('#050510') },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }
      `,
      fragmentShader: `
        varying vec3 vPos; uniform vec3 colorTop, colorBottom;
        void main(){
          float t = clamp((vPos.y + 80.0)/160.0, 0.0, 1.0);
          gl_FragColor = vec4(mix(colorBottom, colorTop, t), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    const skyMesh = new THREE.Mesh(bgGeo, bgMat);
    scene.add(skyMesh);

    scene.fog = new THREE.FogExp2(0x070714, 0.022);

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
    controls.update();

    /* ═══════════════════════════════════════
       LIGHTS
    ═══════════════════════════════════════ */
    const ambientLight = new THREE.AmbientLight(0x8888cc, 0.6);
    scene.add(ambientLight);

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
    const floorGeo = new THREE.CircleGeometry(18, 80);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.3, roughness: 0.7 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(28, 36, 0x3333aa, 0x1a1a3a);
    grid.position.y = 0.001;
    scene.add(grid);

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
    const pMat = new THREE.PointsMaterial({
      color: 0xaabbff,
      size: 0.04,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    /* ═══════════════════════════════════════
       PIVOT & STATE
    ═══════════════════════════════════════ */
    const pivot = new THREE.Group();
    scene.add(pivot);

    const GROUND_Y = 0;
    const FLY_TARGET_Y = 4.5;
    const MOVE_SPEED = 0.048;
    const FLY_SPEED = 0.06;

    let isFlying = false;
    let flyProgress = 0;
    let flyTimeAccum = 0;

    const wingBones = [];
    let flapTime = 0;
    const FLAP_FREQ_FLY = 3.8;

    let mixer = null;
    let danceAction = null;
    let danceKeyAction = null;
    let walkStartAction = null;
    let walkLoopAction = null;
    let walkEndAction = null;
    let caindoAction = null;

    let isDancing = false;
    let isMovingForward = false;
    let isMovingAny = false;
    let wasAirborne = false;

    const velocity = new THREE.Vector3();
    const targetVel = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    const camRight = new THREE.Vector3();

    /* ═══════════════════════════════════════
       LOAD MODEL
    ═══════════════════════════════════════ */
    const loader = new GLTFLoader();
    const modelUrl = `${process.env.PUBLIC_URL || ''}/assets/models/model.glb`;

    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Scale & center
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 3.0 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));

        // Sit on floor
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y -= box2.min.y;

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        pivot.add(model);

        // Detect wing bones / meshes
        const wingKeywords = ['wing', 'asa', 'feather', 'pena', 'flap'];
        model.traverse((child) => {
          const name = child.name.toLowerCase();
          if (wingKeywords.some((k) => name.includes(k))) {
            let side = 1;
            if (name.includes('left') || name.includes('esq')) {
              side = -1;
            } else if (name.includes('right') || name.includes('dir')) {
              side = 1;
            } else {
              const childBox = new THREE.Box3().setFromObject(child);
              const childCenter = childBox.getCenter(new THREE.Vector3());
              side = childCenter.z >= 0 ? 1 : -1;
            }

            wingBones.push({
              obj: child,
              side: side,
              restRotX: child.rotation.x,
              restRotY: child.rotation.y,
              restRotZ: child.rotation.z,
            });
          }
        });

        // Animations
        mixer = new THREE.AnimationMixer(model);

        if (gltf.animations && gltf.animations.length > 0) {
          gltf.animations.forEach((clip) => {
            const n = clip.name.toLowerCase();

            if (n.includes('dance') && !n.includes('key')) {
              danceAction = mixer.clipAction(clip);
              danceAction.setLoop(THREE.LoopRepeat);
            } else if (n.includes('dance') && n.includes('key')) {
              danceKeyAction = mixer.clipAction(clip);
              danceKeyAction.setLoop(THREE.LoopRepeat);
            } else if (n === 'walkstart' || n.includes('walkstart')) {
              walkStartAction = mixer.clipAction(clip);
              walkStartAction.setLoop(THREE.LoopOnce, 1);
              walkStartAction.clampWhenFinished = true;
            } else if (n === 'walkloop' || n.includes('walkloop')) {
              walkLoopAction = mixer.clipAction(clip);
              walkLoopAction.setLoop(THREE.LoopRepeat);
            } else if (n === 'walkend' || n.includes('walkend')) {
              walkEndAction = mixer.clipAction(clip);
              walkEndAction.setLoop(THREE.LoopOnce, 1);
              walkEndAction.clampWhenFinished = true;
            } else if (n.includes('caindo')) {
              caindoAction = mixer.clipAction(clip);
              caindoAction.setLoop(THREE.LoopOnce, 1);
              caindoAction.clampWhenFinished = true;
            }
          });

          mixer.addEventListener('finished', (e) => {
            if (e.action === walkStartAction) {
              if (isMovingForward && walkLoopAction) {
                walkLoopAction.reset().fadeIn(0.2).play();
                walkStartAction.fadeOut(0.2);
              }
            } else if (e.action === walkEndAction) {
              walkEndAction.fadeOut(0.25);
            } else if (e.action === caindoAction) {
              caindoAction.fadeOut(0.35);
            }
          });
        }

        setIsLoading(false);
      },
      (xhr) => {
        if (xhr.total) {
          setLoadingText(`Carregando modelo… ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
        }
      },
      (err) => {
        console.error('Erro ao carregar modelo:', err);
        setLoadingText('Erro ao carregar o modelo 3D.');
      }
    );

    /* ═══════════════════════════════════════
       ACTIONS & HANDLERS
    ═══════════════════════════════════════ */
    const keys = {};
    let spacePrev = false;

    function stopDance() {
      if (!isDancing && !danceAction?.isRunning()) return;
      isDancing = false;
      setIsDancingState(false);
      if (danceAction) danceAction.fadeOut(0.25);
      if (danceKeyAction) danceKeyAction.fadeOut(0.25);
    }

    function toggleDance() {
      if (!danceAction) return;
      isDancing = !isDancing;
      setIsDancingState(isDancing);

      if (isDancing) {
        if (caindoAction) caindoAction.fadeOut(0.2);
        if (walkStartAction) walkStartAction.stop();
        if (walkLoopAction) walkLoopAction.stop();
        if (walkEndAction) walkEndAction.stop();
        isMovingForward = false;
        isMovingAny = false;

        danceAction.reset().fadeIn(0.25).play();
        if (danceKeyAction) danceKeyAction.reset().fadeIn(0.25).play();
      } else {
        stopDance();
      }
    }

    function triggerLanding() {
      if (caindoAction) {
        caindoAction.reset().fadeIn(0.12).play();
      }
    }

    function enterFly() {
      isFlying = true;
      setIsFlyingState(true);
      flyTimeAccum = 0;
      stopDance();
      if (caindoAction) caindoAction.fadeOut(0.2);
      if (walkStartAction) walkStartAction.stop();
      if (walkLoopAction) walkLoopAction.stop();
      if (walkEndAction) walkEndAction.stop();
      isMovingForward = false;
      isMovingAny = false;

      controls.maxPolarAngle = Math.PI * 0.85;
    }

    function exitFly() {
      isFlying = false;
      setIsFlyingState(false);
      controls.maxPolarAngle = Math.PI / 2 + 0.15;
    }

    function toggleFly() {
      if (!isFlying) enterFly();
      else exitFly();
    }

    // Expose toggle functions to component state
    toggleFlyRef.current = toggleFly;
    toggleDanceRef.current = toggleDance;

    /* ── Reset on double click ── */
    const handleDoubleClick = () => {
      pivot.position.set(0, 0, 0);
      controls.target.set(0, 1, 0);
      controls.reset();
      if (isFlying) exitFly();
      stopDance();
      if (caindoAction) caindoAction.stop();
      if (walkStartAction) walkStartAction.stop();
      if (walkLoopAction) walkLoopAction.stop();
      if (walkEndAction) walkEndAction.stop();
      isMovingForward = false;
      isMovingAny = false;
      wasAirborne = false;
      flyProgress = 0;
      velocity.set(0, 0, 0);
      if (pivot.children.length > 0) pivot.children[0].rotation.y = 0;
    };

    const handleKeyDown = (e) => {
      keys[e.code] = true;
      if (e.code === 'KeyC' || e.key === 'c' || e.key === 'C') {
        toggleDance();
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

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
       ANIMATION LOOP
    ═══════════════════════════════════════ */
    const clock = new THREE.Clock();
    let animationFrameId;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (mixer) mixer.update(delta);

      // Toggle fly on Space
      const spaceNow = !!keys['Space'];
      if (spaceNow && !spacePrev) {
        if (!isFlying) enterFly();
        else exitFly();
      }
      spacePrev = spaceNow;

      // Fly progress
      const flyTarget = isFlying ? 1 : 0;
      flyProgress += (flyTarget - flyProgress) * Math.min(delta * 2.0, 1);

      // Altitude
      const targetAltitude = GROUND_Y + flyProgress * FLY_TARGET_Y;
      pivot.position.y += (targetAltitude - pivot.position.y) * Math.min(delta * 2.5, 1);

      // Orbit target
      const modelCenterY = pivot.position.y + 1.5;
      controls.target.y += (modelCenterY - controls.target.y) * 0.08;

      // Landing detection
      const isAirborne = pivot.position.y > 0.08 || flyProgress > 0.03;
      if (isAirborne) {
        wasAirborne = true;
      } else if (wasAirborne && !isAirborne) {
        wasAirborne = false;
        triggerLanding();
      }

      // Walking state machine
      const movingForwardNow = !isFlying && (!!keys['KeyW'] || !!keys['ArrowUp']);
      const movingAnyNow = !isFlying && (
        !!keys['KeyW'] || !!keys['KeyS'] || !!keys['KeyA'] || !!keys['KeyD'] ||
        !!keys['ArrowUp'] || !!keys['ArrowDown'] || !!keys['ArrowLeft'] || !!keys['ArrowRight']
      );

      if (movingForwardNow && !isMovingForward) {
        isMovingForward = true;
        isMovingAny = true;
        stopDance();
        if (caindoAction) caindoAction.fadeOut(0.2);

        if (walkStartAction) {
          if (walkEndAction) walkEndAction.stop();
          if (walkLoopAction) walkLoopAction.stop();
          walkStartAction.reset().fadeIn(0.12).play();
        } else if (walkLoopAction) {
          walkLoopAction.reset().fadeIn(0.15).play();
        }
      } else if (!movingForwardNow && isMovingForward) {
        isMovingForward = false;
        if (walkStartAction) walkStartAction.fadeOut(0.18);
        if (walkLoopAction) walkLoopAction.fadeOut(0.18);

        if (!movingAnyNow) {
          isMovingAny = false;
          if (walkEndAction) {
            walkEndAction.reset().fadeIn(0.15).play();
          }
        }
      }

      if (!movingForwardNow && movingAnyNow && !isMovingAny) {
        isMovingAny = true;
        stopDance();
        if (caindoAction) caindoAction.fadeOut(0.2);
        if (walkLoopAction) walkLoopAction.reset().fadeIn(0.2).play();
      } else if (!movingAnyNow && isMovingAny && !isMovingForward) {
        isMovingAny = false;
        if (walkLoopAction) walkLoopAction.fadeOut(0.2);
        if (walkEndAction) walkEndAction.reset().fadeIn(0.15).play();
      }

      // Movement
      const speed = MOVE_SPEED + flyProgress * (FLY_SPEED - MOVE_SPEED);

      camera.getWorldDirection(camFwd);
      if (!isFlying || flyProgress < 0.5) {
        camFwd.y = 0;
      }
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

        if (pivot.children.length > 0 && hMove.lengthSq() > 1e-6) {
          const angle = Math.atan2(hMove.x, hMove.z);
          pivot.children[0].rotation.y += (angle - pivot.children[0].rotation.y) * 0.15;
        }
      }

      // Tilt model in flight
      if (pivot.children.length > 0) {
        const mdl = pivot.children[0];
        const speed2d = new THREE.Vector2(velocity.x, velocity.z).length();
        const tiltTarget = isFlying ? -speed2d * 4.0 : 0;
        mdl.rotation.x += (tiltTarget - mdl.rotation.x) * 0.08;

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

      // Procedural wing flap
      if (wingBones.length > 0 && flyProgress > 0.05) {
        flapTime += delta * FLAP_FREQ_FLY * flyProgress;

        wingBones.forEach((w) => {
          const amp = 0.23 * flyProgress;
          const flapY = Math.sin(flapTime) * amp + 0.04 * flyProgress;
          const tiltUp = (0.13 + 0.02 * Math.sin(flapTime)) * flyProgress;

          w.obj.rotation.y = w.restRotY + flapY * w.side;
          w.obj.rotation.x = w.restRotX - tiltUp * w.side;
          w.obj.rotation.z = w.restRotZ;
        });
      } else if (wingBones.length > 0 && flyProgress <= 0.05) {
        wingBones.forEach((w) => {
          w.obj.rotation.y += (w.restRotY - w.obj.rotation.y) * 0.1;
          w.obj.rotation.x += (w.restRotX - w.obj.rotation.x) * 0.1;
          w.obj.rotation.z += (w.restRotZ - w.obj.rotation.z) * 0.1;
        });
      }

      // Shadow following model
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

      controls.update();
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
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);

      if (mixer) mixer.stopAllAction();
      renderer.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      pGeo.dispose();
      pMat.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleToggleFly = useCallback(() => {
    if (toggleFlyRef.current) toggleFlyRef.current();
  }, []);

  const handleToggleDance = useCallback(() => {
    if (toggleDanceRef.current) toggleDanceRef.current();
  }, []);

  return (
    <div className="stork-killer-3d-wrapper">
      {/* 3D Canvas Container */}
      <div id="canvas-container" ref={containerRef}></div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="stork-loading-overlay">
          <div className="stork-loader-ring"></div>
          <p>{loadingText}</p>
        </div>
      )}

      {/* Top Header / Bar */}
      <div className="stork-top-bar">
        <div className="stork-title-group">
          <h1>StorKiller</h1>
          <p>Visualizador 3D &middot; Cegonha</p>
        </div>

        {/* Fly status indicator */}
        <div className={`stork-fly-status ${isFlyingState ? 'visible' : ''}`}>
          <div className="dot"></div>
          <span>Modo Voo</span>
        </div>
      </div>

      {/* HUD Controls */}
      <div className="stork-hud">
        <div className="badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="7" />
            <line x1="12" y1="2" x2="12" y2="10" />
          </svg>
          Arrastar orbitar &nbsp;&middot;&nbsp; Scroll zoom
        </div>

        <div className="badge">
          <div className="keys">
            <div className="key">&#8592;</div>
            <div className="key">&#8594;</div>
            <div className="key">&#8593;</div>
            <div className="key">&#8595;</div>
          </div>
          &nbsp;Mover (WASD)
        </div>

        <div
          className={`badge ${isFlyingState ? 'flying' : ''}`}
          id="fly-badge"
          onClick={handleToggleFly}
          title="Clique para voar ou pressione Barra de Espaço"
        >
          <div className="keys">
            <div className="key space">SPACE</div>
          </div>
          &nbsp;Voar / Pousar
        </div>

        <div
          className={`badge ${isDancingState ? 'active' : ''}`}
          id="dance-badge"
          onClick={handleToggleDance}
          title="Clique para dançar ou pressione tecla C"
        >
          <div className="keys">
            <div className="key">C</div>
          </div>
          &nbsp;Dançar
        </div>

        <div className="badge">
          2&times; clique &rarr; reset
        </div>
      </div>
    </div>
  );
};

export default StorkKiller3D;
