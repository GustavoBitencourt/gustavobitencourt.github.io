// Utilitários compartilhados para códigos WMO da Open-Meteo

export const getWeatherIcon = (code, isDay = true) => {
  const weatherIcons = {
    0: isDay ? '☀️' : '🌙',
    1: isDay ? '🌤️' : '🌙',
    2: '⛅',
    3: '☁️',
    45: '🌫️',
    48: '🌫️',
    51: '🌦️',
    53: '🌦️',
    55: '🌧️',
    56: '🌧️',
    57: '🌧️',
    61: '🌧️',
    63: '🌧️',
    65: '⛈️',
    66: '🌧️',
    67: '🌧️',
    71: '🌨️',
    73: '🌨️',
    75: '❄️',
    77: '🌨️',
    80: '🌦️',
    81: '🌧️',
    82: '⛈️',
    85: '🌨️',
    86: '❄️',
    95: '⛈️',
    96: '⛈️',
    99: '⛈️'
  };
  return weatherIcons[code] || '🌤️';
};

const DESCRIPTIONS = {
  0: 'Céu limpo',
  1: 'Principalmente limpo',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina com geada',
  51: 'Garoa leve',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  56: 'Garoa congelante leve',
  57: 'Garoa congelante intensa',
  61: 'Chuva leve',
  63: 'Chuva moderada',
  65: 'Chuva intensa',
  66: 'Chuva congelante leve',
  67: 'Chuva congelante intensa',
  71: 'Neve leve',
  73: 'Neve moderada',
  75: 'Neve intensa',
  77: 'Grãos de neve',
  80: 'Pancadas de chuva leves',
  81: 'Pancadas de chuva',
  82: 'Pancadas de chuva fortes',
  85: 'Pancadas de neve leves',
  86: 'Pancadas de neve fortes',
  95: 'Tempestade',
  96: 'Tempestade com granizo leve',
  99: 'Tempestade com granizo intenso'
};

export const getWeatherDescription = (code) => DESCRIPTIONS[code] || 'Condição desconhecida';

export const getWindDirection = (degrees) => {
  const directions = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return directions[Math.round((degrees || 0) / 45) % 8];
};

export const getUvLevel = (uv) => {
  if (uv === null || uv === undefined) return { label: 'N/A', color: '#94a3b8' };
  if (uv < 3) return { label: 'Baixo', color: '#16a34a' };
  if (uv < 6) return { label: 'Moderado', color: '#ca8a04' };
  if (uv < 8) return { label: 'Alto', color: '#ea580c' };
  if (uv < 11) return { label: 'Muito alto', color: '#dc2626' };
  return { label: 'Extremo', color: '#7c3aed' };
};

// Escala de cores por temperatura (°C)
const TEMP_STOPS = [
  [-10, [108, 92, 231]],
  [0, [74, 163, 255]],
  [12, [56, 201, 180]],
  [20, [247, 201, 72]],
  [28, [255, 138, 61]],
  [36, [232, 65, 74]]
];

export const tempColor = (t) => {
  if (t <= TEMP_STOPS[0][0]) return `rgb(${TEMP_STOPS[0][1].join(',')})`;
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(',')})`;
    }
  }
  return `rgb(${TEMP_STOPS[TEMP_STOPS.length - 1][1].join(',')})`;
};

/**
 * Converte o código WMO em uma "cena" para o fundo animado.
 * type: clear | partly | cloudy | fog | drizzle | rain | storm | snow
 * intensity: 0..1
 */
export const getSkyScene = (code, isDay = true) => {
  const day = Boolean(isDay);
  if (code === 0 || code === 1) return { type: 'clear', isDay: day, intensity: 0 };
  if (code === 2) return { type: 'partly', isDay: day, intensity: 0.3 };
  if (code === 3) return { type: 'cloudy', isDay: day, intensity: 0.6 };
  if (code === 45 || code === 48) return { type: 'fog', isDay: day, intensity: 0.7 };
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { type: 'drizzle', isDay: day, intensity: code >= 55 ? 0.5 : 0.3 };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    const heavy = [65, 67, 82].includes(code);
    const moderate = [63, 81].includes(code);
    return { type: 'rain', isDay: day, intensity: heavy ? 1 : moderate ? 0.7 : 0.45 };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { type: 'snow', isDay: day, intensity: [75, 86].includes(code) ? 1 : code === 73 ? 0.7 : 0.45 };
  }
  if ([95, 96, 99].includes(code)) return { type: 'storm', isDay: day, intensity: 1 };
  return { type: 'partly', isDay: day, intensity: 0.3 };
};

export const SCENE_TYPES = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'storm', 'snow'];
