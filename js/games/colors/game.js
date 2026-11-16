// Farbräumer: Darstellung, Animation und Bedienung.
// Erreichbare Figur antippen → sie geht in den offenen Behälter ihrer Farbe
// (bei zwei offenen gleicher Farbe in den volleren), sonst auf die Ablage.
// Zwei Finger: Brett zoomen und verschieben (Mausrad am Computer); ist hineingezoomt,
// verschiebt auch ein Finger. „Ganzes Bild“ stellt zurück. Behälter und Ablage
// bleiben oben fest stehen.
// 3 Herzen: Eine Sackgasse (Ablage voll, kein Zug mehr) kostet ein Herz und wird
// zurückgenommen; jeder Tipp kostet ein Herz (nicht mit dem letzten).
// Der Stand im laufenden Level wird im Browser gespeichert (Neuladen, Menü);
// „Neu“, „Nochmal“, Lösen und das nächste Level verwerfen ihn.
import { CAP, initialState, reachable, destination, directStack, legalMoves, applyMove, isWon, openContainers, figuresLeft, solveForHint } from './model.js';
import { generateLevel } from './generator.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const S = 10;                 // Zellgröße auf dem Brett (SVG-Einheiten)
const LIVES = 3;
const MAX_UNIT = 58;          // höchstens so viele Pixel je Feld beim Zoomen
const SAVE_KEY = 'knobelkiste-colors-stand';
const RULES = 'Eine Figur lässt sich nur nehmen, wenn ein freier Weg nach oben führt. Passt sie in keinen offenen Behälter, kommt sie auf die Ablage – ist die voll und keine erreichbare Figur passt, geht nichts mehr.';
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const fill = (c) => `var(--f${c})`;

// Figur (Spielstein) als Gruppe, Mittelpunkt (x, y), Größe in Einheiten
function figure(c, [x, y], size) {
  const g = el('g', { class: 'fig', transform: `translate(${x} ${y}) scale(${size})` });
  g.append(
    el('path', { d: 'M-0.3 0.36 Q-0.27 0.02 -0.11 -0.02 L0.11 -0.02 Q0.27 0.02 0.3 0.36 Z', class: 'fig-body', style: `fill:${fill(c)}` }),
    el('circle', { cx: 0, cy: -0.17, r: 0.17, class: 'fig-body', style: `fill:${fill(c)}` }),
    el('circle', { cx: -0.05, cy: -0.22, r: 0.05, class: 'fig-shine' }),
  );
  return g;
}

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
  const local = () => new Promise((done) => setTimeout(() => { const r = solveForHint(L, s); done(r && r.path ? r : null); }, 30));
  if (!worker) return local();
  return new Promise((done) => {
    const id = nextId++;
    waiting.set(id, (r) => (r === undefined ? local().then(done) : done(r)));
    worker.postMessage({ id, L, state: s });
  });
}

export function mountColors(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  let s = initialState(L);
  const history = [];
  let busy = false, over = false;
  let lives = LIVES, hints = 0, mistakes = 0, moves = 0;
  let t0 = performance.now();

  const shell = createShell(root, {
    name: 'Farbräumer', level, lives: LIVES, onHint: () => hint(), onUndo: () => undo(),
    onExit: (how) => { if (how !== 'menu') clearSave(); onExit(how); },
  });
  const hintBtn = root.querySelector('[data-act="hint"]');

  const wrap = document.createElement('div');
  wrap.className = 'colors-wrap';
  shell.board.appendChild(wrap);

  // ---------- oben: Behälter und Ablage (feste Größe, 100 Einheiten breit) ----------
  const NS = L.stacks.length;
  const stackW = 100 / NS;
  const CY = 12, CH = 13;                     // Behälter
  const BY = 34;                             // Ablage (Mitte)
  const TOPH = 41;
  const FIG_TOP = Math.min(9, (stackW - 3) / 3.3);
  const top = el('svg', { class: 'colors-top colors', viewBox: `0 0 100 ${TOPH}` });
  const topScene = el('g'); top.appendChild(topScene);
  const slotPos = (k, slot) => {
    const x0 = k * stackW + 1.5, w = stackW - 3;
    return [x0 + w * (slot + 0.5) / CAP, CY + CH / 2 + 0.6];
  };
  const bufGap = Math.min(12, 70 / L.bufferSize);
  const bufPos = (b) => [100 - 4 - bufGap * (L.bufferSize - 1) + b * bufGap - 1.5, BY];

  // ---------- Brett (zoombar) ----------
  const view = document.createElement('div');
  view.className = 'colors-view';
  const W = L.cols * S, H = L.rows * S;
  const svg = el('svg', { class: 'board colors', preserveAspectRatio: 'none' });
  const fitBtn = document.createElement('button');
  fitBtn.className = 'colors-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  const toast = document.createElement('div');
  toast.className = 'toast';
  view.append(svg, fitBtn, toast);
  const fly = el('svg', { class: 'colors-fly' });
  wrap.append(top, view, fly);

  const cellPos = (i) => [(i % L.cols + 0.5) * S, (Math.floor(i / L.cols) + 0.5) * S];
  svg.appendChild(el('rect', { x: -2, y: -2, width: W + 4, height: H + 4, rx: 4, class: 'tray' }));
  const cellsG = el('g'); svg.appendChild(cellsG);
  for (let i = 0; i < L.cols * L.rows; i++) {
    const [x, y] = cellPos(i);
    cellsG.appendChild(el('circle', { cx: x, cy: y, r: S * 0.36, class: 'cell' }));
  }
  const gatesG = el('g'); svg.appendChild(gatesG);
  const figsG = el('g'); svg.appendChild(figsG);

  // ---------- Zeichnen ----------
  let hintCell = -1;
  function renderTop(st, hide = new Set()) {
    topScene.replaceChildren();
    const open = openContainers(L, st);
    L.stacks.forEach((stack, k) => {
      const x0 = k * stackW + 1.5, w = stackW - 3;
      // dahinter wartende Behälter (Vorschau)
      const rest = stack.slice(st.stackPos[k] + 1);
      rest.slice(0, 3).reverse().forEach((c, j, arr) => {
        const depth = arr.length - j; // 1 = direkt dahinter
        topScene.appendChild(el('rect', { x: x0 + depth * 1.6, y: CY - depth * 2.4, width: w - depth * 3.2, height: 4, rx: 1.4, class: 'cont-back', style: `fill:${fill(c)}` }));
      });
      if (rest.length > 3) {
        const t = el('text', { x: x0 + w / 2, y: CY - 3 * 2.4 - 1.2, class: 'cont-more' });
        t.textContent = `+${rest.length - 3}`;
        topScene.appendChild(t);
      }
      if (open[k] === null) {
        topScene.appendChild(el('rect', { x: x0, y: CY, width: w, height: CH, rx: 3, class: 'cont-empty' }));
        return;
      }
      const g = el('g', { class: 'cont', 'data-stack': k });
      g.append(
        el('rect', { x: x0, y: CY, width: w, height: CH, rx: 3, class: 'cont-box', style: `stroke:${fill(open[k])}` }),
        el('rect', { x: x0, y: CY, width: w, height: CH, rx: 3, class: 'cont-tint', style: `fill:${fill(open[k])}` }),
      );
      for (let sl = 0; sl < CAP; sl++) {
        const p = slotPos(k, sl);
        if (sl < st.fill[k] && !hide.has(`c${k}:${sl}`)) g.appendChild(figure(open[k], p, FIG_TOP));
        else g.appendChild(el('circle', { cx: p[0], cy: p[1], r: FIG_TOP * 0.26, class: 'slot', style: `stroke:${fill(open[k])}` }));
      }
      topScene.appendChild(g);
    });
    const lbl = el('text', { x: 1.5, y: BY + 1.1, class: 'buf-label' });
    lbl.textContent = 'Ablage';
    topScene.appendChild(lbl);
    for (let b = 0; b < L.bufferSize; b++) {
      const p = bufPos(b);
      const full = st.buffer.length >= L.bufferSize;
      topScene.appendChild(el('circle', { cx: p[0], cy: p[1], r: bufGap * 0.4, class: 'buf-slot' + (full ? ' full' : '') }));
      if (b < st.buffer.length && !hide.has(`b${b}`)) topScene.appendChild(figure(st.buffer[b], p, bufGap * 0.72));
    }
  }

  function renderBoard(st) {
    gatesG.replaceChildren();
    L.gates.forEach((g, k) => {
      const [x, y] = cellPos(g.cell);
      gatesG.appendChild(el('rect', { x: x - S / 2 + 0.6, y: y - S / 2 + 0.6, width: S - 1.2, height: S - 1.2, rx: 2, class: 'gate' }));
      const left = g.queue.length - st.gateIdx[k];
      if (left > 0) {
        const bx = x + S * 0.3, by = y - S * 0.3;
        gatesG.appendChild(el('circle', { cx: bx, cy: by, r: 2.4, class: 'gate-badge', style: `fill:${fill(g.queue[st.gateIdx[k]])}` }));
        const t = el('text', { x: bx, y: by + 0.05, class: 'gate-count', 'dominant-baseline': 'central' });
        t.textContent = left;
        gatesG.appendChild(t);
      }
    });
    figsG.replaceChildren();
    const ok = reachable(L, st);
    for (let i = 0; i < st.board.length; i++) {
      if (st.board[i] < 0) continue;
      const f = figure(st.board[i], cellPos(i), S * 0.92);
      f.dataset.cell = i;
      if (!ok[i]) f.classList.add('blocked');
      if (hintCell === i) f.classList.add('hint');
      figsG.appendChild(f);
    }
  }

  function render() {
    renderTop(s);
    renderBoard(s);
    const n = figuresLeft(L, s);
    shell.setCounter(`${n} Figur${n === 1 ? '' : 'en'}`);
  }

  function updateHud() {
    shell.setLives(lives);
    hintBtn.classList.toggle('colors-no-hint', lives <= 1);
  }

  // ---------- Zoomen und Verschieben ----------
  // In Bildschirmpixeln: z = Pixel je SVG-Einheit, (ox, oy) = linke obere Brettecke.
  let vw = 0, vh = 0, zFit = 1, z = 1, ox = 0, oy = 0;
  const zMax = () => Math.max(zFit, MAX_UNIT / S);
  function fit(keepZoom) {
    const r = view.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const k = keepZoom ? z / zFit : 1;
    vw = r.width; vh = r.height;
    zFit = Math.min((vw - 8) / W, (vh - 8) / H);
    z = Math.min(Math.max(zFit * k, zFit), zMax());
    clampView();
  }
  function clampView() {
    const tw = W * z, th = H * z;
    ox = tw <= vw ? (vw - tw) / 2 : Math.min(Math.max(ox, vw - 4 - tw), 4);
    oy = th <= vh ? Math.min(6, (vh - th) / 2) : Math.min(Math.max(oy, vh - 4 - th), 4); // oben anliegend
    svg.setAttribute('viewBox', `${-ox / z} ${-oy / z} ${vw / z} ${vh / z}`);
    fitBtn.hidden = z < zFit * 1.05;
  }
  function zoomTo(nz, mx, my, u, v) {
    z = Math.min(Math.max(nz, zFit), zMax());
    ox = mx - u * z; oy = my - v * z;
    clampView();
  }
  const local = (x, y) => { const r = view.getBoundingClientRect(); return [x - r.left, y - r.top]; };
  fitBtn.addEventListener('click', () => { z = zFit; clampView(); });
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [mx, my] = local(e.clientX, e.clientY);
    zoomTo(z * Math.exp(-e.deltaY * 0.0015), mx, my, (mx - ox) / z, (my - oy) / z);
  }, { passive: false });
  // Ausschnitt so verschieben, dass ein Feld sichtbar ist
  function reveal(i) {
    if (z < zFit * 1.05) return;
    const [cx, cy] = cellPos(i);
    const x = ox + cx * z, y = oy + cy * z, m = S * z;
    if (x > m && x < vw - m && y > m && y < vh - m) return;
    ox -= x - vw / 2; oy -= y - vh / 2;
    clampView();
  }

  // ---------- Eingabe ----------
  // Ein Finger: tippen (hineingezoomt auch verschieben). Zwei Finger: zoomen/verschieben.
  const pointers = new Map();
  let pinch = null, multi = false, pan = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: z, u: (mx - ox) / z, v: (my - oy) / z };
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) { pointers.clear(); multi = false; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) { multi = true; pan = null; startPinch(); return; }
    pan = { x: e.clientX, y: e.clientY, ox, oy, moved: false };
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const [mx, my] = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomTo(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, mx, my, pinch.u, pinch.v);
      return;
    }
    if (!pan || multi) return;
    if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < 10) return;
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
    const p = pan;
    pan = null;
    if (!p || p.moved || multi || e.type === 'pointercancel') return;
    tap(e.clientX, e.clientY);
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  async function tap(cx, cy) {
    if (busy || over) return;
    const [mx, my] = local(cx, cy);
    const x = (mx - ox) / z / S, y = (my - oy) / z / S;
    const c = Math.floor(x), r = Math.floor(y);
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return;
    const i = r * L.cols + c;
    if (s.board[i] < 0) return;
    if (!reachable(L, s)[i]) { nudge(i, 'Diese Figur ist zugestellt.'); return; }
    if (!destination(L, s, s.board[i])) { nudge(i, 'Die Ablage ist voll.'); return; }
    await doMove(i);
  }

  function nudge(i, text) {
    sound.bump();
    shell.vibrate(25);
    const f = figsG.querySelector(`[data-cell="${i}"]`);
    if (f) { f.classList.remove('wiggle'); void f.getBBox(); f.classList.add('wiggle'); }
    showToast(text);
  }

  // ---------- Animation (zusammen höchstens etwa 0,5 s) ----------
  function animate(ms, tick) {
    return new Promise((done) => {
      const start = performance.now();
      const step = (now) => {
        if (!svg.isConnected) return done();
        const t = Math.min(1, (now - start) / ms);
        tick(t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }
  // Bildschirmlagen (Pixel im Flug-Fenster) und Größen
  function flyFrame() {
    const r = wrap.getBoundingClientRect();
    fly.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    return r;
  }
  const topPx = (p, wr) => { const r = top.getBoundingClientRect(), k = r.width / 100; return [r.left - wr.left + p[0] * k, r.top - wr.top + p[1] * k, k]; };
  const boardPx = (i, wr) => { const r = view.getBoundingClientRect(), [x, y] = cellPos(i); return [r.left - wr.left + ox + x * z, r.top - wr.top + oy + y * z]; };
  async function flight(c, from, to, s0, s1, ms) {
    const g = figure(c, from, s0);
    fly.appendChild(g);
    // Bogen: erst leicht anheben, dann im Schwung ans Ziel
    const lift = Math.min(40, Math.hypot(to[0] - from[0], to[1] - from[1]) * 0.18);
    await animate(ms, (t) => {
      const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t - Math.sin(Math.PI * t) * lift;
      g.setAttribute('transform', `translate(${x} ${y}) scale(${s0 + (s1 - s0) * t})`);
    });
    g.remove();
  }

  async function play(events, prev, next) {
    const wr = flyFrame();
    const first = events[0];
    // 1. Figur vom Brett in Behälter oder Ablage
    const mid = { ...prev, board: Int8Array.from(prev.board) };
    mid.board[first.from] = -1;
    renderBoard(mid);
    const hideKey = first.type === 'toContainer' ? `c${first.stack}:${first.slot}` : `b${first.slot}`;
    const midTop = { ...prev, fill: prev.fill.slice(), buffer: prev.buffer.slice() };
    if (first.type === 'toContainer') midTop.fill[first.stack]++; else midTop.buffer.push(first.color);
    renderTop(midTop, new Set([hideKey]));
    const [ax, ay] = boardPx(first.from, wr);
    const dest = first.type === 'toContainer' ? slotPos(first.stack, first.slot) : bufPos(first.slot);
    const [bx, by, k] = topPx(dest, wr);
    const sizeTo = (first.type === 'toContainer' ? FIG_TOP : bufGap * 0.72) * k;
    await flight(first.color, [ax, ay], [bx, by], S * 0.92 * z, sizeTo, 210);
    if (first.type === 'toContainer') sound.click(); else sound.tick();
    renderTop(midTop);
    // 2. Volle Behälter heben ab, Figuren aus der Ablage rücken nach
    const done = events.filter((e) => e.type === 'containerDone');
    if (done.length) {
      sound.whoosh();
      const groups = done.map((e) => topScene.querySelector(`.cont[data-stack="${e.stack}"]`)).filter(Boolean);
      await animate(140, (t) => groups.forEach((g) => { g.style.transform = `translateY(${-6 * t}px)`; g.style.opacity = String(1 - t); }));
      const moved = events.filter((e) => e.type === 'bufferToContainer');
      if (moved.length) {
        renderTop(next, new Set(moved.map((e) => `c${e.stack}:${e.toSlot}`)));
        await Promise.all(moved.map((e) => {
          const [fx, fy] = topPx(bufPos(e.slot), wr), [tx, ty, kk] = topPx(slotPos(e.stack, e.toSlot), wr);
          return flight(e.color, [fx, fy], [tx, ty], bufGap * 0.72 * kk, FIG_TOP * kk, 140);
        }));
        sound.click();
      }
    }
    // 3. Tor schiebt nach (Figur wächst aus dem Torfeld)
    s = next;
    render();
    const gin = events.filter((e) => e.type === 'gateIn');
    if (gin.length) {
      const figs = gin.map((e) => figsG.querySelector(`[data-cell="${e.cell}"]`)).filter(Boolean);
      await animate(110, (t) => figs.forEach((g) => { g.style.opacity = String(t); }));
    }
  }

  async function doMove(i) {
    busy = true;
    hintCell = -1;
    const prev = s;
    const { state, events } = applyMove(L, s, i);
    history.push(prev);
    moves++;
    await play(events, prev, state);
    if (!svg.isConnected) return;
    busy = false;
    if (isWon(L, s)) return win();
    if (legalMoves(L, s).length === 0) return deadEnd();
    saveState();
  }

  // Sackgasse: kein Zug mehr möglich → ein Herz, Zug wird zurückgenommen
  function deadEnd() {
    lives--; mistakes++;
    updateHud();
    sound.bump();
    shell.vibrate([30, 40, 30]);
    if (lives <= 0) return lose();
    busy = true;
    showToast('Sackgasse – Zug zurückgenommen', 1800);
    setTimeout(() => {
      if (!svg.isConnected) return;
      busy = false;
      s = history.pop();
      moves = Math.max(0, moves - 1);
      render();
      saveState();
    }, 600);
  }

  function undo() {
    if (busy || over || !history.length) return;
    s = history.pop();
    moves = Math.max(0, moves - 1);
    hintCell = -1;
    render();
    saveState();
    sound.tick();
  }

  // ---------- Tipp: kostet ein Herz, mit dem letzten Herz gibt es keinen ----------
  async function hint() {
    if (busy || over) return;
    if (hintCell >= 0) { reveal(hintCell); return; } // wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); showToast('Tipp nur mit mehr als einem Herz'); return; }
    busy = true;
    showToast('Suche …', 8000);
    const snapshot = s;
    const res = await findHint(L, s);
    busy = false;
    if (!svg.isConnected || s !== snapshot || over) return;
    if (!res) { showToast('Kein Tipp gefunden – Rückgängig hilft vielleicht.', 3000); return; }
    // die eigentliche Entscheidung zeigen: welche Figur auf die Ablage soll
    const legal = legalMoves(L, s);
    const key = res.path[res.branch];
    hintCell = key !== undefined && legal.includes(key) && directStack(L, s, s.board[key]) < 0 ? key : res.path[0];
    showToast('', 0);
    lives--; hints++;
    updateHud();
    saveState();
    render();
    reveal(hintCell);
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
    setTimeout(() => shell.win(details), 300);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    clearSave();
    hintCell = -1;
    render();
    shell.lose(RULES);
  }

  // ---------- Spielstand im Level ----------
  const sig = `${L.cols}x${L.rows}:${figuresLeft(L, s)}:${L.stacks.flat().length}:${L.v}`;
  const pack = (st) => ({ ...st, board: Array.from(st.board) });
  const unpack = (st) => ({ ...st, board: Int8Array.from(st.board) });
  function saveState() {
    if (over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level, sig, s: pack(s), undo: history.slice(-40).map(pack), lives, hints, mistakes, moves, time: performance.now() - t0,
      }));
    } catch {}
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.level === level && sv.sig === sig && sv.lives > 0 && sv.s.board.length === s.board.length) {
      s = unpack(sv.s);
      history.push(...sv.undo.map(unpack));
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
      L, get state() { return s; }, get lives() { return lives; }, get busy() { return busy; }, doMove,
      at(i) { const r = view.getBoundingClientRect(); const [x, y] = cellPos(i); return [r.left + ox + x * z, r.top + oy + y * z]; },
    };
  }

  fit(false);
  new ResizeObserver(() => { if (svg.isConnected) fit(true); }).observe(view);
  updateHud();
  render();
}
