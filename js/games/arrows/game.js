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

  const shell = createShell(root, { name: 'Pfeilwerk', level, lives: LIVES, onExit, onHint: () => hint() });
  const svg = el('svg', { class: 'board', viewBox: `${-C * 0.5} ${-C * 0.5} ${w * C + C} ${h * C + C}`, preserveAspectRatio: 'xMidYMid meet' });
  shell.board.appendChild(svg);

  // Rasterpunkte
  const dots = el('g', { class: 'dots' });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) dots.appendChild(el('circle', { cx: x * C + C / 2, cy: y * C + C / 2, r: 0.7 }));
  svg.appendChild(dots);

  // Pfeile zeichnen
  const views = arrows.map((a, i) => {
    const g = el('g', { class: 'arrow' });
    g.style.setProperty('--c', `var(${PALETTE[i % PALETTE.length]})`);
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
    hit.addEventListener('pointerup', (e) => { e.preventDefault(); tap(v); });
    return v;
  });
  views.forEach((v) => { v.pathLen = v.body.getTotalLength(); place(v, 0); });

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

  async function tap(v) {
    if (over || v.removed || busy.has(v)) return;
    clearHint();
    const dist = blockDistance(v.a, occ, w, h);
    busy.add(v);
    if (dist === null) {
      // Frei: Feld sofort freigeben, dann hinausgleiten
      v.removed = true;
      for (const [x, y] of v.a.cells) occ[y * w + x] = -1;
      remaining--;
      updateHud();
      v.g.classList.add('leaving');
      const travel = v.pathLen - v.bodyLen;
      await animate(v, 0, travel, 380 + travel * 2.2, easeIn);
      v.g.remove();
      busy.delete(v);
      shell.vibrate(10);
      sound.whoosh();
      if (remaining === 0 && !over) win();
    } else {
      // Blockiert: anstoßen und zurück, ein Leben weg
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
      if (lives <= 0) lose();
    }
  }

  function updateHud() {
    shell.setLives(lives);
    shell.setCounter(`${remaining} übrig`);
  }

  let hinted = null;
  function clearHint() { if (hinted) { hinted.g.classList.remove('hint'); hinted = null; } }
  function hint() {
    clearHint();
    const free = views.filter((v) => !v.removed && blockDistance(v.a, occ, w, h) === null);
    if (!free.length) return;
    hinted = free[Math.floor(Math.random() * free.length)];
    hinted.g.classList.add('hint');
  }

  function win() {
    over = true;
    shell.win([mistakesText(LIVES - lives)]);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    shell.lose('Jeder Pfeil fliegt in Richtung seiner Spitze. Schau, was im Weg ist.');
  }

  updateHud();
}
