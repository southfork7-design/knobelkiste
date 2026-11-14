// Pfeilwürfel: 3D-Darstellung (eigener kleiner Renderer auf Canvas),
// Drehen per Wischen, Antippen von Pfeilen.
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
  const ctx = canvas.getContext('2d');

  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const colors = {
    surface: col('--surface'), muted: col('--muted'), dot: col('--dot'),
    danger: col('--danger'), dark: matchMedia('(prefers-color-scheme: dark)').matches,
  };

  // ---------- Pfade der Pfeile (in 3D, mit Flächenzuordnung je Segment) ----------
  const views = arrows.map((a, i) => {
    const pts = [{ pos: cells[a.cells[0]].p, face: cells[a.cells[0]].face }];
    for (let k = 1; k < a.cells.length; k++) {
      const A = cells[a.cells[k - 1]], B = cells[a.cells[k]];
      if (A.face !== B.face) pts.push({ pos: add(A.p, B.n), face: A.face });
      pts.push({ pos: B.p, face: B.face });
    }
    const head = a.cells[a.cells.length - 1];
    const hf = cells[head].face;
    const d = AX[a.dir];
    for (const c of box.ray(head, a.dir)) pts.push({ pos: cells[c].p, face: hf });
    const last = pts[pts.length - 1].pos;
    const edge = add(last, d);
    pts.push({ pos: edge, face: hf });
    pts.push({ pos: add(edge, mul(d, Math.max(...D) * 2.5)), face: 'air' });
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(...sub(pts[k].pos, pts[k - 1].pos)));
    // Körperlänge = Länge bis zum Kopf
    let headIdx = 0;
    for (let k = 0; k < pts.length; k++) if (pts[k].pos === cells[head].p) { headIdx = k; break; }
    return {
      a, pts, cum, headFace: hf, bodyLen: cum[headIdx], total: cum[cum.length - 1],
      color: col(PALETTE[i % PALETTE.length]), s: 0, removed: false, gone: false, blocked: false,
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

  // ---------- Kamera ----------
  let R = mm(rotX(-0.5), rotY(0.65));
  let W = 0, H = 0, f = 1, camD = 1, cx = 0, cy = 0;
  const radius = Math.hypot(...D) / 2;

  function resize() {
    const r = shell.board.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camD = radius * 4;
    f = (Math.min(W, H) * 0.47) * camD / radius;
    cx = W / 2; cy = H / 2;
    requestRender();
  }
  const view = (p) => mv(R, sub(p, center));
  function project(p) {
    const v = view(p);
    const z = v[2] + camD;
    return [cx + v[0] * f / z, cy - v[1] * f / z];
  }
  const faceNormals = AX;
  function visibleFaces() {
    return faceNormals.map((n, fi) => {
      // Flächenmittelpunkt
      const pc = center.map((c, k) => (n[k] === 0 ? c : n[k] > 0 ? D[k] : 0));
      const vn = mv(R, n), vp = view(pc);
      return dot(vn, add(vp, [0, 0, camD])) < 0;
    });
  }
  const cellPx = () => 2 * f / camD;

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
    ctx.fillStyle = colors.dark ? `rgba(0,0,0,${0.5 - lit * 0.45})` : `rgba(70,55,30,${0.3 - lit * 0.28})`;
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

  function drawArrow(v, now) {
    const px = cellPx();
    const lw = Math.max(2, px * 0.22);
    let alpha = 1;
    if (v === hinted) alpha = 0.55 + 0.45 * Math.cos((now - hintT0) / 160);
    if (v.removed) alpha = Math.max(0, 1 - Math.max(0, v.s - (v.total - v.bodyLen) * 0.55) / ((v.total - v.bodyLen) * 0.45));
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ctx.fillStyle = v.blocked ? colors.danger : v.color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pc of pieces(v, v.s, v.s + v.bodyLen)) {
      const visible = pc.face === 'air' ? vis[v.headFace] : vis[pc.face];
      if (!visible || pc.pts.length < 2) continue;
      ctx.beginPath();
      pc.pts.forEach((p, i) => { const [x, y] = project(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    // Spitze
    const tip = sample(v, v.s + v.bodyLen);
    const tipVisible = tip.face === 'air' ? vis[v.headFace] : vis[tip.face];
    if (tipVisible) {
      const back = sample(v, v.s + v.bodyLen - 0.5);
      const [x1, y1] = project(tip.pos), [x0, y0] = project(back.pos);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const sz = px * 0.3;
      ctx.save();
      ctx.translate(x1, y1); ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(sz * 0.75, 0); ctx.lineTo(-sz * 0.7, -sz * 0.75); ctx.lineTo(-sz * 0.7, sz * 0.75);
      ctx.closePath();
      ctx.lineWidth = lw * 0.4;
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
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
    // Flächen von hinten nach vorn (nur sichtbare; Quader ist konvex)
    vis.forEach((on, fi) => on && drawFace(fi));
    for (const v of views) if (!v.gone) drawArrow(v, now);
    if (anims.size || hinted) requestRender();
  }

  function animate(ms, ease, tick) {
    return new Promise((done) => { anims.add({ t0: performance.now(), ms, ease, tick, done }); requestRender(); });
  }
  const easeIn = (t) => t * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

  // ---------- Spiellogik ----------
  async function tap(v) {
    if (over || v.removed || v.busy) return;
    hinted = null;
    const dist = blockDistance(box, v.a, occ);
    v.busy = true;
    if (dist === null) {
      v.removed = true;
      for (const c of v.a.cells) occ[c] = -1;
      remaining--;
      updateHud();
      shell.vibrate(10);
      sound.whoosh();
      const travel = v.total - v.bodyLen;
      await animate(450 + travel * 12, easeIn, (t) => { v.s = travel * t; });
      v.gone = true;
      requestRender();
      if (remaining === 0 && !over) { over = true; shell.win([mistakesText(LIVES - lives)]); onWin && onWin(level); }
    } else {
      v.blocked = true;
      lives--;
      updateHud();
      shell.vibrate([30, 40, 30]);
      sound.bump();
      const bump = dist * 2 + 0.6;
      await animate(120 + bump * 25, easeOut, (t) => { v.s = bump * t; });
      await animate(220, easeOut, (t) => { v.s = bump * (1 - t); });
      v.blocked = false;
      v.busy = false;
      requestRender();
      if (lives <= 0 && !over) {
        over = true;
        shell.lose('Jeder Pfeil gleitet auf seiner Seite bis zur Kante. Dreh den Würfel und prüfe, was im Weg liegt.');
      }
    }
  }

  function updateHud() {
    shell.setLives(lives);
    shell.setCounter(`${remaining} übrig`);
  }

  function hint() {
    const free = views.filter((v) => !v.removed && blockDistance(box, v.a, occ) === null);
    if (!free.length) return;
    // Bevorzugt einen Pfeil, dessen Spitze schon sichtbar ist
    const seen = free.filter((v) => vis[v.headFace]);
    hinted = (seen.length ? seen : free)[Math.floor(Math.random() * (seen.length || free.length))];
    hintT0 = performance.now();
    if (!vis[hinted.headFace]) turnTo(faceNormals[hinted.headFace]);
    requestRender();
  }

  // Würfel so drehen, dass die Fläche mit Normale n zur Kamera zeigt
  function turnTo(n) {
    const from = norm(mv(R, n));
    const target = norm([0.3, 0.35, -1]);
    const axis = cross(from, target);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(from, target))));
    if (Math.hypot(...axis) < 1e-6) return;
    const R0 = R, u = norm(axis);
    animate(500, easeInOut, (t) => { R = mm(rotAxis(u, ang * t), R0); });
  }

  // ---------- Eingabe: Wischen dreht, Tippen wählt ----------
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
    if (drag.moved) {
      const k = 2.6 / Math.min(W, H) * 1.6;
      R = mm(mm(rotX(-(e.clientY - drag.ly) * k), rotY(-(e.clientX - drag.lx) * k)), R);
      drag.lx = e.clientX; drag.ly = e.clientY;
      requestRender();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      const r = canvas.getBoundingClientRect();
      const v = pick(e.clientX - r.left, e.clientY - r.top);
      if (v) tap(v);
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  function pick(x, y) {
    let best = null, bestD = cellPx() * 0.55;
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
        for (const pc of pieces(v, 0, v.bodyLen)) if (pc.face !== 'air' && vis[pc.face]) return project(pc.pts[0]);
        return null;
      },
      views, tap, turnTo: (v) => turnTo(faceNormals[v.headFace]),
    };
  }

  updateHud();
  resize();
}
