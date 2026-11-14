// Gleisbau: Spielfeld und Bedienung, Einzelfeld und Großstrecke.
// Ziehen von Feld zu Feld legt Gleise (über ein vorhandenes Gleis ziehen
// entfernt es). Antippen: Gleise im Feld entfernen bzw. Feld als leer markieren.
import { DR, DC, bit, opp, routeParams, nextEntry } from './generator.js';
import { getLevel, getRoutePanel } from './gen-client.js';
import { el, bits, cellPath, trackLayer, overviewSVG } from './draw.js';
import { createShell, timeText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;
const M = 1.75 * C; // Rand für die Zahlen oben/links

// Ladeanzeige, solange ein Rätsel im Hintergrund erzeugt wird
function showLoading(root, name, label, onExit) {
  const shell = createShell(root, { name, label, onExit });
  shell.board.innerHTML = '<p class="loading">Rätsel wird gebaut …</p>';
  return shell;
}

// ---------- Einzelfeld ----------
export async function mountTracks(root, { level, onWin, onExit }) {
  const token = (root.dataset.mount = String(Math.random()));
  showLoading(root, 'Gleisbau', `Level ${level}`, onExit);
  const L = await getLevel(level);
  if (root.dataset.mount !== token) return; // inzwischen verlassen
  getLevel(level + 1); // nächstes Level schon vorbereiten
  const board = mountBoard(root, L, {
    name: 'Gleisbau', label: `Level ${level}`, level, onExit,
    onSolved(details, shell) {
      shell.win(details);
      onWin && onWin(level);
    },
  });
  return board;
}

// ---------- Großstrecke ----------
// rs = gespeicherter Stand: { route, done, panels: [...] } (panels = bekannte Felder)
export async function mountTrackRoute(root, { rs, save, onExit, intro = true }) {
  const R = routeParams(rs.route);
  const token = (root.dataset.mount = String(Math.random()));
  const k = rs.done;
  const label = `Strecke ${rs.route} · Feld ${k + 1}/${R.count}`;
  const shell = showLoading(root, 'Großstrecke', label, onExit);

  // Bei Fortsetzung zuerst die Karte zeigen
  if (intro && k > 0) {
    await new Promise((resolve) => {
      const card = shell.showCard(`<h2>Strecke ${rs.route}</h2>
        <p>${k} von ${R.count} Feldern gelöst</p>
        <div class="map-wrap"></div>
        <button class="primary" data-go>Weiter mit Feld ${k + 1}</button>
        <button class="secondary" data-act="back">Zum Menü</button>`);
      card.querySelector('.map-wrap').appendChild(overviewSVG(R, rs.panels, k, k));
      card.querySelector('[data-go]').onclick = (e) => { e.stopPropagation(); resolve(); };
    });
    if (root.dataset.mount !== token) return;
  }

  if (!rs.panels[k]) {
    const entry = k > 0 ? nextEntry(rs.panels[k - 1]) : null;
    rs.panels[k] = await getRoutePanel(rs.route, k, entry);
    save();
  }
  if (root.dataset.mount !== token) return;
  const panel = rs.panels[k];
  // nächstes Feld schon im Hintergrund vorbereiten
  if (k + 1 < R.count) getRoutePanel(rs.route, k + 1, nextEntry(panel));

  mountBoard(root, panel, {
    name: 'Großstrecke', label, onExit,
    onSolved(details, sh) {
      rs.done = k + 1;
      const last = rs.done === R.count;
      const map = overviewSVG(R, rs.panels, rs.done, last ? -1 : rs.done);
      const finishedRoute = rs.route;
      if (last) { rs.route++; rs.done = 0; rs.panels = []; }
      save();
      sound.solved();
      const card = sh.showCard(last
        ? `<h2>Strecke ${finishedRoute} fertig</h2>
           <p>${R.count} Felder · ${R.n * R.layout.cols}×${R.n * R.layout.rows} Felder groß</p>
           <div class="map-wrap big"></div>
           <button class="primary" data-act="next">Strecke ${finishedRoute + 1}</button>
           <button class="secondary" data-act="back">Zum Menü</button>`
        : `<h2>Feld ${k + 1} von ${R.count} gelöst</h2>
           <p>${details.join(' · ')}</p>
           <div class="map-wrap"></div>
           <button class="primary" data-act="next">Weiter mit Feld ${k + 2}</button>
           <button class="secondary" data-act="back">Zum Menü</button>`);
      card.querySelector('.map-wrap').appendChild(map);
    },
  });
}

// ---------- Spielfeld (für beide Modi) ----------
function mountBoard(root, L, { name, label, level, onExit, onSolved }) {
  const { n, rowC, colC, given, solution } = L;
  const isGiven = (i) => given[i] >= 0;
  const conn = new Uint8Array(n * n);
  const xmark = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) if (isGiven(i)) conn[i] = given[i];
  const undoStack = [];
  let hints = 0, solved = false;
  const t0 = performance.now();

  const shell = createShell(root, {
    name, label, level, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  const W = M + n * C + 0.6 * C, H = M + n * C + 0.6 * C;
  const svg = el('svg', { class: 'board tracks', viewBox: `0 0 ${W} ${H}` });
  shell.board.appendChild(svg);

  // Hintergrund und Raster
  const grid = el('g', { transform: `translate(${M} ${M})` });
  grid.appendChild(el('rect', { width: n * C, height: n * C, class: 'field' }));
  const hintRect = el('rect', { width: C, height: C, class: 'hint-cell', visibility: 'hidden' });
  grid.appendChild(hintRect);
  let lines = '';
  for (let k = 1; k < n; k++) lines += `M${k * C} 0 V${n * C} M0 ${k * C} H${n * C} `;
  grid.appendChild(el('path', { d: lines, class: 'grid-line' }));
  grid.appendChild(el('rect', { width: n * C, height: n * C, class: 'grid-frame' }));
  const marks = el('path', { class: 'x-mark' });
  const drawGiven = trackLayer(grid, 'track given');
  const drawPlayer = trackLayer(grid, 'track player');
  grid.appendChild(marks);
  svg.appendChild(grid);

  // Zahlen
  const clueRow = [], clueCol = [];
  for (let k = 0; k < n; k++) {
    const t1 = el('text', { x: M + (k + 0.5) * C, y: M - 0.8 * C, class: 'clue', 'dominant-baseline': 'central' });
    t1.textContent = colC[k];
    const t2 = el('text', { x: M - 1.0 * C, y: M + (k + 0.5) * C, class: 'clue', 'dominant-baseline': 'central' });
    t2.textContent = rowC[k];
    svg.append(t1, t2);
    clueCol.push(t1); clueRow.push(t2);
  }

  // Start/Ziel ragen ein Stück über den Rand hinaus
  const extendFor = (i) => (d) => (i === L.start && d === L.startOut) || (i === L.end && d === L.endOut);

  function render() {
    let dg = '', dp = '', dx = '';
    for (let i = 0; i < n * n; i++) {
      if (isGiven(i)) dg += cellPath(n, i, conn[i], C, extendFor(i));
      else if (conn[i]) dp += cellPath(n, i, conn[i], C, extendFor(i));
      else if (xmark[i]) {
        const x = (i % n) * C + C / 2, y = Math.floor(i / n) * C + C / 2, s = 1.1;
        dx += `M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s} `;
      }
    }
    drawGiven(dg); drawPlayer(dp); marks.setAttribute('d', dx);
    // Zahlen: erfüllt → blass, zu viele → rot
    for (let k = 0; k < n; k++) {
      let ru = 0, cu = 0;
      for (let j = 0; j < n; j++) { if (conn[k * n + j]) ru++; if (conn[j * n + k]) cu++; }
      clueRow[k].setAttribute('class', 'clue' + (ru === rowC[k] ? ' done' : ru > rowC[k] ? ' over' : ''));
      clueCol[k].setAttribute('class', 'clue' + (cu === colC[k] ? ' done' : cu > colC[k] ? ' over' : ''));
    }
  }

  // ---------- Änderungen ----------
  const snapshot = () => ({ conn: conn.slice(), xmark: xmark.slice() });
  let pending = null; // Zustand vor der laufenden Aktion
  function begin() { if (!pending) pending = snapshot(); }
  function commit(soundFn) {
    if (!pending) return;
    const changed = pending.conn.some((v, i) => v !== conn[i]) || pending.xmark.some((v, i) => v !== xmark[i]);
    if (changed) { undoStack.push(pending); clearHint(); soundFn && soundFn(); }
    pending = null;
    render();
    if (changed) checkWin();
  }
  function undo() {
    if (solved || !undoStack.length) return;
    const s = undoStack.pop();
    conn.set(s.conn); xmark.set(s.xmark);
    clearHint();
    render();
    sound.tick();
  }

  // Verbindung zwischen Feld a und Nachbar in Richtung d setzen/entfernen
  function canHold(i, d) {
    if (isGiven(i)) return !!(given[i] & bit(d));
    return (conn[i] & bit(d)) || bits(conn[i]).length < 2;
  }
  function link(a, d, on) {
    const b = a + DR[d] * n + DC[d];
    if (on) {
      if (!canHold(a, d) || !canHold(b, opp(d))) return false;
      if (!isGiven(a)) conn[a] |= bit(d);
      if (!isGiven(b)) conn[b] |= bit(opp(d));
      xmark[a] = xmark[b] = 0;
    } else {
      if (isGiven(a) && isGiven(b)) return false;
      if (!isGiven(a)) conn[a] &= ~bit(d);
      if (!isGiven(b)) conn[b] &= ~bit(opp(d));
    }
    return true;
  }
  function clearCell(i) {
    for (const d of bits(conn[i])) {
      const r = Math.floor(i / n) + DR[d], c = (i % n) + DC[d];
      if (r < 0 || c < 0 || r >= n || c >= n) continue;
      const j = r * n + c;
      if (!isGiven(j)) conn[j] &= ~bit(opp(d));
    }
    conn[i] = 0;
  }

  // ---------- Eingabe ----------
  function cellAt(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const c = Math.floor((p.x - M) / C), r = Math.floor((p.y - M) / C);
    return r >= 0 && c >= 0 && r < n && c < n ? [r, c] : null;
  }
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (solved) return;
    const rc = cellAt(e);
    if (!rc) return;
    try { svg.setPointerCapture(e.pointerId); } catch {}
    drag = { r: rc[0], c: rc[1], moved: false, mode: null };
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const rc = cellAt(e);
    if (!rc) return;
    // Schritt für Schritt zum aktuellen Feld (auch bei schnellen Bewegungen)
    while (drag.r !== rc[0] || drag.c !== rc[1]) {
      const dr = rc[0] - drag.r, dc = rc[1] - drag.c;
      const d = Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 2 : 0) : (dc > 0 ? 1 : 3);
      const a = drag.r * n + drag.c;
      if (!drag.mode) {
        // Löschen nur, wenn die Verbindung auf BEIDEN Seiten besteht
        // (eine Vorgabe zeigt evtl. schon in diese Richtung – dann zeichnen)
        const b = a + DR[d] * n + DC[d];
        drag.mode = (conn[a] & bit(d)) && (conn[b] & bit(opp(d))) ? 'erase' : 'draw';
        begin();
      }
      drag.moved = true;
      link(a, d, drag.mode === 'draw');
      drag.r += DR[d]; drag.c += DC[d];
    }
    render();
  });
  svg.addEventListener('pointerup', () => {
    if (!drag) return;
    if (!drag.moved) {
      const i = drag.r * n + drag.c;
      if (!isGiven(i)) {
        begin();
        if (conn[i]) clearCell(i); else xmark[i] ^= 1;
        commit(sound.tick);
      }
    } else {
      commit(drag.mode === 'draw' ? sound.click : sound.tick);
    }
    drag = null;
  });
  svg.addEventListener('pointercancel', () => { if (pending) commit(); drag = null; });

  // ---------- Tipp ----------
  function clearHint() { hintRect.setAttribute('visibility', 'hidden'); }
  function hint() {
    if (solved) return;
    // 1. falsches Gleis, 2. Kreuz auf einem Gleisfeld, 3. fehlendes Gleis
    let i = [...Array(n * n).keys()].find((k) => conn[k] && conn[k] !== solution[k]);
    if (i === undefined) i = [...Array(n * n).keys()].find((k) => xmark[k] && solution[k]);
    if (i === undefined) i = [...Array(n * n).keys()].find((k) => solution[k] && conn[k] !== solution[k]);
    if (i === undefined) return;
    hints++;
    hintRect.setAttribute('x', (i % n) * C);
    hintRect.setAttribute('y', Math.floor(i / n) * C);
    hintRect.setAttribute('visibility', 'visible');
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!solved) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function checkWin() {
    for (let i = 0; i < n * n; i++) if (conn[i] !== solution[i]) return;
    solved = true;
    clearInterval(timer);
    svg.classList.add('solved');
    const details = [timeText(performance.now() - t0)];
    if (hints) details.push(`${hints} Tipp${hints > 1 ? 's' : ''}`);
    setTimeout(() => onSolved(details, shell), 700);
  }

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) window.__game = { n, solution, M, C };

  render();
}
