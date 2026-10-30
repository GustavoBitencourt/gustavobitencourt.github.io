// Acesso à Steam Community a partir do navegador.
// A Steam não envia cabeçalhos CORS, então as requisições passam por um proxy:
//  1. Em desenvolvimento (npm start): proxy local do CRA em src/setupProxy.js (/steam-api)
//  2. Proxies públicos como último recurso (instáveis; hoje quase sempre fora do ar)
//
// A Steam limita requisições por IP (HTTP 429), principalmente no mercado (~20/min).
// Para não estourar o limite:
//  - respostas ficam em cache (memória + localStorage) com validade por tipo de endpoint
//  - requisições iguais simultâneas são agrupadas em uma só
//  - cada tipo de endpoint passa por uma fila com intervalo mínimo entre chamadas
//  - ao receber 429, o tipo de endpoint entra em pausa e o cache antigo é usado se existir

const STEAM_ORIGIN = 'https://steamcommunity.com';
const CACHE_PREFIX = 'steam-cache:';

// Regras por tipo de endpoint
const ENDPOINTS = {
  inventory: { match: /\/inventory\//, ttl: 10 * 60 * 1000, interval: 2500 },
  price: { match: /\/market\/priceoverview\//, ttl: 60 * 60 * 1000, interval: 3200 },
  search: { match: /\/market\/search\//, ttl: 15 * 60 * 1000, interval: 3200 },
  profile: { match: /\/(id|profiles)\//, ttl: 24 * 60 * 60 * 1000, interval: 1500 }
};
const COOLDOWN_MS = 60 * 1000;

const getEndpoint = (url) =>
  Object.entries(ENDPOINTS).find(([, cfg]) => cfg.match.test(url)) || ['other', { ttl: 5 * 60 * 1000, interval: 1500 }];

// ---------- Cache ----------
const memoryCache = new Map();

const readCache = (url) => {
  if (memoryCache.has(url)) return memoryCache.get(url);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (raw) {
      const entry = JSON.parse(raw);
      memoryCache.set(url, entry);
      return entry;
    }
  } catch {
    // localStorage indisponível ou corrompido
  }
  return null;
};

const writeCache = (url, data) => {
  const entry = { data, savedAt: Date.now() };
  memoryCache.set(url, entry);
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(entry));
  } catch {
    // Cota cheia: limpar entradas antigas da Steam e tentar de novo
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(entry));
    } catch {
      // Sem persistência; o cache em memória continua valendo
    }
  }
};

// ---------- Fila por tipo de endpoint ----------
const queues = {};
const cooldownUntil = {};

const schedule = (type, interval, task) => {
  const queue = queues[type] || (queues[type] = { last: 0, chain: Promise.resolve() });
  const run = queue.chain.then(async () => {
    const wait = queue.last + interval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    queue.last = Date.now();
    return task();
  });
  queue.chain = run.catch(() => {});
  return run;
};

// ---------- Proxies ----------
const buildCandidates = (url) => {
  const path = url.replace(STEAM_ORIGIN, '');
  const candidates = [];

  if (process.env.NODE_ENV === 'development') {
    candidates.push({ name: 'local', url: `/steam-api${path}` });
  }
  candidates.push({ name: 'allorigins', url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, wrapped: true });
  candidates.push({ name: 'codetabs', url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}` });

  return candidates;
};

export class SteamRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const RATE_LIMIT_MESSAGE = 'A Steam limitou as requisições. Tente novamente em cerca de 1 minuto.';

const requestThroughProxies = async (url, as, timeout) => {
  let lastError = null;

  for (const candidate of buildCandidates(url)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(candidate.url, { signal: controller.signal });

      if (!response.ok) {
        // No proxy local, 403/429 vêm da própria Steam (perfil privado / limite de requisições):
        // não adianta tentar os proxies públicos.
        if ((candidate.name === 'local') && [403, 429].includes(response.status)) {
          throw new SteamRequestError(
            response.status === 403 ? 'Inventário privado ou indisponível' : RATE_LIMIT_MESSAGE,
            response.status
          );
        }
        throw new Error(`${candidate.name} retornou ${response.status}`);
      }

      let text;
      if (candidate.wrapped) {
        const data = await response.json();
        if (!data.contents) throw new Error(`${candidate.name} retornou vazio`);
        text = data.contents;
      } else {
        text = await response.text();
      }

      return as === 'json' ? JSON.parse(text) : text;
    } catch (error) {
      if (error instanceof SteamRequestError) throw error;
      lastError = error.name === 'AbortError' ? new Error(`${candidate.name} demorou demais`) : error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`Não foi possível acessar a Steam (${lastError?.message || 'sem resposta'})`);
};

const inFlight = new Map();

/**
 * Busca uma URL da steamcommunity.com com cache, fila e proxies.
 * @param {string} url URL completa da Steam
 * @param {{ as?: 'json' | 'text', timeout?: number, force?: boolean }} options
 */
export const fetchSteam = (url, { as = 'json', timeout = 12000, force = false } = {}) => {
  const [type, cfg] = getEndpoint(url);
  const cached = readCache(url);

  if (!force && cached && Date.now() - cached.savedAt < cfg.ttl) {
    return Promise.resolve(cached.data);
  }

  const key = `${as}:${url}`;
  if (inFlight.has(key)) return inFlight.get(key);

  const request = (async () => {
    // Em pausa por 429: usar cache antigo se houver, senão avisar sem chamar a Steam
    if (cooldownUntil[type] > Date.now()) {
      if (cached) return cached.data;
      throw new SteamRequestError(RATE_LIMIT_MESSAGE, 429);
    }

    try {
      const data = await schedule(type, cfg.interval, () => {
        // A pausa pode ter começado enquanto esta requisição esperava na fila
        if (cooldownUntil[type] > Date.now()) throw new SteamRequestError(RATE_LIMIT_MESSAGE, 429);
        return requestThroughProxies(url, as, timeout);
      });
      writeCache(url, data);
      return data;
    } catch (error) {
      if (error.status === 429) cooldownUntil[type] = Date.now() + COOLDOWN_MS;
      if (cached) return cached.data;
      throw error;
    }
  })();

  inFlight.set(key, request);
  request.finally(() => inFlight.delete(key)).catch(() => {});
  return request;
};
