// Efeitos sonoros do Pong gerados com Web Audio API (sem arquivos de áudio).
const STORAGE_KEY = 'pong-volume';

let ctx = null;
let master = null;
let volume = (() => {
  const saved = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(saved) && localStorage.getItem(STORAGE_KEY) !== null ? saved : 0.6;
})();

const ensureContext = () => {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

// Navegadores só liberam áudio após uma interação do usuário
export const unlockAudio = () => {
  ensureContext();
};

export const getVolume = () => volume;

export const setVolume = (value) => {
  volume = Math.max(0, Math.min(1, value));
  localStorage.setItem(STORAGE_KEY, String(volume));
  if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
};

const tone = (freq, duration, { type = 'square', gain = 0.25, delay = 0, slideTo = null } = {}) => {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.02);
};

const SOUNDS = {
  hit: () => {
    tone(660, 0.08, { type: 'square', gain: 0.22 });
    tone(990, 0.05, { type: 'triangle', gain: 0.12, delay: 0.01 });
  },
  wall: () => tone(330, 0.06, { type: 'square', gain: 0.14 }),
  goal: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { type: 'triangle', gain: 0.28, delay: i * 0.08 }));
    tone(180, 0.35, { type: 'sawtooth', gain: 0.08, slideTo: 90 });
  },
  beep: () => tone(660, 0.12, { type: 'sine', gain: 0.3 }),
  go: () => tone(990, 0.28, { type: 'sine', gain: 0.32 }),
  win: () => {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
      tone(f, i === 5 ? 0.5 : 0.15, { type: 'triangle', gain: 0.3, delay: i * 0.12 })
    );
  }
};

export const playSound = (name) => {
  if (volume <= 0 || !SOUNDS[name]) return;
  if (!ensureContext()) return;
  SOUNDS[name]();
};
