/*
  Som ambiente sintetizado na hora (Web Audio, sem arquivos). Cada região tem uma "cama"
  contínua e eventos soltos sorteados, então nunca repete igual:
    mata    – vento nas folhas, insetos, pássaros, grilos e um bicho grande ao longe às vezes
    rio     – água correndo e borbulhando (volume pela distância até a água)
    estrada – vento no campo, grilos, quero-quero e um boi ao longe
    cidade  – zumbido do trânsito, carro passando, buzina, cachorro e pardais
  O jogo chama update(dt, { mata, rio, estrada, cidade }) com pesos de 0 a 1.
*/

const LEVEL = 0.18;   // volume geral do ambiente (baixo, para ficar de fundo sob os passos e golpes)

export function createAmbience() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return { unlock() {}, update() {}, setActive() {}, dispose() {} };
  const ctx = new Ctx();
  const master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
  const meterBuf = new Float32Array(meter.fftSize);
  let active = true, unlocked = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gainNode = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const panNode = (p) => { if (!ctx.createStereoPanner) return gainNode(1); const s = ctx.createStereoPanner(); s.pan.value = p; return s; };

  // ruídos base (6 s, estéreo): branco e marrom
  const N = ctx.sampleRate * 6;
  const white = ctx.createBuffer(2, N, ctx.sampleRate), brown = ctx.createBuffer(2, N, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const w = white.getChannelData(c), b = brown.getChannelData(c); let v = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; w[i] = r; v = (v + 0.02 * r) / 1.02; b[i] = v * 3.5; }
  }

  const zones = {};
  for (const z of ['mata', 'rio', 'estrada', 'cidade']) { const g = gainNode(0); g.connect(master); zones[z] = { g, w: 0, timers: {} }; }

  // cama contínua: ruído -> filtros -> ganho (com rajadas lentas opcionais)
  function bed(zone, buf, chain, level, lfo) {
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start(0, rand(0, 5));
    let node = src;
    for (const f of chain) { node.connect(f); node = f; }
    const g = gainNode(level); node.connect(g); g.connect(zones[zone].g);
    if (lfo) {
      const o = ctx.createOscillator(); o.frequency.value = lfo.rate;
      const og = gainNode(level * lfo.depth); o.connect(og); og.connect(g.gain); o.start(0);
    }
    return g;
  }
  // mata
  bed('mata', brown, [filt('lowpass', 480)], 0.55, { rate: 0.07, depth: 0.7 });
  bed('mata', white, [filt('highpass', 1800), filt('lowpass', 6500)], 0.088, { rate: 0.11, depth: 0.85 });
  const cig = bed('mata', white, [filt('bandpass', 6300, 9)], 0.055);
  { const o = ctx.createOscillator(); o.frequency.value = 27; const og = gainNode(0.045); o.connect(og); og.connect(cig.gain); o.start(0); }
  // rio
  bed('rio', white, [filt('bandpass', 850, 0.45), filt('lowpass', 2600)], 0.4, { rate: 0.19, depth: 0.25 });
  bed('rio', brown, [filt('lowpass', 260)], 0.55);
  // estrada
  bed('estrada', brown, [filt('lowpass', 650)], 1.4, { rate: 0.05, depth: 0.8 });
  bed('estrada', white, [filt('highpass', 2600), filt('lowpass', 7000)], 0.1, { rate: 0.08, depth: 0.9 });
  // cidade
  bed('cidade', brown, [filt('lowpass', 210)], 1.25, { rate: 0.03, depth: 0.3 });
  bed('cidade', white, [filt('bandpass', 650, 0.4)], 0.075, { rate: 0.045, depth: 0.5 });

  /* ── eventos ── */
  function out(zone, pan, vol) {
    const p = panNode(pan), g = gainNode(vol); g.connect(p); p.connect(zones[zone].g); return g;
  }
  function tone(dst, type, t0, dur, f0, f1, att = 0.01) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const e = gainNode(0); e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(1, t0 + att);
    e.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(e); e.connect(dst); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noiseHit(dst, t0, dur, f, q, att = 0.005) {
    const s = ctx.createBufferSource(); s.buffer = white; const b = filt('bandpass', f, q);
    const e = gainNode(0); e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(1, t0 + att);
    e.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(b); b.connect(e); e.connect(dst); s.start(t0, rand(0, 5)); s.stop(t0 + dur + 0.05);
  }
  const ev = {
    bird(zone, vol = 1) {   // canto curto: 1 a 6 notas assobiadas
      const t = ctx.currentTime + 0.02, g = out(zone, rand(-0.9, 0.9), rand(0.08, 0.22) * vol);
      const base = rand(2200, 4300), n = Math.floor(rand(1, 7)), up = Math.random() < 0.5;
      for (let i = 0; i < n; i++) {
        const f = base * rand(0.9, 1.12), dur = rand(0.06, 0.16);
        tone(g, 'sine', t + i * rand(0.09, 0.19), dur, up ? f * 0.8 : f * 1.25, up ? f * 1.3 : f * 0.85, 0.012);
      }
    },
    trill(zone, vol = 1) {  // trinado
      const t = ctx.currentTime + 0.02, dur = rand(0.4, 1.1), g = out(zone, rand(-0.9, 0.9), rand(0.06, 0.12) * vol);
      const am = ctx.createOscillator(); am.frequency.value = rand(22, 38); const amg = gainNode(0.5);
      const c = gainNode(0.5); am.connect(amg); amg.connect(c.gain); c.connect(g); am.start(t); am.stop(t + dur + 0.1);
      tone(c, 'sine', t, dur, rand(3600, 5000), rand(3400, 4800), 0.05);
    },
    cricket(zone, vol = 1) {
      const t = ctx.currentTime + 0.02, g = out(zone, rand(-0.8, 0.8), rand(0.04, 0.09) * vol), f = rand(4300, 4900);
      const groups = Math.floor(rand(2, 5));
      for (let k = 0; k < groups; k++) for (let i = 0; i < 3; i++) tone(g, 'sine', t + k * 0.32 + i * 0.045, 0.028, f, f * 0.98, 0.004);
    },
    beast(zone, vol = 1) {  // bicho grande ao longe (bem baixo e abafado)
      const t = ctx.currentTime + 0.05, dur = rand(1.2, 2.2);
      const lp = filt('lowpass', 380), g = out(zone, rand(-0.7, 0.7), rand(0.1, 0.16) * vol); lp.connect(g);
      const vib = ctx.createOscillator(); vib.frequency.value = rand(5, 8); const vg = gainNode(6); vib.connect(vg);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; vg.connect(o.frequency);
      o.frequency.setValueAtTime(rand(85, 120), t); o.frequency.exponentialRampToValueAtTime(rand(50, 70), t + dur);
      const e = gainNode(0); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.35); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(e); e.connect(lp); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    },
    bubble(zone, vol = 1) {
      const t = ctx.currentTime + 0.01, g = out(zone, rand(-0.8, 0.8), rand(0.03, 0.08) * vol), f = rand(320, 950);
      tone(g, 'sine', t, rand(0.03, 0.07), f, f * rand(1.4, 2.0), 0.003);
    },
    plunk(zone, vol = 1) {  // gotinha / marola batendo na pedra
      const t = ctx.currentTime + 0.01, g = out(zone, rand(-0.8, 0.8), rand(0.04, 0.1) * vol);
      noiseHit(g, t, rand(0.12, 0.25), rand(500, 1200), 1.2);
    },
    lapwing(zone, vol = 1) { // quero-quero ao longe
      const t = ctx.currentTime + 0.02, g = out(zone, rand(-0.9, 0.9), rand(0.06, 0.1) * vol);
      const n = Math.floor(rand(2, 5));
      for (let i = 0; i < n; i++) tone(g, 'triangle', t + i * 0.22, 0.16, 2600, 3300, 0.01);
    },
    cow(zone, vol = 1) {
      const t = ctx.currentTime + 0.05, dur = rand(1.1, 1.6);
      const f1 = filt('bandpass', 520, 2.5), lp = filt('lowpass', 1100), g = out(zone, rand(-0.8, 0.8), rand(0.1, 0.16) * vol);
      f1.connect(lp); lp.connect(g);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(rand(115, 135), t); o.frequency.linearRampToValueAtTime(rand(95, 110), t + dur);
      const e = gainNode(0); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.3); e.gain.linearRampToValueAtTime(0.8, t + dur * 0.7); e.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(e); e.connect(f1); o.start(t); o.stop(t + dur + 0.05);
    },
    car(zone, vol = 1) {    // carro passando de um lado para o outro
      const t = ctx.currentTime + 0.05, dur = rand(3.2, 5), dir = Math.random() < 0.5 ? -1 : 1;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : gainNode(1);
      if (p.pan) { p.pan.setValueAtTime(-0.9 * dir, t); p.pan.linearRampToValueAtTime(0.9 * dir, t + dur); }
      const g = gainNode(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rand(0.24, 0.4) * vol, t + dur * 0.5); g.gain.linearRampToValueAtTime(0, t + dur);
      g.connect(p); p.connect(zones[zone].g);
      const s = ctx.createBufferSource(); s.buffer = white; const b = filt('bandpass', 500, 0.8);
      b.frequency.setValueAtTime(380, t); b.frequency.linearRampToValueAtTime(900, t + dur * 0.48); b.frequency.linearRampToValueAtTime(320, t + dur);
      s.connect(b); b.connect(g); s.start(t, rand(0, 5)); s.stop(t + dur + 0.1);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; const lp = filt('lowpass', 180), og = gainNode(0.35);
      o.frequency.setValueAtTime(rand(70, 95), t); o.frequency.linearRampToValueAtTime(rand(55, 70), t + dur);
      o.connect(lp); lp.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.1);
    },
    horn(zone, vol = 1) {
      const t = ctx.currentTime + 0.02, g = out(zone, rand(-0.8, 0.8), rand(0.05, 0.08) * vol), lp = filt('lowpass', 1600); lp.connect(g);
      const beeps = Math.random() < 0.5 ? 1 : 2;
      for (let k = 0; k < beeps; k++) for (const f of [415, 523]) tone(lp, 'square', t + k * 0.3, 0.22, f, f, 0.01);
    },
    dog(zone, vol = 1) {
      const t = ctx.currentTime + 0.02, g = out(zone, rand(-0.9, 0.9), rand(0.08, 0.14) * vol), lp = filt('lowpass', 1500); lp.connect(g);
      const n = Math.floor(rand(1, 4));
      for (let i = 0; i < n; i++) {
        const t0 = t + i * rand(0.22, 0.35);
        tone(lp, 'sawtooth', t0, 0.11, rand(330, 380), rand(190, 230), 0.008);
        noiseHit(lp, t0, 0.09, 700, 1.8);
      }
    },
  };
  // [evento, intervalo mínimo, máximo, volume]
  const SCHEDULE = {
    mata: [['bird', 0.8, 4], ['trill', 4, 11], ['cricket', 3, 8, 0.6], ['beast', 28, 60]],
    rio: [['bubble', 0.06, 0.35], ['plunk', 0.4, 1.6]],
    estrada: [['cricket', 0.8, 3.5], ['bird', 4, 12, 0.6], ['lapwing', 14, 35], ['cow', 30, 70]],
    cidade: [['car', 4, 12], ['horn', 15, 40], ['dog', 12, 32], ['bird', 6, 16, 0.4]],
  };

  function update(dt, weights) {
    if (!unlocked || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const [name, z] of Object.entries(zones)) {
      const w = Math.max(0, Math.min(1, (weights && weights[name]) || 0));
      if (Math.abs(w - z.w) > 0.01) { z.g.gain.setTargetAtTime(w, now, 0.6); z.w = w; }
      if (!active || w < 0.05) continue;
      for (const [evName, a, b, vol = 1] of SCHEDULE[name]) {
        const k = evName;
        if (z.timers[k] === undefined) z.timers[k] = rand(0, b);
        z.timers[k] -= dt;
        if (z.timers[k] <= 0) { z.timers[k] = rand(a, b) / Math.max(0.35, w); ev[evName](name, vol); }
      }
    }
  }
  function setActive(on) {
    active = on;
    master.gain.setTargetAtTime(on && unlocked ? LEVEL : 0, ctx.currentTime, 0.8);
  }
  return {
    // o navegador só libera áudio depois de um clique
    unlock() { unlocked = true; if (ctx.state !== 'running') ctx.resume(); setActive(active); },
    update,
    setActive,
    get state() { return ctx.state; },
    // nível de saída agora (pico e RMS), para depurar a mixagem
    level() { meter.getFloatTimeDomainData(meterBuf); let pk = 0, sq = 0; for (const v of meterBuf) { pk = Math.max(pk, Math.abs(v)); sq += v * v; } return { peak: pk, rms: Math.sqrt(sq / meterBuf.length) }; },
    dispose() { ctx.close(); },
  };
}
