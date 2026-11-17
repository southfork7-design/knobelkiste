// Kronenfeld: Spielfeld und Bedienung.
// Tippen: Kreuz an/aus. Doppeltippen: Krone an/aus (eine regelkonforme Krone kreuzt
// Nachbarfelder und volle Zeilen/Spalten/Farbflächen selbst an). Ziehen über Felder: Kreuze setzen
// (oder löschen, wenn man auf einem Kreuz beginnt). Zwei Finger: zoomen und
// verschieben, Mausrad am Computer.
import { generateLevel } from './generator.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;
const LIVES = 3;
const SVGNS = 'http://www.w3.org/2000/svg';
const EMPTY = 0, MARK = 1, CROWN = 2;
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const CROWN_PATH = 'M2.3 7.1 L1.7 3.3 L3.9 4.9 L5 2.5 L6.1 4.9 L8.3 3.3 L7.7 7.1 Z M2.4 7.9 H7.6';

// Regionsfarben: 16 Farbtöne × 2 Helligkeiten. Benachbarte Regionen bekommen
// möglichst weit auseinanderliegende Töne.
const HUES = [8, 30, 48, 70, 95, 130, 160, 180, 196, 212, 232, 255, 275, 300, 322, 345];
function regionColors(n, reg) {
  const adj = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    if (c < n - 1 && reg[i] !== reg[i + 1]) { adj[reg[i]].add(reg[i + 1]); adj[reg[i + 1]].add(reg[i]); }
    if (r < n - 1 && reg[i] !== reg[i + n]) { adj[reg[i]].add(reg[i + n]); adj[reg[i + n]].add(reg[i]); }
  }
  const color = new Array(n).fill(-1);
  const free = HUES.map((_, x) => x);
  const hueDist = (a, b) => { const d = Math.abs(HUES[a] - HUES[b]); return Math.min(d, 360 - d); };
  // Regionen mit vielen Nachbarn zuerst
  const order = [...Array(n).keys()].sort((a, b) => adj[b].size - adj[a].size);
  for (const g of order) {
    let best = free[0], bestD = -1;
    for (const h of free) {
      let d = 999;
      for (const o of adj[g]) if (color[o] >= 0) d = Math.min(d, hueDist(h, color[o]));
      if (d > bestD) { bestD = d; best = h; }
    }
    color[g] = best;
    free.splice(free.indexOf(best), 1);
    if (!free.length) free.push(...HUES.map((_, x) => x));
  }
  return color.map((h, g) => ({ h: HUES[h], light: g % 2 }));
}

export function mountCrowns(root, { level, onWin, onExit }) {
  const { n, k, reg, stars } = generateLevel(level);
  const N = n * n;
  const state = new Uint8Array(N);
  const undoStack = [];
  let lives = LIVES, hintsUsed = 0, mistakes = 0;
  let over = false;
  const t0 = performance.now();

  const label = k > 1 ? `Level ${level} · ${k} Kronen` : null;
  const shell = createShell(root, {
    name: 'Kronenfeld', level, label, lives: LIVES, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  const pad = 1.2;
  const full = { x: -pad, y: -pad, w: n * C + 2 * pad, h: n * C + 2 * pad };
  const svg = el('svg', { class: 'board crowns', preserveAspectRatio: 'xMidYMid meet' });
  shell.board.appendChild(svg);
  const fitBtn = document.createElement('button');
  fitBtn.className = 'crowns-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  shell.board.appendChild(fitBtn);
  const hintBtn = root.querySelector('[data-act="hint"]');

  // Regionen
  const colors = regionColors(n, reg);
  const gCells = el('g');
  const cellEls = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / n), c = i % n, col = colors[reg[i]];
    const g = el('g', { class: 'cell', transform: `translate(${c * C} ${r * C})` });
    g.appendChild(el('rect', { width: C, height: C, class: `bg${col.light ? ' alt' : ''}`, style: `--h:${col.h}` }));
    const mark = el('path', { d: 'M3.9 3.9 L6.1 6.1 M6.1 3.9 L3.9 6.1', class: 'mark' });
    const crown = el('path', { d: CROWN_PATH, class: 'crown' });
    g.append(mark, crown);
    gCells.appendChild(g);
    cellEls.push(g);
  }
  svg.appendChild(gCells);

  // Feines Raster + kräftige Regionsgrenzen
  let thin = '', thick = '';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) { const s = `M${(c + 1) * C} ${r * C} V${(r + 1) * C} `; if (reg[i] !== reg[i + 1]) thick += s; else thin += s; }
      if (r < n - 1) { const s = `M${c * C} ${(r + 1) * C} H${(c + 1) * C} `; if (reg[i] !== reg[i + n]) thick += s; else thin += s; }
    }
  svg.append(
    el('path', { d: thin, class: 'grid-thin' }),
    el('path', { d: thick, class: 'grid-thick' }),
    el('rect', { x: 0, y: 0, width: n * C, height: n * C, class: 'grid-frame' }),
  );

  // ---------- Regeln ----------
  function conflicts() {
    const bad = new Set();
    const rowCnt = new Array(n).fill(0), colCnt = new Array(n).fill(0), regCnt = new Array(n).fill(0);
    let count = 0;
    for (let i = 0; i < N; i++) if (state[i] === CROWN) {
      count++;
      rowCnt[Math.floor(i / n)]++; colCnt[i % n]++; regCnt[reg[i]]++;
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n && state[rr * n + cc] === CROWN) bad.add(i);
        }
    }
    for (let i = 0; i < N; i++)
      if (state[i] === CROWN && (rowCnt[Math.floor(i / n)] > k || colCnt[i % n] > k || regCnt[reg[i]] > k)) bad.add(i);
    return { bad, count };
  }

  function render() {
    const { bad, count } = conflicts();
    for (let i = 0; i < N; i++) {
      const g = cellEls[i];
      g.classList.toggle('is-mark', state[i] === MARK);
      g.classList.toggle('is-crown', state[i] === CROWN);
      g.classList.toggle('is-bad', bad.has(i));
    }
    return { bad, count };
  }

  function updateHud() {
    shell.setLives(lives);
    if (hintBtn) hintBtn.classList.toggle('crowns-no-hint', lives <= 1);
  }

  function setCells(changes) {
    // changes: [[index, newState], …] – als ein Schritt rückgängig machbar
    const before = conflicts().bad;
    const step = [];
    for (const [i, to] of changes) {
      if (state[i] === to) continue;
      step.push([i, state[i], to]);
      state[i] = to;
    }
    if (!step.length) return;
    undoStack.push(step);
    clearHint();
    const { bad, count } = render();
    const newBad = step.some(([i, , to]) => to === CROWN && bad.has(i) && !before.has(i));
    if (newBad) {
      // Krone verstößt sichtbar gegen eine Regel: kostet ein Herz
      lives--;
      mistakes++;
      updateHud();
      sound.bump();
      shell.vibrate([30, 40, 30]);
      if (lives <= 0) { lose(); return; }
    } else if (step.some(([, , to]) => to === CROWN)) {
      autoMarks(step);
      sound.click();
    } else sound.tick();
    if (count === n * k && bad.size === 0) win();
  }

  // Nach einer regelkonformen Krone: Nachbarfelder ankreuzen, dazu die ganze Zeile,
  // Spalte bzw. Farbfläche, sobald sie ihre k Kronen hat. Gehört zum selben
  // Rückgängig-Schritt wie die Krone.
  function autoMarks(step) {
    const cnt = (f) => { let s = 0; for (let j = 0; j < N; j++) if (state[j] === CROWN && f(j)) s++; return s; };
    const add = new Set();
    for (const [i, , to] of step) {
      if (to !== CROWN) continue;
      const r = Math.floor(i / n), c = i % n;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n) add.add(rr * n + cc);
        }
      const groups = [(j) => Math.floor(j / n) === r, (j) => j % n === c, (j) => reg[j] === reg[i]];
      for (const f of groups) if (cnt(f) >= k) for (let j = 0; j < N; j++) if (f(j)) add.add(j);
    }
    for (const j of add) if (state[j] === EMPTY) { step.push([j, EMPTY, MARK]); state[j] = MARK; }
    render();
  }

  function undo() {
    if (over) return;
    const step = undoStack.pop();
    if (!step) return;
    for (const [i, from] of step) state[i] = from;
    clearHint();
    render();
    sound.tick();
  }

  // ---------- Zoomen und Verschieben ----------
  const vb = { ...full };
  let zoom = 1;
  const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // k0 = Pixel pro SVG-Einheit bei „ganzes Bild“
  function frame() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return { k0: 1, left: r.left, top: r.top, rw: full.w, rh: full.h };
    return { k0: Math.min(r.width / full.w, r.height / full.h), left: r.left, top: r.top, rw: r.width, rh: r.height };
  }
  const maxZoom = () => Math.max(1, 56 / (frame().k0 * C)); // höchstens ca. 56 px pro Feld
  function sizeVB(f) { const kk = f.k0 * zoom; vb.w = f.rw / kk; vb.h = f.rh / kk; }
  function clampVB() {
    vb.x = vb.w >= full.w ? full.x + (full.w - vb.w) / 2 : Math.min(Math.max(vb.x, full.x), full.x + full.w - vb.w);
    vb.y = vb.h >= full.h ? full.y + (full.h - vb.h) / 2 : Math.min(Math.max(vb.y, full.y), full.y + full.h - vb.h);
    setVB();
    fitBtn.hidden = zoom < 1.05;
  }
  function applyZoom(z, px, py, ux, uy) {
    // (ux, uy) in SVG-Einheiten soll unter dem Bildschirmpunkt (px, py) liegen
    const f = frame();
    zoom = Math.min(Math.max(z, 1), maxZoom());
    sizeVB(f);
    const kk = f.k0 * zoom;
    vb.x = ux - (px - f.left) / kk;
    vb.y = uy - (py - f.top) / kk;
    clampVB();
  }
  const toUnits = (px, py) => {
    const f = frame(), kk = f.k0 * zoom;
    return [vb.x + (px - f.left) / kk, vb.y + (py - f.top) / kk];
  };
  fitBtn.addEventListener('click', () => { zoom = 1; sizeVB(frame()); clampVB(); });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const u = toUnits(e.clientX, e.clientY);
    applyZoom(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, u[0], u[1]);
  }, { passive: false });
  sizeVB(frame());
  clampVB();
  new ResizeObserver(() => { if (svg.isConnected) { sizeVB(frame()); clampVB(); } }).observe(svg);
  // Ausschnitt so verschieben, dass ein Feld sichtbar ist
  function reveal(i) {
    if (zoom <= 1) return;
    const x = (i % n) * C + C / 2, y = Math.floor(i / n) * C + C / 2;
    if (x > vb.x + C / 2 && x < vb.x + vb.w - C / 2 && y > vb.y + C / 2 && y < vb.y + vb.h - C / 2) return;
    vb.x = x - vb.w / 2; vb.y = y - vb.h / 2;
    clampVB();
  }

  // ---------- Eingabe ----------
  // Ein Finger: tippen bzw. Kreuze ziehen. Zwei Finger: zoomen/verschieben –
  // ein angefangenes Ziehen wird dann verworfen.
  function cellAt(x, y) {
    const [ux, uy] = toUnits(x, y);
    const c = Math.floor(ux / C), r = Math.floor(uy / C);
    return r >= 0 && c >= 0 && r < n && c < n ? r * n + c : -1;
  }
  const pointers = new Map();
  let pinch = null, multi = false, drag = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, u: toUnits(mx, my) };
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) { pointers.clear(); multi = false; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) {
      if (drag) { drag = null; render(); }
      multi = true;
      startPinch();
      return;
    }
    if (over || e.button > 0) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0) drag = { start: i, last: i, mode: null, cells: [], pt: { x: e.clientX, y: e.clientY } };
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      applyZoom(pinch.z0 * d / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.u[0], pinch.u[1]);
      return;
    }
    if (!drag || multi) return;
    // Zwischenpunkte abtasten, damit bei schnellem Wischen kein Feld ausgelassen wird
    const from = drag.pt || { x: e.clientX, y: e.clientY };
    const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - from.x, e.clientY - from.y) / 4));
    drag.pt = { x: e.clientX, y: e.clientY };
    for (let s = 1; s <= steps; s++) {
      const i = cellAt(from.x + (e.clientX - from.x) * s / steps, from.y + (e.clientY - from.y) * s / steps);
      if (i < 0 || i === drag.last) continue;
      if (!drag.mode) {
        const st0 = state[drag.start];
        drag.mode = st0 === EMPTY ? MARK : st0 === MARK ? EMPTY : 'none';
        if (drag.mode !== 'none') paint(drag.start);
      }
      drag.last = i;
      if (drag.mode !== 'none') paint(i);
    }
  });
  function paint(i) {
    // Beim Ziehen nur leere Felder ↔ Kreuze, Kronen bleiben unberührt
    if (state[i] === CROWN || drag.cells.includes(i)) return;
    drag.cells.push(i);
    cellEls[i].classList.toggle('is-mark', drag.mode === MARK);
  }
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) startPinch();
    else pinch = null;
    if (pointers.size > 0) return;
    const d = drag;
    drag = null;
    if (!d || multi || over || e.type === 'pointercancel') { if (d) render(); return; }
    if (!d.mode) tap(d.start);
    else if (d.mode !== 'none') setCells(d.cells.map((i) => [i, d.mode]));
  }
  // Einfaches Tippen: Kreuz an/aus (eine Krone wird entfernt). Doppeltippen: Krone
  // an/aus – der erste Tipp wird dabei zurückgenommen, damit kein Kreuz übrig bleibt.
  let lastTap = null;
  function tap(i) {
    const now = performance.now();
    if (lastTap && lastTap.i === i && now - lastTap.t < 350 && undoStack[undoStack.length - 1] === lastTap.step) {
      undoStack.pop();
      state[i] = lastTap.from;
      lastTap = null;
      setCells([[i, state[i] === CROWN ? EMPTY : CROWN]]);
      return;
    }
    const from = state[i];
    setCells([[i, from === EMPTY ? MARK : EMPTY]]);
    lastTap = { i, t: now, from, step: undoStack[undoStack.length - 1] };
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // ---------- Tipp ----------
  // Jeder Tipp kostet ein Herz; mit dem letzten Herz gibt es keinen Tipp mehr.
  let hinted = -1;
  function clearHint() { if (hinted >= 0) cellEls[hinted].classList.remove('hint'); hinted = -1; }
  function hint() {
    if (over) return;
    if (hinted >= 0) { reveal(hinted); return; } // wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); return; }
    const sol = new Set(stars);
    // 1. falsch gesetzte Krone, 2. Kreuz auf einem Kronenfeld, 3. fehlende Krone
    let i = [...Array(N).keys()].find((x) => state[x] === CROWN && !sol.has(x));
    if (i === undefined) i = stars.find((x) => state[x] === MARK);
    if (i === undefined) {
      const missing = stars.filter((x) => state[x] !== CROWN);
      i = missing[Math.floor(Math.random() * missing.length)];
    }
    if (i === undefined) return;
    lives--;
    hintsUsed++;
    updateHud();
    hinted = i;
    cellEls[i].classList.add('hint');
    reveal(i);
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!over) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function win() {
    over = true;
    clearInterval(timer);
    svg.classList.add('solved');
    const details = [timeText(performance.now() - t0), mistakesText(mistakes)];
    if (hintsUsed) details.push(`${hintsUsed} ${hintsUsed === 1 ? 'Tipp' : 'Tipps'}`);
    setTimeout(() => shell.win(details), 500);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    clearInterval(timer);
    shell.lose(`Je ${k === 1 ? 'eine Krone' : k + ' Kronen'} pro Zeile, Spalte und Farbfeld – Kronen dürfen sich nicht berühren, auch nicht über Eck.`);
  }

  updateHud();
  render();
}
