/*
  Efeitos sonoros do Romanele: passos, salto, queda, bastada no ar e bastada acertando, dano,
  da água do rio (passos na água e splash, também usados pelos dinossauros) e dos dinossauros
  (passos e rugidos).
  Cada grupo tem várias variações; a cada som sorteia uma diferente da anterior e muda
  um pouco o tom e o volume, para não ficar repetitivo.
*/
const SOUNDS = `${process.env.PUBLIC_URL || ''}/sounds`;
const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(2, '0'));

const GROUPS = {
  passo: { files: range(8).map((n) => `passo/passo_${n}.wav`), volume: 0.45, pitch: 0.08 },
  salto: { files: range(5).map((n) => `saltos_quedas/salto_${n}.wav`), volume: 0.7, pitch: 0.05 },
  queda: { files: range(5).map((n) => `saltos_quedas/queda_${n}.wav`), volume: 0.75, pitch: 0.05 },
  tacoHit: { files: range(7).map((n) => `taco_hit/taco_hit_${n}.wav`), volume: 0.9, pitch: 0.06 },
  tacoSwosh: { files: range(7).map((n) => `taco_swosh/taco_swosh_${n}.wav`), volume: 0.6, pitch: 0.07 },
  passoAgua: { files: range(8).map((n) => `agua/passo_agua_${n}.wav`), volume: 0.55, pitch: 0.1 },
  splashAgua: { files: range(5).map((n) => `agua/splash_agua_${n}.wav`), volume: 0.85, pitch: 0.08 },
  dano: { files: range(6).map((n) => `dano/dano_${n}.wav`), volume: 0.9, pitch: 0.04 },
  passoDino: { files: range(8).map((n) => `passo_dino/passo_dino_${n}.wav`), volume: 0.8, pitch: 0.08 },
  rugido: { files: range(7).map((n) => `rugido_dino/rugido_dino_${n}.wav`), volume: 1, pitch: 0.06 },
  portaCarro: { files: range(2).map((n) => `carro/porta_carro_${n}.wav`), volume: 0.85, pitch: 0.05 },
};

export function createSfx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = Ctx ? new Ctx() : null;
  const out = ctx ? ctx.createGain() : null;
  if (out) { out.gain.value = 0.9; out.connect(ctx.destination); }
  const buffers = {};   // grupo -> AudioBuffer[]
  const last = {};      // grupo -> índice tocado por último

  // carrega tudo em segundo plano; um arquivo que falhar só fica de fora
  const ready = !ctx ? Promise.resolve() : Promise.all(Object.entries(GROUPS).map(async ([name, g]) => {
    const list = await Promise.all(g.files.map(async (f) => {
      try {
        const res = await fetch(`${SOUNDS}/${f}`);
        if (!res.ok) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        return null;
      }
    }));
    buffers[name] = list.filter(Boolean);
  }));

  function play(name, { volume = 1, rate = 1, pan = 0 } = {}) {
    const list = buffers[name];
    if (!ctx || !list || !list.length || ctx.state !== 'running') return;
    // sorteia uma variação diferente da última
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[name]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    last[name] = i;
    const g = GROUPS[name];
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * g.pitch);
    const gain = ctx.createGain();
    gain.gain.value = g.volume * volume * (0.88 + Math.random() * 0.24);
    src.connect(gain);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); gain.connect(p); p.connect(out); }
    else gain.connect(out);
    src.start();
  }

  return {
    ready,
    play,
    // o navegador só libera áudio depois de um clique: chamar no botão "Jogar"
    unlock() { if (ctx && ctx.state !== 'running') ctx.resume(); },
    dispose() { if (ctx) ctx.close(); },
  };
}
