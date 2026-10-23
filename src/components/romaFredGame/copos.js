import * as THREE from 'three';

/*
 * Copo de kit da Xalassa: cada dinossauro derrubado dá um copo (o iconezinho voa da
 * cabeça do dino até o contador lá em cima). Com B o Romanele vira o copo, guti guti,
 * e joga no chão. O clipe "Beber" (copo_kit.glb) anima o esqueleto dele, o copo
 * ("Copo", relativo à raiz do Romanele) e o nível do líquido ("Liquido") juntos.
 */
export const DRINK_GULPS = [25, 32.3, 39.5, 46.8, 54, 61.3, 68.5, 75.8].map((f) => f / 24); // goles (s)
export const DRINK_IMPACTS = [{ t: 110 / 24, v: 1 }, { t: 116 / 24, v: 0.45 }];          // copo batendo no chão
const MAX_GROUND = 12;

export function createCopos({ model, gltf }) {
  const cupScene = gltf.scene;
  // o esqueleto do Romanele que veio no GLB só carrega o clipe: sai da cena
  const rig = cupScene.getObjectByName('Romanele_Rig');
  if (rig && rig.parent) rig.parent.remove(rig);
  const cupNode = cupScene.getObjectByName('Copo');
  const liquid = cupScene.getObjectByName('Liquido');
  cupScene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.name === 'Liquido') { m.transparent = true; m.opacity = 0.9; m.depthWrite = false; }
      if (m.name === 'CopoEstampa') { m.roughness = 0.25; m.metalness = 0.05; }
    }
  });
  cupScene.visible = false;
  model.add(cupScene);   // o clipe anima "Copo" relativo à raiz do Romanele
  const clip = gltf.animations.find((c) => c.name === 'Beber') || null;

  // copos largados no chão (só a casca, sem líquido)
  const shell = cupNode.getObjectByName('CopoMalha');
  const ground = [];
  const tmpM = new THREE.Matrix4(), ray = new THREE.Ray(), box = new THREE.Box3();
  function dropOnGround(scene, octree) {
    model.updateMatrixWorld(true);
    const c = shell.clone();
    tmpM.copy(shell.matrixWorld);
    c.matrixAutoUpdate = true;
    tmpM.decompose(c.position, c.quaternion, c.scale);
    scene.add(c);
    // o clipe assume chão plano na altura dos pés: acerta para o terreno de verdade
    if (octree) {
      ray.origin.set(c.position.x, c.position.y + 1.5, c.position.z); ray.direction.set(0, -1, 0);
      const h = octree.rayIntersect(ray);
      if (h && h.distance < 4) {
        c.updateMatrixWorld(true); box.setFromObject(c);
        c.position.y += (ray.origin.y - h.distance) - box.min.y;
      }
    }
    ground.push(c);
    while (ground.length > MAX_GROUND) { const o = ground.shift(); o.removeFromParent(); }
  }
  function clearGround() { for (const o of ground) o.removeFromParent(); ground.length = 0; }

  // no carro só a cabeça e o braço direito tocam o clipe; o copo vai preso na mão direita
  // (no clipe ele fica parado na mão do começo até o arremesso, então a relação é fixa)
  let handRel = null;
  const _m = new THREE.Matrix4(), _p = new THREE.Matrix4();
  function calibrate(handBone) {
    if (!clip || !handBone) return;
    const tmpMixer = new THREE.AnimationMixer(model);
    const a = tmpMixer.clipAction(clip); a.play(); tmpMixer.setTime(1.0);
    model.updateMatrixWorld(true);
    handRel = new THREE.Matrix4().copy(handBone.matrixWorld).invert().multiply(cupNode.matrixWorld);
    a.stop(); tmpMixer.uncacheRoot(model);
  }
  function followHand(handBone) {
    if (!handRel || !handBone) return;
    model.updateMatrixWorld(true);
    _m.multiplyMatrices(handBone.matrixWorld, handRel);
    _p.copy(cupNode.parent.matrixWorld).invert();
    _m.premultiply(_p).decompose(cupNode.position, cupNode.quaternion, cupNode.scale);
    cupNode.updateMatrixWorld(true);
  }

  // ── sons sintetizados: "plim" do copo chegando, goles e o copo batendo no chão ──
  let ctx = null;
  function unlock() {
    try { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { ctx = null; }
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function plim(n = 0) {
    if (!ctx) return; const t = ctx.currentTime;
    for (const [f, v] of [[1046 * (1 + n * 0.02), 0.16], [1568 * (1 + n * 0.02), 0.09]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
      env(g, t, 0.005, v, 0.28); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.35);
    }
  }
  function gulp(when = 0) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(85, t + 0.13);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    env(g, t, 0.012, 0.55, 0.15); o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
  }
  function clack(when = 0, vol = 1) {
    if (!ctx) return; const t = ctx.currentTime + when;
    const len = Math.floor(ctx.sampleRate * 0.09), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 1.4; g.gain.value = 0.5 * vol;
    s.connect(bp).connect(g).connect(ctx.destination); s.start(t);
  }
  const pending = [];   // sons agendados do gole/arremesso (para cancelar se interromper)
  function scheduleDrinkSounds() {
    cancelSounds();
    for (const t of DRINK_GULPS) pending.push(setTimeout(() => gulp(0), t * 1000));
    for (const i of DRINK_IMPACTS) pending.push(setTimeout(() => clack(0, i.v), i.t * 1000));
  }
  function cancelSounds() { while (pending.length) clearTimeout(pending.pop()); }

  return {
    cupScene, cupNode, liquid, clip,
    setHeld(v) { cupScene.visible = v; },
    dropOnGround, clearGround, unlock, plim, scheduleDrinkSounds, cancelSounds, calibrate, followHand,
    dispose() { cancelSounds(); clearGround(); try { if (ctx) ctx.close(); } catch (e) { /* nada */ } },
  };
}

/* ícone do copo voando da cabeça do dino até o contador (DOM, por cima do canvas) */
export function flyCupIcon({ from, toEl, src, layer, onArrive }) {
  const r = toEl.getBoundingClientRect();
  const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const img = document.createElement('img');
  img.src = src; img.alt = ''; img.className = 'rf-cupfly';
  img.style.left = `${from.x}px`; img.style.top = `${from.y}px`;
  layer.appendChild(img);
  const dx = tx - from.x, dy = ty - from.y;
  const anim = img.animate([
    { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
    { transform: 'translate(-50%, calc(-50% - 46px)) scale(1.15)', opacity: 1, offset: 0.22 },
    { transform: 'translate(-50%, calc(-50% - 46px)) scale(1.0)', opacity: 1, offset: 0.34 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.5)`, opacity: 1 },
  ], { duration: 820, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
  const done = () => { img.remove(); onArrive && onArrive(); };
  anim.onfinish = done;
  anim.oncancel = () => img.remove();
  return anim;
}
