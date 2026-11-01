// bicada_cegonha.js — animações de BICADA da cegonha (sem a arma), no chão e no voo.  three.js r150+
//
//   import { clipsBicada, BICADA } from './bicada_cegonha.js';
//   const clips = clipsBicada(raizDoEsqueleto, clipsDaCegonha);   // [Cegonha_Bicada_Chao, Cegonha_Bicada_Ar]
//
// Cegonha_Bicada_Chao — no chão: recolhe o pescoço (preparo), estica o pescoço para a frente numa bicada rápida
//   (o tronco vai junto, os pés ficam plantados) e volta para a pose de parada.
// Cegonha_Bicada_Ar — no voo: bate as asas com força, recolhe as asas para trás e segue como uma flecha com o
//   pescoço esticado (é nesse trecho que o jogo acelera), recolhe o pescoço e finaliza com a bicada reta para a
//   frente; termina abrindo as asas na pose do Cegonha_Voo (emenda sem salto no voo).
//
// As poses saem dos clips que já existem no rig (Cegonha_Parado, Cegonha_Voo) mais ajustes calculados no próprio
// esqueleto: cada osso do pescoço/cabeça é girado até apontar para uma direção (frente = +Z, cima = +Y) e o tronco
// inclina em volta da raiz das pernas. Assim continuam valendo se o .glb for trocado. Os dois clips também estão
// gravados no stork_with_ak_carro.glb (o jogo usa os do .glb quando existem; senão monta estes na hora).

import * as THREE from 'three';

export const BICADA = {
  CHAO: {
    NOME: 'Cegonha_Bicada_Chao',
    GOLPE: [0.2, 0.42],         // s do clip em que o bico pode acertar
  },
  AR: {
    NOME: 'Cegonha_Bicada_Ar',
    IMPULSO: [0.14, 0.74],      // s do clip em que o jogo acelera a cegonha para a frente
    ENGATE: 0.6,                // s em que ela recolhe o pescoço para a bicada final (o jogo pula para cá
                                // quando o urubu chega ao alcance no meio da "flecha")
    GOLPE: [0.7, 0.96],         // s da bicada final, em que o bico pode acertar
  },
  BICO: 0.31,                   // metros do osso Cabeca até a ponta do bico (ao longo do +Y da cabeça; medido na malha)
};

const FPS = 30;                 // amostras por segundo gravadas no clip
const PERNAS = ['Perna_Esquerda', 'Perna_Esquerda_Baixo', 'Pe_Esquerdo', 'Perna_Direita', 'Perna_Direita_Baixo', 'Pe_Direito'];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const EIXO_X = new THREE.Vector3(1, 0, 0);
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Copia só os ossos (sem malhas) para fazer as contas sem mexer no modelo da cena
function esqueletoLeve(o) {
  const c = new THREE.Object3D();
  c.name = o.name;
  c.position.copy(o.position);
  c.quaternion.copy(o.quaternion);
  c.scale.copy(o.scale);
  for (const f of o.children) if (!f.isMesh && !f.isSkinnedMesh) c.add(esqueletoLeve(f));
  return c;
}

export function clipsBicada(raizOriginal, clips) {
  const raiz = esqueletoLeve(raizOriginal);
  const osso = (n) => raiz.getObjectByName(n);
  const C = (n) => {
    const c = THREE.AnimationClip.findByName(clips, n);
    if (!c) throw new Error('[bicada] falta o clip ' + n + ' na cegonha');
    return c;
  };
  const parado = C('Cegonha_Parado');
  const voo = C('Cegonha_Voo');
  const trilhas = parado.tracks.map((t) => t.name);

  // ---------------------------------------------------------------- operações de pose (no esqueleto leve)
  function pose(clip, t) {
    for (const tr of clip.tracks) {
      const ponto = tr.name.lastIndexOf('.');
      const o = osso(tr.name.slice(0, ponto));
      if (!o) continue;
      const v = tr.createInterpolant().evaluate(Math.min(t, clip.duration));
      const prop = tr.name.slice(ponto + 1);
      if (prop === 'quaternion') o.quaternion.fromArray(v);
      else o[prop].fromArray(v);
    }
    raiz.updateMatrixWorld(true);
  }
  const qMundo = (o) => o.getWorldQuaternion(new THREE.Quaternion());
  const definirMundo = (o, q) => {
    o.parent.updateWorldMatrix(true, false);
    o.quaternion.copy(o.parent.getWorldQuaternion(_q2).invert().multiply(q));
    o.updateMatrixWorld(true);
  };
  // gira o osso (giro mínimo) até o eixo +Y dele apontar para d (direção no referencial da cegonha)
  function apontar(nome, d) {
    const o = osso(nome);
    o.updateWorldMatrix(true, false);
    const q = qMundo(o);
    _v.set(0, 1, 0).applyQuaternion(q);
    _q.setFromUnitVectors(_v, d);
    definirMundo(o, _q.multiply(q));
  }
  // inclina o tronco para a frente (graus > 0) em volta da raiz das pernas: os pés não saem do lugar
  function inclinarTronco(graus) {
    const corpo = osso('Corpo'), base = osso('Raiz');
    const pernas = PERNAS.map((n) => [osso(n), qMundo(osso(n))]);
    const raizPernas = () => osso('Perna_Esquerda').getWorldPosition(new THREE.Vector3())
      .add(osso('Perna_Direita').getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const antes = raizPernas();
    definirMundo(corpo, _q.setFromAxisAngle(EIXO_X, THREE.MathUtils.degToRad(graus)).multiply(qMundo(corpo)));
    const depois = raizPernas();
    base.position.sub(depois.sub(antes));
    raiz.updateMatrixWorld(true);
    for (const [o, q] of pernas) definirMundo(o, q);
  }
  // asas varridas para trás, rentes ao corpo (aberta = 0) até quase abertas, freando (aberta = 1)
  function varrerAsas(aberta) {
    const L = (a, b) => a + (b - a) * aberta;
    for (const [lado, s] of [['Esquerda', 1], ['Direita', -1]]) {
      apontar('Asa_' + lado, dir(s * L(0.72, 0.95), L(0.08, 0.14), L(-0.69, -0.28)));
      apontar('Asa_' + lado + '_Antebraco', dir(s * L(0.3, 0.8), 0.02, L(-0.95, -0.6)));
      apontar('Asa_' + lado + '_Mao', dir(s * L(0.1, 0.55), 0, L(-0.99, -0.83)));
    }
  }
  // a pose atual vira uma chave: valores de todas as trilhas
  const chave = () => trilhas.map((nome) => {
    const ponto = nome.lastIndexOf('.');
    const o = osso(nome.slice(0, ponto));
    const prop = nome.slice(ponto + 1);
    return o[prop].toArray();
  });

  // ---------------------------------------------------------------- chão
  const chao = [];
  pose(parado, 0);
  chao.push({ t: 0, pose: chave() });
  // preparo: tronco um pouco para trás, pescoço recolhido para trás em "S", bico apontado para a frente
  pose(parado, 0);
  inclinarTronco(-8);
  apontar('Pescoco_1', dir(0, 1, -0.55));
  apontar('Pescoco_2', dir(0, 0.9, 0.3));
  apontar('Cabeca', dir(0, -0.12, 1));
  chao.push({ t: 0.17, pose: chave(), curva: 'suave' });
  // bicada: tronco para a frente, pescoço e bico esticados para a frente, na altura do peito (pega tanto o
  // urubu no chão quanto o que paira na frente dela)
  pose(parado, 0);
  inclinarTronco(12);
  apontar('Pescoco_1', dir(0, 0.12, 1));
  apontar('Pescoco_2', dir(0, 0.04, 1));
  apontar('Cabeca', dir(0, -0.06, 1));
  chao.push({ t: 0.27, pose: chave(), curva: 'golpe' });
  pose(parado, 0);
  inclinarTronco(15);
  apontar('Pescoco_1', dir(0, 0.08, 1));
  apontar('Pescoco_2', dir(0, 0, 1));
  apontar('Cabeca', dir(0, -0.08, 1));
  chao.push({ t: 0.37, pose: chave(), curva: 'suave' });
  pose(parado, 0);
  chao.push({ t: 0.72, pose: chave(), curva: 'suave' });

  // ---------------------------------------------------------------- voo
  const ar = [];
  pose(voo, 0);
  ar.push({ t: 0, pose: chave() });
  // asas lá em cima e pescoço um pouco recolhido: vai dar a batida forte
  pose(voo, 0.375);
  apontar('Pescoco_1', dir(0, 0.75, 0.66));
  ar.push({ t: 0.1, pose: chave(), curva: 'suave' });
  // batida forte para baixo (é o arranque)
  pose(voo, 0.875);
  apontar('Pescoco_1', dir(0, 0.5, 0.87));
  ar.push({ t: 0.22, pose: chave(), curva: 'golpe' });
  // flecha: asas varridas para trás, pescoço e bico retos para a frente
  const flecha = (aberta, pescoco1, pescoco2, cabeca) => {
    pose(voo, 0);
    varrerAsas(aberta);
    apontar('Pescoco_1', pescoco1);
    apontar('Pescoco_2', pescoco2);
    apontar('Cabeca', cabeca);
  };
  flecha(0.05, dir(0, 0.06, 1), dir(0, 0.06, 1), dir(0, 0.02, 1));
  ar.push({ t: 0.36, pose: chave(), curva: 'suave' });
  flecha(0, dir(0, 0.04, 1), dir(0, 0.04, 1), dir(0, 0, 1));
  ar.push({ t: 0.58, pose: chave(), curva: 'suave' });
  // recolhe o pescoço em "S" (engatilha a bicada)
  flecha(0.1, dir(0, 0.9, 0.44), dir(0, 0.15, 1), dir(0, 0.02, 1));
  osso('Raiz').position.z -= 0.06;
  ar.push({ t: 0.68, pose: chave(), curva: 'suave' });
  // bicada reta para a frente: o corpo inteiro vai junto e as asas começam a abrir (freio)
  flecha(0.45, dir(0, -0.02, 1), dir(0, -0.02, 1), dir(0, -0.03, 1));
  osso('Raiz').position.z += 0.16;
  ar.push({ t: 0.78, pose: chave(), curva: 'golpe' });
  flecha(0.6, dir(0, -0.03, 1), dir(0, -0.03, 1), dir(0, -0.04, 1));
  osso('Raiz').position.z += 0.18;
  ar.push({ t: 0.88, pose: chave(), curva: 'suave' });
  // abre as asas e volta para o voo
  pose(voo, 0);
  ar.push({ t: 1.15, pose: chave(), curva: 'suave' });

  return [montarClip(BICADA.CHAO.NOME, chao, parado), montarClip(BICADA.AR.NOME, ar, parado)];
}

// curvas de cada trecho: 'suave' = acelera e freia | 'golpe' = sai rápido e freia no fim
const CURVAS = {
  suave: (u) => u * u * (3 - 2 * u),
  golpe: (u) => 1 - (1 - u) ** 3,
};

// Amostra as chaves a FPS fixo com as curvas e monta o AnimationClip (posição/escala lineares, rotação slerp)
function montarClip(nome, chaves, modelo) {
  const dur = chaves[chaves.length - 1].t;
  const tempos = [];
  for (let i = 0; i <= Math.round(dur * FPS); i++) tempos.push(Math.min(dur, i / FPS));
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const tracks = modelo.tracks.map((base, k) => {
    const quat = base.name.endsWith('.quaternion');
    const vals = [];
    for (const t of tempos) {
      let i = 0;
      while (i < chaves.length - 2 && t > chaves[i + 1].t) i++;
      const a = chaves[i], b = chaves[i + 1];
      const u = CURVAS[b.curva ?? 'suave'](THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1));
      const va = a.pose[k], vb = b.pose[k];
      if (quat) vals.push(...q1.fromArray(va).slerp(q2.fromArray(vb), u).toArray());
      else vals.push(...va.map((x, j) => x + (vb[j] - x) * u));
    }
    const Tipo = quat ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    return new Tipo(base.name, tempos, vals);
  });
  return new THREE.AnimationClip(nome, dur, tracks);
}
