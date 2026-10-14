import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════
   SANGUE (gosma vermelha)
   Gotas saem do ponto do impacto, caem com gravidade e viram
   manchas irregulares no chão, que somem depois de um tempo.
═══════════════════════════════════════════════════════════════════════ */
const GRAVITY = 9.8;
const GROUND_Y = 0;
const MAX_DROPS = 260;
const MAX_SPLATS = 160;
const SPLAT_LIFE = 14;      // s até a mancha começar a sumir
const SPLAT_FADE = 2;       // s encolhendo até desaparecer
const POOL_LIFE = 25;       // poça embaixo do urubu morto

const rand = (a, b) => a + Math.random() * (b - a);

// Círculo com a borda deformada, para a mancha parecer gosma e não uma moeda
function makeSplatGeometry(segments = 22) {
  const geo = new THREE.CircleGeometry(1, segments);
  const pos = geo.attributes.position;
  for (let i = 1; i < pos.count; i++) {   // vértice 0 é o centro
    const k = rand(0.65, 1.25);
    pos.setXY(i, pos.getX(i) * k, pos.getY(i) * k);
  }
  return geo.rotateX(-Math.PI / 2);
}

export function createBloodSystem(scene) {
  const dropGeo = new THREE.SphereGeometry(1, 8, 6);
  const dropMat = new THREE.MeshStandardMaterial({
    color: 0x8a0010, roughness: 0.2, metalness: 0.1, emissive: 0x2a0000,
  });
  const splatGeos = Array.from({ length: 5 }, () => makeSplatGeometry());
  const splatMat = new THREE.MeshStandardMaterial({
    color: 0x5e0008, roughness: 0.15, metalness: 0.05,
    transparent: true, opacity: 0.92, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  });

  const drops = [];
  const blobs = [];
  const splats = [];
  const _up = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();

  function addSplat(x, z, size, growTime = 0.12, life = SPLAT_LIFE) {
    if (splats.length >= MAX_SPLATS) removeSplat(0);
    const mesh = new THREE.Mesh(splatGeos[Math.floor(Math.random() * splatGeos.length)], splatMat);
    // Pequena variação de altura evita z-fighting entre manchas sobrepostas
    mesh.position.set(x, GROUND_Y + 0.006 + Math.random() * 0.004, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.001);
    mesh.receiveShadow = true;
    scene.add(mesh);
    splats.push({ mesh, size, growTime, life, age: 0 });
  }

  function removeSplat(i) {
    scene.remove(splats[i].mesh);
    splats.splice(i, 1);
  }

  /** Jorro de sangue no ponto do impacto. `dir` = direção da bala. */
  function burst(point, dir, count = 18) {
    for (let i = 0; i < count && drops.length < MAX_DROPS; i++) {
      const mesh = new THREE.Mesh(dropGeo, dropMat);
      const r = rand(0.025, 0.07);
      mesh.position.copy(point);
      const vel = new THREE.Vector3(rand(-1, 1), rand(0.3, 1.6), rand(-1, 1))
        .multiplyScalar(rand(1.2, 2.8))
        .addScaledVector(dir, rand(1.0, 3.5));
      scene.add(mesh);
      drops.push({ mesh, vel, r, life: 3 });
    }

    // Bolha de gosma que estoura no ponto do impacto
    const blob = new THREE.Mesh(dropGeo, dropMat);
    blob.position.copy(point);
    scene.add(blob);
    blobs.push({ mesh: blob, age: 0, life: 0.35, size: rand(0.16, 0.24) });
  }

  /** Poça que cresce devagar embaixo de um corpo caído. */
  function pool(position, size = 0.8) {
    addSplat(position.x, position.z, size, 3.0, POOL_LIFE);
  }

  function update(delta) {
    const dt = Math.min(delta, 0.05);

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.vel.y -= GRAVITY * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.life -= dt;

      // Gota esticada na direção em que está caindo
      const speed = d.vel.length();
      if (speed > 1e-4) d.mesh.quaternion.setFromUnitVectors(_up, _dir.copy(d.vel).divideScalar(speed));
      d.mesh.scale.set(d.r, d.r * (1 + speed * 0.18), d.r);

      if (d.mesh.position.y <= GROUND_Y) {
        addSplat(d.mesh.position.x, d.mesh.position.z, d.r * rand(2.5, 5));
        scene.remove(d.mesh);
        drops.splice(i, 1);
      } else if (d.life <= 0) {
        scene.remove(d.mesh);
        drops.splice(i, 1);
      }
    }

    for (let i = blobs.length - 1; i >= 0; i--) {
      const b = blobs[i];
      b.age += dt;
      const t = b.age / b.life;
      // Infla rápido e murcha
      b.mesh.scale.setScalar(b.size * Math.sin(Math.min(t, 1) * Math.PI));
      if (t >= 1) {
        scene.remove(b.mesh);
        blobs.splice(i, 1);
      }
    }

    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i];
      s.age += dt;
      let k = Math.min(s.age / s.growTime, 1);
      k = 1 - Math.pow(1 - k, 3);   // ease-out: espalha rápido e desacelera
      if (s.age > s.life) k *= Math.max(0, 1 - (s.age - s.life) / SPLAT_FADE);
      s.mesh.scale.setScalar(Math.max(0.001, s.size * k));
      if (s.age > s.life + SPLAT_FADE) removeSplat(i);
    }
  }

  function clear() {
    drops.forEach(d => scene.remove(d.mesh));
    blobs.forEach(b => scene.remove(b.mesh));
    splats.forEach(s => scene.remove(s.mesh));
    drops.length = blobs.length = splats.length = 0;
  }

  return { burst, pool, update, clear };
}
