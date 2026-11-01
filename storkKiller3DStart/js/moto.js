// moto.js — moto com física de moto: inclina nas curvas (o piloto deita a moto e o equilíbrio vem da força
// lateral dos pneus), pneus com modelo de Pacejka + círculo de atrito, transferência de peso, derrapagem da
// traseira, "lavada" da dianteira, ABS/controle de tração (assistência), água, tipos de piso, corpo sólido,
// descanso lateral, QUEDA (inclinou demais / perdeu a aderência / bateu forte) — e a cegonha subindo,
// pilotando, descendo e, na queda, abrindo as asas e pousando longe da moto. COM ou SEM a AK.  three.js r150+
//
//   import { Moto, PilotoMoto } from './moto.js';
//
//   const moto = new Moto(gltfMoto.scene, mapa.paraBuggy());       // mesmas funções do mapa que o buggy usa
//   scene.add(gltfMoto.scene);
//   moto.posicionar(new THREE.Vector3(0, 0, 10), 0);               // posição e rumo (radianos)
//
//   const piloto = new PilotoMoto({ cegonha: gltfCegonha.scene, mixer, clips: gltfCegonha.animations,
//                                   moto, cena: scene, alturaChao, armada: () => cegonhaTemArma });
//
//   // no loop:
//   if (apertouE) piloto.estado === 'fora' ? piloto.entrar() : piloto.sair();
//   moto.update(dt, piloto.dirigindo ? { acelerar, frear, volante, freioDeMao } : null);
//   piloto.update(dt, { atirando });                               // ANTES do mixer.update
//   mixer.update(dt);
//   piloto.onCaiu = () => { ... };                                 // a moto caiu e a cegonha já pousou no chão
//
//   moto.resolverColisao(centroDoPersonagem, raio);                // quem está a pé não atravessa a moto
//
// QUEDA (moto.caida = true): inclinou além do que o pneu segura (lama/grama com a moto deitada, freio forte
// deitada, freio de mão travando a traseira na curva), a traseira atravessou, ou bateu a mais de 5,5 m/s
// (≈20 km/h). A cegonha toca Cegonha_Moto_Queda(_SemArma): sai voando, leva o embalo da moto e pousa em pé.
// A moto escorrega deitada até parar. Para continuar: chegue perto e aperte E -> ela levanta a moto e sobe.
// Dificuldade: moto.p.assistencia (0 = simulação pura, cai fácil | 0.7 padrão | 1 = ABS/tração/estabilidade fortes).
//
// Eixos da moto no three.js: frente = +Z local, esquerda = +X, cima = +Y.  Inclinação: + = deitada p/ esquerda.

import * as THREE from 'three';
import { passoVertical, zerarSalto, alvoArfagemNoAr } from './salto.js';

const G = 9.81;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const EIXO_X = new THREE.Vector3(1, 0, 0);
const EIXO_Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

function pacejka(alpha, B, C, E) {
  const x = B * alpha;
  return Math.sin(C * Math.atan(x - E * (x - Math.atan(x))));
}

function molas(estado, alvo, dt, freq = 6, amort = 0.8) {
  const w = 2 * Math.PI * freq;
  estado.v = (estado.v + dt * w * w * (alvo - estado.x)) / (1 + 2 * amort * w * dt + w * w * dt * dt);
  estado.x += estado.v * dt;
  return estado.x;
}

// atrito da moto DEITADA arrastando no chão (por tipo de piso)
const ATRITO_CAIDA = { estrada: 0.55, chao: 0.55, grama: 0.42, lama: 0.32, agua: 0.30 };

export class Moto {
  constructor(raiz, opcoes = {}) {
    this.raiz = raiz;
    raiz.updateMatrixWorld(true);
    const achar = (n) => raiz.getObjectByName(n);
    this.no = achar('Moto') ?? raiz;
    const ud = this.no.userData ?? {};
    this.tipo = 'moto';
    this.carroceria = achar('Carroceria');
    this.guidao = achar('Guidao');
    this.assento = achar('Cegonha_Assento');
    this.entrada = achar('Cegonha_Entrada');
    this.descanso = achar('Descanso');
    this.lanterna = achar('Lanterna');
    this.farois = [achar('Farol_E'), achar('Farol_D')].filter(Boolean);
    this.escapamentos = [achar('Escapamento_E'), achar('Escapamento_D')].filter(Boolean);
    this.rodas = ['Roda_D', 'Roda_T'].map((n) => {
      const o = achar(n);
      return { obj: o, nome: n, frente: n === 'Roda_D', centro: true, largura: 0.12, q0: o.quaternion.clone(),
               raio: o.userData.raio ?? 0.27, giro: 0, carga: 0, deriva: 0, patina: 0, uso: 0, mu: 1, agua: 0 };
    });
    this.guidaoQ0 = this.guidao ? this.guidao.quaternion.clone() : null;
    this.descansoQ0 = this.descanso ? this.descanso.quaternion.clone() : null;
    this.carroceriaP0 = this.carroceria ? this.carroceria.position.clone() : new THREE.Vector3();
    this.prefixoCegonha = ud.prefixo_cegonha ?? 'Cegonha_Moto_';
    // caixas sólidas (referencial da moto: x esquerda, y cima, z frente) — [x0,x1, y0,y1, z0,z1]
    this.caixas = opcoes.caixas ?? (ud.caixas ? JSON.parse(ud.caixas) : null) ?? [
      [-0.26, 0.26, 0.0, 0.88, -0.96, 0.94], [-0.37, 0.37, 0.86, 1.18, 0.15, 0.41]];

    const p = this.p = Object.assign({
      massa: (ud.massa ?? 215) + (opcoes.massaPiloto ?? 45),   // moto + cegonha (kg)
      a: ud.eixo_dianteiro ?? 0.66,              // CG -> eixo dianteiro (m)
      b: ud.eixo_traseiro ?? 0.66,               // CG -> eixo traseiro (m)
      alturaCG: (ud.altura_cg ?? 0.57) + 0.08,   // com a cegonha em cima
      mu: 1.10,                                  // pneu de moto (× piso do mapa: estrada 0.92, grama 0.8, lama 0.55)
      pacFrente: [14.0, 1.40, 0.10],
      pacTras: [13.0, 1.35, 0.05],
      assistencia: 0.7,                          // 0 = simulação pura (cai fácil); 1 = ABS/controle de tração/estabilidade fortes
      derivaLivre: 0.16,                         // rad de "atravessada" da traseira antes da estabilidade agir
      estercoMax: THREE.MathUtils.degToRad(ud.esterco_max_deg ?? 32),   // guidão todo virado (manobra devagar)
      velGuidao: 3.5,                            // rad/s
      inclMax: THREE.MathUtils.degToRad(52),     // inclinação máxima que o piloto tenta (a aderência limita antes)
      tempoPiso: 1.2,                            // s que o piloto leva para "sentir" que o chão mudou
      wnIncl: 6.5, autoridade: 22,               // "piloto": quão rápido ele deita/levanta a moto (rad/s, rad/s²)
      torqueMax: 74,                             // N·m (bicilíndrico em V)
      rpmMax: 9200, rpmMarchaLenta: 1150, rpmTroca: 8500, rpmReduz: 3900,
      marchas: [2.75, 1.95, 1.50, 1.22, 1.04, 0.92],
      diferencial: 4.6,                          // redução primária × final
      empurrar: 1.3,                             // m/s de ré (a cegonha empurra com os pés)
      freioMax: 3300,                            // N (total)
      divisaoFreio: 0.72,                        // fração na roda da frente
      freioMao: 1600,                            // "Espaço" = freio de trás travando (derrapa a traseira)
      gripFreioMao: 0.40,
      arrasto: 0.30,                             // ½ρ·Cd·A
      rolamento: 6,
      resistencia: 0.018,
      freioMotor: 420,
      arrastoAgua: 0.5,
      vaoLivre: 0.30,
      inercia: null,
      colisaoRaio: ud.colisao_raio ?? 0.42,
      descansoDeg: ud.descanso_deg ?? 9,         // estacionada, deitada no pezinho para a esquerda
      velQueda: 5.5,                             // m/s contra um obstáculo -> queda
      quedaInclinacao: THREE.MathUtils.degToRad(64),
      quedaPouso: 13,                            // m/s de pancada no pouso de um salto que derrubam a moto
    }, opcoes.parametros ?? {});
    if (!p.inercia) p.inercia = p.massa * p.a * p.b * 0.9;

    this.alturaChao = opcoes.alturaChao ?? (() => 0);
    this._colisaoMundo = opcoes.resolverColisao ?? null;
    this.superficie = opcoes.superficie ?? null;
    this.profundidade = opcoes.profundidade ?? null;
    this.agua = 0;

    // ---------------- estado
    this.pos = new THREE.Vector3();
    this.rumo = 0;
    this.vel = new THREE.Vector2();
    this.omega = 0;
    this.inclinacao = THREE.MathUtils.degToRad(p.descansoDeg);   // + = esquerda
    this.vIncl = 0;
    this.esterco = 0;                          // ângulo do guidão (rad, + = esquerda)
    this.direcao = 0;                          // -1..1 (guidão atual) — usado pela cegonha
    this.marcha = 1;
    this.rpm = p.rpmMarchaLenta;
    this.ax = 0; this.ay = 0;
    this.derrapagem = 0;
    this.velocidadeKmh = 0;
    this.ocupado = false;
    this.apoio = 1;                            // 1 = no pezinho, 0 = em pé (piloto segurando)
    this.caida = false;                        // está deitada no chão
    this.ultimaQueda = null;                   // { motivo, velocidade }
    this.tombo = 0;                            // força da pancada da moto no chão (0..1) — lida pelo som
    this.onQueda = null;
    this._muSentido = p.mu * 0.9;
    this._comp = 0;
    this._escorrega = 0;
    this._timers = { lavada: 0, deseq: 0 };
    this._levantar = null;
    this._dobraDescanso = 0;                   // 0 = pezinho embaixo, 1 = recolhido
    this._susp = { y: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, bodyP: { x: 0, v: 0 } };
    zerarSalto(this);                          // rampas: noAr, vy, pouso... (js/salto.js)
    this._prepararApoios();
    this.posicionar(this.no.position.clone(), 0);
  }

  // altura extra para a moto deitada não atravessar o chão (tabela por ângulo, calculada da própria malha)
  _prepararApoios() {
    const pts = [];
    this.no.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.no.matrixWorld).invert();
    const m = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    this.no.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      const a = o.geometry.attributes.position;
      const passo = Math.max(1, Math.floor(a.count / 4000));
      for (let i = 0; i < a.count; i += passo) { tmp.fromBufferAttribute(a, i).applyMatrix4(m); pts.push(tmp.x, tmp.y); }
    });
    const tab = { E: [], D: [] };
    for (let g = 0; g <= 90; g += 2) {
      const f = THREE.MathUtils.degToRad(g), c = Math.cos(f), s = Math.sin(f);
      let le = 0, ld = 0;
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i], y = pts[i + 1];
        le = Math.max(le, -(y * c - x * s));         // deitada p/ esquerda (x+ desce)
        ld = Math.max(ld, -(y * c + x * s));
      }
      tab.E.push(le); tab.D.push(ld);
    }
    this._apoios = tab;
    // onde ela fica deitada: menor altura do centro de massa (CG + o que encosta no chão)
    const hc = this.p.alturaCG - 0.08;
    const repouso = (t) => {
      let best = 90, hb = 1e9;
      for (let k = 20; k < t.length; k++) { const f = THREE.MathUtils.degToRad(k * 2); const h = hc * Math.cos(f) + t[k]; if (h < hb) { hb = h; best = k * 2; } }
      return THREE.MathUtils.degToRad(best);
    };
    this._repouso = { E: repouso(tab.E), D: -repouso(tab.D) };
  }

  _elevacao(fi) {
    const t = fi >= 0 ? this._apoios.E : this._apoios.D;
    const g = Math.min(90, Math.abs(THREE.MathUtils.radToDeg(fi))) / 2;
    const i = Math.floor(g), u = g - i;
    return t[Math.min(i, t.length - 1)] * (1 - u) + t[Math.min(i + 1, t.length - 1)] * u;
  }

  posicionar(pos, rumo = 0) {
    this.ax = this.ay = 0;
    this.pos.copy(pos);
    this.rumo = rumo;
    this.vel.set(0, 0);
    this.omega = 0;
    this.caida = false;
    this._levantar = null;
    this.inclinacao = this.ocupado ? 0 : THREE.MathUtils.degToRad(this.p.descansoDeg);
    this.vIncl = 0;
    zerarSalto(this);
    this._susp.y.x = this.alturaChao(pos.x, pos.z);
    this._susp.y.v = 0;
    this._aplicarVisual(0);
  }

  // escala do grupo onde a moto está no jogo (a física roda em metros dentro dele)
  get escalaMundo() { return this.no.parent ? this.no.parent.getWorldScale(new THREE.Vector3()).x : 1; }

  // ponto em metros da moto (referencial do grupo pai) -> mundo
  paraMundo(v) {
    const pai = this.no.parent;
    if (pai) { pai.updateWorldMatrix(true, false); v.applyMatrix4(pai.matrixWorld); }
    return v;
  }

  posMundo(alvo = new THREE.Vector3()) { return this.paraMundo(alvo.copy(this.pos)); }

  // em coordenadas do MUNDO (como o Buggy.pontoEntrada)
  pontoEntrada(alvo = new THREE.Vector3()) {
    // com a moto deitada no pezinho o marcador também deita: usa a posição "em pé"
    const l = this.entrada ? this.entrada.position : new THREE.Vector3(0.68, 0, 0);
    const f = this.frente, e = new THREE.Vector3(f.z, 0, -f.x);
    alvo.set(this.pos.x + e.x * l.x + f.x * l.z, this.alturaChao(this.pos.x + e.x * l.x + f.x * l.z, this.pos.z + e.z * l.x + f.z * l.z),
             this.pos.z + e.z * l.x + f.z * l.z);
    return this.paraMundo(alvo);
  }

  // referencial do banco com a moto EM PÉ (sem inclinação): a cegonha sobe/desce presa nele
  referenciaReta(obj) {
    if (!this._assentoLocal) this._assentoLocal = this.carroceriaP0.clone().add(this.assento.position);
    _e.set(this._susp.pitch.x, this.rumo, 0, 'YXZ');
    obj.quaternion.setFromEuler(_e);
    obj.position.copy(this._assentoLocal).applyQuaternion(obj.quaternion).add(this.pos);
    obj.scale.setScalar(1);
    // obj fica na cena (mundo): leva o referencial para fora do grupo escalado da moto
    const pai = this.no.parent;
    if (pai && obj.parent !== pai) {
      pai.updateWorldMatrix(true, false);
      obj.updateMatrix();
      obj.matrix.premultiply(pai.matrixWorld).decompose(obj.position, obj.quaternion, obj.scale);
    }
    obj.updateMatrixWorld(true);
    return obj;
  }

  get frente() { return _v.set(Math.sin(this.rumo), 0, Math.cos(this.rumo)); }
  get velocidade() { return this.vel.x * Math.sin(this.rumo) + this.vel.y * Math.cos(this.rumo); }
  get parada() { return Math.hypot(this.vel.x, this.vel.y) < 0.5; }

  // controles: { acelerar 0..1, frear 0..1, volante -1..1 (+ = esquerda), freioDeMao bool } ou null (sem piloto)
  update(dt, controles = null) {
    dt = Math.min(dt, 0.05);
    if (!(dt > 0)) return;
    const c = controles ?? { acelerar: 0, frear: 1, volante: 0, freioDeMao: true, estacionado: true };
    if (this._levantar) this._passoLevantar(dt);
    const passos = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / passos;
    for (let i = 0; i < passos; i++) this._passo(h, c);
    this._aplicarVisual(dt);
  }

  // levanta a moto caída (a cegonha empurra) e deixa no pezinho; fim -> callback
  levantar(aoTerminar = null) {
    if (!this.caida || !this.parada) { aoTerminar?.(); return false; }
    this._levantar = { t: 0, dur: 1.1, de: this.inclinacao, fim: aoTerminar };
    return true;
  }

  _passoLevantar(dt) {
    const L = this._levantar;
    L.t += dt;
    const u = sstep(0, 1, L.t / L.dur);
    const alvo = THREE.MathUtils.degToRad(this.p.descansoDeg);
    this.inclinacao = L.de + (alvo - L.de) * u;
    this.vIncl = 0;
    this._dobraDescanso = 0;
    if (L.t >= L.dur) {
      this._levantar = null;
      this.caida = false;
      this.apoio = 1;
      this.inclinacao = alvo;
      L.fim?.();
    }
  }

  _cair(motivo) {
    if (this.caida) return;
    this.caida = true;
    const lado = Math.sign(this.inclinacao) || Math.sign(this.vIncl) || (Math.random() < 0.5 ? 1 : -1);
    this._ladoQueda = lado;
    this.vIncl = lado * Math.max(Math.abs(this.vIncl), 1.5);
    this.omega += (Math.random() - 0.5) * 1.5;
    this.ultimaQueda = { motivo, velocidade: Math.abs(this.velocidade) };
    this.onQueda?.(motivo);
  }

  _passo(dt, c) {
    const p = this.p;
    const m = p.massa, L = p.a + p.b;
    const sinY = Math.sin(this.rumo), cosY = Math.cos(this.rumo);
    let vLong = this.vel.x * sinY + this.vel.y * cosY;
    let vLat = this.vel.x * cosY - this.vel.y * sinY;
    const vAbs = Math.hypot(vLong, vLat);
    const rF = this.rodas[0], rT = this.rodas[1];
    // ---- chão embaixo das rodas
    for (const r of this.rodas) {
      const pz = r.frente ? p.a : -p.b;
      const cx = this.pos.x + sinY * pz, cz = this.pos.z + cosY * pz;
      if (!r.contato) r.contato = new THREE.Vector3();
      r.contato.set(cx, 0, cz);
      const sup = this.superficie ? this.superficie(cx, cz) : null;
      r.tipo = sup ? sup.tipo : 'chao';
      r.agua = this.profundidade && !this.noAr ? Math.max(0, this.profundidade(cx, cz)) : 0;
      r.mu = p.mu * (sup ? sup.mu : 1) * (1 - 0.35 * Math.min(r.agua / 0.3, 1));
    }
    this.agua = (rF.agua + rT.agua) / 2;
    if (this.caida || this._levantar) { this.noAr = false; this._passoCaida(dt, vLong, vLat, sinY, cosY); return; }

    const pilotado = !c.estacionado;
    // ---- o piloto "sente" o piso com atraso (entrar na lama deitado demais = escorrega)
    const muPiso = (rF.mu + rT.mu) / 2;
    this._muSentido += (muPiso - this._muSentido) * Math.min(1, dt / p.tempoPiso);
    const s = pilotado ? clamp(c.volante ?? 0, -1, 1) : 0;
    const kV = sstep(1.5, 5.5, vLong);                         // 0 = manobra no guidão, 1 = curva deitando
    const fator = 0.76 + 0.40 * (1 - p.assistencia);
    const inclCap = Math.min(p.inclMax, Math.atan(this._muSentido * fator));
    const descanso = THREE.MathUtils.degToRad(p.descansoDeg);
    let alvo = s * inclCap * kV;
    alvo = pilotado ? alvo * (1 - this.apoio) + descanso * this.apoio : descanso * this.apoio;
    // ---- inclinação: o piloto deita/levanta a moto (resposta de 2ª ordem, força limitada). Quando os pneus
    // não seguram (escorregando), a gravidade puxa a moto para dentro da curva (parte do desequilíbrio).
    const fi = this.inclinacao;
    this._escorrega += (Math.max(rF.patina, rT.patina) - this._escorrega) * Math.min(1, dt / 0.12);
    let acc;
    if (pilotado && this.apoio < 0.05 && vLong > 1.0) {
      const wn = p.wnIncl;
      acc = clamp(wn * wn * (alvo - fi) - 2 * 0.9 * wn * this.vIncl, -p.autoridade, p.autoridade);
      // para LEVANTAR a moto o piloto precisa de mais força lateral no pneu: se o pneu já está escorregando,
      // não tem de onde tirar — a moto cai para dentro da curva (é assim que acontece o "tombo" deitado)
      const e = clamp((this._escorrega - 0.10) / 0.22, 0, 1);    // escorregada de verdade (não o "chiado" no limite)
      if (e > 0) {
        if (Math.sign(acc) === -Math.sign(fi)) acc *= 1 - e;
        acc += e * (G / p.alturaCG) * (Math.sin(fi) - Math.cos(fi) * this.ay / G) * kV;
      }
    } else {
      acc = 70 * (alvo - fi) - 17 * this.vIncl;                 // pés no chão / pezinho seguram
    }
    this.vIncl += acc * dt;
    this.inclinacao += this.vIncl * dt;

    // ---- direção: curvatura que a inclinação pede (rápido) ou guidão (devagar)
    const fiNow = this.inclinacao;
    const kapIncl = G * Math.tan(fiNow) / Math.max(vLong * vLong, 4);
    const kapGuidao = Math.tan(s * p.estercoMax) / L;
    // compensa o escorregamento dos pneus (é o que a moto faz sozinha para se equilibrar: o guidão "procura"
    // a curva que a inclinação pede) — sem passar do limite do pneu da frente
    let comp = -(rF.deriva - rT.deriva) * kV;
    if (rF.uso > 0.95 && Math.sign(comp) === Math.sign(fiNow)) comp *= Math.max(0, 1 - (rF.uso - 0.95) * 12);
    this._comp += (comp - this._comp) * Math.min(1, dt / 0.04);
    let delta = Math.atan((kV * kapIncl + (1 - kV) * kapGuidao) * L) + this._comp;
    delta = clamp(delta, -p.estercoMax, p.estercoMax);
    const dmax = p.velGuidao * dt;
    this.esterco += clamp(delta - this.esterco, -dmax, dmax);
    this.direcao = this.esterco / p.estercoMax;

    // ---- câmbio automático; "ré" = a cegonha empurra devagar
    let acel = pilotado ? (c.acelerar ?? 0) : 0;
    let freio = pilotado ? (c.frear ?? 0) : 1;
    let empurra = 0;
    if (pilotado && freio > 0.05 && acel < 0.05 && vLong < 0.4) { empurra = freio; freio = 0; this.marcha = 1; }
    const rodaT = rT.raio;
    const relacao = p.marchas[Math.max(0, this.marcha - 1)];
    this.rpm = Math.max(p.rpmMarchaLenta, Math.abs(vLong) / rodaT * relacao * p.diferencial * 60 / (2 * Math.PI));
    if (this.rpm > p.rpmTroca && this.marcha < p.marchas.length) this.marcha++;
    else if (this.rpm < p.rpmReduz && this.marcha > 1) this.marcha--;
    const curva = this.rpm < 2500 ? 0.7 + 0.3 * (this.rpm - 1150) / 1350 : this.rpm < 6500 ? 1.0 : Math.max(0, 1 - (this.rpm - 6500) / (p.rpmMax - 6500) * 0.45);
    const corte = this.rpm >= p.rpmMax ? 0 : 1;
    let fMotor = acel * p.torqueMax * curva * corte * relacao * p.diferencial / rodaT;
    if (empurra > 0) fMotor = clamp((-p.empurrar - vLong) * m * 3, -900, 900) * empurra;
    // controle de tração (corta antes quando a moto está deitada: pneu já usado na curva)
    if (!c.freioDeMao && rT.patina > 0.05) fMotor *= 1 - p.assistencia * 0.9 * Math.min(1, (rT.patina - 0.05) * 5);
    const deitada = sstep(0.15, 0.5, Math.abs(this.inclinacao));
    if (!c.freioDeMao && rT.uso > 0.92 && fMotor > 0) fMotor *= 1 - deitada * p.assistencia * Math.min(1, (rT.uso - 0.92) * 6);

    // ---- cargas (transferência de peso; empina/"stoppie" não: a carga mínima fica em 12%)
    let fzF = m * G * p.b / L - m * this.ax * p.alturaCG / L;
    let fzR = m * G * p.a / L + m * this.ax * p.alturaCG / L;
    fzF = Math.max(0.12 * m * G, fzF); fzR = Math.max(0.12 * m * G, fzR);
    // a moto deitada: a força lateral vem do pneu inclinado (cambagem) — no modelo de "bicicleta" isso
    // aparece como o ângulo de direção efetivo (delta) que dá a curvatura pedida pela inclinação
    let fx = 0, fy = 0, torque = 0, maxDeriva = 0;
    for (const r of this.rodas) {
      const fz = r.frente ? fzF : fzR;
      r.carga = fz;
      const pz = r.frente ? p.a : -p.b;
      const wl = vLat + this.omega * pz;
      const wf = vLong;
      const st = r.frente ? this.esterco : 0;
      const cs = Math.cos(st), sn = Math.sin(st);
      const vRodaF = wf * cs + wl * sn;
      const vRodaL = -wf * sn + wl * cs;
      const alpha = Math.atan2(vRodaL, Math.max(Math.abs(vRodaF), 2.5));
      const [B, C, E] = r.frente ? p.pacFrente : p.pacTras;
      const mu = r.mu;
      let fLat = -mu * fz * pacejka(alpha, B, C, E);
      let fLong = 0;
      if (!r.frente) fLong += fMotor;
      const sentido = Math.abs(vRodaF) > 0.05 ? Math.sign(vRodaF) : 0;
      fLong -= sentido * freio * p.freioMax * (r.frente ? p.divisaoFreio : 1 - p.divisaoFreio);
      if (c.freioDeMao && !r.frente && pilotado) {
        fLong -= sentido * p.freioMao;
        fLat *= p.gripFreioMao;
      }
      if (sentido === 0 && freio > 0) fLong -= clamp(vRodaF * m, -1500, 1500);
      if (this.noAr) { fLong = 0; fLat = 0; }     // no ar os pneus não encostam em nada
      // ABS: alivia o freio da roda que ia travar (com assistência)
      const lim = mu * fz;
      let tot = Math.hypot(fLong, fLat);
      r.uso = tot / Math.max(lim, 1);
      if (tot > lim && freio > 0 && p.assistencia > 0 && !(c.freioDeMao && !r.frente)) {
        const fl = Math.sqrt(Math.max(0, lim * lim - fLat * fLat));
        const fl2 = Math.sign(fLong) * Math.max(Math.abs(fLong) * (1 - p.assistencia), Math.min(Math.abs(fLong), fl));
        fLong = fl2;
        tot = Math.hypot(fLong, fLat);
      }
      let patina = 0;
      if (tot > lim) {
        patina = 1 - lim / tot;
        fLong *= lim / tot;
        fLat *= lim / tot;
      }
      const fLatMax = Math.abs(vRodaL) * (m / 2) / dt;
      fLat = clamp(fLat, -fLatMax, fLatMax);
      if (r.agua > 0.005) {
        const area = r.agua * r.largura + Math.max(0, r.agua - p.vaoLivre) * 0.45;
        const kA = 0.5 * 1000 * p.arrastoAgua * area;
        const dl = kA * vRodaF * Math.abs(vRodaF), dlat = kA * 1.5 * vRodaL * Math.abs(vRodaL);
        fLong -= clamp(dl, -Math.abs(vRodaF) * (m / 2) / dt, Math.abs(vRodaF) * (m / 2) / dt);
        fLat -= clamp(dlat, -Math.abs(vRodaL) * (m / 2) / dt, Math.abs(vRodaL) * (m / 2) / dt);
      }
      r.deriva = alpha;
      r.patina = patina;
      maxDeriva = Math.max(maxDeriva, (Math.abs(alpha) - 0.14) * Math.min(vAbs / 6, 1), patina);
      const Fz_ = fLong * cs - fLat * sn;
      const Fx_ = fLong * sn + fLat * cs;
      fx += Fx_;
      fy += Fz_;
      torque += pz * Fx_;
      r.vRoda = vRodaF;
    }
    // estabilidade (com assistência): segura a traseira quando ela começa a atravessar (o piloto contraesterça)
    if (pilotado && p.assistencia > 0 && vAbs > 3 && !this.noAr) {
      const beta = Math.atan2(vLat, Math.abs(vLong)) * Math.sign(vLong || 1);
      const exc = Math.abs(beta) - p.derivaLivre * (c.freioDeMao ? 2.2 : 1);
      if (exc > 0) {
        torque += Math.sign(beta) * exc * p.assistencia * p.inercia * 30;
        torque -= this.omega * p.assistencia * p.inercia * 3 * Math.min(1, exc * 4);
      }
    }
    // resistências + rampa
    const arr = p.arrasto * vAbs;
    fy -= arr * vLong + p.rolamento * vLong;
    const parar = (p.resistencia * m * G + (acel < 0.05 && empurra === 0 ? p.freioMotor : 0)) * Math.min(1, Math.abs(vLong) / 0.5);
    if (!this.noAr) fy -= Math.sign(vLong) * parar;
    fx -= arr * vLat;
    if (!this.noAr) fy -= m * G * (this._inclinacaoRampa ?? 0);
    else {
      this.omega *= Math.exp(-0.8 * dt);
      if (pilotado) this.omega += s * 0.9 * dt;
    }
    const axL = fy / m, ayL = fx / m;
    this.vel.x += (sinY * fy + cosY * fx) / m * dt;
    this.vel.y += (cosY * fy - sinY * fx) / m * dt;
    this.omega += torque / p.inercia * dt;
    if (acel < 0.01 && empurra === 0 && vAbs < 0.08 && freio > 0) { this.vel.set(0, 0); this.omega *= 0.5; }
    this.ax += (axL - this.ax) * Math.min(1, dt * 10);
    this.ay += (ayL - this.ay) * Math.min(1, dt * 25);
    this.rumo += this.omega * dt;
    vLong = this.vel.x * Math.sin(this.rumo) + this.vel.y * Math.cos(this.rumo);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.derrapagem = clamp(maxDeriva * 3, 0, 1);
    this.velocidadeKmh = vLong * 3.6;
    for (const r of this.rodas) r.giro += (r.vRoda ?? 0) / r.raio * dt * (r.patina > 0.3 && !r.frente && acel > 0.5 ? 1.5 : 1);
    if (c.freioDeMao && pilotado) rT.giro -= (rT.vRoda ?? 0) / rT.raio * dt;

    // ---- QUEDA: inclinou demais, perdeu a frente, a traseira atravessou, ou o equilíbrio não fecha
    if (pilotado && this.apoio < 0.05 && !this.noAr) {
      const fiAbs = Math.abs(this.inclinacao);
      // deitada mais do que a força lateral dos pneus sustenta (só conta com os pneus escorregando)
      const sobra = Math.sign(this.inclinacao) * (this.inclinacao - Math.atan(this.ay / G));
      const escorrega = this._escorrega;
      const T = this._timers;
      T.lavada = rF.patina > 0.22 && vLong > 4 ? T.lavada + dt : Math.max(0, T.lavada - dt * 2);
      T.deseq = sobra > 0.17 && escorrega > 0.08 && vLong > 3 ? T.deseq + dt : Math.max(0, T.deseq - dt * 2);
      if (fiAbs > p.quedaInclinacao) this._cair('inclinou demais');
      else if (T.lavada > 0.35) this._cair('a roda da frente escorregou');
      else if (T.deseq > 0.3) this._cair('perdeu o equilíbrio');
      else if (Math.abs(rT.deriva) > 1.0 && vAbs > 7) this._cair('a traseira atravessou');
    }
    // rampas/buracos: decola quando o chão "foge" mais rápido que a gravidade; pouso muito forte ou torto derruba
    passoVertical(this, dt, 1.0, (impacto) => {
      if (!pilotado) return;
      if (impacto > p.quedaPouso || (impacto > p.quedaPouso * 0.55 && Math.abs(this.inclinacao) > 0.6)) this._cair('pouso forte');
    });
    if (this._colisaoMundo) this._colidir(pilotado);
  }

  // deitada no chão: escorrega até parar
  _passoCaida(dt, vLong, vLat, sinY, cosY) {
    const p = this.p;
    if (this.caida && !this._levantar) {
      const lado = this._ladoQueda;
      const rep = lado > 0 ? this._repouso.E : this._repouso.D;
      this.vIncl += lado * (G / p.alturaCG) * Math.abs(Math.sin(this.inclinacao)) * dt + lado * 2.5 * dt;
      this.inclinacao += this.vIncl * dt;
      if (Math.abs(this.inclinacao) >= Math.abs(rep)) {
        this.inclinacao = rep;
        // pancada no chão (0..1): o som_carro.js toca a queda do piso certo e zera (como a "batida")
        const forca = Math.min(1, Math.abs(this.vIncl) / 6 + Math.hypot(this.vel.x, this.vel.y) / 18);
        if (Math.abs(this.vIncl) > 0.6) this.tombo = Math.max(this.tombo ?? 0, forca);
        this.vIncl = -this.vIncl * 0.18;                       // pulinho ao bater no chão
        if (Math.abs(this.vIncl) < 0.3) this.vIncl = 0;
      }
    }
    const vAbs = Math.hypot(this.vel.x, this.vel.y);
    const piso = this.rodas[1].tipo;
    const mu = (ATRITO_CAIDA[piso] ?? 0.5) + Math.min(0.4, this.agua * 2);
    const dv = mu * G * dt;
    if (vAbs > dv) { this.vel.multiplyScalar((vAbs - dv) / vAbs); } else this.vel.set(0, 0);
    this.omega *= Math.exp(-1.8 * dt);
    this.rumo += this.omega * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.esterco *= Math.exp(-3 * dt);
    this.direcao = this.esterco / p.estercoMax;
    for (const r of this.rodas) { r.vRoda = (r.vRoda ?? 0) * Math.exp(-0.8 * dt); r.giro += r.vRoda / r.raio * dt; r.patina = 0; }
    this.velocidadeKmh = (this.vel.x * Math.sin(this.rumo) + this.vel.y * Math.cos(this.rumo)) * 3.6;
    this.derrapagem = vAbs > 1 ? 1 : 0;
    this.rpm = p.rpmMarchaLenta;
    this.marcha = 1;
    this.ax = this.ay = 0;
    if (this._colisaoMundo) this._colidir(false);
  }

  // Corpo sólido para quem está FORA dela (cegonha a pé, urubus...). Retorna null ou { tipo: 'moto', normal }.
  resolverColisao(pos, raio = 0.4) {
    this.no.updateMatrixWorld(true);
    const inv = this._inv ?? (this._inv = new THREE.Matrix4());
    inv.copy(this.no.matrixWorld).invert();
    const l = pos.clone().applyMatrix4(inv);
    let contato = null;
    for (const [x0, x1, y0, y1, z0, z1] of this.caixas) {
      const cx = clamp(l.x, x0, x1), cy = clamp(l.y, y0, y1), cz = clamp(l.z, z0, z1);
      const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      let n = null, prof = 0;
      if (d2 > 1e-10) {
        if (d2 >= raio * raio) continue;
        const d = Math.sqrt(d2);
        n = new THREE.Vector3(dx / d, dy / d, dz / d); prof = raio - d;
      } else {
        const op = [[l.x - x0, -1, 0, 0], [x1 - l.x, 1, 0, 0], [l.z - z0, 0, 0, -1], [z1 - l.z, 0, 0, 1]];
        if (l.y > y1 - 0.1) op.push([y1 - l.y, 0, 1, 0]);
        op.sort((a, b) => a[0] - b[0]);
        n = new THREE.Vector3(op[0][1], op[0][2], op[0][3]); prof = op[0][0] + raio;
      }
      l.addScaledVector(n, prof);
      contato = { tipo: 'moto', normal: n.transformDirection(this.no.matrixWorld) };
    }
    if (contato) pos.copy(l.applyMatrix4(this.no.matrixWorld));
    return contato;
  }

  _colidir(pilotado) {
    const p = this.p;
    const f = this.frente.clone();
    for (const off of [p.a * 0.75, -p.b * 0.6]) {
      const centro = new THREE.Vector3(this.pos.x + f.x * off, this.pos.y + 0.55, this.pos.z + f.z * off);
      const antes = centro.clone();
      this._colisaoMundo(centro, p.colisaoRaio, { chao: false, sacudir: true });
      const dx = centro.x - antes.x, dz = centro.z - antes.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        this.pos.x += dx; this.pos.z += dz;
        const nx = dx / d, nz = dz / d;
        const vn = this.vel.x * nx + this.vel.y * nz;
        if (vn < 0) {
          this.vel.x -= 1.3 * vn * nx;
          this.vel.y -= 1.3 * vn * nz;
          this.omega = this.omega * 0.5 + (off > 0 ? 1 : -1) * (nx * f.z - nz * f.x) * vn * 0.4;
          this.batida = Math.max(this.batida ?? 0, -vn);
          if (pilotado && !this.caida && -vn > p.velQueda) this._cair('bateu');
        }
      }
    }
  }

  _aplicarVisual(dt) {
    const p = this.p;
    const f = { x: Math.sin(this.rumo), z: Math.cos(this.rumo) };
    const h = (fw) => this.alturaChao(this.pos.x + f.x * fw, this.pos.z + f.z * fw);
    const hF = h(p.a), hT = h(-p.b);
    const L = p.a + p.b;
    const yAlvo = (hF + hT) / 2;
    this._inclinacaoRampa = (hF - hT) / L;
    const pitchAlvo = -Math.atan2(hF - hT, L);
    const S = this._susp;
    if (dt > 0 && this.noAr) {
      S.y.x = this.yAr; S.y.v = this.vy;
      molas(S.pitch, alvoArfagemNoAr(this), dt, 1.4, 0.8);
      molas(S.bodyP, 0, dt, 2.6, 0.6);
    } else if (dt > 0) {
      molas(S.y, yAlvo, dt, 6, 0.9); molas(S.pitch, pitchAlvo, dt, 5, 0.9);
      if (S.y.x < yAlvo - 0.22) { S.y.x = yAlvo - 0.22; S.y.v = Math.max(S.y.v, 0); }
      molas(S.bodyP, this.caida ? 0 : clamp(-this.ax * 0.010, -0.06, 0.06), dt, 2.6, 0.6);
    } else { S.y.x = yAlvo; S.pitch.x = pitchAlvo; }
    const fi = this.inclinacao;
    this.pos.y = S.y.x;
    this.no.position.set(this.pos.x, S.y.x + this._elevacao(fi), this.pos.z);
    _e.set(S.pitch.x, this.rumo, -fi, 'YXZ');
    this.no.quaternion.setFromEuler(_e);
    if (this.carroceria) {
      _e.set(S.bodyP.x, 0, 0, 'YXZ');
      this.carroceria.quaternion.setFromEuler(_e);
      const piv = new THREE.Vector3(0, p.alturaCG, 0);
      this.carroceria.position.copy(this.carroceriaP0).add(piv).sub(piv.clone().applyQuaternion(this.carroceria.quaternion));
    }
    if (this.guidao) this.guidao.quaternion.copy(this.guidaoQ0).multiply(_q.setFromAxisAngle(EIXO_Y, this.esterco));
    for (const r of this.rodas) r.obj.quaternion.copy(r.q0).multiply(_q.setFromAxisAngle(EIXO_X, r.giro));
    // pezinho: embaixo enquanto a moto está apoiada/parada; recolhe quando sai andando
    if (this.descanso) {
      const vAbs = Math.hypot(this.vel.x, this.vel.y);
      if (this.apoio > 0.01 || this.caida || this._levantar) this._dobraDescanso = Math.max(0, this._dobraDescanso - dt * 4);
      else if (vAbs > 1.0) this._dobraDescanso = Math.min(1, this._dobraDescanso + dt * 3);
      this.descanso.quaternion.copy(this.descansoQ0).multiply(_q.setFromAxisAngle(EIXO_X, this._dobraDescanso * 1.75));
    }
  }
}

// =====================================================================================
// cegonha pilotando (com ou sem a AK)
// =====================================================================================
const BRACO_E = ['Braco_Mecanico_Esquerda', 'Antebraco_Mecanico_Esquerda'];
const BRACO_D = ['Braco_Mecanico_Direita', 'Antebraco_Mecanico_Direita'];
const CABECA = ['Pescoco_2', 'Cabeca'];

function filtrar(clip, manter, nome) {
  const tracks = clip.tracks.filter((t) => manter(t.name.split('.')[0]));
  return new THREE.AnimationClip(nome ?? clip.name, clip.duration, tracks);
}

export class PilotoMoto {
  constructor({ cegonha, mixer, clips, moto, cena, alturaChao, armada, prefixo, resolverColisao,
                clipParado = 'Cegonha_AK_Segurar', clipParadoSemArma = 'Cegonha_Parado', distanciaEntrar = 1.7 }) {
    this.cegonha = cegonha;
    this.mixer = mixer;
    this.moto = moto;
    this.veiculo = moto;
    this.cena = cena;
    this.alturaChao = alturaChao ?? moto.alturaChao;
    this.resolverColisao = resolverColisao ?? null;      // árvores/pedras do mapa (para o voo da queda)
    this.distanciaEntrar = distanciaEntrar;
    this.estado = 'fora';         // 'fora' | 'levantando' | 'entrando' | 'dirigindo' | 'saindo' | 'caindo'
    this.onEntrou = null; this.onSaiu = null; this.onCaiu = null; this.onQueda = null;
    const ak = cegonha.getObjectByName('AK47');
    this._armadaFn = typeof armada === 'function' ? armada : armada === undefined ? () => (ak ? ak.visible : true) : () => armada;
    this.armada = this._armadaFn();
    const pre = prefixo ?? moto.prefixoCegonha ?? 'Cegonha_Moto_';
    const C = (n) => {
      const c = THREE.AnimationClip.findByName(clips, n);
      if (!c) throw new Error('[moto] falta o clip ' + n + ' na cegonha (use o .glb com as animações da moto)');
      return c;
    };
    // medidas do rig (extras do armature) — com valores padrão iguais aos do rig_cegonha_moto.py
    let ex = {};
    cegonha.traverse((o) => { if (o.userData && o.userData.moto_altura_assento !== undefined) ex = o.userData; });
    this.alturaAssento = ex.moto_altura_assento ?? 0.74;
    this.pouso = new THREE.Vector2(ex.moto_queda_pouso_x ?? 1.25, ex.moto_queda_pouso_y ?? -2.6);
    const em = (lista) => (b) => lista.includes(b);
    const fora = (lista) => (b) => !lista.includes(b);
    const comArma = [...BRACO_E, ...CABECA], semArma = [...BRACO_E, ...BRACO_D, ...CABECA];
    this.clipParado = C(clipParado);
    this.clipParadoSemArma = C(clipParadoSemArma);
    const A = (clip) => mixer.clipAction(clip);
    this.a = {
      entrar: A(C(pre + 'Entrar')), sair: A(C(pre + 'Sair')), queda: A(C(pre + 'Queda')),
      entrarSA: A(C(pre + 'Entrar_SemArma')), sairSA: A(C(pre + 'Sair_SemArma')), quedaSA: A(C(pre + 'Queda_SemArma')),
      dirigir: A(filtrar(C(pre + 'Dirigindo'), fora(comArma), 'Moto_Base')),
      atirar: A(filtrar(C(pre + 'Dirigindo_Atirando'), fora(comArma), 'Moto_Base_Atirando')),
      volC: A(filtrar(C(pre + 'Dirigindo'), em(comArma), 'Moto_Guidao_Centro')),
      volE: A(filtrar(C(pre + 'Guidao_Esquerda'), em(comArma), 'Moto_Guidao_E')),
      volD: A(filtrar(C(pre + 'Guidao_Direita'), em(comArma), 'Moto_Guidao_D')),
      dirigirSA: A(filtrar(C(pre + 'Dirigindo_SemArma'), fora(semArma), 'Moto_Base_SA')),
      volCSA: A(filtrar(C(pre + 'Dirigindo_SemArma'), em(semArma), 'Moto_Guidao_Centro_SA')),
      volESA: A(filtrar(C(pre + 'Guidao_Esquerda_SemArma'), em(semArma), 'Moto_Guidao_E_SA')),
      volDSA: A(filtrar(C(pre + 'Guidao_Direita_SemArma'), em(semArma), 'Moto_Guidao_D_SA')),
    };
    for (const k of ['entrar', 'sair', 'queda', 'entrarSA', 'sairSA', 'quedaSA']) {
      this.a[k].setLoop(THREE.LoopOnce, 1);
      this.a[k].clampWhenFinished = true;
    }
    this._tiro = 0;
    this._arma = this.armada ? 1 : 0;
    this._pendente = null;
    this._ref = new THREE.Object3D();            // referencial "em pé" do banco (subir/descer) e da queda
    this._ref.name = 'Cegonha_Moto_Referencia';
    mixer.addEventListener('finished', (e) => {
      if ((e.action === this.a.entrar || e.action === this.a.entrarSA) && this.estado === 'entrando') this._pendente = 'dirigir';
      if ((e.action === this.a.sair || e.action === this.a.sairSA) && this.estado === 'saindo') this._pendente = 'saiu';
      if ((e.action === this.a.queda || e.action === this.a.quedaSA) && this.estado === 'caindo') this._pendente = 'pousou';
    });
    moto.onQueda = (motivo) => { if (this.estado === 'dirigindo') this._pendente = 'queda'; this.onQueda?.(motivo); };
  }

  get dirigindo() { return this.estado === 'dirigindo'; }

  definirArma(armada) { this.armada = !!armada; }

  podeEntrar() {
    if (this.estado !== 'fora') return false;
    const m = this.moto;
    const c = this.cegonha.getWorldPosition(new THREE.Vector3());
    if (m.caida) { const mp = m.posMundo(); return m.parada && Math.hypot(mp.x - c.x, mp.z - c.z) < this.distanciaEntrar + 0.8 * m.escalaMundo; }
    const p = m.pontoEntrada(new THREE.Vector3());
    return Math.hypot(p.x - c.x, p.z - c.z) < this.distanciaEntrar && Math.abs(m.velocidade) < 1.0;
  }

  podeSair() { return this.estado === 'dirigindo' && Math.abs(this.moto.velocidade) < 1.5 && !this.moto.caida; }

  // distância até o ponto de subida (para escolher o veículo mais perto)
  distancia(pos) {
    const p = this.moto.caida ? this.moto.posMundo() : this.moto.pontoEntrada(new THREE.Vector3());
    return Math.hypot(p.x - pos.x, p.z - pos.z);
  }

  entrar(armada = this._armadaFn()) {
    if (!this.podeEntrar()) return false;
    this.armada = !!armada;
    this._arma = this.armada ? 1 : 0;
    this.moto.ocupado = true;
    if (this.moto.caida) {
      // a moto está deitada: a cegonha levanta a moto (fica parada do lado) e depois sobe
      this.estado = 'levantando';
      this.moto.levantar(() => { this._pendente = 'subir'; });
      return true;
    }
    this._subir();
    return true;
  }

  _subir() {
    this.estado = 'entrando';
    this._prender(this._ref, true);
    this.mixer.stopAllAction();
    this._clip = this.armada ? this.a.entrar : this.a.entrarSA;
    this._clip.reset().play();
    this.mixer.update(0);
  }

  sair() {
    if (!this.podeSair()) return false;
    this.estado = 'saindo';
    this._saiuArmada = this.armada;
    this._prender(this._ref, true);
    this.mixer.stopAllAction();
    this._clip = this.armada ? this.a.sair : this.a.sairSA;
    this._clip.reset().play();
    this.mixer.update(0);
    return true;
  }

  _prender(pai, referenciaReta = false) {
    if (referenciaReta) {
      if (!this._ref.parent) this.cena.add(this._ref);
      this.moto.referenciaReta(this._ref);
    }
    const escala = this.cegonha.getWorldScale(new THREE.Vector3()).x / pai.getWorldScale(new THREE.Vector3()).x;
    pai.add(this.cegonha);
    this.cegonha.position.set(0, 0, 0);
    this.cegonha.quaternion.identity();
    this.cegonha.scale.setScalar(escala);
  }

  _comecarDirigir() {
    this.estado = 'dirigindo';
    this.moto.apoio = 0;
    this._prender(this.moto.assento);
    this.mixer.stopAllAction();
    for (const k of ['dirigir', 'atirar', 'volC', 'volE', 'volD', 'dirigirSA', 'volCSA', 'volESA', 'volDSA']) this.a[k].reset().play();
    this._pesos();
    this.mixer.update(0);
    this.onEntrou?.();
  }

  _soltarNoMundo(pos, rumo, armada) {
    const escala = this.cegonha.getWorldScale(new THREE.Vector3()).x;
    this.cena.add(this.cegonha);
    this.cegonha.position.set(pos.x, this.alturaChao ? this.alturaChao(pos.x, pos.z) : pos.y, pos.z);
    this.cegonha.quaternion.setFromAxisAngle(EIXO_Y, rumo);
    this.cegonha.scale.setScalar(escala);
    this.mixer.stopAllAction();
    this.mixer.clipAction(armada ? this.clipParado : this.clipParadoSemArma).reset().play();
    this.mixer.update(0);
    this.estado = 'fora';
    this.moto.ocupado = false;
  }

  _terminouSair() {
    const p = this.moto.pontoEntrada(new THREE.Vector3());
    this._soltarNoMundo(p, this.moto.rumo, this._saiuArmada);
    this.moto.apoio = 1;
    this.onSaiu?.();
  }

  // ---------------- queda: a cegonha sai voando da moto e pousa longe dela
  _comecarQueda() {
    const m = this.moto;
    this.estado = 'caindo';
    this._saiuArmada = this.armada;
    // referencial: onde o banco estava (sem inclinação), virado para onde a moto ia
    const banco = m.assento.getWorldPosition(new THREE.Vector3());
    const esc = this._esc = m.escalaMundo;      // metros da moto -> mundo
    if (!this._ref.parent) this.cena.add(this._ref);
    this._ref.position.copy(banco);
    this._ref.scale.setScalar(esc);
    this._quedaRumo = m.rumo;
    this._quedaRoll = -m.inclinacao;            // começa deitada junto com a moto e se endireita no ar
    this._quedaT = 0;
    this._ref.quaternion.setFromEuler(_e.set(0, m.rumo, this._quedaRoll, 'YXZ'));
    this._ref.updateMatrixWorld(true);
    this._quedaVel = new THREE.Vector3(m.vel.x, 0, m.vel.y).multiplyScalar(0.85 * esc);   // embalo da moto
    this._quedaY0 = banco.y;
    // onde vai pousar (sem colisão): local (x, chão, -y) + embalo (v / k)
    const k = 2.2;
    const loc = new THREE.Vector3(this.pouso.x, 0, -this.pouso.y).applyAxisAngle(EIXO_Y, m.rumo).multiplyScalar(esc);
    const px = banco.x + loc.x + this._quedaVel.x / k, pz = banco.z + loc.z + this._quedaVel.z / k;
    this._quedaChao = this.alturaChao ? this.alturaChao(px, pz) : banco.y - this.alturaAssento * esc;
    this._quedaK = k;
    this._prender(this._ref);
    this.mixer.stopAllAction();
    this._clip = this.armada ? this.a.queda : this.a.quedaSA;
    this._clip.reset().play();
    this.mixer.update(0);
  }

  _atualizarQueda(dt) {
    const r = this._ref;
    this._quedaT += dt;
    r.quaternion.setFromEuler(_e.set(0, this._quedaRumo, this._quedaRoll * (1 - sstep(0, 0.35, this._quedaT)), 'YXZ'));
    this._quedaVel.multiplyScalar(Math.exp(-this._quedaK * dt));
    r.position.addScaledVector(this._quedaVel, dt);
    // não atravessa árvore/pedra voando: empurra o referencial
    if (this.resolverColisao) {
      const c = r.position.clone(); c.y += 0.3 * this._esc;
      const c0 = c.clone();
      this.resolverColisao(c, 0.45 * this._esc, { chao: false });
      r.position.x += c.x - c0.x; r.position.z += c.z - c0.z;
      if (c.distanceTo(c0) > 1e-4) this._quedaVel.multiplyScalar(0.3);
    }
    const t = this._clip.time / this._clip.getClip().duration;
    r.position.y = this._quedaY0 + (this._quedaChao + this.alturaAssento * this._esc - this._quedaY0) * sstep(0.1, 0.8, t);
    r.updateMatrixWorld(true);
  }

  _terminouQueda() {
    const r = this._ref;
    const loc = new THREE.Vector3(this.pouso.x, 0, -this.pouso.y).applyAxisAngle(EIXO_Y, this._quedaRumo).multiplyScalar(this._esc);
    const p = new THREE.Vector3(r.position.x + loc.x, 0, r.position.z + loc.z);
    this._soltarNoMundo(p, this._quedaRumo, this._saiuArmada);
    this.onCaiu?.(this.moto.ultimaQueda);
    this.onSaiu?.();
  }

  _pesos() {
    const s = clamp(this.moto.direcao, -1, 1);
    const A = this._arma, c = 1 - Math.abs(s), e = Math.max(0, s), d = Math.max(0, -s);
    const w = (k, v) => this.a[k].setEffectiveWeight(v);
    w('dirigir', A * (1 - this._tiro)); w('atirar', A * this._tiro); w('dirigirSA', 1 - A);
    w('volC', A * c); w('volE', A * e); w('volD', A * d);
    w('volCSA', (1 - A) * c); w('volESA', (1 - A) * e); w('volDSA', (1 - A) * d);
  }

  // chame ANTES do mixer.update(dt) e DEPOIS do moto.update(dt)
  update(dt, { atirando = false } = {}) {
    const pend = this._pendente;
    this._pendente = null;
    if (pend === 'dirigir') this._comecarDirigir();
    else if (pend === 'saiu') this._terminouSair();
    else if (pend === 'subir') this._subir();
    else if (pend === 'queda') this._comecarQueda();
    else if (pend === 'pousou') this._terminouQueda();
    const m = this.moto;
    if (this.estado === 'entrando' || this.estado === 'saindo') {
      m.referenciaReta(this._ref);
      // a moto sai do pezinho quando ela pousa no banco / volta para o pezinho quando ela pula fora
      const t = this._clip.time / this._clip.getClip().duration;
      m.apoio = this.estado === 'entrando' ? 1 - sstep(0.58, 0.82, t) : sstep(0.2, 0.45, t);
      return;
    }
    if (this.estado === 'caindo') { this._atualizarQueda(dt); return; }
    if (this.estado !== 'dirigindo') return;
    this._arma += clamp((this.armada ? 1 : 0) - this._arma, -dt * 3, dt * 3);
    const alvo = atirando && this.armada ? 1 : 0;
    this._tiro += clamp(alvo - this._tiro, -dt * 8, dt * 8);
    this._pesos();
  }
}
