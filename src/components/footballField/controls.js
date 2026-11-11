import * as THREE from 'three';

const MIN_Y = 0.008;
const MAX_Y = 400;
const MAX_XZ = 700;
const PITCH_LIMIT = THREE.MathUtils.degToRad(89.6);

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Câmera livre estilo "no-clip": voa em qualquer direção, sem colisão.
// A velocidade acompanha a altura: rente à grama o movimento é de centímetros
// por segundo; lá do alto, dezenas de metros por segundo.
export class NoclipControls {
  constructor(camera, dom, root = document.body) {
    this.camera = camera;
    this.dom = dom;
    this.root = root;
    this._off = [];
    this.yaw = 0;
    this.pitch = 0;
    this.speedMult = 1;
    this.sensitivity = 0.0022;
    this.keys = new Set();
    this.vel = new THREE.Vector3();
    this.dolly = 0;
    this.dragging = false;
    this.locked = false;
    this.anim = null;
    this.onUserInput = null;
    this._bind();
  }

  setPose(pos, look) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    const d = new THREE.Vector3(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]).normalize();
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    this.yaw = Math.atan2(-d.x, -d.z);
    this.vel.set(0, 0, 0);
    this.dolly = 0;
    this._apply();
  }

  flyTo(pos, look, seconds = 1.8) {
    const d = new THREE.Vector3(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]).normalize();
    this.anim = {
      t: 0,
      seconds,
      p0: this.camera.position.clone(),
      p1: new THREE.Vector3(pos[0], pos[1], pos[2]),
      yaw0: this.yaw,
      dyaw: wrapAngle(Math.atan2(-d.x, -d.z) - this.yaw),
      pitch0: this.pitch,
      pitch1: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)),
    };
    this.vel.set(0, 0, 0);
    this.dolly = 0;
  }

  toggleLock() {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    else this.dom.requestPointerLock?.();
  }

  get speed() {
    const h = Math.max(this.camera.position.y, 0);
    return THREE.MathUtils.clamp(h * 1.6, 0.06, 45) * this.speedMult;
  }

  dispose() {
    this._off.forEach((off) => off());
    this._off = [];
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    this.keys.clear();
  }

  _bind() {
    const dom = this.dom;
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._off.push(() => target.removeEventListener(type, fn, opts));
    };
    const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');

    on(window, 'keydown', (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => { this.keys.clear(); this.dragging = false; });

    on(dom, 'pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      dom.setPointerCapture?.(e.pointerId);
      this._cancelAnim();
    });
    on(dom, 'pointerup', (e) => {
      this.dragging = false;
      dom.releasePointerCapture?.(e.pointerId);
    });
    on(dom, 'pointercancel', () => { this.dragging = false; });
    on(dom, 'pointermove', (e) => {
      if (!this.dragging && !this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
      this._cancelAnim();
    });
    on(dom, 'contextmenu', (e) => e.preventDefault());
    on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      this.root.classList.toggle('locked', this.locked);
    });

    on(dom, 'wheel', (e) => {
      e.preventDefault();
      // zoom: avança na direção do olhar, proporcional à distância até a grama
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      this.dolly += -dy * 0.0016 * this._focusDistance();
      this._cancelAnim();
    }, { passive: false });
  }

  _focusDistance() {
    const cam = this.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const h = Math.max(cam.position.y - 0.02, 0.01);
    // distância até o gramado ao longo do olhar; se estiver olhando para o horizonte, usa a altura
    const along = fwd.y < -0.02 ? h / -fwd.y : Infinity;
    return THREE.MathUtils.clamp(Math.min(along, h * 6 + 0.5), 0.03, 120);
  }

  _cancelAnim() {
    this.anim = null;
    this.onUserInput?.();
  }

  _apply() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  update(dt) {
    const cam = this.camera;
    const k = this.keys;

    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(a.t + dt / a.seconds, 1);
      const e = ease(a.t);
      cam.position.lerpVectors(a.p0, a.p1, e);
      this.yaw = a.yaw0 + a.dyaw * e;
      this.pitch = THREE.MathUtils.lerp(a.pitch0, a.pitch1, e);
      this._apply();
      if (a.t >= 1) this.anim = null;
      return;
    }

    this._apply();
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();

    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const v = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0);

    const wish = new THREE.Vector3()
      .addScaledVector(fwd, f)
      .addScaledVector(right, s)
      .addScaledVector(cam.up, v);
    if (wish.lengthSq() > 0) {
      const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
      wish.normalize().multiplyScalar(this.speed * boost);
      this._cancelAnim();
    }
    // inércia curta: acelera e freia suavemente
    this.vel.lerp(wish, 1 - Math.exp(-dt * 9));
    cam.position.addScaledVector(this.vel, dt);

    if (Math.abs(this.dolly) > 1e-5) {
      const step = this.dolly * (1 - Math.exp(-dt * 12));
      cam.position.addScaledVector(fwd, step);
      this.dolly -= step;
    }

    cam.position.x = THREE.MathUtils.clamp(cam.position.x, -MAX_XZ, MAX_XZ);
    cam.position.z = THREE.MathUtils.clamp(cam.position.z, -MAX_XZ, MAX_XZ);
    cam.position.y = THREE.MathUtils.clamp(cam.position.y, MIN_Y, MAX_Y);
  }
}
