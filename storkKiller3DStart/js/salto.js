// salto.js — o veículo (buggy ou moto) sai do chão em rampas, lombadas e bordas de buraco.
//
// No chão o veículo acompanha o terreno. A velocidade vertical do terreno embaixo dele é
// inclinação × velocidade; o corpo só consegue "descer junto" com a aceleração da gravidade.
// Quando o chão cai mais rápido que isso (lábio de rampa, topo de lombada a mil, borda de buraco),
// o veículo decola: voa em parábola, sem tração e sem direção (só um pouquinho de giro no ar),
// e pousa quando encontra o chão de novo. Pouso forte = pancada (som), perde velocidade e,
// na moto, pode derrubar.
//
// Estado no veículo: noAr, vy, yAr, tempoAr, pouso (m/s do último pouso — o jogo lê e zera),
// saltoMax (maior altura do salto atual acima do ponto de decolagem).

const G = 9.81;

export const SALTO = {
  LIMIAR: 0.9,          // m/s que o chão pode "fugir" do corpo antes de contar como decolagem
  VEL_MIN: 4.5,         // m/s: abaixo disso não decola (andando devagar ele só acompanha o chão)
  PERDA_POUSO: 0.03,    // fração da velocidade perdida por m/s de pancada acima de PANCADA_LEVE
  PANCADA_LEVE: 4.5,    // m/s: até aqui a suspensão engole o pouso sem perder velocidade
  PERDA_MAX: 0.35,
  INCL_MAX: 0.75,       // inclinação máxima do chão considerada (≈37°)
};

export function zerarSalto(v) {
  v.noAr = false;
  v.vy = 0;
  v.yAr = 0;
  v.tempoAr = 0;
  v.pouso = 0;
  v.saltoMax = 0;
  v._ySaida = 0;
}

// altura do chão no centro (média dos eixos) e velocidade vertical do chão sob o veículo
function chaoSob(v, base) {
  const sinY = Math.sin(v.rumo), cosY = Math.cos(v.rumo);
  const a = v.p.a, b = v.p.b;
  const hF = v.alturaChao(v.pos.x + sinY * a, v.pos.z + cosY * a);
  const hT = v.alturaChao(v.pos.x - sinY * b, v.pos.z - cosY * b);
  const yc = (hF + hT) / 2;
  const vh = Math.hypot(v.vel.x, v.vel.y);
  let vyC = 0;
  if (vh > 0.3) {
    const ux = v.vel.x / vh, uz = v.vel.y / vh;
    const h1 = v.alturaChao(v.pos.x + ux * base, v.pos.z + uz * base);
    const h0 = v.alturaChao(v.pos.x - ux * base, v.pos.z - uz * base);
    // paredes (borda de valeta, degrau) não viram "catapulta": a inclinação útil é limitada
    const incl = Math.max(-SALTO.INCL_MAX, Math.min(SALTO.INCL_MAX, (h1 - h0) / (2 * base)));
    vyC = incl * vh;
  }
  return { yc, vyC, vh };
}

/**
 * Um passo da física vertical (chamar depois de mover o veículo no plano).
 * base = meia distância (m) usada para medir a inclinação do chão (≈ meio entre-eixos).
 * aoPousar(impacto) é chamado no pouso (moto: decide se cai).
 */
export function passoVertical(v, dt, base, aoPousar = null) {
  if (v.noAr === undefined) zerarSalto(v);
  const { yc, vyC, vh } = chaoSob(v, base);
  if (v.noAr) {
    v.vy -= G * dt;
    v.yAr += v.vy * dt;
    v.tempoAr += dt;
    v.saltoMax = Math.max(v.saltoMax, v.yAr - v._ySaida);
    v.pos.y = v.yAr;
    if (v.yAr <= yc) {
      // pouso: a velocidade vertical contra o chão vira pancada
      const impacto = Math.max(0, vyC - v.vy);
      v.noAr = false;
      v.pouso = Math.max(v.pouso ?? 0, impacto);
      const perda = Math.min(SALTO.PERDA_MAX, Math.max(0, impacto - SALTO.PANCADA_LEVE) * SALTO.PERDA_POUSO);
      if (perda > 0) { v.vel.x *= 1 - perda; v.vel.y *= 1 - perda; }
      if (impacto > 3) v.batida = Math.max(v.batida ?? 0, impacto * 0.55);
      if (v._susp) { v._susp.y.x = yc; v._susp.y.v = Math.max(-4, v.vy * 0.35); }
      v.vy = vyC;
      v.pos.y = yc;
      aoPousar?.(impacto);
    }
    return;
  }
  // no chão: o corpo não desce mais rápido que a gravidade deixa
  const vB = Math.max(vyC, v.vy - G * dt);
  if (vB - vyC > SALTO.LIMIAR && vh > SALTO.VEL_MIN) {
    v.noAr = true;
    v.tempoAr = 0;
    v.vy = vB;
    v.yAr = yc;
    v._ySaida = yc;
    v.saltoMax = 0;
    return;
  }
  v.vy = vB;
}

// Visual no ar: a altura é a da física; o bico acompanha a trajetória devagar.
export function alvoArfagemNoAr(v) {
  const vh = Math.hypot(v.vel.x, v.vel.y);
  return Math.max(-0.45, Math.min(0.45, -Math.atan2(v.vy, Math.max(vh, 2)) * 0.55));
}
