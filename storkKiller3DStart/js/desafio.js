import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ═══════════════════════════════════════
   DESAFIO DA FASE 3 — corrida contra o relógio
   Um ponto sinalizado no mapa da fase 3 (anel de luz + bandeira quadriculada + placa).
   Chegar nele DIRIGINDO o buggy ou PILOTANDO a moto leva a cegonha (com o mesmo veículo)
   para a trilha do desafio (assets/models/desafio_trilha.glb): pântano → floresta →
   zona rural → cidade → deserto → oásis, com água, buracos, rampas naturais, troncos,
   casas e urubus rondando (alguns dão rasante: +3 s se acertarem a cegonha).
   Contagem 3-2-1, cronômetro desde a largada, checkpoints em ordem e a bandeira de
   chegada para o tempo final (recorde salvo por veículo). Depois volta para a fase 3.

   Teclas durante o desafio: Enter = volta ao último checkpoint · Backspace = desiste.

   Coordenadas: os mapas ficam em grupos escalados (metros do mapa × escala = mundo).
   Tudo aqui que é do mapa (marcador, portais) vive dentro do grupo do mapa, em metros;
   os urubus vivem no mundo.
═══════════════════════════════════════ */

export const DESAFIO = {
  RAIO_MARCADOR: 5.5,        // m: o veículo entrando nesse raio começa o desafio
  DIST_MARCADOR: 55,         // m da largada da fase 3 até o marcador (ao longo da estrada)
  LADO_MARCADOR: 11,         // m para o lado da estrada (fica na grama, não atrapalha quem passa)
  FADE: 0.55,                // s de tela preta na troca de mapa
  CONTAGEM: 3,               // 3, 2, 1, VAI!
  PENALIDADE_URUBU: 3,       // s a mais quando um urubu acerta a cegonha
  BONUS_URUBU: 1,            // s a menos por urubu abatido
  URUBUS: 4,                 // quantos urubus rondando ao mesmo tempo
  RAIO_RASANTE: 42,          // m: urubu perto assim do veículo pode dar rasante
  VEL_RASANTE: 21,           // m/s
  RAIO_ACERTO: 1.5,          // m: corpo do urubu × cegonha no veículo
  CHANCE_RASANTE: 0.45,      // por segundo, com o veículo perto do ninho (cada urubu)
  ESPERA_FIM: 6,             // s mostrando o resultado antes de voltar para a fase 3
  CHAVE_RECORDE: 'storkiller_desafio_recorde_',
};

// cor da névoa/céu por zona (o deserto é quente, a cidade mais cinza...)
const COR_ZONA = {
  pantano: 0x9db0a6, floresta: 0x93aa9c, rural: 0xa8bcc6, cidade: 0xa4abb2, deserto: 0xdcc59c, oasis: 0xb0c8bc,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _q = new THREE.Vector3();

export function formatarTempo(t) {
  if (!Number.isFinite(t)) return '--:--.--';
  t = Math.max(0, t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

// bipes simples (contagem, checkpoint, chegada, urubu) no mesmo AudioContext dos outros sons do jogo
function bip(freq = 660, dur = 0.15, vol = 0.16, tipo = 'square', atraso = 0) {
  try {
    const ctx = THREE.AudioContext.getContext();
    if (ctx.state !== 'running') return;
    const t0 = ctx.currentTime + atraso;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  } catch { /* sem áudio */ }
}
const SOM = {
  contagem: () => bip(523, 0.18),
  vai: () => { bip(784, 0.12); bip(1047, 0.45, 0.18, 'square', 0.1); },
  checkpoint: () => { bip(988, 0.1, 0.14, 'triangle'); bip(1319, 0.2, 0.14, 'triangle', 0.09); },
  chegada: () => [523, 659, 784, 1047].forEach((f, i) => bip(f, i === 3 ? 0.6 : 0.16, 0.16, 'triangle', i * 0.12)),
  urubu: () => { bip(220, 0.25, 0.14, 'sawtooth'); bip(160, 0.3, 0.12, 'sawtooth', 0.12); },
  abate: () => bip(1175, 0.12, 0.12, 'triangle'),
};

function textoEmTextura(linhas, { largura = 512, altura = 256, fundo = 'rgba(0,0,0,0)', cor = '#fff', borda = null } = {}) {
  const cv = document.createElement('canvas');
  cv.width = largura; cv.height = altura;
  const g = cv.getContext('2d');
  g.fillStyle = fundo; g.fillRect(0, 0, largura, altura);
  if (borda) { g.strokeStyle = borda; g.lineWidth = 10; g.strokeRect(5, 5, largura - 10, altura - 10); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = linhas.length;
  linhas.forEach(([txt, tam, c], i) => {
    g.font = `800 ${tam}px system-ui, "Segoe UI", sans-serif`;
    g.fillStyle = c ?? cor;
    g.lineWidth = Math.max(4, tam * 0.12);
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    const y = altura * (i + 0.5) / n;
    g.strokeText(txt, largura / 2, y);
    g.fillText(txt, largura / 2, y);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function texturaXadrez(n = 8, m = 5) {
  const cv = document.createElement('canvas');
  cv.width = 32 * n; cv.height = 32 * m;
  const g = cv.getContext('2d');
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
    g.fillRect(i * 32, j * 32, 32, 32);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * ctx (funções do main.js):
 *   scene, camera
 *   escala()                      → mundo por metro do mapa
 *   mapa(qual)                    → { api, root } do 'fase3' ou do 'desafio' (null se não carregou)
 *   usarMapa(qual)                → troca o mapa da estrada ('fase3' | 'desafio') e religa os veículos
 *   condutor()                    → { veiculo, tipo: 'buggy'|'moto', dirigindo, estado } | null
 *   veiculo(tipo)                 → objeto do veículo (Buggy / Moto)
 *   mostrarSo(tipo|null)          → só esse veículo visível (null = os dois)
 *   posicionar(veiculo, posM, rumo)
 *   cegonhaMundo(alvo)            → posição dos pés da cegonha (mundo)
 *   recolocarNaMoto(posM, rumo)   → moto caída no reset: põe a moto em pé no lugar e a cegonha sobe
 *   olharPara(rumo)               → câmera atrás do veículo
 *   banner(titulo, texto, ms), dano(), sangue(ponto, dir)
 *   fonteUrubu()                  → { model, clips } | null
 */
export function criarDesafio(ctx) {
  const scene = ctx.scene;
  let estado = 'livre';          // 'livre' | 'indo' | 'contagem' | 'correndo' | 'chegou' | 'voltando'
  let tFase = 0;                 // tempo no estado atual
  let tempo = 0;                 // cronômetro (s)
  let penal = 0;                 // penalidades / bônus somados (s)
  let tipoVeiculo = null;
  let proximo = 0;               // índice do próximo checkpoint (== checkpoints.length → chegada)
  let ultimo = -1;               // último checkpoint passado (-1 = largada)
  let zonaAtual = null;
  let rearmar = false;           // depois de voltar, o marcador só vale de novo quando o veículo sair dele
  let motivoVolta = null;
  let resultado = null;
  let contagemMostrada = -1;
  let marcador = null;           // { grupo, centro (m), saida: { pos, rumo } }
  let portais = null;            // [{ grupo, pos, rumo, largura, ... }]
  let dadosD = null;             // userData.mapa.desafio
  let sAtual = 0;
  const prevRel = new Map();

  // ------------------------------------------------------------------ HUD (DOM)
  const hud = document.createElement('div');
  hud.id = 'desafio-hud';
  hud.innerHTML = `
    <div class="desafio-tempo">00:00.00</div>
    <div class="desafio-linha"><span class="desafio-cp">Checkpoint 0/0</span><span class="desafio-zona"></span></div>
    <div class="desafio-linha desafio-sub"><span class="desafio-recorde"></span><span class="desafio-pen"></span></div>`;
  const seta = document.createElement('div');
  seta.id = 'desafio-seta';
  seta.innerHTML = `<div class="desafio-seta-icone">&#10148;</div><div class="desafio-seta-dist"></div>`;
  const contagem = document.createElement('div');
  contagem.id = 'desafio-contagem';
  const fade = document.createElement('div');
  fade.id = 'desafio-fade';
  const aviso = document.createElement('div');
  aviso.id = 'desafio-aviso';
  document.body.append(hud, seta, contagem, fade, aviso);
  const el = {
    tempo: hud.querySelector('.desafio-tempo'), cp: hud.querySelector('.desafio-cp'),
    zona: hud.querySelector('.desafio-zona'), recorde: hud.querySelector('.desafio-recorde'),
    pen: hud.querySelector('.desafio-pen'), setaIcone: seta.querySelector('.desafio-seta-icone'),
    setaDist: seta.querySelector('.desafio-seta-dist'),
  };
  let avisoTimer = null;
  function avisar(txt, ms = 1600, classe = '') {
    aviso.textContent = txt;
    aviso.className = 'show ' + classe;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.className = ''; }, ms);
  }
  function mostrarHud(sim) {
    hud.classList.toggle('show', sim);
    seta.classList.toggle('show', sim);
  }
  function mostrarContagem(txt) {
    contagem.textContent = txt;
    contagem.classList.remove('pulso');
    void contagem.offsetWidth;
    contagem.classList.toggle('pulso', !!txt);
  }

  const recorde = (tipo) => {
    try { const v = parseFloat(localStorage.getItem(DESAFIO.CHAVE_RECORDE + tipo)); return Number.isFinite(v) ? v : null; }
    catch { return null; }
  };
  const salvarRecorde = (tipo, t) => { try { localStorage.setItem(DESAFIO.CHAVE_RECORDE + tipo, String(t)); } catch { /* sem storage */ } };

  // ------------------------------------------------------------------ marcador na fase 3
  const matAnel = new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const matDisco = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const matFeixe = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTempo: { value: 0 }, uCor: { value: new THREE.Color(0xffb030) } },
    vertexShader: `varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTempo; uniform vec3 uCor; varying float vY;
      void main(){ float a = (1.0 - vY) * (0.35 + 0.15 * sin(uTempo * 3.0 - vY * 12.0)); gl_FragColor = vec4(uCor * a, a); }`,
  });

  // geometria que acompanha o chão (anel / disco em cima do terreno)
  function anelNoChao(api, cx, cz, r0, r1, seg = 64) {
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (const r of [r0, r1]) {
        const x = cx + c * r, z = cz + s * r;
        pos.push(x, api.alturaChao(x, z) + 0.12, z);
      }
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  function bandeira(alturaMastro = 6.5, larg = 3.2, alt = 2.0) {
    const grupo = new THREE.Group();
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, alturaMastro, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.4, roughness: 0.4 }));
    mastro.position.y = alturaMastro / 2;
    const geo = new THREE.PlaneGeometry(larg, alt, 12, 4);
    geo.translate(larg / 2, 0, 0);
    const pano = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texturaXadrez(), side: THREE.DoubleSide, roughness: 0.9 }));
    pano.position.y = alturaMastro - alt / 2 - 0.1;
    pano.userData.base = geo.attributes.position.array.slice();
    grupo.add(mastro, pano);
    grupo.userData.pano = pano;
    return grupo;
  }
  function tremularBandeira(g, t) {
    const pano = g?.userData.pano;
    if (!pano) return;
    const a = pano.geometry.attributes.position, b = pano.userData.base;
    for (let i = 0; i < a.count; i++) {
      const x = b[i * 3];
      a.array[i * 3 + 2] = Math.sin(t * 5 + x * 2.2) * 0.18 * x / 3;
    }
    a.needsUpdate = true;
    pano.geometry.computeVertexNormals();
  }

  function placa(linhas, larg = 6, alt = 3) {
    const mat = new THREE.SpriteMaterial({ map: textoEmTextura(linhas, { largura: 512, altura: 256 }), transparent: true, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(larg, alt, 1);
    return sp;
  }

  function prepararMarcador() {
    if (marcador) return true;
    const m = ctx.mapa('fase3');
    if (!m) return false;
    const api = m.api;
    const pts = api.estrada?.pontos;
    const ini = api.inicioCarro;
    let centro = null, saida = null;
    if (pts?.length > 4 && ini) {
      // ponto da estrada mais perto da largada da fase 3 e o sentido em que o carro sai
      let i0 = 0, dMin = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(p[0] - ini.posicao.x, p[1] - ini.posicao.z); if (d < dMin) { dMin = d; i0 = i; } });
      const fr = new THREE.Vector2(Math.sin(ini.rumo), Math.cos(ini.rumo));
      const nxt = pts[(i0 + 1) % pts.length];
      const passo = (nxt[0] - pts[i0][0]) * fr.x + (nxt[1] - pts[i0][1]) * fr.y >= 0 ? 1 : -1;
      // anda pela estrada até DIST_MARCADOR e procura um lugar livre do lado
      let acc = 0, i = i0;
      for (let k = 0; k < pts.length && !centro; k++) {
        const j = (i + passo + pts.length) % pts.length;
        acc += Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
        i = j;
        if (acc < DESAFIO.DIST_MARCADOR) continue;
        const prox = pts[(i + passo + pts.length) % pts.length];
        const tx = prox[0] - pts[i][0], tz = prox[1] - pts[i][1], tl = Math.hypot(tx, tz) || 1;
        for (const lado of [1, -1]) {
          const lx = tz / tl * lado, lz = -tx / tl * lado;
          const cx = pts[i][0] + lx * DESAFIO.LADO_MARCADOR, cz = pts[i][1] + lz * DESAFIO.LADO_MARCADOR;
          if (api.profundidade(cx, cz) > 0.01) continue;
          const y = api.alturaChao(cx, cz);
          let livre = true;
          for (let a = 0; a < 8 && livre; a++) {
            const px = cx + Math.cos(a * 0.785) * 4, pz = cz + Math.sin(a * 0.785) * 4;
            if (api.penetracao(_v.set(px, api.alturaChao(px, pz) + 1.0, pz), 1.4) > 0) livre = false;
          }
          if (api.penetracao(_v.set(cx, y + 1.0, cz), 3.5) > 0) livre = false;
          if (!livre) continue;
          centro = new THREE.Vector3(cx, y, cz);
          // ao voltar: o veículo aparece no marcador... um pouco à frente, já virado para a estrada
          const rumo = Math.atan2(tx / tl, tz / tl);
          saida = { pos: new THREE.Vector3(pts[i][0] + lx * 3, 0, pts[i][1] + lz * 3), rumo };
          saida.pos.y = api.alturaChao(saida.pos.x, saida.pos.z);
          break;
        }
      }
    }
    if (!centro) {
      // sem estrada nos dados: perto da largada
      const p = ini ? ini.posicao.clone().add(new THREE.Vector3(Math.sin(ini.rumo) * 30, 0, Math.cos(ini.rumo) * 30)) : new THREE.Vector3(10, 0, 10);
      p.y = api.alturaChao(p.x, p.z);
      centro = p;
      saida = { pos: p.clone(), rumo: ini?.rumo ?? 0 };
    }
    const grupo = new THREE.Group();
    grupo.name = 'Desafio_Marcador';
    const R = DESAFIO.RAIO_MARCADOR;
    const anel = new THREE.Mesh(anelNoChao(api, centro.x, centro.z, R - 0.45, R), matAnel);
    const anel2 = new THREE.Mesh(anelNoChao(api, centro.x, centro.z, R * 0.55, R * 0.62), matAnel);
    const disco = new THREE.Mesh(anelNoChao(api, centro.x, centro.z, 0.0, R - 0.45, 48), matDisco);
    anel.renderOrder = anel2.renderOrder = disco.renderOrder = 3;
    const feixe = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 26, 40, 1, true), matFeixe);
    feixe.position.set(centro.x, centro.y + 13, centro.z);
    feixe.renderOrder = 4;
    const band = bandeira();
    band.position.set(centro.x + R * 0.85, centro.y - 0.1, centro.z);
    const sp = placa([['DESAFIO', 120, '#ffd23a'], ['da Cegonha', 64, '#ffffff']], 8, 4);
    sp.position.set(centro.x, centro.y + 9, centro.z);
    const spInfo = placa([['Entre de buggy ou moto', 46, '#fff'], ['', 40, '#ffe7a0']], 7, 3.5);
    spInfo.position.set(centro.x, centro.y + 5.6, centro.z);
    grupo.add(anel, anel2, disco, feixe, band, sp, spInfo);
    m.root.add(grupo);      // grupo escalado do mapa: aqui dentro tudo é em metros
    marcador = { grupo, centro, saida, band, sp, spInfo, anel, anel2 };
    atualizarPlacaRecorde();
    return true;
  }

  function atualizarPlacaRecorde() {
    if (!marcador) return;
    const rb = recorde('buggy'), rm = recorde('moto');
    const linha = rb || rm ? `Recorde: buggy ${rb ? formatarTempo(rb) : '--'} · moto ${rm ? formatarTempo(rm) : '--'}` : 'Sem recorde ainda';
    marcador.spInfo.material.map?.dispose();
    marcador.spInfo.material.map = textoEmTextura([['Entre de buggy ou moto', 46, '#fff'], [linha, 36, '#ffe7a0']], { largura: 640, altura: 256 });
    marcador.spInfo.material.needsUpdate = true;
  }

  // ------------------------------------------------------------------ portais (checkpoints + chegada) no mapa do desafio
  const matPostes = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 });
  function criarPortais() {
    if (portais) return true;
    const m = ctx.mapa('desafio');
    if (!m) return false;
    dadosD = m.api.dados?.desafio;
    if (!dadosD) { console.warn('[desafio] o mapa não tem userData.mapa.desafio'); return false; }
    const raiz = m.root;
    portais = [];
    const lista = [...dadosD.checkpoints.map((c, i) => ({ c, nome: `${i + 1}` })), { c: dadosD.chegada, nome: 'CHEGADA', chegada: true }];
    lista.forEach(({ c, nome, chegada }, i) => {
      const [x, y, z, rumo, largura] = c;
      const grupo = new THREE.Group();
      grupo.position.set(x, m.api.alturaChao(x, z), z);
      grupo.rotation.y = rumo;
      const meia = largura / 2 + 0.6;
      const altura = 5.2;
      const corPano = chegada ? 0xd02020 : 0xffc23a;
      const matPano = new THREE.MeshBasicMaterial({ color: corPano, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      for (const lado of [-1, 1]) {
        const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, altura, 8), matPostes);
        poste.position.set(lado * meia, altura / 2 - 0.2, 0);
        grupo.add(poste);
        const bola = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: corPano }));
        bola.position.set(lado * meia, altura, 0);
        grupo.add(bola);
      }
      // faixa no alto e "cortina" de luz entre os postes
      const faixa = new THREE.Mesh(new THREE.BoxGeometry(meia * 2, 0.7, 0.12),
        chegada ? new THREE.MeshStandardMaterial({ map: texturaXadrez(16, 2) }) : new THREE.MeshStandardMaterial({ color: corPano, emissive: corPano, emissiveIntensity: 0.25 }));
      faixa.position.y = altura - 0.35;
      const cortina = new THREE.Mesh(new THREE.PlaneGeometry(meia * 2, altura - 0.7), matPano);
      cortina.position.y = (altura - 0.7) / 2;
      cortina.renderOrder = 4;
      const num = placa([[chegada ? 'CHEGADA' : `CHECKPOINT ${nome}`, chegada ? 110 : 80, chegada ? '#ffffff' : '#ffe27a']], 6, 3);
      num.position.y = altura + 1.6;
      grupo.add(faixa, cortina, num);
      raiz.add(grupo);
      portais.push({ grupo, x, z, rumo, largura, chegada: !!chegada, cortina, matPano, faixa, num, corBase: corPano,
        fx: Math.sin(rumo), fz: Math.cos(rumo) });
    });
    return true;
  }

  function pintarPortais() {
    if (!portais) return;
    portais.forEach((p, i) => {
      const passou = i < proximo;
      const eProx = i === proximo;
      p.matPano.color.set(passou ? 0x30d060 : p.corBase);
      p.matPano.opacity = passou ? 0.08 : eProx ? 0.32 : 0.12;
      p.grupo.visible = eProx || i === proximo + 1 || p.chegada || passou;
      p.num.visible = !passou;
    });
  }

  // ------------------------------------------------------------------ trilha (progresso e zona)
  function sNaTrilha(x, z) {
    const tr = dadosD?.trilha;
    if (!tr) return 0;
    let best = 0, d = Infinity;
    for (let i = 0; i < tr.length; i++) {
      const dd = (tr[i][0] - x) ** 2 + (tr[i][1] - z) ** 2;
      if (dd < d) { d = dd; best = i; }
    }
    return tr[best][2];
  }
  function zonaEm(s) {
    for (const z of dadosD?.zonas ?? []) if (s >= z[0] - 1 && s <= z[1] + 1) return z;
    return null;
  }

  // ------------------------------------------------------------------ urubus do desafio
  const urubus = [];
  let fonte = null;
  function criarUrubu() {
    fonte ??= ctx.fonteUrubu();
    if (!fonte) return null;
    const model = SkeletonUtils.clone(fonte.model);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(fonte.model.scale.x);
    model.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.frustumCulled = false; } });
    const root = new THREE.Group();
    root.add(model);
    scene.add(root);
    const mixer = new THREE.AnimationMixer(model);
    const acoes = {};
    for (const clip of fonte.clips) {
      const k = clip.name.replace(/^Urubu_/, '');
      const a = mixer.clipAction(clip);
      if (['Voo', 'Planar'].includes(k)) a.setLoop(THREE.LoopRepeat);
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      acoes[k] = a;
    }
    const u = { root, model, mixer, acoes, atual: null, corpo: model.getObjectByName('Corpo'), corpoPos: new THREE.Vector3(),
      estado: 'ronda', t: 0, ninho: -1, ang: Math.random() * 6.28, raio: 12, alt: 6, dir: 1, vel: new THREE.Vector3(),
      espera: 2 + Math.random() * 3, acertou: false, quedaV: 0, alvo: new THREE.Vector3() };
    anim(u, 'Voo', 0);
    urubus.push(u);
    return u;
  }
  function anim(u, k, fadeT = 0.3) {
    const a = u.acoes[k];
    if (!a || u.atual === a) return;
    a.reset().play();
    if (u.atual && fadeT > 0) u.atual.crossFadeTo(a, fadeT, false);
    else if (u.atual) u.atual.stop();
    u.atual = a;
  }
  function removerUrubus() {
    for (const u of urubus) {
      u.mixer.stopAllAction();
      u.mixer.uncacheRoot(u.model);
      u.model.traverse((c) => { if (c.isSkinnedMesh) c.skeleton.dispose(); });
      scene.remove(u.root);
    }
    urubus.length = 0;
  }
  // põe o urubu rondando o próximo ninho livre à frente
  function mandarParaNinho(u, sMin) {
    const ninhos = dadosD?.urubus ?? [];
    const ocupados = new Set(urubus.filter((o) => o !== u).map((o) => o.ninho));
    const idx = ninhos.findIndex((n, i) => n[3] > sMin && !ocupados.has(i));
    if (idx < 0) { u.root.visible = false; u.estado = 'parado'; u.ninho = -1; return; }
    const e = ctx.escala();
    const n = ninhos[idx];
    u.ninho = idx;
    u.raio = 9 + Math.random() * 8;
    u.alt = 5 + Math.random() * 5;
    u.dir = Math.random() < 0.5 ? 1 : -1;
    u.ang = Math.random() * 6.28;
    u.estado = 'ronda';
    u.espera = 1 + Math.random() * 2;
    u.acertou = false;
    u.root.visible = true;
    u.root.position.set((n[0] + Math.cos(u.ang) * u.raio) * e, (n[1] + u.alt) * e, (n[2] + Math.sin(u.ang) * u.raio) * e);
    anim(u, 'Voo', 0);
  }
  function prepararUrubus() {
    removerUrubus();
    for (let i = 0; i < DESAFIO.URUBUS; i++) {
      const u = criarUrubu();
      if (!u) break;
      mandarParaNinho(u, -1);
    }
  }
  function atualizarUrubus(dt, veic) {
    if (!urubus.length) return;
    const e = ctx.escala();
    const api = ctx.mapa('desafio')?.api;
    const vx = veic ? veic.pos.x : 0, vz = veic ? veic.pos.z : 0, vy = veic ? veic.pos.y : 0;
    for (const u of urubus) {
      u.mixer.update(dt);
      if (u.estado === 'parado') continue;
      u.t += dt;
      const p = u.root.position;
      const n = dadosD.urubus[u.ninho];
      if (u.estado === 'morrendo') {
        u.quedaV += 9.8 * e * dt;
        p.y -= u.quedaV * dt;
        const chao = api ? api.alturaChao(p.x / e, p.z / e) * e : 0;
        if (p.y <= chao) { p.y = chao; u.estado = 'caido'; u.t = 0; }
        continue;
      }
      if (u.estado === 'caido') {
        if (u.t > 5) mandarParaNinho(u, sAtual + 60);
        continue;
      }
      // ficou para trás: vai rondar um ninho lá na frente (longe, ninguém vê a troca)
      if (n && n[3] < sAtual - 70) { mandarParaNinho(u, sAtual + 90); continue; }
      if (!n) continue;
      if (u.estado === 'ronda' || u.estado === 'subindo') {
        u.ang += u.dir * dt * (8 / u.raio) * (u.estado === 'subindo' ? 1.3 : 1);
        const alvo = _v.set((n[0] + Math.cos(u.ang) * u.raio) * e, (n[1] + u.alt) * e, (n[2] + Math.sin(u.ang) * u.raio) * e);
        _v2.subVectors(alvo, p);
        const d = _v2.length();
        const vel = (u.estado === 'subindo' ? 14 : 9) * e;
        if (d > 1e-3) p.addScaledVector(_v2, Math.min(1, vel * dt / d));
        if (u.estado === 'subindo' && d < 1.5 * e) u.estado = 'ronda';
        u.root.rotation.y = Math.atan2(_v2.x, _v2.z);
        if (Math.random() < dt * 0.25) anim(u, u.atual === u.acoes.Voo ? 'Planar' : 'Voo', 0.6);
        // rasante: o veículo está chegando perto do ninho
        u.espera -= dt;
        if (u.estado === 'ronda' && estado === 'correndo' && veic && u.espera <= 0) {
          const dV = Math.hypot(vx - n[0], vz - n[2]);
          if (dV < DESAFIO.RAIO_RASANTE && Math.random() < dt * DESAFIO.CHANCE_RASANTE) {
            // mira onde o veículo vai estar daqui a pouco, na altura da cegonha
            const tAlvo = 0.9;
            const erro = (Math.random() - 0.5) * 3;          // urubu não é perfeito: erra um pouco para o lado
            u.alvo.set((vx + veic.vel.x * tAlvo + Math.cos(veic.rumo) * erro) * e, (vy + 1.0) * e,
              (vz + veic.vel.y * tAlvo - Math.sin(veic.rumo) * erro) * e);
            u.vel.subVectors(u.alvo, p).normalize().multiplyScalar(DESAFIO.VEL_RASANTE * e);
            u.estado = 'rasante'; u.t = 0; u.acertou = false;
            anim(u, 'Ataque', 0.15);
          }
        }
      } else if (u.estado === 'rasante') {
        p.addScaledVector(u.vel, dt);
        u.root.rotation.y = Math.atan2(u.vel.x, u.vel.z);
        // corpo do urubu × cegonha (no veículo)
        if (!u.acertou && veic) {
          const dx = p.x / e - vx, dy = (p.y / e + 1.2) - (vy + 1.3), dz = p.z / e - vz;
          if (Math.hypot(dx, dy, dz) < DESAFIO.RAIO_ACERTO) {
            u.acertou = true;
            penal += DESAFIO.PENALIDADE_URUBU;
            ctx.dano();
            SOM.urubu();
            avisar(`Urubu! +${DESAFIO.PENALIDADE_URUBU} s`, 1500, 'ruim');
          }
        }
        const chao = api ? api.alturaChao(p.x / e, p.z / e) * e : 0;
        if (p.y < chao + 0.6 * e) p.y = chao + 0.6 * e;
        if (u.t > 2.2 || u.acertou) {
          u.estado = 'subindo'; u.espera = 7 + Math.random() * 6;
          u.ang = Math.atan2(p.z / e - n[2], p.x / e - n[0]);
          anim(u, 'Voo', 0.3);
        }
      }
      if (u.corpo) u.corpo.getWorldPosition(u.corpoPos);
      else u.corpoPos.copy(p).y += 1.9;
    }
  }

  function acertarBala(p0, p1) {
    if (!urubus.length) return null;
    _seg.subVectors(p1, p0);
    const L2 = _seg.lengthSq();
    const R = 0.85 * ctx.escala() / 1.6;
    for (const u of urubus) {
      if (!['ronda', 'subindo', 'rasante'].includes(u.estado) || !u.root.visible) continue;
      if (u.corpo) u.corpo.getWorldPosition(u.corpoPos);
      const t = L2 > 0 ? THREE.MathUtils.clamp(_q.subVectors(u.corpoPos, p0).dot(_seg) / L2, 0, 1) : 0;
      _q.copy(p0).addScaledVector(_seg, t);
      if (_q.distanceTo(u.corpoPos) < Math.max(0.8, R)) {
        u.estado = 'morrendo'; u.t = 0; u.quedaV = 0;
        anim(u, u.acoes.Morte_Voo ? 'Morte_Voo' : 'Voo', 0.1);
        if (estado === 'correndo') {
          penal -= DESAFIO.BONUS_URUBU;
          SOM.abate();
          avisar(`Urubu abatido! −${DESAFIO.BONUS_URUBU} s`, 1300, 'bom');
        }
        const ponto = _q.clone();
        ctx.sangue?.(ponto, _seg.clone().normalize());
        return { ponto };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ fluxo
  function irPara(novo) { estado = novo; tFase = 0; }

  function comecar(tipo) {
    if (!criarPortais()) {
      ctx.banner('Desafio', 'A trilha do desafio ainda está carregando…', 2000);
      rearmar = true;
      return;
    }
    tipoVeiculo = tipo;
    irPara('indo');
    fade.classList.add('show');
  }

  // chamado no meio da tela preta: troca o mapa e põe o veículo na largada
  function entrarNaTrilha() {
    const veic = ctx.veiculo(tipoVeiculo);
    if (!ctx.usarMapa('desafio')) { voltar('erro'); return; }
    ctx.mostrarSo(tipoVeiculo);
    const [x, , z, rumo] = dadosD.largada;
    const api = ctx.mapa('desafio').api;
    ctx.posicionar(veic, new THREE.Vector3(x, api.alturaChao(x, z), z), rumo);
    ctx.olharPara(rumo);
    tempo = 0; penal = 0; proximo = 0; ultimo = -1; zonaAtual = null; resultado = null;
    prevRel.clear();
    pintarPortais();
    prepararUrubus();
    mostrarHud(true);
    const r = recorde(tipoVeiculo);
    el.recorde.textContent = r ? `Recorde (${tipoVeiculo}): ${formatarTempo(r)}` : `Sem recorde de ${tipoVeiculo} ainda`;
    el.pen.textContent = '';
    contagemMostrada = -1;
    ctx.banner('Desafio da Cegonha', 'Pântano → Floresta → Zona Rural → Cidade → Deserto → Oásis · siga os checkpoints até a bandeira', 3600);
    irPara('contagem');
    fade.classList.remove('show');
  }

  function voltar(motivo) {
    motivoVolta = motivo;
    irPara('voltando');
    fade.classList.add('show');
  }

  function sairDaTrilha() {
    mostrarHud(false);
    mostrarContagem('');
    removerUrubus();
    ctx.usarMapa('fase3');
    ctx.mostrarSo(null);
    const veic = tipoVeiculo ? ctx.veiculo(tipoVeiculo) : null;
    if (veic && marcador) {
      const c = ctx.condutor();
      if (c?.veiculo === veic && c.dirigindo) ctx.posicionar(veic, marcador.saida.pos, marcador.saida.rumo);
      else if (tipoVeiculo === 'moto') ctx.recolocarNaMoto(marcador.saida.pos, marcador.saida.rumo);   // estava a pé (caiu)
      else ctx.posicionar(veic, marcador.saida.pos, marcador.saida.rumo);
      ctx.olharPara(marcador.saida.rumo);
    }
    rearmar = true;
    tipoVeiculo = null;
    atualizarPlacaRecorde();
    irPara('livre');
    fade.classList.remove('show');
    const mapa = ctx.mapa('desafio');
    if (mapa?.api?.corNevoa) mapa.api.corNevoa.set(COR_ZONA.pantano);
  }

  function chegou() {
    const total = Math.max(0, tempo + penal);
    const antigo = recorde(tipoVeiculo);
    const novo = antigo === null || total < antigo;
    if (novo) salvarRecorde(tipoVeiculo, total);
    resultado = { total, antigo, novo };
    SOM.chegada();
    el.tempo.textContent = formatarTempo(total);
    hud.classList.add('chegou');
    ctx.banner(novo ? 'Novo recorde!' : 'Desafio concluído!',
      `${tipoVeiculo === 'moto' ? 'Moto' : 'Buggy'} · ${formatarTempo(total)}` +
      (penal ? ` (corrida ${formatarTempo(tempo)}, ${penal > 0 ? '+' : '−'}${Math.abs(penal)} s)` : '') +
      (antigo !== null && !novo ? ` · recorde ${formatarTempo(antigo)}` : ''), DESAFIO.ESPERA_FIM * 1000);
    irPara('chegou');
  }

  // volta para o último checkpoint (ou a largada) — parado e virado para a frente
  function voltarAoCheckpoint() {
    const c = ctx.condutor();
    const veic = ctx.veiculo(tipoVeiculo);
    if (!veic) return;
    const g = ultimo >= 0 ? dadosD.checkpoints[ultimo] : dadosD.largada;
    const [x, , z, rumo] = g;
    const api = ctx.mapa('desafio').api;
    // um pouco antes do portal; se ali tiver água, procura chão seco mais para a frente (parado na água a moto cai)
    let px = x - Math.sin(rumo) * 4, pz = z - Math.cos(rumo) * 4;
    for (let k = 0; k < 30 && api.profundidade(px, pz) > 0.02; k++) { px += Math.sin(rumo) * 2; pz += Math.cos(rumo) * 2; }
    const pos = new THREE.Vector3(px, api.alturaChao(px, pz), pz);
    if (c?.veiculo === veic && c.dirigindo) {
      ctx.posicionar(veic, pos, rumo);
      ctx.olharPara(rumo);
      avisar('De volta ao checkpoint', 1200);
    } else if (tipoVeiculo === 'moto' && (!c || c.estado === 'caindo' || c.estado === 'levantando')) {
      // caiu da moto e está a pé: levanta a moto lá e sobe
      ctx.recolocarNaMoto(pos, rumo);
      ctx.olharPara(rumo);
      avisar('De volta ao checkpoint', 1200);
    }
    prevRel.clear();
  }

  function testarPortais(veic) {
    if (!portais || proximo >= portais.length) return;
    const p = portais[proximo];
    const dx = veic.pos.x - p.x, dz = veic.pos.z - p.z;
    const frente = dx * p.fx + dz * p.fz;               // + = já passou
    const lado = dx * p.fz - dz * p.fx;
    const antes = prevRel.get(proximo);
    prevRel.set(proximo, frente);
    const dentro = Math.abs(lado) < p.largura / 2 + 2.5;
    const cruzou = antes !== undefined && antes < 0 && frente >= 0 && dentro;
    const encostou = Math.hypot(dx, dz) < Math.min(4, p.largura / 2) && frente > -1;
    if (!(cruzou || encostou)) return;
    if (p.chegada) {
      proximo++;
      pintarPortais();
      chegou();
      return;
    }
    ultimo = proximo;
    proximo++;
    pintarPortais();
    const parcial = tempo + penal;
    SOM.checkpoint();
    avisar(`Checkpoint ${ultimo + 1}/${dadosD.checkpoints.length} · ${formatarTempo(parcial)}`, 1600, 'bom');
  }

  function atualizarSeta(veic) {
    if (!portais || proximo >= portais.length) { seta.classList.remove('show'); return; }
    seta.classList.add('show');
    const p = portais[proximo];
    const dx = p.x - veic.pos.x, dz = p.z - veic.pos.z;
    const dist = Math.hypot(dx, dz);
    ctx.camera.getWorldDirection(_v);
    const angAlvo = Math.atan2(dx, dz);
    const angCam = Math.atan2(_v.x, _v.z);
    let rel = angAlvo - angCam;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    el.setaIcone.style.transform = `rotate(${(-90 + rel * -180 / Math.PI).toFixed(1)}deg)`;
    el.setaDist.textContent = `${p.chegada ? 'Chegada' : 'CP ' + (proximo + 1)} · ${Math.round(dist)} m`;
  }

  // ------------------------------------------------------------------ update (todo frame, fase 3)
  function update(dt) {
    const t = performance.now() / 1000;
    if (marcador) {
      matFeixe.uniforms.uTempo.value = t;
      matAnel.opacity = 0.6 + 0.3 * Math.sin(t * 4);
      tremularBandeira(marcador.band, t);
    }
    if (!marcador) prepararMarcador();
    const c = ctx.condutor();
    tFase += dt;

    switch (estado) {
      case 'livre': {
        if (!marcador || !c) break;
        const v = c.veiculo;
        const d = Math.hypot(v.pos.x - marcador.centro.x, v.pos.z - marcador.centro.z);
        if (rearmar) { if (d > DESAFIO.RAIO_MARCADOR + 3) rearmar = false; break; }
        if (c.dirigindo && d < DESAFIO.RAIO_MARCADOR) comecar(c.tipo);
        break;
      }
      case 'indo':
        if (tFase >= DESAFIO.FADE) entrarNaTrilha();
        break;
      case 'contagem': {
        const resto = DESAFIO.CONTAGEM + 0.6 - tFase;
        const n = Math.ceil(resto - 0.6);
        if (tFase < 0.6) break;                    // espera a tela clarear
        if (n !== contagemMostrada) {
          contagemMostrada = n;
          mostrarContagem(n > 0 ? String(n) : 'VAI!');
          if (n > 0) SOM.contagem(); else SOM.vai();
          if (n <= 0) { irPara('correndo'); setTimeout(() => mostrarContagem(''), 800); }
        }
        break;
      }
      case 'correndo':
        tempo += Math.min(dt, 0.1);        // aba escondida / travada não conta como tempo de corrida
        break;
      case 'chegou':
        if (tFase > DESAFIO.ESPERA_FIM) voltar('fim');
        break;
      case 'voltando':
        if (tFase >= DESAFIO.FADE) sairDaTrilha();
        break;
    }

    if (estado === 'contagem' || estado === 'correndo' || estado === 'chegou') {
      const veic = ctx.veiculo(tipoVeiculo);
      // a cegonha caída da moto: segue o corpo dela para a seta; o tempo continua
      if (veic) {
        sAtual = sNaTrilha(veic.pos.x, veic.pos.z);
        if (estado === 'correndo' && c?.veiculo === veic && c.dirigindo) testarPortais(veic);
        atualizarSeta(veic);
        const z = zonaEm(sAtual);
        if (z && z[2] !== zonaAtual) {
          if (zonaAtual !== null && estado === 'correndo') avisar(z[3], 1800, 'zona');
          zonaAtual = z[2];
          el.zona.textContent = z[3];
        }
        const api = ctx.mapa('desafio')?.api;
        if (api?.corNevoa && zonaAtual) api.corNevoa.lerp(_cor.set(COR_ZONA[zonaAtual] ?? 0x9db0a6), Math.min(1, dt * 0.6));
      }
      atualizarUrubus(dt, veic);
      if (estado !== 'chegou') el.tempo.textContent = formatarTempo(tempo + penal);
      el.cp.textContent = `Checkpoint ${Math.min(proximo, dadosD.checkpoints.length)}/${dadosD.checkpoints.length}`;
      el.pen.textContent = penal ? `${penal > 0 ? '+' : '−'}${Math.abs(penal)} s (urubus)` : '';
    } else {
      hud.classList.remove('chegou');
    }
  }
  const _cor = new THREE.Color();

  // ------------------------------------------------------------------ teclas
  function tecla(code) {
    if (estado !== 'correndo' && estado !== 'contagem' && estado !== 'chegou') return false;
    if (code === 'Backspace') {
      if (estado === 'chegou') voltar('fim');
      else { ctx.banner('Desafio abandonado', 'Voltando para a fase 3…', 1800); voltar('desistiu'); }
      return true;
    }
    if (code === 'Enter' && estado === 'correndo') {
      voltarAoCheckpoint();
      return true;
    }
    return false;
  }

  // sai na hora (trocou de fase, voltou ao menu): sem animação
  function abortar() {
    if (estado === 'livre') return;
    mostrarHud(false);
    mostrarContagem('');
    removerUrubus();
    fade.classList.remove('show');
    hud.classList.remove('chegou');
    irPara('livre');
    tipoVeiculo = null;
    rearmar = false;
  }

  return {
    update,
    tecla,
    abortar,
    acertarBala,
    prepararMarcador,
    get estado() { return estado; },
    get ativo() { return estado !== 'livre'; },
    // durante o desafio não sai do veículo nem voa (senão é só voar até a chegada)
    bloqueiaSaida: () => estado !== 'livre',
    bloqueiaVoo: () => estado !== 'livre',
    // contagem e trocas de mapa: veículo freado
    travado: () => estado === 'indo' || estado === 'contagem' || estado === 'voltando',
    dica() {
      if (estado === 'correndo') return 'Enter: volta ao último checkpoint · Backspace: desiste';
      if (estado === 'chegou') return 'Backspace: voltar agora para a fase 3';
      if (estado === 'contagem' || estado === 'indo') return 'Prepare-se… acelere no VAI!';
      return null;
    },
    get tempo() { return tempo + penal; },
    get resultado() { return resultado; },
    get marcador() { return marcador; },
    get urubus() { return urubus; },
  };
}
