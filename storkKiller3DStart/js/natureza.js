import * as THREE from 'three';

/* ═══════════════════════════════════════
   AMBIENTE DE NATUREZA (tela inicial)
   Gerado por código (Web Audio), sem arquivo de som:
   • vento nas folhas: ruído filtrado que sobe e desce em rajadas lentas
   • pássaros: cantos curtos em horários aleatórios (3 tipos), cada um de um lado
   • insetos: cricrilar agudo e bem baixo ao fundo
   Usa o mesmo AudioContext do three.js (o do som do buggy).
═══════════════════════════════════════ */
const VOLUME = 0.08;          // volume geral (bem baixinho)
const FADE = 1.5;             // s para entrar/sair
const PASSARO_MIN = 1.5;      // s entre cantos
const PASSARO_MAX = 6;

const rand = (a, b) => a + Math.random() * (b - a);

// Ruído rosa em loop (base do vento e da chuva), com a emenda do loop sem estalo
function bufferRuidoRosa(ctx, segundos) {
  const n = Math.floor(ctx.sampleRate * segundos);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029591;
    b1 = 0.985 * b1 + w * 0.032534;
    b2 = 0.950 * b2 + w * 0.048056;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
  }
  // emenda sem estalo: cruza o fim com o começo
  const cruz = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < cruz; i++) {
    const t = i / cruz;
    d[n - cruz + i] = d[n - cruz + i] * (1 - t) + d[i] * t;
  }
  return buf;
}

export function criarAmbienteNatureza() {
  const ctx = THREE.AudioContext.getContext();
  const mestre = ctx.createGain();
  mestre.gain.value = 0;
  mestre.connect(ctx.destination);

  let tocando = false;
  let mudo = false;
  let montado = false;
  let timerPassaro = null;
  const fontes = [];

  const bufferRuido = (segundos) => bufferRuidoRosa(ctx, segundos);

  function lfo(freq, profundidade, destino) {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = profundidade;
    o.connect(g).connect(destino);
    o.start();
    fontes.push(o);
  }

  function montar() {
    if (montado) return;
    montado = true;

    // ---- vento nas folhas
    const ruido = ctx.createBufferSource();
    ruido.buffer = bufferRuido(6);
    ruido.loop = true;
    const banda = ctx.createBiquadFilter();
    banda.type = 'bandpass';
    banda.frequency.value = 900;
    banda.Q.value = 0.6;
    const vento = ctx.createGain();
    vento.gain.value = 0.55;
    ruido.connect(banda).connect(vento).connect(mestre);
    ruido.start();
    fontes.push(ruido);
    // rajadas: volume e "brilho" das folhas variando devagar
    lfo(0.07, 0.25, vento.gain);
    lfo(0.11, 0.15, vento.gain);
    lfo(0.05, 400, banda.frequency);

    // ---- insetos: tom agudo pulsando (cri-cri), bem baixo
    const grilo = ctx.createOscillator();
    grilo.type = 'sine';
    grilo.frequency.value = 4400;
    // ganho = base ± pulso (onda quadrada): alterna entre 0 e 0,012 → cri-cri-cri
    const griloG = ctx.createGain();
    griloG.gain.value = 0.006;
    const pulso = ctx.createOscillator();
    pulso.type = 'square';
    pulso.frequency.value = 14;              // pulsos por segundo
    const pulsoG = ctx.createGain();
    pulsoG.gain.value = 0.006;
    pulso.connect(pulsoG).connect(griloG.gain);
    const griloSaida = ctx.createGain();
    griloSaida.gain.value = 0.6;
    lfo(0.09, 0.4, griloSaida.gain);         // vai e volta, como vários grilos longe
    grilo.connect(griloG).connect(griloSaida).connect(mestre);
    grilo.start();
    pulso.start();
    fontes.push(grilo, pulso);
  }

  // Um canto curto: tom com envelope e varredura de frequência, num lado do estéreo
  function nota(t0, f0, f1, dur, vol, pan, trinado = 0) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (trinado) {
      const m = ctx.createOscillator();
      m.frequency.value = trinado;
      const mg = ctx.createGain();
      mg.gain.value = f0 * 0.08;
      m.connect(mg).connect(o.frequency);
      m.start(t0);
      m.stop(t0 + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(mestre);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function cantar() {
    if (!tocando || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.05;
    const pan = rand(-0.9, 0.9);
    const vol = rand(0.05, 0.12);          // uns perto, outros longe
    const tipo = Math.random();
    if (tipo < 0.4) {
      // assobio: duas notas subindo e descendo
      const f = rand(2200, 3200);
      nota(t, f, f * 1.25, 0.18, vol, pan);
      nota(t + 0.24, f * 1.2, f * 0.85, 0.22, vol * 0.9, pan);
    } else if (tipo < 0.75) {
      // sequência rápida de pios
      const f = rand(3000, 4200);
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) nota(t + i * 0.11, f, f * 0.7, 0.07, vol * 0.8, pan);
    } else {
      // trinado
      const f = rand(2600, 3600);
      nota(t, f, f * 1.1, 0.6, vol * 0.7, pan, rand(22, 34));
    }
  }

  function agendarPassaro() {
    clearTimeout(timerPassaro);
    if (!tocando) return;
    timerPassaro = setTimeout(() => {
      cantar();
      agendarPassaro();
    }, rand(PASSARO_MIN, PASSARO_MAX) * 1000);
  }

  function aplicarVolume() {
    const alvo = tocando && !mudo ? VOLUME : 0;
    mestre.gain.cancelScheduledValues(ctx.currentTime);
    mestre.gain.setTargetAtTime(alvo, ctx.currentTime, FADE / 3);
  }

  return {
    /** Começa (ou volta) a tocar, com fade in. */
    tocar() {
      tocando = true;
      if (ctx.state === 'running') montar();
      aplicarVolume();
      agendarPassaro();
    },
    /** Para com fade out (os pássaros param de cantar). */
    parar() {
      tocando = false;
      clearTimeout(timerPassaro);
      aplicarVolume();
    },
    /** Chame num clique/tecla: o navegador só libera áudio depois de uma interação. */
    desbloquear() {
      if (ctx.state !== 'running') ctx.resume().then(() => { if (tocando) { montar(); aplicarVolume(); } });
      else if (tocando) montar();
    },
    alternarMudo() {
      mudo = !mudo;
      aplicarVolume();
      return mudo;
    },
    get mudo() { return mudo; },
  };
}

/* ═══════════════════════════════════════
   CHUVA (fase 2, pântano)
   Também gerada por código:
   • chiado: ruído agudo contínuo, com rajadas lentas (vento empurrando a chuva)
   • fundo: ruído grave abafado (chuva forte caindo ao longe)
   • gotas: estalinhos curtos nas folhas e na água, cada um num lado e num volume
═══════════════════════════════════════ */
const CHUVA = {
  VOLUME: 0.16,           // volume geral (um "barulhinho", abaixo dos tiros e do trovão)
  FADE: 2,                // s para entrar/sair
  GOTAS_POR_SEG: 22,      // estalinhos de gota por segundo (em média)
};

export function criarSomChuva() {
  const ctx = THREE.AudioContext.getContext();
  const mestre = ctx.createGain();
  mestre.gain.value = 0;
  mestre.connect(ctx.destination);

  let tocando = false;
  let montado = false;
  let timerGotas = null;
  let proximaGota = 0;

  function lfo(freq, profundidade, destino) {
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = profundidade;
    o.connect(g).connect(destino);
    o.start();
  }

  function montar() {
    if (montado) return;
    montado = true;
    const ruido = bufferRuidoRosa(ctx, 7);

    // ---- chiado: a chuva batendo em tudo (agudo)
    const chiadoSrc = ctx.createBufferSource();
    chiadoSrc.buffer = ruido;
    chiadoSrc.loop = true;
    const passaAlta = ctx.createBiquadFilter();
    passaAlta.type = 'highpass';
    passaAlta.frequency.value = 1100;
    const passaBaixa = ctx.createBiquadFilter();
    passaBaixa.type = 'lowpass';
    passaBaixa.frequency.value = 8500;
    const chiado = ctx.createGain();
    chiado.gain.value = 0.9;
    chiadoSrc.connect(passaAlta).connect(passaBaixa).connect(chiado).connect(mestre);
    chiadoSrc.start(0, Math.random() * ruido.duration);
    lfo(0.06, 0.18, chiado.gain);              // rajadas lentas
    lfo(0.13, 0.08, chiado.gain);

    // ---- fundo grave: chuva forte ao longe
    const fundoSrc = ctx.createBufferSource();
    fundoSrc.buffer = ruido;
    fundoSrc.loop = true;
    const abafa = ctx.createBiquadFilter();
    abafa.type = 'lowpass';
    abafa.frequency.value = 500;
    const fundo = ctx.createGain();
    fundo.gain.value = 0.7;
    fundoSrc.connect(abafa).connect(fundo).connect(mestre);
    fundoSrc.start(0, Math.random() * ruido.duration);
    lfo(0.05, 0.15, fundo.gain);
  }

  // Uma gota: estalinho de ruído bem curto, filtrado numa frequência aleatória
  const ruidoGota = (() => {
    const n = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
    return buf;
  })();
  function gota(t) {
    const src = ctx.createBufferSource();
    src.buffer = ruidoGota;
    src.playbackRate.value = rand(0.6, 1.4);
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = rand(1800, 6500);   // folha (agudo) ou poça (mais grave)
    filtro.Q.value = rand(2, 6);
    const g = ctx.createGain();
    g.gain.value = rand(0.15, 0.9) ** 2;           // a maioria fraquinha, algumas mais perto
    const p = ctx.createStereoPanner();
    p.pan.value = rand(-1, 1);
    src.connect(filtro).connect(g).connect(p).connect(mestre);
    src.start(t);
  }

  // Agenda as gotas um pouco à frente do relógio do áudio (não depende do setTimeout ser exato)
  function agendarGotas() {
    if (!tocando || ctx.state !== 'running') return;
    const agora = ctx.currentTime;
    if (proximaGota < agora) proximaGota = agora;
    while (proximaGota < agora + 0.2) {
      gota(proximaGota);
      proximaGota += -Math.log(1 - Math.random()) / CHUVA.GOTAS_POR_SEG;   // intervalos aleatórios (Poisson)
    }
  }

  function aplicarVolume() {
    mestre.gain.cancelScheduledValues(ctx.currentTime);
    mestre.gain.setTargetAtTime(tocando ? CHUVA.VOLUME : 0, ctx.currentTime, CHUVA.FADE / 3);
  }

  return {
    /** Começa a chover (fade in). Sem áudio liberado ainda, começa assim que o navegador liberar. */
    tocar() {
      if (tocando) return;
      tocando = true;
      if (ctx.state === 'running') montar();
      else ctx.resume().then(() => { if (tocando) { montar(); aplicarVolume(); } }).catch(() => {});
      aplicarVolume();
      clearInterval(timerGotas);
      timerGotas = setInterval(() => {
        if (ctx.state === 'running') montar();
        agendarGotas();
      }, 100);
    },
    /** Para a chuva (fade out). */
    parar() {
      if (!tocando) return;
      tocando = false;
      clearInterval(timerGotas);
      aplicarVolume();
    },
  };
}
