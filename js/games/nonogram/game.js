// Bilderrätsel: Spielfeld und Bedienung.
// Unter dem Feld wählt man das Werkzeug: Füllen oder Kreuz.
// Tippen setzt bzw. entfernt ein Feld. Wischen entlang einer Zeile/Spalte zeigt
// erst eine Vorschau (man kann zurückwischen) und wird beim Loslassen
// übernommen. Füllen überspringt Kreuze, Kreuzen überspringt gefüllte Felder.
// Zwei Finger: zoomen und verschieben (Mausrad am Computer), „Ganzes Bild“
// stellt zurück. Die Zahlen bleiben beim Zoomen am Rand stehen.
// 3 Herzen: Eine Zeile/Spalte, die sichtbar nicht mehr zu ihren Zahlen passen
// kann, kostet ein Herz; ebenso jeder Tipp (nicht mit dem letzten Herz).
// Ist eine Zeile/Spalte fertig, bekommen ihre übrigen Felder von selbst ein Kreuz.
// Der Stand im laufenden Level wird im Browser gespeichert (Neuladen, Menü);
// „Neu“, „Nochmal“, Lösen und das nächste Level verwerfen ihn.
// Farbbilder (color: true): mehrere Farben, je Farbe ein Werkzeug; zwischen
// gleichfarbigen Blöcken liegt eine Lücke, verschiedenfarbige dürfen sich berühren.
import { generateLevel } from './generator.js';
import { generateColorLevel, solveLineColor, colorCluesOf } from './color.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10; // SVG-Einheiten pro Feld
const LIVES = 3;
const EMPTY = 0, CROSS = 15; // dazwischen: Farbe 1..k (Schwarz-Weiß: 1)
const MAX_CELL = 44; // höchstens so viele Pixel pro Feld beim Zoomen
const RULES_COLOR = 'Die farbigen Zahlen nennen die Blöcke je Zeile und Spalte in ihrer Reihenfolge. Zwischen Blöcken gleicher Farbe liegt mindestens ein leeres Feld, verschiedene Farben dürfen sich berühren.';
const RULES = 'Die Zahlen nennen die Längen der gefüllten Blöcke in jeder Zeile und Spalte, in dieser Reihenfolge, mit mindestens einem leeren Feld dazwischen.';
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export const mountNonogramColor = (root, opts) => mountNonogram(root, { ...opts, color: true });

export function mountNonogram(root, { level, onWin, onExit, color = false }) {
  const P = color ? generateColorLevel(level) : generateLevel(level);
  const { rows: R, cols: K, pixels } = P;
  const colors = P.colors || 1;
  const norm = (cl) => cl.map((v) => (typeof v === 'number' ? { n: v, c: 1 } : v));
  const rowClues = P.rowClues.map(norm), colClues = P.colClues.map(norm);
  const N = R * K;
  const FULL = (1 << (colors + 1)) - 1;
  const st = new Uint8Array(N);
  const undoStack = [];
  let lives = LIVES, hints = 0, mistakes = 0, over = false, tool = 1;
  let t0 = performance.now();

  const shell = createShell(root, {
    name: color ? 'Farbbilder' : 'Bilderrätsel', level, lives: LIVES, onHint: () => hint(), onUndo: () => undo(),
    onExit: (how) => { if (how !== 'menu') clearSave(); onExit(how); },
  });
  const hintBtn = root.querySelector('[data-act="hint"]');
  shell.board.classList.add('nono-wrap');
  const view = document.createElement('div');
  view.className = `nono-view ${color ? 'colored' : 'bw'}`;
  shell.board.appendChild(view);
  const svg = el('svg', { class: `board nono ${color ? 'colored' : 'bw'}`, preserveAspectRatio: 'none' });
  const bandTop = document.createElement('div'), bandLeft = document.createElement('div');
  bandTop.className = 'nono-band top'; bandLeft.className = 'nono-band left';
  const clueLayer = document.createElement('div');
  clueLayer.className = 'nono-clues';
  const fitBtn = document.createElement('button');
  fitBtn.className = 'nono-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  view.append(svg, bandTop, bandLeft, clueLayer, fitBtn);

  // Werkzeugwahl
  const tools = document.createElement('div');
  tools.className = `tool-switch ${color ? 'colored' : 'bw'}`;
  tools.innerHTML = (color
    ? Array.from({ length: colors }, (_, k) =>
      `<button data-tool="${k + 1}" class="${k ? '' : 'on'}" aria-label="Farbe ${k + 1}"><span class="sw-fill c${k + 1}"></span></button>`).join('')
    : '<button data-tool="1" class="on" aria-label="Füllen"><span class="sw-fill c1"></span>Füllen</button>') +
    `<button data-tool="${CROSS}" aria-label="Kreuz"><span class="sw-x">✕</span>${color ? '' : 'Kreuz'}</button>`;
  shell.board.appendChild(tools);
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    tool = Number(b.dataset.tool);
    tools.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    sound.tick();
  });

  // Zahlen (HTML, damit sie beim Zoomen am Rand stehen bleiben)
  const clueHTML = (cl, sep) => (cl.length ? cl.map((b) => `<i class="c${b.c}">${b.n}</i>`).join(sep) : '<i class="c0">0</i>');
  const rowSpan = rowClues.map((cl) => {
    const s = document.createElement('span');
    s.className = 'row';
    s.innerHTML = clueHTML(cl, ' ');
    clueLayer.appendChild(s);
    return s;
  });
  const colSpan = colClues.map((cl) => {
    const s = document.createElement('span');
    s.className = 'col';
    s.innerHTML = clueHTML(cl, '\n');
    clueLayer.appendChild(s);
    return s;
  });
  const maxCol = Math.max(...colClues.map((c) => Math.max(c.length, 1)));

  // Feld
  const grid = el('g');
  grid.appendChild(el('rect', { width: K * C, height: R * C, class: 'field' }));
  const hl = el('path', { class: 'line-hl' });
  const hintRect = el('rect', { width: C, height: C, class: 'hint-cell', visibility: 'hidden' });
  const ghost = el('path', { class: 'ghost' });
  const fills = Array.from({ length: colors }, (_, k) => el('path', { class: `fills c${k + 1}` }));
  const crosses = el('path', { class: 'crosses' });
  let thin = '', thick = '';
  for (let c = 1; c < K; c++) if (c % 5) thin += `M${c * C} 0V${R * C}`; else thick += `M${c * C} 0V${R * C}`;
  for (let r = 1; r < R; r++) if (r % 5) thin += `M0 ${r * C}H${K * C}`; else thick += `M0 ${r * C}H${K * C}`;
  grid.append(hl, hintRect, ...fills, crosses,
    el('path', { d: thin, class: 'grid-thin' }),
    el('path', { d: thick, class: 'grid-thick' }),
    el('rect', { width: K * C, height: R * C, class: 'grid-frame' }),
    ghost);
  svg.appendChild(grid);

  // ---------- Regeln ----------
  const rowOf = (r) => Array.from({ length: K }, (_, c) => st[r * K + c]);
  const colOf = (c) => Array.from({ length: R }, (_, r) => st[r * K + c]);
  const same = (a, b) => a.length === b.length && a.every((v, i) => v.n === b[i].n && v.c === b[i].c);
  // Zustand → Bitmaske für den Löser (Bit 0 = leer, Bit c = Farbe c)
  const mask = (v) => (v === EMPTY ? FULL : v === CROSS ? 1 : 1 << v);
  const colorOf = (v) => (v === CROSS ? 0 : v);
  const single = (m) => m && (m & (m - 1)) === 0;
  // Zeile passt nicht mehr zu den Zahlen (mit Füllungen und Kreuzen nicht lösbar)
  const broken = (line, cl) => solveLineColor(line.map(mask), cl) === null;
  function lineState() {
    const rowBad = [], colBad = [], rowDone = [], colDone = [];
    let bad = 0;
    for (let r = 0; r < R; r++) {
      const line = rowOf(r);
      rowBad[r] = broken(line, rowClues[r]);
      rowDone[r] = same(colorCluesOf(line.map(colorOf)), rowClues[r]);
      bad += rowBad[r];
    }
    for (let c = 0; c < K; c++) {
      const line = colOf(c);
      colBad[c] = broken(line, colClues[c]);
      colDone[c] = same(colorCluesOf(line.map(colorOf)), colClues[c]);
      bad += colBad[c];
    }
    return { rowBad, colBad, rowDone, colDone, bad };
  }

  function render() {
    const df = new Array(colors + 1).fill('');
    let dx = '';
    for (let i = 0; i < N; i++) {
      const x = (i % K) * C, y = Math.floor(i / K) * C;
      if (st[i] === CROSS) dx += `M${x + 3.2} ${y + 3.2}L${x + 6.8} ${y + 6.8}M${x + 6.8} ${y + 3.2}L${x + 3.2} ${y + 6.8}`;
      else if (st[i]) df[st[i]] += `M${x + 0.6} ${y + 0.6}h${C - 1.2}v${C - 1.2}h${-(C - 1.2)}z`;
    }
    fills.forEach((f, k) => f.setAttribute('d', df[k + 1]));
    crosses.setAttribute('d', dx);
    const s = lineState();
    rowSpan.forEach((sp, r) => { sp.classList.toggle('done', s.rowDone[r] && !s.rowBad[r]); sp.classList.toggle('bad', s.rowBad[r]); });
    colSpan.forEach((sp, c) => { sp.classList.toggle('done', s.colDone[c] && !s.colBad[c]); sp.classList.toggle('bad', s.colBad[c]); });
    return s;
  }

  function updateHud() {
    shell.setLives(lives);
    if (hintBtn) hintBtn.classList.toggle('nono-no-hint', lives <= 1);
  }

  // ---------- Zoomen und Verschieben ----------
  // Alles in Bildschirmpixeln: s = Pixel pro Feld, (ox, oy) = linke obere Feldecke.
  let vw = 0, vh = 0, sFit = 10, fFit = 9, s = 10, ox = 0, oy = 0;
  let rowW10 = 0; // Breite der längsten Zeilenzahlen bei 10 px Schrift
  const lineH = 1.08;
  const leftW = (f) => (rowW10 * f) / 10 + 0.5 * f + 3;
  const topH = (f) => maxCol * f * lineH + 0.4 * f + 3;
  const font = () => Math.min(15, Math.max(fFit, s * 0.6));
  function measure() {
    clueLayer.style.fontSize = '10px';
    rowW10 = Math.max(...rowSpan.map((sp) => sp.getBoundingClientRect().width));
    if (!rowW10) rowW10 = Math.max(...rowClues.map((cl) => cl.map((b) => b.n).join(' ').length || 1)) * 5.6;
  }
  function fit(keepZoom) {
    const rect = view.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const z = keepZoom ? s / sFit : 1;
    vw = rect.width; vh = rect.height;
    let f = 9, cell = 10;
    for (let k = 0; k < 6; k++) {
      cell = Math.min((vw - leftW(f) - 2) / K, (vh - topH(f) - 2) / R);
      f = Math.min(14, Math.max(6.5, cell * 0.7));
    }
    sFit = Math.max(2, cell); fFit = f;
    s = Math.min(Math.max(sFit * z, sFit), Math.max(sFit, MAX_CELL));
    clampView();
  }
  function clampView() {
    const f = font(), L = leftW(f), T = topH(f);
    const tw = L + K * s + 2, th = T + R * s + 2;
    ox = tw <= vw ? L + (vw - tw) / 2 : Math.min(Math.max(ox, vw - 2 - K * s), L);
    oy = th <= vh ? T + (vh - th) / 2 : Math.min(Math.max(oy, vh - 2 - R * s), T);
    const u = C / s;
    svg.setAttribute('viewBox', `${-ox * u} ${-oy * u} ${vw * u} ${vh * u}`);
    fitBtn.hidden = s < sFit * 1.05;
    placeClues(f, L, T);
  }
  // Zahlen über bzw. neben dem Feld; ist das Feld weiter oben/links als der
  // sichtbare Ausschnitt, bleiben sie am Rand stehen (mit Hintergrundstreifen).
  function placeClues(f, L, T) {
    clueLayer.style.fontSize = `${f}px`;
    const gapL = 0.4 * f, gapT = 0.25 * f;
    const leftOn = ox < L - 0.5, topOn = oy < T - 0.5;
    const rx = Math.max(ox, L) - gapL, by = Math.max(oy, T) - gapT;
    rowSpan.forEach((sp, r) => {
      const y = oy + (r + 0.5) * s;
      sp.style.transform = `translate(${rx}px, ${y}px) translate(-100%, -50%)`;
      sp.style.visibility = (topOn && y < T) || y < -s || y > vh + s ? 'hidden' : '';
    });
    colSpan.forEach((sp, c) => {
      const x = ox + (c + 0.5) * s;
      sp.style.transform = `translate(${x}px, ${by}px) translate(-50%, -100%)`;
      sp.style.visibility = (leftOn && x < L) || x < -s || x > vw + s ? 'hidden' : '';
    });
    bandTop.style.height = `${T}px`;
    bandLeft.style.width = `${L}px`;
    bandTop.classList.toggle('on', topOn);
    bandLeft.classList.toggle('on', leftOn);
  }
  // Zoomen um einen Bildschirmpunkt (px, py relativ zur Ansicht); (u, v) = Feldpunkt in Feldern
  function zoomTo(newS, px, py, u, v) {
    s = Math.min(Math.max(newS, sFit), Math.max(sFit, MAX_CELL));
    ox = px - u * s; oy = py - v * s;
    clampView();
  }
  const local = (x, y) => { const r = view.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  fitBtn.addEventListener('click', () => { s = sFit; clampView(); });
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = local(e.clientX, e.clientY);
    zoomTo(s * Math.exp(-e.deltaY * 0.0015), px, py, (px - ox) / s, (py - oy) / s);
  }, { passive: false });
  // Ausschnitt so verschieben, dass ein Feld sichtbar ist
  function reveal(i) {
    if (s < sFit * 1.05) return;
    const f = font(), L = leftW(f), T = topH(f);
    const x = ox + ((i % K) + 0.5) * s, y = oy + (Math.floor(i / K) + 0.5) * s;
    if (x > L + s && x < vw - s && y > T + s && y < vh - s) return;
    ox -= x - (L + vw) / 2; oy -= y - (T + vh) / 2;
    clampView();
  }

  // ---------- Eingabe ----------
  // Ein Finger: tippen bzw. wischen. Zwei Finger: zoomen/verschieben –
  // ein angefangenes Wischen wird dann verworfen.
  function cellAt(x, y, clamp = false) {
    const [px, py] = local(x, y);
    let c = Math.floor((px - ox) / s), r = Math.floor((py - oy) / s);
    if (clamp) { c = Math.max(0, Math.min(K - 1, c)); r = Math.max(0, Math.min(R - 1, r)); }
    return r >= 0 && c >= 0 && r < R && c < K ? [r, c] : null;
  }
  // Setzen nur auf leeren Feldern; Löschen nur Felder wie das Startfeld
  const apply = (d, o) => (d.action === 'set' ? (o === EMPTY ? d.v : o) : (o === d.v ? EMPTY : o));

  const pointers = new Map();
  let pinch = null, multi = false, drag = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: s, u: (mx - ox) / s, v: (my - oy) / s };
  }
  function abortDrag() {
    if (drag) { st.set(drag.orig); hl.setAttribute('d', ''); render(); }
    drag = null;
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) { pointers.clear(); multi = false; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) {
      abortDrag();
      multi = true;
      startPinch();
      return;
    }
    if (over || e.button > 0) return;
    const rc = cellAt(e.clientX, e.clientY);
    if (!rc) return;
    const o = st[rc[0] * K + rc[1]];
    const action = o === EMPTY ? 'set' : 'clear';
    drag = { r: rc[0], c: rc[1], axis: null, action, v: o === EMPTY ? tool : o, orig: st.slice(), bad0: lineState().bad };
    clearHint();
    paintTo(rc);
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomTo(pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, mx, my, pinch.u, pinch.v);
      return;
    }
    if (!drag || multi) return;
    const rc = cellAt(e.clientX, e.clientY, true);
    if (!drag.axis && (rc[0] !== drag.r || rc[1] !== drag.c)) drag.axis = rc[0] === drag.r ? 'row' : 'col';
    if (drag.axis) paintTo(rc);
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
    for (const i of cells) st[i] = apply(drag, drag.orig[i]);
    // Zeile bzw. Spalte dezent hervorheben
    const y = drag.r * C, x = drag.c * C;
    hl.setAttribute('d', drag.axis === 'col' ? `M${x} 0h${C}v${R * C}h${-C}z` : `M0 ${y}h${K * C}v${C}h${-K * C}z`);
    render();
  }
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) startPinch();
    else pinch = null;
    if (pointers.size > 0) return;
    if (!drag) return;
    if (multi || over || e.type === 'pointercancel') { abortDrag(); return; }
    const d = drag;
    drag = null;
    hl.setAttribute('d', '');
    const changed = d.orig.some((v, i) => v !== st[i]);
    const ls = render();
    if (!changed) return;
    undoStack.push(d.orig); // die Auto-Kreuze gehören zum selben Schritt
    const hurt = ls.bad > d.bad0;
    autoCross();
    render();
    if (hurt) {
      // sichtbarer Regelverstoß: kostet ein Herz
      lives--; mistakes++;
      updateHud();
      saveState();
      sound.bump();
      shell.vibrate([30, 40, 30]);
      if (lives <= 0) lose();
      return;
    }
    if (d.action === 'set' && d.v !== CROSS) sound.click(); else sound.tick();
    saveState();
    checkWin();
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // Zeile/Spalte mit allen Blöcken fertig → übrige leere Felder bekommen ein Kreuz
  function autoCross() {
    const s = lineState();
    for (let r = 0; r < R; r++) if (s.rowDone[r] && !s.rowBad[r])
      for (let c = 0; c < K; c++) if (st[r * K + c] === EMPTY) st[r * K + c] = CROSS;
    for (let c = 0; c < K; c++) if (s.colDone[c] && !s.colBad[c])
      for (let r = 0; r < R; r++) if (st[r * K + c] === EMPTY) st[r * K + c] = CROSS;
  }

  function undo() {
    if (over || !undoStack.length) return;
    st.set(undoStack.pop());
    clearHint();
    render();
    saveState();
    sound.tick();
  }

  // ---------- Tipp ----------
  // Jeder Tipp kostet ein Herz; mit dem letzten Herz gibt es keinen Tipp mehr.
  let hinted = -1;
  function clearHint() { hinted = -1; hintRect.setAttribute('visibility', 'hidden'); ghost.setAttribute('d', ''); }
  function findHint() {
    // 1. Fehler zuerst: falsch gefüllt oder Kreuz auf einem Bildfeld
    for (let i = 0; i < N; i++) if (st[i] !== EMPTY && colorOf(st[i]) !== pixels[i]) return i;
    // 2. Ein Feld, das sich aus dem jetzigen Stand logisch ergibt (gefüllt oder leer)
    const sure = [];
    for (let r = 0; r < R; r++) {
      const line = rowOf(r), res = solveLineColor(line.map(mask), rowClues[r]);
      if (res) for (let c = 0; c < K; c++) if (line[c] === EMPTY && single(res[c])) sure.push(r * K + c);
    }
    for (let c = 0; c < K; c++) {
      const line = colOf(c), res = solveLineColor(line.map(mask), colClues[c]);
      if (res) for (let r = 0; r < R; r++) if (line[r] === EMPTY && single(res[r])) sure.push(r * K + c);
    }
    const filled = sure.filter((i) => pixels[i]);
    const pool = filled.length ? filled : sure;
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    return pixels.findIndex((v, k) => v && st[k] !== v);
  }
  function hint() {
    if (over) return;
    if (hinted >= 0) { reveal(hinted); return; } // wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); return; }
    const i = findHint();
    if (i < 0) return;
    lives--; hints++;
    updateHud();
    saveState();
    hinted = i;
    const x = (i % K) * C, y = Math.floor(i / K) * C;
    hintRect.setAttribute('x', x);
    hintRect.setAttribute('y', y);
    hintRect.setAttribute('visibility', 'visible');
    // Rahmen = hier gehört eine Füllung hin, Kreuz = hier bleibt es leer (bei Fehlern nichts)
    const wrong = st[i] !== EMPTY;
    ghost.setAttribute('class', `ghost c${pixels[i]}`);
    ghost.setAttribute('d', wrong ? '' : pixels[i]
      ? `M${x + 1.6} ${y + 1.6}h${C - 3.2}v${C - 3.2}h${-(C - 3.2)}z`
      : `M${x + 3} ${y + 3}L${x + 7} ${y + 7}M${x + 7} ${y + 3}L${x + 3} ${y + 7}`);
    reveal(i);
    sound.tick();
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!over) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function checkWin() {
    for (let i = 0; i < N; i++) if (colorOf(st[i]) !== pixels[i]) return;
    over = true;
    clearSave();
    clearInterval(timer);
    clearHint();
    for (let i = 0; i < N; i++) if (st[i] === CROSS) st[i] = EMPTY;
    render();
    s = sFit; clampView(); // ganzes Bild zeigen
    svg.classList.add('solved');
    view.classList.add('solved');
    tools.style.visibility = 'hidden';
    const details = [];
    if (P.name) details.push(P.name);
    details.push(timeText(performance.now() - t0), mistakesText(mistakes));
    if (hints) details.push(`${hints} ${hints === 1 ? 'Tipp' : 'Tipps'}`);
    setTimeout(() => shell.win(details), 1000);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    clearSave();
    clearInterval(timer);
    clearHint();
    shell.lose(color ? RULES_COLOR : RULES);
  }

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) {
    window.__game = {
      R, K, pixels, st, get lives() { return lives; },
      // Bildschirmpunkt der Feldmitte (für automatisches Durchspielen)
      at(i) { const r = view.getBoundingClientRect(); return [r.left + ox + ((i % K) + 0.5) * s, r.top + oy + (Math.floor(i / K) + 0.5) * s]; },
    };
  }

  // ---------- Spielstand im Level ----------
  const SAVE_KEY = `knobelkiste-${color ? 'nonogramColor' : 'nonogram'}-stand`;
  const hex = (a) => Array.from(a, (v) => v.toString(16)).join('');
  const unhex = (t) => Uint8Array.from(t, (ch) => parseInt(ch, 16));
  function saveState() {
    if (over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level, R, K, st: hex(st), lives, hints, mistakes, time: performance.now() - t0,
        undo: undoStack.slice(-40).map(hex),
      }));
    } catch {}
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.level === level && sv.R === R && sv.K === K && sv.st.length === N && sv.lives > 0) {
      st.set(unhex(sv.st));
      lives = sv.lives; hints = sv.hints; mistakes = sv.mistakes;
      t0 = performance.now() - sv.time;
      undoStack.push(...sv.undo.filter((u) => u.length === N).map(unhex));
      shell.setCounter(timeText(sv.time).replace(' min', ''));
    }
  } catch {}
  // beim Verlassen der Seite bzw. Wechsel in eine andere App die Zeit mitspeichern
  const onHide = () => { if (svg.isConnected && document.visibilityState === 'hidden') saveState(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => { if (svg.isConnected) saveState(); });

  measure();
  fit(false);
  new ResizeObserver(() => { if (svg.isConnected) fit(true); }).observe(view);
  updateHud();
  render();
}
