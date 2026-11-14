// Kronenfeld: Spielfeld und Bedienung.
// Tippen: leer → Kreuz → Krone → leer. Ziehen über Felder: Kreuze setzen
// (oder löschen, wenn man auf einem Kreuz beginnt).
import { generateLevel } from './generator.js';
import { createShell, timeText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;
const SVGNS = 'http://www.w3.org/2000/svg';
const EMPTY = 0, MARK = 1, CROWN = 2;
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const CROWN_PATH = 'M2.3 7.1 L1.7 3.3 L3.9 4.9 L5 2.5 L6.1 4.9 L8.3 3.3 L7.7 7.1 Z M2.4 7.9 H7.6';

export function mountCrowns(root, { level, onWin, onExit }) {
  const { n, reg, solution } = generateLevel(level);
  const state = new Uint8Array(n * n);
  const undoStack = [];
  let hints = 0;
  let solved = false;
  const t0 = performance.now();

  const shell = createShell(root, {
    name: 'Kronenfeld', level, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  const pad = 1.2;
  const svg = el('svg', { class: 'board crowns', viewBox: `${-pad} ${-pad} ${n * C + 2 * pad} ${n * C + 2 * pad}` });
  shell.board.appendChild(svg);

  // Regionen
  const gCells = el('g');
  const cellEls = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n), c = i % n;
    const g = el('g', { class: 'cell', transform: `translate(${c * C} ${r * C})` });
    g.appendChild(el('rect', { width: C, height: C, class: 'bg', style: `fill: var(--r${reg[i]})` }));
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
      if (c < n - 1) (reg[i] !== reg[i + 1] ? (s) => (thick += s) : (s) => (thin += s))(`M${(c + 1) * C} ${r * C} V${(r + 1) * C} `);
      if (r < n - 1) (reg[i] !== reg[i + n] ? (s) => (thick += s) : (s) => (thin += s))(`M${c * C} ${(r + 1) * C} H${(c + 1) * C} `);
    }
  svg.append(
    el('path', { d: thin, class: 'grid-thin' }),
    el('path', { d: thick, class: 'grid-thick' }),
    el('rect', { x: 0, y: 0, width: n * C, height: n * C, class: 'grid-frame' }),
  );

  // ---------- Regeln ----------
  function conflicts() {
    const bad = new Set();
    const crowns = [];
    for (let i = 0; i < n * n; i++) if (state[i] === CROWN) crowns.push(i);
    for (let a = 0; a < crowns.length; a++)
      for (let b = a + 1; b < crowns.length; b++) {
        const i = crowns[a], j = crowns[b];
        const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
        if (ri === rj || ci === cj || reg[i] === reg[j] || (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1)) {
          bad.add(i); bad.add(j);
        }
      }
    return { bad, count: crowns.length };
  }

  function render() {
    const { bad, count } = conflicts();
    for (let i = 0; i < n * n; i++) {
      const g = cellEls[i];
      g.classList.toggle('is-mark', state[i] === MARK);
      g.classList.toggle('is-crown', state[i] === CROWN);
      g.classList.toggle('is-bad', bad.has(i));
    }
    return { bad, count };
  }

  function setCells(changes) {
    // changes: [[index, newState], …] – als ein Schritt rückgängig machbar
    const step = [];
    for (const [i, to] of changes) {
      if (state[i] === to) continue;
      step.push([i, state[i], to]);
      state[i] = to;
    }
    if (!step.length) return;
    undoStack.push(step);
    clearHint();
    const placedCrown = step.some(([, , to]) => to === CROWN);
    const { bad, count } = render();
    if (placedCrown) {
      if (step.some(([i, , to]) => to === CROWN && bad.has(i))) sound.bump();
      else sound.click();
    } else sound.tick();
    if (count === n && bad.size === 0) win();
  }

  function undo() {
    if (solved) return;
    const step = undoStack.pop();
    if (!step) return;
    for (const [i, from] of step) state[i] = from;
    clearHint();
    render();
    sound.tick();
  }

  // ---------- Eingabe ----------
  function cellAt(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const c = Math.floor(p.x / C), r = Math.floor(p.y / C);
    return r >= 0 && c >= 0 && r < n && c < n ? r * n + c : -1;
  }
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const i = cellAt(e);
    if (i < 0) return;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    drag = { start: i, last: i, mode: null, cells: [] };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const i = cellAt(e);
    if (i < 0 || i === drag.last) return;
    if (!drag.mode) {
      const s = state[drag.start];
      drag.mode = s === EMPTY ? MARK : s === MARK ? EMPTY : 'none';
      if (drag.mode !== 'none') paint(drag.start);
    }
    drag.last = i;
    if (drag.mode !== 'none') paint(i);
  });
  function paint(i) {
    // Beim Ziehen nur leere Felder ↔ Kreuze, Kronen bleiben unberührt
    if (state[i] === CROWN) return;
    if (drag.cells.includes(i)) return;
    drag.cells.push(i);
    cellEls[i].classList.toggle('is-mark', drag.mode === MARK);
  }
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    if (!drag.mode) {
      const i = drag.start;
      setCells([[i, (state[i] + 1) % 3]]);
    } else if (drag.mode !== 'none') {
      setCells(drag.cells.map((i) => [i, drag.mode]));
    }
    drag = null;
  });
  svg.addEventListener('pointercancel', () => { drag = null; render(); });

  // ---------- Tipp ----------
  let hinted = -1;
  function clearHint() { if (hinted >= 0) cellEls[hinted].classList.remove('hint'); hinted = -1; }
  function hint() {
    if (solved) return;
    clearHint();
    const sol = new Set(solution.map((c, r) => r * n + c));
    // 1. falsch gesetzte Krone, 2. Kreuz auf einem Kronenfeld, 3. fehlende Krone
    let i = [...Array(n * n).keys()].find((k) => state[k] === CROWN && !sol.has(k));
    if (i === undefined) i = [...sol].find((k) => state[k] === MARK);
    if (i === undefined) i = [...sol].find((k) => state[k] !== CROWN);
    if (i === undefined) return;
    hints++;
    hinted = i;
    cellEls[i].classList.add('hint');
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!solved) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function win() {
    solved = true;
    clearInterval(timer);
    svg.classList.add('solved');
    const details = [timeText(performance.now() - t0)];
    if (hints) details.push(`${hints} Tipp${hints > 1 ? 's' : ''}`);
    setTimeout(() => shell.win(details), 700);
    onWin && onWin(level);
  }

  render();
}
