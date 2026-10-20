/* Batida house de 120 BPM sintetizada ao vivo, alinhada ao show de luzes e ao público da festa. */
export function createMusic(SPB) {
  return {
    ctx: null, on: false, t0: 0, step: 0, timer: null,
    init() {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = C.createGain(); this.out.gain.value = 0.55;
      const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      this.out.connect(comp); comp.connect(C.destination);
      const n = C.createBuffer(1, C.sampleRate, C.sampleRate); const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    },
    env(g, t, a, peak, dec) {
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    },
    kick(t) {
      const C = this.ctx, o = C.createOscillator(), g = C.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      this.env(g, t, 0.002, 1.0, 0.34); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.4);
    },
    noiseHit(t, type, freq, q, peak, dec) {
      const C = this.ctx, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
      s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
      this.env(g, t, 0.001, peak, dec); s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.05);
    },
    clap(t, v = 0.5) { for (const k of [0, 0.011, 0.022]) this.noiseHit(t + k, 'bandpass', 1300, 0.9, v, k < 0.02 ? 0.03 : 0.16); },
    hat(t, open) { this.noiseHit(t, 'highpass', 7500, 0.7, open ? 0.16 : 0.09, open ? 0.16 : 0.035); },
    bass(t, f) {
      const C = this.ctx, o = C.createOscillator(), o2 = C.createOscillator(), lp = C.createBiquadFilter(), g = C.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f * 0.5;
      lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(160, t + 0.2);
      this.env(g, t, 0.004, 0.32, 0.2); o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.out);
      o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
    },
    stab(t, notes, v = 0.07) {
      const C = this.ctx, lp = C.createBiquadFilter(), g = C.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
      this.env(g, t, 0.004, v, 0.26); lp.connect(g); g.connect(this.out);
      for (const f of notes) {
        const o = C.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14;
        o.connect(lp); o.start(t); o.stop(t + 0.32);
      }
    },
    // 4 compassos: Am, F, C, G (um loop de 16 tempos = um loop do show de luzes)
    BASS: [55, 43.65, 65.41, 49.0],
    CHORDS: [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]],
    playStep(step, t) {
      const s = step % 16, bar = Math.floor(step / 16) % 4;
      if (s % 4 === 0) this.kick(t);
      if (s === 4 || s === 12) this.clap(t);
      if (bar === 3 && s >= 8 && s % 2 === 0) this.clap(t, 0.18 + 0.04 * (s - 8)); // virada junto com os strobos
      if (s % 4 === 2) { this.hat(t, true); this.bass(t, this.BASS[bar]); } else if (s % 2 === 1) this.hat(t, false);
      if (s === 3 || s === 10) this.stab(t, this.CHORDS[bar]);
    },
    schedule() {
      const sps = SPB / 4;
      while (this.t0 + this.step * sps < this.ctx.currentTime + 0.12) { this.playStep(this.step, this.t0 + this.step * sps); this.step++; }
    },
    start(partyClock) {
      if (!this.ctx) this.init();
      this.ctx.resume();
      // alinha: tempo da festa p corresponde ao tempo de áudio t0 + p
      const nextBeat = Math.ceil(partyClock / SPB + 1e-6);
      this.t0 = this.ctx.currentTime + 0.06 + (nextBeat * SPB - partyClock) - nextBeat * SPB;
      this.step = nextBeat * 4;
      this.on = true; this.timer = setInterval(() => this.schedule(), 25); this.schedule();
    },
    stop() { this.on = false; clearInterval(this.timer); if (this.ctx) this.ctx.suspend(); },
    partyTime() { return this.ctx.currentTime - this.t0; },
    dispose() { this.stop(); if (this.ctx) this.ctx.close(); this.ctx = null; },
  };
}
