// Pfeil-Spiel: Oberfläche, Eingabe und Animation.
import { generateLevel, blockDistance, DIRS } from './generator.js';
import { createShell, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;            // Zellgröße in SVG-Einheiten
const SVGNS = 'http://www.w3.org/2000/svg';
const LIVES = 3;
const PALETTE = ['--a1', '--a2', '--a3', '--a4', '--a5', '--a6'];

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const center = ([x, y]) => [x * C + C / 2, y * C + C / 2];

export function mountArrows(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  const { w, h, arrows } = L;
  const occ = new Int16Array(w * h).fill(-1);
  for (const a of arrows) for (const [x, y] of a.cells) occ[y * w + x] = a.id;
  let remaining = arrows.length;
  let lives = LIVES;
  const busy = new Set();
  let over = false;

  const label = L.shape ? `Level ${level} · ${L.shape}` : null;
  const shell = createShell(root, { name: 'Pfeilwerk', level, label, lives: LIVES, onExit, onHint: () => hint() });
  const full = { x: -C * 0.5, y: -C * 0.5, w: w * C + C, h: h * C + C };
  const svg = el('svg', { class: 'board arrows-board', preserveAspectRatio: 'xMidYMid meet' });
  shell.board.appendChild(svg);
  const fitBtn = document.createElement('button');
  fitBtn.className = 'arrows-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  shell.board.appendChild(fitBtn);

  // Rasterpunkte (bei Figuren nur innerhalb der Figur)
  const dots = el('g', { class: 'dots' });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!L.mask || L.mask[y * w + x]) dots.appendChild(el('circle', { cx: x * C + C / 2, cy: y * C + C / 2, r: 0.7 }));
  svg.appendChild(dots);

  // Farben so verteilen, dass sich berührende Pfeile möglichst verschieden aussehen
  const colorOf = new Array(arrows.length).fill(-1);
  for (const a of arrows) {
    const taken = new Set();
    for (const [x, y] of a.cells)
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const o = occ[ny * w + nx];
        if (o !== -1 && o !== a.id && colorOf[o] !== -1) taken.add(colorOf[o]);
      }
    const start = a.id % PALETTE.length;
    let c = start;
    for (let k = 0; k < PALETTE.length; k++) {
      const cand = (start + k) % PALETTE.length;
      if (!taken.has(cand)) { c = cand; break; }
    }
    colorOf[a.id] = c;
  }

  // Pfeile zeichnen
  const views = arrows.map((a) => {
    const g = el('g', { class: 'arrow' });
    g.style.setProperty('--c', `var(${PALETTE[colorOf[a.id]]})`);
    const pts = a.cells.map(center);
    // Pfad bis weit über den Rand hinaus, damit der Pfeil hinausgleiten kann
    const [dx, dy] = DIRS[a.dir];
    const [hx, hy] = pts[pts.length - 1];
    const far = (Math.max(w, h) + a.cells.length + 2) * C;
    const d = 'M' + pts.map((p) => p.join(' ')).join(' L') + ` L${hx + dx * far} ${hy + dy * far}`;
    const hit = el('path', { d: 'M' + pts.map((p) => p.join(' ')).join(' L'), class: 'hit' });
    const body = el('path', { d, class: 'body' });
    const head = el('path', { d: 'M-2.6 -2.6 L1.6 0 L-2.6 2.6 Z', class: 'head' });
    g.append(hit, body, head);
    svg.appendChild(g);
    const bodyLen = (a.cells.length - 1) * C;
    const v = { a, g, body, head, bodyLen, pathLen: 0, removed: false };
    hit.addEventListener('pointerup', (e) => { e.preventDefault(); if (!gesture.moved) tap(v); });
    return v;
  });
  views.forEach((v) => { v.pathLen = v.body.getTotalLength(); place(v, 0); });

  // ---- Zoomen und Verschieben ----
  // Zwei Finger: zoomen; ein Finger ziehen: verschieben (wenn hineingezoomt);
  // Mausrad am Computer. Ein Tippen zählt nur, wenn der Finger kaum bewegt wurde.
  const vb = { ...full };
  let zoom = 1;
  const pointers = new Map();
  const gesture = { moved: false, start: null, pinch: null };
  const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  // Der Ausschnitt hat immer das Seitenverhältnis der Spielfläche auf dem Schirm,
  // damit hineingezoomt der ganze Platz genutzt wird. k0 = Pixel pro SVG-Einheit bei „ganzes Bild“.
  function frame() {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return { k0: 1, left: r.left, top: r.top, rw: full.w, rh: full.h };
    return { k0: Math.min(r.width / full.w, r.height / full.h), left: r.left, top: r.top, rw: r.width, rh: r.height };
  }
  const maxZoom = () => Math.max(1, 40 / (frame().k0 * C)); // höchstens ca. 40 px pro Feld
  function sizeVB(f) {
    const k = f.k0 * zoom;
    vb.w = f.rw / k; vb.h = f.rh / k;
  }
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
    const k = f.k0 * zoom;
    vb.x = ux - (px - f.left) / k;
    vb.y = uy - (py - f.top) / k;
    clampVB();
  }
  const toUnits = (px, py) => {
    const f = frame(), k = f.k0 * zoom;
    return [vb.x + (px - f.left) / k, vb.y + (py - f.top) / k];
  };
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    gesture.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, u: toUnits(mx, my) };
  }
  svg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) pointers.clear(); // erster Finger: evtl. hängengebliebene Zeiger vergessen
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture.moved = false;
      gesture.start = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
    } else if (pointers.size === 2) {
      gesture.moved = true;
      startPinch();
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && gesture.pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const { d0, z0, u } = gesture.pinch;
      applyZoom(z0 * d / d0, (a.x + b.x) / 2, (a.y + b.y) / 2, u[0], u[1]);
    } else if (pointers.size === 1 && gesture.start) {
      const dx = e.clientX - gesture.start.x, dy = e.clientY - gesture.start.y;
      if (!gesture.moved && Math.hypot(dx, dy) > 8) gesture.moved = true;
      if (gesture.moved && zoom > 1) {
        const k = frame().k0 * zoom;
        vb.x = gesture.start.vx - dx / k;
        vb.y = gesture.start.vy - dy / k;
        clampVB();
      }
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    gesture.pinch = null;
    if (pointers.size === 1) {
      // nach dem Zoomen mit dem verbleibenden Finger weiter verschieben
      const [p] = [...pointers.values()];
      gesture.start = { x: p.x, y: p.y, vx: vb.x, vy: vb.y };
    } else if (pointers.size === 2) startPinch();
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const u = toUnits(e.clientX, e.clientY);
    applyZoom(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY, u[0], u[1]);
  }, { passive: false });
  fitBtn.addEventListener('click', () => { zoom = 1; sizeVB(frame()); clampVB(); });
  // Bildausschnitt so verschieben, dass ein Pfeil sichtbar ist
  function reveal(v) {
    if (zoom <= 1) return;
    const xs = v.a.cells.map(([x]) => x * C + C / 2), ys = v.a.cells.map(([, y]) => y * C + C / 2);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x0 >= vb.x && x1 <= vb.x + vb.w && y0 >= vb.y && y1 <= vb.y + vb.h) return;
    vb.x = (x0 + x1) / 2 - vb.w / 2;
    vb.y = (y0 + y1) / 2 - vb.h / 2;
    clampVB();
  }
  sizeVB(frame());
  clampVB();
  // Bei Größenänderung (Drehen des Handys) Ausschnitt anpassen
  new ResizeObserver(() => { if (svg.isConnected) { sizeVB(frame()); clampVB(); } }).observe(svg);

  // Pfeil an Position s (Strecke entlang des Pfads) zeichnen
  function place(v, s) {
    v.body.style.strokeDasharray = `${v.bodyLen} ${v.pathLen + 100}`;
    v.body.style.strokeDashoffset = `${-s}`;
    const tip = v.body.getPointAtLength(v.bodyLen + s);
    const back = v.body.getPointAtLength(Math.max(0, v.bodyLen + s - 1));
    let ang = Math.atan2(tip.y - back.y, tip.x - back.x) * 180 / Math.PI;
    if (v.bodyLen + s < 1) ang = Math.atan2(DIRS[v.a.dir][1], DIRS[v.a.dir][0]) * 180 / Math.PI;
    v.head.setAttribute('transform', `translate(${tip.x} ${tip.y}) rotate(${ang})`);
  }

  function animate(v, from, to, ms, ease = (t) => t) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        place(v, from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  const easeIn = (t) => t * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  // Pfeile, die angestoßen sind, warten: sobald ihre Bahn frei ist, fliegen sie von selbst.
  const waiting = new Set();

  function tap(v) {
    if (over || v.removed || busy.has(v)) return;
    clearHint();
    const dist = blockDistance(v.a, occ, w, h);
    if (dist === null) launch(v);
    else bumpInto(v, dist);
  }

  async function launch(v) {
    // Frei: Feld sofort freigeben, dann hinausgleiten
    busy.add(v);
    waiting.delete(v);
    if (hinted === v) clearHint();
    v.removed = true;
    for (const [x, y] of v.a.cells) occ[y * w + x] = -1;
    remaining--;
    updateHud();
    v.g.classList.remove('waiting');
    v.g.classList.add('leaving');
    releaseWaiting();
    const travel = v.pathLen - v.bodyLen;
    await animate(v, 0, travel, 380 + travel * 2.2, easeIn);
    v.g.remove();
    busy.delete(v);
    shell.vibrate(10);
    sound.whoosh();
    if (remaining === 0 && !over) win();
  }

  // Wartende Pfeile mit inzwischen freier Bahn kurz nacheinander starten
  function releaseWaiting() {
    if (over) return;
    for (const u of waiting) {
      if (u.removed || busy.has(u)) continue;
      if (blockDistance(u.a, occ, w, h) === null) {
        waiting.delete(u);
        setTimeout(() => { if (!over && !u.removed && !busy.has(u)) launch(u); }, 160);
      }
    }
  }

  async function bumpInto(v, dist) {
    // Blockiert: anstoßen und zurück, ein Leben weg; danach wartet der Pfeil
    busy.add(v);
    const bump = dist * C + C * 0.3;
    v.g.classList.add('blocked');
    lives--;
    updateHud();
    shell.vibrate([30, 40, 30]);
    sound.bump();
    await animate(v, 0, bump, 120 + bump * 4, easeOut);
    await animate(v, bump, 0, 220, easeOut);
    v.g.classList.remove('blocked');
    busy.delete(v);
    if (lives <= 0) { lose(); return; }
    waiting.add(v);
    v.g.classList.add('waiting');
    releaseWaiting(); // falls die Bahn inzwischen frei geworden ist
  }

  function updateHud() {
    shell.setLives(lives);
    shell.setCounter(`${remaining} ${remaining === 1 ? 'Pfeil' : 'Pfeile'} übrig`);
    if (hintBtn) hintBtn.classList.toggle('arrows-no-hint', lives <= 1);
  }

  // Jeder Tipp kostet ein Leben. Mit dem letzten Herz gibt es keinen Tipp mehr.
  let hinted = null;
  let hintsUsed = 0;
  const hintBtn = root.querySelector('[data-act="hint"]');
  function clearHint() { if (hinted) { hinted.g.classList.remove('hint'); hinted = null; } }
  function hint() {
    if (over) return;
    if (hinted && !hinted.removed) { reveal(hinted); return; } // Tipp wird schon angezeigt – kostet nichts extra
    if (lives <= 1) { sound.bump(); return; }
    clearHint();
    const free = views.filter((v) => !v.removed && !busy.has(v) && blockDistance(v.a, occ, w, h) === null);
    if (!free.length) return;
    lives--;
    hintsUsed++;
    updateHud();
    hinted = free[Math.floor(Math.random() * free.length)];
    hinted.g.classList.add('hint');
    reveal(hinted);
  }

  function win() {
    over = true;
    const details = [mistakesText(LIVES - lives - hintsUsed)];
    if (hintsUsed) details.push(`${hintsUsed} ${hintsUsed === 1 ? 'Tipp' : 'Tipps'}`);
    shell.win(details);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    shell.lose('Jeder Pfeil fliegt in Richtung seiner Spitze. Schau, was im Weg ist.');
  }

  updateHud();
}
