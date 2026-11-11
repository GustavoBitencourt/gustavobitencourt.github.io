// Medidas oficiais (IFAB / padrão UEFA e FIFA para jogos internacionais), em metros.
// Eixo X = comprimento (de gol a gol), eixo Z = largura, eixo Y = altura.
export const PITCH = {
  length: 105,
  width: 68,
  line: 0.12,            // largura das linhas (máximo permitido: 12 cm)
  margin: 5,             // faixa de grama além das linhas
  circleR: 9.15,         // círculo central e meia-lua
  penaltyDepth: 16.5,    // grande área
  penaltyHalfW: 20.16,   // 16,5 m a partir de cada trave (gol de 7,32 m)
  goalAreaDepth: 5.5,    // pequena área
  goalAreaHalfW: 9.16,
  penaltyMark: 11,       // marca do pênalti
  markR: 0.11,
  centerMarkR: 0.12,
  cornerR: 1.0,
};

// Cada nível tem 4 anéis de lâminas ao redor da câmera. `n` é o lado da grade
// (n × n lâminas por anel), `cell` o espaçamento das lâminas no anel mais próximo
// (0,006 m = ~28 mil lâminas por m²) e `segs` os segmentos de cada lâmina por anel.
// A cada anel o espaçamento e a largura das lâminas dobram.
export const QUALITY = {
  baixa: { label: 'Baixa', n: 256, cell: 0.0095, segs: [4, 2, 1, 1], pixelRatio: 1 },
  media: { label: 'Média', n: 384, cell: 0.0072, segs: [5, 3, 2, 1], pixelRatio: 1.5 },
  alta: { label: 'Alta', n: 512, cell: 0.006, segs: [6, 3, 2, 1], pixelRatio: 2 },
  ultra: { label: 'Ultra', n: 768, cell: 0.005, segs: [7, 4, 2, 1], pixelRatio: 2 },
};
export const QUALITY_ORDER = ['baixa', 'media', 'alta', 'ultra'];

export const PATTERNS = {
  'Faixas transversais (padrão europeu)': 0,
  'Xadrez': 1,
  'Faixas longitudinais': 2,
  'Sem padrão': 3,
};

// Vistas prontas: posição da câmera e ponto observado.
export const VIEWS = [
  { key: '1', name: 'Transmissão', pos: [0, 27, 74], look: [0, 0, 2] },
  { key: '2', name: 'Aérea', pos: [0, 96, 0.05], look: [0, 0, 0] },
  { key: '3', name: 'Jogador', pos: [-13, 1.72, 6], look: [40, 0.4, -3] },
  { key: '4', name: 'Rente à grama', pos: [-0.95, 0.075, 9.75], look: [0.6, 0.0, 9.05] },
  { key: '5', name: 'Macro', pos: [41.16, 0.1, 0.24], look: [41.42, 0.0, 0.04] },
  { key: '6', name: 'Atrás do gol', pos: [-68, 7.5, 0], look: [-20, 0, 0] },
  { key: '7', name: 'Escanteio', pos: [-55.2, 1.35, -36.6], look: [-40, 0, -22] },
];

// Largura da lâmina em relação ao espaçamento (0,42 × 6 mm = 2,5 mm, como o azevém-perene).
export const BLADE_WIDTH_RATIO = 0.42;

// Cores da folha (RGB linear): base pálida, meio verde intenso, ponta mais clara.
export const COLORS = {
  root: [0.07, 0.11, 0.028],
  mid: [0.04, 0.145, 0.02],
  tip: [0.066, 0.2, 0.03],
  dry: [0.36, 0.33, 0.15],
  paint: [0.86, 0.86, 0.82],
  thatch: [0.035, 0.07, 0.016],
  surround: [0.05, 0.052, 0.055],
};
