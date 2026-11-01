import * as THREE from 'three';

/* ═══════════════════════════════════════
   SELVA (mapa do modo Cegonha Killer)
   Vento e toque na vegetação do selva.glb + altura do terreno + troncos.

   O selva.glb guarda em cada vértice da vegetação três números
   (_SWAY = quanto balança com o vento, _TOQUE = quanto se dobra ao ser
   tocado, _PHASE = fase aleatória da planta). O GLTFLoader passa esses
   nomes para minúsculas (_sway, _toque, _phase). Este módulo injeta no
   material um trecho de shader que move os vértices na GPU, então a
   vegetação reage a quem passa sem animação pré-gravada.
═══════════════════════════════════════ */
const MAX_TOQUES = 12;          // personagens que empurram a vegetação ao mesmo tempo
const MAX_IMPACTOS = 4;
const HEIGHT_CELL = 0.5;        // tamanho da célula do mapa de altura (m)

const isVegetacao = (obj) => obj.isMesh && !!obj.geometry.attributes._sway;
const isTronco = (obj) => /^Tronco_\d+/.test(obj.name);

/**
 * Mapa de altura do terreno: para cada célula da grade guarda o Y mais alto
 * dos vértices do chão (malhas sem vegetação e fora dos troncos). Ler a
 * altura vira uma consulta de tabela, sem raycast por frame.
 */
function criarMapaDeAltura(raiz) {
  const pontos = [];
  const v = new THREE.Vector3();
  const box = new THREE.Box3();

  // Se houver malhas com nome de terreno, só elas contam (evita andar por cima de
  // copas/pedras soltas); senão, vale tudo que não é vegetação nem tronco
  const candidatas = [];
  raiz.traverse(obj => {
    if (!obj.isMesh || isVegetacao(obj)) return;
    for (let o = obj; o; o = o.parent) if (isTronco(o)) return;
    candidatas.push(obj);
  });
  const nomeTerreno = /ch[aã]o|terreno|solo|ground|terrain|floor/i;
  const terreno = candidatas.filter(o => nomeTerreno.test(o.name) || nomeTerreno.test(o.parent?.name ?? ''));

  (terreno.length ? terreno : candidatas).forEach(obj => {
    const pos = obj.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      pontos.push(v.x, v.y, v.z);
      box.expandByPoint(v);
    }
  });

  if (!pontos.length) return null;

  const nx = Math.max(1, Math.ceil((box.max.x - box.min.x) / HEIGHT_CELL) + 1);
  const nz = Math.max(1, Math.ceil((box.max.z - box.min.z) / HEIGHT_CELL) + 1);
  const alturas = new Float32Array(nx * nz).fill(-Infinity);

  for (let i = 0; i < pontos.length; i += 3) {
    const cx = Math.round((pontos[i] - box.min.x) / HEIGHT_CELL);
    const cz = Math.round((pontos[i + 2] - box.min.z) / HEIGHT_CELL);
    const k = cz * nx + cx;
    if (pontos[i + 1] > alturas[k]) alturas[k] = pontos[i + 1];
  }

  // Células sem vértice (terreno de baixa resolução) herdam dos vizinhos
  for (let passada = 0; passada < 64; passada++) {
    let vazias = 0;
    const copia = alturas.slice();
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const k = z * nx + x;
        if (copia[k] !== -Infinity) continue;
        let soma = 0, n = 0;
        if (x > 0 && copia[k - 1] !== -Infinity) { soma += copia[k - 1]; n++; }
        if (x < nx - 1 && copia[k + 1] !== -Infinity) { soma += copia[k + 1]; n++; }
        if (z > 0 && copia[k - nx] !== -Infinity) { soma += copia[k - nx]; n++; }
        if (z < nz - 1 && copia[k + nx] !== -Infinity) { soma += copia[k + nx]; n++; }
        if (n) alturas[k] = soma / n;
        else vazias++;
      }
    }
    if (!vazias) break;
  }

  const amostra = (x, z) => {
    const h = alturas[THREE.MathUtils.clamp(z, 0, nz - 1) * nx + THREE.MathUtils.clamp(x, 0, nx - 1)];
    return h === -Infinity ? 0 : h;
  };

  return {
    limites: box,
    // Interpolação bilinear; fora do terreno usa a borda mais próxima
    alturaEm(x, z) {
      const fx = (x - box.min.x) / HEIGHT_CELL;
      const fz = (z - box.min.z) / HEIGHT_CELL;
      const x0 = Math.floor(fx), z0 = Math.floor(fz);
      const tx = fx - x0, tz = fz - z0;
      const a = amostra(x0, z0), b = amostra(x0 + 1, z0);
      const c = amostra(x0, z0 + 1), d = amostra(x0 + 1, z0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
    },
  };
}

export function prepararSelva(raiz, opcoes = {}) {
  const raioToque = opcoes.raioToque ?? 1.1;       // alcance do "encostar" (metros)

  const uniforms = {
    uTempo:      { value: 0 },
    uVentoDir:   { value: new THREE.Vector2(1, 0.35).normalize() },
    uVentoForca: { value: opcoes.vento ?? 1.0 },
    uToques:     { value: Array.from({ length: MAX_TOQUES }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uNumToques:  { value: 0 },
    uImpactos:   { value: Array.from({ length: MAX_IMPACTOS }, () => new THREE.Vector4(0, -999, 0, 0)) },
    uImpactoT:   { value: new Array(MAX_IMPACTOS).fill(99) },
  };

  const declaracoes = /* glsl */`
    attribute float _sway;
    attribute float _toque;
    attribute float _phase;
    uniform float uTempo;
    uniform vec2  uVentoDir;
    uniform float uVentoForca;
    uniform vec4  uToques[${MAX_TOQUES}];
    uniform int   uNumToques;
    uniform vec4  uImpactos[${MAX_IMPACTOS}];
    uniform float uImpactoT[${MAX_IMPACTOS}];
  `;

  const deslocamento = /* glsl */`
    vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
    float t = uTempo;
    // vento: ondas lentas + rajadas + tremidinha das folhas
    float onda = sin(t * 1.3 + _phase + wp.x * 0.07 + wp.z * 0.05) * 0.6
               + sin(t * 2.7 + _phase * 1.7 + wp.z * 0.11) * 0.25
               + (sin(t * 0.35 + wp.x * 0.02) * 0.5 + 0.5) * 0.7;
    vec2 off = uVentoDir * onda * uVentoForca * _sway;
    off += vec2(sin(t * 7.0 + _phase * 3.0 + wp.y * 2.0), cos(t * 6.3 + _phase * 2.0 + wp.x))
           * 0.035 * _sway * uVentoForca;
    // toque: a planta se afasta de quem está perto e abaixa um pouco
    vec2 empurra = vec2(0.0);
    for (int i = 0; i < ${MAX_TOQUES}; i++) {
      if (i >= uNumToques) break;
      vec4 p = uToques[i];
      vec2 d = wp.xz - p.xz;
      float dist = length(d);
      float f = clamp(1.0 - dist / p.w, 0.0, 1.0);
      if (dist > 1e-4) empurra += (d / dist) * f * f;
    }
    // impactos (tiros, quedas): sacode e balança alguns instantes
    for (int i = 0; i < ${MAX_IMPACTOS}; i++) {
      float it = uImpactoT[i];
      if (it > 3.0) continue;
      vec4 p = uImpactos[i];
      vec2 d = wp.xz - p.xz;
      float dist = length(d);
      float f = clamp(1.0 - dist / p.w, 0.0, 1.0) * exp(-it * 1.8) * sin(it * 18.0 - dist * 2.0);
      if (dist > 1e-4) empurra += (d / dist) * f * 0.8;
      off += uVentoDir * f * _sway * 1.5;
    }
    float tq = length(empurra) > 1.0 ? 1.0 / length(empurra) : 1.0;
    off += empurra * tq * _toque;
    vec3 offW = vec3(off.x, -length(empurra * tq) * _toque * 0.45, off.y);
    transformed += inverse(mat3(modelMatrix)) * offW;
  `;

  const colisores = [];
  const tmp = new THREE.Vector3();
  const tmpEscala = new THREE.Vector3();
  raiz.updateMatrixWorld(true);

  raiz.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
    if (isVegetacao(obj)) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const novos = mats.map((m) => {
        const mat = m.clone();
        mat.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, uniforms);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\n' + declaracoes)
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + deslocamento);
        };
        mat.customProgramCacheKey = () => 'selva-vento';
        return mat;
      });
      obj.material = Array.isArray(obj.material) ? novos : novos[0];
      obj.frustumCulled = true;
      // a caixa de culling precisa considerar o balanço
      obj.geometry.computeBoundingSphere();
      obj.geometry.boundingSphere.radius += 1.0;
    }
    if (isTronco(obj)) {
      obj.getWorldPosition(tmp);
      // raio salvo em metros do mapa original: acompanha a escala aplicada na raiz
      const escala = obj.getWorldScale(tmpEscala).x;
      colisores.push({ x: tmp.x, z: tmp.z, raio: (obj.userData.raio ?? 0.5) * escala });
    }
  });

  const terreno = criarMapaDeAltura(raiz);
  let impactoIdx = 0;

  return {
    uniforms,
    colisores,
    limites: terreno?.limites ?? null,

    /** Altura do chão da selva em (x, z). Sem terreno, devolve 0. */
    alturaEm(x, z) {
      return terreno ? terreno.alturaEm(x, z) : 0;
    },

    update(dt, posicoes = [], raio = raioToque) {
      uniforms.uTempo.value += dt;
      const n = Math.min(posicoes.length, MAX_TOQUES);
      for (let i = 0; i < n; i++) {
        const p = posicoes[i];
        uniforms.uToques.value[i].set(p.x, p.y, p.z, raio);
      }
      uniforms.uNumToques.value = n;
      const it = uniforms.uImpactoT.value;
      for (let i = 0; i < MAX_IMPACTOS; i++) it[i] += dt;
    },

    vento(forca = 1, direcao = null) {
      uniforms.uVentoForca.value = forca;
      if (direcao) uniforms.uVentoDir.value.copy(direcao).normalize();
    },

    impacto(posicao, raio = 2.5) {
      uniforms.uImpactos.value[impactoIdx].set(posicao.x, posicao.y, posicao.z, raio);
      uniforms.uImpactoT.value[impactoIdx] = 0;
      impactoIdx = (impactoIdx + 1) % MAX_IMPACTOS;
    },

    // Empurra um personagem para fora dos troncos (x/z)
    resolverColisao(posicao, raioPersonagem = 0.4) {
      for (const c of colisores) {
        const dx = posicao.x - c.x, dz = posicao.z - c.z;
        const min = c.raio + raioPersonagem;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          posicao.x = c.x + (dx / d) * min;
          posicao.z = c.z + (dz / d) * min;
        }
      }
    },
  };
}
