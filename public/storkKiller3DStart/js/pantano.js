import * as THREE from 'three';

/* ═══════════════════════════════════════
   PÂNTANO (mapa da fase 2 do modo Cegonha Killer)
   Pântano escuro com chuva, vento forte, relâmpagos e colisão 3D.

   • Vegetação: vento com rajadas + toque em 3D (quem voa encostando nas
     copas sacode as folhas).
   • Água: troca o material "Pantano_Agua" por um shader escuro com
     respingos de chuva.
   • Chuva: linhas inclinadas pelo vento, sempre em volta da câmera.
   • Relâmpagos: clarões aleatórios (luz + água + chuva).
   • Física: troncos/galhos (cápsulas), copas (elipsoides achatados) e
     obstáculos baixos (raízes, tocos, pedras), com grade espacial —
     resolverColisao(), raycast() para tiros e alturaChao().

   Diferente da versão de referência, o módulo não mexe na cena ao ser
   preparado: ativar() põe névoa, fundo, luzes e chuva, e desativar()
   devolve o ambiente que estava antes (o dia da selva/visualizador).

   Opções: camera, vento (2.2), chuva (14000 gotas; 0 desliga),
   relampagos (true), neblina (0.03), raioToque (1.5 m), luzes (true).
═══════════════════════════════════════ */
const MAX_TOQUES = 12;
const MAX_IMPACTOS = 6;
const CELULA = 4;                       // tamanho da célula da grade de colisão (m)

export function prepararPantano(raiz, opcoes = {}) {
  let camera = opcoes.camera ?? null;
  const raioToque = opcoes.raioToque ?? 1.5;
  raiz.updateMatrixWorld(true);

  // ---------------------------------------------------------------- uniforms compartilhados
  const U = {
    uTempo:      { value: 0 },
    uVentoDir:   { value: new THREE.Vector2(1, 0.35).normalize() },
    uVentoForca: { value: opcoes.vento ?? 2.2 },
    uRajada:     { value: 0 },
    uToques:     { value: Array.from({ length: MAX_TOQUES }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uNumToques:  { value: 0 },
    uImpactos:   { value: Array.from({ length: MAX_IMPACTOS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uImpactoT:   { value: new Array(MAX_IMPACTOS).fill(99) },
    uClarao:     { value: 0 },
  };

  // ---------------------------------------------------------------- vegetação (vento + toque 3D)
  const declVeg = /* glsl */`
    attribute float _sway;
    attribute float _toque;
    attribute float _phase;
    uniform float uTempo, uVentoForca, uRajada;
    uniform vec2  uVentoDir;
    uniform vec4  uToques[${MAX_TOQUES}];
    uniform int   uNumToques;
    uniform vec4  uImpactos[${MAX_IMPACTOS}];
    uniform float uImpactoT[${MAX_IMPACTOS}];
  `;
  const deslocVeg = /* glsl */`
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float t = uTempo;
    float forca = uVentoForca * (1.0 + uRajada * 1.4);
    // rajada que "corre" pelo mapa na direção do vento
    float frente = dot(wp.xz, uVentoDir);
    float onda = sin(t * 1.6 + _phase + wp.x * 0.07 + wp.z * 0.05) * 0.55
               + sin(t * 3.1 + _phase * 1.7 + wp.z * 0.11) * 0.25
               + (sin(t * 0.9 - frente * 0.08) * 0.5 + 0.5) * 0.9;
    vec2 off = uVentoDir * onda * forca * _sway;
    // tremedeira das folhas (chuva batendo)
    off += vec2(sin(t * 9.0 + _phase * 3.0 + wp.y * 2.0), cos(t * 8.1 + _phase * 2.0 + wp.x))
           * 0.05 * _sway * (0.6 + forca * 0.4);
    // toque em 3D: afasta da esfera de quem está perto (no chão ou voando)
    vec3 empurra = vec3(0.0);
    for (int i = 0; i < ${MAX_TOQUES}; i++) {
      if (i >= uNumToques) break;
      vec4 p = uToques[i];
      vec3 d = wp - p.xyz;
      d.y *= 0.8;
      float dist = length(d);
      float f = clamp(1.0 - dist / p.w, 0.0, 1.0);
      if (dist > 1e-4) empurra += (d / dist) * f * f;
    }
    // impactos (tiros, pancadas): sacode por alguns instantes
    for (int i = 0; i < ${MAX_IMPACTOS}; i++) {
      float it = uImpactoT[i];
      if (it > 3.0) continue;
      vec4 p = uImpactos[i];
      vec3 d = wp - p.xyz;
      float dist = length(d);
      float f = clamp(1.0 - dist / p.w, 0.0, 1.0) * exp(-it * 1.8) * sin(it * 18.0 - dist * 2.0);
      if (dist > 1e-4) empurra += (d / dist) * f * 0.8;
      off += uVentoDir * f * _sway * 1.5;
    }
    float m = length(empurra);
    if (m > 1.0) empurra /= m;
    vec3 offW = vec3(off.x, 0.0, off.y) + empurra * _toque;
    offW.y -= length(empurra.xz) * _toque * 0.4;
    transformed += inverse(mat3(modelMatrix)) * offW;
  `;

  // ---------------------------------------------------------------- água
  const aguaMat = new THREE.ShaderMaterial({
    fog: true,
    transparent: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCor:      { value: new THREE.Color(0x0d150f) },
      uCeu:      { value: new THREE.Color(0x3a4a44) },
      uChuva:    { value: 1 },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vMundo;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vMundo = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uCor, uCeu;
      uniform float uTempo, uClarao, uChuva;
      varying vec3 vMundo;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // anéis de respingo: uma gota por célula, com fase aleatória
      vec2 aneis(vec2 p, float esc, float vel) {
        vec2 c = floor(p * esc), f = fract(p * esc);
        vec2 g = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 o = vec2(float(i), float(j));
          float r = h21(c + o);
          vec2 centro = o + vec2(h21(c + o + 7.1), h21(c + o + 3.3)) * 0.8 + 0.1;
          float fase = fract(uTempo * vel + r);
          vec2 d = f - centro;
          float dist = length(d);
          float raio = fase * 0.9;
          float anel = sin(clamp((dist - raio) * 30.0, -3.1416, 3.1416)) * (1.0 - fase) * (1.0 - fase);
          anel *= smoothstep(0.0, 0.02, fase);
          if (dist > 1e-3) g += d / dist * anel;
        }
        return g;
      }
      void main() {
        vec2 p = vMundo.xz;
        vec2 g = (aneis(p, 1.4, 1.1) + aneis(p * 1.3 + 17.0, 2.1, 1.4) * 0.7) * uChuva;
        vec3 n = normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
        vec3 v = normalize(cameraPosition - vMundo);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 cor = mix(uCor, uCeu, 0.15 + fres * 0.75);
        cor += vec3(0.6, 0.65, 0.75) * uClarao * (0.15 + fres);
        // brilho especular fraco (céu nublado)
        vec3 l = normalize(vec3(0.3, 1.0, 0.2));
        cor += pow(max(dot(reflect(-l, n), v), 0.0), 40.0) * 0.12;
        gl_FragColor = vec4(cor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  aguaMat.uniforms.uTempo = U.uTempo;
  aguaMat.uniforms.uClarao = U.uClarao;

  // ---------------------------------------------------------------- percorre o glb
  let chao = null, dadosCol = null;
  raiz.traverse((obj) => {
    if (obj.userData && obj.userData.colisores && !dadosCol) {
      const c = obj.userData.colisores;
      dadosCol = typeof c === 'string' ? JSON.parse(c) : c;
    }
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.some((m) => m && m.name === 'Pantano_Agua')) {
      obj.material = aguaMat;
      obj.castShadow = false;
      obj.receiveShadow = false;
      return;
    }
    if (obj.name === 'Chao' || mats.some((m) => m && m.name === 'Pantano_Chao')) chao = obj;
    if (obj.geometry.attributes._sway) {
      const novos = mats.map((m) => {
        const mat = m.clone();
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, U);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + declVeg)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + deslocVeg);
        };
        mat.customProgramCacheKey = () => 'pantano-vento';
        return mat;
      });
      obj.material = Array.isArray(obj.material) ? novos : novos[0];
      obj.geometry.computeBoundingSphere();
      obj.geometry.boundingSphere.radius += 2.0;   // margem pro balanço
    }
  });

  // ---------------------------------------------------------------- ambiente (névoa, luzes): só entra na cena em ativar()
  const corNevoa = new THREE.Color(0x1a231e);
  const corClarao = new THREE.Color(0x9aa6b8);
  const nevoa = new THREE.FogExp2(corNevoa.clone(), opcoes.neblina ?? 0.03);
  const fundo = corNevoa.clone();
  const luzes = {};
  if (opcoes.luzes !== false) {
    luzes.hemi = new THREE.HemisphereLight(0x8fa0a0, 0x1c2414, 1.1);
    luzes.lua = new THREE.DirectionalLight(0xa8b8c8, 0.9);
    luzes.lua.position.set(-20, 40, 15);
  }
  luzes.raio = new THREE.DirectionalLight(0xdfe8ff, 0);
  luzes.raio.position.set(10, 60, -20);

  // ---------------------------------------------------------------- chuva
  let chuva = null;
  const nGotas = opcoes.chuva ?? 14000;
  const CX = 44, CY = 26;                       // caixa de chuva em volta da câmera
  if (nGotas > 0) {
    const sem = new Float32Array(nGotas * 2 * 4);
    for (let i = 0; i < nGotas; i++) {
      const x = Math.random() * CX, y = Math.random() * CY, z = Math.random() * CX, r = Math.random();
      sem.set([x, y, z, r * 0.999], i * 8);       // ponta de cima
      sem.set([x, y, z, 1 + r * 0.999], i * 8 + 4); // ponta de baixo
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nGotas * 2 * 3), 3));
    geo.setAttribute('aSemente', new THREE.BufferAttribute(sem, 4));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTempo: U.uTempo, uClarao: U.uClarao, uVentoDir: U.uVentoDir,
        uVentoForca: U.uVentoForca, uRajada: U.uRajada,
        uCentro: { value: new THREE.Vector3() },
      },
      vertexShader: /* glsl */`
        attribute vec4 aSemente;
        uniform float uTempo, uVentoForca, uRajada;
        uniform vec2 uVentoDir;
        uniform vec3 uCentro;
        varying float vA;
        void main() {
          float baixo = step(1.0, aSemente.w);
          float r = fract(aSemente.w);
          float vel = 22.0 + r * 8.0;
          vec2 lado = uVentoDir * uVentoForca * (1.0 + uRajada) * 2.6;
          vec3 v = vec3(lado.x, -vel, lado.y);
          vec3 p = aSemente.xyz + v * uTempo;
          // mantém a gota numa caixa de ${CX} x ${CY} x ${CX} m que segue o centro (câmera)
          vec3 tam = vec3(${CX}.0, ${CY}.0, ${CX}.0);
          vec3 base = uCentro - vec3(tam.x * 0.5, 8.0, tam.z * 0.5);
          p = base + mod(p - base, tam);
          p -= normalize(v) * baixo * (0.55 + r * 0.35);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vA = (1.0 - baixo * 0.85) * smoothstep(0.3, 1.5, d) * (1.0 - smoothstep(14.0, 24.0, d));
        }`,
      fragmentShader: /* glsl */`
        uniform float uClarao;
        varying float vA;
        void main() {
          gl_FragColor = vec4(mix(vec3(0.62, 0.68, 0.72), vec3(1.0), uClarao), vA * (0.32 + uClarao * 0.4));
        }`,
    });
    chuva = new THREE.LineSegments(geo, mat);
    chuva.frustumCulled = false;
    chuva.renderOrder = 10;
    chuva.name = 'Chuva';
  }

  // ---------------------------------------------------------------- colisores (grade espacial)
  const s = raiz.getWorldScale(new THREE.Vector3()).x;
  const M = raiz.matrixWorld;
  const v3 = new THREE.Vector3();
  const tr = (x, y, z) => v3.set(x, y, z).applyMatrix4(M);
  // capsulas: troncos/galhos/raízes (segmento A→B + raio) · copas: elipsoides (raio horizontal rh, vertical rv)
  // baixos: cilindros do chão (yChao) até yChao + altura
  const capsulas = [], copas = [], baixos = [];
  if (dadosCol) {
    for (const [ax, ay, az, bx, by, bz, r] of dadosCol.capsulas ?? []) {
      tr(ax, ay, az); const a = v3.clone(); tr(bx, by, bz);
      capsulas.push({ tipo: 'tronco', ax: a.x, ay: a.y, az: a.z, bx: v3.x, by: v3.y, bz: v3.z, raio: r * s,
        x: (a.x + v3.x) / 2, z: (a.z + v3.z) / 2, ex: Math.abs(a.x - v3.x) / 2 + r * s, ez: Math.abs(a.z - v3.z) / 2 + r * s });
    }
    for (const [x, y, z, rh, rv] of dadosCol.copas ?? []) {
      tr(x, y, z); copas.push({ tipo: 'copa', x: v3.x, y: v3.y, z: v3.z, rh: rh * s, rv: (rv ?? rh) * s, ex: rh * s, ez: rh * s });
    }
    for (const [x, y, z, r, h] of dadosCol.baixos ?? []) {
      tr(x, y, z); baixos.push({ tipo: 'baixo', x: v3.x, y: v3.y, z: v3.z, raio: r * s, altura: h * s, ex: r * s, ez: r * s });
    }
  } else {
    console.warn('[pantano] userData.colisores não encontrado — exporte o glb com "Custom Properties" ligado.');
  }
  const grade = new Map();
  const chave = (i, k) => i * 73856093 ^ k * 19349663;
  const inserir = (c) => {
    const i0 = Math.floor((c.x - c.ex) / CELULA), i1 = Math.floor((c.x + c.ex) / CELULA);
    const k0 = Math.floor((c.z - c.ez) / CELULA), k1 = Math.floor((c.z + c.ez) / CELULA);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const ch = chave(i, k);
      let l = grade.get(ch); if (!l) grade.set(ch, l = []);
      l.push(c);
    }
  };
  capsulas.forEach(inserir); copas.forEach(inserir); baixos.forEach(inserir);

  // Penetração de uma esfera (p, raio) num colisor: devolve a profundidade (>0 = dentro) e a normal em N.
  const N = new THREE.Vector3();
  function contatoCom(c, px, py, pz, raio) {
    if (c.tipo === 'copa') {
      // espaço "achatado": o elipsoide (expandido pelo raio) vira uma esfera
      const R = c.rh + raio, k = R / (c.rv + raio);
      const dx = px - c.x, dy = (py - c.y) * k, dz = pz - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= R) return -1;
      if (d < 1e-5) { N.set(0, 1, 0); return R / k; }
      N.set(dx, dy / k, dz).normalize();          // empurra radialmente até a superfície
      const fator = R / d;
      return Math.hypot(dx * (fator - 1), dy * (fator - 1) / k, dz * (fator - 1));
    }
    if (c.tipo === 'tronco') {
      const abx = c.bx - c.ax, aby = c.by - c.ay, abz = c.bz - c.az;
      let t = ((px - c.ax) * abx + (py - c.ay) * aby + (pz - c.az) * abz) / (abx * abx + aby * aby + abz * abz || 1);
      t = Math.min(1, Math.max(0, t));
      const dx = px - (c.ax + abx * t), dy = py - (c.ay + aby * t), dz = pz - (c.az + abz * t);
      const d = Math.hypot(dx, dy, dz), min = c.raio + raio;
      if (d >= min) return -1;
      if (d < 1e-5) N.set(1, 0, 0); else N.set(dx / d, dy / d, dz / d);
      return min - d;
    }
    // baixo (cilindro)
    const base = c.y, topo = c.y + c.altura;
    if (py + raio < base || py - raio > topo) return -1;
    const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), min = c.raio + raio;
    if (d >= min) return -1;
    const lado = min - d, cima = topo - (py - raio);
    if (cima < lado || py - raio > topo - 0.35) { N.set(0, 1, 0); return cima; }  // sobe em cima
    if (d < 1e-5) N.set(1, 0, 0); else N.set(dx / d, 0, dz / d);
    return lado;
  }

  const vistos = new Set();
  function vizinhos(x, z, r, saida) {
    saida.length = 0; vistos.clear();
    const i0 = Math.floor((x - r) / CELULA), i1 = Math.floor((x + r) / CELULA);
    const k0 = Math.floor((z - r) / CELULA), k1 = Math.floor((z + r) / CELULA);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const l = grade.get(chave(i, k)); if (!l) continue;
      for (const c of l) if (!vistos.has(c)) { vistos.add(c); saida.push(c); }
    }
    return saida;
  }

  // ---------------------------------------------------------------- altura do chão (grade do terreno)
  let alturaChao = () => 0;
  const nivelAgua = (() => { let y = -0.06; raiz.traverse((o) => { if (o.isMesh && o.material === aguaMat) { o.geometry.computeBoundingBox(); y = v3.set(0, o.geometry.boundingBox.max.y, 0).applyMatrix4(o.matrixWorld).y; } }); return y; })();
  if (chao) {
    const pos = chao.geometry.attributes.position;
    const n = pos.count, res = Math.round(Math.sqrt(n));
    chao.geometry.computeBoundingBox();
    const bb = chao.geometry.boundingBox;
    const H = new Float32Array(res * res).fill(NaN);
    const sx = (bb.max.x - bb.min.x) / (res - 1), sz = (bb.max.z - bb.min.z) / (res - 1);
    for (let i = 0; i < n; i++) {
      const gi = Math.round((pos.getX(i) - bb.min.x) / sx), gk = Math.round((pos.getZ(i) - bb.min.z) / sz);
      if (gi >= 0 && gi < res && gk >= 0 && gk < res) H[gk * res + gi] = pos.getY(i);
    }
    for (let i = 0; i < H.length; i++) if (Number.isNaN(H[i])) H[i] = H[i - 1] ?? 0;
    const inv = chao.matrixWorld.clone().invert();
    const loc = new THREE.Vector3();
    alturaChao = (x, z) => {
      loc.set(x, 0, z).applyMatrix4(inv);
      let fx = (loc.x - bb.min.x) / sx, fz = (loc.z - bb.min.z) / sz;
      fx = Math.min(Math.max(fx, 0), res - 1.001); fz = Math.min(Math.max(fz, 0), res - 1.001);
      const i = Math.floor(fx), k = Math.floor(fz), a = fx - i, b = fz - k;
      const h = (H[k * res + i] * (1 - a) + H[k * res + i + 1] * a) * (1 - b)
              + (H[(k + 1) * res + i] * (1 - a) + H[(k + 1) * res + i + 1] * a) * b;
      return v3.set(loc.x, h, loc.z).applyMatrix4(chao.matrixWorld).y;
    };
  }
  const meiaBorda = (() => { if (!chao) return 70; chao.geometry.computeBoundingBox(); return chao.geometry.boundingBox.max.x * s; })();

  // ---------------------------------------------------------------- estado
  let impactoIdx = 0, proxRaio = 4 + Math.random() * 6, clarao = 0, tempoRaio = 99;
  let cenaAtiva = null, anterior = null;
  const lista = [];
  const ultimoSacode = new WeakMap();
  const _dirRaio = new THREE.Vector3();
  const api = {
    uniforms: U,
    colisores: { capsulas, copas, baixos },
    luzes,
    chuva,
    agua: aguaMat,
    nivelAgua,
    limite: meiaBorda,
    alturaChao: (x, z) => alturaChao(x, z),
    /** Onde os pés pisam: chão ou superfície da água, o que for mais alto. */
    alturaPiso: (x, z) => Math.max(alturaChao(x, z), nivelAgua),
    onRelampago: null,

    /** Põe névoa, fundo, luzes e chuva do pântano na cena (guarda o que havia antes). */
    ativar(cena) {
      if (cenaAtiva) return;
      cenaAtiva = cena;
      anterior = { fog: cena.fog, background: cena.background };
      cena.fog = nevoa;
      cena.background = fundo;
      if (luzes.hemi) cena.add(luzes.hemi);
      if (luzes.lua) cena.add(luzes.lua);
      cena.add(luzes.raio);
      if (chuva) cena.add(chuva);
    },

    /** Tira o ambiente do pântano e devolve o que a cena tinha antes de ativar(). */
    desativar() {
      if (!cenaAtiva) return;
      const cena = cenaAtiva;
      if (luzes.hemi) cena.remove(luzes.hemi);
      if (luzes.lua) cena.remove(luzes.lua);
      cena.remove(luzes.raio);
      if (chuva) cena.remove(chuva);
      cena.fog = anterior.fog;
      cena.background = anterior.background;
      cenaAtiva = null;
      anterior = null;
    },

    // dt em segundos; posicoes = personagens que encostam na vegetação (Vector3)
    update(dt, posicoes = [], raio = raioToque) {
      const t = (U.uTempo.value += dt);
      // rajadas: ruído lento de 3 senos
      const r = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.91 + 1.3) * 0.3 + Math.sin(t * 2.3 + 0.4) * 0.2;
      U.uRajada.value = Math.max(0, r) ** 1.5;
      const n = Math.min(posicoes.length, MAX_TOQUES);
      for (let i = 0; i < n; i++) { const p = posicoes[i]; U.uToques.value[i].set(p.x, p.y, p.z, raio); }
      U.uNumToques.value = n;
      for (let i = 0; i < MAX_IMPACTOS; i++) U.uImpactoT.value[i] += dt;
      // relâmpago: dois ou três piscos rápidos
      if (opcoes.relampagos !== false && cenaAtiva) {
        proxRaio -= dt;
        if (proxRaio <= 0) { tempoRaio = 0; proxRaio = 7 + Math.random() * 14; api.onRelampago?.(); }
      }
      tempoRaio += dt;
      clarao = tempoRaio < 0.9
        ? Math.max(0, Math.sin(tempoRaio * 22) * Math.exp(-tempoRaio * 4.5)) + (tempoRaio < 0.08 ? 0.8 : 0)
        : 0;
      clarao = Math.min(clarao, 1);
      U.uClarao.value = clarao;
      luzes.raio.intensity = clarao * 4.0;
      if (cenaAtiva) {
        fundo.copy(corNevoa).lerp(corClarao, clarao * 0.55);
        nevoa.color.copy(fundo);
      }
      if (chuva) {
        const c = camera ? camera.getWorldPosition(v3) : v3.set(0, 0, 0);
        chuva.material.uniforms.uCentro.value.copy(c);
      }
    },

    vento(forca = 2.2, direcao = null) {
      U.uVentoForca.value = forca;
      if (direcao) U.uVentoDir.value.copy(direcao).normalize();
    },

    definirCamera(c) { camera = c; },

    impacto(posicao, raio = 3) {
      U.uImpactos.value[impactoIdx].set(posicao.x, posicao.y, posicao.z, raio);
      U.uImpactoT.value[impactoIdx] = 0;
      impactoIdx = (impactoIdx + 1) % MAX_IMPACTOS;
    },

    relampago() { tempoRaio = 0; api.onRelampago?.(); },

    // Empurra uma esfera (personagem) para fora de troncos, copas e obstáculos baixos, e a mantém acima do chão.
    //   posicao  Vector3 = CENTRO do personagem (é alterado no lugar)
    //   raio     raio da esfera do personagem
    //   op.chao  true = não deixa afundar no chão/água (padrão true)
    //   op.sacudir  true = ao bater numa copa, sacode as folhas (padrão true)
    //   op.anterior Vector3 com a posição do quadro anterior (recomendado): se o personagem ficar
    //               "entalado" entre várias copas, ele volta para lá em vez de atravessar
    // Retorna null se não bateu em nada, ou { tipo, normal } do último contato.
    resolverColisao(posicao, raio = 0.5, op = {}) {
      let contato = null;
      for (let iter = 0; iter < 8; iter++) {
        let mexeu = false;
        for (const c of vizinhos(posicao.x, posicao.z, raio, lista)) {
          const q = contatoCom(c, posicao.x, posicao.y, posicao.z, raio);
          if (q <= 0) continue;
          posicao.addScaledVector(N, q + 1e-4);
          contato = { tipo: c.tipo, normal: N.clone(), alvo: c };
          mexeu = true;
        }
        if (!mexeu) break;
      }
      if (op.anterior && api.penetracao(posicao, raio) > 0.02) {
        posicao.copy(op.anterior);
        contato ??= { tipo: 'copa', normal: new THREE.Vector3(0, 1, 0) };
      }
      if (op.chao !== false) {
        const yc = Math.max(alturaChao(posicao.x, posicao.z), nivelAgua) + raio;
        if (posicao.y < yc) { posicao.y = yc; contato ??= { tipo: 'chao', normal: new THREE.Vector3(0, 1, 0) }; }
      }
      // limite do mapa
      const L = meiaBorda - raio;
      posicao.x = Math.min(Math.max(posicao.x, -L), L);
      posicao.z = Math.min(Math.max(posicao.z, -L), L);
      if (contato && contato.tipo === 'copa' && op.sacudir !== false && contato.alvo) {
        const agora = U.uTempo.value;
        if ((ultimoSacode.get(contato.alvo) ?? -9) < agora - 0.6) {
          ultimoSacode.set(contato.alvo, agora);
          api.impacto(posicao, contato.alvo.rh + 1.5);
        }
      }
      return contato;
    },

    // Quanto a esfera está "dentro" de algum obstáculo (0 = livre).
    penetracao(posicao, raio = 0.5) {
      let pior = 0;
      for (const c of vizinhos(posicao.x, posicao.z, raio, lista)) {
        const q = contatoCom(c, posicao.x, posicao.y, posicao.z, raio);
        if (q > pior) pior = q;
      }
      return pior;
    },

    /** Bala que andou de p0 até p1: bateu em árvore, copa, obstáculo, chão ou água? Devolve o raycast ou null. */
    bateBala(p0, p1) {
      _dirRaio.subVectors(p1, p0);
      const dist = _dirRaio.length();
      if (dist < 1e-6) return null;
      return api.raycast(p0, _dirRaio, dist);
    },

    // Raio para tiros: retorna { ponto, distancia, normal, tipo } do primeiro obstáculo (árvore, copa ou chão) ou null.
    raycast(origem, direcao, distMax = 80) {
      const dir = direcao.clone().normalize();
      let melhor = null, tMelhor = distMax;
      const testados = new Set();
      const passo = CELULA * 0.5;
      for (let t = 0; t <= tMelhor + passo; t += passo) {
        const px = origem.x + dir.x * t, pz = origem.z + dir.z * t;
        for (const c of vizinhos(px, pz, passo, lista)) {
          if (testados.has(c)) continue; testados.add(c);
          let th = null, n = null;
          if (c.tipo === 'copa') {
            // raio contra elipsoide: escala o eixo Y para virar esfera
            const k = c.rh / c.rv;
            const ox = origem.x - c.x, oy = (origem.y - c.y) * k, oz = origem.z - c.z;
            const dx = dir.x, dy = dir.y * k, dz = dir.z;
            const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz;
            const disc = b * b - a * (ox * ox + oy * oy + oz * oz - c.rh * c.rh);
            if (disc >= 0) {
              const tt = (-b - Math.sqrt(disc)) / a;
              if (tt >= 0) { th = tt; n = new THREE.Vector3(ox + dx * tt, (oy + dy * tt) * k, oz + dz * tt).normalize(); }
            }
          } else if (c.tipo === 'tronco') {
            // raio contra cápsula: ponto mais próximo entre o raio e o segmento
            const ux = c.bx - c.ax, uy = c.by - c.ay, uz = c.bz - c.az;
            const wx = origem.x - c.ax, wy = origem.y - c.ay, wz = origem.z - c.az;
            const a = 1, b = dir.x * ux + dir.y * uy + dir.z * uz, cc = ux * ux + uy * uy + uz * uz;
            const d = dir.x * wx + dir.y * wy + dir.z * wz, e = ux * wx + uy * wy + uz * wz;
            const den = a * cc - b * b;
            let sc = den > 1e-8 ? (b * e - cc * d) / den : 0, tc;
            sc = Math.max(0, sc);
            tc = cc > 1e-8 ? Math.min(1, Math.max(0, (e + b * sc) / cc)) : 0;
            sc = Math.max(0, b * tc - d);
            const qx = origem.x + dir.x * sc - (c.ax + ux * tc), qy = origem.y + dir.y * sc - (c.ay + uy * tc), qz = origem.z + dir.z * sc - (c.az + uz * tc);
            const dist = Math.hypot(qx, qy, qz);
            if (dist < c.raio) {
              const tt = Math.max(0, sc - Math.sqrt(c.raio * c.raio - dist * dist));
              const hx = origem.x + dir.x * tt - (c.ax + ux * tc), hy = origem.y + dir.y * tt - (c.ay + uy * tc), hz = origem.z + dir.z * tt - (c.az + uz * tc);
              th = tt; n = new THREE.Vector3(hx, hy, hz).normalize();
            }
          } else {
            const ox = origem.x - c.x, oz = origem.z - c.z;
            const a = dir.x * dir.x + dir.z * dir.z;
            if (a < 1e-8) continue;
            const b = ox * dir.x + oz * dir.z, cc = ox * ox + oz * oz - c.raio * c.raio;
            const disc = b * b - a * cc;
            if (disc >= 0) {
              const tt = (-b - Math.sqrt(disc)) / a;
              const y = origem.y + dir.y * tt;
              if (tt >= 0 && y >= c.y && y <= c.y + c.altura) {
                th = tt; n = new THREE.Vector3(ox + dir.x * tt, 0, oz + dir.z * tt).normalize();
              }
            }
          }
          if (th !== null && th < tMelhor) { tMelhor = th; melhor = { distancia: th, normal: n, tipo: c.tipo, alvo: c }; }
        }
      }
      // chão: marcha simples
      for (let t = 0; t < tMelhor; t += 0.5) {
        const x = origem.x + dir.x * t, y = origem.y + dir.y * t, z = origem.z + dir.z * t;
        if (y < Math.max(alturaChao(x, z), nivelAgua)) {
          tMelhor = Math.max(0, t - 0.25);
          melhor = { distancia: tMelhor, normal: new THREE.Vector3(0, 1, 0), tipo: y < nivelAgua + 0.01 ? 'agua' : 'chao' };
          break;
        }
      }
      if (!melhor) return null;
      melhor.ponto = origem.clone().addScaledVector(dir, melhor.distancia);
      return melhor;
    },
  };
  return api;
}
