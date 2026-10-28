/*
  Os amigos do Romanele no 2º andar da Xalassa.

  Eles esperam parados na frente do último camarote (o do lado do palco). O Fernando (médico da peste) fica no
  cantinho com uma luz no chão na frente dele. Quando o Romanele pisa na luz, o médico diz "Comprei um
  camarote para nós!", a turma entra no camarote e começa a dançar, e o jogo pede para o Romanele dançar
  também. Quando ele dança: "Parabéns, você chegou na Xalassa". Depois a festa continua livre e os
  amigos ficam dançando lá dentro sem parar.

  As animações deles saem das animações da festa: a dança é a faixa de cada um na "Festa_Amigos",
  o "parado" é a conversa de outro convidado copiada para o esqueleto deles (todos usam o mesmo
  esqueleto, só muda o prefixo dos ossos) e o andar é feito aqui mesmo, quadro a quadro.

  Coordenadas: x e z do three.js (no Blender: x e -y). Piso de cima em y = 4.
*/
import * as THREE from 'three';

const FLOOR = 4.0;
// quem é quem (pela fantasia gravada no GLB) e para onde cada um vai dentro do camarote
const FRIENDS = [
  { fantasia: 'ninja', spot: [8.95, -9.95] },
  { fantasia: 'amigo_camisa_vermelha', spot: [6.1, -9.15], cap: 0xd8262b },
  { fantasia: 'amigo_camisa_verde', spot: [8.3, -9.25], cap: 0x2f9e44 },
  { fantasia: 'cavernosa_oculos', spot: [6.3, -10.05] },
  { fantasia: 'medico_da_peste', spot: [7.15, -9.95], host: true },
];
const GAP_OUT = [7.78, -11.05];    // na frente da entrada do camarote (lado do corredor)
const GAP_IN = [7.78, -10.2];      // logo depois da corda
const MARK = [8.85, -12.05];       // luz no chão, na frente do médico
const WALK_SPEED = 1.25;
const TRIGGER_R = 0.75;

const qx = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);

// andar: ossos com a pose de descanso alinhada ao mundo (frente = +z), então é só girar em x/y/z
function walkClip(prefix) {
  const T = 0.9, times = [0, T / 4, T / 2, (3 * T) / 4, T];
  const leg = [-0.42, 0, 0.38, 0, -0.42];              // coxa: negativo = para a frente
  const knee = [0.12, 0.55, 0.12, 0.08, 0.12];         // joelho dobra quando a perna passa
  const half = (arr) => [arr[2], arr[3], arr[0], arr[1], arr[2]];
  const quatTrack = (bone, qs) => new THREE.QuaternionKeyframeTrack(`${prefix}${bone}.quaternion`, times, qs.flatMap((q) => q.toArray()));
  const tracks = [
    quatTrack('LeftUpLeg', leg.map(qx)),
    quatTrack('RightUpLeg', half(leg).map(qx)),
    quatTrack('LeftLeg', knee.map(qx)),
    quatTrack('RightLeg', half(knee).map(qx)),
    // braços para baixo, balançando ao contrário das pernas
    quatTrack('LeftArm', half(leg).map((s) => qx(s * 0.6).multiply(qz(-1.25)))),
    quatTrack('RightArm', leg.map((s) => qx(s * 0.6).multiply(qz(1.25)))),
    quatTrack('LeftForeArm', times.map(() => qy(-0.3))),
    quatTrack('RightForeArm', times.map(() => qy(0.3))),
    quatTrack('Spine', [0.04, -0.02, 0.04, -0.02, 0.04].map((a) => qy(a))),
    quatTrack('Hips', times.map(() => new THREE.Quaternion())),
    new THREE.VectorKeyframeTrack(`${prefix}Hips.position`, times, [0, 0.97, 0, 0, 0.94, 0, 0, 0.97, 0, 0, 0.94, 0, 0, 0.97, 0]),
  ];
  return new THREE.AnimationClip(`${prefix}andar`, T, tracks);
}

/**
 * Separa os amigos das animações da festa. Chame antes de criar o mixer da festa e use partyClips no lugar
 * de gltf.animations. Depois chame update(dt, ...) a cada quadro da festa.
 */
export function createFriends({ party, animations, scene, people, personObjs, isTouch, ui }) {
  const roots = [];
  party.traverse((o) => { if (o.userData && FRIENDS.some((f) => f.fantasia === o.userData.fantasia)) roots.push(o); });
  const prefixOf = (root) => {
    let p = null;
    root.traverse((o) => { if (!p && /_Hips$/.test(o.name)) p = o.name.replace(/Hips$/, ''); });
    return p;
  };
  const friends = roots.map((root) => ({ root, cfg: FRIENDS.find((f) => f.fantasia === root.userData.fantasia), prefix: prefixOf(root) }))
    .filter((f) => f.prefix);
  const mine = (name) => friends.some((f) => name.startsWith(f.prefix) || name.startsWith(`${f.root.name}.`));

  // faixas de dança de cada amigo + animações da festa sem eles
  const partyClips = [];
  for (const c of animations) {
    const keep = c.tracks.filter((t) => !mine(t.name));
    for (const f of friends) {
      const tr = c.tracks.filter((t) => t.name.startsWith(f.prefix));
      if (tr.length) f.danceClip = new THREE.AnimationClip(`${f.prefix}danca`, c.duration, tr);
    }
    partyClips.push(keep.length === c.tracks.length ? c : new THREE.AnimationClip(c.name, c.duration, keep));
  }
  // "parado": a conversa de um convidado qualquer, copiada para o esqueleto de cada amigo
  let talker = null;
  party.traverse((o) => { if (!talker && o.userData && o.userData.danca === 'Conversa' && !roots.includes(o)) talker = o; });
  const talkPrefix = talker && prefixOf(talker);
  let talkSrc = null;
  if (talkPrefix) {
    for (const c of animations) {
      const tr = c.tracks.filter((t) => t.name.startsWith(talkPrefix));
      if (tr.length) { talkSrc = { tracks: tr, duration: c.duration }; break; }
    }
  }

  const mixer = new THREE.AnimationMixer(party);
  for (const f of friends) {
    f.acts = {};
    if (talkSrc) {
      const tr = talkSrc.tracks.map((t) => { const k = t.clone(); k.name = f.prefix + t.name.slice(talkPrefix.length); return k; });
      f.acts.parado = mixer.clipAction(new THREE.AnimationClip(`${f.prefix}parado`, talkSrc.duration, tr));
    }
    f.acts.andar = mixer.clipAction(walkClip(f.prefix));
    if (f.danceClip) f.acts.danca = mixer.clipAction(f.danceClip);
    f.peopleIdx = personObjs.indexOf(f.root);
    f.pos = new THREE.Vector3(); f.root.getWorldPosition(f.pos);
    f.state = 'parado'; f.path = []; f.delay = 0;
    f.current = null;
  }
  const host = friends.find((f) => f.cfg.host);

  // bonezinho (vermelho no de camisa vermelha, verde no de camisa verde), preso no osso da cabeça
  for (const f of friends) {
    if (!f.cfg.cap) continue;
    const head = party.getObjectByName(`${f.prefix}Head`);
    if (!head) continue;
    f.root.updateMatrixWorld(true);
    const rootInv = f.root.matrixWorld.clone().invert();
    const hp = new THREE.Vector3(); head.getWorldPosition(hp); hp.applyMatrix4(rootInv);
    // topo e largura da cabeça a partir da malha (pose de descanso, no espaço do próprio boneco)
    let top = -Infinity, rad = 0.09;
    f.root.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y > top) top = y;
        if (y > hp.y + 0.05 && y < hp.y + 0.16) rad = Math.max(rad, Math.abs(pos.getX(i) - hp.x));
      }
    });
    if (!Number.isFinite(top)) top = hp.y + 0.2;
    rad = Math.min(rad, 0.14);
    const mat = new THREE.MeshStandardMaterial({ color: f.cfg.cap, roughness: 0.6, metalness: 0 });
    const cap = new THREE.Group(); cap.name = `${f.prefix}Chapeuzinho`;
    const r = rad * 1.06;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.scale.y = 0.72;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), mat);
    brim.scale.z = 1.25; brim.position.set(0, 0.006, r * 0.42);
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), mat);
    button.position.y = r * 0.72;
    cap.add(dome, brim, button);
    cap.position.set(0, top - hp.y - r * 0.42, 0.005);
    cap.rotation.x = -0.12;   // um pouco inclinado para trás, como boné
    head.add(cap);
  }

  function play(f, name, fade = 0.35, time = null) {
    const next = f.acts[name] || f.acts.parado; if (!next || f.current === next) return;
    next.reset(); if (time !== null) next.time = time;
    next.setEffectiveWeight(1).fadeIn(f.current ? fade : 0).play();
    if (f.current) f.current.fadeOut(fade);
    f.current = next;
  }
  const yawTo = (f, x, z) => Math.atan2(x - f.pos.x, z - f.pos.z);
  function setPose(f, yaw) {
    const parent = f.root.parent;
    const wq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
    f.root.quaternion.copy(pq.invert().multiply(wq));
    const lp = f.pos.clone(); parent.worldToLocal(lp); f.root.position.copy(lp);
    if (f.peopleIdx >= 0) { const p = people[f.peopleIdx]; p[0] = f.pos.x; p[1] = f.pos.y; p[2] = f.pos.z; }
  }
  // começo: todos parados conversando; o médico olha para a luz, os outros para ele
  for (const f of friends) {
    play(f, 'parado', 0, Math.random() * 3);
    f.yaw = f === host ? yawTo(f, MARK[0], MARK[1]) : yawTo(f, host ? host.pos.x : MARK[0], host ? host.pos.z : MARK[1]);
    setPose(f, f.yaw);
  }

  /* luz no chão (estilo marcador de missão) */
  const markGroup = new THREE.Group();
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xff4fd8) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.55 + 0.2 * sin(uTime * 3.0));
        a *= 0.75 + 0.25 * sin(vUv.x * 62.83 + uTime * 2.0);
        gl_FragColor = vec4(uColor * a, a); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.5, 40, 1, true), beamMat);
  beam.position.y = 0.75;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6fe0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.47, 48), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.015;
  markGroup.add(beam, ring, disc);
  markGroup.position.set(MARK[0], FLOOR, MARK[1]);
  party.add(markGroup);

  let stage = host ? 'esperando' : 'pronto';   // esperando → falou → andando → dancem → parabens → livre
  let t = 0, stageT = 0;
  const headPos = new THREE.Vector3();
  const go = (s) => { stage = s; stageT = 0; };

  function startWalk() {
    // um de cada vez pela entrada do camarote; o médico por último
    const order = [...friends].sort((a, b) => (a === host) - (b === host) || a.pos.distanceTo(new THREE.Vector3(GAP_OUT[0], FLOOR, GAP_OUT[1])) - b.pos.distanceTo(new THREE.Vector3(GAP_OUT[0], FLOOR, GAP_OUT[1])));
    order.forEach((f, i) => {
      f.path = [GAP_OUT, GAP_IN, f.cfg.spot].map(([x, z]) => new THREE.Vector3(x, FLOOR, z));
      f.delay = i * 0.9; f.state = 'esperando';
    });
  }

  function update(dt, { playerPos, playerDancing, camera, partyClock }) {
    t += dt; stageT += dt;
    beamMat.uniforms.uTime.value = t;
    ring.scale.setScalar(1 + 0.06 * Math.sin(t * 3));

    for (const f of friends) {
      if (f.state === 'esperando') {
        f.delay -= dt;
        if (f.delay <= 0) { f.state = 'andando'; play(f, 'andar', 0.3); }
      } else if (f.state === 'andando') {
        const target = f.path[0];
        const dx = target.x - f.pos.x, dz = target.z - f.pos.z, d = Math.hypot(dx, dz);
        const stepLen = WALK_SPEED * dt;
        if (d <= stepLen) {
          f.pos.x = target.x; f.pos.z = target.z; f.path.shift();
          if (!f.path.length) {
            // chegou: vira para a pista e dança no tempo da música
            f.state = 'dancando'; f.yaw = 0;
            const dur = f.acts.danca ? f.acts.danca.getClip().duration : 1;
            play(f, 'danca', 0.4, partyClock % dur);
          }
        } else {
          f.pos.x += (dx / d) * stepLen; f.pos.z += (dz / d) * stepLen;
          const want = Math.atan2(dx, dz); let a = want - f.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
          f.yaw += a * Math.min(1, dt * 8);
        }
      }
      setPose(f, f.yaw);
    }
    mixer.update(dt);

    if (stage === 'esperando') {
      if (playerPos && Math.abs(playerPos.y - FLOOR) < 1 && Math.hypot(playerPos.x - MARK[0], playerPos.z - MARK[1]) < TRIGGER_R) {
        go('falou'); markGroup.visible = false;
        ui.mission(null); ui.say('Fernando', 'Comprei um camarote para nós!');
      }
    } else if (stage === 'falou') {
      if (stageT > 2.6) { go('andando'); startWalk(); }
    } else if (stage === 'andando') {
      if (stageT > 1.2) ui.say(null);
      if (friends.every((f) => f.state === 'dancando')) {
        go('dancem');
        ui.mission(isTouch ? 'Dance com a galera! Toque em <b>DANÇAR</b>.' : 'Dance com a galera! Aperte <kbd>E</kbd> (ou <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>) para dançar.');
      }
    } else if (stage === 'dancem') {
      if (playerDancing && stageT > 0.3) { go('parabens'); ui.mission(null); ui.finish(true); }
    } else if (stage === 'parabens') {
      if (stageT > 6) { go('livre'); ui.finish(false); }
    }

    // balão em cima da cabeça do médico
    if (host && stage === 'falou' || (host && stage === 'andando' && stageT <= 1.2)) {
      host.root.getWorldPosition(headPos); headPos.y += 2.25;
      headPos.project(camera);
      ui.place(headPos.z < 1 ? headPos.x : null, headPos.y);
    }
  }

  function onEnter() { if (stage === 'esperando') ui.mission('Encontre o <b>Fernando</b>'); }

  return {
    partyClips, update, onEnter,
    get stage() { return stage; },
    get lockInput() { return stage === 'parabens' && stageT < 3.5; },
    hasFriends: friends.length > 0,
  };
}
