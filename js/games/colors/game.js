// Farbräumer: Darstellung, Animation und Bedienung.
// Erreichbare Figur antippen → sie geht in den offenen Behälter ihrer Farbe,
// sonst in die Ablage.
import { CAP, initialState, reachable, destination, legalMoves, applyMove, isWon, openContainers, solve } from './model.js';
import { generateLevel } from './generator.js';
import { createShell } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const fill = (c) => `var(--f${c})`;

export function mountColors(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  let s = initialState(L);
  const history = [];
  let busy = false, over = false, hints = 0, moves = 0;

  const shell = createShell(root, {
    name: 'Farbräumer', level, onExit, onHint: () => hint(), onUndo: () => undo(),
  });

  // ---------- Maße ----------
  const W = 100;
  const CONT_Y = 10, CONT_H = 15;          // Behälter
  const BUF_Y = 36;                         // Ablage (Mitte)
  const BOARD_Y = 46;
  const cs = W / L.cols;                    // Zellgröße
  const H = BOARD_Y + L.rows * cs + 1;
  const svg = el('svg', { class: 'board colors', viewBox: `0 0 ${W} ${H}` });
  shell.board.appendChild(svg);
  const toast = document.createElement('div');
  toast.className = 'toast';
  shell.board.appendChild(toast);

  const stackW = W / L.stacks.length;
  const slotPos = (k, slot) => {
    const x0 = k * stackW + 4, w = stackW - 8;
    return [x0 + w * (slot + 0.5) / CAP, CONT_Y + CONT_H / 2];
  };
  const bufPos = (b) => {
    const gap = Math.min(13, (W - 20) / L.bufferSize);
    const x0 = W / 2 - (gap * (L.bufferSize - 1)) / 2;
    return [x0 + b * gap, BUF_Y];
  };
  const cellPos = (i) => [(i % L.cols + 0.5) * cs, BOARD_Y + (Math.floor(i / L.cols) + 0.5) * cs];

  // Figur (Spielstein) als Gruppe
  function figure(c, [x, y], size) {
    const g = el('g', { class: 'fig', transform: `translate(${x} ${y}) scale(${size})` });
    g.append(
      el('path', { d: 'M-0.3 0.36 Q-0.27 0.02 -0.11 -0.02 L0.11 -0.02 Q0.27 0.02 0.3 0.36 Z', class: 'fig-body', style: `fill:${fill(c)}` }),
      el('circle', { cx: 0, cy: -0.17, r: 0.17, class: 'fig-body', style: `fill:${fill(c)}` }),
      el('circle', { cx: -0.05, cy: -0.22, r: 0.05, class: 'fig-shine' }),
    );
    return g;
  }

  const scene = el('g'); svg.appendChild(scene);
  const flyer = el('g'); svg.appendChild(flyer);

  // ---------- Zeichnen ----------
  function render(hide = new Set()) {
    scene.replaceChildren();
    // Behälter-Stapel
    const open = openContainers(L, s);
    L.stacks.forEach((st, k) => {
      const x0 = k * stackW + 4, w = stackW - 8;
      // dahinter wartende Behälter (Vorschau)
      const rest = st.slice(s.stackPos[k] + 1);
      rest.slice(0, 3).reverse().forEach((c, j, arr) => {
        const depth = arr.length - j; // 1 = direkt dahinter
        scene.appendChild(el('rect', { x: x0 + depth * 2.2, y: CONT_Y - depth * 2.6, width: w - depth * 4.4, height: 4, rx: 1.6, class: 'cont-back', style: `fill:${fill(c)}` }));
      });
      if (rest.length > 3) {
        const t = el('text', { x: x0 + w, y: CONT_Y - 8.2, class: 'cont-more' });
        t.textContent = `+${rest.length - 3}`;
        scene.appendChild(t);
      }
      if (open[k] === null) {
        scene.appendChild(el('rect', { x: x0, y: CONT_Y, width: w, height: CONT_H, rx: 3.5, class: 'cont-empty' }));
        return;
      }
      const g = el('g', { class: 'cont', 'data-stack': k });
      g.append(
        el('rect', { x: x0, y: CONT_Y, width: w, height: CONT_H, rx: 3.5, class: 'cont-box', style: `stroke:${fill(open[k])}` }),
        el('rect', { x: x0, y: CONT_Y, width: w, height: CONT_H, rx: 3.5, class: 'cont-tint', style: `fill:${fill(open[k])}` }),
      );
      for (let sl = 0; sl < CAP; sl++) {
        const [x, y] = slotPos(k, sl);
        if (sl < s.fill[k] && !hide.has(`c${k}:${sl}`)) g.appendChild(figure(open[k], [x, y], 9));
        else g.appendChild(el('circle', { cx: x, cy: y, r: 2.6, class: 'slot', style: `stroke:${fill(open[k])}` }));
      }
      scene.appendChild(g);
    });
    // Ablage
    const lbl = el('text', { x: 2, y: BUF_Y - 6.5, class: 'buf-label' });
    lbl.textContent = 'Ablage';
    scene.appendChild(lbl);
    for (let b = 0; b < L.bufferSize; b++) {
      const p = bufPos(b);
      scene.appendChild(el('circle', { cx: p[0], cy: p[1], r: 4.6, class: 'buf-slot' + (b >= s.buffer.length ? '' : ' used') }));
      if (b < s.buffer.length && !hide.has(`b${b}`)) scene.appendChild(figure(s.buffer[b], p, 8));
    }
    // Brett
    scene.appendChild(el('rect', { x: 0, y: BOARD_Y, width: W, height: L.rows * cs, rx: 2.5, class: 'tray' }));
    const ok = reachable(L, s);
    for (let i = 0; i < s.board.length; i++) {
      const [x, y] = cellPos(i);
      scene.appendChild(el('circle', { cx: x, cy: y, r: cs * 0.36, class: 'cell' }));
    }
    L.gates.forEach((g, k) => {
      const [x, y] = cellPos(g.cell);
      scene.appendChild(el('rect', { x: x - cs / 2 + 0.8, y: y - cs / 2 + 0.8, width: cs - 1.6, height: cs - 1.6, rx: 2.5, class: 'gate' }));
      const left = g.queue.length - s.gateIdx[k];
      if (left > 0) {
        const bx = x + cs * 0.32, by = y - cs * 0.32;
        scene.appendChild(el('circle', { cx: bx, cy: by, r: 2.6, class: 'gate-badge', style: `fill:${fill(g.queue[s.gateIdx[k]])}` }));
        const t = el('text', { x: bx, y: by, class: 'gate-count', 'dominant-baseline': 'central' });
        t.textContent = left;
        scene.appendChild(t);
      }
    });
    for (let i = 0; i < s.board.length; i++) {
      if (s.board[i] < 0 || hide.has(`f${i}`)) continue;
      const f = figure(s.board[i], cellPos(i), cs * 0.92);
      f.dataset.cell = i;
      if (!ok[i]) f.classList.add('blocked');
      if (hintCell === i) f.classList.add('hint');
      scene.appendChild(f);
    }
    const left = s.board.filter((v) => v >= 0).length + L.gates.reduce((a, g, k) => a + g.queue.length - s.gateIdx[k], 0) + s.buffer.length;
    shell.setCounter(`${left} Figuren`);
  }

  // ---------- Animation ----------
  const tween = (ms, f) => new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => {
      if (!svg.isConnected) return done();
      const t = Math.min(1, (now - t0) / ms);
      f(t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
  async function fly(c, from, to, s0, s1, ms = 300) {
    const g = figure(c, from, s0);
    flyer.appendChild(g);
    await tween(ms, (t) => {
      const x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t - Math.sin(Math.PI * t) * 4;
      g.setAttribute('transform', `translate(${x} ${y}) scale(${s0 + (s1 - s0) * t})`);
    });
    g.remove();
  }

  async function play(events, prev) {
    // 1. Figur vom Brett in Behälter oder Ablage
    const first = events[0];
    const sNew = s;
    s = { ...prev, board: Int8Array.from(prev.board) };
    s.board[first.from] = -1;
    render();
    const target = first.type === 'toContainer' ? slotPos(first.stack, first.slot) : bufPos(first.slot);
    await fly(first.color, cellPos(first.from), target, cs * 0.92, first.type === 'toContainer' ? 9 : 8);
    if (first.type === 'toContainer') sound.click(); else sound.tick();
    // 2. Volle Behälter verschwinden, Ablage rückt nach
    const done = events.filter((e) => e.type === 'containerDone');
    if (done.length) {
      // Zwischenstand: Behälter voll zeigen
      s = { ...prev, board: s.board, fill: prev.fill.slice(), buffer: prev.buffer.slice() };
      if (first.type === 'toContainer') s.fill[first.stack]++;
      render();
      sound.whoosh();
      const groups = done.map((e) => scene.querySelector(`.cont[data-stack="${e.stack}"]`)).filter(Boolean);
      await tween(380, (t) => groups.forEach((g) => { g.style.transform = `translateY(${-14 * t}px)`; g.style.opacity = String(1 - t); }));
      const moved = events.filter((e) => e.type === 'bufferToContainer');
      s = sNew;
      const hide = new Set(moved.map((e) => `c${e.stack}:${e.toSlot}`));
      render(hide);
      if (moved.length) {
        await Promise.all(moved.map((e) => fly(e.color, bufPos(e.slot), slotPos(e.stack, e.toSlot), 8, 9, 320)));
        sound.click();
      }
    }
    s = sNew;
    render();
  }

  // ---------- Eingabe ----------
  svg.addEventListener('click', async (e) => {
    if (busy || over) return;
    const f = e.target.closest('.fig');
    if (!f || f.dataset.cell === undefined) return;
    const i = Number(f.dataset.cell);
    const ok = reachable(L, s);
    if (!ok[i]) { nudge(f, 'Diese Figur ist zugestellt.'); return; }
    if (!destination(L, s, s.board[i])) { nudge(f, 'Die Ablage ist voll.'); return; }
    await doMove(i);
  });

  async function doMove(i) {
    busy = true;
    hintCell = -1;
    const prev = s;
    const { state, events } = applyMove(L, s, i);
    history.push(prev);
    s = state;
    moves++;
    await play(events, prev);
    busy = false;
    if (!svg.isConnected) return;
    if (isWon(L, s)) {
      over = true;
      shell.win([`${moves} Züge`, ...(hints ? [`${hints} Tipp${hints > 1 ? 's' : ''}`] : [])]);
      onWin && onWin(level);
    } else if (legalMoves(L, s).length === 0) {
      shell.showCard(`<h2>Kein Zug mehr</h2>
        <p>Die Ablage ist voll und keine erreichbare Figur passt in einen offenen Behälter.</p>
        <button class="primary" data-act="undo">Rückgängig</button>
        <button class="secondary" data-act="restart">Neu starten</button>`);
    }
  }

  function nudge(f, text) {
    sound.bump();
    shell.vibrate(25);
    f.classList.remove('wiggle'); void f.getBBox(); f.classList.add('wiggle');
    showToast(text);
  }

  function undo() {
    if (busy || !history.length) return;
    shell.hideCard();
    over = false;
    s = history.pop();
    moves = Math.max(0, moves - 1);
    hintCell = -1;
    render();
    sound.tick();
  }

  // ---------- Tipp ----------
  let hintCell = -1;
  function hint() {
    if (busy || over) return;
    showToast('Suche …', 4000);
    setTimeout(() => {
      const res = solve(L, s, 15000);
      if (!res || !res.path) {
        showToast(res ? 'Von hier aus nicht mehr lösbar – Rückgängig hilft.' : 'Kein Tipp gefunden – vielleicht hilft Rückgängig.', 3000);
        return;
      }
      showToast('', 0);
      hints++;
      hintCell = res.path[0];
      render();
    }, 30);
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
