import * as THREE from 'three';
import { QUALITY, QUALITY_ORDER, VIEWS } from './config.js';
import { Turf } from './turf.js';
import { Environment } from './environment.js';
import { NoclipControls } from './controls.js';
import { buildUI } from './ui.js';

// Monta o visualizador dentro do componente React e devolve uma função que desmonta tudo.
// els: { root, stats, toast, views, onError }
// options: { quality } — 'auto', 'baixa', 'media', 'alta' ou 'ultra'
export function createFootballField(els, options = {}) {
  const { root } = els;
  // o canvas é criado aqui (e não pelo React) porque o contexto WebGL é descartado ao desmontar
  const canvas = document.createElement('canvas');
  canvas.className = 'ff-view';
  root.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    canvas.remove();
    els.onError?.();
    return () => {};
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 12000);

  const turf = new Turf(renderer);
  scene.add(turf.group);
  const env = new Environment(renderer, scene, turf);
  const controls = new NoclipControls(camera, canvas, root);
  controls.setPose(VIEWS[0].pos, VIEWS[0].look);

  // ---- estado ajustável pelo painel ----------------------------------------
  const state = {
    quality: 'auto',          // 'auto' ou um nível fixo
    level: 'alta',            // nível em uso
    cutMm: 25,
    pattern: 0,
    stripes: 0.35,
    lines: true,
    wind: 0.35,
    hour: 15.5,
    clouds: 0.3,
    exposure: 1,
    fov: 50,
    speed: 1,
  };
  const q = options.quality;
  if (q === 'auto' || QUALITY[q]) state.quality = q;
  if (state.quality !== 'auto') state.level = state.quality;

  let lowTime = 0;
  let wantShot = false;

  function applyExposure() {
    renderer.toneMappingExposure = env.exposure * state.exposure;
  }
  applyExposure();

  function resize() {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function applyLevel(level) {
    state.level = level;
    turf.setQuality(level);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[level].pixelRatio));
    resize();
  }

  const api = {
    state,
    setQuality(v) {
      state.quality = v;
      if (v !== 'auto') applyLevel(v);
      lowTime = 0;
    },
    setCut(mm) { state.cutMm = mm; turf.u.uCutH.value = mm / 1000; turf.bakeDirty = true; },
    setPattern(p) { state.pattern = p; turf.u.uPattern.value = p; turf.bakeDirty = true; },
    setStripes(v) { state.stripes = v; turf.u.uLeanMow.value = v; turf.bakeDirty = true; },
    setLines(v) { state.lines = v; turf.u.uShowLines.value = v ? 1 : 0; },
    setWind(v) { state.wind = v; turf.u.uWind.value = v; },
    setHour(v) { state.hour = v; env.params.hour = v; env.update(); applyExposure(); },
    setClouds(v) { state.clouds = v; env.params.clouds = v; env.update(); applyExposure(); },
    setExposure(v) { state.exposure = v; applyExposure(); },
    setFov(v) { state.fov = v; camera.fov = v; camera.updateProjectionMatrix(); },
    setSpeed(v) { state.speed = v; controls.speedMult = v; },
    goTo(i) { const v = VIEWS[i]; if (v) controls.flyTo(v.pos, v.look); },
    toggleLock() { controls.toggleLock(); },
    screenshot() { wantShot = true; },
  };

  window.addEventListener('resize', resize);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(root);

  applyLevel(state.level);
  const ui = buildUI(api, els);

  // ---- laço principal --------------------------------------------------------
  const size = new THREE.Vector2();
  let last = performance.now();
  let time = 0;
  let frames = 0;
  let fpsTime = 0;
  let fps = 60;
  let warm = 0;
  let firstFrame = true;
  let raf = 0;

  function renderFrame(dt) {
    time += dt;
    controls.update(dt);

    // plano próximo acompanha a altura: permite encostar a câmera na grama sem perder precisão ao longe
    const y = camera.position.y;
    const near = THREE.MathUtils.clamp(0.4 * (y - 0.04), 0.002, 1);
    if (Math.abs(near - camera.near) > near * 0.02) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }

    env.setTime(time);
    renderer.getDrawingBufferSize(size);
    turf.update(camera, time, size.y);
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 0.1);
    renderFrame(dt);

    if (firstFrame) {
      firstFrame = false;
      root.classList.add('ready');
    }
    if (wantShot) {
      wantShot = false;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `footballField-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }, 'image/png');
    }

    // medidor de fps e ajuste automático de qualidade
    frames++;
    fpsTime += raw;
    warm += raw;
    if (fpsTime >= 0.5) {
      fps = frames / fpsTime;
      frames = 0;
      fpsTime = 0;
      ui.setStats({ fps, blades: turf.visibleBlades, height: camera.position.y, level: state.level, auto: state.quality === 'auto' });
      if (state.quality === 'auto' && warm > 3 && raw < 0.5) {
        lowTime = fps < 30 ? lowTime + 0.5 : Math.max(0, lowTime - 0.25);
        const i = QUALITY_ORDER.indexOf(state.level);
        if (lowTime >= 2.5 && i > 0) {
          lowTime = 0;
          warm = 1;
          applyLevel(QUALITY_ORDER[i - 1]);
          ui.toast(`Qualidade ajustada para ${QUALITY[state.level].label} para manter a fluidez`);
        }
      }
    }
  }

  raf = requestAnimationFrame(frame);

  return function dispose() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    ro?.disconnect();
    ui.dispose();
    controls.dispose();
    env.dispose();
    turf.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    root.classList.remove('ready', 'clean', 'locked');
  };
}
