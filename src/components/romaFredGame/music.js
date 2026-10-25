/*
  Som da Xalassa: o "Remix na Casa do Sol" tocando em loop dentro da festa.
  A música tem 125 BPM e o público, as luzes e as danças foram feitos a 120 BPM:
  enquanto ela toca, o relógio da festa anda 125/120 mais rápido e começa num tempo
  forte, então as luzes e a galera ficam na batida da música.
*/
const SONG_URL = `${process.env.PUBLIC_URL || ''}/sounds/festa/remix_na_casa_do_sol.mp3`;
const SONG_BPM = 125;
const SONG_BEATS = 256;   // 2:02,88 = 256 tempos exatos (o loop fecha no compasso)

export function createMusic(SPB) {
  const rate = (SPB * SONG_BPM) / 60;   // segundos da festa por segundo da música
  return {
    ctx: null, on: false, playing: false, buffer: null, loading: null, src: null,
    tStart: 0, pBase: 0, loopStart: 0, loopEnd: 0,
    init() {
      const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = C.createGain(); this.out.gain.value = 0.8;
      this.out.connect(C.destination);
    },
    // baixa e decodifica a música (dá para chamar antes, enquanto a festa carrega)
    load() {
      if (!this.ctx) this.init();
      if (!this.loading) {
        this.loading = fetch(SONG_URL)
          .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
          .then((ab) => this.ctx.decodeAudioData(ab))
          .then((buf) => {
            this.buffer = buf;
            // o MP3 ganha um pouco de silêncio do codificador no começo: o loop começa no
            // primeiro som e dura exatamente os 256 tempos, sem tranco na volta
            const d = buf.getChannelData(0);
            const lim = Math.min(d.length, Math.floor(buf.sampleRate * 0.2));
            let i = 0;
            while (i < lim && Math.abs(d[i]) < 1e-4) i++;
            this.loopStart = i / buf.sampleRate;
            this.loopEnd = Math.min(buf.duration, this.loopStart + (SONG_BEATS * 60) / SONG_BPM);
            return buf;
          })
          .catch((err) => { console.warn('Música da festa indisponível:', err); this.loading = null; return null; });
      }
      return this.loading;
    },
    // getClock(): relógio atual da festa (a música entra num tempo forte dele)
    start(getClock) {
      if (!this.ctx) this.init();
      this.ctx.resume();
      this.on = true;
      this.load().then((buf) => {
        if (!buf || !this.on || this.playing || !this.ctx) return;
        const C = this.ctx;
        const src = C.createBufferSource();
        src.buffer = buf; src.loop = true; src.loopStart = this.loopStart; src.loopEnd = this.loopEnd;
        src.connect(this.out);
        this.tStart = C.currentTime + 0.08;
        this.pBase = Math.ceil((getClock() + 0.08) / SPB - 1e-6) * SPB;
        src.start(this.tStart, this.loopStart);
        this.src = src; this.playing = true;
      });
    },
    stop() {
      this.on = false; this.playing = false;
      if (this.src) { try { this.src.stop(); } catch (e) { /* já parou */ } this.src.disconnect(); this.src = null; }
    },
    // tempo da festa no instante atual da música (null enquanto ela ainda não começou)
    partyTime() {
      if (!this.playing) return null;
      return this.pBase + (this.ctx.currentTime - this.tStart) * rate;
    },
    dispose() { this.stop(); if (this.ctx) this.ctx.close(); this.ctx = null; },
  };
}
