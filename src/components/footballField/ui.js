import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { PATTERNS, VIEWS } from './config.js';

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function formatBlades(n) {
  if (n >= 1e6) return `${nf.format(n / 1e6)} mi de lâminas`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} mil lâminas`;
  return `${n} lâminas`;
}
function formatHeight(m) {
  if (m < 1) return `${nf.format(m * 100)} cm`;
  return `${nf.format(m)} m`;
}
function formatHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')}`;
}

// els: { root, stats, toast, views } — elementos do componente React
export function buildUI(api, els) {
  const s = api.state;
  const { root, stats, toast: toastEl, views } = els;

  // ---- vistas prontas ------------------------------------------------------
  VIEWS.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<kbd>${v.key}</kbd>${v.name}`;
    b.addEventListener('click', () => { api.goTo(i); b.blur(); });
    views.appendChild(b);
  });

  // ---- painel de ajustes ---------------------------------------------------
  const gui = new GUI({ title: 'Ajustes', width: 300, container: root });
  const model = {
    qualidade: s.quality,
    padrao: s.pattern,
    corte: s.cutMm,
    faixas: s.stripes,
    linhas: s.lines,
    vento: s.wind,
    hora: s.hour,
    nuvens: s.clouds,
    exposicao: s.exposure,
    fov: s.fov,
    velocidade: s.speed,
    captura: () => api.screenshot(),
  };
  gui.add(model, 'qualidade', { 'Automática': 'auto', 'Baixa': 'baixa', 'Média': 'media', 'Alta': 'alta', 'Ultra': 'ultra' })
    .name('Qualidade').onChange(api.setQuality);

  const g1 = gui.addFolder('Gramado');
  g1.add(model, 'padrao', PATTERNS).name('Padrão do corte').onChange(api.setPattern);
  g1.add(model, 'corte', 18, 35, 1).name('Altura do corte (mm)').onChange(api.setCut);
  g1.add(model, 'faixas', 0, 0.9, 0.01).name('Contraste das faixas').onChange(api.setStripes);
  g1.add(model, 'linhas').name('Marcações').onChange(api.setLines);
  g1.add(model, 'vento', 0, 1, 0.01).name('Brisa').onChange(api.setWind);

  const g2 = gui.addFolder('Luz');
  const hora = g2.add(model, 'hora', 6.5, 18, 0.25).name(`Hora do dia · ${formatHour(s.hour)}`).onChange((v) => {
    hora.name(`Hora do dia · ${formatHour(v)}`);
    api.setHour(v);
  });
  g2.add(model, 'nuvens', 0, 0.8, 0.01).name('Nuvens').onChange(api.setClouds);
  g2.add(model, 'exposicao', 0.5, 2, 0.01).name('Exposição').onChange(api.setExposure);

  const g3 = gui.addFolder('Câmera');
  g3.add(model, 'fov', 25, 90, 1).name('Campo de visão (°)').onChange(api.setFov);
  g3.add(model, 'velocidade', 0.25, 4, 0.05).name('Velocidade').onChange(api.setSpeed);
  g3.add(model, 'captura').name('Salvar captura (P)');
  gui.domElement.classList.add('ff-gui');
  if (window.innerWidth < 900) gui.close();

  // ---- teclado -------------------------------------------------------------
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '')) return;
    if (e.code.startsWith('Digit')) {
      const i = VIEWS.findIndex((v) => v.key === e.code.slice(5));
      if (i >= 0) api.goTo(i);
    } else if (e.code === 'KeyF') api.toggleLock();
    else if (e.code === 'KeyH') root.classList.toggle('clean');
    else if (e.code === 'KeyP') api.screenshot();
  };
  window.addEventListener('keydown', onKey);

  let toastTimer = 0;
  return {
    gui,
    dispose() {
      window.removeEventListener('keydown', onKey);
      clearTimeout(toastTimer);
      gui.destroy();
      views.replaceChildren();
    },
    setStats({ fps, blades, height, level, auto }) {
      stats.textContent = `${Math.round(fps)} fps · ${blades ? formatBlades(blades) + ' em 3D' : 'vista distante'} · câmera a ${formatHeight(height)} do solo`;
      stats.dataset.level = auto ? `auto: ${level}` : level;
    },
    toast(msg) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
    },
  };
}
