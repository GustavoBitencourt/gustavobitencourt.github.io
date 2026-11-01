// som_carro.js — sons do BUGGY e da MOTO no three.js (Web Audio): motor que acompanha a rotação e as marchas,
// pneus na terra/grama (rodando e freando), água (rodando, arrastando, entrando, freio forçado), batidas
// e — só na moto — a QUEDA: a pancada no chão e a moto escorregando deitada na terra, na grama ou na água.
//
//   import { SomBuggy } from './som_carro.js';
//   const listener = new THREE.AudioListener();  camera.add(listener);
//   const som = new SomBuggy(buggy, listener, { pasta: 'sons/' });            // sons do buggy
//   const somMoto = new SomBuggy(moto, listener, { pasta: 'sons_moto/' });    // sons da moto (mesmos nomes)
//   await Promise.all([som.carregar(), somMoto.carregar()]);
//   addEventListener('keydown', () => som.desbloquear(), { once: true });   // navegador só toca som depois de um clique/tecla
//
//   motorista.onEntrou = () => som.ligar();      // partida + motor
//   motorista.onSaiu   = () => som.desligar();
//
//   // no loop, DEPOIS do buggy.update / moto.update (passe os MESMOS controles; null se ninguém dirige):
//   som.update(dt, controles);
//
// Tudo é lido do veículo (carro.js / moto.js): rpm, marcha, rodas (piso, água, patinação, deriva), batidas e,
// na moto, caida/tombo (queda). As duas pastas têm os mesmos nomes de arquivo; a da moto tem a mais
// queda_terra/grama/agua e raspando_terra/grama/agua (listados no sons.json dela).
// Como funciona o motor: 8 rotações gravadas, cada uma "acelerando" e "sem acelerar". O código toca todas
// em loop, ajusta a velocidade de cada uma para a rotação atual e mistura as duas mais próximas — por isso
// o som sobe/desce contínuo e "cai" de rotação na troca de marcha (vem da física).

import * as THREE from 'three';

const LOOPS_PISO = ['terra_rodando', 'terra_freada', 'grama_rodando', 'grama_freada', 'agua_rodando', 'agua_arrasto'];
const AVULSOS = ['partida', 'troca_marcha', 'estouro', 'batida', 'agua_entrada', 'agua_freio'];
const PISOS_QUEDA = ['terra', 'grama', 'agua'];

export class SomBuggy {
  constructor(buggy, listener, opcoes = {}) {
    this.buggy = buggy;
    this.listener = listener;
    this.ctx = listener.context;
    this.pasta = opcoes.pasta ?? 'sons/';
    this.volume = opcoes.volume ?? 1;
    this.volMotor = opcoes.volumeMotor ?? 1;
    this.volPiso = opcoes.volumePiso ?? 1;
    this.volAgua = opcoes.volumeAgua ?? 1;
    this.chaveMotor = opcoes.motor ?? 'motor';            // lista de loops do motor no sons.json
    // saída 3D presa no carro (som mais baixo e "do lado certo" quando a câmera está longe)
    if (opcoes.posicional === false) {
      this.saida = new THREE.Audio(listener);
    } else {
      this.saida = new THREE.PositionalAudio(listener);
      this.saida.setRefDistance(opcoes.distanciaRef ?? 7);
      this.saida.setRolloffFactor(opcoes.rolloff ?? 1);
      this.saida.setDistanceModel('inverse');
    }
    this.bus = this.ctx.createGain();
    this.bus.gain.value = this.volume;
    this.saida.setNodeSource(this.bus);
    (buggy.no ?? buggy.raiz).add(this.saida);
    this.buffers = {};
    this.ligado = false;
    this._rpm = 900; this._carga = 0; this._cargaPico = 0;
    this._marcha = buggy.marcha;
    this._tTroca = 0; this._tAguaFreio = 0; this._tEntrada = 0; this._tEstouro = 0;
    this._aguaAnt = 0;
  }

  async carregar() {
    const loader = new THREE.AudioLoader();
    const info = await (await fetch(this.pasta + 'sons.json')).json();
    this.pontos = info[this.chaveMotor] ?? info.motor;   // [{ rpm, carga: arquivo, solto: arquivo }]
    const nomes = new Set([...LOOPS_PISO.map((n) => n + '.wav'), ...AVULSOS.map((n) => n + '.wav')]);
    for (const p of this.pontos) { nomes.add(p.carga); nomes.add(p.solto); }
    // queda (só a moto): { terra: 'queda_terra.wav', ... } e { terra: 'raspando_terra.wav', ... }
    this.arqQueda = info.queda ?? null;
    this.arqRaspando = info.raspando ?? null;
    for (const t of [this.arqQueda, this.arqRaspando]) if (t) for (const k of PISOS_QUEDA) if (t[k]) nomes.add(t[k]);
    await Promise.all([...nomes].map(async (n) => { this.buffers[n] = await loader.loadAsync(this.pasta + n); }));
    this._montar();
    return this;
  }

  desbloquear() { if (this.ctx.state !== 'running') this.ctx.resume(); }

  _loop(buffer, destino) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(g).connect(destino);
    src.start(0, Math.random() * buffer.duration);       // fases diferentes: nada de "eco" entre loops
    return { src, g };
  }

  _montar() {
    const ctx = this.ctx;
    // ---- motor: loops -> filtro (abre acelerando) -> volume do motor
    this.motorFiltro = ctx.createBiquadFilter();
    this.motorFiltro.type = 'lowpass';
    this.motorFiltro.frequency.value = 2500;
    this.motorFiltro.Q.value = 0.5;
    this.motorGanho = ctx.createGain();
    this.motorGanho.gain.value = 0;
    this.motorFiltro.connect(this.motorGanho).connect(this.bus);
    this.motor = this.pontos.map((p) => ({
      rpm: p.rpm,
      carga: this._loop(this.buffers[p.carga], this.motorFiltro),
      solto: this._loop(this.buffers[p.solto], this.motorFiltro),
    }));
    // ---- piso e água
    this.piso = {};
    for (const n of LOOPS_PISO) this.piso[n] = this._loop(this.buffers[n + '.wav'], this.bus);
    // moto deitada escorregando: um loop por piso
    this.raspando = null;
    if (this.arqRaspando) {
      this.raspando = {};
      for (const k of PISOS_QUEDA) if (this.arqRaspando[k]) this.raspando[k] = this._loop(this.buffers[this.arqRaspando[k]], this.bus);
    }
  }

  _nome(n) { return n; }

  _tocar(nome, ganho = 1, taxa = 1) {
    const arq = nome.endsWith('.wav') ? nome : nome + '.wav';
    if (!this.buffers[arq] || ganho <= 0.01) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[arq];
    src.playbackRate.value = taxa;
    const g = this.ctx.createGain();
    g.gain.value = ganho;
    src.connect(g).connect(this.bus);
    src.start();
  }

  _alvo(param, v, tempo = 0.04) { param.setTargetAtTime(v, this.ctx.currentTime, tempo); }

  ligar() {
    if (this.ligado || !this.motor) return;
    this.ligado = true;
    this._tocar(this._nome('partida'), 0.9 * this.volMotor);
    // o motor "entra" quando a partida pega (≈1 s)
    this.motorGanho.gain.cancelScheduledValues(this.ctx.currentTime);
    this.motorGanho.gain.setValueAtTime(0, this.ctx.currentTime);
    this.motorGanho.gain.setTargetAtTime(this.volMotor, this.ctx.currentTime + 1.2, 0.25);
    this._rpm = 900;
  }

  desligar() {
    if (!this.ligado || !this.motor) return;
    this.ligado = false;
    this.motorGanho.gain.cancelScheduledValues(this.ctx.currentTime);
    this.motorGanho.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
  }

  definirVolume(v) { this.volume = v; this._alvo(this.bus.gain, v, 0.05); }

  update(dt, controles = null) {
    if (!this.motor || dt <= 0) return;
    const b = this.buggy, p = b.p;
    const c = controles ?? {};
    const vCarro = Math.abs(b.velocidade);
    const agora = this.ctx.currentTime;

    // ================= motor =================
    let acel = c.acelerar ?? 0;
    if (b.marcha === -1) acel = c.frear ?? 0;            // na ré o "frear" acelera para trás
    // troca de marcha: embreagem (tira a carga um instante) + "clunk"
    if (b.marcha !== this._marcha) {
      if (this.ligado && b.marcha > 0 && this._marcha > 0 && vCarro > 2) {
        this._tTroca = 0.16;
        this._tocar(this._nome('troca_marcha'), 0.5 * this.volMotor, 0.9 + Math.random() * 0.2);
      }
      this._marcha = b.marcha;
    }
    this._tTroca = Math.max(0, this._tTroca - dt);
    // rotação do som: a da física + "patinando a embreagem" na arrancada + roda girando em falso
    const traseiras = b.rodas.filter((w) => !w.frente);
    const patinaT = Math.max(0, ...traseiras.map((w) => w.patina ?? 0));
    const arrancada = acel * Math.max(0, 1 - vCarro / 7) * 2300;
    let rpmAlvo = Math.max(b.rpm, p.rpmMarchaLenta + arrancada * (p.rpmMax / 6200)) + patinaT * acel * 1600;
    if (!this.ligado) rpmAlvo = p.rpmMarchaLenta;
    rpmAlvo = Math.min(rpmAlvo, p.rpmMax + 100);
    this._rpm += (rpmAlvo - this._rpm) * Math.min(1, dt * (rpmAlvo < this._rpm ? 14 : 9));
    // carga (acelerador) suavizada; zera durante a troca; corte de giro pulsando no limite
    let cargaAlvo = this._tTroca > 0 ? 0 : acel;
    if (this._rpm > p.rpmMax - 120 && acel > 0.5) cargaAlvo *= (Math.sin(agora * 2 * Math.PI * 11) > 0 ? 1 : 0.15);
    this._carga += (cargaAlvo - this._carga) * Math.min(1, dt * 12);
    // estouros no escapamento ao tirar o pé de repente em rotação alta
    this._tEstouro -= dt;
    this._cargaPico = Math.max(cargaAlvo, (this._cargaPico ?? 0) - dt * 2.5);
    if (this.ligado && this._cargaPico > 0.6 && acel < 0.1 && this._tTroca <= 0 && this._rpm > 0.6 * p.rpmMax && this._tEstouro <= 0) {
      if (Math.random() < 0.6) this._tocar(this._nome('estouro'), 0.55 * this.volMotor, 0.85 + Math.random() * 0.3);
      this._tEstouro = 1.5;
      this._cargaPico = 0;
    }
    // mistura dos loops
    const r = this._rpm, M = this.motor;
    let i = 0;
    while (i < M.length - 2 && r > M[i + 1].rpm) i++;
    const x = THREE.MathUtils.clamp((r - M[i].rpm) / (M[i + 1].rpm - M[i].rpm), 0, 1);
    const kc = Math.sqrt(this._carga), ks = Math.sqrt(1 - this._carga);
    for (let k = 0; k < M.length; k++) {
      let w = 0;
      if (k === i) w = Math.cos(x * Math.PI / 2);
      else if (k === i + 1) w = Math.sin(x * Math.PI / 2);
      const taxa = r / M[k].rpm;
      for (const [lado, kk] of [['carga', kc], ['solto', ks]]) {
        const s = M[k][lado];
        if (w > 0 || s.g.gain.value > 0.001) {
          this._alvo(s.src.playbackRate, taxa, 0.02);
          this._alvo(s.g.gain, w * kk, 0.03);
        }
      }
    }
    this._alvo(this.motorFiltro.frequency, 1400 + 5200 * this._carga + 0.5 * r, 0.05);

    // ================= pneus (terra / grama / lama) e água =================
    let rolaT = 0, rolaG = 0, freiaT = 0, freiaG = 0, aguaRoda = 0, aguaArr = 0, prof = 0;
    const freando = (c.frear ?? 0) > 0.3 && b.marcha !== -1 && b.velocidade > 0.3;
    const nR = b.rodas.length, kR = 4 / nR;          // buggy: 4 rodas | moto: 2 (cada uma "vale" o dobro)
    for (const w of b.rodas) {
      const v = Math.abs(w.vRoda ?? 0);
      const fv = Math.min(1, v / 16);
      const a = w.agua ?? 0;
      prof += a / nR;
      // derrapagem/travada desta roda (0..1)
      let s = Math.max((w.patina ?? 0) * 1.5 - 0.1, (Math.abs(w.deriva ?? 0) - 0.16) * 3.2);
      if (freando && v > 1) s = Math.max(s, (c.frear ?? 0) * 0.55);
      if (c.freioDeMao && !w.frente && v > 0.8) s = Math.max(s, 0.9);
      s = THREE.MathUtils.clamp(s, 0, 1) * Math.min(1, v / 3);
      if (b.caida) continue;                          // moto deitada: o barulho é o "raspando" (abaixo)
      if (a > 0.02) {
        aguaRoda += Math.min(1, a / 0.12) * Math.min(1, v / 5) / 4 * kR;
        aguaArr += Math.min(1, a / 0.2) * Math.min(1, (v / 7) ** 2) / 4 * kR;
        continue;
      }
      if (w.tipo === 'grama') { rolaG += fv / 4 * kR; freiaG += s / 4 * kR; }
      else if (w.tipo === 'lama') { rolaT += fv * 0.6 / 4 * kR; freiaG += s / 4 * kR; aguaRoda += fv * 0.15 / 4 * kR; }
      else { rolaT += fv / 4 * kR; freiaT += s / 4 * kR; }
    }
    const P = this.piso, vp = this.volPiso, va = this.volAgua;
    const taxaRola = 0.75 + 0.5 * Math.min(1, vCarro / 20);
    this._alvo(P.terra_rodando.g.gain, 0.9 * Math.sqrt(rolaT) * vp, 0.08);
    this._alvo(P.terra_rodando.src.playbackRate, taxaRola, 0.1);
    this._alvo(P.grama_rodando.g.gain, 0.9 * Math.sqrt(rolaG) * vp, 0.08);
    this._alvo(P.grama_rodando.src.playbackRate, taxaRola, 0.1);
    this._alvo(P.terra_freada.g.gain, 1.2 * Math.min(1, freiaT * 1.6) * vp, 0.05);
    this._alvo(P.terra_freada.src.playbackRate, 0.85 + 0.3 * Math.min(1, vCarro / 15), 0.1);
    this._alvo(P.grama_freada.g.gain, 1.1 * Math.min(1, freiaG * 1.6) * vp, 0.05);
    this._alvo(P.grama_freada.src.playbackRate, 0.85 + 0.3 * Math.min(1, vCarro / 15), 0.1);
    // água: rodando (respingos) e arrasto (a água segurando o carro); mais forte freando
    const freioAgua = (freando || c.freioDeMao) && prof > 0.03 ? 1.6 : 1;
    this._alvo(P.agua_rodando.g.gain, 1.1 * Math.min(1, aguaRoda * 1.5) * va, 0.06);
    this._alvo(P.agua_rodando.src.playbackRate, 0.85 + 0.35 * Math.min(1, vCarro / 10), 0.1);
    this._alvo(P.agua_arrasto.g.gain, Math.min(1.3, aguaArr * 1.8 * freioAgua) * va, 0.08);
    // entrou na água com velocidade: "splash"
    this._tEntrada -= dt; this._tAguaFreio -= dt;
    if (prof > 0.03 && this._aguaAnt <= 0.01 && vCarro > 2 && this._tEntrada <= 0) {
      this._tocar('agua_entrada', Math.min(1, vCarro / 9) * va, 0.9 + Math.random() * 0.2);
      this._tEntrada = 1.2;
    }
    this._aguaAnt = prof;
    // freio forçado na água: a frente "ara" a água
    if (prof > 0.05 && (freando || c.freioDeMao) && vCarro > 2.5 && this._tAguaFreio <= 0) {
      this._tocar('agua_freio', Math.min(1, vCarro / 8) * va, 0.9 + Math.random() * 0.15);
      this._tAguaFreio = 1.6;
    }
    // ================= queda da moto =================
    if (b.caida !== undefined) {
      // piso embaixo da moto deitada: terra / grama / água (lama = terra molhada com um pouco de água)
      const w = b.rodas[b.rodas.length - 1];
      const fundo = Math.max(...b.rodas.map((r) => r.agua ?? 0));
      const kAgua = THREE.MathUtils.clamp((fundo - 0.03) / 0.12, 0, 1);
      const pesos = { terra: 0, grama: 0, agua: kAgua };
      const seco = 1 - kAgua;
      if (w.tipo === 'grama') pesos.grama = seco;
      else if (w.tipo === 'lama') { pesos.terra = 0.65 * seco; pesos.agua = Math.max(kAgua, 0.35 * seco); }
      else pesos.terra = seco;
      // pancada no chão (a moto.js marca "tombo" quando a moto encosta no chão; 0..1)
      if (b.tombo > 0 && this.arqQueda) {
        let maior = 'terra';
        for (const k of PISOS_QUEDA) if (pesos[k] > pesos[maior]) maior = k;
        this._tocar(this.arqQueda[maior], (0.45 + 0.55 * b.tombo) * this.volPiso, 0.92 + Math.random() * 0.14);
        if (maior !== 'agua' && pesos.agua > 0.25) this._tocar(this.arqQueda.agua, 0.6 * pesos.agua * this.volAgua, 1.0);
        b.tombo = 0;
      }
      // escorregando deitada: volume e "velocidade" do loop seguem a velocidade da moto
      if (this.raspando) {
        const vEsc = b.caida && !b._levantar ? Math.hypot(b.vel.x, b.vel.y) : 0;
        const kv = Math.min(1, vEsc / 9) ** 0.7 * Math.min(1, vEsc / 0.4);
        for (const k of PISOS_QUEDA) {
          const L = this.raspando[k];
          if (!L) continue;
          this._alvo(L.g.gain, 1.1 * kv * pesos[k] * (k === 'agua' ? this.volAgua : this.volPiso), 0.07);
          this._alvo(L.src.playbackRate, 0.75 + 0.4 * Math.min(1, vEsc / 10), 0.1);
        }
      }
      if (b.caida && this.ligado) this.desligar();     // o motor morre na queda
    }
    // batidas (o carro.js guarda a força da última batida em buggy.batida)
    if (b.batida) {
      if (b.batida > 1.2) this._tocar('batida', Math.min(1, b.batida / 7), 0.85 + Math.random() * 0.3);
      b.batida = 0;
    }
  }
}
