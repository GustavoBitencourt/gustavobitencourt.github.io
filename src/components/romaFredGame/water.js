import * as THREE from 'three';

/*
 * Água interativa do rio da mata.
 *
 * Simulação de altura da superfície (equação da onda 2D) feita na GPU em duas
 * texturas que se alternam. Cada pixel cobre ~16 cm do rio; as margens refletem
 * as ondas (borda de Neumann) usando uma máscara desenhada a partir da própria
 * malha da água. Quem entra no rio (Romanele, dinossauros) empurra a água para
 * baixo onde está: andando isso vira esteira e ondas de proa, correndo levanta
 * respingos, e um pulo ou um dino tombando na água faz um splash.
 *
 * Uso:
 *   const water = createWater({ renderer, scene, mesh });
 *   water.update(dt, [{ key, x, y, z, r, vy, state }]);   // a cada quadro
 *   water.splash(x, z, força, raio);                       // impacto avulso
 */

const STEP = 1 / 120;          // passo fixo da simulação (s)
const MAX_STEPS = 6;           // no máximo 50 ms de simulação por quadro
const WAVE_SPEED = 1.5;        // m/s: ondulação em água rasa
const DAMP_TIME = 2.2;         // s para a onda perder ~63% da energia
const RESTORE = 0.9;           // puxa a superfície de volta ao nível (1/s²)
const MAX_SRC = 24;            // corpos + impactos simultâneos
const TEXEL = 0.16;            // m por pixel da simulação
const DROPS = 700;             // gotas de respingo
const PUSH = 2.2;              // quanto um corpo andando empurra a água (m/s² por m/s)

const QUAD_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const STEP_FS = /* glsl */`
uniform sampler2D uState;   // r = altura (m), g = velocidade vertical (m/s)
uniform sampler2D uMask;    // r = 1 dentro do rio
uniform vec2 uTexel, uCell, uOrigin, uSize;
uniform float uC2, uDt, uDamp, uRestore;
uniform vec4 uSrc[${MAX_SRC}];  // x, z (mundo), raio (m), aceleração (m/s², negativa empurra para baixo)
uniform int uSrcCount;
varying vec2 vUv;
float hAt(vec2 uv, float h0) { return texture2D(uMask, uv).r > 0.5 ? texture2D(uState, uv).r : h0; }
void main() {
  if (texture2D(uMask, vUv).r < 0.5) { gl_FragColor = vec4(0.0); return; }
  vec4 s = texture2D(uState, vUv);
  float h = s.r, v = s.g;
  float hl = hAt(vUv - vec2(uTexel.x, 0.0), h), hr = hAt(vUv + vec2(uTexel.x, 0.0), h);
  float hd = hAt(vUv - vec2(0.0, uTexel.y), h), hu = hAt(vUv + vec2(0.0, uTexel.y), h);
  float lap = (hl + hr - 2.0 * h) / (uCell.x * uCell.x) + (hd + hu - 2.0 * h) / (uCell.y * uCell.y);
  float a = uC2 * lap - uRestore * h;
  vec2 wp = uOrigin + vUv * uSize;
  for (int i = 0; i < ${MAX_SRC}; i++) {
    if (i >= uSrcCount) break;
    vec4 q = uSrc[i];
    // fonte de volume nulo: afunda sob o corpo e levanta a água deslocada em volta
    float r2 = dot(wp - q.xy, wp - q.xy) / (q.z * q.z);
    a += q.w * (exp(-r2) - 0.25 * exp(-0.25 * r2));
  }
  v = (v + a * uDt) * uDamp;
  h = clamp(h + v * uDt, -0.5, 0.5);
  gl_FragColor = vec4(h, v, 0.0, 1.0);
}`;

const MASK_VS = /* glsl */`
uniform vec2 uOrigin, uSize;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = vec4((w.xz - uOrigin) / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;
const MASK_FS = /* glsl */`void main() { gl_FragColor = vec4(1.0); }`;

export function createWater({ renderer, scene, mesh }) {
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const level = (box.min.y + box.max.y) / 2;
  const pad = 1;
  const origin = new THREE.Vector2(box.min.x - pad, box.min.z - pad);
  const size = new THREE.Vector2(box.max.x - box.min.x + 2 * pad, box.max.z - box.min.z + 2 * pad);
  const W = Math.min(2048, Math.ceil(size.x / TEXEL));
  const H = Math.min(1024, Math.ceil(size.y / TEXEL));
  const cell = new THREE.Vector2(size.x / W, size.y / H);

  const rtOpts = {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
  };
  let rtA = new THREE.WebGLRenderTarget(W, H, rtOpts);
  let rtB = new THREE.WebGLRenderTarget(W, H, rtOpts);
  const rtMask = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene(); quadScene.add(quad);

  // máscara: a própria malha do rio vista de cima
  const maskMat = new THREE.ShaderMaterial({
    vertexShader: MASK_VS, fragmentShader: MASK_FS, side: THREE.DoubleSide,
    uniforms: { uOrigin: { value: origin }, uSize: { value: size } },
  });
  const maskMesh = new THREE.Mesh(mesh.geometry, maskMat);
  maskMesh.matrixAutoUpdate = false; maskMesh.matrix.copy(mesh.matrixWorld); maskMesh.matrixWorld.copy(mesh.matrixWorld);
  maskMesh.frustumCulled = false;
  const maskScene = new THREE.Scene(); maskScene.add(maskMesh);

  const stepMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VS, fragmentShader: STEP_FS,
    uniforms: {
      uState: { value: null }, uMask: { value: rtMask.texture },
      uTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uCell: { value: cell },
      uOrigin: { value: origin }, uSize: { value: size },
      uC2: { value: WAVE_SPEED * WAVE_SPEED }, uDt: { value: STEP },
      uDamp: { value: Math.exp(-STEP / DAMP_TIME) }, uRestore: { value: RESTORE },
      uSrc: { value: Array.from({ length: MAX_SRC }, () => new THREE.Vector4()) }, uSrcCount: { value: 0 },
    },
  });

  function renderTo(target, sceneToDraw, camera) {
    const prev = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(target);
    renderer.render(sceneToDraw, camera);
    renderer.setRenderTarget(prev);
    renderer.autoClear = prevAuto;
  }
  function clear(target) {
    const prev = renderer.getRenderTarget(); const cc = renderer.getClearColor(new THREE.Color()); const ca = renderer.getClearAlpha();
    renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(true, false, false);
    renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
  }
  clear(rtA); clear(rtB); clear(rtMask);
  renderTo(rtMask, maskScene, quadCam);
  quad.material = stepMat;

  /* ── material da água: altura e normais vêm da simulação ── */
  const mat = mesh.material;
  if (!mesh.geometry.attributes.flowUv && mesh.geometry.attributes.uv) mesh.geometry.setAttribute('flowUv', mesh.geometry.attributes.uv);
  mat.transparent = true; mat.depthWrite = false; mat.roughness = 0.08; mat.metalness = 0;
  const shared = {
    uWaterState: { value: rtA.texture }, uWaterOrigin: { value: origin }, uWaterSize: { value: size },
    uWaterTexel: { value: new THREE.Vector2(1 / W, 1 / H) }, uWaterCell: { value: cell }, uWaterTime: { value: 0 },
    uSkyTop: { value: new THREE.Color(0x6f9fd8) }, uSkyHorizon: { value: new THREE.Color(0xc7d6d8) },
    uSunDir: { value: new THREE.Vector3(-0.47, 0.79, -0.39).normalize() },
  };
  const COMMON = /* glsl */`
uniform sampler2D uWaterState;
uniform vec2 uWaterOrigin, uWaterSize, uWaterTexel, uWaterCell;
uniform float uWaterTime;
// ondulação de fundo: o rio corre ao longo de flowUv.x (metros)
float ambientH(vec2 f, vec2 w) {
  float t = uWaterTime;
  return 0.010 * sin(f.x * 1.9 - t * 2.1 + sin(f.y * 6.0) * 0.6)
       + 0.006 * sin(f.x * 3.7 + f.y * 11.0 - t * 3.3)
       + 0.004 * sin(w.x * 2.9 - w.y * 3.4 + t * 1.7);
}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nattribute vec2 flowUv;\nvarying vec3 vWaterW;\nvarying vec2 vFlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wW = modelMatrix * vec4(transformed, 1.0);
        vec2 wUv = (wW.xz - uWaterOrigin) / uWaterSize;
        vec2 fl = flowUv * vec2(1.0, 10.0); // x já em metros ao longo do rio
        transformed.y += texture2D(uWaterState, wUv).r + ambientH(fl, wW.xz);
        vWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vFlow = fl;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nvarying vec3 vWaterW;\nvarying vec2 vFlow;\nuniform vec3 uSkyTop, uSkyHorizon, uSunDir;\nvec3 waterN; float waterFoam;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 uv = (vWaterW.xz - uWaterOrigin) / uWaterSize;
          vec4 s = texture2D(uWaterState, uv);
          float hl = texture2D(uWaterState, uv - vec2(uWaterTexel.x, 0.0)).r, hr = texture2D(uWaterState, uv + vec2(uWaterTexel.x, 0.0)).r;
          float hd = texture2D(uWaterState, uv - vec2(0.0, uWaterTexel.y)).r, hu = texture2D(uWaterState, uv + vec2(0.0, uWaterTexel.y)).r;
          float e = 0.05;
          float ax = (ambientH(vFlow, vWaterW.xz + vec2(e, 0.0)) - ambientH(vFlow, vWaterW.xz - vec2(e, 0.0))) / (2.0 * e);
          float az = (ambientH(vFlow + vec2(e, 0.0), vWaterW.xz) - ambientH(vFlow - vec2(e, 0.0), vWaterW.xz)) / (2.0 * e);
          vec2 g = vec2((hr - hl) / (2.0 * uWaterCell.x), (hu - hd) / (2.0 * uWaterCell.y));
          // as normais exageram a inclinação (ondas de poucos cm precisam aparecer de longe)
          waterN = normalize(vec3(-(g.x * 3.0 + ax * 1.6), 1.0, -(g.y * 3.0 + az * 1.6)));
          float slope = length(g);
          waterFoam = clamp(smoothstep(0.10, 0.35, abs(s.g)) * 0.7 + smoothstep(0.10, 0.30, slope) * 0.6 + smoothstep(0.03, 0.08, s.r), 0.0, 1.0);
          // crista mais clara, vale mais escuro
          diffuseColor.rgb *= clamp(1.0 + s.r * 5.0, 0.6, 1.5);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.92, 0.93), waterFoam * 0.8);
          diffuseColor.a = mix(diffuseColor.a, 0.95, waterFoam);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 V = normalize(cameraPosition - vWaterW);
          vec3 R = reflect(-V, waterN);
          float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(waterN, V), 0.0, 1.0), 5.0);
          vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
          outgoingLight = mix(outgoingLight, sky, fres * (1.0 - waterFoam * 0.7));
          float glint = pow(max(dot(R, uSunDir), 0.0), 220.0);
          outgoingLight += vec3(1.0, 0.95, 0.85) * glint * 2.5 * (1.0 - waterFoam);
          diffuseColor.a = mix(diffuseColor.a, 1.0, fres * 0.8);
        }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rio-interativo';
  mat.needsUpdate = true;
  mesh.frustumCulled = false; // a altura muda na GPU

  /* ── gotas de respingo ── */
  const dropPos = new Float32Array(DROPS * 3);
  const dropVel = new Float32Array(DROPS * 3);
  const dropLife = new Float32Array(DROPS);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dotCanvas = document.createElement('canvas'); dotCanvas.width = dotCanvas.height = 32;
  const dctx = dotCanvas.getContext('2d');
  const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad; dctx.fillRect(0, 0, 32, 32);
  const dotTex = new THREE.CanvasTexture(dotCanvas);
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
    color: 0xe4f1f2, size: 0.08, map: dotTex, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false,
  }));
  drops.frustumCulled = false; drops.name = 'RespingosAgua';
  for (let i = 0; i < DROPS; i++) dropPos[i * 3 + 1] = -9999;
  scene.add(drops);
  let dropNext = 0;
  function spray(x, z, n, speed, vx = 0, vz = 0) {
    for (let k = 0; k < n; k++) {
      const i = dropNext; dropNext = (dropNext + 1) % DROPS;
      const a = Math.random() * Math.PI * 2, r = Math.random();
      dropPos[i * 3] = x + Math.cos(a) * 0.25 * r; dropPos[i * 3 + 1] = level + 0.02; dropPos[i * 3 + 2] = z + Math.sin(a) * 0.25 * r;
      const out = speed * (0.35 + Math.random() * 0.6);
      dropVel[i * 3] = Math.cos(a) * out * 0.55 + vx * 0.4;
      dropVel[i * 3 + 1] = speed * (0.6 + Math.random() * 0.7);
      dropVel[i * 3 + 2] = Math.sin(a) * out * 0.55 + vz * 0.4;
      dropLife[i] = 1.6;
    }
  }
  function stepDrops(dt) {
    for (let i = 0; i < DROPS; i++) {
      if (dropLife[i] <= 0) continue;
      dropLife[i] -= dt;
      dropVel[i * 3 + 1] -= 9.8 * dt;
      dropPos[i * 3] += dropVel[i * 3] * dt; dropPos[i * 3 + 1] += dropVel[i * 3 + 1] * dt; dropPos[i * 3 + 2] += dropVel[i * 3 + 2] * dt;
      if (dropPos[i * 3 + 1] < level || dropLife[i] <= 0) { dropLife[i] = 0; dropPos[i * 3 + 1] = -9999; }
    }
    dropGeo.attributes.position.needsUpdate = true;
  }

  /* ── corpos que mexem na água ── */
  const tracked = new Map();   // key -> { x, z, y, state, phase }
  const pending = [];          // impactos agendados: { at, x, z, impulse, r }
  let time = 0, acc = 0;
  const inside = (x, z) => x > origin.x && x < origin.x + size.x && z > origin.y && z < origin.y + size.y;

  function splash(x, z, impulse = 2, r = 0.8, delay = 0) { pending.push({ at: time + delay, x, z, impulse, r }); }

  function update(dt, bodies = []) {
    dt = Math.min(dt, 0.1);
    time += dt;
    shared.uWaterTime.value = time;
    const src = stepMat.uniforms.uSrc.value;
    let n = 0;
    const seen = new Set();
    for (const b of bodies) {
      seen.add(b.key);
      const prev = tracked.get(b.key);
      const vx = prev ? (b.x - prev.x) / dt : 0, vz = prev ? (b.z - prev.z) / dt : 0;
      const vy = b.vy !== undefined ? b.vy : (prev ? (b.y - prev.y) / dt : 0);
      const tr = prev || { phase: Math.random() * 6 };
      const depth = level - b.y;                       // quanto o pé está abaixo da superfície
      const wet = inside(b.x, b.z) && depth > -0.05 && depth < 2.5;
      if (wet) {
        const sub = THREE.MathUtils.clamp((depth + 0.05) / 0.5, 0, 1);
        const speed = Math.min(Math.hypot(vx, vz), 6);
        tr.phase += dt * (2 + speed * 2.2);
        const stride = 0.65 + 0.35 * Math.sin(tr.phase);  // as pernas entram e saem da água
        if (speed > 0.15 && n < MAX_SRC) src[n++].set(b.x + vx * 0.08, b.z + vz * 0.08, b.r * (1 + speed * 0.12), -sub * speed * PUSH * stride);
        // caiu na água vindo de um pulo
        if (prev && !prev.wet && (prev.vy || 0) < -2.5) {
          splash(b.x, b.z, Math.min(-prev.vy, 9) * 0.3, b.r * 2); // força pela velocidade de queda, não pela imersão do 1º quadro
          spray(b.x, b.z, 30 + Math.floor(-prev.vy * 5), Math.min(-prev.vy, 8) * 0.45);
        }
        // correndo levanta gotas
        if (speed > 1.6) {
          tr.sprayAcc = (tr.sprayAcc || 0) + dt * speed * 9 * sub;
          const k = Math.floor(tr.sprayAcc); tr.sprayAcc -= k;
          if (k > 0) spray(b.x, b.z, k, 1.2 + speed * 0.35, vx, vz);
        }
        // dino tombando: o corpo bate na água ~0,8 s depois do golpe
        if (b.state === 'down' && prev && prev.state !== 'down') {
          const yaw = b.yaw || 0;
          splash(b.x - Math.sin(yaw) * 0.6, b.z - Math.cos(yaw) * 0.6, 2.4, 1.3, 0.8);
          pending.push({ at: time + 0.8, x: b.x, z: b.z, sprayN: 120, sprayV: 3.2 });
        }
      }
      Object.assign(tr, { x: b.x, y: b.y, z: b.z, vy, state: b.state, wet });
      tracked.set(b.key, tr);
    }
    for (const k of tracked.keys()) if (!seen.has(k)) tracked.delete(k);

    // impactos agendados
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p.at > time) continue;
      if (p.sprayN) spray(p.x, p.z, p.sprayN, p.sprayV);
      if (p.impulse && n < MAX_SRC) src[n++].set(p.x, p.z, p.r, -p.impulse / Math.max(dt, STEP));
      pending.splice(i, 1);
    }
    stepMat.uniforms.uSrcCount.value = n;

    // passos fixos da simulação
    acc = Math.min(acc + dt, MAX_STEPS * STEP);
    while (acc >= STEP) {
      stepMat.uniforms.uState.value = rtA.texture;
      renderTo(rtB, quadScene, quadCam);
      const t = rtA; rtA = rtB; rtB = t;
      acc -= STEP;
    }
    shared.uWaterState.value = rtA.texture;
    stepDrops(dt);
  }

  function setVisible(v) { drops.visible = v; }
  function setSunDirection(v) { shared.uSunDir.value.copy(v).normalize(); }

  function dispose() {
    rtA.dispose(); rtB.dispose(); rtMask.dispose();
    stepMat.dispose(); maskMat.dispose(); quad.geometry.dispose();
    dropGeo.dispose(); drops.material.dispose(); dotTex.dispose(); scene.remove(drops);
  }

  return { update, splash, setVisible, setSunDirection, dispose, level };
}
