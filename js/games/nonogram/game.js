// Bilderrätsel: Spielfeld und Bedienung.
// Unter dem Feld wählt man das Werkzeug: Füllen oder Kreuz.
// Tippen setzt/entfernt, Wischen entlang einer Zeile/Spalte wirkt auf alle
// überstrichenen Felder.
import { generateLevel, solveLine, cluesOf } from './generator.js';
import { createShell, timeText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10, SLOT = 6.8;
const EMPTY = 0, FILLED = 1, CROSS = 2;
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export function mountNonogram(root, { level, onWin, onExit }) {
  const P = generateLevel(level);
  const { rows: R, cols: K, rowClues, colClues, pixels } = P;
  const st = new Uint8Array(R * K);
  const undoStack = [];
  let hints = 0, solved = false, tool = FILLED;
  const t0 = performance.now();

  const shell = createShell(root, {
    name: 'Bilderrätsel', level, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  shell.board.classList.add('nono-wrap');

  const maxRow = Math.max(...rowClues.map((c) => Math.max(c.length, 1)));
  const maxCol = Math.max(...colClues.map((c) => Math.max(c.length, 1)));
  const LW = maxRow * SLOT + 3, TH = maxCol * SLOT + 3;
  const W = LW + K * C + 1, H = TH + R * C + 1;
  const svg = el('svg', { class: 'board nono', viewBox: `-1 -1 ${W + 1} ${H + 1}` });
  shell.board.appendChild(svg);

  // Werkzeugwahl
  const tools = document.createElement('div');
  tools.className = 'tool-switch';
  tools.innerHTML = `
    <button data-tool="1" class="on" aria-label="Füllen"><span class="sw-fill"></span>Füllen</button>
    <button data-tool="2" aria-label="Kreuz"><span class="sw-x">✕</span>Kreuz</button>`;
  shell.board.appendChild(tools);
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    tool = Number(b.dataset.tool);
    tools.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    sound.tick();
  });

  // Zahlen
  const rowText = [], colText = [];
  rowClues.forEach((cl, r) => {
    const g = el('g', { class: 'clue-line' });
    const list = cl.length ? cl : [0];
    list.forEach((v, k) => {
      const t = el('text', { x: LW - 2 - (list.length - 1 - k) * SLOT - SLOT / 2, y: TH + r * C + C / 2, 'dominant-baseline': 'central' });
      t.textContent = v;
      g.appendChild(t);
    });
    svg.appendChild(g); rowText.push(g);
  });
  colClues.forEach((cl, c) => {
    const g = el('g', { class: 'clue-line' });
    const list = cl.length ? cl : [0];
    list.forEach((v, k) => {
      const t = el('text', { x: LW + c * C + C / 2, y: TH - 2 - (list.length - 1 - k) * SLOT - SLOT / 2 + 0.5, 'dominant-baseline': 'central' });
      t.textContent = v;
      g.appendChild(t);
    });
    svg.appendChild(g); colText.push(g);
  });

  // Feld
  const grid = el('g', { transform: `translate(${LW} ${TH})` });
  grid.appendChild(el('rect', { width: K * C, height: R * C, class: 'field' }));
  const hl = el('path', { class: 'line-hl' });
  const hintRect = el('rect', { width: C, height: C, class: 'hint-cell', visibility: 'hidden' });
  const fills = el('path', { class: 'fills' });
  const crosses = el('path', { class: 'crosses' });
  let thin = '', thick = '';
  for (let c = 1; c < K; c++) (c % 5 ? (s) => (thin += s) : (s) => (thick += s))(`M${c * C} 0 V${R * C} `);
  for (let r = 1; r < R; r++) (r % 5 ? (s) => (thin += s) : (s) => (thick += s))(`M0 ${r * C} H${K * C} `);
  grid.append(hl, hintRect, fills, crosses,
    el('path', { d: thin, class: 'grid-thin' }),
    el('path', { d: thick, class: 'grid-thick' }),
    el('rect', { width: K * C, height: R * C, class: 'grid-frame' }));
  svg.appendChild(grid);

  function render() {
    let df = '', dx = '';
    for (let i = 0; i < R * K; i++) {
      const x = (i % K) * C, y = Math.floor(i / K) * C;
      if (st[i] === FILLED) df += `M${x + 0.6} ${y + 0.6}h${C - 1.2}v${C - 1.2}h${-(C - 1.2)}z`;
      else if (st[i] === CROSS) dx += `M${x + 3.2} ${y + 3.2}L${x + 6.8} ${y + 6.8}M${x + 6.8} ${y + 3.2}L${x + 3.2} ${y + 6.8}`;
    }
    fills.setAttribute('d', df);
    crosses.setAttribute('d', dx);
    // Zahlen blass, wenn die Zeile/Spalte genau passt
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    for (let r = 0; r < R; r++) {
      const line = Array.from({ length: K }, (_, c) => (st[r * K + c] === FILLED ? 1 : 0));
      rowText[r].classList.toggle('done', same(cluesOf(line), rowClues[r]));
    }
    for (let c = 0; c < K; c++) {
      const line = Array.from({ length: R }, (_, r) => (st[r * K + c] === FILLED ? 1 : 0));
      colText[c].classList.toggle('done', same(cluesOf(line), colClues[c]));
    }
  }

  // ---------- Eingabe ----------
  function cellAt(e, clamp = false) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let c = Math.floor((p.x - LW) / C), r = Math.floor((p.y - TH) / C);
    if (clamp) { c = Math.max(0, Math.min(K - 1, c)); r = Math.max(0, Math.min(R - 1, r)); }
    return r >= 0 && c >= 0 && r < R && c < K ? [r, c] : null;
  }
  const apply = (action, o) =>
    action === 'fill' && o === EMPTY ? FILLED :
    action === 'cross' && o === EMPTY ? CROSS :
    action === 'clear-fill' && o === FILLED ? EMPTY :
    action === 'clear-cross' && o === CROSS ? EMPTY : o;

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const rc = cellAt(e);
    if (!rc) return;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    const i = rc[0] * K + rc[1];
    const o = st[i];
    const action = o === FILLED ? 'clear-fill' : o === CROSS ? 'clear-cross' : tool === FILLED ? 'fill' : 'cross';
    drag = { r: rc[0], c: rc[1], axis: null, action, orig: st.slice() };
    clearHint();
    paintTo(rc);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rc = cellAt(e, true);
    if (!rc) return;
    if (!drag.axis && (rc[0] !== drag.r || rc[1] !== drag.c)) drag.axis = rc[0] === drag.r ? 'row' : 'col';
    paintTo(rc);
  });
  function paintTo([r, c]) {
    st.set(drag.orig);
    let cells;
    if (drag.axis === 'row') {
      const [a, b] = [Math.min(c, drag.c), Math.max(c, drag.c)];
      cells = Array.from({ length: b - a + 1 }, (_, k) => drag.r * K + a + k);
    } else if (drag.axis === 'col') {
      const [a, b] = [Math.min(r, drag.r), Math.max(r, drag.r)];
      cells = Array.from({ length: b - a + 1 }, (_, k) => (a + k) * K + drag.c);
    } else cells = [drag.r * K + drag.c];
    for (const i of cells) st[i] = apply(drag.action, drag.orig[i]);
    // Zeile bzw. Spalte dezent hervorheben
    const y = drag.r * C, x = drag.c * C;
    hl.setAttribute('d', drag.axis === 'col' ? `M${x} 0h${C}v${R * C}h${-C}z` : `M0 ${y}h${K * C}v${C}h${-K * C}z`);
    render();
  }
  function endDrag() {
    if (!drag) return;
    hl.setAttribute('d', '');
    const changed = drag.orig.some((v, i) => v !== st[i]);
    if (changed) {
      undoStack.push(drag.orig);
      if (drag.action === 'fill') sound.click(); else sound.tick();
    }
    drag = null;
    render();
    if (changed) checkWin();
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  function undo() {
    if (solved || !undoStack.length) return;
    st.set(undoStack.pop());
    clearHint();
    render();
    sound.tick();
  }

  // ---------- Tipp ----------
  function clearHint() { hintRect.setAttribute('visibility', 'hidden'); }
  function showHint(i) {
    hints++;
    hintRect.setAttribute('x', (i % K) * C);
    hintRect.setAttribute('y', Math.floor(i / K) * C);
    hintRect.setAttribute('visibility', 'visible');
  }
  function hint() {
    if (solved) return;
    clearHint();
    // 1. Fehler zuerst: falsch gefüllt oder Kreuz auf einem Bildfeld
    for (let i = 0; i < R * K; i++) {
      if ((st[i] === FILLED && !pixels[i]) || (st[i] === CROSS && pixels[i])) return showHint(i);
    }
    // 2. Ein Feld, das sich aus dem jetzigen Stand logisch ergibt
    const know = Array.from(st, (v) => (v === FILLED ? 1 : v === CROSS ? 2 : 0));
    for (let r = 0; r < R; r++) {
      const line = know.slice(r * K, (r + 1) * K);
      const res = solveLine(line, rowClues[r]);
      if (!res) continue;
      for (let c = 0; c < K; c++) if (res[c] === 1 && line[c] === 0) return showHint(r * K + c);
    }
    for (let c = 0; c < K; c++) {
      const line = Array.from({ length: R }, (_, r) => know[r * K + c]);
      const res = solveLine(line, colClues[c]);
      if (!res) continue;
      for (let r = 0; r < R; r++) if (res[r] === 1 && line[r] === 0) return showHint(r * K + c);
    }
    const i = pixels.findIndex((v, k) => v && st[k] !== FILLED);
    if (i >= 0) showHint(i);
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!solved) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function checkWin() {
    for (let i = 0; i < R * K; i++) if ((st[i] === FILLED) !== (pixels[i] === 1)) return;
    solved = true;
    clearInterval(timer);
    for (let i = 0; i < R * K; i++) if (st[i] === CROSS) st[i] = EMPTY;
    render();
    svg.classList.add('solved');
    tools.style.visibility = 'hidden';
    const details = [];
    if (P.name) details.push(P.name);
    details.push(timeText(performance.now() - t0));
    if (hints) details.push(`${hints} Tipp${hints > 1 ? 's' : ''}`);
    setTimeout(() => shell.win(details), 1100);
    onWin && onWin(level);
  }

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) window.__game = { R, K, pixels, LW, TH, C };

  render();
}
