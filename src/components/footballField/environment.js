import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const PROBE = 24;
const SKY_LAYER = 1;

// Céu físico (modelo de Preetham + nuvens) e a luz que ele joga no gramado.
// A cor do céu e do horizonte é medida do próprio céu renderizado, então a
// iluminação da grama acompanha a hora do dia.
export class Environment {
  constructor(renderer, scene, turf) {
    this.renderer = renderer;
    this.scene = scene;
    this.turf = turf;
    this.params = { hour: 15.5, clouds: 0.3 };

    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    this.sky.layers.enable(SKY_LAYER);
    scene.add(this.sky);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 3.2;
    su.rayleigh.value = 1.6;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.82;
    su.cloudScale.value = 0.00022;
    su.cloudSpeed.value = 0.00004;
    su.cloudDensity.value = 0.45;
    su.cloudElevation.value = 0.5;

    this.probeCam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
    this.probeCam.layers.set(SKY_LAYER);
    this.probeRT = new THREE.WebGLRenderTarget(PROBE, PROBE, { type: THREE.FloatType, depthBuffer: false });
    this.buf = new Float32Array(PROBE * PROBE * 4);
    this.sunDir = new THREE.Vector3();
    this.update();
  }

  dispose() {
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.probeRT.dispose();
  }

  setTime(t) {
    this.sky.material.uniforms.time.value = t;
  }

  update() {
    const { hour, clouds } = this.params;
    // arco do sol: nasce do lado -X, passa pelo lado +Z e se põe do lado +X
    const t = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1);
    const el = THREE.MathUtils.degToRad(1.5 + 60 * Math.sin(Math.PI * t));
    const az = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-105, 105, t));
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));

    const su = this.sky.material.uniforms;
    su.sunPosition.value.copy(this.sunDir);
    su.cloudCoverage.value = clouds;

    // cor do sol: extinção atmosférica cresce quando ele está baixo
    const sinEl = Math.sin(el);
    const elDeg = THREE.MathUtils.radToDeg(el);
    const airmass = 1 / (sinEl + 0.15 * Math.pow(elDeg + 3.885, -1.253));
    const tau = [0.07, 0.115, 0.235];
    const K = Environment.SUN_K * (1 - 0.35 * clouds);
    const sun = tau.map((x) => K * Math.exp(-x * airmass));

    const { ambient, horizon } = this._probe();

    const u = this.turf.u;
    u.uSunDir.value.copy(this.sunDir);
    u.uSunColor.value.setRGB(sun[0], sun[1], sun[2]);
    u.uSkyColor.value.setRGB(ambient[0], ambient[1], ambient[2]);
    for (let i = 0; i < 4; i++) u.uHorizon.value[i].fromArray(horizon[i]);
    // luz rebatida pelo próprio gramado
    const g = [0.045, 0.11, 0.025];
    u.uBounceColor.value.setRGB(
      g[0] * (sun[0] * sinEl + ambient[0]) * 0.6,
      g[1] * (sun[1] * sinEl + ambient[1]) * 0.6,
      g[2] * (sun[2] * sinEl + ambient[2]) * 0.6,
    );
    // sol baixo = sombras mais fundas entre as lâminas
    u.uShadowK.value = 0.65 / Math.max(sinEl, 0.12);
    // base perpendicular ao sol, usada para projetar as sombras entre as lâminas
    const a = u.uSunA.value.set(0, 1, 0).cross(this.sunDir).normalize();
    u.uSunB.value.crossVectors(this.sunDir, a).normalize();
    this.ambient = ambient;
    // exposição automática: acompanha a luz total (sol + céu) como uma câmera faria
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    this.light = lum(sun) * sinEl + lum(ambient);
    this.exposure = THREE.MathUtils.clamp(Environment.EXPOSURE * Math.pow(Environment.LIGHT_REF / this.light, 0.85), 0.1, 2.5);
    this.turf.bakeDirty = true;
  }

  // Renderiza só o céu em 5 direções e integra: luz ambiente (média ponderada
  // pelo cosseno sobre o hemisfério) e cor do horizonte em 4 quadrantes.
  _probe() {
    const r = this.renderer;
    const su = this.sky.material.uniforms;
    const cam = this.probeCam;
    const prevTarget = r.getRenderTarget();
    const disc = su.showSunDisc.value;
    su.showSunDisc.value = 0;

    const amb = [0, 0, 0];
    let ambW = 0;
    const hor = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const horW = [0, 0, 0, 0];
    const axes = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const looks = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 1, 0]];
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const d = new THREE.Vector3();

    for (const l of looks) {
      cam.position.set(0, 0, 0);
      cam.up.set(0, 1, 0);
      if (l[1] === 1) cam.up.set(0, 0, -1);
      cam.lookAt(l[0], l[1], l[2]);
      cam.updateMatrixWorld(true);
      r.setRenderTarget(this.probeRT);
      r.render(this.scene, cam); // a câmera de medição só enxerga a camada do céu
      r.readRenderTargetPixels(this.probeRT, 0, 0, PROBE, PROBE, this.buf);
      cam.matrixWorld.extractBasis(right, up, fwd);
      fwd.negate();
      for (let j = 0; j < PROBE; j++) {
        for (let i = 0; i < PROBE; i++) {
          const x = ((i + 0.5) / PROBE) * 2 - 1;
          const y = ((j + 0.5) / PROBE) * 2 - 1;
          d.copy(fwd).addScaledVector(right, x).addScaledVector(up, y);
          const len = d.length();
          const dw = 1 / (len * len * len);
          d.divideScalar(len);
          const o = (j * PROBE + i) * 4;
          const c = [this.buf[o], this.buf[o + 1], this.buf[o + 2]];
          if (!Number.isFinite(c[0] + c[1] + c[2])) continue;
          if (d.y > 0) {
            const w = dw * d.y;
            amb[0] += c[0] * w; amb[1] += c[1] * w; amb[2] += c[2] * w;
            ambW += w;
          }
          if (d.y > 0.004 && d.y < 0.07) {
            for (let k = 0; k < 4; k++) {
              const w = Math.max(d.x * axes[k][0] + d.z * axes[k][1], 0) ** 4 * dw;
              hor[k][0] += c[0] * w; hor[k][1] += c[1] * w; hor[k][2] += c[2] * w;
              horW[k] += w;
            }
          }
        }
      }
    }
    su.showSunDisc.value = disc;
    r.setRenderTarget(prevTarget);
    let ambient = amb.map((v) => v / Math.max(ambW, 1e-6));
    let horizon = hor.map((h, k) => h.map((v) => v / Math.max(horW[k], 1e-6)));
    // se a placa não deixar ler texturas em ponto flutuante, usa um céu claro típico
    const ok = (c) => c.every(Number.isFinite) && c[0] + c[1] + c[2] > 1e-3;
    if (!ok(ambient) || !horizon.every(ok)) {
      ambient = [0.95, 1.85, 3.6];
      horizon = [[3.2, 3.4, 3.6], [3.2, 3.4, 3.6], [3.2, 3.4, 3.6], [3.2, 3.4, 3.6]];
    }
    // o modelo de céu é bem azul; na prática a luz difusa inclui névoa, nuvens e reflexos
    const luma = 0.2126 * ambient[0] + 0.7152 * ambient[1] + 0.0722 * ambient[2];
    ambient = ambient.map((v) => v + (luma - v) * 0.4);
    return { ambient, horizon };
  }
}

// intensidade do sol direto em relação à radiância do céu
Environment.SUN_K = 16.0;
// exposição de referência e a luz total (sol + céu) em que ela vale
Environment.EXPOSURE = 0.21;
Environment.LIGHT_REF = 8.7;
