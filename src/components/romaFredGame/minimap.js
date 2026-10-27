/*
  Minimapa estilo GPS: a imagem do mapa visto de cima (minimapa.jpg, gerada no Blender) gira com a
  câmera, o Romanele é a setinha no meio e a rota até o destino aparece em roxo, sempre a partir do
  ponto da rota mais perto dele. Também diz a próxima curva ("Vire à esquerda em 40 m").

  Coordenadas: x e z do three.js. Na imagem, x cresce para a direita e z para baixo.
*/

const ROUTE_COLOR = '#c45cff';

export function createMinimap({ canvas, imageUrl, route, imageCenter, imageSpan, destLabel = 'Destino' }) {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  let ready = false;
  img.onload = () => { ready = true; };
  img.src = imageUrl;

  // metros por pixel da imagem
  const pxPerM = () => img.width / imageSpan;
  const toImg = (x, z) => [img.width / 2 + (x - imageCenter[0]) * pxPerM(), img.height / 2 + (z - imageCenter[1]) * pxPerM()];

  // comprimento acumulado da rota (para a distância restante)
  const segLen = [];
  for (let i = 0; i < route.length - 1; i++) segLen.push(Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]));

  // ponto da rota mais perto do jogador: { i (segmento), t, x, z, dist }
  function nearest(px, pz) {
    let best = null;
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i], [bx, bz] = route[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
      const x = ax + dx * t, z = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (!best || d < best.dist - 1e-3) best = { i, t, x, z, dist: d };
    }
    return best;
  }

  // próxima curva depois do ponto atual: direção (esquerda/direita) e distância até ela
  function nextTurn(n) {
    let dist = segLen[n.i] * (1 - n.t);
    for (let j = n.i; j < route.length - 2; j++) {
      const h = [route[j + 1][0] - route[j][0], route[j + 1][1] - route[j][1]];
      const k = [route[j + 2][0] - route[j + 1][0], route[j + 2][1] - route[j + 1][1]];
      const lh = Math.hypot(...h), lk = Math.hypot(...k);
      const cos = (h[0] * k[0] + h[1] * k[1]) / (lh * lk);
      if (cos < 0.7) return { dir: h[0] * k[1] - h[1] * k[0] < 0 ? 'esquerda' : 'direita', dist };
      dist += segLen[j + 1];
    }
    return null;
  }

  function remaining(n) {
    let d = segLen[n.i] * (1 - n.t);
    for (let j = n.i + 1; j < segLen.length; j++) d += segLen[j];
    return d + n.dist;
  }

  /**
   * Desenha o minimapa.
   * @returns {{ remaining: number, turn: {dir, dist}|null, arrived: boolean }}
   */
  function draw(px, pz, playerYaw, camYaw, zoom = 1.7) {
    // desenha em pixels de CSS (o canvas tem mais pixels nas telas de alta densidade)
    const sc = canvas.width / (canvas.clientWidth || canvas.width);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    const W = canvas.width / sc, H = W, R = W / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1f2a21'; ctx.fillRect(0, 0, W, H);

    // a frente da câmera aponta para cima no minimapa
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rot = -Math.PI / 2 - Math.atan2(fz, fx);
    const k = (zoom * (W / 220)) / (ready ? pxPerM() : 1);      // pixels da tela por pixel da imagem
    const n = nearest(px, pz);
    const dest = route[route.length - 1];
    const arrived = Math.hypot(px - dest[0], pz - dest[1]) < 9;

    ctx.translate(R, R);
    ctx.rotate(rot);
    if (ready) {
      const [ix, iy] = toImg(px, pz);
      ctx.save();
      ctx.scale(k, k);
      ctx.drawImage(img, -ix, -iy);
      // rota do GPS: do ponto mais perto até o destino (e um tracinho dele até a rota, se saiu dela)
      if (!arrived) {
        const pts = [[n.x, n.z]];
        for (let j = n.i + 1; j < route.length; j++) pts.push(route[j]);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const path = () => { ctx.beginPath(); pts.forEach(([x, z], q) => { const [a, b] = toImg(x, z); q ? ctx.lineTo(a - ix, b - iy) : ctx.moveTo(a - ix, b - iy); }); };
        path(); ctx.strokeStyle = 'rgba(20,0,30,0.85)'; ctx.lineWidth = 9 / k; ctx.stroke();
        path(); ctx.strokeStyle = ROUTE_COLOR; ctx.lineWidth = 5.5 / k; ctx.stroke();
        if (n.dist > 4) {
          const [a, b] = toImg(n.x, n.z);
          ctx.setLineDash([5 / k, 5 / k]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(a - ix, b - iy);
          ctx.strokeStyle = ROUTE_COLOR; ctx.lineWidth = 3 / k; ctx.stroke(); ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }
    ctx.restore();

    // destino: ícone no lugar certo ou preso na borda quando está longe
    if (ready) {
      const s = k * pxPerM();                                  // pixels da tela por metro
      const dx = (dest[0] - px) * s, dz = (dest[1] - pz) * s;
      let sx = dx * Math.cos(rot) - dz * Math.sin(rot), sy = dx * Math.sin(rot) + dz * Math.cos(rot);
      const lim = R - 14, len = Math.hypot(sx, sy);
      if (len > lim) { sx *= lim / len; sy *= lim / len; }
      ctx.save(); ctx.translate(R + sx, R + sy);
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fillStyle = '#ff4fb8'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Karla, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('JG', 0, 0.5);
      ctx.restore();
    }

    // norte na borda
    const na = rot - Math.PI / 2;
    ctx.save(); ctx.translate(R + Math.cos(na) * (R - 11), R + Math.sin(na) * (R - 11));
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(15,15,15,.85)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Karla, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', 0, 0.5);
    ctx.restore();

    // o Romanele: setinha branca no meio apontando para onde ele olha
    const pa = Math.atan2(Math.cos(playerYaw), Math.sin(playerYaw)) + rot;
    ctx.save(); ctx.translate(R, R); ctx.rotate(pa + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.stroke();
    ctx.restore();

    // aro
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(15,12,10,.9)'; ctx.stroke();

    return { remaining: remaining(n), turn: arrived ? null : nextTurn(n), arrived, label: destLabel };
  }

  return { draw, get ready() { return ready; } };
}
