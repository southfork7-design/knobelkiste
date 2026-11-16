// Schraubwerk: Darstellung, Animation und Bedienung.
// Schraube antippen (wird angehoben), dann ein freies Loch antippen.
// Zwei Finger: zoomen und verschieben (Mausrad am Computer); ist hineingezoomt,
// verschiebt auch ein Finger. „Ganzes Bild“ stellt zurück.
// Teile stoßen an Schraubenstifte (siehe model.js): pendelnde bleiben angelehnt,
// fallende rutschen ab oder bleiben liegen.
// 3 Herzen: Ein Zug in eine Sackgasse (danach geht kein Zug mehr) kostet ein Herz
// und wird zurückgenommen; jeder Tipp kostet ein Herz (nicht mit dem letzten).
// Der Stand im laufenden Level wird im Browser gespeichert (Neuladen, Menü);
// „Neu“, „Nochmal“, Lösen und das nächste Level verwerfen ihn.
import { initialState, legalMoves, applyMove, screwBlocked, targetFree, isWon } from './model.js';
import { getLevel, getHint } from './gen-client.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const S = 10;                 // Rastereinheit in SVG-Einheiten
const PAD = 0.8;              // Rand um das Lochraster (Rastereinheiten)
const LIVES = 3;
const MAX_UNIT = 64;          // höchstens so viele Pixel je Lochabstand beim Zoomen
const SAVE_KEY = 'knobelkiste-screws-stand';
const RULES = 'Eine Schraube lässt sich nur bewegen, wenn kein anderes Teil über ihr liegt. Ein Teil an nur einer Schraube pendelt, ohne Schraube fällt es – dabei stößt es an Schrauben, die bis in seine Lage ragen.';
const PALETTE = ['--a1', '--a2', '--a3', '--a4', '--a5', '--a6'];
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export async function mountScrews(root, { level, onWin, onExit }) {
  const token = (root.dataset.mount = String(Math.random()));
  const loading = createShell(root, { name: 'Schraubwerk', level, lives: LIVES, onExit });
  loading.setLives(LIVES);
  loading.board.innerHTML = '<p class="loading">Rätsel wird gebaut …</p>';
  const L = await getLevel(level);
  if (root.dataset.mount !== token) return;
  getLevel(level + 1); // nächstes Level schon vorbereiten
  play(root, L, { level, onWin, onExit });
}

function play(root, L, { level, onWin, onExit }) {
  let s = initialState(L);
  const history = [];
  let selected = -1, busy = false, over = false;
  let lives = LIVES, hints = 0, mistakes = 0, moves = 0;
  let t0 = performance.now();

  const shell = createShell(root, {
    name: 'Schraubwerk', level, lives: LIVES, onHint: () => hint(), onUndo: () => undo(),
    onExit: (how) => { if (how !== 'menu') clearSave(); onExit(how); },
  });
  const hintBtn = root.querySelector('[data-act="hint"]');
  const view = document.createElement('div');
  view.className = 'screws-view';
  shell.board.appendChild(view);
  const W = (L.cols - 1 + 2 * PAD) * S, H = (L.rows - 1 + 2 * PAD) * S;
  const svg = el('svg', { class: 'board screws', preserveAspectRatio: 'none' });
  const fitBtn = document.createElement('button');
  fitBtn.className = 'screws-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  const toast = document.createElement('div');
  toast.className = 'toast';
  view.append(svg, fitBtn, toast);

  const px = ([x, y]) => [(x + PAD) * S, (y + PAD) * S];

  // Brett mit Löchern
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, rx: 4, class: 'panel' }));
  const holeEls = L.holes.map((h) => {
    const [x, y] = px(h);
    const g = el('g', { class: 'hole' });
    g.append(el('circle', { cx: x, cy: y, r: 2.4, class: 'hole-ring' }), el('circle', { cx: x, cy: y, r: 1.7, class: 'hole-in' }));
    svg.appendChild(g);
    return g;
  });

  // Ebenen: je Teil eine Gruppe, darüber die Schrauben, deren oberstes Teil es ist
  const base = el('g'); svg.appendChild(base); // Schrauben ohne Teil
  const layers = L.plates.map((pl, i) => {
    const g = el('g', { class: 'plate' });
    g.style.setProperty('--c', `var(${PALETTE[i % PALETTE.length]})`);
    const d = 'M' + pl.points.map(([x, y]) => `${x * S} ${y * S}`).join(' L');
    g.append(el('path', { d, class: 'plate-edge' }), el('path', { d, class: 'plate-body' }));
    for (const [x, y] of pl.holes) g.appendChild(el('circle', { cx: x * S, cy: y * S, r: 1.7, class: 'plate-hole' }));
    const wrap = el('g');
    wrap.append(g, el('g', { class: 'screw-slot' }));
    svg.appendChild(wrap);
    return { wrap, g, screwsG: wrap.lastChild };
  });
  const top = el('g'); svg.appendChild(top); // angehobene Schraube
  const screwEls = s.screws.map(() => {
    const g = el('g', { class: 'screw' });
    const ang = Math.random() * 180;
    g.append(el('circle', { r: 2.7, class: 'screw-head' }),
      el('path', { d: 'M-1.6 0 H1.6 M0 -1.6 V1.6', class: 'screw-slot-mark', transform: `rotate(${ang})` }));
    return g;
  });

  const poseTransform = (pose) => {
    const [x, y] = px([pose.tx, pose.ty]);
    return `translate(${x} ${y}) rotate(${(pose.θ * 180) / Math.PI})`;
  };
  const layerIndex = new Map(L.plates.map((p, i) => [p.layer, i]));

  function topLayerOf(i) {
    const alive = s.pins[i].filter((id) => s.poses[id]);
    return alive.length ? Math.max(...alive.map((id) => L.plates[id].layer)) : -1;
  }

  function render() {
    L.plates.forEach((pl, i) => {
      const pose = s.poses[pl.id];
      const g = layers[i].g;
      g.style.display = pose ? '' : 'none';
      g.style.opacity = '';
      if (pose) g.setAttribute('transform', poseTransform(pose));
    });
    s.screws.forEach((hi, i) => {
      const [x, y] = px(L.holes[hi]);
      const e = screwEls[i];
      e.setAttribute('transform', `translate(${x} ${y})`);
      e.classList.toggle('selected', i === selected);
      const lay = topLayerOf(i);
      const parent = i === selected ? top : lay < 0 ? base : layers[layerIndex.get(lay)].screwsG;
      if (e.parentNode !== parent) parent.appendChild(e);
    });
    // mögliche Ziele zeigen
    holeEls.forEach((g, hi) => g.classList.toggle('target', selected >= 0 && targetFree(L, s, hi)));
    const left = s.poses.filter(Boolean).length;
    shell.setCounter(`${left} Teil${left === 1 ? '' : 'e'} übrig`);
  }

  function updateHud() {
    shell.setLives(lives);
    hintBtn.classList.toggle('screws-no-hint', lives <= 1);
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
    oy = th <= vh ? (vh - th) / 2 : Math.min(Math.max(oy, vh - 4 - th), 4);
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
  // Ausschnitt so verschieben, dass ein Brettpunkt sichtbar ist
  function reveal(q) {
    if (z < zFit * 1.05) return;
    const [x, y] = px(q).map((v, k) => (k ? oy : ox) + v * z);
    const m = 3 * S * z * 0.5;
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
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
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

  function boardPoint(cx, cy) {
    const [mx, my] = local(cx, cy);
    return [(mx - ox) / z / S - PAD, (my - oy) / z / S - PAD];
  }
  async function tap(cx, cy) {
    if (busy || over) return;
    const [x, y] = boardPoint(cx, cy);
    const near = (h) => Math.hypot(h[0] - x, h[1] - y);
    // Schraube getroffen?
    let si = -1, sd = 0.45;
    s.screws.forEach((hi, i) => { const d = near(L.holes[hi]); if (d < sd) { sd = d; si = i; } });
    if (si >= 0) {
      if (si === selected) { selected = -1; render(); return; }
      if (screwBlocked(L, s, si)) { wiggle(si); return; }
      selected = si; render(); sound.tick();
      return;
    }
    if (selected < 0) return;
    let hi = -1, hd = 0.48;
    L.holes.forEach((h, k) => { const d = near(h); if (d < hd) { hd = d; hi = k; } });
    if (hi < 0) { selected = -1; render(); return; }
    if (!targetFree(L, s, hi)) { sound.bump(); return; }
    await doMove([selected, hi]);
  }

  // ---------- Animation (zusammen höchstens etwa 0,5 s) ----------
  function animate(ms, tick) {
    return new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        if (!svg.isConnected) return done();
        const t = Math.min(1, (now - t0) / ms);
        tick(t);
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }

  async function animateMove(prev, next, i, rec) {
    const jobs = [];
    // Schraube fliegt ins neue Loch
    const [x0, y0] = px(L.holes[prev.screws[i]]), [x1, y1] = px(L.holes[next.screws[i]]);
    const e = screwEls[i];
    top.appendChild(e);
    jobs.push(animate(220, (t) => {
      const k = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const lift = Math.sin(Math.PI * t) * 3;
      e.setAttribute('transform', `translate(${x0 + (x1 - x0) * k} ${y0 + (y1 - y0) * k - lift}) scale(${1 + 0.15 * Math.sin(Math.PI * t)})`);
    }).then(() => sound.click()));
    // gleichzeitig: Teile pendeln, rutschen an Stiften ab oder fallen
    // (Zwischenlagen aus der Simulation, auf höchstens 0,5 s gerafft)
    let falls = 0;
    const lerpPose = (p, q, f) => {
      const d = Math.atan2(Math.sin(q.θ - p.θ), Math.cos(q.θ - p.θ));
      return { θ: p.θ + d * f, tx: p.tx + (q.tx - p.tx) * f, ty: p.ty + (q.ty - p.ty) * f };
    };
    L.plates.forEach((pl, pi) => {
      const a = prev.poses[pl.id], b = next.poses[pl.id];
      if (!a || a === b) return;
      const frames = [a, ...(rec.get(pl.id) || []), ...(b ? [b] : [])];
      if (frames.length < 2) return;
      const g = layers[pi].g;
      const ms = Math.min(500, 120 + frames.length * 12);
      if (!b) falls++;
      jobs.push(animate(ms, (t) => {
        const x = t * (frames.length - 1), k = Math.min(frames.length - 2, Math.floor(x));
        g.setAttribute('transform', poseTransform(lerpPose(frames[k], frames[k + 1], x - k)));
        if (!b) g.style.opacity = String(Math.min(1, 3 * (1 - t)));
      }).then(() => { if (!b) { g.style.display = 'none'; g.style.opacity = ''; } }));
    });
    if (falls) sound.whoosh();
    await Promise.all(jobs);
  }

  async function doMove(m) {
    busy = true;
    const prev = s;
    const rec = new Map();
    const next = applyMove(L, s, m, rec);
    history.push(prev);
    selected = -1;
    clearHint();
    holeEls.forEach((g) => g.classList.remove('target'));
    s = next;
    moves++;
    await animateMove(prev, next, m[0], rec);
    if (!svg.isConnected) return;
    render();
    busy = false;
    if (isWon(s)) return win();
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
    }, 450);
  }

  function wiggle(i) {
    sound.bump();
    shell.vibrate(25);
    const e = screwEls[i];
    e.classList.remove('wiggle'); void e.getBBox(); e.classList.add('wiggle');
    showToast('Diese Schraube ist verdeckt.');
  }

  function undo() {
    if (busy || over || !history.length) return;
    s = history.pop();
    moves = Math.max(0, moves - 1);
    selected = -1;
    clearHint();
    render();
    saveState();
    sound.tick();
  }

  // ---------- Tipp: kostet ein Herz, mit dem letzten Herz gibt es keinen ----------
  let hintEls = [], hintQ = null;
  function clearHint() { hintEls.forEach((x) => x.classList.remove('hint')); hintEls = []; hintQ = null; }
  async function hint() {
    if (busy || over) return;
    if (hintEls.length) { reveal(hintQ); return; } // wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); showToast('Tipp nur mit mehr als einem Herz'); return; }
    busy = true;
    showToast('Suche …', 6000);
    const snapshot = s;
    const res = await getHint(L, s);
    busy = false;
    if (!svg.isConnected || s !== snapshot || over) return;
    if (!res.move) { showToast('Kein Tipp gefunden – Rückgängig hilft vielleicht.', 3000); return; }
    showToast('', 0);
    lives--; hints++;
    updateHud();
    saveState();
    const [i, hi] = res.move;
    selected = -1;
    render();
    hintEls = [screwEls[i], holeEls[hi]];
    hintEls.forEach((x) => x.classList.add('hint'));
    hintQ = L.holes[s.screws[i]];
    reveal(hintQ);
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
    clearHint();
    shell.lose(RULES);
  }

  // ---------- Spielstand im Level ----------
  const sig = `${L.cols}x${L.rows}:${L.plates.length}:${L.holes.length}:${L.screws.length}`;
  function saveState() {
    if (over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level, sig, s, undo: history.slice(-40), lives, hints, mistakes, moves, time: performance.now() - t0,
      }));
    } catch {}
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.level === level && sv.sig === sig && sv.lives > 0 && sv.s.screws.length === s.screws.length) {
      s = sv.s;
      history.push(...sv.undo);
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
      L, get state() { return s; }, get lives() { return lives; }, doMove,
      at(q) { const r = view.getBoundingClientRect(); const [x, y] = px(q); return [r.left + ox + x * z, r.top + oy + y * z]; },
    };
  }

  fit(false);
  new ResizeObserver(() => { if (svg.isConnected) fit(true); }).observe(view);
  updateHud();
  render();
}
