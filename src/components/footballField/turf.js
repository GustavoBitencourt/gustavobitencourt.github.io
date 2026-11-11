import * as THREE from 'three';
import { PITCH, QUALITY, BLADE_WIDTH_RATIO, COLORS } from './config.js';
import { bladeVert, bladeFrag, groundVert, groundFrag, surroundFrag, TABLE_Y0 } from './shaders.js';

const RING_COUNT = 4;
const SHIFT = 0.6;          // quanto cada anel é deslocado para a frente da câmera

// Textura distante: as próprias lâminas vistas de cima, num ladrilho que se repete.
const BAKE_CELLS = 128;
const BAKE_PAD = 6;
const BAKE_SIZE = 1024;

// Tabela de aparência: o mesmo tapete medido de 16 azimutes × 8 elevações, para as
// duas inclinações de faixa. Cada medição ocupa uma célula de 64 × 64 px; o nível 6
// do mipmap devolve a média de cada célula.
const TABLE_CELLS = 48;
const TABLE_AZ = 16;
const TABLE_EL = 8;
const TABLE_PX = 64;

const smoothstep = (x, a, b) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const lin = (c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);

function bladeGeometry(segs) {
  const g = new THREE.InstancedBufferGeometry();
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Textura de ruído: RGB = ruído branco (variação, grão); A = ruído suave com
// distribuição uniforme, usado como máscara das sombras entre as lâminas.
function noiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);

  const grid = 64;
  const lattice = new Float32Array(grid * grid);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const at = (x, y) => lattice[((y + grid) % grid) * grid + ((x + grid) % grid)];
  const cubic = (a, b, c, d, t) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  const smooth = new Float32Array(size * size);
  const scale = grid / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const rows = [];
      for (let j = -1; j <= 2; j++) rows.push(cubic(at(ix - 1, iy + j), at(ix, iy + j), at(ix + 1, iy + j), at(ix + 2, iy + j), tx));
      smooth[y * size + x] = cubic(rows[0], rows[1], rows[2], rows[3], ty);
    }
  }
  // equaliza: cada valor vira o seu percentil, para a fração iluminada ser exata
  const order = Array.from(smooth.keys()).sort((a, b) => smooth[a] - smooth[b]);
  order.forEach((idx, rank) => { data[idx * 4 + 3] = Math.round((rank / (order.length - 1)) * 255); });

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export class Turf {
  constructor(renderer) {
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.rings = [];
    this.quality = null;
    this.bakeDirty = true;
    this.debugNoBlades = false;

    const v2 = () => new THREE.Vector2();
    const v3 = () => new THREE.Vector3();
    this.noise = noiseTexture();
    // uniformes compartilhados por todos os materiais (mesmos objetos {value})
    this.u = {
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() },
      uSunColor: { value: new THREE.Color(3, 3, 3) },
      uSkyColor: { value: new THREE.Color(0.5, 0.6, 0.8) },
      uBounceColor: { value: new THREE.Color(0.05, 0.1, 0.03) },
      uSunA: { value: new THREE.Vector3(1, 0, 0) },
      uSunB: { value: new THREE.Vector3(0, 0, 1) },
      uShadowK: { value: 2.5 },
      uAoBase: { value: 0.5 },
      uHorizon: { value: [v3(), v3(), v3(), v3()] },
      uHazeK: { value: 1 / 1500 },
      uColRoot: { value: lin(COLORS.root) },
      uColMid: { value: lin(COLORS.mid) },
      uColTip: { value: lin(COLORS.tip) },
      uColDry: { value: lin(COLORS.dry) },
      uColPaint: { value: lin(COLORS.paint) },
      uNoise: { value: this.noise },
      uPattern: { value: 0 },
      uStripeK: { value: 0.04 },
      uCutH: { value: 0.025 },
      uLeanMow: { value: 0.35 },
      uLeanRand: { value: 0.55 },
      uTime: { value: 0 },
      uWind: { value: 0.35 },
      uPxScale: { value: 0.001 },
      uShowLines: { value: 1 },
      uRC: { value: [v2(), v2(), v2(), v2()] },
      uRR: { value: [1, 1, 1, 1] },
      uRG: { value: [1, 1, 1, 1] },
    };

    this._buildBake();
    this._buildGround();
  }

  // ---- anéis de lâminas -------------------------------------------------

  setQuality(name) {
    const q = QUALITY[name];
    if (!q) return;
    this.quality = name;
    for (const r of this.rings) {
      this.group.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    this.rings = [];
    for (let k = 0; k < RING_COUNT; k++) {
      const cell = q.cell * 2 ** k;
      const geo = bladeGeometry(q.segs[k]);
      geo.instanceCount = q.n * q.n;
      const mat = new THREE.ShaderMaterial({
        vertexShader: bladeVert,
        fragmentShader: bladeFrag,
        side: THREE.DoubleSide,
        uniforms: {
          ...this.u,
          uGridN: { value: q.n },
          uCell: { value: cell },
          uCenterCell: { value: new THREE.Vector2() },
          uRing: { value: k },
          uSwap: { value: false },
          uFlip: { value: false },
          uBladeW: { value: q.cell * BLADE_WIDTH_RATIO * 2 ** k },
          uDepthScale: { value: 0.5 ** k },
          uMeanMix: { value: [0, 0.7, 0.95, 1][k] },
          uTable: { value: this.tableRT.texture },
          uPaintGain: this.groundMat.uniforms.uPaintGain,
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = k;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, cell, R: (q.n * cell) / 2 });
    }
    this.cell = q.cell;
    this.groundMat.uniforms.uTile.value = BAKE_CELLS * q.cell;
    this.bakeDirty = true;
  }

  // ---- texturas geradas a partir das lâminas -----------------------------

  _buildBake() {
    const geo = bladeGeometry(4);
    this.bakeGeo = geo;
    this.bakeMat = new THREE.ShaderMaterial({
      vertexShader: bladeVert,
      fragmentShader: bladeFrag,
      defines: { BAKE: 1 },
      side: THREE.DoubleSide,
      uniforms: {
        ...this.u,
        uGridN: { value: 1 },
        uCell: { value: 0.006 },
        uCenterCell: { value: new THREE.Vector2() },
        uRing: { value: 0 },
        uSwap: { value: false },
        uFlip: { value: false },
        uBladeW: { value: 0.0025 },
        uDepthScale: { value: 1 },
        uBakeLean: { value: new THREE.Vector2() },
        uBakeP: { value: BAKE_CELLS },
        uBakePad: { value: BAKE_PAD },
        uBakeV: { value: new THREE.Vector3(0, 1, 0) },
        uTile: { value: 0.8 },
      },
    });
    const mesh = new THREE.Mesh(geo, this.bakeMat);
    mesh.frustumCulled = false;
    this.bakeScene = new THREE.Scene();
    this.bakeScene.add(mesh);
    this.bakeCam = new THREE.Camera();

    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(BAKE_SIZE, BAKE_SIZE, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        generateMipmaps: true,
        depthBuffer: true,
        samples: 4,
      });
      rt.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return rt;
    };
    this.bakeA = mk();
    this.bakeB = mk();

    this.tableRT = new THREE.WebGLRenderTarget(TABLE_AZ * TABLE_PX, TABLE_EL * 2 * TABLE_PX, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
      depthBuffer: true,
    });
    this.tableRT.scissorTest = true;
  }

  _setBakeGrid(cells, pad) {
    const n = cells + pad * 2;
    const bu = this.bakeMat.uniforms;
    bu.uGridN.value = n;
    bu.uBakeP.value = cells;
    bu.uBakePad.value = pad;
    bu.uTile.value = cells * this.cell;
    this.bakeGeo.instanceCount = n * n;
  }

  bake() {
    this.bakeDirty = false;
    const r = this.renderer;
    const u = this.u;
    const bu = this.bakeMat.uniforms;
    bu.uCell.value = this.cell;
    bu.uBladeW.value = this.cell * BLADE_WIDTH_RATIO;

    const pattern = u.uPattern.value;
    // inclinações das duas variantes de faixa (A = sinal negativo, B = positivo)
    const leans = pattern === 2 ? [[-1, 0], [1, 0]] : pattern === 3 ? [[0, 0], [0, 0]] : [[0, -1], [0, 1]];

    // cor da palha vista entre as lâminas
    const thatch = COLORS.thatch;
    const sun = u.uSunColor.value;
    const sky = u.uSkyColor.value;
    const sunK = Math.max(u.uSunDir.value.y, 0) * 0.25;
    const clear = new THREE.Color(
      thatch[0] * (sun.r * sunK + sky.r * 0.5),
      thatch[1] * (sun.g * sunK + sky.g * 0.5),
      thatch[2] * (sun.b * sunK + sky.b * 0.5),
    );

    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAuto = r.autoClear;
    r.setClearColor(clear, 1);

    // 1) vista de cima, em alta resolução
    r.autoClear = true;
    this._setBakeGrid(BAKE_CELLS, BAKE_PAD);
    bu.uBakeV.value.set(0, 1, 0);
    [this.bakeA, this.bakeB].forEach((rt, i) => {
      bu.uBakeLean.value.set(leans[i][0], leans[i][1]);
      r.setRenderTarget(rt);
      r.render(this.bakeScene, this.bakeCam);
    });

    // 2) tabela de aparência por direção de vista
    const rt = this.tableRT;
    const tex = rt.texture;
    const full = [0, 0, rt.width, rt.height];
    tex.generateMipmaps = false;
    rt.viewport.set(...full);
    rt.scissor.set(...full);
    r.setRenderTarget(rt);
    r.clear();
    r.autoClear = false;
    const reachH = u.uCutH.value * 1.05;
    for (let j = 0; j < TABLE_EL; j++) {
      const y = TABLE_Y0 + (1 - TABLE_Y0) * (j / (TABLE_EL - 1)) ** 2;
      const c = Math.sqrt(Math.max(1 - y * y, 0));
      // as lâminas projetam-se mais longe quanto mais rasante a vista: amplia a margem
      const reach = (reachH * c) / y + u.uCutH.value * 1.4;
      this._setBakeGrid(TABLE_CELLS, Math.ceil(reach / this.cell) + 2);
      for (let v = 0; v < 2; v++) {
        bu.uBakeLean.value.set(leans[v][0], leans[v][1]);
        for (let i = 0; i < TABLE_AZ; i++) {
          const az = (i / TABLE_AZ) * Math.PI * 2;
          bu.uBakeV.value.set(c * Math.cos(az), y, c * Math.sin(az));
          const x0 = i * TABLE_PX;
          const y0 = (v * TABLE_EL + j) * TABLE_PX;
          rt.viewport.set(x0, y0, TABLE_PX, TABLE_PX);
          rt.scissor.set(x0, y0, TABLE_PX, TABLE_PX);
          // os mipmaps são gerados uma única vez, no último desenho
          tex.generateMipmaps = j === TABLE_EL - 1 && v === 1 && i === TABLE_AZ - 1;
          r.setRenderTarget(rt);
          r.render(this.bakeScene, this.bakeCam);
        }
      }
    }
    rt.viewport.set(...full);
    rt.scissor.set(...full);

    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    r.autoClear = prevAuto;
  }

  // ---- solo e entorno ----------------------------------------------------

  _buildGround() {
    const w = PITCH.length + PITCH.margin * 2;
    const d = PITCH.width + PITCH.margin * 2;
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: groundVert,
      fragmentShader: groundFrag,
      uniforms: {
        ...this.u,
        uBakeA: { value: this.bakeA.texture },
        uBakeB: { value: this.bakeB.texture },
        uTable: { value: this.tableRT.texture },
        uTile: { value: 0.8 },
        // brilho do solo sob cada anel: quanto mais densas as lâminas 3D, mais escuro
        uRU: { value: [0.35, 0.9, 1.0, 1.0] },
        uPaintGain: { value: 6.0 },
      },
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.renderOrder = 10;
    this.group.add(ground);

    this.surroundMat = new THREE.ShaderMaterial({
      vertexShader: groundVert,
      fragmentShader: surroundFrag,
      uniforms: {
        uSunDir: this.u.uSunDir,
        uSunColor: this.u.uSunColor,
        uSkyColor: this.u.uSkyColor,
        uHorizon: this.u.uHorizon,
        uHazeK: this.u.uHazeK,
        uNoise: this.u.uNoise,
        uSurround: { value: lin(COLORS.surround) },
      },
    });
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.surroundMat);
    surround.rotation.x = -Math.PI / 2;
    surround.renderOrder = 11;
    this.group.add(surround);
  }

  // ---- por quadro --------------------------------------------------------

  update(camera, time, viewHeightPx) {
    const u = this.u;
    u.uTime.value = time;
    u.uPxScale.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewHeightPx;

    const dir = camera.getWorldDirection(this._dir || (this._dir = new THREE.Vector3()));
    const h = Math.max(camera.position.y, 0);
    const swap = Math.abs(dir.x) > Math.abs(dir.z);
    const flip = (swap ? dir.x : dir.z) < 0;
    const gx = PITCH.length / 2 + PITCH.margin;
    const gz = PITCH.width / 2 + PITCH.margin;

    const frustum = this._frustum || (this._frustum = new THREE.Frustum());
    const box = this._box || (this._box = new THREE.Box3());
    const pv = this._pv || (this._pv = new THREE.Matrix4());
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

    this.rings.forEach((r, k) => {
      const cx = camera.position.x + dir.x * r.R * SHIFT;
      const cz = camera.position.z + dir.z * r.R * SHIFT;
      u.uRC.value[k].set(cx, cz);
      u.uRR.value[k] = r.R;
      // acima da distância útil do anel as lâminas seriam menores que um pixel: some suavemente
      const reach = r.R * (1 + SHIFT);
      const gain = this.debugNoBlades ? 0 : 1 - smoothstep(h, 0.8 * reach, 1.3 * reach);
      u.uRG.value[k] = gain;
      const mu = r.mat.uniforms;
      mu.uCenterCell.value.set(Math.floor(cx / r.cell), Math.floor(cz / r.cell));
      mu.uSwap.value = swap;
      mu.uFlip.value = flip;
      const overlaps = Math.abs(cx) - r.R < gx && Math.abs(cz) - r.R < gz;
      box.min.set(cx - r.R, 0, cz - r.R);
      box.max.set(cx + r.R, 0.06, cz + r.R);
      r.mesh.visible = gain > 0.001 && overlaps && frustum.intersectsBox(box);
    });

    // refaz as texturas quando sol, corte ou qualidade mudam (no máximo ~10 vezes por segundo)
    const now = performance.now();
    if (this.bakeDirty && now - (this._lastBake || -1e9) > 100) {
      this._lastBake = now;
      this.bake();
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.bakeGeo.dispose();
    this.bakeMat.dispose();
    this.bakeA.dispose();
    this.bakeB.dispose();
    this.tableRT.dispose();
    this.noise.dispose();
    this.rings = [];
  }

  get visibleBlades() {
    let n = 0;
    for (const r of this.rings) if (r.mesh.visible) n += r.mesh.geometry.instanceCount;
    return n;
  }
}
