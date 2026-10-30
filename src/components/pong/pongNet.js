// Rede do Pong online via PeerJS (WebRTC P2P, servidor de sinalização público e gratuito).
//
// Não existe servidor próprio, então as salas usam IDs fixos e previsíveis:
//   gbpong-v1-sala-1 ... gbpong-v1-sala-N
// - Criar sala = registrar o primeiro ID livre (quem registra vira o anfitrião).
// - Listar salas = tentar conectar em cada ID; o anfitrião responde quantos jogadores há.
// - Entrar pela URL (#/pong?sala=3) = conectar no anfitrião daquele ID, ou virar anfitrião se estiver livre.
import Peer from 'peerjs';

export const MAX_ROOMS = 8;
const ROOM_PREFIX = 'gbpong-v1-sala-';
const PROBE_TIMEOUT = 5000;

export const roomPeerId = (room) => `${ROOM_PREFIX}${room}`;

const roomFromPeerError = (err) => {
  const match = String(err?.message || '').match(new RegExp(`${ROOM_PREFIX}(\\d+)`));
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

/** Registra o ID da sala. Rejeita com err.type === 'unavailable-id' se já houver anfitrião. */
export const hostRoom = (room) => openPeer(roomPeerId(room));

/** Cria uma sala no primeiro número livre. */
export const hostAnyRoom = async (busyRooms = []) => {
  for (let room = 1; room <= MAX_ROOMS; room++) {
    if (busyRooms.includes(room)) continue;
    try {
      const peer = await hostRoom(room);
      return { peer, room };
    } catch (err) {
      if (err.type !== 'unavailable-id') throw err;
    }
  }
  throw new Error('Todas as salas estão ocupadas no momento.');
};

export const openGuestPeer = () => openPeer(null);

/**
 * Consulta todas as salas e devolve [{ room, players }] apenas das que existem.
 */
export const listRooms = async () => {
  const peer = await openGuestPeer();
  const found = new Map();
  const pending = new Set(Array.from({ length: MAX_ROOMS }, (_, i) => i + 1));

  await new Promise((resolve) => {
    const finish = () => {
      if (pending.size === 0) resolve();
    };
    const timer = setTimeout(resolve, PROBE_TIMEOUT);

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        const room = roomFromPeerError(err);
        if (room) {
          pending.delete(room);
          finish();
        }
      }
    });

    for (let room = 1; room <= MAX_ROOMS; room++) {
      const conn = peer.connect(roomPeerId(room), { metadata: { type: 'probe' }, serialization: 'json' });
      conn.on('data', (msg) => {
        if (msg?.t === 'status') {
          found.set(room, msg.players);
          pending.delete(room);
          conn.close();
          if (pending.size === 0) {
            clearTimeout(timer);
            finish();
          }
        }
      });
    }
  });

  peer.destroy();
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([room, players]) => ({ room, players }));
};
