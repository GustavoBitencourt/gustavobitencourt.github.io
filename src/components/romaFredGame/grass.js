import * as THREE from 'three';

/*
  Grama e plantas baixas da mata que se dobram quando o Romanele ou um dinossauro passa,
  e balançam com o vento. Funciona direto nas malhas instanciadas do GLB
  (EXT_mesh_gpu_instancing): o vertex shader empurra cada planta para fora do caminho de
  quem está perto, mais forte na ponta do que na base. O Romanele deixa um rastro curto
  que volta ao lugar aos poucos; dino caído amassa a grama em volta.

  Uso:
    const grass = createGrass(gltf.scene);
    grass.update(dt, { x, z }, [{ x, z, r, s }]);   // a cada quadro
*/

const MAX = 20;            // personagens + pontos de rastro por quadro
const TRAIL_EVERY = 0.2;   // s entre pontos do rastro
const TRAIL_LIFE = 1.4;    // s até a planta voltar ao lugar
// [nome do nó, altura da planta no espaço do modelo]
const PLANTS = [[/Capim/, 0.66], [/Folhinhas/, 0.76], [/Cavalinha/, 1.27], [/Samambaia\d/, 1.0], [/Arbusto/, 1.6]];

export function createGrass(root) {
  const shared = {
    uBend: { value: Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 1, 0)) },
    uBendN: { value: 0 },
    uWindT: { value: 0 },
  };
  const mats = new Map();
  let count = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const name = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    const hit = PLANTS.find(([re]) => re.test(name));
    if (!hit) return;
    const h = hit[1], key = `${o.material.uuid}:${h}`;
    let m = mats.get(key);
    if (!m) {
      m = o.material.clone();
      const uPlantH = { value: h };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, shared, { uPlantH });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
uniform vec4 uBend[${MAX}];
uniform int uBendN;
uniform float uWindT;
uniform float uPlantH;`)
          .replace('#include <project_vertex>', `
vec4 bw = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  bw = instanceMatrix * bw;
#endif
bw = modelMatrix * bw;
float hk = clamp( transformed.y / uPlantH, 0.0, 1.0 ); hk *= hk;   // a base fica presa no chão
// vento
float ph = uWindT * 1.6 + bw.x * 0.35 + bw.z * 0.27;
bw.x += ( sin( ph ) * 0.6 + sin( ph * 2.3 + 1.7 ) * 0.25 ) * 0.07 * hk * uPlantH;
bw.z += cos( ph * 0.8 ) * 0.05 * hk * uPlantH;
// quem passa empurra a planta para fora e para baixo
for ( int i = 0; i < ${MAX}; i ++ ) {
  if ( i >= uBendN ) break;
  vec4 a = uBend[ i ];               // x, z, raio, força
  vec2 d = bw.xz - a.xy;
  float dist = length( d );
  float f = ( 1.0 - smoothstep( a.z * 0.2, a.z, dist ) ) * a.w;
  if ( f > 0.0 ) {
    vec2 dir = dist > 0.001 ? d / dist : vec2( 0.0, 1.0 );
    bw.xz += dir * f * 0.65 * hk * uPlantH;
    bw.y -= f * 0.55 * hk * uPlantH;
  }
}
vec4 mvPosition = viewMatrix * bw;
gl_Position = projectionMatrix * mvPosition;`);
      };
      m.customProgramCacheKey = () => `planta-dobra-${h}`;
      mats.set(key, m);
    }
    o.material = m; count += 1;
  });

  const trail = [];
  let trailT = 0;
  function update(dt, player, others = []) {
    shared.uWindT.value += dt;
    trailT += dt;
    for (const t of trail) t.age += dt;
    while (trail.length && trail[0].age > TRAIL_LIFE) trail.shift();
    if (player && trailT > TRAIL_EVERY) {
      trailT = 0;
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last.x - player.x, last.z - player.z) > 0.3) trail.push({ x: player.x, z: player.z, age: 0 });
    }
    const U = shared.uBend.value;
    let n = 0;
    if (player) U[n++].set(player.x, player.z, 0.8, 1);
    for (const o of others) { if (n >= MAX) break; U[n++].set(o.x, o.z, o.r, o.s === undefined ? 1 : o.s); }
    for (let i = trail.length - 1; i >= 0 && n < MAX; i--) {
      const t = trail[i]; U[n++].set(t.x, t.z, 0.65, 0.85 * (1 - t.age / TRAIL_LIFE));
    }
    shared.uBendN.value = n;
  }

  return { update, count: () => count };
}
