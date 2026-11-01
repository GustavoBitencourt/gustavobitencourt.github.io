// levantar_moto.js — animação da cegonha LEVANTANDO A MOTO CAÍDA (com e sem a AK).  three.js r150+
//
//   import { clipLevantarMoto, LEVANTAR_MOTO } from './levantar_moto.js';
//   const clip = clipLevantarMoto(clipsDaCegonha, armada);   // AnimationClip 'Cegonha_Moto_Levantar' (ou _SemArma)
//
// Se o .glb da cegonha já tiver um clip com esse nome, ele é usado. Senão, o clip é montado aqui a partir das
// poses dos clips que já existem no rig (assim continua funcionando quando o .glb for trocado):
//   em pé ........ Cegonha_Parado / Cegonha_AK_Segurar (1º quadro)
//   agachada ..... pernas, quadril, tronco e pescoço do Cegonha_Sentar (no meio da descida)
//   mãos na moto . braços (e a AK) do Cegonha_Moto_Dirigindo(_SemArma): com a AK a mão esquerda segura a manopla
//                  e a direita continua com a arma; sem a AK, as duas mãos nas manoplas
//   força ........ asas abertas do Cegonha_Moto_Entrar(_SemArma) no meio do pulo (ela bate as asas para ajudar)
//
// Linha do tempo (s):  0 em pé · 0.55 agachada com as mãos na moto · 0.8 começa a puxar (a moto sobe junto,
// LEVANTAR_MOTO.MOTO_INICIO..+MOTO_DUR) · 1.45 meio do caminho, asas abertas · 2.0 em pé segurando a moto ·
// 2.5 volta à pose de parada.  O clip é "no lugar": quem anda com ela até a moto é o jogo (LEVANTAR_MOTO.AVANCO).

import * as THREE from 'three';

export const LEVANTAR_MOTO = {
  NOME: 'Cegonha_Moto_Levantar',
  MOTO_INICIO: 0.8,     // s do clip em que a moto começa a subir
  MOTO_DUR: 1.2,        // s que a moto leva do chão até o pezinho
  DISTANCIA: 1.6,       // metros da moto: onde ela fica (do lado do guidão) para levantar
  FRENTE: 0.1,          // metros da moto: quanto à frente do centro (entre o banco e o guidão)
  AVANCO: 0.55,         // metros da moto: quanto ela anda junto com a moto enquanto levanta
};

const BRACOS = ['Braco_Mecanico_Esquerda', 'Antebraco_Mecanico_Esquerda', 'Braco_Mecanico_Direita', 'Antebraco_Mecanico_Direita'];
const ARMA = ['Arma', 'Flash_AK'];
const CORPO = ['Raiz', 'Corpo', 'Pescoco_1', 'Pescoco_2', 'Cabeca',
  'Perna_Direita', 'Perna_Direita_Baixo', 'Pe_Direito', 'Perna_Esquerda', 'Perna_Esquerda_Baixo', 'Pe_Esquerdo'];
const ASAS = ['Asa_Direita', 'Asa_Direita_Antebraco', 'Asa_Direita_Mao', 'Asa_Esquerda', 'Asa_Esquerda_Antebraco', 'Asa_Esquerda_Mao'];

const _cache = new Map();

export function clipLevantarMoto(clips, armada) {
  const nome = LEVANTAR_MOTO.NOME + (armada ? '' : '_SemArma');
  const doGlb = THREE.AnimationClip.findByName(clips, nome);
  if (doGlb) return doGlb;
  const chave = clips.length + ':' + nome;
  if (_cache.has(chave)) return _cache.get(chave);

  const C = (n) => {
    const c = THREE.AnimationClip.findByName(clips, n);
    if (!c) throw new Error('[levantar_moto] falta o clip ' + n + ' na cegonha');
    return c;
  };
  const pe = C(armada ? 'Cegonha_AK_Segurar' : 'Cegonha_Parado');
  const sentar = C('Cegonha_Sentar');
  const maos = C(armada ? 'Cegonha_Moto_Dirigindo' : 'Cegonha_Moto_Dirigindo_SemArma');
  const pulo = C(armada ? 'Cegonha_Moto_Entrar' : 'Cegonha_Moto_Entrar_SemArma');

  // valor de uma trilha ("Osso.propriedade") de um clip num instante
  const valor = (clip, nomeTrilha, t) => {
    const tr = clip.tracks.find((k) => k.name === nomeTrilha);
    if (!tr) return null;
    return Array.from(tr.createInterpolant().evaluate(Math.min(t, clip.duration)));
  };
  const osso = (nomeTrilha) => nomeTrilha.slice(0, nomeTrilha.lastIndexOf('.'));
  const dur = sentar.duration;

  // cada chave: [tempo, (osso) => [clip, instante], inclinação extra para a frente (graus) do tronco e do pescoço]
  const empe = () => [pe, 0];
  const naMoto = (b) => BRACOS.includes(b) || (armada && ARMA.includes(b));
  const chaves = [
    [0.0, () => empe(), 0, 0],
    // agachada e debruçada sobre a moto deitada, mãos no guidão
    [0.55, (b) => (naMoto(b) ? [maos, 0] : CORPO.includes(b) ? [sentar, dur * 0.66] : empe()), 22, 25],
    [0.8, (b) => (naMoto(b) ? [maos, 0] : CORPO.includes(b) ? [sentar, dur * 0.68] : empe()), 24, 25],
    // meio do caminho: pernas empurrando, asas abertas
    [1.45, (b) => (naMoto(b) ? [maos, 0] : CORPO.includes(b) ? [sentar, dur * 0.45]
      : ASAS.includes(b) ? [pulo, pulo.duration * 0.3] : empe()), 10, 8],
    // em pé, ainda segurando a moto
    [2.0, (b) => (naMoto(b) ? [maos, 0] : empe()), 0, 0],
    [2.5, () => empe(), 0, 0],
  ];
  // inclinar para a frente = girar mais no X local do osso (é o que o Sentar faz: -21° em pé -> -43° sentada)
  const _q = new THREE.Quaternion(), _qx = new THREE.Quaternion(), EIXO_X = new THREE.Vector3(1, 0, 0);
  const inclinar = (v, graus) => {
    if (!graus) return v;
    _q.fromArray(v).premultiply(_qx.setFromAxisAngle(EIXO_X, -THREE.MathUtils.degToRad(graus)));
    return _q.toArray();
  };

  const tempos = chaves.map(([t]) => t);
  const tracks = [];
  for (const base of pe.tracks) {
    const b = osso(base.name);
    const vals = [];
    const giro = base.name === 'Corpo.quaternion' ? 2 : base.name === 'Pescoco_1.quaternion' ? 3 : 0;
    for (const chave of chaves) {
      const [clip, instante] = chave[1](b);
      const v = valor(clip, base.name, instante) ?? valor(pe, base.name, 0);
      vals.push(...(giro ? inclinar(v, chave[giro]) : v));
    }
    const Tipo = base instanceof THREE.QuaternionKeyframeTrack ? THREE.QuaternionKeyframeTrack
      : base instanceof THREE.VectorKeyframeTrack ? THREE.VectorKeyframeTrack : base.constructor;
    tracks.push(new Tipo(base.name, tempos, vals));
  }
  const clip = new THREE.AnimationClip(nome, chaves[chaves.length - 1][0], tracks);
  _cache.set(chave, clip);
  return clip;
}
