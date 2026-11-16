// Fallenfeld: Spielfeld und Bedienung (Canvas, weil bis zu 50×50 Felder).
// Tippen: Markierung an/aus. Doppeltippen: Feld aufdecken (markierte Felder sind
// geschützt); Doppeltippen auf eine Zahl mit vollständig markierten Nachbarn deckt den
// Rest auf. Zwei Finger: zoomen; ein Finger verschiebt, wenn hineingezoomt.
// Herzen: aufgedeckte Falle, zu viele Markierungen an einer Zahl, Tipp (nicht beim letzten).
import { generateLevel, makeGrid, logicSolve } from './generator.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const LIVES = 3;
const MAX_S = 48;            // höchstens so viele Pixel je Feld beim Zoomen
const START_S = 30;          // große Felder beginnen hineingezoomt am Startbereich
const DOUBLE_MS = 350;
const SAVE_KEY = 'knobelkiste-traps-stand';
const COVER = 0, FLAG = 1, OPEN = 2, BOOM = 3;
const RULES = 'Jede Zahl zeigt, wie viele Fallen in ihren 8 Nachbarfeldern liegen. ' +
  'Tippen markiert eine Falle, Doppeltippen deckt ein Feld auf.';

export function mountTraps(root, { level, onWin, onExit }) {
  const L = generateLevel(level);
  const { W, H, mines, num, total } = L;
  const g = makeGrid(W, H);
  const { N, nb } = g;
  const st = new Uint8Array(N);
  let lives = LIVES, hints = 0, mistakes = 0, over = false;
  let t0 = performance.now();

  const shell = createShell(root, {
    name: 'Fallenfeld', level, lives: LIVES, onHint: () => hint(),
    onExit: (how) => { if (how === 'menu') saveState(); else clearSave(); onExit(how); },
  });
  const view = document.createElement('div');
  view.className = 'traps-view';
  const cv = document.createElement('canvas');
  cv.className = 'board traps';
  const hintEl = document.createElement('div');
  hintEl.className = 'traps-hint';
  hintEl.hidden = true;
  const fitBtn = document.createElement('button');
  fitBtn.className = 'traps-fit';
  fitBtn.textContent = 'Ganzes Bild';
  fitBtn.hidden = true;
  const toast = document.createElement('div');
  toast.className = 'toast';
  view.append(cv, hintEl, fitBtn, toast);
  shell.board.appendChild(view);
  const hintBtn = root.querySelector('[data-act="hint"]');
  const ctx = cv.getContext('2d');

  let toastTimer = 0;
  function say(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ---------- Regeln ----------
  const flagsAround = (i) => { let m = 0; for (const j of nb[i]) if (st[j] === FLAG || st[j] === BOOM) m++; return m; };
  const isBad = (i) => st[i] === OPEN && num[i] > 0 && flagsAround(i) > num[i];
  let opened = 0;
  const countOpen = () => { opened = 0; for (let i = 0; i < N; i++) if (st[i] === OPEN) opened++; };
  const trapsLeft = () => { let m = total; for (let i = 0; i < N; i++) if (st[i] === FLAG || st[i] === BOOM) m--; return m; };

  // Aufdecken; Nullen ziehen ihre Nachbarn mit auf. Gibt die Zahl der Fallen zurück.
  function open(list) {
    let booms = 0;
    const stack = [...list];
    while (stack.length) {
      const i = stack.pop();
      if (st[i] === OPEN || st[i] === BOOM) continue;
      if (mines[i]) { st[i] = BOOM; booms++; continue; }
      st[i] = OPEN;
      opened++;
      if (num[i] === 0) for (const j of nb[i]) if (st[j] !== OPEN && !mines[j]) stack.push(j);
    }
    return booms;
  }

  function afterChange({ booms = 0, flagged = -1, quiet = false } = {}) {
    clearHint();
    if (booms) {
      lives--; mistakes++;
      sound.bump();
      shell.vibrate([30, 40, 30]);
    }
    updateHud();
    draw();
    saveState();
    if (lives <= 0) { lose(); return; }
    if (opened === N - total) { win(); return; }
    if (flagged >= 0) scheduleCheck(flagged);
    else if (!booms && !quiet) sound.click();
  }

  // Zu viele Markierungen an einer Zahl kosten ein Herz – erst geprüft, wenn kein
  // zweiter Tipp (Doppeltippen) mehr kommt.
  let checkTimer = 0, badBefore = null;
  function scheduleCheck(i) {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      if (over || st[i] !== FLAG) return;
      const now = nb[i].some((j) => isBad(j) && !badBefore.has(j));
      if (now) {
        lives--; mistakes++;
        sound.bump();
        shell.vibrate([30, 40, 30]);
        updateHud();
        saveState();
        if (lives <= 0) lose();
      }
    }, DOUBLE_MS + 10);
  }
  const badSet = () => { const s = new Set(); for (let i = 0; i < N; i++) if (isBad(i)) s.add(i); return s; };

  let lastTap = null;
  function tap(i) {
    const now = performance.now();
    if (lastTap && lastTap.i === i && now - lastTap.t < DOUBLE_MS) {
      const from = lastTap.from;
      lastTap = null;
      clearTimeout(checkTimer);
      st[i] = from;
      if (from === COVER) {
        afterChange({ booms: open([i]) });
      } else if (from === OPEN) {
        chord(i);
      } else if (from === FLAG) {
        // markierte Felder sind vor dem Aufdecken geschützt
        draw();
        saveState();
        sound.tick();
        say('Markiert – erst Markierung entfernen');
      }
      return;
    }
    const from = st[i];
    lastTap = { i, t: now, from };
    if (from === COVER) {
      badBefore = badSet();
      st[i] = FLAG;
      sound.tick();
      afterChange({ flagged: i });
    } else if (from === FLAG) {
      st[i] = COVER;
      sound.tick();
      afterChange({ quiet: true });
    }
  }
  function chord(i) {
    if (num[i] === 0) return;
    const rest = nb[i].filter((j) => st[j] === COVER);
    if (!rest.length) return;
    if (flagsAround(i) !== num[i]) { sound.bump(); say(`Erst ${num[i]} ${num[i] === 1 ? 'Falle' : 'Fallen'} markieren`); return; }
    // mehrere Fallen auf einmal kosten nur ein Herz
    afterChange({ booms: Math.min(1, open(rest)) });
  }

  // ---------- Darstellung ----------
  let cssW = 1, cssH = 1, dpr = 1;
  let s = 10, ox = 0, oy = 0, s0 = 10;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(view);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      cover: v('--tc-cover'), coverHi: v('--tc-cover-hi'), open: v('--tc-open'), line: v('--tc-line'),
      flag: v('--tc-flag'), pole: v('--ink'), trap: v('--tc-trap'), boom: v('--tc-boom'), bad: v('--danger'),
      n: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => v('--tn' + k)),
    };
  }
  function resize() {
    const r = view.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    dpr = window.devicePixelRatio || 1;
    cssW = r.width; cssH = r.height;
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    s0 = Math.min((cssW - 4) / W, (cssH - 4) / H);
    return true;
  }
  function clamp() {
    s = Math.min(Math.max(s, s0), Math.max(s0, MAX_S));
    const bw = W * s, bh = H * s;
    ox = bw <= cssW ? (cssW - bw) / 2 : Math.min(0, Math.max(cssW - bw, ox));
    oy = bh <= cssH ? (cssH - bh) / 2 : Math.min(0, Math.max(cssH - bh, oy));
    fitBtn.hidden = s < s0 * 1.05;
  }
  function fit() { s = s0; clamp(); draw(); }
  function centerOn(i, scale) {
    s = scale;
    ox = cssW / 2 - ((i % W) + 0.5) * s;
    oy = cssH / 2 - (Math.floor(i / W) + 0.5) * s;
    clamp();
  }

  function trapShape(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8, rr = k % 2 ? r * 0.55 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  function flagShape(x, y, s) {
    ctx.strokeStyle = colors.pole;
    ctx.lineWidth = Math.max(1, s * 0.07);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.36, y + s * 0.2);
    ctx.lineTo(x + s * 0.36, y + s * 0.8);
    ctx.stroke();
    ctx.fillStyle = colors.flag;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.38, y + s * 0.2);
    ctx.lineTo(x + s * 0.74, y + s * 0.36);
    ctx.lineTo(x + s * 0.38, y + s * 0.52);
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    if (!cv.isConnected) return;
    readColors();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    const c0 = Math.max(0, Math.floor(-ox / s)), c1 = Math.min(W, Math.ceil((cssW - ox) / s));
    const r0 = Math.max(0, Math.floor(-oy / s)), r1 = Math.min(H, Math.ceil((cssH - oy) / s));
    const gap = s >= 12 ? 1 : s >= 6 ? 0.5 : 0;
    const showAll = over;
    // Grund
    ctx.fillStyle = colors.line;
    ctx.fillRect(ox + c0 * s, oy + r0 * s, (c1 - c0) * s, (r1 - r0) * s);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(s * 0.62)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++) {
        const i = r * W + c, x = ox + c * s, y = oy + r * s, v = st[i];
        if (v === OPEN || v === BOOM) {
          ctx.fillStyle = v === BOOM ? colors.boom : colors.open;
          ctx.fillRect(x + gap / 2, y + gap / 2, s - gap, s - gap);
          if (v === BOOM) trapShape(x + s / 2, y + s / 2, s * 0.32, colors.trap);
          else if (num[i]) {
            const bad = isBad(i);
            const col = bad ? colors.bad : colors.n[num[i] - 1];
            if (s >= 9) {
              ctx.fillStyle = col;
              ctx.fillText(String(num[i]), x + s / 2, y + s / 2 + s * 0.04);
            } else {
              ctx.fillStyle = col;
              const d = Math.max(1, s * 0.4);
              ctx.fillRect(x + (s - d) / 2, y + (s - d) / 2, d, d);
            }
            if (bad && s >= 9) {
              ctx.strokeStyle = colors.bad;
              ctx.lineWidth = Math.max(1, s * 0.06);
              ctx.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
            }
          }
        } else {
          ctx.fillStyle = colors.cover;
          ctx.fillRect(x + gap / 2, y + gap / 2, s - gap, s - gap);
          if (s >= 12) {
            ctx.fillStyle = colors.coverHi;
            ctx.fillRect(x + gap / 2, y + gap / 2, s - gap, Math.max(1, s * 0.1));
          }
          if (v === FLAG) {
            if (showAll && !mines[i]) {
              ctx.strokeStyle = colors.bad;
              ctx.lineWidth = Math.max(1, s * 0.07);
              ctx.beginPath();
              ctx.moveTo(x + s * 0.25, y + s * 0.25); ctx.lineTo(x + s * 0.75, y + s * 0.75);
              ctx.moveTo(x + s * 0.75, y + s * 0.25); ctx.lineTo(x + s * 0.25, y + s * 0.75);
              ctx.stroke();
            } else flagShape(x, y, s);
          } else if (showAll && mines[i]) trapShape(x + s / 2, y + s / 2, s * 0.28, colors.trap);
        }
      }
    placeHint();
  }

  // ---------- Zoomen und Verschieben ----------
  const at = (px, py) => {
    const r = cv.getBoundingClientRect();
    return [px - r.left, py - r.top];
  };
  function zoomAt(ns, px, py) {
    // Punkt unter (px, py) bleibt stehen
    const ux = (px - ox) / s, uy = (py - oy) / s;
    s = Math.min(Math.max(ns, s0), Math.max(s0, MAX_S));
    ox = px - ux * s; oy = py - uy * s;
    clamp();
    draw();
  }
  fitBtn.addEventListener('click', fit);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = at(e.clientX, e.clientY);
    zoomAt(s * Math.exp(-e.deltaY * 0.0015), px, py);
  }, { passive: false });

  const pointers = new Map();
  let pinch = null, multi = false, pan = null;
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const [mx, my] = at((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: s, ux: (mx - ox) / s, uy: (my - oy) / s };
  }
  cv.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) { pointers.clear(); multi = false; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { cv.setPointerCapture(e.pointerId); } catch {}
    if (pointers.size >= 2) { multi = true; pan = null; startPinch(); return; }
    if (e.button > 0) return;
    pan = { x: e.clientX, y: e.clientY, ox, oy, moved: false };
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const [mx, my] = at((a.x + b.x) / 2, (a.y + b.y) / 2);
      s = Math.min(Math.max(pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, s0), Math.max(s0, MAX_S));
      ox = mx - pinch.ux * s; oy = my - pinch.uy * s;
      clamp();
      draw();
      return;
    }
    if (!pan || multi) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 8) return;
    pan.moved = true;
    ox = pan.ox + dx; oy = pan.oy + dy;
    clamp();
    draw();
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) startPinch();
    else pinch = null;
    if (pointers.size > 0) return;
    const p = pan;
    pan = null;
    if (!p || p.moved || multi || over || e.type === 'pointercancel') return;
    const [px, py] = at(e.clientX, e.clientY);
    const c = Math.floor((px - ox) / s), r = Math.floor((py - oy) / s);
    if (c >= 0 && r >= 0 && c < W && r < H) tap(r * W + c);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  // ---------- Tipp ----------
  // Zeigt ein Feld, das sich aus dem Sichtbaren sicher folgern lässt (oder eine falsche
  // Markierung). Kostet ein Herz; mit dem letzten Herz gibt es keinen Tipp mehr.
  let hinted = -1;
  function clearHint() { hinted = -1; hintEl.hidden = true; }
  function placeHint() {
    if (hinted < 0) { hintEl.hidden = true; return; }
    hintEl.hidden = false;
    hintEl.style.left = ox + (hinted % W) * s + 'px';
    hintEl.style.top = oy + Math.floor(hinted / W) * s + 'px';
    hintEl.style.width = hintEl.style.height = s + 'px';
  }
  function showHint(i, text) {
    hinted = i;
    const r = Math.floor(i / W), c = i % W;
    if (ox + c * s < 0 || ox + (c + 1) * s > cssW || oy + r * s < 0 || oy + (r + 1) * s > cssH) centerOn(i, s);
    draw();
    say(text);
  }
  function hint() {
    if (over) return;
    if (hinted >= 0) { showHint(hinted, hintEl.dataset.text); return; } // schon angezeigt – kostet nichts
    if (lives <= 1) { sound.bump(); say('Kein Tipp beim letzten Herz'); return; }
    let i = -1, text = '';
    for (let x = 0; x < N; x++) if (st[x] === FLAG && !mines[x]) { i = x; text = 'Diese Markierung ist falsch'; break; }
    if (i < 0) {
      const known = new Int8Array(N);
      for (let x = 0; x < N; x++) known[x] = st[x] === OPEN ? 0 : st[x] === BOOM ? 1 : -1;
      const res = logicSolve(g, num, known, total, { reveal: false, record: true });
      const step = res.steps.find((p) => st[p.i] === COVER) || res.steps.find((p) => p.mine && st[p.i] !== FLAG);
      if (step) { i = step.i; text = step.mine ? 'Hier liegt eine Falle' : 'Dieses Feld ist frei'; }
    }
    if (i < 0) { say('Kein Tipp gefunden'); return; }
    lives--; hints++;
    updateHud();
    hintEl.dataset.text = text;
    showHint(i, text);
    saveState();
  }

  // ---------- Anzeige, Zeit, Ende ----------
  function updateHud() {
    shell.setLives(lives);
    if (hintBtn) hintBtn.classList.toggle('traps-no-hint', lives <= 1);
    counter();
  }
  function counter() {
    if (over) return;
    shell.setCounter(`${trapsLeft()} ✦ · ${timeText(performance.now() - t0).replace(' min', '')}`);
  }
  const timer = setInterval(() => {
    if (!cv.isConnected) return clearInterval(timer);
    counter();
  }, 1000);

  function win() {
    over = true;
    clearSave();
    clearInterval(timer);
    clearHint();
    for (let i = 0; i < N; i++) if (mines[i] && st[i] === COVER) st[i] = FLAG;
    shell.setCounter(`0 ✦ · ${timeText(performance.now() - t0).replace(' min', '')}`);
    view.classList.add('solved');
    draw();
    const details = [`${W}×${H}`, timeText(performance.now() - t0), mistakesText(mistakes)];
    if (hints) details.push(`${hints} ${hints === 1 ? 'Tipp' : 'Tipps'}`);
    setTimeout(() => shell.win(details), 500);
    onWin && onWin(level);
  }
  function lose() {
    over = true;
    clearSave();
    clearInterval(timer);
    clearHint();
    draw();
    setTimeout(() => shell.lose(RULES), 500);
  }

  // ---------- Spielstand im Level ----------
  const sig = `${W}x${H}:${total}:${L.start}`;
  function saveState() {
    if (over) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        level, sig, st: Array.from(st).join(''), lives, hints, mistakes, time: performance.now() - t0,
      }));
    } catch {}
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} }
  let restored = false;
  try {
    const sv = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (sv && sv.level === level && sv.sig === sig && sv.lives > 0 && sv.st.length === N) {
      for (let i = 0; i < N; i++) st[i] = Number(sv.st[i]) & 3;
      lives = sv.lives; hints = sv.hints; mistakes = sv.mistakes;
      t0 = performance.now() - sv.time;
      restored = true;
    }
  } catch {}
  if (!restored) open([L.start]);
  countOpen();
  const onHide = () => { if (cv.isConnected && document.visibilityState === 'hidden') saveState(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', () => { if (cv.isConnected) saveState(); });

  // Testzugang (nur mit ?debug in der Adresse)
  if (location.search.includes('debug')) {
    window.__game = {
      L, st, get lives() { return lives; }, get over() { return over; }, tap,
      at(i) { const r = cv.getBoundingClientRect(); return [r.left + ox + ((i % W) + 0.5) * s, r.top + oy + (Math.floor(i / W) + 0.5) * s]; },
    };
  }

  // Erste Ansicht: kleine Felder ganz, große hineingezoomt am Startbereich
  let first = true;
  function layout() {
    if (!resize()) return;
    if (first) {
      first = false;
      if (s0 < START_S * 0.8) centerOn(L.start, START_S); else { s = s0; clamp(); }
    } else clamp();
    draw();
  }
  new ResizeObserver(() => { if (cv.isConnected) layout(); }).observe(view);
  // Farbschema kann sich ändern (hell/dunkel)
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { if (cv.isConnected) draw(); };
  mq.addEventListener && mq.addEventListener('change', onScheme);
  layout();
  updateHud();
}
