// Kuschelfracht: Darstellung, Animation und Bedienung.
// Eine Form mit dem Finger ziehen → sie folgt Feld für Feld und bleibt an Hindernissen stehen.
// Fährt sie auf das Feld eines gleichfarbigen Plüschtiers, fällt es hinein (ein Tier je Quadrat);
// andersfarbige Tiere versperren den Weg. Eine volle Form verschwindet. Räume am Rand geben ihr vorderstes Tier an eine gleichfarbige
// Form ab, die auf dem Türfeld steht. Graue Formen sind Hindernisse; Formen mit ↔/↕ lassen sich
// nur waagerecht/senkrecht schieben; Formen mit Schloss öffnen sich, wenn genug andere verschwunden sind.
// Zwei Finger: zoomen und verschieben (Mausrad am Computer); ist hineingezoomt, verschiebt ein Finger
// auf freier Fläche den Ausschnitt. „Ganzes Bild“ stellt zurück.
// 3 Herzen: Tipp (nicht mit dem letzten) und Sackgasse (sicher erkannt, wird zurückgenommen) kosten je ein Herz.
// Der Stand im laufenden Level wird im Browser gespeichert; „Neu“, „Nochmal“ und das nächste Level verwerfen ihn.
import {
  initialState, cloneState, occupancy, step, stepTarget, size, applyMove, isWon, plushLeft, deadEnd,
  isLocked, stateKey, packState, unpackState, solve,
} from './model.js';
import { generateLevel } from './generator.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const S = 10;                 // Feldgröße (SVG-Einheiten)
const LIVES = 3;
const MAX_UNIT = 60;          // höchstens so viele Pixel je Feld beim Zoomen
const SAVE_KEY = 'knobelkiste-plush-stand';
const RULES = 'Formen lassen sich Feld für Feld ziehen. Fährt eine Form auf ein gleichfarbiges Plüschtier, fällt es hinein – je Quadrat eins. Andersfarbige Tiere versperren den Weg. Eine Sackgasse entsteht, wenn eine Form ihre Tiere nie mehr erreichen kann.';
const FLY_MS = 190, FADE_MS = 200;
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const fill = (c) => `var(--f${c})`;

// Plüschtier (eigene Figur: rundes Tier mit Ohren), Mittelpunkt (0,0), Durchmesser ~1
function plushFig(c) {
  const g = el('g', { class: 'pl' });
  g.append(
    el('circle', { cx: -0.27, cy: -0.27, r: 0.15, class: 'pl-body', style: `fill:${fill(c)}` }),
    el('circle', { cx: 0.27, cy: -0.27, r: 0.15, class: 'pl-body', style: `fill:${fill(c)}` }),
    el('circle', { cx: -0.27, cy: -0.27, r: 0.07, class: 'pl-ear' }),
    el('circle', { cx: 0.27, cy: -0.27, r: 0.07, class: 'pl-ear' }),
    el('circle', { cx: 0, cy: 0.03, r: 0.4, class: 'pl-body', style: `fill:${fill(c)}` }),
    el('ellipse', { cx: 0, cy: 0.15, rx: 0.17, ry: 0.12, class: 'pl-snout' }),
    el('circle', { cx: 0, cy: 0.1, r: 0.045, class: 'pl-eye' }),
    el('circle', { cx: -0.14, cy: -0.04, r: 0.045, class: 'pl-eye' }),
    el('circle', { cx: 0.14, cy: -0.04, r: 0.045, class: 'pl-eye' }),
  );
  return g;
}
const placed = (g, x, y, k) => { g.setAttribute('transform', `translate(${x} ${y}) scale(${k})`); return g; };

// ---------- Tipp im Hintergrund ----------
let worker = null, nextId = 1;
const waiting = new Map();
function findHint(L, s) {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); w(e.data.result); } };
      worker.onerror = () => { worker = false; waiting.forEach((w) => w(undefined)); waiting.clear(); };
    } catch { worker = false; }
  }
  const local = () => new Promise((done) => setTimeout(() => { const r = solve(L, s, { ms: 2500 }); done(r && r.length ? r[0] : null); }, 30));
  if (!worker) return local();
  return new Promise((done) => {
    const id = nextId++;
    waiting.set(id, (r) => (r === undefined ? local().then(done) : done(r)));
    worker.postMessage({ id, L, state: packState(s) });
  });
}

export function mountPlush(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  let s = initialState(L);
  let occ = occupancy(L, s);
  const history = [];
  let busy = false, over = false;
  let lives = LIVES, hints = 0, mistakes = 0, moves = 0;
  let t0 = performance.now();

  // Lösungsweg des Generators: Zustände merken, damit ein Tipp auf dem Weg sofort kommt
  const planKeys = new Map();
  {
    let st = initialState(L);
    L.plan.forEach((m, i) => { planKeys.set(stateKey(st), i); const r = applyMove(L, st, m); if (r) st = r.state; });
  }

  const shell = createShell(root, {
    name: 'Kuschelfracht', level, lives: LIVES, onHint: () => hint(), onUndo: () => undo(),
    onExit: (how) => { if (how !== 'menu') clearSave(); onExit(how); },
  });
  const hintBtn = root.querySelector('[data-act="hint"]');

  const wrap = document.createElement('div');
  wrap.className = 'plush-wrap';
  shell.board.appendChild(wrap);
  const view = document.createElement('div');
  view.className = 'plush-view';
  const svg = el('svg', { class: 'board plush', preserveAspectRatio: 'none' });
  const fitBtn = document.createElement('button');
  fitBtn.className = 'plush-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  const toast = document.createElement('div');
  toast.className = 'toast';
  view.append(svg, fitBtn, toast);
  wrap.appendChild(view);

  // ---------- Geometrie ----------
  const M = L.rooms.length ? S * 1.35 : S * 0.4;    // Rand (Platz für Räume)
  const W = L.cols * S, H = L.rows * S;
  const EW = W + 2 * M, EH = H + 2 * M;
  const scene = el('g', { transform: `translate(${M} ${M})` });
  svg.appendChild(scene);
  const cx = (i) => (i % L.cols + 0.5) * S, cy = (i) => (((i / L.cols) | 0) + 0.5) * S;
  const ax = (a) => (a % L.cols) * S, ay = (a) => ((a / L.cols) | 0) * S;

  // Untergrund
  const bg = el('g');
  bg.appendChild(el('rect', { x: -1.5, y: -1.5, width: W + 3, height: H + 3, rx: 3, class: 'tray' }));
  for (let i = 0; i < L.cols * L.rows; i++) {
    if (L.wall[i]) {
      // Wand = Aussparung im Brett (am Rand bis über den Rahmen hinaus)
      const x = i % L.cols, y = (i / L.cols) | 0, m = 1.8;
      const x0 = x * S - (x === 0 ? m : 0.3), y0 = y * S - (y === 0 ? m : 0.3);
      const x1 = (x + 1) * S + (x === L.cols - 1 ? m : 0.3), y1 = (y + 1) * S + (y === L.rows - 1 ? m : 0.3);
      bg.appendChild(el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, class: 'wall' }));
    }
    else bg.appendChild(el('rect', { x: cx(i) - S / 2 + 0.5, y: cy(i) - S / 2 + 0.5, width: S - 1, height: S - 1, rx: 1.6, class: 'cell' }));
  }
  scene.appendChild(bg);
  const roomsG = el('g'), plushG = el('g'), hintG = el('g'), piecesG = el('g'), fx = el('g');
  scene.append(roomsG, plushG, hintG, piecesG, fx);

  // Raum: Kästchen außen vor dem Türfeld
  const roomBox = (r) => {
    const d = L.rooms[r].door;
    const off = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[L.rooms[r].side];
    return [cx(d) + off[0] * S * 1.02, cy(d) + off[1] * S * 1.02, off];
  };

  // ---------- Formen zeichnen ----------
  // Je Form eine Gruppe: Körper (Umriss + Fläche), je Quadrat ein Sitzplatz und ein Tier.
  const vis = new Map();   // p -> { x, y, tx, ty, g, slots, filled, taken, pending, ghost, fade }
  function shapeRects(cells, inset) {
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    const has = (x, y) => set.has(`${x},${y}`);
    const out = [];
    for (const [x, y] of cells) {
      out.push([x * S + inset, y * S + inset, S - 2 * inset, S - 2 * inset]);
      if (has(x + 1, y)) out.push([x * S + S - inset - 1, y * S + inset, 2 * inset + 2, S - 2 * inset]);
      if (has(x, y + 1)) out.push([x * S + inset, y * S + S - inset - 1, S - 2 * inset, 2 * inset + 2]);
      if (has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1)) out.push([x * S + S - inset - 1, y * S + S - inset - 1, 2 * inset + 2, 2 * inset + 2]);
    }
    return out;
  }
  function buildPiece(p) {
    const piece = L.pieces[p];
    const locked = isLocked(L, s, p);
    const kind = piece.color < 0 ? 'stone' : locked ? 'locked' : 'colored';
    const g = el('g', { class: `piece ${kind}`, 'data-p': p });
    const body = el('g');
    for (const [x, y, w, h] of shapeRects(piece.cells, 0.45)) body.appendChild(el('rect', { x, y, width: w, height: h, rx: 1.8, class: 'edge' }));
    for (const [x, y, w, h] of shapeRects(piece.cells, 0.95)) {
      body.appendChild(el('rect', { x, y, width: w, height: h, rx: 1.4, class: 'face', style: kind === 'colored' ? `fill:${fill(piece.color)}` : '' }));
    }
    g.appendChild(body);
    const slots = [];
    if (kind === 'colored') {
      piece.cells.forEach(([x, y]) => {
        const px = x * S + S / 2, py = y * S + S / 2;
        if (piece.axis) {
          const d = piece.axis === 1
            ? `M${px - 4.1} ${py} l1.2 -1.1 M${px - 4.1} ${py} l1.2 1.1 M${px + 4.1} ${py} l-1.2 -1.1 M${px + 4.1} ${py} l-1.2 1.1`
            : `M${px} ${py - 4.1} l-1.1 1.2 M${px} ${py - 4.1} l1.1 1.2 M${px} ${py + 4.1} l-1.1 -1.2 M${px} ${py + 4.1} l1.1 -1.2`;
          g.appendChild(el('path', { d, class: 'axis' }));
        }
        const seat = el('circle', { cx: px, cy: py, r: 2.7, class: 'seat' });
        const fig = placed(plushFig(piece.color), px, py, S * 0.62);
        g.append(seat, fig);
        slots.push({ seat, fig });
      });
    } else if (kind === 'locked') {
      // Schloss mit Zahl im Quadrat nahe der Mitte
      const mx = piece.cells.reduce((a, c) => a + c[0], 0) / piece.cells.length;
      const my = piece.cells.reduce((a, c) => a + c[1], 0) / piece.cells.length;
      const [lx, ly] = piece.cells.slice().sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my))[0];
      const px = lx * S + S / 2, py = ly * S + S / 2;
      g.append(
        el('path', { d: `M${px - 1.6} ${py - 0.6} v-1.4 a1.6 1.6 0 0 1 3.2 0 v1.4`, class: 'shackle' }),
        el('rect', { x: px - 2.5, y: py - 0.8, width: 5, height: 4, rx: 0.8, class: 'lockbody' }),
      );
      const t = el('text', { x: px, y: py + 1.3, class: 'locknum', 'dominant-baseline': 'central' });
      t.textContent = piece.lock - s.gone;
      g.appendChild(t);
    } else {
      piece.cells.forEach(([x, y], k) => {
        g.appendChild(el('circle', { cx: x * S + 3.3 + (k % 2) * 3, cy: y * S + 3.6 + (k % 3), r: 0.7, class: 'speck' }));
        g.appendChild(el('circle', { cx: x * S + 6.6 - (k % 2), cy: y * S + 6.8, r: 0.55, class: 'speck' }));
      });
    }
    return { g, slots };
  }
  function showFill(v) {
    v.slots.forEach((sl, i) => { sl.fig.style.display = v.filled[i] ? '' : 'none'; sl.seat.style.display = v.filled[i] ? 'none' : ''; });
  }
  function placePiece(v) { v.g.setAttribute('transform', `translate(${v.x} ${v.y})${v.fade ? ` translate(${v.fcx} ${v.fcy}) scale(${1 + 0.15 * v.fade}) translate(${-v.fcx} ${-v.fcy})` : ''}`); }

  function rebuildPieces() {
    piecesG.replaceChildren();
    fx.replaceChildren();
    flights.length = 0;
    vis.clear();
    for (let p = 0; p < L.pieces.length; p++) {
      if (s.pos[p] < 0) continue;
      const { g, slots } = buildPiece(p);
      const n = s.fill[p], k = size(L, p);
      const v = { x: ax(s.pos[p]), y: ay(s.pos[p]), tx: ax(s.pos[p]), ty: ay(s.pos[p]), g, slots, filled: Array.from({ length: k }, (_, i) => i < n), taken: Array.from({ length: k }, (_, i) => i < n), pending: 0, ghost: false, fade: 0 };
      vis.set(p, v);
      showFill(v);
      placePiece(v);
      piecesG.appendChild(g);
    }
  }
  function renderPlush() {
    plushG.replaceChildren();
    for (let i = 0; i < s.plush.length; i++) {
      if (s.plush[i] < 0) continue;
      const g = placed(plushFig(s.plush[i]), cx(i), cy(i), S * 0.86);
      g.dataset.cell = i;
      plushG.appendChild(g);
    }
  }
  function renderRooms() {
    roomsG.replaceChildren();
    L.rooms.forEach((room, r) => {
      const [bx, by, off] = roomBox(r);
      const left = room.queue.length - s.room[r];
      const g = el('g', { class: 'room' });
      g.appendChild(el('rect', { x: bx - S * 0.48, y: by - S * 0.48, width: S * 0.96, height: S * 0.96, rx: 2, class: 'room-box' }));
      // Öffnung zum Brett
      const ox2 = bx - off[0] * S * 0.48, oy2 = by - off[1] * S * 0.48;
      g.appendChild(el('line', { x1: ox2 - off[1] * 3, y1: oy2 - off[0] * 3, x2: ox2 + off[1] * 3, y2: oy2 + off[0] * 3, class: 'room-door' }));
      if (left > 0) {
        g.appendChild(placed(plushFig(room.queue[s.room[r]]), bx, by - 0.4, S * 0.62));
        // dahinter wartende Tiere als Punkte (Reihenfolge von der Tür weg)
        const next = room.queue.slice(s.room[r] + 1);
        next.forEach((c, j) => {
          const along = off[0] ? [0, 1] : [1, 0];
          const k = j - (next.length - 1) / 2;
          g.appendChild(el('circle', { cx: bx + off[0] * 3.9 + along[0] * k * 2, cy: by + off[1] * 3.9 + along[1] * k * 2, r: 0.85, class: 'room-dot', style: `fill:${fill(c)}` }));
        });
        const t = el('text', { x: bx + S * 0.33, y: by - S * 0.31, class: 'room-count', 'dominant-baseline': 'central' });
        t.textContent = left;
        g.appendChild(t);
      }
      roomsG.appendChild(g);
    });
  }
  let hintMove = null;
  function renderHint() {
    hintG.replaceChildren();
    piecesG.querySelectorAll('.piece.hint').forEach((g) => g.classList.remove('hint'));
    if (!hintMove) return;
    const { p, path } = hintMove;
    const v = vis.get(p);
    if (v) v.g.classList.add('hint');
    // Ziel als gestrichelter Umriss, Weg als Punkte
    const a = path[path.length - 1];
    const ghost = el('g', { transform: `translate(${ax(a)} ${ay(a)})`, class: 'hint-ghost' });
    for (const [x, y, w, h] of shapeRects(L.pieces[p].cells, 0.9)) ghost.appendChild(el('rect', { x, y, width: w, height: h, rx: 1.4 }));
    hintG.appendChild(ghost);
    const c0 = L.pieces[p].cells[0];
    const pts = path.map((q) => `${ax(q) + c0[0] * S + S / 2},${ay(q) + c0[1] * S + S / 2}`).join(' ');
    if (path.length > 1) hintG.appendChild(el('polyline', { points: pts, class: 'hint-path' }));
  }
  function renderAll() {
    rebuildPieces();
    renderPlush();
    renderRooms();
    renderHint();
    updateCounter();
  }
  function updateCounter() {
    const n = plushLeft(L, s);
    shell.setCounter(`${n} Tier${n === 1 ? '' : 'e'}`);
  }
  function updateHud() {
    shell.setLives(lives);
    hintBtn.classList.toggle('plush-no-hint', lives <= 1);
  }

  // ---------- Bewegung und Flüge (eine Bildschleife) ----------
  const flights = [];       // { g, x0, y0, p, slot, t0, k0 }
  let raf = 0, lastT = 0;
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    if (!svg.isConnected) return;
    const dt = Math.min(50, now - lastT);
    lastT = now;
    let active = false;
    const k = 1 - Math.exp(-dt / 38);
    for (const [p, v] of vis) {
      if (v.x !== v.tx || v.y !== v.ty) {
        v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k;
        if (Math.abs(v.tx - v.x) < 0.05 && Math.abs(v.ty - v.y) < 0.05) { v.x = v.tx; v.y = v.ty; }
        placePiece(v);
        active = true;
      }
      if (v.ghost && v.pending === 0) {
        if (!v.fadeStart) { v.fadeStart = now; sound.whoosh(); }
        v.fade = Math.min(1, (now - v.fadeStart) / FADE_MS);
        v.g.style.opacity = String(1 - v.fade);
        placePiece(v);
        if (v.fade >= 1) { v.g.remove(); vis.delete(p); } else active = true;
      } else if (v.ghost) active = true;
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i], v = vis.get(f.p);
      const t = Math.min(1, (now - f.t0) / FLY_MS);
      const e = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const c = L.pieces[f.p].cells[f.slot];
      const x1 = (v ? v.x : 0) + c[0] * S + S / 2, y1 = (v ? v.y : 0) + c[1] * S + S / 2;
      const lift = Math.max(1.6, Math.min(6, Math.hypot(x1 - f.x0, y1 - f.y0) * 0.5));
      placed(f.g, f.x0 + (x1 - f.x0) * e, f.y0 + (y1 - f.y0) * e - Math.sin(Math.PI * t) * lift, f.k0 + (S * 0.62 - f.k0) * e);
      if (t >= 1) {
        f.g.remove();
        flights.splice(i, 1);
        if (v) { v.pending--; v.filled[f.slot] = true; showFill(v); }
        sound.click();
      } else active = true;
    }
    if (active) raf = requestAnimationFrame(frame);
  }

  // Ereignisse eines Schrittes darstellen
  function play(events) {
    let plushChanged = false, roomsChanged = false;
    for (const e of events) {
      if (e.t === 'step') {
        const v = vis.get(e.p);
        if (v) { v.tx = ax(e.to); v.ty = ay(e.to); }
      } else if (e.t === 'take' || e.t === 'room') {
        let x0, y0, k0;
        if (e.t === 'take') {
          x0 = cx(e.from); y0 = cy(e.from); k0 = S * 0.86;
          plushG.querySelector(`[data-cell="${e.from}"]`)?.remove();
        } else {
          [x0, y0] = roomBox(e.r); y0 -= 0.4; k0 = S * 0.62;
          roomsChanged = true;
        }
        const g = placed(plushFig(L.pieces[e.p].color), x0, y0, k0);
        fx.appendChild(g);
        const v = vis.get(e.p);
        // Das Tier fällt in das Quadrat, das darüber steht (sonst in ein freies)
        let slot = e.k;
        if (v) {
          if (v.taken[slot]) slot = v.taken.indexOf(false);
          if (slot < 0) slot = e.k;
          v.taken[slot] = true;
          v.pending++;
        }
        flights.push({ g, x0, y0, k0, p: e.p, slot, t0: performance.now() });
        plushChanged = true;
      } else if (e.t === 'gone') {
        const v = vis.get(e.p);
        if (v) {
          v.ghost = true;
          const cs = L.pieces[e.p].cells;
          v.fcx = (Math.max(...cs.map((c) => c[0])) + 1) * S / 2; v.fcy = (Math.max(...cs.map((c) => c[1])) + 1) * S / 2;
          v.g.classList.add('leaving');
        }
      } else if (e.t === 'open') {
        const old = vis.get(e.p);
        const { g, slots } = buildPiece(e.p);
        const k = size(L, e.p);
        const v = { x: ax(s.pos[e.p]), y: ay(s.pos[e.p]), tx: ax(s.pos[e.p]), ty: ay(s.pos[e.p]), g, slots, filled: new Array(k).fill(false), taken: new Array(k).fill(false), pending: 0, ghost: false, fade: 0 };
        if (old) old.g.replaceWith(g); else piecesG.appendChild(g);
        vis.set(e.p, v);
        showFill(v);
        placePiece(v);
        g.classList.add('opening');
        sound.tick();
      }
    }
    if (roomsChanged) renderRooms();
    // Schlösser zählen herunter
    if (events.some((e) => e.t === 'gone')) {
      for (const [p, v] of vis) {
        if (!v.ghost && isLocked(L, s, p)) {
          const t = v.g.querySelector('.locknum');
          if (t) t.textContent = L.pieces[p].lock - s.gone;
        }
      }
    }
    if (plushChanged) updateCounter();
    kick();
  }

  // ---------- Zoomen und Verschieben ----------
  // In Bildschirmpixeln: z = Pixel je SVG-Einheit, (ox, oy) = linke obere Ecke der Szene (mit Rand).
  let vw = 0, vh = 0, zFit = 1, z = 1, ox = 0, oy = 0;
  const zMax = () => Math.max(zFit, MAX_UNIT / S);
  function fit(keepZoom) {
    const r = view.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = keepZoom ? z / zFit : 1;
    vw = r.width; vh = r.height;
    zFit = Math.min((vw - 4) / EW, (vh - 4) / EH);
    z = Math.min(Math.max(zFit * k, zFit), zMax());
    clampView();
  }
  function clampView() {
    const tw = EW * z, th = EH * z;
    ox = tw <= vw ? (vw - tw) / 2 : Math.min(Math.max(ox, vw - 4 - tw), 4);
    oy = th <= vh ? Math.min(4, (vh - th) / 2) : Math.min(Math.max(oy, vh - 4 - th), 4);
    svg.setAttribute('viewBox', `${-ox / z} ${-oy / z} ${vw / z} ${vh / z}`);
    fitBtn.hidden = z < zFit * 1.05;
  }
  function zoomTo(nz, mx, my, u, v) {
    z = Math.min(Math.max(nz, zFit), zMax());
    ox = mx - u * z; oy = my - v * z;
    clampView();
  }
  const local = (x, y) => { const r = view.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  // Bildschirm → Brett-Einheiten (0..W, 0..H)
  const toBoard = (x, y) => { const [mx, my] = local(x, y); return [(mx - ox) / z - M, (my - oy) / z - M]; };
  fitBtn.addEventListener('click', () => { z = zFit; clampView(); });
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [mx, my] = local(e.clientX, e.clientY);
    zoomTo(z * Math.exp(-e.deltaY * 0.0015), mx, my, (mx - ox) / z, (my - oy) / z);
  }, { passive: false });
  function reveal(a) {
    if (z < zFit * 1.05) return;
    const x = ox + (ax(a) + M + S / 2) * z, y = oy + (ay(a) + M + S / 2) * z, m = S * z;
    if (x > m && x < vw - m && y > m && y < vh - m) return;
    ox -= x - vw / 2; oy -= y - vh / 2;
    clampView();
  }

  // ---------- Eingabe ----------
  // Ein Finger auf einer Form: ziehen. Auf freier Fläche (hineingezoomt): Ausschnitt verschieben.
  // Zwei Finger: zoomen/verschieben (ein laufendes Ziehen endet dabei).
  const pointers = new Map();
  let pinch = null, pan = null, drag = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z, u: (mx - ox) / z, v: (my - oy) / z };
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) pointers.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) { endDrag(); pan = null; startPinch(); return; }
    const [u, v] = toBoard(e.clientX, e.clientY);
    const c = Math.floor(u / S), r = Math.floor(v / S);
    const cell = c >= 0 && r >= 0 && c < L.cols && r < L.rows ? r * L.cols + c : -1;
    const p = cell >= 0 && occ[cell] > 0 ? occ[cell] - 1 : -1;
    if (p >= 0 && !busy && !over) {
      if (isLocked(L, s, p)) { nudge(p, `Noch ${L.pieces[p].lock - s.gone} Form${L.pieces[p].lock - s.gone === 1 ? '' : 'en'} abräumen, dann öffnet sich diese.`); pan = { x: e.clientX, y: e.clientY, ox, oy, moved: false }; return; }
      drag = { p, gx: u - ax(s.pos[p]), gy: v - ay(s.pos[p]), before: null, bumped: false };
      return;
    }
    pan = { x: e.clientX, y: e.clientY, ox, oy, moved: false };
  });
  svg.addEventListener('pointermove', (e) => {
    const pt = pointers.get(e.pointerId);
    if (!pt) return;
    pt.x = e.clientX; pt.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomTo(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, mx, my, pinch.u, pinch.v);
      return;
    }
    if (drag) { dragTo(e.clientX, e.clientY); return; }
    if (!pan) return;
    if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 8) return;
    pan.moved = true;
    if (z < zFit * 1.05) return;
    ox = pan.ox + e.clientX - pan.x; oy = pan.oy + e.clientY - pan.y;
    clampView();
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) startPinch();
    else pinch = null;
    if (pointers.size > 0) return;
    pan = null;
    endDrag();
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // Form Feld für Feld zum Finger schieben
  function dragTo(x, y) {
    if (!drag || busy || over) return;
    const p = drag.p;
    if (s.pos[p] < 0) { drag = null; return; }
    const [u, v] = toBoard(x, y);
    const fx2 = (u - drag.gx) / S, fy2 = (v - drag.gy) / S;
    const tx = Math.round(fx2), ty = Math.round(fy2);
    const axis = L.pieces[p].axis;
    for (let guard = 0; guard < 60 && s.pos[p] >= 0; guard++) {
      const a = s.pos[p];
      const cx0 = a % L.cols, cy0 = (a / L.cols) | 0;
      const dx = axis === 2 ? 0 : tx - cx0, dy = axis === 1 ? 0 : ty - cy0;
      if (!dx && !dy) break;
      const hd = dx > 0 ? 0 : 1, vd = dy > 0 ? 2 : 3;
      const order = Math.abs(dx) >= Math.abs(dy) ? [dx ? hd : -1, dy ? vd : -1] : [dy ? vd : -1, dx ? hd : -1];
      let moved = false;
      for (const d of order) {
        if (d < 0) continue;
        if (stepTarget(L, occ, p, a, d, size(L, p) - s.fill[p]) < 0) continue;
        if (!drag.before) { drag.before = cloneState(s); hintMove = null; renderHint(); }
        const ev = [];
        step(L, s, occ, p, d, ev);
        play(ev);
        moved = true;
        break;
      }
      if (!moved) {
        if (!drag.bumped && Math.max(Math.abs(fx2 - cx0), Math.abs(fy2 - cy0)) > 0.9) { drag.bumped = true; sound.bump(); }
        break;
      }
    }
    if (s.pos[p] < 0) endDrag(); // Form ist voll und verschwunden – Zug ist fertig
  }
  function endDrag() {
    const d = drag;
    drag = null;
    if (!d || !d.before) return;
    finishMove(d.before);
  }
  // Ein Zug (ein Ziehen) ist fertig
  function finishMove(before) {
    history.push(before);
    if (history.length > 200) history.shift();
    moves++;
    if (isWon(L, s)) return win();
    if (deadEnd(L, s)) return deadEndHit();
    saveState();
  }

  function nudge(p, text) {
    sound.bump();
    shell.vibrate(25);
    const v = vis.get(p);
    if (v) { v.g.classList.remove('wiggle'); void v.g.getBBox(); v.g.classList.add('wiggle'); }
    showToast(text, 2200);
  }

  // Sackgasse: sicher nicht mehr lösbar → ein Herz, Zug wird zurückgenommen
  function deadEndHit() {
    lives--; mistakes++;
    updateHud();
    sound.bump();
    shell.vibrate([30, 40, 30]);
    if (lives <= 0) return lose();
    busy = true;
    showToast('Sackgasse – Zug zurückgenommen', 2000);
    setTimeout(() => {
      if (!svg.isConnected) return;
      busy = false;
      s = history.pop();
      occ = occupancy(L, s);
      moves = Math.max(0, moves - 1);
      renderAll();
      saveState();
    }, 700);
  }

  function undo() {
    if (busy || over || drag || !history.length) return;
    s = history.pop();
    occ = occupancy(L, s);
    moves = Math.max(0, moves - 1);
    hintMove = null;
    renderAll();
    saveState();
    sound.tick();
  }

  // ---------- Tipp: kostet ein Herz, mit dem letzten Herz gibt es keinen ----------
  async function hint() {
    if (busy || over || drag) return;
    if (hintMove) { reveal(hintMove.path[hintMove.path.length - 1]); return; }
    if (lives <= 1) { sound.bump(); showToast('Tipp nur mit mehr als einem Herz'); return; }
    busy = true;
    showToast('Suche …', 10000);
    const snapshot = s;
    const key = stateKey(s);
    let res = planKeys.has(key) ? L.plan[planKeys.get(key)] : await findHint(L, cloneState(s));
    busy = false;
    if (!svg.isConnected || s !== snapshot || over) return;
    if (res && !applyMove(L, s, res)) res = null;
    if (!res) { showToast('Kein Tipp gefunden – Rückgängig hilft vielleicht.', 3000); return; }
    showToast('', 0);
    hintMove = res;
    lives--; hints++;
    updateHud();
    saveState();
    renderHint();
    reveal(res.path[res.path.length - 1]);
    sound.tick();
  }

  let toastTimer = 0;
  function showToast(text, ms = 1600) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.toggle('show', !!text);
    if (text && ms) toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  // ---------- Ende ----------
  function win() {
    over = true;
    clearSave();
    z = zFit; clampView();
    const details = [`${moves} Züge`, timeText(performance.now() - t0), mistakesText(mistakes)];
    if (hints) details.push(`${hints} ${hints === 1 ? 'Tipp' : 'Tipps'}`);
    setTimeout(() => shell.win(details), 550);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    clearSave();
    hintMove = null;
    renderAll();
    shell.lose(RULES);
  }

  // ---------- Spielstand im Level ----------
  const sig = `${L.v}:${L.cols}x${L.rows}:${L.pieces.length}:${plushLeft(L, s)}:${L.plan.length}`;
  function saveState() {
    if (over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level, sig, s: packState(s), undo: history.slice(-40).map(packState), lives, hints, mistakes, moves, time: performance.now() - t0,
      }));
    } catch {}
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.level === level && sv.sig === sig && sv.lives > 0 && sv.s.pos.length === L.pieces.length && !isWon(L, unpackState(sv.s))) {
      s = unpackState(sv.s);
      occ = occupancy(L, s);
      history.push(...sv.undo.map(unpackState));
      lives = sv.lives; hints = sv.hints; mistakes = sv.mistakes; moves = sv.moves;
      t0 = performance.now() - sv.time;
    }
  } catch {}
  const onHide = () => { if (svg.isConnected && document.visibilityState === 'hidden') saveState(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => { if (svg.isConnected) saveState(); });

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) {
    window.__game = {
      L, get state() { return s; }, get lives() { return lives; }, get busy() { return busy; }, get over() { return over; },
      // Zug logisch ausführen (wie Ziehen), Darstellung mit Animation
      doMove(m) {
        if (busy || over || s.pos[m.p] !== m.path[0]) return false;
        const before = cloneState(s);
        let moved = false;
        for (let i = 1; i < m.path.length && s.pos[m.p] >= 0; i++) {
          const d = [1, -1, L.cols, -L.cols].indexOf(m.path[i] - m.path[i - 1]);
          const ev = [];
          if (!step(L, s, occ, m.p, d, ev)) break;
          moved = true;
          play(ev);
        }
        if (moved) finishMove(before);
        return moved;
      },
      at(cell) { const r = view.getBoundingClientRect(); return [r.left + ox + (cx(cell) + M) * z, r.top + oy + (cy(cell) + M) * z]; },
    };
  }

  fit(false);
  new ResizeObserver(() => { if (svg.isConnected) fit(true); }).observe(view);
  updateHud();
  renderAll();
}
