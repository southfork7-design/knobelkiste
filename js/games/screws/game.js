// Schraubwerk: Darstellung, Animation und Bedienung.
// Schraube antippen (wird angehoben), dann ein freies Loch antippen.
import { initialState, legalMoves, applyMove, screwBlocked, targetFree, isWon, toWorld, ALIGN } from './model.js';
import { getLevel, getHint } from './gen-client.js';
import { createShell } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const S = 10;                 // Rastereinheit in SVG-Einheiten
const PAD = 1.0;              // Rand um das Lochraster (Rastereinheiten)
const PALETTE = ['--a1', '--a2', '--a3', '--a4', '--a5', '--a6'];
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

export async function mountScrews(root, { level, onWin, onExit }) {
  const token = (root.dataset.mount = String(Math.random()));
  const loading = createShell(root, { name: 'Schraubwerk', level, onExit });
  loading.board.innerHTML = '<p class="loading">Rätsel wird gebaut …</p>';
  const L = await getLevel(level);
  if (root.dataset.mount !== token) return;
  getLevel(level + 1); // nächstes Level schon vorbereiten
  play(root, L, { level, onWin, onExit });
}

function play(root, L, { level, onWin, onExit }) {
  let s = initialState(L);
  const history = [];
  let selected = -1, busy = false, over = false, hints = 0, moves = 0;

  const shell = createShell(root, {
    name: 'Schraubwerk', level, onExit, onHint: () => hint(), onUndo: () => undo(),
  });
  const W = (L.cols - 1 + 2 * PAD) * S, H = (L.rows - 1 + 2 * PAD) * S;
  const svg = el('svg', { class: 'board screws', viewBox: `0 0 ${W} ${H + 2 * S}` });
  shell.board.appendChild(svg);
  const toast = document.createElement('div');
  toast.className = 'toast';
  shell.board.appendChild(toast);

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

  function topLayerOf(i) {
    const alive = s.pins[i].filter((id) => s.poses[id]);
    return alive.length ? Math.max(...alive.map((id) => L.plates[id].layer)) : -1;
  }

  function render() {
    L.plates.forEach((pl, i) => {
      const pose = s.poses[pl.id];
      layers[i].g.style.display = pose ? '' : 'none';
      if (pose) layers[i].g.setAttribute('transform', poseTransform(pose));
    });
    s.screws.forEach((hi, i) => {
      const [x, y] = px(L.holes[hi]);
      const e = screwEls[i];
      e.setAttribute('transform', `translate(${x} ${y})`);
      e.classList.toggle('selected', i === selected);
      const lay = topLayerOf(i);
      const parent = i === selected ? top : lay < 0 ? base : layers[L.plates.findIndex((p) => p.layer === lay)].screwsG;
      if (e.parentNode !== parent) parent.appendChild(e);
    });
    // mögliche Ziele zeigen
    holeEls.forEach((g, hi) => g.classList.toggle('target', selected >= 0 && targetFree(L, s, hi)));
    const left = s.poses.filter(Boolean).length;
    shell.setCounter(`${left} Teil${left === 1 ? '' : 'e'} übrig`);
  }

  // ---------- Animation ----------
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

  async function animateMove(prev, next, i) {
    // 1. Schraube fliegt ins neue Loch
    const [x0, y0] = px(L.holes[prev.screws[i]]), [x1, y1] = px(L.holes[next.screws[i]]);
    const e = screwEls[i];
    top.appendChild(e);
    await animate(260, (t) => {
      const k = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
      const lift = Math.sin(Math.PI * t) * 3;
      e.setAttribute('transform', `translate(${x0 + (x1 - x0) * k} ${y0 + (y1 - y0) * k - lift}) scale(${1 + 0.15 * Math.sin(Math.PI * t)})`);
    });
    sound.click();
    // 2. Teile pendeln oder fallen
    const jobs = [];
    let falls = 0;
    L.plates.forEach((pl, pi) => {
      const a = prev.poses[pl.id], b = next.poses[pl.id];
      if (!a || a === b) return;
      const g = layers[pi].g;
      if (!b) {
        falls++;
        jobs.push(animate(900, (t) => {
          const drop = 0.5 * 9.81 * (t * 1.1) ** 2 * 4;
          g.setAttribute('transform', `translate(0 ${drop * S}) ` + poseTransform({ ...a, θ: a.θ + t * 0.6 }));
          g.style.opacity = String(1 - t * t);
        }).then(() => { g.style.display = 'none'; g.style.opacity = ''; }));
      } else if (Math.abs(a.θ - b.θ) > 1e-3 || Math.abs(a.tx - b.tx) > 1e-3 || Math.abs(a.ty - b.ty) > 1e-3) {
        // Pendeln um die verbliebene Schraube (Drehpunkt bleibt fest)
        const hole = next.screws[next.pins.findIndex((ps) => ps.includes(pl.id))];
        const B = L.holes[hole];
        const h = pl.holes.find((hh) => { const w = toWorld(b, hh); return Math.hypot(w[0] - B[0], w[1] - B[1]) < ALIGN; });
        let d = a.θ - b.θ;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        jobs.push(animate(1300, (t) => {
          const θ = b.θ + d * Math.exp(-3.2 * t) * Math.cos(2 * Math.PI * 1.4 * t);
          const c = Math.cos(θ), sn = Math.sin(θ);
          const pose = { θ, tx: B[0] - (c * h[0] - sn * h[1]), ty: B[1] - (sn * h[0] + c * h[1]) };
          g.setAttribute('transform', poseTransform(pose));
        }));
      }
    });
    if (falls) sound.whoosh();
    await Promise.all(jobs);
  }

  // ---------- Eingabe ----------
  function svgPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x / S - PAD, p.y / S - PAD];
  }
  svg.addEventListener('pointerup', async (e) => {
    if (busy || over) return;
    const [x, y] = svgPoint(e);
    const near = (h) => Math.hypot(h[0] - x, h[1] - y);
    // Schraube getroffen?
    let si = -1, sd = 0.45;
    s.screws.forEach((hi, i) => { const d = near(L.holes[hi]); if (d < sd) { sd = d; si = i; } });
    if (si >= 0) {
      if (si === selected) { selected = -1; render(); return; }
      if (screwBlocked(L, s, si)) { wiggle(si); return; }
      selected = si; clearHint(); render(); sound.tick();
      return;
    }
    if (selected < 0) return;
    let hi = -1, hd = 0.5;
    L.holes.forEach((h, k) => { const d = near(h); if (d < hd) { hd = d; hi = k; } });
    if (hi < 0) { selected = -1; render(); return; }
    if (!targetFree(L, s, hi)) { sound.bump(); return; }
    await doMove([selected, hi]);
  });

  async function doMove(m) {
    busy = true;
    const prev = s;
    const next = applyMove(L, s, m);
    history.push(prev);
    selected = -1;
    clearHint();
    holeEls.forEach((g) => g.classList.remove('target'));
    s = next;
    moves++;
    await animateMove(prev, next, m[0]);
    if (!svg.isConnected) return;
    render();
    busy = false;
    if (isWon(s)) {
      over = true;
      shell.win([`${moves} Züge`, ...(hints ? [`${hints} Tipp${hints > 1 ? 's' : ''}`] : [])]);
      onWin && onWin(level);
    } else if (legalMoves(L, s).length === 0) {
      shell.showCard(`<h2>Keine Züge mehr</h2>
        <p>Alle Schrauben sind blockiert oder es gibt kein freies Loch.</p>
        <button class="primary" data-act="undo">Rückgängig</button>
        <button class="secondary" data-act="restart">Neu starten</button>`);
    }
  }

  function wiggle(i) {
    sound.bump();
    shell.vibrate(25);
    const e = screwEls[i];
    e.classList.remove('wiggle'); void e.getBBox(); e.classList.add('wiggle');
    showToast('Diese Schraube ist verdeckt.');
  }

  function undo() {
    if (busy || !history.length) return;
    shell.hideCard();
    over = false;
    s = history.pop();
    moves = Math.max(0, moves - 1);
    selected = -1;
    clearHint();
    layers.forEach((l) => { l.g.style.opacity = ''; });
    render();
    sound.tick();
  }

  // ---------- Tipp ----------
  let hintEls = [];
  function clearHint() { hintEls.forEach((x) => x.classList.remove('hint')); hintEls = []; }
  async function hint() {
    if (busy || over) return;
    clearHint();
    busy = true;
    showToast('Suche …', 4000);
    const snapshot = s;
    const res = await getHint(L, s);
    busy = false;
    if (!svg.isConnected || s !== snapshot) return;
    if (!res.move) {
      showToast(res.unsolvable ? 'Von hier aus nicht mehr lösbar – Rückgängig hilft.' : 'Kein Tipp gefunden – vielleicht hilft Rückgängig.', 3000);
      return;
    }
    hints++;
    showToast('', 0);
    const [i, hi] = res.move;
    hintEls = [screwEls[i], holeEls[hi]];
    hintEls.forEach((x) => x.classList.add('hint'));
  }

  let toastTimer = 0;
  function showToast(text, ms = 1600) {
    clearTimeout(toastTimer);
    toast.textContent = text;
    toast.classList.toggle('show', !!text);
    if (text && ms) toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) window.__game = { L, get state() { return s; }, doMove };

  render();
}
