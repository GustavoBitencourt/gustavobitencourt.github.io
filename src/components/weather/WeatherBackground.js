import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import './WeatherBackground.css';

// Paletas do céu [topo, base] por tipo de cena
const PALETTES = {
  clear: { day: ['#1d6fd8', '#8fcdff'], night: ['#02061a', '#17234f'] },
  partly: { day: ['#3a7bd5', '#acd3f3'], night: ['#060b1f', '#1f2b4f'] },
  cloudy: { day: ['#5b7593', '#b9c6d3'], night: ['#0c111d', '#2a3344'] },
  fog: { day: ['#86939f', '#d5dbe0'], night: ['#1a1f27', '#3c444f'] },
  drizzle: { day: ['#4f6479', '#a0b0bf'], night: ['#0b1018', '#26303d'] },
  rain: { day: ['#2d3d50', '#6b7d90'], night: ['#060a12', '#1d2633'] },
  storm: { day: ['#121824', '#3a4356'], night: ['#03050a', '#151b27'] },
  snow: { day: ['#8ea5bd', '#e7eef6'], night: ['#121a2b', '#3b4a63'] }
};
const HOT_DAY = ['#2479e6', '#ffd49a'];

const SCENE_CONFIG = {
  clear: { clouds: { count: 3, tint: 1, opacity: 0.5 }, stars: 280 },
  partly: { clouds: { count: 8, tint: 1, opacity: 0.85 }, stars: 160 },
  cloudy: { clouds: { count: 13, tint: 0.8, opacity: 0.92 }, stars: 25 },
  fog: { clouds: { count: 4, tint: 0.9, opacity: 0.45 }, fog: true },
  drizzle: { clouds: { count: 12, tint: 0.68, opacity: 0.92 }, rain: { count: 420, speed: 650, length: 12, opacity: 0.4 } },
  rain: { clouds: { count: 14, tint: 0.52, opacity: 0.95 }, rain: { count: 1200, speed: 1150, length: 26, opacity: 0.55 } },
  storm: { clouds: { count: 16, tint: 0.32, opacity: 1 }, rain: { count: 1800, speed: 1500, length: 34, opacity: 0.6 }, lightning: true },
  snow: { clouds: { count: 10, tint: 0.85, opacity: 0.85 }, snow: 700 }
};

export const getSkyPalette = ({ type, isDay, hot }) => {
  if (type === 'clear' && isDay && hot) return HOT_DAY;
  const pal = PALETTES[type] || PALETTES.partly;
  return isDay ? pal.day : pal.night;
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const rand = (min, max) => min + Math.random() * (max - min);

// ---------- Shaders ----------
const BASIC_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec3 c = mix(uBottom, uTop, smoothstep(0.0, 1.0, vUv.y));
    c += uFlash * vec3(0.45, 0.5, 0.65) * (0.6 + 0.4 * vUv.y);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

const SUN_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float core = smoothstep(0.1, 0.09, r);
    float halo = exp(-r * 6.0) * 0.9 + exp(-r * 2.2) * 0.22;
    float rays = pow(0.5 + 0.5 * sin(a * 9.0 + uTime * 0.12), 6.0) * 0.6
               + pow(0.5 + 0.5 * sin(a * 15.0 - uTime * 0.18), 8.0) * 0.4;
    rays *= smoothstep(1.0, 0.12, r) * smoothstep(0.07, 0.2, r) * 0.4;
    float pulse = 0.93 + 0.07 * sin(uTime * 1.2);
    vec3 col = mix(vec3(1.0, 0.76, 0.36), vec3(1.0, 0.98, 0.9), clamp(core + halo * 0.7, 0.0, 1.0));
    float alpha = clamp(core + (halo + rays) * pulse, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

const MOON_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float disk = smoothstep(0.3, 0.29, r);
    vec2 q = p / 0.15;
    float cr = 0.0;
    cr += smoothstep(0.28, 0.18, length(q - vec2(-0.3, 0.25))) * 0.16;
    cr += smoothstep(0.2, 0.12, length(q - vec2(0.35, -0.2))) * 0.14;
    cr += smoothstep(0.35, 0.24, length(q - vec2(0.1, -0.45))) * 0.12;
    cr += smoothstep(0.16, 0.09, length(q - vec2(-0.15, -0.1))) * 0.12;
    float shade = 1.0 - 0.28 * smoothstep(-0.6, 1.0, dot(q, vec2(0.7, -0.7)));
    vec3 moon = vec3(0.94, 0.95, 0.99) * shade * (1.0 - cr);
    float glow = exp(-r * 3.4) * 0.5;
    vec3 col = mix(vec3(0.7, 0.8, 1.0), moon, disk);
    gl_FragColor = vec4(col, max(disk, glow) * uOpacity);
    #include <colorspace_fragment>
  }
`;

const POINTS_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPR;
  uniform float uTwinkle;
  varying float vAlpha;
  void main() {
    vAlpha = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.7 + aPhase));
    gl_PointSize = aSize * uPR;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POINTS_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(uColor, a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`;

const overlayMaterialProps = { transparent: true, depthTest: false, depthWrite: false };

// ---------- Texturas ----------
const makeCloudTexture = () => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const blobs = 12 + Math.floor(Math.random() * 6);
  for (let i = 0; i < blobs; i++) {
    const x = rand(100, 412);
    const bump = 1 - Math.abs(x - 256) / 256;
    const y = rand(130, 165) - bump * rand(0, 50);
    const r = rand(35, 70) + bump * 25;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Sombra suave na base da nuvem
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, 70, 0, 240);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(140,150,170,0.6)');
  g.fillStyle = shade;
  g.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// ---------- Elementos da cena ----------
const createSun = (group, env, strength) => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: BASIC_VERT,
    fragmentShader: SUN_FRAG,
    blending: THREE.AdditiveBlending,
    ...overlayMaterialProps
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 2;
  group.add(mesh);
  return {
    update(dt, t) {
      const s = Math.max(env.W, env.H) * 0.8;
      mesh.scale.set(s, s, 1);
      mesh.position.set(env.W * 0.8, env.H * 0.84, 0);
      mat.uniforms.uTime.value = t;
    },
    setFade(f) {
      mat.uniforms.uOpacity.value = f * strength;
    }
  };
};

const createMoon = (group, env) => {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: BASIC_VERT,
    fragmentShader: MOON_FRAG,
    ...overlayMaterialProps
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = 2;
  group.add(mesh);
  return {
    update() {
      const s = clamp(Math.min(env.W, env.H) * 0.55, 260, 520);
      mesh.scale.set(s, s, 1);
      mesh.position.set(env.W * 0.8, env.H * 0.8, 0);
    },
    setFade(f) {
      mat.uniforms.uOpacity.value = f;
    }
  };
};

const createPoints = (count, { size, color, twinkle }, env) => {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    sizes[i] = rand(size[0], size[1]);
    phases[i] = Math.random() * Math.PI * 2;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: env.pr },
      uTwinkle: { value: twinkle },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 }
    },
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    ...overlayMaterialProps
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, positions, sizes, geometry, material };
};

const createStars = (group, env, count) => {
  const { points, positions, material } = createPoints(count, { size: [1, 2.8], color: '#ffffff', twinkle: 0.6 }, env);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = Math.random();
    positions[i * 3 + 1] = rand(0.25, 1);
  }
  points.renderOrder = 1;
  group.add(points);
  return {
    update(dt, t) {
      points.scale.set(env.W, env.H, 1);
      material.uniforms.uTime.value = t;
    },
    setFade(f) {
      material.uniforms.uOpacity.value = f;
    }
  };
};

const createClouds = (group, env, { count, tint, opacity }, drift, heavy) => {
  const textures = [makeCloudTexture(), makeCloudTexture(), makeCloudTexture()];
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const depth = count > 1 ? i / (count - 1) : 1;
    const shade = tint * (0.82 + depth * 0.18);
    const material = new THREE.MeshBasicMaterial({
      map: textures[i % textures.length],
      color: new THREE.Color(shade, shade, Math.min(1, shade * 1.04)),
      ...overlayMaterialProps
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = 3 + depth * 0.9;
    group.add(mesh);
    clouds.push({
      mesh,
      material,
      base: opacity * (0.75 + depth * 0.25),
      wf: rand(0.22, 0.34) + depth * (heavy ? 0.35 : 0.22),
      yf: heavy ? rand(0.55, 1.02) : rand(0.6, 0.95),
      x: Math.random() * env.W,
      speed: (6 + depth * 16) * drift
    });
  }
  return {
    update(dt) {
      clouds.forEach((c) => {
        const w = c.wf * env.W;
        c.x += c.speed * dt;
        if (c.speed > 0 && c.x - w / 2 > env.W) c.x = -w / 2;
        if (c.speed < 0 && c.x + w / 2 < 0) c.x = env.W + w / 2;
        c.mesh.scale.set(w, w * 0.5, 1);
        c.mesh.position.set(c.x, c.yf * env.H, 0);
      });
    },
    setFade(f) {
      clouds.forEach((c) => {
        c.material.opacity = c.base * f;
      });
    }
  };
};

const createFog = (group, env, isDay, drift) => {
  const texture = makeCloudTexture();
  const shade = isDay ? 1 : 0.42;
  const layers = Array.from({ length: 6 }, (_, i) => {
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: new THREE.Color(shade, shade, shade),
      ...overlayMaterialProps
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.renderOrder = 6 + i * 0.1;
    group.add(mesh);
    return {
      mesh,
      material,
      base: rand(0.28, 0.45),
      yf: 0.05 + (i / 5) * 0.55 + rand(-0.05, 0.05),
      wf: rand(1.3, 1.9),
      x: Math.random() * env.W,
      speed: rand(6, 16) * (i % 2 === 0 ? 1 : 0.6) * drift
    };
  });
  return {
    update(dt) {
      layers.forEach((l) => {
        const w = l.wf * env.W;
        l.x += l.speed * dt;
        if (l.speed > 0 && l.x - w / 2 > env.W) l.x = -w / 2;
        if (l.speed < 0 && l.x + w / 2 < 0) l.x = env.W + w / 2;
        l.mesh.scale.set(w, env.H * 0.5, 1);
        l.mesh.position.set(l.x, l.yf * env.H, 0);
      });
    },
    setFade(f) {
      layers.forEach((l) => {
        l.material.opacity = l.base * f;
      });
    }
  };
};

const createRain = (group, env, { count, speed, length, opacity }, slope) => {
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 8);
  const spread = env.H * Math.abs(slope);

  const spawn = (d, initial) => {
    const depth = Math.random();
    d.x = rand(-spread, env.W + spread);
    d.y = initial ? Math.random() * env.H : env.H + Math.random() * env.H * 0.15;
    d.v = speed * (0.55 + depth * 0.6);
    d.len = length * (0.5 + depth * 0.9);
    d.a = opacity * (0.3 + depth * 0.7);
    return d;
  };
  const drops = Array.from({ length: count }, () => spawn({}, true));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const material = new THREE.LineBasicMaterial({ vertexColors: true, ...overlayMaterialProps });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 5;
  group.add(lines);

  const norm = Math.sqrt(1 + slope * slope);
  const nx = slope / norm;
  const ny = -1 / norm;

  return {
    update(dt) {
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        d.x += d.v * slope * dt;
        if (d.y < -d.len) spawn(d, false);
        const p = i * 6;
        positions[p] = d.x - nx * d.len;
        positions[p + 1] = d.y - ny * d.len;
        positions[p + 3] = d.x;
        positions[p + 4] = d.y;
        const c = i * 8;
        colors[c] = 0.7; colors[c + 1] = 0.78; colors[c + 2] = 0.92; colors[c + 3] = 0;
        colors[c + 4] = 0.85; colors[c + 5] = 0.9; colors[c + 6] = 1; colors[c + 7] = d.a;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    setFade(f) {
      material.opacity = f;
    }
  };
};

const createSnow = (group, env, count, slope) => {
  const { points, positions, sizes, geometry, material } = createPoints(
    count,
    { size: [2, 7], color: '#ffffff', twinkle: 0 },
    env
  );
  const flakes = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * env.W,
    y: Math.random() * env.H,
    v: 25 + sizes[i] * 9,
    sway: rand(10, 30),
    freq: rand(0.4, 1.2),
    phase: Math.random() * Math.PI * 2
  }));
  points.renderOrder = 5;
  group.add(points);
  return {
    update(dt, t) {
      flakes.forEach((f, i) => {
        f.y -= f.v * dt;
        f.x += (Math.sin(t * f.freq + f.phase) * f.sway + slope * 120) * dt;
        if (f.y < -10) {
          f.y = env.H + 10;
          f.x = Math.random() * env.W;
        }
        if (f.x > env.W + 10) f.x = -10;
        if (f.x < -10) f.x = env.W + 10;
        positions[i * 3] = f.x;
        positions[i * 3 + 1] = f.y;
      });
      geometry.attributes.position.needsUpdate = true;
    },
    setFade(f) {
      material.uniforms.uOpacity.value = f * 0.9;
    }
  };
};

// Raio: deslocamento de ponto médio + ramificações, renderizado como fita (triângulos)
const boltPath = (x0, y0, x1, y1, displace, detail) => {
  let pts = [[x0, y0], [x1, y1]];
  let d = displace;
  for (let k = 0; k < detail; k++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      next.push([(ax + bx) / 2 + (Math.random() - 0.5) * d, (ay + by) / 2 + (Math.random() - 0.5) * d * 0.3]);
      next.push(pts[i + 1]);
    }
    pts = next;
    d *= 0.55;
  }
  return pts;
};

const ribbonGeometry = (paths) => {
  const verts = [];
  paths.forEach(({ pts, width }) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const taper = 1 - (i / pts.length) * 0.65;
      const w = (width * taper) / 2;
      const px = (-dy / len) * w;
      const py = (dx / len) * w;
      verts.push(
        ax + px, ay + py, 0, ax - px, ay - py, 0, bx + px, by + py, 0,
        bx + px, by + py, 0, ax - px, ay - py, 0, bx - px, by - py, 0
      );
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  return geometry;
};

const createLightning = (group, env, world) => {
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9db4ff, blending: THREE.AdditiveBlending, ...overlayMaterialProps, opacity: 0 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, ...overlayMaterialProps, opacity: 0 });
  const glow = new THREE.Mesh(new THREE.BufferGeometry(), glowMat);
  const core = new THREE.Mesh(new THREE.BufferGeometry(), coreMat);
  glow.renderOrder = 2.5;
  core.renderOrder = 2.6;
  glow.frustumCulled = false;
  core.frustumCulled = false;
  group.add(glow, core);

  let next = rand(0.8, 2.5);
  let restrikeAt = -1;
  let flash = 0;
  let life = 0;
  let fade = 0;

  const buildBolt = () => {
    const x0 = rand(env.W * 0.1, env.W * 0.9);
    const y0 = env.H * rand(0.78, 0.95);
    const x1 = x0 + rand(-env.W * 0.15, env.W * 0.15);
    const y1 = env.H * rand(0.02, 0.3);
    const main = boltPath(x0, y0, x1, y1, env.H * 0.18, 7);
    const paths = [{ pts: main, width: 1 }];
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branches; b++) {
      const idx = Math.floor(rand(0.1, 0.6) * main.length);
      const [sx, sy] = main[idx];
      const ex = sx + rand(-1, 1) * env.W * 0.12;
      const ey = sy - rand(0.08, 0.22) * env.H;
      paths.push({ pts: boltPath(sx, sy, ex, ey, env.H * 0.06, 5), width: 0.45 });
    }
    glow.geometry.dispose();
    core.geometry.dispose();
    glow.geometry = ribbonGeometry(paths.map((p) => ({ pts: p.pts, width: p.width * 16 })));
    core.geometry = ribbonGeometry(paths.map((p) => ({ pts: p.pts, width: p.width * 3 })));
  };

  return {
    update(dt, t) {
      if (env.reducedMotion) {
        world.flash = 0;
        return;
      }
      if (t >= next) {
        flash = 1;
        if (Math.random() < 0.75) {
          buildBolt();
          life = 1;
        }
        if (Math.random() < 0.5) restrikeAt = t + rand(0.08, 0.2);
        next = t + rand(2.5, 7);
      }
      if (restrikeAt > 0 && t >= restrikeAt) {
        flash = Math.max(flash, 0.8);
        life = Math.max(life, 0.8);
        restrikeAt = -1;
      }
      flash *= Math.exp(-dt * 7);
      life = Math.max(0, life - dt * 2.6);
      const flicker = 0.7 + Math.random() * 0.3;
      glowMat.opacity = life * 0.55 * flicker * fade;
      coreMat.opacity = life * flicker * fade;
      glow.visible = core.visible = life > 0;
      world.flash = flash;
    },
    setFade(f) {
      fade = f;
    }
  };
};

const buildWorld = (opts, env) => {
  const cfg = SCENE_CONFIG[opts.type] || SCENE_CONFIG.partly;
  const group = new THREE.Group();
  const world = { group, flash: 0, fade: 0, fadeDir: 1 };
  const parts = [];
  const areaScale = clamp((env.W * env.H) / (1920 * 1080), 0.35, 1.3);
  const intensityScale = 0.55 + 0.45 * (opts.intensity ?? 0.5);

  // Vento: direção meteorológica indica de onde vem; vento de leste empurra para oeste
  const windDir = Math.sin(((opts.windDirection || 0) * Math.PI) / 180) > 0 ? -1 : 1;
  const slope = clamp((opts.wind || 0) / 45, 0.04, 0.55) * windDir;
  const drift = windDir * (1 + Math.abs(slope) * 3);

  if (opts.isDay && (opts.type === 'clear' || opts.type === 'partly')) {
    parts.push(createSun(group, env, opts.type === 'partly' ? 0.85 : 1));
  }
  if (!opts.isDay) {
    if (cfg.stars) parts.push(createStars(group, env, cfg.stars));
    if (opts.type === 'clear' || opts.type === 'partly') parts.push(createMoon(group, env));
  }
  if (cfg.lightning) parts.push(createLightning(group, env, world));
  if (cfg.clouds) {
    const tint = cfg.clouds.tint * (opts.isDay ? 1 : 0.32);
    const heavy = cfg.clouds.count >= 10;
    parts.push(createClouds(group, env, { ...cfg.clouds, tint }, drift, heavy));
  }
  if (cfg.rain) {
    const count = Math.round(cfg.rain.count * intensityScale * areaScale);
    parts.push(createRain(group, env, { ...cfg.rain, count }, slope));
  }
  if (cfg.snow) parts.push(createSnow(group, env, Math.round(cfg.snow * intensityScale * areaScale), slope));
  if (cfg.fog) parts.push(createFog(group, env, opts.isDay, drift));

  world.update = (dt, t) => parts.forEach((p) => p.update(dt, t));
  world.setFade = (f) => parts.forEach((p) => p.setFade(f));
  world.dispose = () => {
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  };
  return world;
};

// ---------- Motor ----------
const createEngine = (canvas) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const env = {
    W: 1,
    H: 1,
    pr: renderer.getPixelRatio(),
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

  const skyUniforms = {
    uTop: { value: new THREE.Color('#3a7bd5') },
    uBottom: { value: new THREE.Color('#acd3f3') },
    uFlash: { value: 0 }
  };
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: BASIC_VERT,
      fragmentShader: SKY_FRAG,
      depthTest: false,
      depthWrite: false
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const flashOverlay = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, blending: THREE.AdditiveBlending, ...overlayMaterialProps, opacity: 0 })
  );
  flashOverlay.renderOrder = 100;
  scene.add(flashOverlay);

  const skyTarget = { top: new THREE.Color(), bottom: new THREE.Color() };
  let hasScene = false;
  let current = null;
  const leaving = [];

  const resize = () => {
    env.W = canvas.clientWidth || window.innerWidth;
    env.H = canvas.clientHeight || window.innerHeight;
    renderer.setSize(env.W, env.H, false);
    camera.right = env.W;
    camera.top = env.H;
    camera.updateProjectionMatrix();
    [sky, flashOverlay].forEach((m) => {
      m.scale.set(env.W, env.H, 1);
      m.position.set(env.W / 2, env.H / 2, 0);
    });
  };
  resize();

  let last = performance.now();
  let time = 0;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    const k = 1 - Math.exp(-dt * 1.6);
    skyUniforms.uTop.value.lerp(skyTarget.top, k);
    skyUniforms.uBottom.value.lerp(skyTarget.bottom, k);

    let flash = 0;
    if (current) {
      current.fade = Math.min(1, current.fade + dt / 1.2);
      current.setFade(current.fade);
      current.update(dt, time);
      flash += current.flash * current.fade;
    }
    for (let i = leaving.length - 1; i >= 0; i--) {
      const w = leaving[i];
      w.fade -= dt / 1.2;
      if (w.fade <= 0) {
        scene.remove(w.group);
        w.dispose();
        leaving.splice(i, 1);
      } else {
        w.setFade(w.fade);
        w.update(dt, time);
        flash += w.flash * w.fade;
      }
    }
    skyUniforms.uFlash.value = flash * 0.45;
    flashOverlay.material.opacity = flash * 0.12;

    renderer.render(scene, camera);
  });

  return {
    resize,
    setScene(opts) {
      const [top, bottom] = getSkyPalette(opts);
      skyTarget.top.set(top);
      skyTarget.bottom.set(bottom);
      if (!hasScene) {
        skyUniforms.uTop.value.copy(skyTarget.top);
        skyUniforms.uBottom.value.copy(skyTarget.bottom);
        hasScene = true;
      }
      if (current) leaving.push(current);
      current = buildWorld(opts, env);
      scene.add(current.group);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      [current, ...leaving].forEach((w) => w && w.dispose());
      sky.geometry.dispose();
      sky.material.dispose();
      flashOverlay.geometry.dispose();
      flashOverlay.material.dispose();
      renderer.dispose();
    }
  };
};

const WeatherBackground = ({ scene, wind = 0, windDirection = 0, temperature = null }) => {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const { type, isDay, intensity } = scene;
  const hot = temperature !== null && temperature >= 30;

  useEffect(() => {
    let engine;
    try {
      engine = createEngine(canvasRef.current);
    } catch (err) {
      // Sem WebGL: o gradiente CSS do container serve de fallback
      console.warn('WebGL indisponível para o fundo animado:', err);
      return undefined;
    }
    engineRef.current = engine;
    window.addEventListener('resize', engine.resize);
    return () => {
      window.removeEventListener('resize', engine.resize);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setScene({ type, isDay, intensity, wind, windDirection, hot });
  }, [type, isDay, intensity, wind, windDirection, hot]);

  const [top, bottom] = getSkyPalette({ type, isDay, hot });

  return (
    <div
      className="weather-bg"
      style={{ background: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="weather-bg-canvas" />
      <div className="weather-bg-vignette" />
    </div>
  );
};

export default WeatherBackground;
