// Pfeilwürfel: 3D-Darstellung (eigener kleiner Renderer auf Canvas).
// Ein Finger wischen dreht, zwei Finger zoomen/verschieben, Antippen schiebt einen Pfeil.
import { generateLevel, blockDistance, AX } from './generator.js';
import { createShell, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const LIVES = 3;
const PALETTE = ['--a1', '--a2', '--a3', '--a4', '--a5', '--a6'];

// ---------- kleine Vektor-/Matrixhelfer ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const mv = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
function rotAxis(u, a) {
  const [x, y, z] = u, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
          [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
          [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}

export function mountArrows3d(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  const { box, arrows } = L;
  const { cells, D } = box;
  const center = mul(D, 0.5);
  const occ = new Int16Array(cells.length).fill(-1);
  for (const a of arrows) for (const c of a.cells) occ[c] = a.id;
  let remaining = arrows.length;
  let lives = LIVES;
  let over = false;

  const shell = createShell(root, {
    name: 'Pfeilwürfel', level, lives: LIVES, onExit, onHint: () => hint(),
  });
  const canvas = document.createElement('canvas');
  canvas.className = 'board3d';
  shell.board.appendChild(canvas);
  const fitBtn = document.createElement('button');
  fitBtn.className = 'a3d-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  shell.board.appendChild(fitBtn);
  const ctx = canvas.getContext('2d');
  const hintBtn = root.querySelector('[data-act="hint"]');

  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const theme = document.documentElement.dataset.theme;
  const colors = {
    surface: col('--surface'), muted: col('--muted'), dot: col('--dot'), danger: col('--danger'),
    dark: theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches),
  };

  // Farben so verteilen, dass sich berührende Pfeile möglichst verschieden aussehen
  const colorOf = new Array(arrows.length).fill(-1);
  for (const a of arrows) {
    const taken = new Set();
    for (const c of a.cells)
      for (const di of box.tangents(c)) {
        const o = occ[box.step(c, di).c];
        if (o !== -1 && o !== a.id && colorOf[o] !== -1) taken.add(colorOf[o]);
      }
    let pick = a.id % PALETTE.length;
    for (let k = 0; k < PALETTE.length; k++) {
      const cand = (a.id + k) % PALETTE.length;
      if (!taken.has(cand)) { pick = cand; break; }
    }
    colorOf[a.id] = pick;
  }

  // ---------- Pfade der Pfeile (in 3D, mit Flächenzuordnung je Segment) ----------
  const views = arrows.map((a) => {
    const pts = [{ pos: cells[a.cells[0]].p, face: cells[a.cells[0]].face, cell: a.cells[0] }];
    for (let k = 1; k < a.cells.length; k++) {
      const A = cells[a.cells[k - 1]], B = cells[a.cells[k]];
      if (A.face !== B.face) {
        // Punkt auf der gemeinsamen Kante (außen herum oder Innenecke)
        const e = A.p.slice(), ax = B.face >> 1;
        e[ax] = B.p[ax];
        pts.push({ pos: e, face: A.face });
      }
      pts.push({ pos: B.p, face: B.face, cell: a.cells[k] });
    }
    const headIdx = pts.length - 1;
    const head = a.cells[a.cells.length - 1];
    const hf = cells[head].face;
    const d = AX[a.dir];
    for (const c of box.ray(head, a.dir)) pts.push({ pos: cells[c].p, face: hf, cell: c });
    const edge = add(pts[pts.length - 1].pos, d);
    pts.push({ pos: edge, face: hf });
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(...sub(pts[k].pos, pts[k - 1].pos)));
    const bodyLen = cum[headIdx];
    const airStart = cum[cum.length - 1];
    // Bahn endet kurz hinter der Kante, sobald der ganze Pfeil die Fläche verlassen hat
    pts.push({ pos: add(edge, mul(d, bodyLen + 3)), face: 'air' });
    cum.push(cum[cum.length - 1] + bodyLen + 3);
    // Bogenlänge jeder Feldmitte (Körper und Bahn) – für das Zeichnen Feld für Feld
    const cellArcs = [];
    pts.forEach((q, k) => { if (q.cell !== undefined) cellArcs.push([q.cell, cum[k]]); });
    return {
      a, pts, cum, cellArcs, airStart, headFace: hf, bodyLen, total: cum[cum.length - 1],
      color: col(PALETTE[colorOf[a.id]]), s: 0,
      removed: false, gone: false, blocked: false, busy: false, waiting: false,
    };
  });

  // Punkt auf dem Pfad bei Bogenlänge s
  function sample(v, s) {
    const { pts, cum } = v;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const t = Math.max(0, Math.min(1, (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1)));
    return { pos: add(pts[k - 1].pos, mul(sub(pts[k].pos, pts[k - 1].pos), t)), face: pts[k].face };
  }
  // Teilstück [s0, s1] als Liste von Abschnitten je Fläche
  function pieces(v, s0, s1) {
    const { pts, cum } = v;
    const out = [];
    let cur = null;
    const pushPt = (pos, face) => {
      if (!cur || cur.face !== face) {
        const prev = cur && cur.pts[cur.pts.length - 1];
        cur = { face, pts: prev ? [prev] : [] };
        out.push(cur);
      }
      cur.pts.push(pos);
    };
    const a = sample(v, s0);
    pushPt(a.pos, a.face);
    for (let k = 1; k < pts.length; k++) {
      if (cum[k] <= s0) continue;
      if (cum[k] >= s1) break;
      pushPt(pts[k].pos, pts[k].face);
    }
    const b = sample(v, s1);
    pushPt(b.pos, b.face);
    return out;
  }

  // ---------- Kamera, Zoom und Verschieben ----------
  let R = mm(rotX(-0.5), rotY(0.65));
  let W = 0, H = 0, f = 1, camD = 1, dpr = 1;
  let zoom = 1, panX = 0, panY = 0;
  // Radius der Kugel um alle Felder (bei Blockgebilden kleiner als um den umgebenden Quader)
  const radius = Math.max(...cells.map((c) => Math.hypot(...sub(c.p, center)))) + 1;

  function resize() {
    const r = shell.board.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camD = radius * 4;
    // Kugel um den Körper passt immer ganz hinein, egal wie gedreht
    f = (Math.min(W, H) * 0.5) * camD / radius;
    clampPan();
    requestRender();
  }
  const view = (p) => mv(R, sub(p, center));
  function project(p) {
    const v = view(p);
    const z = v[2] + camD;
    return [W / 2 + panX + v[0] * f * zoom / z, H / 2 + panY - v[1] * f * zoom / z];
  }
  const faceNormals = AX;
  function visibleFaces() {
    return faceNormals.map((n) => {
      const pc = center.map((c, k) => (n[k] === 0 ? c : n[k] > 0 ? D[k] : 0));
      const vn = mv(R, n), vp = view(pc);
      return dot(vn, add(vp, [0, 0, camD])) < 0;
    });
  }
  const cellPx = () => 2 * f * zoom / camD;
  const maxZoom = () => Math.max(1, 46 / (2 * f / camD)); // höchstens ca. 46 px pro Feld
  function clampPan() {
    // Der Körper soll nie ganz aus dem Bild rutschen
    // ohne Zoom bleibt er mittig; mit wachsendem Zoom darf man weiter verschieben
    const rs = radius * f * zoom / camD, k = Math.min(1, (zoom - 1) * 2);
    const mx = Math.max(0, rs - W * 0.3) * k, my = Math.max(0, rs - H * 0.3) * k;
    panX = Math.max(-mx, Math.min(mx, panX));
    panY = Math.max(-my, Math.min(my, panY));
    fitBtn.hidden = zoom < 1.05 && Math.abs(panX) < 2 && Math.abs(panY) < 2;
  }
  // Zoom so ändern, dass der Bildpunkt, der bei (ax, ay) lag, nun bei (bx, by) liegt
  function zoomAt(z, ax, ay, bx, by, z0 = zoom, px0 = panX, py0 = panY) {
    const nz = Math.min(Math.max(z, 1), maxZoom());
    const ux = (ax - W / 2 - px0) / z0, uy = (ay - H / 2 - py0) / z0;
    zoom = nz;
    panX = bx - W / 2 - ux * nz;
    panY = by - H / 2 - uy * nz;
    clampPan();
    requestRender();
  }

  // ---------- Zeichnen ----------
  let vis = visibleFaces();
  let hinted = null, hintT0 = 0;
  const light = norm([-0.4, 0.7, -0.6]);

  function drawFace(fi) {
    const n = faceNormals[fi], a = fi >> 1, b = (a + 1) % 3, c = (a + 2) % 3;
    const side = n[a] > 0 ? D[a] : 0;
    const P = (u, w) => { const p = [0, 0, 0]; p[a] = side; p[b] = u; p[c] = w; return project(p); };
    const corners = [P(0, 0), P(D[b], 0), P(D[b], D[c]), P(0, D[c])];
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = colors.surface;
    ctx.fill();
    const lit = Math.max(0, -dot(mv(R, n), light));
    ctx.fillStyle = colors.dark ? `rgba(0,0,0,${0.32 - lit * 0.3})` : `rgba(70,55,30,${0.3 - lit * 0.28})`;
    ctx.fill();
    // Raster
    ctx.strokeStyle = colors.dot;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let u = 2; u < D[b]; u += 2) { const [x0, y0] = P(u, 0), [x1, y1] = P(u, D[c]); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    for (let w = 2; w < D[c]; w += 2) { const [x0, y0] = P(0, w), [x1, y1] = P(D[b], w); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
    ctx.stroke();
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Zeichnet ab jetzt in Flächenkoordinaten (u, w) der Fläche fi: die Abbildung wird an der
  // Stelle P0 linear angenähert. So liegen Pfeile flach auf der Fläche und werden beim
  // Wegdrehen schmaler/verkürzt, statt sich aufzustellen. Gibt die beiden Flächenachsen zurück.
  function faceXform(fi, P0) {
    const a = fi >> 1, b = (a + 1) % 3, c = (a + 2) % 3;
    const s0 = project(P0);
    const pb = P0.slice(); pb[b] += 1;
    const pc = P0.slice(); pc[c] += 1;
    const sb = project(pb), sc = project(pc);
    const bx = sb[0] - s0[0], by = sb[1] - s0[1], cx = sc[0] - s0[0], cy = sc[1] - s0[1];
    ctx.setTransform(dpr * bx, dpr * by, dpr * cx, dpr * cy,
      dpr * (s0[0] - bx * P0[b] - cx * P0[c]), dpr * (s0[1] - by * P0[b] - cy * P0[c]));
    return [b, c];
  }
  // Richtung des Pfads bei Bogenlänge s
  function dirAt(v, s) {
    const { pts, cum } = v;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    return norm(sub(pts[k].pos, pts[k - 1].pos));
  }

  const LW = 0.44; // Strichbreite in Flächeneinheiten (ein Feld = 2)
  function arrowStyle(v, now) {
    let alpha = v.waiting ? 0.5 : 1; // angestoßen – fliegt von selbst, sobald frei
    if (v === hinted) alpha = 0.6 + 0.4 * Math.cos((now - hintT0) / 140);
    if (v.removed) {
      const travel = v.total - v.bodyLen;
      alpha = Math.max(0, Math.min(1, (travel - v.s) / (travel * 0.3)));
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ctx.fillStyle = v.blocked ? colors.danger : v.color;
    ctx.lineWidth = LW;
    ctx.lineJoin = 'round';
  }
  // Pfeilspitze flach in der Ebene (b, c) bei Bogenlänge s
  function drawHead(v, s, b, c) {
    const tip = sample(v, s);
    const d3 = dirAt(v, s);
    const dl = Math.hypot(d3[b], d3[c]) || 1;
    const dx = d3[b] / dl, dy = d3[c] / dl, sz = 0.6;
    const x = tip.pos[b], y = tip.pos[c];
    ctx.beginPath();
    ctx.moveTo(x + dx * sz * 0.75, y + dy * sz * 0.75);
    ctx.lineTo(x - dx * sz * 0.7 - dy * sz * 0.75, y - dy * sz * 0.7 + dx * sz * 0.75);
    ctx.lineTo(x - dx * sz * 0.7 + dy * sz * 0.75, y - dy * sz * 0.7 - dx * sz * 0.75);
    ctx.closePath();
    ctx.lineWidth = LW * 0.4;
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = LW;
  }

  function drawArrow(v, now) {
    arrowStyle(v, now);
    ctx.lineCap = 'round';
    for (const pc of pieces(v, v.s, v.s + v.bodyLen)) {
      const fi = pc.face === 'air' ? v.headFace : pc.face;
      if (!vis[fi] || pc.pts.length < 2) continue;
      const mid = mul(pc.pts.reduce(add), 1 / pc.pts.length);
      const [b, c] = faceXform(fi, mid);
      ctx.beginPath();
      pc.pts.forEach((p, i) => (i ? ctx.lineTo(p[b], p[c]) : ctx.moveTo(p[b], p[c])));
      ctx.stroke();
    }
    // Spitze, ebenfalls flach auf der Fläche
    const tip = sample(v, v.s + v.bodyLen);
    const tf = tip.face === 'air' ? v.headFace : tip.face;
    if (vis[tf]) {
      const [b, c] = faceXform(tf, tip.pos);
      drawHead(v, v.s + v.bodyLen, b, c);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  // ---------- Blockgebilde: Feld für Feld von hinten nach vorn zeichnen ----------
  // Der Körper ist nicht konvex, Teile verdecken einander. Jedes sichtbare Feld wird
  // samt dem Stück Pfeil, das darauf liegt, in der Reihenfolge seiner Tiefe gezeichnet.
  const poly = !box.isBox;
  const cellArrows = poly ? cells.map(() => []) : null;
  const geom = poly ? cells.map((cell, ci) => {
    const a = cell.face >> 1, b = (a + 1) % 3, c = (a + 2) % 3;
    const corner = (sb, sc) => { const q = cell.p.slice(); q[b] += sb; q[c] += sc; return q; };
    const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    // Seiten, an denen die Fläche abknickt (Außen- oder Innenkante) – dort eine Kantenlinie
    const edges = [];
    for (const di of box.tangents(ci)) {
      const nb = box.step(ci, di).c;
      if (cells[nb].face === cell.face) continue;
      const d = AX[di];
      const m = add(cell.p, d);
      const o = d[b] !== 0 ? [0, 0, 0].map((_, k) => (k === c ? 1 : 0)) : [0, 0, 0].map((_, k) => (k === b ? 1 : 0));
      edges.push([sub(m, o), add(m, o)]);
    }
    return { corners, edges };
  }) : null;
  if (poly) views.forEach((v) => v.cellArcs.forEach(([c, arc]) => cellArrows[c].push({ v, arc })));

  // Oberflächenfarbe je Richtung vorab mischen (deckend, damit keine Nahtlinien entstehen)
  function rgbOf(str) {
    const m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const n = str.match(/\d+(\.\d+)?/g);
    return n ? n.slice(0, 3).map(Number) : [200, 200, 200];
  }
  const surfRGB = rgbOf(colors.surface);
  function shadeColor(n) {
    const lit = Math.max(0, -dot(mv(R, n), light));
    const [sr, sg, sb] = colors.dark ? [0, 0, 0] : [70, 55, 30];
    const al = colors.dark ? 0.32 - lit * 0.3 : 0.3 - lit * 0.28;
    return `rgb(${surfRGB.map((x, i) => Math.round(x * (1 - al) + [sr, sg, sb][i] * al)).join(',')})`;
  }

  let drawOrder = [];   // sichtbare Felder, hinten → vorn (für das Antippen)
  let quadCache = null; // projizierte Ecken je Feld des letzten Bildes
  function renderPoly(now) {
    const vn = AX.map((n) => mv(R, n));
    const fill = AX.map(shadeColor);
    const list = [];
    for (let c = 0; c < cells.length; c++) {
      const vp = view(cells[c].p);
      const n = vn[cells[c].face];
      if (n[0] * vp[0] + n[1] * vp[1] + n[2] * (vp[2] + camD) >= 0) continue; // abgewandt
      list.push([vp[2], c]);
    }
    list.sort((x, y) => y[0] - x[0]);
    drawOrder = list.map((x) => x[1]);
    quadCache = new Map();
    for (const c of drawOrder) {
      const cell = cells[c], g = geom[c];
      const q = g.corners.map(project);
      quadCache.set(c, q);
      // Fläche leicht vergrößert füllen, damit Nachbarn lückenlos anschließen
      const [mx, my] = project(cell.p);
      ctx.beginPath();
      q.forEach(([x, y], i) => {
        const X = mx + (x - mx) * 1.03, Y = my + (y - my) * 1.03;
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.closePath();
      ctx.fillStyle = fill[cell.face];
      ctx.fill();
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.strokeStyle = colors.dot;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (g.edges.length) {
        ctx.strokeStyle = colors.muted;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [e0, e1] of g.edges) { const [x0, y0] = project(e0), [x1, y1] = project(e1); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Pfeilstücke auf diesem Feld (etwas über den Rand hinaus, damit keine Fugen bleiben)
      const entries = cellArrows[c];
      if (!entries.length) continue;
      let xf = null;
      for (const { v, arc } of entries) {
        if (v.gone) continue;
        const tipS = v.s + v.bodyLen;
        const lo = Math.max(v.s, arc - 1.1), hi = Math.min(tipS, arc + 1.1);
        const hasHead = tipS >= arc - 1 && tipS < arc + 1;
        if (hi - lo < 1e-3 && !hasHead) continue;
        if (!xf) xf = faceXform(cell.face, cell.p);
        const [b, cc] = xf;
        arrowStyle(v, now);
        if (hi - lo >= 1e-3) {
          ctx.lineCap = lo === v.s ? 'round' : 'butt';
          ctx.beginPath();
          let first = true;
          for (const pc of pieces(v, lo, hi)) for (const p of pc.pts) {
            first ? ctx.moveTo(p[b], p[cc]) : ctx.lineTo(p[b], p[cc]);
            first = false;
          }
          ctx.stroke();
        }
        if (hasHead) drawHead(v, tipS, b, cc);
        ctx.globalAlpha = 1;
      }
      if (xf) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // Davonfliegende Pfeile: der Teil in der Luft zuletzt
    for (const v of views) {
      if (v.gone || !v.removed || !vis[v.headFace]) continue;
      const tipS = v.s + v.bodyLen;
      if (tipS <= v.airStart) continue;
      arrowStyle(v, now);
      ctx.lineCap = 'round';
      const lo = Math.max(v.s, v.airStart);
      const [b, c] = faceXform(v.headFace, sample(v, lo).pos);
      ctx.beginPath();
      let first = true;
      for (const pc of pieces(v, lo, tipS)) for (const p of pc.pts) { first ? ctx.moveTo(p[b], p[c]) : ctx.lineTo(p[b], p[c]); first = false; }
      ctx.stroke();
      drawHead(v, tipS, b, c);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  // Vorderstes Feld unter dem Finger → Pfeil darauf (oder auf einem Nachbarfeld)
  function pickPoly(x, y) {
    if (!quadCache) return null;
    const inQuad = (q) => {
      let sign = 0;
      for (let k = 0; k < 4; k++) {
        const [x0, y0] = q[k], [x1, y1] = q[(k + 1) % 4];
        const cr = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
        if (cr !== 0) { if (sign && Math.sign(cr) !== sign) return false; sign = Math.sign(cr); }
      }
      return true;
    };
    for (let i = drawOrder.length - 1; i >= 0; i--) {
      const c = drawOrder[i];
      if (!inQuad(quadCache.get(c))) continue;
      if (occ[c] !== -1) return views[occ[c]];
      // leeres Feld getroffen: nächster Pfeil auf einem Nachbarfeld
      let best = null, bestD = cellPx() * 0.9;
      for (const di of box.tangents(c)) {
        const nb = box.step(c, di).c;
        if (occ[nb] === -1 || !quadCache.has(nb)) continue;
        const [px, py] = project(cells[nb].p);
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) { bestD = d; best = views[occ[nb]]; }
      }
      return best;
    }
    return null;
  }

  let frameReq = 0;
  function requestRender() { if (!frameReq) frameReq = requestAnimationFrame(render); }
  const anims = new Set();

  function render(now) {
    frameReq = 0;
    if (!canvas.isConnected) return;
    for (const an of [...anims]) {
      const t = Math.min(1, (now - an.t0) / an.ms);
      an.tick(an.ease(t));
      if (t >= 1) { anims.delete(an); an.done(); }
    }
    vis = visibleFaces();
    ctx.clearRect(0, 0, W, H);
    const tR = performance.now();
    if (poly) renderPoly(now);
    else {
      // Flächen von hinten nach vorn (nur sichtbare; Quader ist konvex)
      vis.forEach((on, fi) => on && drawFace(fi));
      for (const v of views) if (!v.gone) drawArrow(v, now);
    }
    renderMs = performance.now() - tR;
    if (anims.size || hinted) requestRender();
  }
  let renderMs = 0;

  function animate(ms, ease, tick) {
    return new Promise((done) => { anims.add({ t0: performance.now(), ms, ease, tick, done }); requestRender(); });
  }
  const easeIn = (t) => t * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

  // ---------- Spiellogik ----------
  function tap(v) {
    if (over || v.removed || v.busy) return;
    if (hinted) hinted = null;
    const dist = blockDistance(box, v.a, occ);
    if (dist === null) launch(v);
    else bumpInto(v, dist);
  }

  async function launch(v) {
    v.busy = true;
    v.waiting = false;
    if (hinted === v) hinted = null;
    v.removed = true;
    for (const c of v.a.cells) occ[c] = -1;
    remaining--;
    updateHud();
    shell.vibrate(10);
    sound.whoosh();
    releaseWaiting();
    const travel = v.total - v.bodyLen;
    await animate(Math.min(160 + travel * 6, 500), easeIn, (t) => { v.s = travel * t; });
    v.gone = true;
    requestRender();
    if (remaining === 0 && !over) win();
  }

  // Angestoßene Pfeile warten: sobald ihre Bahn frei ist, fliegen sie kurz nacheinander von selbst.
  function releaseWaiting() {
    if (over) return;
    for (const u of views) {
      if (!u.waiting || u.removed || u.busy) continue;
      if (blockDistance(box, u.a, occ) === null) {
        u.waiting = false;
        setTimeout(() => { if (!over && !u.removed && !u.busy) launch(u); }, 90);
      }
    }
  }

  async function bumpInto(v, dist) {
    v.busy = true;
    v.blocked = true;
    lives--;
    updateHud();
    shell.vibrate([30, 40, 30]);
    sound.bump();
    const bump = dist * 2 + 0.6;
    await animate(Math.min(90 + bump * 12, 280), easeOut, (t) => { v.s = bump * t; });
    await animate(180, easeOut, (t) => { v.s = bump * (1 - t); });
    v.blocked = false;
    v.busy = false;
    requestRender();
    if (lives <= 0) { if (!over) lose(); return; }
    v.waiting = true;
    releaseWaiting(); // falls die Bahn inzwischen frei geworden ist
  }

  function updateHud() {
    shell.setLives(lives);
    shell.setCounter(`${remaining} ${remaining === 1 ? 'Pfeil' : 'Pfeile'} übrig`);
    if (hintBtn) hintBtn.classList.toggle('a3d-no-hint', lives <= 1);
  }

  // Jeder Tipp kostet ein Leben. Mit dem letzten Herz gibt es keinen Tipp mehr.
  let hintsUsed = 0;
  function hint() {
    if (over) return;
    if (hinted && !hinted.removed) { show(hinted); return; } // Tipp läuft schon – kostet nichts extra
    if (lives <= 1) { sound.bump(); return; }
    const free = views.filter((v) => !v.removed && !v.busy && blockDistance(box, v.a, occ) === null);
    if (!free.length) return;
    lives--;
    hintsUsed++;
    updateHud();
    // Bevorzugt einen Pfeil, dessen Spitze schon gut sichtbar ist
    const seen = free.filter((v) => facing(v.headFace) > 0.35);
    const pool = seen.length ? seen : free;
    hinted = pool[Math.floor(Math.random() * pool.length)];
    hintT0 = performance.now();
    show(hinted);
    requestRender();
  }
  // Wie direkt eine Fläche zur Kamera zeigt (1 = frontal, ≤ 0 = abgewandt)
  const facing = (fi) => -norm(mv(R, faceNormals[fi]))[2];

  // Würfel drehen (falls nötig) und Ausschnitt verschieben, bis der Pfeil gut zu sehen ist
  async function show(v) {
    if (facing(v.headFace) < 0.35) await turnTo(faceNormals[v.headFace]);
    if (zoom < 1.05) return;
    const head = cells[v.a.cells[v.a.cells.length - 1]].p;
    const [x, y] = project(head);
    const m = 40;
    if (x > m && x < W - m && y > m && y < H - m) return;
    const px0 = panX, py0 = panY, dx = W / 2 - x, dy = H / 2 - y;
    await animate(250, easeInOut, (t) => { panX = px0 + dx * t; panY = py0 + dy * t; clampPan(); });
  }

  // Würfel so drehen, dass die Fläche mit Normale n zur Kamera zeigt
  function turnTo(n) {
    const from = norm(mv(R, n));
    const target = norm([0.3, 0.35, -1]);
    const axis = cross(from, target);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(from, target))));
    if (Math.hypot(...axis) < 1e-6) return Promise.resolve();
    const R0 = R, u = norm(axis);
    return animate(400, easeInOut, (t) => { R = mm(rotAxis(u, ang * t), R0); });
  }

  function win() {
    over = true;
    const details = [mistakesText(LIVES - lives - hintsUsed)];
    if (hintsUsed) details.push(`${hintsUsed} ${hintsUsed === 1 ? 'Tipp' : 'Tipps'}`);
    shell.win(details);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    shell.lose('Jeder Pfeil gleitet auf seiner Fläche geradeaus bis zur Außenkante. Andere Pfeile und Wände halten ihn auf. Dreh den Körper und prüfe, was im Weg liegt.');
  }

  // ---------- Eingabe ----------
  // Ein Finger wischen: drehen. Zwei Finger: zoomen und verschieben. Mausrad: zoomen.
  // Ein Tippen zählt nur, wenn der Finger kaum bewegt wurde.
  const pointers = new Map();
  let drag = null, pinch = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    pinch = {
      d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, px0: panX, py0: panY,
      mx: (a.x + b.x) / 2 - canvasLeft(), my: (a.y + b.y) / 2 - canvasTop(),
    };
  }
  const canvasLeft = () => canvas.getBoundingClientRect().left;
  const canvasTop = () => canvas.getBoundingClientRect().top;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) pointers.clear(); // erster Finger: evtl. hängengebliebene Zeiger vergessen
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    } else if (pointers.size === 2) {
      if (drag) drag.moved = true;
      startPinch();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - canvasLeft(), my = (a.y + b.y) / 2 - canvasTop();
      zoomAt(pinch.z0 * d / pinch.d0, pinch.mx, pinch.my, mx, my, pinch.z0, pinch.px0, pinch.py0);
    } else if (pointers.size === 1 && drag) {
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
      if (drag.moved) {
        // hineingezoomt langsamer drehen, damit man fein steuern kann
        const k = 2.6 / Math.min(W, H) * 1.6 / Math.sqrt(zoom);
        R = mm(mm(rotX(-(e.clientY - drag.ly) * k), rotY(-(e.clientX - drag.lx) * k)), R);
        drag.lx = e.clientX; drag.ly = e.clientY;
        requestRender();
      }
    }
  });
  const endPointer = (e) => {
    const wasTap = pointers.size === 1 && drag && !drag.moved && e.type === 'pointerup';
    pointers.delete(e.pointerId);
    pinch = null;
    if (wasTap) {
      const r = canvas.getBoundingClientRect();
      const v = pick(e.clientX - r.left, e.clientY - r.top);
      if (v) tap(v);
    }
    if (pointers.size === 1) {
      // nach dem Zoomen mit dem verbleibenden Finger weiterdrehen
      const [p] = [...pointers.values()];
      drag = { x: p.x, y: p.y, lx: p.x, ly: p.y, moved: true };
    } else if (pointers.size === 2) startPinch();
    else drag = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), x, y, x, y);
  }, { passive: false });
  fitBtn.addEventListener('click', () => {
    const z0 = zoom, px0 = panX, py0 = panY;
    animate(220, easeInOut, (t) => {
      zoom = z0 + (1 - z0) * t; panX = px0 * (1 - t); panY = py0 * (1 - t); clampPan();
    });
  });

  function pick(x, y) {
    if (poly) return pickPoly(x, y);
    let best = null, bestD = Math.max(cellPx() * 0.55, 6);
    for (const v of views) {
      if (v.removed) continue;
      for (const pc of pieces(v, v.s, v.s + v.bodyLen)) {
        if (pc.face === 'air' || !vis[pc.face]) continue;
        const sp = pc.pts.map(project);
        for (let k = 1; k < sp.length; k++) {
          const d = distSeg(x, y, sp[k - 1], sp[k]);
          if (d < bestD) { bestD = d; best = v; }
        }
      }
    }
    return best;
  }
  function distSeg(px, py, [x1, y1], [x2, y2]) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
  }

  const ro = new ResizeObserver(() => { if (!canvas.isConnected) ro.disconnect(); else resize(); });
  ro.observe(shell.board);
  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) {
    window.__game = {
      freeArrows: () => views.filter((v) => !v.removed && blockDistance(box, v.a, occ) === null),
      // Bildschirmpunkt (relativ zum Canvas) auf einem sichtbaren Teil des Pfeils
      screenPoint(v) {
        if (poly) {
          for (const c of v.a.cells) {
            if (!quadCache || !quadCache.has(c)) continue;
            const p = project(cells[c].p);
            if (pickPoly(p[0], p[1]) === v) return p;
          }
          return null;
        }
        for (const pc of pieces(v, 0, v.bodyLen)) if (pc.face !== 'air' && vis[pc.face]) return project(pc.pts[0]);
        return null;
      },
      views, tap, turnTo: (v) => turnTo(faceNormals[v.headFace]),
      state: () => ({ lives, remaining, zoom, panX, panY, hintsUsed, drawn: drawOrder.length, renderMs }),
      pickAt: (x, y) => pick(x, y),
    };
  }

  updateHud();
  resize();
}
