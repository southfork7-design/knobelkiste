// Gleisbau: Spielfeld und Bedienung, Einzelfeld und Großstrecke.
// Tippen: Kreuz an/aus. Ziehen von einem leeren Feld bzw. Kreuz aus: Kreuze
// setzen bzw. löschen (Gleisfelder werden übersprungen). Doppeltippen: Gleis
// setzen (Kreuzungsgleis, Richtung noch offen) bzw. Gleis entfernen. Ziehen von
// einem Gleisfeld aus: benachbarte, schon gesetzte Gleise verbinden (leere
// Felder bleiben leer; über ein Gleis zurückziehen entfernt die Verbindung). Zwei Finger: zoomen und verschieben,
// Mausrad am Computer. Die Zahlen bleiben beim Zoomen am Rand stehen.
// 3 Herzen: Ein sichtbarer Regelverstoß (Zeile/Spalte über der Zahl,
// geschlossener Ring) und jeder Tipp kosten ein Herz.
import { DR, DC, bit, opp, routeParams, nextEntry, VERSION } from './generator.js';
import { getLevel, getRoutePanel } from './gen-client.js';
import { el, bits, cellPath, trackLayer, overviewSVG, routePath, rocksPath } from './draw.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;
const M = 1.9 * C; // Platz für die Zahlen oben/links (bei ganzem Bild)
const P = 0.7 * C; // Rand rechts/unten (Gleisenden)
const LIVES = 3;
const RULES = 'Eine Strecke ohne Abzweigungen vom Start zum Ziel – die Zahlen sagen, wie viele Felder je Zeile und Spalte Gleise haben.';

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
  mountBoard(root, L, {
    name: 'Gleisbau', label: `Level ${level}`, level, onExit,
    onSolved(details, shell) {
      shell.win(details);
      onWin && onWin(level);
    },
  });
}

// ---------- Großstrecke ----------
// rs = gespeicherter Stand: { route, done, panels: [...] } (panels = bekannte Felder)
export async function mountTrackRoute(root, { rs, save, onExit, intro = true }) {
  // Felder aus einer älteren Fassung passen nicht mehr zusammen → Strecke neu beginnen
  if (rs.panels.some((p) => p && p.v !== VERSION)) { rs.done = 0; rs.panels = []; save(); }
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
  const { W, H, rowC, colC, given, solution } = L;
  const N = W * H;
  const blocked = L.blocked || new Array(N).fill(0);
  const isGiven = (i) => given[i] >= 0;
  const conn = new Uint8Array(N);
  const xmark = new Uint8Array(N);
  const tmark = new Uint8Array(N); // Gleis gesetzt, Richtung noch offen
  const hasTrack = (i) => conn[i] || tmark[i];
  for (let i = 0; i < N; i++) if (isGiven(i)) conn[i] = given[i];
  const undoStack = [];
  let lives = LIVES, hints = 0, mistakes = 0, over = false;
  const t0 = performance.now();

  const shell = createShell(root, {
    name, label, level, lives: LIVES, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  const hintBtn = root.querySelector('[data-act="hint"]');
  const view = document.createElement('div');
  view.className = 'tracks-view';
  shell.board.appendChild(view);
  const svg = el('svg', { class: 'board tracks', preserveAspectRatio: 'xMidYMid meet' });
  view.appendChild(svg);
  const bandTop = document.createElement('div'), bandLeft = document.createElement('div');
  bandTop.className = 'tracks-band top'; bandLeft.className = 'tracks-band left';
  const clueLayer = document.createElement('div');
  clueLayer.className = 'tracks-clues';
  view.append(bandTop, bandLeft, clueLayer);
  const fitBtn = document.createElement('button');
  fitBtn.className = 'tracks-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  view.appendChild(fitBtn);

  // Hintergrund, Felsen und Raster
  const grid = el('g');
  grid.appendChild(el('rect', { width: W * C, height: H * C, class: 'field' }));
  const rocks = rocksPath({ W, blocked }, C);
  grid.appendChild(el('path', { d: rocks.base, class: 'rock' }));
  grid.appendChild(el('path', { d: rocks.stones, class: 'stone' }));
  const hintRect = el('rect', { width: C, height: C, class: 'hint-cell', visibility: 'hidden' });
  grid.appendChild(hintRect);
  let lines = '';
  for (let k = 1; k < W; k++) lines += `M${k * C} 0 V${H * C} `;
  for (let k = 1; k < H; k++) lines += `M0 ${k * C} H${W * C} `;
  grid.appendChild(el('path', { d: lines, class: 'grid-line' }));
  grid.appendChild(el('rect', { width: W * C, height: H * C, class: 'grid-frame' }));
  const marks = el('path', { class: 'x-mark' });
  const ghost = el('path', { class: 'ghost' });
  const drawGiven = trackLayer(grid, 'track given');
  const drawCross = trackLayer(grid, 'track player cross');
  const drawPlayer = trackLayer(grid, 'track player');
  const drawBad = trackLayer(grid, 'track bad');
  const drawDone = trackLayer(grid, 'track done');
  grid.append(marks, ghost);
  svg.appendChild(grid);

  // Zahlen (HTML, damit sie beim Zoomen am Rand stehen bleiben)
  const clueCol = colC.map((v) => { const s = document.createElement('span'); s.textContent = v; clueLayer.appendChild(s); return s; });
  const clueRow = rowC.map((v) => { const s = document.createElement('span'); s.textContent = v; clueLayer.appendChild(s); return s; });

  // Start/Ziel ragen ein Stück über den Rand hinaus
  const extendFor = (i) => (d) => (i === L.start && d === L.startOut) || (i === L.end && d === L.endOut);

  // ---------- Regeln ----------
  // Zeilen/Spalten über der Zahl und Felder in geschlossenen Ringen
  function violations() {
    const overRow = new Set(), overCol = new Set(), ring = new Set();
    const ru = new Array(H).fill(0), cu = new Array(W).fill(0);
    for (let i = 0; i < N; i++) if (hasTrack(i)) { ru[Math.floor(i / W)]++; cu[i % W]++; }
    ru.forEach((u, k) => { if (u > rowC[k]) overRow.add(k); });
    cu.forEach((u, k) => { if (u > colC[k]) overCol.add(k); });
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (seen[i] || bits(conn[i]).length !== 2) continue;
      // Gleisstück ablaufen: Ring, wenn man ohne offenes Ende zurückkommt
      const cells = [];
      let a = i, from = bits(conn[i])[0], closed = false;
      for (;;) {
        seen[a] = 1; cells.push(a);
        const out = bits(conn[a]).find((d) => d !== from);
        if (out === undefined || bits(conn[a]).length !== 2) break;
        const r = Math.floor(a / W) + DR[out], c = (a % W) + DC[out];
        if (r < 0 || c < 0 || r >= H || c >= W) break;
        const b = r * W + c;
        if (!(conn[b] & bit(opp(out)))) break;
        if (b === i) { closed = true; break; }
        if (seen[b]) break;
        a = b; from = opp(out);
      }
      if (closed) cells.forEach((x) => ring.add(x));
    }
    return { overRow, overCol, ring };
  }
  const violCount = (v) => v.overRow.size + v.overCol.size + (v.ring.size ? 1 : 0);

  function render() {
    let dg = '', dp = '', db = '', dx = '', dc = '';
    const v = violations();
    for (let i = 0; i < N; i++) {
      if (isGiven(i)) dg += cellPath(W, i, conn[i], C, extendFor(i));
      else if (conn[i]) {
        const p = cellPath(W, i, conn[i], C, extendFor(i));
        if (v.ring.has(i)) db += p; else dp += p;
      } else if (tmark[i]) {
        const x = (i % W) * C + C / 2, y = Math.floor(i / W) * C + C / 2, s = C * 0.36;
        dc += `M${x - s} ${y} H${x + s} M${x} ${y - s} V${y + s} `;
      } else if (xmark[i]) {
        const x = (i % W) * C + C / 2, y = Math.floor(i / W) * C + C / 2, s = 1.3;
        dx += `M${x - s} ${y - s} L${x + s} ${y + s} M${x + s} ${y - s} L${x - s} ${y + s} `;
      }
    }
    drawGiven(dg); drawCross(dc); drawPlayer(dp); drawBad(db); marks.setAttribute('d', dx);
    // Zahlen: erfüllt → blass, zu viele → rot
    const ru = new Array(H).fill(0), cu = new Array(W).fill(0);
    for (let i = 0; i < N; i++) if (hasTrack(i)) { ru[Math.floor(i / W)]++; cu[i % W]++; }
    clueRow.forEach((s, k) => { s.className = ru[k] === rowC[k] ? 'done' : ru[k] > rowC[k] ? 'over' : ''; });
    clueCol.forEach((s, k) => { s.className = cu[k] === colC[k] ? 'done' : cu[k] > colC[k] ? 'over' : ''; });
    return v;
  }

  function updateHud() {
    shell.setLives(lives);
    if (hintBtn) hintBtn.classList.toggle('tracks-no-hint', lives <= 1);
  }

  // ---------- Änderungen ----------
  const snapshot = () => ({ conn: conn.slice(), xmark: xmark.slice(), tmark: tmark.slice() });
  const restore = (st) => { conn.set(st.conn); xmark.set(st.xmark); tmark.set(st.tmark); };
  let pending = null; // Zustand vor der laufenden Aktion
  function begin() { if (!pending) pending = { ...snapshot(), viol: violCount(violations()) }; }
  function commit(soundFn) {
    if (!pending) return;
    const before = pending;
    pending = null;
    const changed = before.conn.some((v, i) => v !== conn[i]) || before.xmark.some((v, i) => v !== xmark[i]) ||
      before.tmark.some((v, i) => v !== tmark[i]);
    if (changed) { undoStack.push({ conn: before.conn, xmark: before.xmark, tmark: before.tmark }); clearHint(); }
    const v = render();
    if (!changed) return;
    if (violCount(v) > before.viol) {
      // sichtbarer Regelverstoß: kostet ein Herz
      lives--; mistakes++;
      updateHud();
      sound.bump();
      shell.vibrate([30, 40, 30]);
      if (lives <= 0) lose();
      return;
    }
    soundFn && soundFn();
    checkWin();
  }
  function undo() {
    if (over || !undoStack.length) return;
    restore(undoStack.pop());
    clearHint();
    render();
    sound.tick();
  }

  // Verbindung zwischen Feld a und Nachbar in Richtung d setzen/entfernen
  function canHold(i, d) {
    if (blocked[i]) return false;
    if (isGiven(i)) return !!(given[i] & bit(d));
    return (conn[i] & bit(d)) || bits(conn[i]).length < 2;
  }
  function link(a, d, on) {
    const b = a + DR[d] * W + DC[d];
    if (on) {
      // nur schon gesetzte Gleisstücke verbinden – neue Gleise gibt es nur per Doppeltippen
      if (!hasTrack(a) || !hasTrack(b)) return false;
      if (!canHold(a, d) || !canHold(b, opp(d))) return false;
      if (!isGiven(a)) conn[a] |= bit(d);
      if (!isGiven(b)) conn[b] |= bit(opp(d));
      xmark[a] = xmark[b] = 0;
      if (!isGiven(a)) tmark[a] = 1;
      if (!isGiven(b)) tmark[b] = 1;
    } else {
      if (isGiven(a) && isGiven(b)) return false;
      if (!isGiven(a)) conn[a] &= ~bit(d);
      if (!isGiven(b)) conn[b] &= ~bit(opp(d));
    }
    return true;
  }
  function clearCell(i) {
    for (const d of bits(conn[i])) {
      const r = Math.floor(i / W) + DR[d], c = (i % W) + DC[d];
      if (r < 0 || c < 0 || r >= H || c >= W) continue;
      const j = r * W + c;
      if (!isGiven(j)) conn[j] &= ~bit(opp(d));
    }
    conn[i] = 0; tmark[i] = 0;
  }

  // ---------- Zoomen und Verschieben ----------
  const full = { x: -M, y: -M, w: W * C + M + P, h: H * C + M + P };
  const vb = { ...full };
  let zoom = 1;
  const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // k0 = Pixel pro SVG-Einheit bei „ganzes Bild“
  function frame() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return { k0: 1, left: r.left, top: r.top, rw: full.w, rh: full.h };
    return { k0: Math.min(r.width / full.w, r.height / full.h), left: r.left, top: r.top, rw: r.width, rh: r.height };
  }
  const maxZoom = () => Math.max(1, 52 / (frame().k0 * C)); // höchstens ca. 52 px pro Feld
  function sizeVB(f) { const kk = f.k0 * zoom; vb.w = f.rw / kk; vb.h = f.rh / kk; }
  function clampVB() {
    vb.x = vb.w >= full.w ? full.x + (full.w - vb.w) / 2 : Math.min(Math.max(vb.x, full.x), full.x + full.w - vb.w);
    vb.y = vb.h >= full.h ? full.y + (full.h - vb.h) / 2 : Math.min(Math.max(vb.y, full.y), full.y + full.h - vb.h);
    setVB();
    fitBtn.hidden = zoom < 1.05;
    placeClues();
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
  // Zahlen über bzw. neben dem Feld; ist das Feld weiter oben/links als der
  // sichtbare Ausschnitt, bleiben sie am Rand stehen (mit Hintergrundstreifen).
  function placeClues() {
    const f = frame(), kk = f.k0 * zoom, cell = C * kk;
    const font = Math.min(15, Math.max(9, cell * 0.62));
    const fx = -vb.x * kk, fy = -vb.y * kk; // Feldecke in Pixeln
    const topMin = font * 0.8 + 3, leftMin = font * 1.05 + 3;
    // Abstand so, dass die über den Rand ragenden Gleisenden frei bleiben
    const offT = Math.min(0.45 * cell, 10) + font * 0.6, offL = Math.min(0.45 * cell, 10) + font * 0.9;
    const ty = Math.max(fy - offT, topMin), lx = Math.max(fx - offL, leftMin);
    clueLayer.style.fontSize = `${font}px`;
    const topOn = fy - offT < topMin, leftOn = fx - offL < leftMin;
    // in der Ecke, wo sich beide Streifen treffen, nur die Zahlen des eigenen Streifens zeigen
    clueCol.forEach((s, k) => {
      const x = fx + (k + 0.5) * cell;
      s.style.transform = `translate(${x}px, ${ty}px) translate(-50%, -50%)`;
      s.style.visibility = leftOn && x < leftMin * 2 ? 'hidden' : '';
    });
    clueRow.forEach((s, k) => {
      const y = fy + (k + 0.5) * cell;
      s.style.transform = `translate(${lx}px, ${y}px) translate(-50%, -50%)`;
      s.style.visibility = topOn && y < topMin * 2 ? 'hidden' : '';
    });
    bandTop.style.height = `${topMin * 2}px`;
    bandLeft.style.width = `${leftMin * 2}px`;
    bandTop.classList.toggle('on', topOn);
    bandLeft.classList.toggle('on', leftOn);
  }
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
    const x = (i % W) * C + C / 2, y = Math.floor(i / W) * C + C / 2;
    if (x > vb.x + 2 * C && x < vb.x + vb.w - C && y > vb.y + 2 * C && y < vb.y + vb.h - C) return;
    vb.x = x - vb.w / 2; vb.y = y - vb.h / 2;
    clampVB();
  }

  // ---------- Eingabe ----------
  // Ein Finger: tippen bzw. Gleise ziehen. Zwei Finger: zoomen/verschieben –
  // ein angefangenes Ziehen wird dann zurückgenommen.
  function cellAt(x, y) {
    const [ux, uy] = toUnits(x, y);
    const c = Math.floor(ux / C), r = Math.floor(uy / C);
    return r >= 0 && c >= 0 && r < H && c < W ? [r, c] : null;
  }
  const pointers = new Map();
  let pinch = null, multi = false, drag = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, u: toUnits(mx, my) };
  }
  function abortDrag() {
    if (drag && pending) { restore(pending); pending = null; render(); }
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
    // Beginn auf Gleis/Vorgabe: Gleise ziehen; sonst Kreuze setzen bzw. (auf einem Kreuz) löschen
    const i0 = rc[0] * W + rc[1];
    const kind = hasTrack(i0) || isGiven(i0) ? 'track' : blocked[i0] ? 'none' : xmark[i0] ? 'unx' : 'x';
    drag = { r: rc[0], c: rc[1], moved: false, mode: null, kind, pt: { x: e.clientX, y: e.clientY } };
  });
  function stepTo(rc) {
    // Schritt für Schritt zum Feld rc (auch bei schnellen Bewegungen)
    while (drag.r !== rc[0] || drag.c !== rc[1]) {
      const dr = rc[0] - drag.r, dc = rc[1] - drag.c;
      const d = Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 2 : 0) : (dc > 0 ? 1 : 3);
      const a = drag.r * W + drag.c;
      if (!drag.mode) {
        // Löschen nur, wenn die Verbindung auf BEIDEN Seiten besteht
        // (eine Vorgabe zeigt evtl. schon in diese Richtung – dann zeichnen)
        const b = a + DR[d] * W + DC[d];
        drag.mode = (conn[a] & bit(d)) && (conn[b] & bit(opp(d))) ? 'erase' : 'draw';
        begin();
      }
      drag.moved = true;
      link(a, d, drag.mode === 'draw');
      drag.r += DR[d]; drag.c += DC[d];
    }
  }
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
    const from = drag.pt;
    const steps = Math.max(1, Math.ceil(Math.hypot(e.clientX - from.x, e.clientY - from.y) / 4));
    drag.pt = { x: e.clientX, y: e.clientY };
    let moved = false;
    for (let s = 1; s <= steps; s++) {
      const rc = cellAt(from.x + (e.clientX - from.x) * s / steps, from.y + (e.clientY - from.y) * s / steps);
      if (!rc || (rc[0] === drag.r && rc[1] === drag.c)) continue;
      if (drag.kind === 'track') stepTo(rc);
      else if (drag.kind !== 'none') {
        if (!drag.moved) { begin(); drag.moved = true; paintX(drag.r * W + drag.c); }
        drag.r = rc[0]; drag.c = rc[1];
        paintX(rc[0] * W + rc[1]);
      }
      moved = true;
    }
    if (moved) render();
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) startPinch();
    else pinch = null;
    if (pointers.size > 0) return;
    const d = drag;
    drag = null;
    if (!d) return;
    if (multi || over || e.type === 'pointercancel') { drag = d; abortDrag(); return; }
    if (d.moved) commit(d.kind === 'track' && d.mode === 'draw' ? sound.click : sound.tick);
    else tap(d.r * W + d.c);
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // Kreuze ziehen: Gleisfelder, Vorgaben und Felsen werden übersprungen
  function paintX(i) {
    if (hasTrack(i) || isGiven(i) || blocked[i]) return;
    xmark[i] = drag.kind === 'x' ? 1 : 0;
  }

  // Tippen: Kreuz an/aus (auf Gleisen nichts). Doppeltippen: Gleis setzen bzw.
  // entfernen – der erste Tipp wird dabei zurückgenommen.
  let lastTap = null;
  function tap(i) {
    if (isGiven(i) || blocked[i]) return;
    const now = performance.now();
    if (lastTap && lastTap.i === i && now - lastTap.t < 350) {
      if (lastTap.step && undoStack[undoStack.length - 1] === lastTap.step) restore(undoStack.pop());
      lastTap = null;
      begin();
      if (hasTrack(i)) clearCell(i);
      else { xmark[i] = 0; tmark[i] = 1; }
      commit(sound.click);
      return;
    }
    if (hasTrack(i)) { lastTap = { i, t: now, step: null }; return; }
    begin(); xmark[i] ^= 1; commit(sound.tick);
    lastTap = { i, t: now, step: undoStack[undoStack.length - 1] };
  }

  // ---------- Tipp ----------
  // Jeder Tipp kostet ein Herz; mit dem letzten Herz gibt es keinen Tipp mehr.
  let hinted = -1;
  function clearHint() { hinted = -1; hintRect.setAttribute('visibility', 'hidden'); ghost.setAttribute('d', ''); }
  function hint() {
    if (over) return;
    if (hinted >= 0) { reveal(hinted); return; } // wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); return; }
    // 1. falsches Gleis, 2. Kreuz auf einem Gleisfeld, 3. fehlendes Gleis (nahe an Gelegtem)
    const all = [...Array(N).keys()];
    let i = all.find((k) => (conn[k] && conn[k] !== solution[k]) || (tmark[k] && !solution[k]));
    if (i === undefined) i = all.find((k) => xmark[k] && solution[k]);
    if (i === undefined) {
      const missing = all.filter((k) => solution[k] && conn[k] !== solution[k]);
      const near = missing.filter((k) => bits(solution[k]).some((d) => {
        const r = Math.floor(k / W) + DR[d], c = (k % W) + DC[d];
        return r >= 0 && c >= 0 && r < H && c < W && conn[r * W + c] & bit(opp(d));
      }));
      const pool = near.length ? near : missing;
      i = pool[Math.floor(Math.random() * pool.length)];
    }
    if (i === undefined) return;
    lives--; hints++;
    updateHud();
    hinted = i;
    hintRect.setAttribute('x', (i % W) * C);
    hintRect.setAttribute('y', Math.floor(i / W) * C);
    hintRect.setAttribute('visibility', 'visible');
    ghost.setAttribute('d', solution[i] ? cellPath(W, i, solution[i], C) : '');
    reveal(i);
  }

  // ---------- Zeit & Ende ----------
  const timer = setInterval(() => {
    if (!svg.isConnected) return clearInterval(timer);
    if (!over) shell.setCounter(timeText(performance.now() - t0).replace(' min', ''));
  }, 1000);
  shell.setCounter('0:00');

  function checkWin() {
    for (let i = 0; i < N; i++) if (conn[i] !== solution[i] || (tmark[i] && !solution[i])) return;
    over = true;
    clearInterval(timer);
    clearHint();
    svg.classList.add('solved');
    // Strecke färbt sich in 0,5 s vom Start zum Ziel
    drawDone(routePath(L, C, 0, 0, (i, d) => extendFor(i)(d)));
    grid.querySelectorAll('.track.done path').forEach((p) => p.setAttribute('pathLength', '1'));
    const details = [timeText(performance.now() - t0), mistakesText(mistakes)];
    if (hints) details.push(`${hints} ${hints === 1 ? 'Tipp' : 'Tipps'}`);
    setTimeout(() => onSolved(details, shell), 650);
  }
  function lose() {
    over = true;
    clearInterval(timer);
    shell.lose(RULES);
  }

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) window.__game = { W, H, solution, C, M, toUnits, vb, svg };

  updateHud();
  render();
}
