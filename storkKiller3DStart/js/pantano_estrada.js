import * as THREE from 'three';

/* ═══════════════════════════════════════
   PÂNTANO COM ESTRADA (mapa da fase 3 do modo Cegonha Killer)
   Estrada de chão e lago raso para o buggy.

   • Poeira saindo das rodas na estrada (mais forte acelerando/derrapando)
   • Na água: respingos, ondas em volta das rodas (o carro.js freia na água)
   • Na lama: barro espirrando
   • Grama, capim e juncos AMASSAM embaixo das rodas (e da cegonha) e levantam devagar
   • Marcas de pneu no chão (somem aos poucos)
   • Vento com rajadas e plantas que se afastam quando encostam

   Adaptações para o jogo (em relação à versão de referência):
   • Tudo deste módulo (alturaChao, superficie, profundidade, resolverColisao,
     raycast, update, inicioCarro) trabalha em METROS DO MAPA. No jogo o mapa
     fica num grupo escalado junto com o buggy; definirEscala(e) avisa os
     shaders para converter as posições do mundo de volta para metros.
   • Não mexe na cena ao ser preparado: ativar(cena) põe névoa, fundo e luzes,
     desativar() devolve o que a cena tinha antes.
   • Partículas ficam dentro da raiz do mapa (herdam a escala do grupo).

   Opções: camera, vento (1.4), chuva (0 = sem chuva; ex. 9000), relampagos (false),
           neblina (0.006, em metros do mapa), raioToque (1.2), luzes (true)

   O mesmo módulo serve para o mapa do DESAFIO (desafio_trilha.glb), que traz no userData.mapa:
   • aguaSuperficie: a água fica onde a grade de superfície diz 'agua' (lagos, córrego) em vez de um lago só
   • pisos novos: 'asfalto' (cidade) e 'areia' (deserto)
   • colisores 'caixas' (casas, prédios, carros estacionados): [cx, y0, cz, meiaX, meiaZ, rumo, altura]
   • ambiente.neblina (névoa mais rala: o mapa é bem maior)
═══════════════════════════════════════ */
const MAX_TOQUES = 12;
const MAX_IMPACTOS = 6;
const CELULA = 4;                       // tamanho da célula da grade de colisão (m)

export function prepararPantanoEstrada(raiz, opcoes = {}) {
  let camera = opcoes.camera ?? null;
  const raioToque = opcoes.raioToque ?? 1.2;
  raiz.updateMatrixWorld(true);

  // ---------------------------------------------------------------- uniforms compartilhados
  const U = {
    uTempo:      { value: 0 },
    uEscala:     { value: 1 },                             // escala do grupo do mapa no jogo
    uVentoDir:   { value: new THREE.Vector2(1, 0.35).normalize() },
    uVentoForca: { value: opcoes.vento ?? 1.4 },
    uRajada:     { value: 0 },
    uToques:     { value: Array.from({ length: MAX_TOQUES }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uNumToques:  { value: 0 },
    uImpactos:   { value: Array.from({ length: MAX_IMPACTOS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uImpactoT:   { value: new Array(MAX_IMPACTOS).fill(99) },
    uClarao:     { value: 0 },
    uPisada:     { value: null },                          // textura: R = planta amassada, G = marca de pneu
    uPisadaArea: { value: new THREE.Vector4(-120, -120, 240, 0) },
  };

  // ---------------------------------------------------------------- vegetação (vento + toque 3D + amassada)
  const declVeg = /* glsl */`
    attribute float _sway;
    attribute float _toque;
    attribute float _phase;
    attribute float _altura;
    uniform sampler2D uPisada;
    uniform vec4 uPisadaArea;
    uniform float uTempo, uVentoForca, uRajada, uEscala;
    uniform vec2  uVentoDir;
    uniform vec4  uToques[${MAX_TOQUES}];
    uniform int   uNumToques;
    uniform vec4  uImpactos[${MAX_IMPACTOS}];
    uniform float uImpactoT[${MAX_IMPACTOS}];
  `;
  const deslocVeg = /* glsl */`
    // posições em metros do mapa (o grupo do mapa é escalado no jogo)
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz / uEscala;
    vec3 base0 = (modelMatrix * vec4(position.x, position.y - _altura, position.z, 1.0)).xyz / uEscala;
    float amassa = _altura > 0.001 ? texture2D(uPisada, (base0.xz - uPisadaArea.xy) / uPisadaArea.z).r : 0.0;
    float t = uTempo;
    float forca = uVentoForca * (1.0 + uRajada * 1.4);
    // rajada que "corre" pelo mapa na direção do vento
    float frente = dot(wp.xz, uVentoDir);
    float onda = sin(t * 1.6 + _phase + wp.x * 0.07 + wp.z * 0.05) * 0.55
               + sin(t * 3.1 + _phase * 1.7 + wp.z * 0.11) * 0.25
               + (sin(t * 0.9 - frente * 0.08) * 0.5 + 0.5) * 0.9;
    vec2 off = uVentoDir * onda * forca * _sway;
    // tremedeira das folhas
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
    vec3 offW = vec3(off.x, 0.0, off.y) * (1.0 - 0.85 * amassa) + empurra * _toque;
    offW.y -= length(empurra.xz) * _toque * 0.4;
    // amassada: a planta deita (cada uma para um lado) e encosta no chão; levanta devagar quando amassa diminui
    if (amassa > 0.002) {
      float k = amassa * amassa * (3.0 - 2.0 * amassa);
      vec2 dc = vec2(cos(_phase * 7.3), sin(_phase * 7.3));
      float h = _altura;
      offW.y -= h * k * 0.9;
      offW.xz += dc * h * k * 0.75;
    }
    // deslocamento em metros do mapa → espaço do objeto
    transformed += inverse(mat3(modelMatrix)) * (offW * uEscala);
  `;

  // ---------------------------------------------------------------- água do lago (transparente, com ondas do carro)
  const MAX_ONDAS = 48;
  const aguaMat = new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uCor:      { value: new THREE.Color(0x2c3a24) },
      uCeu:      { value: new THREE.Color(0x9fb3ab) },
      uChuva:    { value: 0 },
      uOndas:    { value: Array.from({ length: MAX_ONDAS }, () => new THREE.Vector4(0, 0, -99, 0)) },
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
      uniform float uTempo, uClarao, uChuva, uEscala;
      uniform vec4 uOndas[${MAX_ONDAS}];
      varying vec3 vMundo;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
          float anel = sin(clamp((dist - fase * 0.9) * 30.0, -3.1416, 3.1416)) * (1.0 - fase) * (1.0 - fase);
          anel *= smoothstep(0.0, 0.02, fase);
          if (dist > 1e-3) g += d / dist * anel;
        }
        return g;
      }
      void main() {
        vec2 p = vMundo.xz / uEscala;          // metros do mapa (as ondas são gravadas nessa escala)
        // marolinhas paradas + chuva (opcional)
        vec2 g = vec2(sin(p.x * 1.7 + uTempo * 1.3) + sin(p.y * 2.3 - uTempo), cos(p.x * 2.1 - uTempo * 1.1) + sin(p.y * 1.3 + uTempo * 0.8)) * 0.03;
        g += (aneis(p, 1.4, 1.1) + aneis(p * 1.3 + 17.0, 2.1, 1.4) * 0.7) * uChuva;
        // ondas que o carro (e quem anda na água) faz: anéis que crescem e somem
        float espuma = 0.0;
        for (int i = 0; i < ${MAX_ONDAS}; i++) {
          vec4 o = uOndas[i];
          float idade = uTempo - o.z;
          if (idade < 0.0 || idade > 3.5) continue;
          vec2 d = p - o.xy;
          float dist = length(d);
          float raio = 0.25 + idade * 1.7;
          float a = exp(-idade * 1.2) * o.w;
          float onda = sin((dist - raio) * 9.0) * smoothstep(raio + 0.6, raio, dist) * smoothstep(raio - 2.2, raio - 0.2, dist);
          if (dist > 1e-3) g += d / dist * onda * a * 0.6;
          espuma += smoothstep(0.22, 0.0, abs(dist - raio)) * a * 0.16 * smoothstep(2.5, 0.3, idade);
        }
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vMundo);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 cor = mix(uCor, uCeu, 0.12 + fres * 0.7);
        vec3 l = normalize(vec3(0.3, 1.0, 0.2));
        cor += pow(max(dot(reflect(-l, n), v), 0.0), 60.0) * 0.25;
        cor = mix(cor, vec3(0.78, 0.8, 0.74), clamp(espuma, 0.0, 0.3));
        cor += vec3(0.6, 0.65, 0.75) * uClarao * (0.15 + fres);
        float alfa = clamp(0.72 + fres * 0.25 + espuma * 0.2, 0.0, 0.97);
        gl_FragColor = vec4(cor, alfa);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  aguaMat.uniforms.uTempo = U.uTempo;
  aguaMat.uniforms.uClarao = U.uClarao;
  aguaMat.uniforms.uEscala = U.uEscala;

  // ---------------------------------------------------------------- percorre o glb
  let chao = null, dadosCol = null, dadosMapa = null;
  raiz.traverse((obj) => {
    if (obj.userData && obj.userData.colisores && !dadosCol) {
      const c = obj.userData.colisores;
      dadosCol = typeof c === 'string' ? JSON.parse(c) : c;
    }
    if (obj.userData && obj.userData.mapa && !dadosMapa) {
      const c = obj.userData.mapa;
      dadosMapa = typeof c === 'string' ? JSON.parse(c) : c;
    }
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (mats.some((m) => m && m.name === 'Lago_Agua')) {
      obj.material = aguaMat;
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.renderOrder = 2;
      return;
    }
    if (obj.name === 'Chao' || mats.some((m) => m && m.name === 'Estrada_Chao')) {
      chao = obj;
      // marcas de pneu: escurece o chão onde a textura de pisada tem G
      const mat = obj.material.clone();
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uPisada = U.uPisada;
        shader.uniforms.uPisadaArea = U.uPisadaArea;
        shader.uniforms.uEscala = U.uEscala;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMundoE;\nuniform float uEscala;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvMundoE = (modelMatrix * vec4(transformed, 1.0)).xyz / uEscala;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vMundoE;\nuniform sampler2D uPisada;\nuniform vec4 uPisadaArea;')
          .replace('#include <color_fragment>', `#include <color_fragment>
            vec2 pis = texture2D(uPisada, (vMundoE.xz - uPisadaArea.xy) / uPisadaArea.z).rg;
            diffuseColor.rgb *= 1.0 - 0.32 * pis.g;`);
      };
      mat.customProgramCacheKey = () => 'pantano-estrada-chao';
      obj.material = mat;
    }
    if (obj.geometry.attributes._sway) {
      const novos = mats.map((m) => {
        const mat = m.clone();
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, U);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + declVeg)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + deslocVeg);
        };
        mat.customProgramCacheKey = () => 'pantano-estrada-vento';
        return mat;
      });
      obj.material = Array.isArray(obj.material) ? novos : novos[0];
      obj.geometry.computeBoundingSphere();
      obj.geometry.boundingSphere.radius += 2.0;   // margem pro balanço
    }
  });

  // ---------------------------------------------------------------- ambiente (névoa, luzes): só entra na cena em ativar()
  const corNevoa = new THREE.Color(opcoes.chuva ? 0x5c6d66 : 0x9db0a6);
  const corClarao = new THREE.Color(0x9aa6b8);
  const neblinaBase = opcoes.neblina ?? dadosMapa?.ambiente?.neblina ?? (opcoes.chuva ? 0.014 : 0.006);   // por metro do mapa
  const nevoa = new THREE.FogExp2(corNevoa.clone(), neblinaBase);
  const fundo = corNevoa.clone();
  const luzes = {};
  if (opcoes.luzes !== false) {
    luzes.hemi = new THREE.HemisphereLight(0xdfeee6, 0x3a4626, 1.35);
    luzes.lua = new THREE.DirectionalLight(0xfff0d6, opcoes.chuva ? 0.9 : 1.9);
    luzes.lua.position.set(-30, 60, 25);
  }
  luzes.raio = new THREE.DirectionalLight(0xdfe8ff, 0);
  luzes.raio.position.set(10, 60, -20);

  // ---------------------------------------------------------------- chuva (desligada por padrão)
  let chuva = null;
  const nGotas = opcoes.chuva ?? 0;
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
  const M = raiz.matrixWorld.clone();
  const v3 = new THREE.Vector3();
  const tr = (x, y, z) => v3.set(x, y, z).applyMatrix4(M);
  // capsulas: troncos/galhos/raízes (segmento A→B + raio) · copas: elipsoides (raio horizontal rh, vertical rv)
  // baixos: cilindros do chão (yChao) até yChao + altura
  const capsulas = [], copas = [], baixos = [], caixas = [];
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
    // caixas (paredes de casas/prédios, carros parados): girada em torno do Y pelo rumo (frente = +Z local)
    for (const [x, y, z, hx, hz, rot, h] of dadosCol.caixas ?? []) {
      tr(x, y, z);
      const raioXZ = Math.hypot(hx, hz) * s;
      caixas.push({ tipo: 'caixa', x: v3.x, y: v3.y, z: v3.z, hx: hx * s, hz: hz * s, altura: h * s,
        cos: Math.cos(rot), sin: Math.sin(rot), ex: raioXZ, ez: raioXZ });
    }
  } else {
    console.warn('[pantano_estrada] userData.colisores não encontrado — exporte o glb com "Custom Properties" ligado.');
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
  capsulas.forEach(inserir); copas.forEach(inserir); baixos.forEach(inserir); caixas.forEach(inserir);

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
    if (c.tipo === 'caixa') {
      // para o referencial da caixa (x = esquerda, z = frente)
      const dx = px - c.x, dz = pz - c.z;
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      const y0 = c.y, y1 = c.y + c.altura;
      const qx = Math.min(Math.max(lx, -c.hx), c.hx), qy = Math.min(Math.max(py, y0), y1), qz = Math.min(Math.max(lz, -c.hz), c.hz);
      const ex = lx - qx, ey = py - qy, ez = lz - qz;
      const d2 = ex * ex + ey * ey + ez * ez;
      let nx, ny, nz, prof;
      if (d2 > 1e-10) {
        if (d2 >= raio * raio) return -1;
        const d = Math.sqrt(d2);
        nx = ex / d; ny = ey / d; nz = ez / d; prof = raio - d;
      } else {
        // centro dentro da caixa: sai pela parede mais perto (por cima só se já estiver lá no alto)
        const op = [[lx + c.hx, -1, 0, 0], [c.hx - lx, 1, 0, 0], [lz + c.hz, 0, 0, -1], [c.hz - lz, 0, 0, 1]];
        if (py > y1 - 0.3) op.push([y1 - py, 0, 1, 0]);
        op.sort((a, b) => a[0] - b[0]);
        [prof, nx, ny, nz] = op[0];
        prof += raio;
      }
      // normal de volta para o mundo
      N.set(nx * c.cos + nz * c.sin, ny, -nx * c.sin + nz * c.cos);
      return prof;
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
  // As matrizes são copiadas AGORA (metros do mapa): depois o mapa vai para um grupo escalado.
  let alturaChao = () => 0;
  const nivelAgua = dadosMapa ? v3.set(0, dadosMapa.nivelAgua, 0).applyMatrix4(M).y : -0.02;
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
    const chaoM = chao.matrixWorld.clone();
    const inv = chaoM.clone().invert();
    const loc = new THREE.Vector3();
    const out = new THREE.Vector3();
    alturaChao = (x, z) => {
      loc.set(x, 0, z).applyMatrix4(inv);
      let fx = (loc.x - bb.min.x) / sx, fz = (loc.z - bb.min.z) / sz;
      fx = Math.min(Math.max(fx, 0), res - 1.001); fz = Math.min(Math.max(fz, 0), res - 1.001);
      const i = Math.floor(fx), k = Math.floor(fz), a = fx - i, b = fz - k;
      const h = (H[k * res + i] * (1 - a) + H[k * res + i + 1] * a) * (1 - b)
              + (H[(k + 1) * res + i] * (1 - a) + H[(k + 1) * res + i + 1] * a) * b;
      return out.set(loc.x, h, loc.z).applyMatrix4(chaoM).y;
    };
  }
  const meiaBorda = (() => { if (!chao) return 70; chao.geometry.computeBoundingBox(); return chao.geometry.boundingBox.max.x * s; })();

  // ---------------------------------------------------------------- mapa: superfície, água, lago
  const TAM = dadosMapa?.tamanho ?? (meiaBorda * 2);
  const sup = (() => {
    if (!dadosMapa?.superficie) return null;
    const bin = atob(dadosMapa.superficie.dados);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return { res: dadosMapa.superficie.res, dados: a };
  })();
  const ATRITO_PISO = {
    grama: 0.80,
    estrada: 0.92,
    lama: 0.55,
    agua: 0.62,        // fundo do lago (lama mole)
    asfalto: 1.0,      // cidade do desafio
    areia: 0.66,       // deserto do desafio
  };
  const codigos = dadosMapa?.superficie?.codigos ?? ['grama', 'estrada', 'lama', 'agua'];
  const PISOS = codigos.map((tipo) => ({ tipo, mu: ATRITO_PISO[tipo] ?? 0.8 }));
  const lago = dadosMapa?.lago;
  const lagoR = (x, z) => {
    if (!lago) return 99;
    const c = Math.cos(lago.rot), sn = Math.sin(lago.rot);
    const dx = x - lago.cx, dz = z - lago.cz;
    const u = dx * c + dz * sn, w = -dx * sn + dz * c;
    return Math.hypot(u / lago.rx, w / lago.rz);
  };
  function superficie(x, z) {
    if (!sup) return PISOS[0];
    const i = Math.floor(x + TAM / 2), k = Math.floor(z + TAM / 2);
    if (i < 0 || k < 0 || i >= sup.res || k >= sup.res) return PISOS[0];
    return PISOS[sup.dados[k * sup.res + i]] ?? PISOS[0];
  }
  const aguaPorSuperficie = !!dadosMapa?.aguaSuperficie;
  function profundidade(x, z) {
    if (aguaPorSuperficie) {
      if (superficie(x, z).tipo !== 'agua') return 0;
    } else if (lagoR(x, z) > 1.3) return 0;
    return Math.max(0, nivelAgua - alturaChao(x, z));
  }

  // ---------------------------------------------------------------- pisada: plantas amassadas (R) e marcas de pneu (G)
  const PR = opcoes.resolucaoPisada ?? 1024;
  const pisR = new Float32Array(PR * PR), pisG = new Float32Array(PR * PR);
  const pisBytes = new Uint8Array(PR * PR * 2);
  const pisTex = new THREE.DataTexture(pisBytes, PR, PR, THREE.RGFormat, THREE.UnsignedByteType);
  pisTex.magFilter = pisTex.minFilter = THREE.LinearFilter;
  pisTex.needsUpdate = true;
  U.uPisada.value = pisTex;
  U.uPisadaArea.value.set(-TAM / 2, -TAM / 2, TAM, 0);
  let pisSujo = false, pisDecai = 0;
  const texel = TAM / PR;
  function carimbo(x, z, raio, r, gg) {
    const cx = (x + TAM / 2) / texel, cz = (z + TAM / 2) / texel, rr = Math.max(0.7, raio / texel);
    const i0 = Math.max(0, Math.floor(cx - rr)), i1 = Math.min(PR - 1, Math.ceil(cx + rr));
    const k0 = Math.max(0, Math.floor(cz - rr)), k1 = Math.min(PR - 1, Math.ceil(cz + rr));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - cx, k + 0.5 - cz) / rr;
      if (d > 1) continue;
      const f = 1 - d * d * 0.5;
      const j = k * PR + i;
      if (r > 0) pisR[j] = Math.max(pisR[j], r * f);
      if (gg > 0) pisG[j] = Math.min(1, pisG[j] + gg * f);
    }
    pisSujo = true;
  }
  function trilha(a, b, raio, r, gg) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.min(40, Math.max(1, Math.ceil(L / (texel * 0.7))));
    for (let s2 = 1; s2 <= n; s2++) {
      const t = s2 / n;
      carimbo(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, raio, r, gg / n * 2);
    }
  }
  function atualizarPisada(dt) {
    pisDecai += dt;
    if (pisDecai > 0.1) {
      // a planta volta devagar (≈9 s); a marca de pneu some em ≈45 s
      const dr = pisDecai / 9, dg = pisDecai / 45;
      for (let j = 0; j < pisR.length; j++) {
        if (pisR[j] > 0) pisR[j] = Math.max(0, pisR[j] - dr);
        if (pisG[j] > 0) pisG[j] = Math.max(0, pisG[j] - dg);
      }
      pisDecai = 0;
      pisSujo = true;
    }
    if (pisSujo) {
      for (let j = 0, b = 0; j < pisR.length; j++, b += 2) {
        pisBytes[b] = pisR[j] * 255;
        pisBytes[b + 1] = pisG[j] * 255;
      }
      pisTex.needsUpdate = true;
      pisSujo = false;
    }
  }

  // ---------------------------------------------------------------- partículas (poeira, barro, água)
  class Particulas {
    constructor(n, cfg) {
      this.n = n; this.cfg = cfg; this.i = 0;
      this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
      this.vida = new Float32Array(n).fill(0); this.dur = new Float32Array(n).fill(1);
      this.tam = new Float32Array(n); this.alfa = new Float32Array(n);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('aTam', new THREE.BufferAttribute(this.tam, 1));
      g.setAttribute('aAlfa', new THREE.BufferAttribute(this.alfa, 1));
      this.mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: true,
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCor: { value: new THREE.Color(...cfg.cor) }, uPx: { value: 600 } }]),
        vertexShader: /* glsl */`
          attribute float aTam, aAlfa;
          varying float vA;
          uniform float uPx;
          #include <fog_pars_vertex>
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = aTam * uPx * projectionMatrix[1][1] / max(0.1, -mvPosition.z);
            vA = aAlfa;
            #include <fog_vertex>
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 uCor;
          varying float vA;
          #include <fog_pars_fragment>
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = vA * (1.0 - smoothstep(${cfg.duro ? '0.35' : '0.1'}, 0.5, d));
            if (a < 0.01) discard;
            gl_FragColor = vec4(uCor, a);
            #include <fog_fragment>
          }`,
      });
      this.obj = new THREE.Points(g, this.mat);
      this.obj.frustumCulled = false;
      this.obj.renderOrder = 5;
    }
    emitir(x, y, z, vx, vy, vz) {
      const c = this.cfg, i = this.i;
      this.i = (i + 1) % this.n;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([vx, vy, vz], i * 3);
      this.dur[i] = c.vida[0] + Math.random() * (c.vida[1] - c.vida[0]);
      this.vida[i] = this.dur[i];
    }
    update(dt) {
      const c = this.cfg;
      for (let i = 0; i < this.n; i++) {
        if (this.vida[i] <= 0) { this.alfa[i] = 0; continue; }
        this.vida[i] -= dt;
        const u = 1 - Math.max(0, this.vida[i]) / this.dur[i];       // 0 -> 1
        const j = i * 3;
        this.vel[j + 1] -= c.gravidade * dt;
        const ar = Math.exp(-c.arrasto * dt);
        this.vel[j] *= ar; this.vel[j + 1] *= c.gravidade ? 1 : ar; this.vel[j + 2] *= ar;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        this.tam[i] = c.tam[0] + (c.tam[1] - c.tam[0]) * Math.sqrt(u);
        this.alfa[i] = c.alfa * (1 - u) * Math.min(1, u * 8);
      }
      const g = this.obj.geometry;
      g.attributes.position.needsUpdate = g.attributes.aTam.needsUpdate = g.attributes.aAlfa.needsUpdate = true;
      // tamanho em metros do mapa → pixels (a partícula herda a escala do grupo)
      this.mat.uniforms.uPx.value = (typeof innerHeight !== 'undefined' ? innerHeight : 800) * 0.5 * U.uEscala.value;
    }
  }
  const fx = {
    poeira: new Particulas(900, { cor: [0.68, 0.59, 0.46], tam: [0.6, 3.8], vida: [1.6, 2.8], alfa: 0.42, gravidade: -0.15, arrasto: 1.4 }),
    barro: new Particulas(500, { cor: [0.22, 0.16, 0.09], tam: [0.07, 0.10], vida: [0.6, 1.0], alfa: 0.95, gravidade: 9.8, arrasto: 0.4, duro: true }),
    gotas: new Particulas(900, { cor: [0.80, 0.86, 0.85], tam: [0.06, 0.09], vida: [0.5, 0.9], alfa: 0.85, gravidade: 9.8, arrasto: 0.3, duro: true }),
    spray: new Particulas(400, { cor: [0.88, 0.92, 0.92], tam: [0.4, 1.8], vida: [0.5, 0.9], alfa: 0.28, gravidade: 1.5, arrasto: 2.0 }),
  };
  for (const k in fx) raiz.add(fx[k].obj);
  let ondaIdx = 0;
  function onda(x, z, forca) {
    aguaMat.uniforms.uOndas.value[ondaIdx].set(x, z, U.uTempo.value, forca);
    ondaIdx = (ondaIdx + 1) % MAX_ONDAS;
  }
  const rodaAnt = new Map();      // última posição de contato de cada roda (para a trilha)
  const pesAnt = new Map();
  const acumulado = new Map();    // "quantas partículas faltam emitir" por roda
  const rnd = (a) => (Math.random() * 2 - 1) * a;

  function efeitosCarro(dt, buggy) {
    const f = buggy.frente.clone();
    const L = new THREE.Vector3(f.z, 0, -f.x);          // esquerda
    for (const r of buggy.rodas) {
      if (!r.contato) continue;
      const x = r.contato.x, z = r.contato.z;
      const y = alturaChao(x, z);
      const p = new THREE.Vector3(x, y, z);
      const v = Math.abs(r.vRoda ?? 0);
      const prof = profundidade(x, z);
      const piso = superficie(x, z).tipo;
      const larg = r.largura ?? (r.frente ? 0.13 : 0.17);
      // amassa a vegetação e marca o chão por onde a roda passou
      const ant = rodaAnt.get(r) ?? p;
      if (p.distanceTo(ant) < 3) trilha(ant, p, larg + 0.08, 1.0, prof > 0.05 ? 0 : (piso === 'grama' ? 0.25 : 0.55));
      rodaAnt.set(r, p);
      let acc = acumulado.get(r) ?? 0;
      const lado = r.centro ? (Math.random() < 0.5 ? 1 : -1) : r.esquerda ? 1 : -1;   // moto: roda no meio, espirra dos dois lados
      const tras = f.clone().multiplyScalar(-Math.sign(r.vRoda || 1));
      if (prof > 0.02 && v > 0.4) {
        // água: gotas para os lados e para cima + névoa + ondas
        const k = Math.min(1, prof / 0.15) * Math.min(1, v / 7);
        acc += dt * (40 + 260 * k) * Math.min(1, v / 2);
        while (acc >= 1) {
          acc -= 1;
          const s2 = Math.random() < 0.5 ? lado : -lado * 0.4;
          const sp = (1 + Math.random() * 2.5) * (0.4 + k);
          fx.gotas.emitir(x + rnd(0.15), nivelAgua + 0.02, z + rnd(0.2),
            L.x * s2 * sp + tras.x * v * 0.25 + rnd(0.4), 1.5 + Math.random() * 3.5 * (0.3 + k), L.z * s2 * sp + tras.z * v * 0.25 + rnd(0.4));
          if (Math.random() < 0.15) fx.spray.emitir(x, nivelAgua + 0.15, z, L.x * lado * 0.8 + tras.x * v * 0.2, 0.6, L.z * lado * 0.8 + tras.z * v * 0.2);
        }
        r._onda = (r._onda ?? 0) - dt;
        if (r._onda <= 0) { onda(x, z, Math.min(1.0, 0.3 + v / 8)); r._onda = 0.22; }
      } else if (v > 1.5 && (piso === 'estrada' || piso === 'areia' || (piso === 'grama' && v > 6) ||
                             (piso === 'asfalto' && buggy.derrapagem > 0.3))) {
        // poeira da estrada de chão (na grama só um pouco, e só rápido); areia levanta mais; no asfalto só derrapando
        const base = piso === 'estrada' ? 1 : piso === 'areia' ? 1.5 : piso === 'asfalto' ? 0.5 : 0.15;
        const extra = 1 + 2.5 * (r.patina ?? 0) + 1.5 * buggy.derrapagem;
        acc += dt * base * (r.frente ? 8 : 22) * Math.min(1, v / 12) * extra;
        while (acc >= 1) {
          acc -= 1;
          fx.poeira.emitir(x + tras.x * 0.35 + rnd(0.2), y + 0.15, z + tras.z * 0.35 + rnd(0.2),
            tras.x * v * 0.18 + rnd(0.6), 0.4 + Math.random() * 0.8, tras.z * v * 0.18 + rnd(0.6));
        }
      } else if (v > 1.5 && piso === 'lama') {
        acc += dt * 30 * Math.min(1, v / 10) * (1 + 2 * (r.patina ?? 0));
        while (acc >= 1) {
          acc -= 1;
          fx.barro.emitir(x + tras.x * 0.3, y + 0.1, z + tras.z * 0.3,
            tras.x * v * 0.35 + rnd(1), 1.5 + Math.random() * 2.5, tras.z * v * 0.35 + rnd(1));
        }
      } else acc = 0;
      acumulado.set(r, acc);
    }
  }

  function efeitosPes(dt, personagens) {
    for (const p of personagens) {
      const y = alturaChao(p.x, p.z);
      if (p.y - y > 1.5) { pesAnt.delete(p); continue; }        // voando: não amassa
      const pp = new THREE.Vector3(p.x, y, p.z);
      const ant = pesAnt.get(p);
      if (ant && ant.distanceTo(pp) > 0.02) {
        trilha(ant, pp, 0.22, 0.75, 0);
        const prof = profundidade(p.x, p.z);
        if (prof > 0.03) {
          p._onda = (p._onda ?? 0) - dt;
          if (p._onda <= 0) { onda(p.x, p.z, 0.5); p._onda = 0.35; }
        }
      }
      pesAnt.set(p, pp);
    }
  }

  const inicioCarro = dadosMapa?.inicio
    ? { posicao: new THREE.Vector3(dadosMapa.inicio[0], dadosMapa.inicio[1], dadosMapa.inicio[2]).applyMatrix4(M), rumo: dadosMapa.inicio[3] }
    : { posicao: new THREE.Vector3(), rumo: 0 };

  // ---------------------------------------------------------------- estado
  let impactoIdx = 0, proxRaio = 4 + Math.random() * 6, clarao = 0, tempoRaio = 99;
  let cenaAtiva = null, anterior = null;
  const lista = [];
  const ultimoSacode = new WeakMap();
  const api = {
    uniforms: U,
    colisores: { capsulas, copas, baixos, caixas },
    dados: dadosMapa,            // userData.mapa inteiro (o desafio lê largada, checkpoints, chegada, zonas...)
    corNevoa,                    // cor base da névoa/céu (pode ser trocada aos poucos, ex.: deserto mais quente)
    luzes,
    chuva,
    agua: aguaMat,
    nivelAgua,
    limite: meiaBorda,
    alturaChao: (x, z) => alturaChao(x, z),
    superficie,                  // (x, z) => { tipo: 'grama'|'estrada'|'lama'|'agua', mu }
    profundidade,                // (x, z) => metros de água (0 fora do lago)
    inicioCarro,                 // { posicao, rumo } — na estrada
    estrada: dadosMapa?.estrada ?? null,
    efeitos: fx,
    pisada: pisTex,
    amassar: (pos, raio = 0.3, forca = 1) => carimbo(pos.x, pos.z, raio, forca, 0),
    onda,
    onRelampago: null,

    /** Escala do grupo onde o mapa (e o buggy) ficam no jogo: os shaders trabalham em metros do mapa. */
    definirEscala(e) { U.uEscala.value = e; },

    // tudo que o Buggy (carro.js) precisa do mapa (em metros do mapa = coordenadas do buggy)
    paraBuggy() {
      return {
        alturaChao: (x, z) => alturaChao(x, z),
        resolverColisao: (p, r, o) => api.resolverColisao(p, r, o),
        superficie, profundidade,
      };
    },

    /** Põe névoa, fundo e luzes do mapa na cena (guarda o que havia antes). */
    ativar(cena) {
      if (cenaAtiva) return;
      cenaAtiva = cena;
      anterior = { fog: cena.fog, background: cena.background };
      nevoa.density = neblinaBase / U.uEscala.value;      // a névoa é por metro do mapa
      cena.fog = nevoa;
      cena.background = fundo;
      if (luzes.hemi) cena.add(luzes.hemi);
      if (luzes.lua) cena.add(luzes.lua);
      cena.add(luzes.raio);
      if (chuva) cena.add(chuva);
    },

    /** Tira o ambiente do mapa e devolve o que a cena tinha antes de ativar(). */
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

    // update(dt, { veiculos: [buggy, moto], personagens }) — personagens = pés (Vector3 em metros do mapa, sempre o mesmo objeto)
    // (o jeito antigo { buggy } continua valendo)
    update(dt, args = {}, raio = raioToque) {
      const t = (U.uTempo.value += dt);
      const personagens = Array.isArray(args) ? args : (args.personagens ?? []);
      const veiculos = Array.isArray(args) ? [] : (args.veiculos ?? (args.buggy ? [args.buggy] : [])).filter(Boolean);
      const posicoes = personagens.slice();
      for (const v of veiculos) {
        // o veículo também empurra juncos/arbustos altos (frente e traseira)
        const f = v.frente.clone();
        const pontas = v.tipo === 'moto' ? [0.8, -0.8] : [1.6, -1.4];
        for (const o of pontas) posicoes.push(new THREE.Vector3(v.pos.x + f.x * o, v.pos.y + 0.5, v.pos.z + f.z * o));
        efeitosCarro(dt, v);
      }
      efeitosPes(dt, personagens);
      for (const k in fx) fx[k].update(dt);
      atualizarPisada(dt);
      // rajadas: ruído lento de 3 senos
      const r = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.91 + 1.3) * 0.3 + Math.sin(t * 2.3 + 0.4) * 0.2;
      U.uRajada.value = Math.max(0, r) ** 1.5;
      const n = Math.min(posicoes.length, MAX_TOQUES);
      for (let i = 0; i < n; i++) { const p = posicoes[i]; U.uToques.value[i].set(p.x, p.y, p.z, raio); }
      U.uNumToques.value = n;
      for (let i = 0; i < MAX_IMPACTOS; i++) U.uImpactoT.value[i] += dt;
      // relâmpago (desligado por padrão neste mapa)
      if (opcoes.relampagos === true && cenaAtiva) {
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

    relampago() { tempoRaio = 0; },

    // Empurra uma esfera (personagem) para fora de troncos, copas e obstáculos baixos, e a mantém acima do chão.
    //   posicao  Vector3 = CENTRO do personagem (é alterado no lugar)
    //   raio     raio da esfera do personagem
    //   op.chao  true = não deixa afundar no chão (padrão true; anda dentro do lago raso, pisando no fundo)
    //   op.sacudir  true = ao bater numa copa, sacode as folhas (padrão true)
    //   op.anterior Vector3 com a posição do quadro anterior: se ficar "entalado" entre copas, volta para lá
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
        const yc = alturaChao(posicao.x, posicao.z) + raio;
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
          } else if (c.tipo === 'caixa') {
            // slabs no referencial da caixa
            const ox = origem.x - c.x, oz = origem.z - c.z;
            const lox = ox * c.cos - oz * c.sin, loz = ox * c.sin + oz * c.cos;
            const ldx = dir.x * c.cos - dir.z * c.sin, ldz = dir.x * c.sin + dir.z * c.cos;
            let t0 = 0, t1 = Infinity, eixo = 'y';
            for (const [o, d, mn, mx, nome] of [[lox, ldx, -c.hx, c.hx, 'x'], [origem.y, dir.y, c.y, c.y + c.altura, 'y'], [loz, ldz, -c.hz, c.hz, 'z']]) {
              if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { t0 = Infinity; break; } continue; }
              let ta = (mn - o) / d, tb = (mx - o) / d;
              if (ta > tb) [ta, tb] = [tb, ta];
              if (ta > t0) { t0 = ta; eixo = nome; }
              t1 = Math.min(t1, tb);
            }
            if (t0 <= t1 && t0 !== Infinity) {
              th = t0;
              const lnx = eixo === 'x' ? -Math.sign(ldx) : 0, lnz = eixo === 'z' ? -Math.sign(ldz) : 0;
              n = new THREE.Vector3(lnx * c.cos + lnz * c.sin, eixo === 'y' ? -Math.sign(dir.y) : 0, -lnx * c.sin + lnz * c.cos);
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
        if (y < Math.max(alturaChao(x, z), profundidade(x, z) > 0 ? nivelAgua : -1e9)) {
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
