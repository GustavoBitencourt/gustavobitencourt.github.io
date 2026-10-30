// Rede do Pong online via PeerJS (WebRTC P2P, servidor de sinalização público e gratuito).
//
// Cada sala tem um código aleatório de 4 caracteres (ex.: "ab3f"):
//   gbpong-v3-sala-ab3f  -> peer do anfitrião, usado para entrar na sala (link #/pong?sala=ab3f)
//
// O servidor público não permite listar peers, então para a sala aparecer no lobby
// o anfitrião também ocupa uma "vaga de anúncio" numerada:
//   gbpong-v3-vaga-1 ... gbpong-v3-vaga-N -> responde com { código, jogadores, nome do anfitrião }
// Se todas as vagas estiverem ocupadas, a sala continua funcionando pelo link, só não aparece na lista.
import Peer from 'peerjs';

const PREFIX = 'gbpong-v3-';
export const MAX_SLOTS = 12;
const PROBE_TIMEOUT = 5000;
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o, 1/l/i para evitar confusão
export const CODE_PATTERN = /^[a-z0-9]{4}$/;

export const roomPeerId = (code) => `${PREFIX}sala-${code}`;
const slotPeerId = (slot) => `${PREFIX}vaga-${slot}`;

export const generateRoomCode = () =>
  Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

const slotFromPeerError = (err) => {
  const match = String(err?.message || '').match(new RegExp(`${PREFIX}vaga-(\\d+)`));
  return match ? Number(match[1]) : null;
};

const openPeer = (id) =>
  new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const onError = (err) => {
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      peer.off('error', onError);
      resolve(peer);
    });
    peer.once('error', onError);
  });

/** Registra a sala com o código informado. Rejeita com err.type === 'unavailable-id' se já existir. */
export const hostRoom = (code) => openPeer(roomPeerId(code));

/** Cria uma sala com código aleatório (tenta outro se, por acaso, já existir). */
export const hostNewRoom = async () => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    try {
      const peer = await hostRoom(code);
      return { peer, code };
    } catch (err) {
      if (err.type !== 'unavailable-id') throw err;
    }
  }
  throw new Error('Não foi possível criar a sala. Tente novamente.');
};

/** Ocupa a primeira vaga de anúncio livre. Retorna o peer ou null se todas estiverem ocupadas. */
export const claimListingSlot = async () => {
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    try {
      return await openPeer(slotPeerId(slot));
    } catch (err) {
      if (err.type !== 'unavailable-id') return null;
    }
  }
  return null;
};

export const openGuestPeer = () => openPeer(null);

/**
 * Consulta as vagas de anúncio e devolve [{ code, players, max, host, win }] das salas abertas.
 */
export const listRooms = async () => {
  const peer = await openGuestPeer();
  const found = new Map();
  const pending = new Set(Array.from({ length: MAX_SLOTS }, (_, i) => i + 1));

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, PROBE_TIMEOUT);
    const done = (slot) => {
      pending.delete(slot);
      if (pending.size === 0) {
        clearTimeout(timer);
        resolve();
      }
    };

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        const slot = slotFromPeerError(err);
        if (slot) done(slot);
      }
    });

    for (let slot = 1; slot <= MAX_SLOTS; slot++) {
      const conn = peer.connect(slotPeerId(slot), { metadata: { type: 'probe' }, serialization: 'json' });
      conn.on('data', (msg) => {
        if (msg?.t === 'status' && CODE_PATTERN.test(msg.code || '')) {
          found.set(msg.code, { players: msg.players, max: msg.max || 2, host: msg.host || '', win: msg.win || null });
          conn.close();
          done(slot);
        }
      });
    }
  });

  peer.destroy();
  return [...found.entries()]
    .map(([code, info]) => ({ code, ...info }))
    .sort((a, b) => a.players - b.players || a.code.localeCompare(b.code));
};
