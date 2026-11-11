import { PITCH } from './config.js';

// elevação mais baixa (seno) amostrada na tabela de aparência do gramado
export const TABLE_Y0 = 0.105;

const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

// ---------------------------------------------------------------------------
// Trechos GLSL compartilhados
// ---------------------------------------------------------------------------

const constants = /* glsl */ `
#define HALF_L ${f(PITCH.length / 2)}
#define HALF_W ${f(PITCH.width / 2)}
#define LINE_W ${f(PITCH.line)}
#define MARGIN ${f(PITCH.margin)}
#define CIRCLE_R ${f(PITCH.circleR)}
#define PEN_D ${f(PITCH.penaltyDepth)}
#define PEN_HW ${f(PITCH.penaltyHalfW)}
#define GOAL_D ${f(PITCH.goalAreaDepth)}
#define GOAL_HW ${f(PITCH.goalAreaHalfW)}
#define PEN_MARK ${f(PITCH.penaltyMark)}
#define MARK_R ${f(PITCH.markR)}
#define CENTER_MARK_R ${f(PITCH.centerMarkR)}
#define CORNER_R ${f(PITCH.cornerR)}
`;

const hash = /* glsl */ `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
// três números pseudoaleatórios em [0,1) para uma célula inteira da grade
vec3 hash3(vec2 cell, float seed) {
  ivec2 c = ivec2(floor(cell + 0.5)) + 1048576;
  uvec3 h = pcg3d(uvec3(uint(c.x), uint(c.y), uint(seed)));
  return vec3(h >> 8u) * (1.0 / 16777216.0);
}
`;

// Marcações do campo como cobertura analítica (0..1). `w` é o tamanho, em metros,
// da área amostrada (pixel ou lâmina), o que dá linhas nítidas e sem serrilhado
// a qualquer distância. As linhas pertencem às áreas que delimitam, então todas
// as medidas vão até a borda externa da linha.
const lines = /* glsl */ `
float sdBox(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float bandCov(float d, float hw, float w) {
  return clamp((min(d + 0.5 * w, hw) - max(d - 0.5 * w, -hw)) / w, 0.0, 1.0);
}
float frameCov(float sd, float w) {
  return bandCov(sd + 0.5 * LINE_W, 0.5 * LINE_W, w);
}
float discCov(float d, float r, float w) {
  return clamp((r - d) / w + 0.5, 0.0, 1.0);
}
float pitchLines(vec2 p, float w) {
  vec2 q = abs(p);
  float m = 0.0;
  // linhas laterais e de fundo
  m = max(m, frameCov(sdBox(p, vec2(0.0), vec2(HALF_L, HALF_W)), w));
  // linha do meio de campo
  m = max(m, bandCov(p.x, 0.5 * LINE_W, w) * step(q.y, HALF_W));
  // círculo central e marca central
  float r = length(p);
  m = max(m, bandCov(r - (CIRCLE_R - 0.5 * LINE_W), 0.5 * LINE_W, w));
  m = max(m, discCov(r, CENTER_MARK_R, w));
  // grande área e pequena área (espelhadas)
  m = max(m, frameCov(sdBox(q, vec2(HALF_L - 0.5 * PEN_D, 0.0), vec2(0.5 * PEN_D, PEN_HW)), w));
  m = max(m, frameCov(sdBox(q, vec2(HALF_L - 0.5 * GOAL_D, 0.0), vec2(0.5 * GOAL_D, GOAL_HW)), w));
  // marca do pênalti e meia-lua
  float rp = length(q - vec2(HALF_L - PEN_MARK, 0.0));
  m = max(m, discCov(rp, MARK_R, w));
  float arc = bandCov(rp - (CIRCLE_R - 0.5 * LINE_W), 0.5 * LINE_W, w);
  arc *= clamp((HALF_L - PEN_D + LINE_W - q.x) / w + 0.5, 0.0, 1.0);
  m = max(m, arc);
  // quartos de círculo dos escanteios
  float rc = length(q - vec2(HALF_L, HALF_W));
  float inside = step(q.x, HALF_L) * step(q.y, HALF_W);
  m = max(m, bandCov(rc - (CORNER_R - 0.5 * LINE_W), 0.5 * LINE_W, w) * inside);
  return m;
}
`;

// Padrão de corte: o cortador/rolo deita as lâminas no sentido em que passa.
// Devolve o vetor de inclinação (em XZ) da faixa onde o ponto está; o sinal
// alterna de faixa para faixa. É essa inclinação que cria as faixas claras e
// escuras: lâminas deitadas para longe de quem olha refletem mais luz.
const mow = /* glsl */ `
uniform int uPattern;
uniform float uStripeK;
uniform vec3 uSunDir;

float stripeX(float x, float w) {
  float a = HALF_L - abs(x);
  float i; float fr; float bw;
  if (a < PEN_D) { bw = PEN_D / 3.0; i = floor(a / bw); fr = a - i * bw; }
  else { bw = (HALF_L - PEN_D) / 6.0; float t = a - PEN_D; float j = floor(t / bw); i = 3.0 + j; fr = t - j * bw; }
  float gi = x < 0.0 ? i : 17.0 - i;
  float s = mod(gi, 2.0) < 0.5 ? 1.0 : -1.0;
  float d = min(fr, bw - fr);
  return s * clamp(2.0 * d / max(w, 1e-5), 0.0, 1.0);
}
float stripeZ(float z, float w) {
  float bw = 2.0 * HALF_W / 12.0;
  float t = (z + HALF_W) / bw;
  float i = floor(t);
  float fr = (t - i) * bw;
  float s = mod(i, 2.0) < 0.5 ? 1.0 : -1.0;
  float d = min(fr, bw - fr);
  return s * clamp(2.0 * d / max(w, 1e-5), 0.0, 1.0);
}
vec2 mowLean(vec2 p, float w) {
  if (uPattern == 0) return vec2(0.0, stripeX(p.x, w));
  if (uPattern == 1) return vec2(0.0, stripeX(p.x, w) * stripeZ(p.y, w));
  if (uPattern == 2) return vec2(stripeZ(p.y, w), 0.0);
  return vec2(0.0);
}
float mowTone(vec3 V, vec2 lean) {
  return 1.0 + uStripeK * (dot(-V.xz, lean) + 0.45 * dot(-uSunDir.xz, lean));
}
`;

// Anéis de nível de detalhe ao redor da câmera.
const rings = /* glsl */ `
uniform vec2 uRC[4];
uniform float uRR[4];
uniform float uRG[4];
float ringOut(int k, vec2 p) {
  vec2 d = abs(p - uRC[k]) / uRR[k];
  return (1.0 - smoothstep(0.68, 0.97, max(d.x, d.y))) * uRG[k];
}
float ringPresence(int k, vec2 p) {
  float o = ringOut(k, p);
  if (k > 0) o *= 1.0 - ringOut(k - 1, p);
  return o;
}
`;


// Aparência média do tapete visto da direção V, medida das próprias lâminas
// (tabela de 16 azimutes × 8 elevações por variante de faixa).
const table = /* glsl */ `
#define TABLE_Y0 ${f(TABLE_Y0)}
uniform sampler2D uTable;
vec3 tableLook(vec3 V, float variant) {
  float u = atan(V.z, abs(V.x) < 1e-6 ? 1e-6 : V.x) / 6.2831853 + 0.5 / 16.0;
  float j = 7.0 * sqrt(clamp((V.y - TABLE_Y0) / (1.0 - TABLE_Y0), 0.0, 1.0));
  return textureLod(uTable, vec2(u, (variant * 8.0 + j + 0.5) / 16.0), 6.0).rgb;
}
`;

const haze = /* glsl */ `
uniform vec3 uHorizon[4];
uniform float uHazeK;
vec3 applyHaze(vec3 col, vec3 toCam, float dist) {
  vec2 d = -toCam.xz / max(length(toCam.xz), 1e-4);
  vec4 wgt = vec4(max(d.x, 0.0), max(d.y, 0.0), max(-d.x, 0.0), max(-d.y, 0.0));
  wgt = wgt * wgt + 1e-4; // nunca zera, mesmo olhando exatamente para baixo
  vec3 hz = (uHorizon[0] * wgt.x + uHorizon[1] * wgt.y + uHorizon[2] * wgt.z + uHorizon[3] * wgt.w) / (wgt.x + wgt.y + wgt.z + wgt.w);
  float x = dist * uHazeK;
  return mix(col, hz, 1.0 - exp(-x * sqrt(x)));
}
`;

// ---------------------------------------------------------------------------
// Lâminas de grama
// ---------------------------------------------------------------------------
// Não há atributos por instância: cada lâmina calcula a própria posição, forma
// e cor a partir do índice da instância e da célula do mundo em que cai. Assim
// o gramado fica fixo no mundo enquanto a grade acompanha a câmera.

export const bladeVert = /* glsl */ `
precision highp float;
precision highp int;
${constants}
${hash}
${lines}
${mow}
${rings}
#ifndef BAKE
${table}
uniform sampler2D uNoise;
uniform float uMeanMix;
#endif

uniform int uGridN;
uniform float uCell;
uniform vec2 uCenterCell;
uniform int uRing;
uniform bool uSwap;
uniform bool uFlip;
uniform float uBladeW;
uniform float uCutH;
uniform float uLeanMow;
uniform float uLeanRand;
uniform float uTime;
uniform float uWind;
uniform float uPxScale;
uniform float uShowLines;
#ifdef BAKE
uniform vec2 uBakeLean;
uniform float uBakeP;
uniform float uBakePad;
uniform float uTile;
uniform vec3 uBakeV;
#endif

out vec2 vUT;
out vec3 vN;
out vec3 vS;
out vec3 vWorld;
out vec4 vRnd;
out float vPaint;
out float vTone;
out vec3 vMean;

void main() {
  int a = gl_InstanceID % uGridN;
  int b = gl_InstanceID / uGridN;
#ifdef BAKE
  vec2 cell = vec2(float(a), float(b)) - uBakePad;
  vec2 hcell = mod(cell, uBakeP);
#else
  // desenha primeiro as fileiras mais próximas da câmera (aproveita o teste de profundidade)
  if (uFlip) b = uGridN - 1 - b;
  vec2 ij = uSwap ? vec2(float(b), float(a)) : vec2(float(a), float(b));
  vec2 cell = uCenterCell + ij - float(uGridN / 2);
  vec2 hcell = cell;
#endif
  float seed = float(uRing) * 101.0;
  vec3 r1 = hash3(hcell, 11.0 + seed);
  vec3 r2 = hash3(hcell, 23.0 + seed);
  vec3 r3 = hash3(hcell, 37.0 + seed);
  vec3 r4 = hash3(hcell, 51.0 + seed);

  vec2 root = (cell + r1.xy) * uCell;
  vec3 rootW = vec3(root.x, 0.0, root.y);

  float scale = 1.0;
  float paint = 0.0;
  float tone = 1.0;
  vec2 mowV;
#ifdef BAKE
  mowV = uBakeLean;
  vMean = vec3(0.0);
#else
  scale = smoothstep(r1.z * 0.75, r1.z * 0.75 + 0.25, ringPresence(uRing, root));
  vec2 ar = abs(root);
  if (ar.x > HALF_L + MARGIN || ar.y > HALF_W + MARGIN) scale = 0.0;
  if (scale <= 0.002) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float nz = textureLod(uNoise, root * 0.12, 0.0).b;
  mowV = mowLean(root, 0.03 + 0.05 * nz);
  // tinta das linhas: aplicada lâmina a lâmina, com borda levemente irregular
  paint = uShowLines * pitchLines(root + (nz - 0.5) * 0.014, 0.012) * step(r3.z, 0.94);
  vec3 toCam = cameraPosition - rootW;
  float dist = length(toCam);
  vec3 Vr = toCam / dist;
  tone = mowTone(Vr, mowV);
  // mesma variação suave de vigor usada no solo
  tone *= 1.0 + (textureLod(uNoise, root / 700.0, 0.0).r - 0.5) * 0.07 + (textureLod(uNoise, root / 130.0, 0.0).g - 0.5) * 0.05;
  // nos anéis distantes a cor da lâmina converge para a aparência média do tapete
  vMean = vec3(0.0);
  if (uMeanMix > 0.0) {
    float sv = uPattern == 2 ? mowV.x : mowV.y;
    vMean = mix(tableLook(Vr, 0.0), tableLook(Vr, 1.0), sv * 0.5 + 0.5);
  }
#endif

  // inclinação: sentido do corte + espalhamento aleatório
  float ang = r2.x * 6.2831853;
  vec2 rdir = vec2(cos(ang), sin(ang));
  vec2 leanV = mowV * uLeanMow * (0.55 + 0.9 * r2.y) + rdir * uLeanRand * r2.z;
  float L = length(leanV);
  vec2 dl = L > 1e-4 ? leanV / L : rdir;
  L = min(L, 1.35);

  float H = uCutH * mix(0.6, 1.0, sqrt(r3.x)) * scale;
  float W = uBladeW * mix(0.72, 1.22, r3.y);
#ifndef BAKE
  W = max(W, dist * uPxScale);
#endif

  // eixo da lâmina: Bézier quadrática no plano vertical que contém a inclinação
  float t = position.y;
  float omt = 1.0 - t;
  vec2 P1 = vec2(L * H * 0.2, H * 0.72);
  vec2 P2 = vec2(L * H, H * (1.0 - 0.16 * L));
  vec2 B = 2.0 * omt * t * P1 + t * t * P2;
  vec2 dB = 2.0 * omt * P1 + 2.0 * t * (P2 - P1);

  // a folha dobra em torno do eixo da largura, que fica quase perpendicular à inclinação
  float tw = (r4.x - 0.5) * 1.5;
  vec2 pd = vec2(-dl.y, dl.x);
  vec2 s2 = pd * cos(tw) + dl * sin(tw);
  vec3 S = vec3(s2.x, 0.0, s2.y);
  vec3 D = vec3(dl.x, 0.0, dl.y);

  // perfil da largura: base mais fina; ponta cortada reta (grama aparada) ou pontuda (folha nova)
  float isCut = step(r4.y, 0.68);
  float tipW = mix(0.04, mix(0.3, 0.58, r4.z), isCut);
  float prof = mix(0.7, 1.0, smoothstep(0.0, 0.3, t)) * mix(1.0, tipW, smoothstep(0.42, 1.0, t));

  vec3 pos = rootW + D * B.x + vec3(0.0, B.y, 0.0) + S * (position.x * W * prof);
  // o corte raramente é perpendicular à folha: um lado da ponta fica mais alto
  vec3 T = normalize(D * dB.x + vec3(0.0, dB.y, 0.0));
  pos += T * (position.x * (r3.z - 0.5) * 1.6 * W * tipW * isCut * step(0.999, t));

#ifndef BAKE
  // brisa leve: a grama aparada quase não se mexe, só a ponta oscila
  float ph = uTime * 1.6 + root.x * 0.85 + root.y * 1.25;
  float sway = (sin(ph) * 0.6 + sin(ph * 2.3 + r4.x * 6.2831853) * 0.4) * uWind * 0.0032;
  pos.xz += vec2(0.8, 0.6) * (sway * t * t * scale);
#endif

  vN = normalize(cross(S, T));
  vS = S;
  vUT = vec2(position.x + 0.5, t);
  vWorld = pos;
  vRnd = vec4(r4.x, r3.x, r4.y, r2.x);
  vPaint = paint;
  vTone = tone;

#ifdef BAKE
  // vista ortográfica na direção uBakeV, projetada sobre um ladrilho de uTile × uTile
  // metros do solo (de cima quando uBakeV aponta para o alto)
  vec2 gp = pos.xz - uBakeV.xz * (pos.y / uBakeV.y);
  float dz = dot(pos - vec3(0.5 * uTile, 0.0, 0.5 * uTile), uBakeV);
  gl_Position = vec4(gp / uTile * 2.0 - 1.0, -dz * 0.5, 1.0);
#else
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
#endif
}
`;

export const bladeFrag = /* glsl */ `
precision highp float;
precision highp int;

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform vec3 uColRoot;
uniform vec3 uColMid;
uniform vec3 uColTip;
uniform vec3 uColDry;
uniform vec3 uColPaint;
uniform float uAoBase;
uniform float uShadowK;
uniform float uCutH;
uniform float uDepthScale;
uniform vec3 uSunA;
uniform vec3 uSunB;
uniform sampler2D uNoise;
#ifdef BAKE
uniform vec3 uBakeV;
#endif
${haze}

in vec2 vUT;
in vec3 vN;
in vec3 vS;
in vec3 vWorld;
in vec4 vRnd;
in float vPaint;
in float vTone;
in vec3 vMean;
#ifndef BAKE
uniform float uMeanMix;
uniform float uPaintGain;
#endif

void main() {
  float u = vUT.x;
  float t = vUT.y;
#ifdef BAKE
  vec3 V = uBakeV;
#else
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
#endif

  // a face de cima da folha é levemente em canaleta; por baixo fica a quilha
  vec3 N = normalize(vN);
  vec3 S = normalize(vS);
  float fd = 1.0 - smoothstep(0.02, 0.1, fwidth(u));
  float veinPhase = u * 6.2831853 * 7.0;
  N = normalize(N + S * ((0.5 - u) * 0.85 + sin(veinPhase) * 0.16 * fd));
  float upper = step(0.0, dot(N, V));
  N *= upper * 2.0 - 1.0;

  // Nos anéis distantes há menos lâminas (e mais largas) do que no tapete real, e por
  // isso se enxergaria mais fundo entre elas. uDepthScale compensa: trata cada lâmina
  // como se só a parte de cima do tapete estivesse à vista.
  float tc = 1.0 - (1.0 - t) * uDepthScale;

  // cor: base amarelada, meio verde intenso, ponta mais clara
  vec3 alb = mix(uColRoot, uColMid, smoothstep(0.0, 0.42, tc));
  alb = mix(alb, uColTip, smoothstep(0.4, 1.0, tc) * 0.85);
  alb *= mix(0.8, 1.18, vRnd.x);
  alb = mix(alb, alb * vec3(1.22, 1.06, 0.7), smoothstep(0.62, 1.0, vRnd.w) * 0.5);

  // detalhes que só aparecem de perto: nervuras, nervura central e ponta ressecada pelo corte
  float veins = 0.5 + 0.5 * cos(veinPhase);
  alb *= 1.0 - 0.13 * veins * fd;
  float rib = 1.0 - smoothstep(0.0, 0.085, abs(u - 0.5));
  alb *= 1.0 - 0.22 * rib * fd * upper;
  alb *= mix(1.1, 1.0, upper);
  float fdt = 1.0 - smoothstep(0.02, 0.08, fwidth(t));
  float cut = step(vRnd.z, 0.68);
  alb = mix(alb, uColDry, cut * smoothstep(0.962, 0.996, t) * 0.55 * fdt);

  // tinta das linhas: pulverizada de cima, pega mais na metade superior da lâmina
  float pk = vPaint * smoothstep(0.1, 0.48, t) * (0.82 + 0.18 * vRnd.x);
  alb = mix(alb, uColPaint, pk);

  // profundidade dentro do tapete: 0 no topo (altura do corte), 1 junto ao solo
  float depth = clamp((uCutH - vWorld.y) / uCutH, 0.0, 1.0) * uDepthScale;
  // céu: quanto mais fundo, menos céu se vê
  float ao = mix(1.0, uAoBase, pow(max(depth, 1e-4), 0.8));
  // sol: as lâminas vizinhas fazem sombra umas nas outras. O ruído é projetado ao
  // longo da direção do sol, então as manchas de sombra descem coerentes pelas folhas.
  float pLit = exp(-uShadowK * depth);
  float sn = texture(uNoise, vec2(dot(vWorld, uSunA), dot(vWorld, uSunB)) / 0.16).a;
  float sunVis = smoothstep(sn - 0.09, sn + 0.09, pLit * 1.1);
  float ndl = dot(N, uSunDir);
  float front = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
  float back = clamp((-ndl + 0.1) / 1.1, 0.0, 1.0);
  vec3 trans = alb * vec3(1.0, 1.12, 0.45) * (1.0 - pk);
  vec3 col = uSunColor * sunVis * (alb * front + trans * back * 0.85);
  col += alb * ao * mix(uBounceColor, uSkyColor, N.y * 0.5 + 0.5);

  vec3 Hh = normalize(uSunDir + V);
  float ndh = max(dot(N, Hh), 1e-4);
  float fres = 0.04 + 0.96 * pow(clamp(1.0 - dot(V, Hh), 1e-4, 1.0), 5.0);
  float gloss = mix(46.0, 26.0, upper);
  float spec = pow(ndh, gloss) * (gloss + 2.0) * 0.125 * fres * step(0.0, ndl);
  col += uSunColor * spec * sunVis * mix(0.55, 0.35, upper);
#ifndef BAKE
  if (uMeanMix > 0.0) {
    vec3 mean = vMean;
    float lum = dot(mean, vec3(0.2126, 0.7152, 0.0722));
    mean = mix(mean, uColPaint * (lum * uPaintGain), vPaint * 0.93);
    mean *= mix(0.82, 1.18, vRnd.x) * mix(0.72, 1.1, t);
    col = mix(col, mean, uMeanMix);
  }
  col *= vTone;
  col = applyHaze(col, toCam, dist);
#endif

  gl_FragColor = vec4(col, 1.0);
#ifndef BAKE
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif
}
`;

// ---------------------------------------------------------------------------
// Solo do gramado
// ---------------------------------------------------------------------------
// Usa uma textura gerada a partir das próprias lâminas vistas de cima (já
// iluminadas pelo sol atual). Longe da câmera ela É o gramado; perto, fica
// escurecida sob as lâminas 3D, como a camada de baixo da grama.

export const groundVert = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const groundFrag = /* glsl */ `
precision highp float;
precision highp int;
${constants}
${lines}
${mow}
${rings}
${haze}
${table}

uniform sampler2D uBakeA;
uniform sampler2D uBakeB;
uniform sampler2D uNoise;
uniform float uTile;
uniform float uRU[4];
uniform float uPaintGain;
uniform float uShowLines;
uniform vec3 uColPaint;

in vec3 vWorld;

void main() {
  vec2 p = vWorld.xz;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float fw = max(max(fwidth(p.x), fwidth(p.y)), 1e-4);

  vec2 lean = mowLean(p, fw);
  float s = uPattern == 2 ? lean.x : lean.y;

  // cor média vista deste ângulo × detalhe visto de cima (o detalhe some em ângulo rasante)
  vec3 topA = textureLod(uTable, vec2(0.5 / 16.0, 7.5 / 16.0), 6.0).rgb;
  vec3 topB = textureLod(uTable, vec2(0.5 / 16.0, 15.5 / 16.0), 6.0).rgb;
  float kd = 1.0 - smoothstep(0.12, 0.7, V.y);
  vec2 uv = p / uTile;
  vec3 dA = mix(texture(uBakeA, uv).rgb / max(topA, vec3(1e-4)), vec3(1.0), kd);
  vec3 dB = mix(texture(uBakeB, uv).rgb / max(topB, vec3(1e-4)), vec3(1.0), kd);
  vec3 g = mix(tableLook(V, 0.0) * dA, tableLook(V, 1.0) * dB, s * 0.5 + 0.5);

  // variação suave de vigor em escala de metros (o gramado nunca é 100% uniforme)
  float n1 = texture(uNoise, p / 700.0).r;
  float n2 = texture(uNoise, p / 130.0).g;
  g *= 1.0 + (n1 - 0.5) * 0.07 + (n2 - 0.5) * 0.05;

  // sob as lâminas 3D o solo vira a camada de baixo da grama, mais escura
  float under = 1.0;
  float pres = 0.0;
  for (int k = 0; k < 4; k++) {
    float pk = ringPresence(k, p);
    under += pk * (uRU[k] - 1.0);
    pres += pk;
  }
  vec3 col = g * under;

  // linhas pintadas
  vec2 wob = (texture(uNoise, p * 0.9).rg - 0.5) * 0.014;
  float m = uShowLines * pitchLines(p + wob, fw);
  float lum = dot(g, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, uColPaint * (lum * uPaintGain * under), m * 0.93);

  // grão fino do solo, visível só em macro
  float nearK = clamp(pres, 0.0, 1.0) * (1.0 - smoothstep(0.25, 1.6, dist));
  col *= 1.0 + (texture(uNoise, p / 0.4).b - 0.5) * 0.5 * nearK;

  col *= mowTone(V, lean);
  col = applyHaze(col, toCam, dist);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// ---------------------------------------------------------------------------
// Entorno neutro (fora do retângulo de grama)
// ---------------------------------------------------------------------------

export const surroundFrag = /* glsl */ `
precision highp float;
${constants}
${haze}
uniform sampler2D uNoise;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uSurround;
in vec3 vWorld;
void main() {
  vec2 p = vWorld.xz;
  if (abs(p.x) < HALF_L + MARGIN && abs(p.y) < HALF_W + MARGIN) discard;
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  float n = texture(uNoise, p / 9.0).r * 0.5 + texture(uNoise, p / 0.7).g * 0.3 + texture(uNoise, p / 120.0).b * 0.2;
  vec3 alb = uSurround * (0.82 + 0.36 * n);
  // sombra de contato suave junto à borda do gramado
  vec2 e = max(abs(p) - vec2(HALF_L + MARGIN, HALF_W + MARGIN), 0.0);
  float edge = length(e);
  alb *= 0.72 + 0.28 * smoothstep(0.0, 0.5, edge);
  vec3 col = alb * (uSunColor * max(uSunDir.y, 0.0) + uSkyColor);
  col = applyHaze(col, toCam, dist);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
