// carro.js — buggy com física de curva (pneus com modelo de Pacejka, transferência de peso, derrapagem),
// água (arrasto e menos aderência), tipos de piso, corpo sólido, e a cegonha entrando/dirigindo/saindo
// COM ou SEM a AK.  three.js r150+
//
//   import { Buggy, MotoristaCegonha } from './carro.js';
//
//   const buggy = new Buggy(gltfBuggy.scene, mapa.paraBuggy());   // ou { alturaChao, resolverColisao, superficie, profundidade }
//   scene.add(gltfBuggy.scene);
//   buggy.posicionar(new THREE.Vector3(0, 0, 10), 0);             // posição e rumo (radianos)
//
//   const motorista = new MotoristaCegonha({ cegonha: gltfCegonha.scene, mixer, clips: gltfCegonha.animations,
//                                            buggy, cena: scene, alturaChao,
//                                            armada: () => cegonhaTemArma });   // sem isso: segue AK47.visible
//
//   // no loop:
//   if (apertouE) motorista.estado === 'fora' ? motorista.entrar() : motorista.sair();
//   if (pegouOuGuardouArma) motorista.definirArma(temArma);      // dentro do carro também (troca suave)
//   buggy.update(dt, motorista.dirigindo ? { acelerar, frear, volante, freioDeMao } : null);
//   motorista.update(dt, { atirando });                           // ANTES do mixer.update
//   mixer.update(dt);
//
//   // quem está a pé não atravessa o carro (cegonha, urubus...): passe o CENTRO do corpo
//   buggy.resolverColisao(centroDoPersonagem, raio);
//
// Eixos do buggy no three.js: frente = +Z local, esquerda = +X, cima = +Y.

import * as THREE from 'three';
import { passoVertical, zerarSalto, alvoArfagemNoAr } from './salto.js';

const G = 9.81;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const EIXO_Z = new THREE.Vector3(0, 0, 1);

// fórmula "mágica" de Pacejka (força lateral normalizada, pico ~1 perto de 'pico' rad)
function pacejka(alpha, B, C, E) {
  const x = B * alpha;
  return Math.sin(C * Math.atan(x - E * (x - Math.atan(x))));
}

function molas(estado, alvo, dt, freq = 6, amort = 0.8) {
  // mola-amortecedor implícito (estável com qualquer dt) — suaviza a carroceria
  const w = 2 * Math.PI * freq;
  estado.v = (estado.v + dt * w * w * (alvo - estado.x)) / (1 + 2 * amort * w * dt + w * w * dt * dt);
  estado.x += estado.v * dt;
  return estado.x;
}

export class Buggy {
  constructor(raiz, opcoes = {}) {
    this.raiz = raiz;
    raiz.updateMatrixWorld(true);
    const ud = raiz.getObjectByName('Buggy')?.userData ?? {};
    const achar = (n) => raiz.getObjectByName(n);
    this.no = achar('Buggy') ?? raiz;                    // nó que recebe posição/rotação
    this.carroceria = achar('Carroceria');
    this.volante = achar('Volante');
    this.assento = achar('Cegonha_Assento');
    this.entrada = achar('Cegonha_Entrada');
    this.farois = [achar('Farol_E'), achar('Farol_D')].filter(Boolean);
    this.escapamentos = [achar('Escapamento_E'), achar('Escapamento_D')].filter(Boolean);
    this.rodas = ['Roda_DE', 'Roda_DD', 'Roda_TE', 'Roda_TD'].map((n) => {
      const o = achar(n);
      return { obj: o, nome: n, frente: n[5] === 'D', esquerda: n[6] === 'E', base: o.position.clone(),
               raio: o.userData.raio ?? (n[5] === 'D' ? 0.33 : 0.37), giro: 0, carga: 0, deriva: 0, patina: 0 };
    });
    for (const r of this.rodas) r.obj.rotation.order = 'YXZ';
    this.volanteQ0 = this.volante ? this.volante.quaternion.clone() : null;
    this.carroceriaP0 = this.carroceria ? this.carroceria.position.clone() : new THREE.Vector3();
    // caixas sólidas (referencial do carro: x esquerda, y cima, z frente) — [x0,x1, y0,y1, z0,z1]
    this.prefixoCegonha = ud.prefixo_cegonha ?? 'Cegonha_Carro_';   // animações da cegonha para ESTE carro
    this.caixas = opcoes.caixas ?? (ud.caixas ? JSON.parse(ud.caixas) : null) ?? [
      [-0.95, 0.95, 0.0, 0.95, -2.05, 2.25],      // carroceria + rodas + para-choques
      [-0.66, 0.66, 0.95, 1.82, -0.95, -0.68],    // santo-antônio
    ];

    // ---------------- parâmetros (podem ser trocados à vontade)
    const p = this.p = Object.assign({
      massa: ud.massa ?? 700,                    // kg
      a: ud.eixo_dianteiro ?? 1.30,              // CG -> eixo dianteiro (m)
      b: ud.eixo_traseiro ?? 1.25,               // CG -> eixo traseiro (m)
      bitola: ((ud.bitola_d ?? 1.54) + (ud.bitola_t ?? 1.60)) / 2,
      alturaCG: ud.altura_cg ?? 0.50,
      mu: 1.05,                                  // atrito do pneu (asfalto ~1.0, terra ~0.7, lama ~0.45)
      // Pacejka (B, C, E). Traseira mais rígida que a dianteira = carro estável (sai de frente no limite);
      // a traseira só escorrega com freio de mão ou pé embaixo na curva (círculo de atrito).
      pacFrente: [8.0, 1.30, 0.0],
      pacTras: [12.0, 1.25, 0.2],
      muTras: 1.08,                              // aderência extra da traseira (pneus mais largos)
      assistencia: 0.6,                          // 0 = simulação pura; 1 = controle de tração/estabilidade forte
      derivaLivre: 30 * Math.PI / 180,           // até esse ângulo de derrapagem a assistência não interfere (drift)
      esterco: (ud.esterco_max_deg ?? 34) * Math.PI / 180,   // esterço máximo das rodas (o GLB pode limitar)
      estercoAltaVel: 0.45,                      // fração do esterço que sobra a ~120 km/h
      velVolante: 3.2,                           // quão rápido o volante vira (1/s)
      torqueMax: 175,                            // N·m no motor
      rpmMax: 6200, rpmMarchaLenta: 900, rpmTroca: 5600, rpmReduz: 2600,
      marchas: [3.30, 2.10, 1.45, 1.08, 0.86],
      diferencial: ud.diferencial ?? 4.4,
      re: 3.6,
      freioMax: 9000,                            // N (total, 4 rodas)
      freioMao: 3500,                            // N nas traseiras
      gripFreioMao: 0.35,                        // rodas traseiras travadas perdem aderência lateral
      arrasto: 0.95,                             // ½ρ·Cd·A
      rolamento: 12,                             // N·s/m
      resistencia: 0.015,                        // resistência ao rolamento (× peso)
      arrastoAgua: 0.4,                          // Cd da água nas rodas
      vaoLivre: 0.28,                            // altura do assoalho: água acima disso freia muito mais
      freioMotor: 550,                           // N quando tira o pé do acelerador
      inercia: null,                             // kg·m² (null = massa·a·b)
      colisaoRaio: ud.colisao_raio ?? 0.95,
      rolagemVisual: 0.022,                      // rad por m/s² de aceleração lateral (carroceria inclina)
      arfagemVisual: 0.012,
      volanteMaxDeg: ud.volante_max_deg ?? 90,
    }, opcoes.parametros ?? {});
    if (!p.inercia) p.inercia = p.massa * p.a * p.b;

    this.alturaChao = opcoes.alturaChao ?? (() => 0);
    this._colisaoMundo = opcoes.resolverColisao ?? null;   // colisão com o mapa (árvores, pedras...)
    // opcionais do mapa: tipo de chão e profundidade da água em cada roda
    this.superficie = opcoes.superficie ?? null;      // (x, z) => { tipo: 'estrada'|'grama'|'lama'|..., mu: 0..1 }
    this.profundidade = opcoes.profundidade ?? null;  // (x, z) => metros de água acima do chão (0 = seco)
    this.agua = 0;                                    // média de água nas rodas (m)

    // ---------------- estado
    this.pos = new THREE.Vector3();            // centro (no chão), mundo
    this.rumo = 0;                             // yaw (rad): 0 = olhando para +Z
    this.vel = new THREE.Vector2();            // velocidade no mundo (x, z)
    this.omega = 0;                            // velocidade angular (rad/s, + = vira à esquerda)
    this.esterco = 0;                          // ângulo atual das rodas (rad, + = esquerda)
    this.direcao = 0;                          // -1..1 (volante atual, + = esquerda) — usado pela cegonha
    this.marcha = 1;                           // 1..5, -1 = ré, 0 = neutro
    this.rpm = p.rpmMarchaLenta;
    this.ax = 0; this.ay = 0;                  // acelerações no referencial do carro
    this.derrapagem = 0;                       // 0..1 (para fumaça / som de pneu)
    this.velocidadeKmh = 0;
    this.ocupado = false;
    this._susp = { y: { x: 0, v: 0 }, pitch: { x: 0, v: 0 }, roll: { x: 0, v: 0 },
                   bodyP: { x: 0, v: 0 }, bodyR: { x: 0, v: 0 } };
    zerarSalto(this);                          // rampas: noAr, vy, pouso... (js/salto.js)
    this.posicionar(this.no.position.clone(), 0);
  }

  posicionar(pos, rumo = 0) {
    this.ax = this.ay = 0;
    this.pos.copy(pos);
    this.rumo = rumo;
    this.vel.set(0, 0);
    this.omega = 0;
    zerarSalto(this);
    this._susp.y.x = this.alturaChao(pos.x, pos.z);
    this._susp.y.v = 0;
    this._aplicarVisual(0);
  }

  // ponto no chão (mundo) onde a cegonha fica para entrar
  pontoEntrada(alvo = new THREE.Vector3()) {
    this.no.updateMatrixWorld(true);
    return this.entrada ? this.entrada.getWorldPosition(alvo) : alvo.copy(this.pos);
  }

  get frente() { return _v.set(Math.sin(this.rumo), 0, Math.cos(this.rumo)); }
  get velocidade() {                         // m/s para a frente (negativo = ré)
    return this.vel.x * Math.sin(this.rumo) + this.vel.y * Math.cos(this.rumo);
  }

  // controles: { acelerar 0..1, frear 0..1, volante -1..1 (+ = esquerda), freioDeMao bool } ou null (sem motorista)
  update(dt, controles = null) {
    dt = Math.min(dt, 0.05);
    if (!(dt > 0)) return;
    // sem motorista (ou entrando/saindo): carro freado e de freio de mão puxado
    const c = controles ?? { acelerar: 0, frear: 1, volante: 0, freioDeMao: true, estacionado: true };
    const passos = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / passos;
    for (let i = 0; i < passos; i++) this._passo(h, c);
    this._aplicarVisual(dt);
  }

  _passo(dt, c) {
    const p = this.p;
    const m = p.massa, L = p.a + p.b;
    const sinY = Math.sin(this.rumo), cosY = Math.cos(this.rumo);
    // velocidade no referencial do carro (long = frente, lat = esquerda)
    let vLong = this.vel.x * sinY + this.vel.y * cosY;
    let vLat = this.vel.x * cosY - this.vel.y * sinY;
    const vAbs = Math.hypot(vLong, vLat);

    // ---- volante (sensível à velocidade) + volta sozinho
    const lim = p.esterco * (1 - (1 - p.estercoAltaVel) * Math.min(Math.abs(vLong) / 33, 1));
    const alvo = THREE.MathUtils.clamp(c.volante ?? 0, -1, 1) * lim;
    const dmax = p.velVolante * p.esterco * dt;
    this.esterco += THREE.MathUtils.clamp(alvo - this.esterco, -dmax, dmax);
    this.direcao = this.esterco / p.esterco;

    // ---- câmbio automático + ré
    let acel = c.acelerar ?? 0, freio = c.frear ?? 0;
    if (c.estacionado) {
      if (this.marcha === -1) this.marcha = 1;
    } else if (this.marcha === -1) {
      if (acel > 0.05 && vLong > -0.5) this.marcha = 1;
      [acel, freio] = [freio, acel];                       // na ré: "frear" acelera para trás
    } else if (freio > 0.05 && acel < 0.05 && vLong < 0.6) {
      this.marcha = -1;
      [acel, freio] = [freio, 0];
    }
    const rodaT = (this.rodas[2].raio + this.rodas[3].raio) / 2;
    const relacao = this.marcha === -1 ? p.re : p.marchas[Math.max(0, this.marcha - 1)];
    this.rpm = Math.max(p.rpmMarchaLenta, Math.abs(vLong) / rodaT * relacao * p.diferencial * 60 / (2 * Math.PI));
    if (this.marcha > 0) {
      if (this.rpm > p.rpmTroca && this.marcha < p.marchas.length) this.marcha++;
      else if (this.rpm < p.rpmReduz && this.marcha > 1) this.marcha--;
    }
    const curva = this.rpm < 1500 ? 0.75 : this.rpm < 4500 ? 1.0 : Math.max(0, 1 - (this.rpm - 4500) / (p.rpmMax - 4500) * 0.6);
    const corte = this.rpm >= p.rpmMax ? 0 : 1;
    let fMotor = acel * p.torqueMax * curva * corte * relacao * p.diferencial / rodaT;
    if (this.marcha === -1) fMotor = -Math.min(fMotor, 3500);
    // controle de tração: corta motor se a traseira patina (menos com o freio de mão puxado)
    const patT = Math.max(this.rodas[2].patina, this.rodas[3].patina);
    if (!c.freioDeMao && patT > 0.15) fMotor *= 1 - p.assistencia * 0.8 * Math.min(1, (patT - 0.15) * 4);

    // ---- cargas nos pneus (transferência de peso longitudinal e lateral)
    const fzF = m * G * p.b / L - m * this.ax * p.alturaCG / L;
    const fzR = m * G * p.a / L + m * this.ax * p.alturaCG / L;
    const dLat = m * this.ay * p.alturaCG / p.bitola;       // + = curva para a esquerda carrega as rodas da direita
    let fx = 0, fy = 0, torque = 0, maxDeriva = 0;
    for (const r of this.rodas) {
      const eixoCarga = (r.frente ? fzF : fzR) / 2;
      const fz = Math.max(50, eixoCarga + (r.esquerda ? -0.5 : 0.5) * dLat * (r.frente ? p.b / L : p.a / L) * 2);
      r.carga = fz;
      const px = (r.esquerda ? 1 : -1) * (r.frente ? p.bitola : p.bitola) / 2;
      const pz = r.frente ? p.a : -p.b;
      // velocidade do ponto de contato (carro): v + ω × r   (ω em torno de +Y)
      const wl = vLat + this.omega * pz;          // lateral (+X)   (ω × r, ω em +Y)
      const wf = vLong - this.omega * px;         // frente (+Z)
      const st = r.frente ? this.esterco : 0;
      const cs = Math.cos(st), sn = Math.sin(st);
      const vRodaF = wf * cs + wl * sn;           // ao longo da roda
      const vRodaL = -wf * sn + wl * cs;          // de lado
      // ângulo de deriva (com proteção para baixa velocidade)
      const alpha = Math.atan2(vRodaL, Math.max(Math.abs(vRodaF), 3.0));
      const [B, C, E] = r.frente ? p.pacFrente : p.pacTras;
      // chão embaixo da roda (estrada/grama/lama) e água
      const cx = this.pos.x + sinY * pz + cosY * px, cz = this.pos.z + cosY * pz - sinY * px;
      if (!r.contato) r.contato = new THREE.Vector3();
      r.contato.set(cx, 0, cz);
      const sup = this.superficie ? this.superficie(cx, cz) : null;
      r.tipo = sup ? sup.tipo : 'chao';
      const prof = this.profundidade && !this.noAr ? Math.max(0, this.profundidade(cx, cz)) : 0;
      r.agua = prof;
      let mu = (r.frente ? p.mu : p.mu * p.muTras) * (sup ? sup.mu : 1);
      mu *= 1 - 0.35 * Math.min(prof / 0.3, 1);       // pneu na água/lama de fundo escorrega mais
      let fLat = -mu * fz * pacejka(alpha, B, C, E);
      // força longitudinal
      let fLong = 0;
      if (!r.frente) fLong += fMotor / 2;
      const sentido = Math.abs(vRodaF) > 0.05 ? Math.sign(vRodaF) : 0;
      fLong -= sentido * freio * p.freioMax * (r.frente ? 0.6 : 0.4) / 2;
      if (c.freioDeMao && !r.frente) {
        fLong -= sentido * p.freioMao / 2;
        fLat *= p.gripFreioMao;
      }
      if (sentido === 0 && (freio > 0 || (c.freioDeMao && !r.frente))) fLong -= THREE.MathUtils.clamp(vRodaF * m, -2000, 2000);
      if (this.noAr) { fLong = 0; fLat = 0; }     // no ar os pneus não encostam em nada
      // círculo de atrito: força total não passa de μ·Fz (acelerar demais = traseira escorrega)
      const lim2 = mu * fz;
      const tot = Math.hypot(fLong, fLat);
      let patina = 0;
      if (tot > lim2) {
        patina = 1 - lim2 / tot;
        fLong *= lim2 / tot;
        fLat *= lim2 / tot;
      }
      // não deixa a força lateral inverter a velocidade dentro de um passo (estável parado/devagar)
      const fLatMax = Math.abs(vRodaL) * (m / 4) / dt;
      fLat = THREE.MathUtils.clamp(fLat, -fLatMax, fLatMax);
      // arrasto da água: ½·ρ·Cd·A·v² com A = parte da roda (e da carroceria) dentro d'água
      if (prof > 0.005) {
        const larg = r.frente ? 0.24 : 0.32;
        const area = prof * larg + Math.max(0, prof - p.vaoLivre) * 0.6;     // assoalho entrando na água
        const kA = 0.5 * 1000 * p.arrastoAgua * area;
        const dl = kA * vRodaF * Math.abs(vRodaF), dlat = kA * 1.5 * vRodaL * Math.abs(vRodaL);
        fLong -= THREE.MathUtils.clamp(dl, -Math.abs(vRodaF) * (m / 4) / dt, Math.abs(vRodaF) * (m / 4) / dt);
        fLat -= THREE.MathUtils.clamp(dlat, -Math.abs(vRodaL) * (m / 4) / dt, Math.abs(vRodaL) * (m / 4) / dt);
      }
      r.deriva = alpha;
      r.patina = patina;
      maxDeriva = Math.max(maxDeriva, Math.abs(alpha) * Math.min(vAbs / 6, 1), patina);
      // de volta para o referencial do carro
      const Fz_ = fLong * cs - fLat * sn;          // frente
      const Fx_ = fLong * sn + fLat * cs;          // esquerda
      fx += Fx_;
      fy += Fz_;
      torque += pz * Fx_ - px * Fz_;               // (r × F)·Y com r=(px,0,pz), F=(Fx_,0,Fz_)
      r.vRoda = vRodaF;
    }
    this.agua = (this.rodas[0].agua + this.rodas[1].agua + this.rodas[2].agua + this.rodas[3].agua) / 4;
    // estabilidade: só age quando a derrapagem passa de 'derivaLivre' (deixa fazer drift, evita rodar)
    if (p.assistencia > 0 && vAbs > 3 && !this.noAr) {
      const beta = Math.atan2(vLat, Math.abs(vLong)) * Math.sign(vLong || 1);
      const exc = Math.abs(beta) - p.derivaLivre * (c.freioDeMao ? 1.6 : 1);
      if (exc > 0) {
        torque += Math.sign(beta) * exc * p.assistencia * p.inercia * 25;
        torque -= this.omega * p.assistencia * p.inercia * 2.5 * Math.min(1, exc * 4);
      }
    }
    // resistências + rampa
    const arr = p.arrasto * vAbs;
    fy -= arr * vLong + p.rolamento * vLong;
    const parar = (p.resistencia * m * G + (acel < 0.05 && this.marcha !== 0 ? p.freioMotor : 0)) * Math.min(1, Math.abs(vLong) / 0.5);
    if (!this.noAr) fy -= Math.sign(vLong) * parar;
    fx -= arr * vLat;
    if (!this.noAr) fy -= m * G * this._inclinacao;
    else {
      // no ar: o giro vai morrendo e o volante só dá uma "torcidinha"
      this.omega *= Math.exp(-0.8 * dt);
      if (!c.estacionado) this.omega += THREE.MathUtils.clamp(c.volante ?? 0, -1, 1) * 0.9 * dt;
    }
    // integração (no mundo: a velocidade NÃO gira junto com o carro — é isso que deixa ele escorregar)
    const axL = fy / m, ayL = fx / m;
    this.vel.x += (sinY * fy + cosY * fx) / m * dt;
    this.vel.y += (cosY * fy - sinY * fx) / m * dt;
    this.omega += torque / p.inercia * dt;
    // parado de verdade (sem motor e sem embalo)
    if (acel < 0.01 && vAbs < 0.08 && (freio > 0 || c.freioDeMao)) {
      this.vel.set(0, 0); this.omega *= 0.5;
    }
    this.ax += (axL - this.ax) * Math.min(1, dt * 8);
    this.ay += (ayL - this.ay) * Math.min(1, dt * 8);
    this.rumo += this.omega * dt;
    vLong = this.vel.x * Math.sin(this.rumo) + this.vel.y * Math.cos(this.rumo);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.derrapagem = this.noAr ? 0 : THREE.MathUtils.clamp((maxDeriva - 0.12) * 3, 0, 1);
    this.velocidadeKmh = vLong * 3.6;
    // rampas/buracos: decola quando o chão "foge" mais rápido que a gravidade, pousa quando volta
    passoVertical(this, dt, (p.a + p.b) / 2);
    // rodas giram
    for (const r of this.rodas) r.giro += (r.vRoda ?? 0) / r.raio * dt * (r.patina > 0.3 && !r.frente && acel > 0.5 ? 1.6 : 1);
    if (c.freioDeMao) for (const r of this.rodas) if (!r.frente) r.giro -= (r.vRoda ?? 0) / r.raio * dt;
    // colisão (3 círculos ao longo do carro)
    if (this._colisaoMundo) this._colidir();
  }

  // Corpo sólido do carro para quem está FORA dele (cegonha a pé, urubus, balas...):
  // empurra a esfera (pos = centro, raio) para fora da carroceria. Retorna null ou { tipo: 'carro', normal }.
  resolverColisao(pos, raio = 0.4) {
    this.no.updateMatrixWorld(true);
    const inv = this._inv ?? (this._inv = new THREE.Matrix4());
    inv.copy(this.no.matrixWorld).invert();
    const l = pos.clone().applyMatrix4(inv);
    let contato = null;
    for (const [x0, x1, y0, y1, z0, z1] of this.caixas) {
      const cx = THREE.MathUtils.clamp(l.x, x0, x1), cy = THREE.MathUtils.clamp(l.y, y0, y1), cz = THREE.MathUtils.clamp(l.z, z0, z1);
      const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      let n = null, prof = 0;
      if (d2 > 1e-10) {
        if (d2 >= raio * raio) continue;
        const d = Math.sqrt(d2);
        n = new THREE.Vector3(dx / d, dy / d, dz / d); prof = raio - d;
      } else {                                   // centro dentro da caixa: sai pela face mais próxima
        // sai pelos lados (quem anda no chão não "sobe" no carro); por cima só se já estiver lá em cima
        const op = [[l.x - x0, -1, 0, 0], [x1 - l.x, 1, 0, 0], [l.z - z0, 0, 0, -1], [z1 - l.z, 0, 0, 1]];
        if (l.y > y1 - 0.1) op.push([y1 - l.y, 0, 1, 0]);
        op.sort((a, b) => a[0] - b[0]);
        n = new THREE.Vector3(op[0][1], op[0][2], op[0][3]); prof = op[0][0] + raio;
      }
      l.addScaledVector(n, prof);
      contato = { tipo: 'carro', normal: n.transformDirection(this.no.matrixWorld) };
    }
    if (contato) pos.copy(l.applyMatrix4(this.no.matrixWorld));
    return contato;
  }

  _colidir() {
    const p = this.p;
    const f = this.frente.clone();
    for (const off of [p.a * 0.75, 0, -p.b * 0.75]) {
      const centro = new THREE.Vector3(this.pos.x + f.x * off, this.pos.y + 0.6, this.pos.z + f.z * off);
      const antes = centro.clone();
      this._colisaoMundo(centro, p.colisaoRaio, { chao: false, sacudir: true });
      const dx = centro.x - antes.x, dz = centro.z - antes.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5) {
        this.pos.x += dx; this.pos.z += dz;
        const nx = dx / d, nz = dz / d;
        const vn = this.vel.x * nx + this.vel.y * nz;
        if (vn < 0) {
          this.vel.x -= 1.25 * vn * nx;          // tira a velocidade contra o obstáculo (+ quiquezinho)
          this.vel.y -= 1.25 * vn * nz;
          this.omega *= 0.6;
          this.batida = Math.max(this.batida ?? 0, -vn);   // força da batida (m/s), para som/dano
        }
      }
    }
  }

  _aplicarVisual(dt) {
    const p = this.p;
    const f = { x: Math.sin(this.rumo), z: Math.cos(this.rumo) };
    const l = { x: Math.cos(this.rumo), z: -Math.sin(this.rumo) };
    const meia = p.bitola / 2;
    const h = (fw, lw) => this.alturaChao(this.pos.x + f.x * fw + l.x * lw, this.pos.z + f.z * fw + l.z * lw);
    const hFE = h(p.a, meia), hFD = h(p.a, -meia), hTE = h(-p.b, meia), hTD = h(-p.b, -meia);
    const hF = (hFE + hFD) / 2, hT = (hTE + hTD) / 2, hE = (hFE + hTE) / 2, hD = (hFD + hTD) / 2;
    const L = p.a + p.b;
    const yAlvo = (hFE + hFD + hTE + hTD) / 4;
    this._inclinacao = (hF - hT) / L;                    // seno aproximado da rampa (+ = subindo)
    const pitchAlvo = -Math.atan2(hF - hT, L);
    const rollAlvo = Math.atan2(hE - hD, p.bitola);
    const S = this._susp;
    if (dt > 0 && this.noAr) {
      // voando: a altura é a da física; o bico acompanha a trajetória e a carroceria se endireita
      S.y.x = this.yAr; S.y.v = this.vy;
      molas(S.pitch, alvoArfagemNoAr(this), dt, 1.3, 0.8); molas(S.roll, 0, dt, 1.2, 0.8);
      molas(S.bodyP, 0, dt, 2.2, 0.55); molas(S.bodyR, 0, dt, 2.0, 0.5);
    } else if (dt > 0) {
      molas(S.y, yAlvo, dt, 5, 0.9); molas(S.pitch, pitchAlvo, dt, 4, 0.9); molas(S.roll, rollAlvo, dt, 4, 0.9);
      if (S.y.x < yAlvo - 0.25) { S.y.x = yAlvo - 0.25; S.y.v = Math.max(S.y.v, 0); }   // pouso: a suspensão bate no fim
      molas(S.bodyP, THREE.MathUtils.clamp(-this.ax * p.arfagemVisual, -0.08, 0.08), dt, 2.2, 0.55);
      molas(S.bodyR, THREE.MathUtils.clamp(this.ay * p.rolagemVisual, -0.10, 0.10), dt, 2.0, 0.5);
    } else {
      S.y.x = yAlvo; S.pitch.x = pitchAlvo; S.roll.x = rollAlvo;
    }
    this.pos.y = S.y.x;
    this.no.position.copy(this.pos);
    _e.set(S.pitch.x, this.rumo, S.roll.x, 'YXZ');
    this.no.quaternion.setFromEuler(_e);
    // carroceria: inclina na curva e na frenagem/arrancada, girando em torno do centro de massa
    if (this.carroceria) {
      _e.set(S.bodyP.x, 0, S.bodyR.x, 'YXZ');
      this.carroceria.quaternion.setFromEuler(_e);
      const piv = new THREE.Vector3(0, p.alturaCG, 0);
      this.carroceria.position.copy(this.carroceriaP0).add(piv).sub(piv.clone().applyQuaternion(this.carroceria.quaternion));
    }
    // rodas: esterço, giro e curso da suspensão (cada roda acompanha o chão)
    const resid = { DE: hFE - (yAlvo + (hF - hT) / 2 + (hE - hD) / 2), DD: hFD - (yAlvo + (hF - hT) / 2 - (hE - hD) / 2),
                    TE: hTE - (yAlvo - (hF - hT) / 2 + (hE - hD) / 2), TD: hTD - (yAlvo - (hF - hT) / 2 - (hE - hD) / 2) };
    for (const r of this.rodas) {
      r.obj.rotation.set(r.giro, r.frente ? this.esterco : 0, 0, 'YXZ');
      r.obj.position.copy(r.base);
      r.obj.position.y += this.noAr ? -0.13 : THREE.MathUtils.clamp(resid[r.nome.slice(5)], -0.15, 0.15);   // no ar a suspensão estica
    }
    if (this.volante) {
      const ang = this.direcao * THREE.MathUtils.degToRad(p.volanteMaxDeg);
      this.volante.quaternion.copy(this.volanteQ0).multiply(_q.setFromAxisAngle(EIXO_Z, ang));
    }
  }
}

// =====================================================================================
// cegonha motorista (com ou sem a AK)
// =====================================================================================
const BRACO_E = ['Braco_Mecanico_Esquerda', 'Antebraco_Mecanico_Esquerda'];
const BRACO_D = ['Braco_Mecanico_Direita', 'Antebraco_Mecanico_Direita'];
const CABECA = ['Pescoco_2', 'Cabeca'];

function filtrar(clip, manter, nome) {
  const tracks = clip.tracks.filter((t) => manter(t.name.split('.')[0]));
  return new THREE.AnimationClip(nome ?? clip.name, clip.duration, tracks);
}

export class MotoristaCegonha {
  // armada: true/false ou função () => bool. Padrão: segue a visibilidade do objeto "AK47" da cegonha
  // (se você esconde a arma quando ela está desarmada, ela entra e dirige sem a arma sozinha).
  constructor({ cegonha, mixer, clips, buggy, cena, alturaChao, armada, prefixo,
                clipParado = 'Cegonha_AK_Segurar', clipParadoSemArma = 'Cegonha_Parado', distanciaEntrar = 2.5 }) {
    this.cegonha = cegonha;
    this.mixer = mixer;
    this.buggy = buggy;
    this.cena = cena;
    this.alturaChao = alturaChao ?? buggy.alturaChao;
    this.distanciaEntrar = distanciaEntrar;
    this.estado = 'fora';                         // 'fora' | 'entrando' | 'dirigindo' | 'saindo'
    this.onEntrou = null; this.onSaiu = null;
    const ak = cegonha.getObjectByName('AK47');
    this._armadaFn = typeof armada === 'function' ? armada : armada === undefined ? () => (ak ? ak.visible : true) : () => armada;
    this.armada = this._armadaFn();
    const pre = prefixo ?? buggy.prefixoCegonha ?? 'Cegonha_Carro_';   // buggy.glb: Cegonha_Carro_ | buggystork: Cegonha_BuggyStork_
    const C = (n) => {
      const c = THREE.AnimationClip.findByName(clips, n);
      if (!c) throw new Error('[carro] falta o clip ' + n + ' na cegonha (use o .glb com as animações do carro)');
      return c;
    };
    const em = (lista) => (b) => lista.includes(b);
    const fora = (lista) => (b) => !lista.includes(b);
    const comArma = [...BRACO_E, ...CABECA], semArma = [...BRACO_E, ...BRACO_D, ...CABECA];
    this.clipParado = C(clipParado);
    this.clipParadoSemArma = C(clipParadoSemArma);
    const A = (clip) => mixer.clipAction(clip);
    this.a = {
      entrar: A(C(pre + 'Entrar')),
      sair: A(C(pre + 'Sair')),
      entrarSA: A(C(pre + 'Entrar_SemArma')),
      sairSA: A(C(pre + 'Sair_SemArma')),
      // COM ARMA — base: corpo + braço direito com a AK | volante: braço esquerdo + cabeça
      dirigir: A(filtrar(C(pre + 'Dirigindo'), fora(comArma), 'Carro_Base')),
      atirar: A(filtrar(C(pre + 'Dirigindo_Atirando'), fora(comArma), 'Carro_Base_Atirando')),
      volC: A(filtrar(C(pre + 'Dirigindo'), em(comArma), 'Carro_Volante_Centro')),
      volE: A(filtrar(C(pre + 'Volante_Esquerda'), em(comArma), 'Carro_Volante_E')),
      volD: A(filtrar(C(pre + 'Volante_Direita'), em(comArma), 'Carro_Volante_D')),
      // SEM ARMA — base: só o corpo | volante: os dois braços + cabeça
      dirigirSA: A(filtrar(C(pre + 'Dirigindo_SemArma'), fora(semArma), 'Carro_Base_SA')),
      volCSA: A(filtrar(C(pre + 'Dirigindo_SemArma'), em(semArma), 'Carro_Volante_Centro_SA')),
      volESA: A(filtrar(C(pre + 'Volante_Esquerda_SemArma'), em(semArma), 'Carro_Volante_E_SA')),
      volDSA: A(filtrar(C(pre + 'Volante_Direita_SemArma'), em(semArma), 'Carro_Volante_D_SA')),
    };
    for (const k of ['entrar', 'sair', 'entrarSA', 'sairSA']) {
      this.a[k].setLoop(THREE.LoopOnce, 1);
      this.a[k].clampWhenFinished = true;
    }
    this._tiro = 0;
    this._arma = this.armada ? 1 : 0;            // mistura suave quando pega/guarda a arma dirigindo
    // a troca de clips acontece no próximo update() (fora do mixer.update, que está no meio do laço)
    this._pendente = null;
    mixer.addEventListener('finished', (e) => {
      if ((e.action === this.a.entrar || e.action === this.a.entrarSA) && this.estado === 'entrando') this._pendente = 'dirigir';
      if ((e.action === this.a.sair || e.action === this.a.sairSA) && this.estado === 'saindo') this._pendente = 'saiu';
    });
  }

  get dirigindo() { return this.estado === 'dirigindo'; }

  // pegar/guardar a AK com ela dentro do carro (troca suave das poses)
  definirArma(armada) { this.armada = !!armada; }

  podeEntrar() {
    if (this.estado !== 'fora') return false;
    const p = this.buggy.pontoEntrada(new THREE.Vector3());
    const c = this.cegonha.getWorldPosition(new THREE.Vector3());
    return Math.hypot(p.x - c.x, p.z - c.z) < this.distanciaEntrar && Math.abs(this.buggy.velocidade) < 1.5;
  }

  podeSair() { return this.estado === 'dirigindo' && Math.abs(this.buggy.velocidade) < 1.5; }

  entrar(armada = this._armadaFn()) {
    if (!this.podeEntrar()) return false;
    this.armada = !!armada;
    this._arma = this.armada ? 1 : 0;
    this.estado = 'entrando';
    this.buggy.ocupado = true;
    // a cegonha vira "filha" do banco: o próprio clip começa com ela em pé no ponto de entrada
    const escala = this.cegonha.getWorldScale(new THREE.Vector3()).x / this.buggy.assento.getWorldScale(new THREE.Vector3()).x;
    this.buggy.assento.add(this.cegonha);
    this.cegonha.position.set(0, 0, 0);
    this.cegonha.quaternion.identity();
    this.cegonha.scale.setScalar(escala);
    this.mixer.stopAllAction();
    (this.armada ? this.a.entrar : this.a.entrarSA).reset().play();
    this.mixer.update(0);
    return true;
  }

  sair() {
    if (!this.podeSair()) return false;
    this.estado = 'saindo';
    this._saiuArmada = this.armada;
    this.mixer.stopAllAction();
    (this.armada ? this.a.sair : this.a.sairSA).reset().play();
    this.mixer.update(0);
    return true;
  }

  _comecarDirigir() {
    this.estado = 'dirigindo';
    this.mixer.stopAllAction();
    for (const k of ['dirigir', 'atirar', 'volC', 'volE', 'volD', 'dirigirSA', 'volCSA', 'volESA', 'volDSA']) this.a[k].reset().play();
    this._pesos();
    this.mixer.update(0);
    this.onEntrou?.();
  }

  _terminouSair() {
    // fim do clip: a Raiz está no ponto de entrada. Solta a cegonha no mundo exatamente ali.
    const p = this.buggy.pontoEntrada(new THREE.Vector3());
    const escala = this.cegonha.getWorldScale(new THREE.Vector3()).x;
    this.cena.add(this.cegonha);
    this.cegonha.position.set(p.x, this.alturaChao ? this.alturaChao(p.x, p.z) : p.y, p.z);
    this.cegonha.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.buggy.rumo);
    this.cegonha.scale.setScalar(escala);
    this.mixer.stopAllAction();
    this.mixer.clipAction(this._saiuArmada ? this.clipParado : this.clipParadoSemArma).reset().play();
    this.mixer.update(0);
    this.estado = 'fora';
    this.buggy.ocupado = false;
    this.onSaiu?.();
  }

  _pesos() {
    const s = THREE.MathUtils.clamp(this.buggy.direcao, -1, 1);
    const A = this._arma, c = 1 - Math.abs(s), e = Math.max(0, s), d = Math.max(0, -s);
    const w = (k, v) => this.a[k].setEffectiveWeight(v);
    w('dirigir', A * (1 - this._tiro)); w('atirar', A * this._tiro); w('dirigirSA', 1 - A);
    w('volC', A * c); w('volE', A * e); w('volD', A * d);
    w('volCSA', (1 - A) * c); w('volESA', (1 - A) * e); w('volDSA', (1 - A) * d);
  }

  // chame ANTES do mixer.update(dt). atirando só tem efeito com a arma.
  update(dt, { atirando = false } = {}) {
    const pend = this._pendente;
    this._pendente = null;
    if (pend === 'dirigir') this._comecarDirigir();
    else if (pend === 'saiu') this._terminouSair();
    if (this.estado !== 'dirigindo') return;
    this._arma += THREE.MathUtils.clamp((this.armada ? 1 : 0) - this._arma, -dt * 3, dt * 3);
    const alvo = atirando && this.armada ? 1 : 0;
    this._tiro += THREE.MathUtils.clamp(alvo - this._tiro, -dt * 8, dt * 8);
    this._pesos();
  }
}
