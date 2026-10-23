import * as THREE from 'three';

/*
 * Carro de pedra do Romanele (estilo Flintstones): sem chão e sem motor,
 * anda com as pernas dele. Este módulo cuida do modelo, das animações do carro,
 * da física simples (chão por raio, colisão por esferas) e dos pontos de entrada.
 *
 * Coordenadas locais do carro (three): frente = +Z, porta do motorista = +X.
 */
export const CAR_ANCHOR = new THREE.Vector3(0.40, 0, -0.03);   // raiz do Romanele sentado (igual no Blender)
export const CAR_ENTRY = new THREE.Vector3(1.22, 0, -0.85);    // onde ele fica em pé, ao lado da porta

/*
 * Pneus lisos por dentro das rodas: a banda de rodagem do modelo tem falhas na parte de cima
 * (escondida pelo para-lama); com a roda girando essas falhas iam para baixo e a roda parecia
 * se desfazer. Como o pneu é uma superfície de revolução em volta do eixo, ele não precisa girar.
 */
function addTires(root) {
  let mesh = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  if (!mesh) return;
  root.updateMatrixWorld(true);
  const sk = mesh.skeleton, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  const mat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  sk.bones.forEach((bone, bi) => {
    if (!/^Roda_/.test(bone.name)) return;
    c.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(inv);   // centro da roda (raiz do carro no chão)
    const R = c.y - 0.008;                                         // um tiquinho para dentro do pneu original
    let xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < si.count; i++) {
      if (si.getX(i) !== bi || sw.getX(i) < 0.5) continue;
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
      const r = Math.hypot(v.y - c.y, v.z - c.z);
      if (r > R - 0.06 && r < R + 0.03) { xMin = Math.min(xMin, v.x); xMax = Math.max(xMax, v.x); }
    }
    if (!(xMax > xMin)) return;
    const w = xMax - xMin - 0.016, Ri = R * 0.74, b = Math.min(0.035, w * 0.2);
    const prof = [[Ri, -w / 2], [R - b, -w / 2], [R, -w / 2 + b], [R, w / 2 - b], [R - b, w / 2], [Ri, w / 2]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 36);
    geo.rotateZ(-Math.PI / 2);                                     // eixo do torno (Y) -> eixo da roda (X)
    const tire = new THREE.Mesh(geo, mat);
    tire.name = `Pneu_${bone.name}`;
    tire.position.set((xMin + xMax) / 2, c.y, c.z);
    tire.castShadow = true; tire.receiveShadow = true;
    root.add(tire);
  });
}

export function createCar({ scene, gltf }) {
  const root = gltf.scene;
  // o GLB traz o esqueleto do Romanele só para carregar as animações dele: não vai para a cena
  const romRig = root.getObjectByName('Romanele_Rig');
  if (romRig && romRig.parent) romRig.parent.remove(romRig);
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  root.rotation.order = 'YXZ';
  scene.add(root);

  // medidas pela malha na pose de repouso (largura ±1.11, comprimento ~4.4 m)
  const box = new THREE.Box3().setFromObject(root);
  const half = { x: Math.max(box.max.x, -box.min.x), zf: box.max.z, zb: -box.min.z };

  const mixer = new THREE.AnimationMixer(root);
  const actions = {}, romClips = {};
  for (const c of gltf.animations) {
    if (c.name.startsWith('Carro_')) romClips[c.name] = c;   // clipes do Romanele (tocam no mixer dele)
    else actions[c.name] = mixer.clipAction(c);               // Porta_Entrar, Porta_Sair, Rodando, Parado
  }
  let current = null;
  function play(name, { once = false, timeScale = 1, fade = 0.15 } = {}) {
    const a = actions[name]; if (!a) return null;
    if (a === current) { a.setEffectiveTimeScale(timeScale); return a; }
    a.enabled = true;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = a;
    return a;
  }
  play('Parado', { fade: 0 });
  addTires(root);

  const state = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0, steer: 0 };
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  const ray = new THREE.Ray(), sphere = new THREE.Sphere();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  function syncRoot() {
    root.position.copy(state.pos);
    root.rotation.set(state.pitch, state.yaw, state.roll);
    root.updateMatrixWorld(true);
  }

  // altura do chão num ponto (raio de cima para baixo no octree do mundo)
  function groundAt(octree, x, z, fromY) {
    ray.origin.set(x, fromY + 2.5, z); ray.direction.set(0, -1, 0);
    const h = octree.rayIntersect(ray);
    return h && h.distance < 8 ? ray.origin.y - h.distance : null;
  }

  function park(octree, x, z, yaw) {
    state.pos.set(x, 0, z); state.yaw = yaw; state.speed = 0;
    const y = groundAt(octree, x, z, 60) ?? groundAt(octree, x, z, 200);
    state.pos.y = y ?? 0;
    settle(octree, 1);
    syncRoot();
  }

  // inclina o carro conforme o chão (frente/trás e esquerda/direita)
  function settle(octree, k) {
    fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    side.set(fwd.z, 0, -fwd.x);
    const L = Math.min(half.zf, half.zb) * 0.72, W = half.x * 0.8;
    const p = state.pos;
    const yf = groundAt(octree, p.x + fwd.x * L, p.z + fwd.z * L, p.y);
    const yb = groundAt(octree, p.x - fwd.x * L, p.z - fwd.z * L, p.y);
    const yl = groundAt(octree, p.x + side.x * W, p.z + side.z * W, p.y);
    const yr = groundAt(octree, p.x - side.x * W, p.z - side.z * W, p.y);
    const yc = groundAt(octree, p.x, p.z, p.y);
    const ys = [yf, yb, yl, yr, yc].filter((v) => v !== null);
    if (!ys.length) return false;
    const target = Math.max(...ys) * 0.5 + (ys.reduce((s, v) => s + v, 0) / ys.length) * 0.5;
    p.y += (target - p.y) * k;
    const pitch = (yf !== null && yb !== null) ? -Math.atan2(yf - yb, 2 * L) : 0;
    const roll = (yl !== null && yr !== null) ? Math.atan2(yl - yr, 2 * W) : 0;
    state.pitch += (THREE.MathUtils.clamp(pitch, -0.35, 0.35) - state.pitch) * k;
    state.roll += (THREE.MathUtils.clamp(roll, -0.3, 0.3) - state.roll) * k;
    return true;
  }

  // três esferas ao longo do carro, acima do chão: empurram só na horizontal
  function collide(octrees) {
    const r = half.x * 0.92, h = r + 0.42;
    fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    let hitDot = 0;
    const offs = [half.zf - r, (half.zf - half.zb) / 2, -(half.zb - r)];
    for (const oc of octrees) {
      if (!oc) continue;
      for (const o of offs) {
        for (let i = 0; i < 2; i++) {
          sphere.center.set(state.pos.x + fwd.x * o, state.pos.y + h, state.pos.z + fwd.z * o);
          sphere.radius = r;
          const hit = oc.sphereIntersect(sphere);
          if (!hit) break;
          if (hit.normal.y > 0.65) break;          // é chão/rampa: quem cuida é o settle
          hit.normal.y = 0; if (hit.normal.lengthSq() < 1e-6) break; hit.normal.normalize();
          state.pos.addScaledVector(hit.normal, hit.depth);
          hitDot = Math.min(hitDot, hit.normal.dot(fwd) * Math.sign(state.speed || 1));
        }
      }
    }
    return hitDot;   // < 0: bateu de frente (no sentido do movimento)
  }

  /**
   * dirige: throttle −1..1, steer −1..1 (positivo = esquerda), maxSpeed em m/s.
   * Retorna a velocidade atual (com sinal).
   */
  function drive(dt, { throttle, steer, maxSpeed, octree, limitOctree }) {
    const target = throttle >= 0 ? throttle * maxSpeed : throttle * maxSpeed * 0.45;
    const accel = Math.abs(target) > Math.abs(state.speed) && target * state.speed >= 0 ? 1.9 : 4.5; // acelera devagar, freia rápido
    state.speed += (target - state.speed) * (1 - Math.exp(-accel * dt));
    if (Math.abs(state.speed) < 0.01 && throttle === 0) state.speed = 0;
    state.steer += (steer - state.steer) * (1 - Math.exp(-8 * dt));
    const grip = THREE.MathUtils.clamp(Math.abs(state.speed) / 2.2, 0, 1);
    state.yaw += state.steer * 1.55 * grip * Math.sign(state.speed) * dt;
    fwd.set(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const prev = tmp2.copy(state.pos);
    state.pos.addScaledVector(fwd, state.speed * dt);
    const hitDot = collide([octree, limitOctree]);
    if (hitDot < -0.45) state.speed *= Math.max(0, 1 - 6 * dt) * (1 + hitDot * 0.5);
    if (!settle(octree, 1 - Math.exp(-14 * dt))) { state.pos.copy(prev); state.speed = 0; }
    syncRoot();
    return state.speed;
  }

  // empurra a cápsula do Romanele para fora da caixa do carro (quando ele está a pé)
  const inv = new THREE.Matrix4();
  function pushOut(capsule, radius) {
    const c = capsule.start;
    if (c.y > state.pos.y + 2.4 || capsule.end.y < state.pos.y) return;
    inv.copy(root.matrixWorld).invert();
    const lp = tmp.copy(c).applyMatrix4(inv);
    const hx = half.x + radius, zf = half.zf + radius, zb = half.zb + radius;
    if (lp.x <= -hx || lp.x >= hx || lp.z <= -zb || lp.z >= zf) return;
    const dx1 = hx - lp.x, dx2 = lp.x + hx, dz1 = zf - lp.z, dz2 = lp.z + zb;
    const m = Math.min(dx1, dx2, dz1, dz2);
    const out = tmp2.set(0, 0, 0);
    if (m === dx1) out.x = dx1; else if (m === dx2) out.x = -dx2; else if (m === dz1) out.z = dz1; else out.z = -dz2;
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, state.yaw);
    capsule.translate(out);
  }

  const worldOf = (local, target = new THREE.Vector3()) => target.copy(local).applyMatrix4(root.matrixWorld);

  return {
    root, mixer, actions, romClips, state, half,
    play, park, drive, pushOut, worldOf, syncRoot,
    update(dt) { mixer.update(dt); },
    setVisible(v) { root.visible = v; },
    dispose() { mixer.stopAllAction(); },
  };
}
