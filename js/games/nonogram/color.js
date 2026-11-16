// Farbbilder: Nonogramme mit mehreren Farben.
// Jede Zahl hat eine Farbe. Zwischen zwei Blöcken GLEICHER Farbe liegt
// mindestens ein leeres Feld, verschiedenfarbige Blöcke dürfen sich berühren.
// Ein Rätsel wird nur verwendet, wenn es sich Zeile für Zeile rein logisch
// lösen lässt (dann ist die Lösung auch eindeutig).
//
// Im Löser hat jedes Feld eine Bitmaske der noch möglichen Werte:
// Bit 0 = leer, Bit c = Farbe c (1..k). Hinweise: [{ n, c }, …].

import { mulberry32 } from '../../rng.js';

// Hinweise einer fertigen Zeile (Werte 0 = leer, 1..k = Farbe)
export function colorCluesOf(line) {
  const out = [];
  let run = 0, col = 0;
  for (const v of line) {
    if (v && v === col) run++;
    else {
      if (run) out.push({ n: run, c: col });
      run = v ? 1 : 0; col = v;
    }
  }
  if (run) out.push({ n: run, c: col });
  return out;
}

// Löst eine Zeile so weit wie möglich. line = Masken; Ergebnis = neue Masken
// oder null bei Widerspruch.
export function solveLineColor(line, clues) {
  const L = line.length, k = clues.length;
  // pre[c][i] = Anzahl Felder in [0,i), die Farbe c NICHT erlauben
  const cols = new Set(clues.map((b) => b.c));
  const pre = {};
  for (const c of cols) {
    const a = new Int32Array(L + 1);
    for (let i = 0; i < L; i++) a[i + 1] = a[i] + (line[i] & (1 << c) ? 0 : 1);
    pre[c] = a;
  }
  const canEmpty = (i) => i >= L || (line[i] & 1);
  const fits = (i, b) => i + b.n <= L && pre[b.c][i + b.n] - pre[b.c][i] === 0;
  // Block j bei i: belegt [i, i+n); folgt ein Block gleicher Farbe, ist i+n leer.
  const gapAfter = (j) => (j + 1 < k && clues[j + 1].c === clues[j].c ? 1 : 0);
  const blockOk = (i, j) => fits(i, clues[j]) && (!gapAfter(j) || (i + clues[j].n < L && canEmpty(i + clues[j].n)));
  const next = (i, j) => i + clues[j].n + gapAfter(j);

  // f[i*(k+1)+j]: [0,i) erklärbar mit den ersten j Blöcken
  const W = k + 1;
  const f = new Uint8Array((L + 2) * W), g = new Uint8Array((L + 2) * W);
  f[0] = 1;
  for (let i = 0; i <= L; i++) for (let j = 0; j <= k; j++) {
    if (!f[i * W + j]) continue;
    if (i < L && canEmpty(i)) f[(i + 1) * W + j] = 1;
    if (j < k && blockOk(i, j)) f[next(i, j) * W + j + 1] = 1;
  }
  if (!f[L * W + k]) return null;
  g[L * W + k] = 1;
  for (let i = L - 1; i >= 0; i--) for (let j = k; j >= 0; j--) {
    let ok = canEmpty(i) && g[(i + 1) * W + j];
    if (!ok && j < k && blockOk(i, j)) ok = g[next(i, j) * W + j + 1];
    g[i * W + j] = ok ? 1 : 0;
  }
  const may = new Uint16Array(L);
  for (let i = 0; i < L; i++) for (let j = 0; j <= k; j++) {
    if (!f[i * W + j]) continue;
    if (canEmpty(i) && g[(i + 1) * W + j]) may[i] |= 1;
    if (j < k && blockOk(i, j) && g[next(i, j) * W + j + 1]) {
      const b = clues[j];
      for (let x = i; x < i + b.n; x++) may[x] |= 1 << b.c;
      if (gapAfter(j)) may[i + b.n] |= 1;
    }
  }
  const out = new Array(L);
  for (let i = 0; i < L; i++) {
    out[i] = line[i] & may[i];
    if (!out[i]) return null;
  }
  return out;
}

const single = (m) => (m & (m - 1)) === 0;

// Ganzes Rätsel mit Zeilenlogik (nur geänderte Zeilen werden neu betrachtet).
export function lineSolveColor(rowClues, colClues, colors) {
  const R = rowClues.length, K = colClues.length;
  const grid = new Array(R * K).fill((1 << (colors + 1)) - 1);
  const rowDirty = new Uint8Array(R).fill(1), colDirty = new Uint8Array(K).fill(1);
  let changed = true, passes = 0;
  while (changed) {
    changed = false;
    passes++;
    for (let r = 0; r < R; r++) {
      if (!rowDirty[r]) continue;
      rowDirty[r] = 0;
      const line = grid.slice(r * K, (r + 1) * K);
      const res = solveLineColor(line, rowClues[r]);
      if (!res) return { grid, solved: false, passes };
      for (let c = 0; c < K; c++) if (res[c] !== line[c]) { grid[r * K + c] = res[c]; colDirty[c] = 1; changed = true; }
    }
    for (let c = 0; c < K; c++) {
      if (!colDirty[c]) continue;
      colDirty[c] = 0;
      const line = Array.from({ length: R }, (_, r) => grid[r * K + c]);
      const res = solveLineColor(line, colClues[c]);
      if (!res) return { grid, solved: false, passes };
      for (let r = 0; r < R; r++) if (res[r] !== line[r]) { grid[r * K + c] = res[r]; rowDirty[r] = 1; changed = true; }
    }
  }
  return { grid, solved: grid.every(single), passes };
}

export function colorPuzzleFrom(rows, cols, pixels, colors) {
  const rowClues = [], colClues = [];
  for (let r = 0; r < rows; r++) rowClues.push(colorCluesOf(pixels.slice(r * cols, (r + 1) * cols)));
  for (let c = 0; c < cols; c++) colClues.push(colorCluesOf(Array.from({ length: rows }, (_, r) => pixels[r * cols + c])));
  return { rows, cols, colors, pixels: Array.from(pixels), rowClues, colClues, name: null };
}

// Feldgröße und Farbenzahl je Level (ab 15×15 – Farben verraten viel,
// die Schwierigkeit kommt vor allem über die Feldgröße)
export function colorLevelParams(level) {
  const colors = level <= 5 ? 2 : level <= 20 ? 3 : level % 3 === 0 ? 4 : 3;
  if (level <= 4) return { rows: 15, cols: 15, colors };
  if (level <= 10) return { rows: 20, cols: 20, colors };
  if (level <= 17) return { rows: 25, cols: 25, colors };
  if (level <= 25) return { rows: 30, cols: 25, colors };
  return { rows: level % 2 ? 35 : 30, cols: 30, colors };
}

// Farbiges Muster: Füllung wie beim Bilderrätsel, Farben in Flecken
// (Mehrheit der Nachbarn), meist spiegelsymmetrisch.
function colorPattern(R, K, colors, rnd) {
  const q = rnd();
  const mirror = q < 0.8 ? (q < 0.4 ? 2 : 1) : 0;
  const sym = (px) => {
    if (mirror) for (let r = 0; r < R; r++) for (let c = 0; c < K >> 1; c++) px[r * K + K - 1 - c] = px[r * K + c];
    if (mirror === 2) for (let r = 0; r < R >> 1; r++) for (let c = 0; c < K; c++) px[(R - 1 - r) * K + c] = px[r * K + c];
  };
  const neigh = (px, r, c, fn) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < R && cc < K) fn(px[rr * K + cc]);
    }
  };
  for (;;) {
    // Füllung
    let fill = new Uint8Array(R * K);
    for (let i = 0; i < R * K; i++) fill[i] = rnd() < 0.58 ? 1 : 0;
    sym(fill);
    const nf = new Uint8Array(R * K);
    for (let r = 0; r < R; r++) for (let c = 0; c < K; c++) {
      let s = 0; neigh(fill, r, c, (v) => (s += v));
      nf[r * K + c] = s >= 6 ? 1 : s <= 3 ? 0 : fill[r * K + c];
    }
    fill = nf; sym(fill);
    // Farben: Zufall, dann einmal Mehrheit der Nachbarn → Flecken
    let col = new Uint8Array(R * K);
    for (let i = 0; i < R * K; i++) col[i] = 1 + Math.floor(rnd() * colors);
    sym(col);
    for (let pass = 0; pass < 1; pass++) {
      const nc = new Uint8Array(R * K);
      for (let r = 0; r < R; r++) for (let c = 0; c < K; c++) {
        const cnt = new Array(colors + 1).fill(0);
        neigh(col, r, c, (v) => cnt[v]++);
        let best = col[r * K + c];
        for (let v = 1; v <= colors; v++) if (cnt[v] > cnt[best]) best = v;
        nc[r * K + c] = best;
      }
      col = nc; sym(col);
    }
    const px = new Uint8Array(R * K);
    const used = new Set();
    for (let i = 0; i < R * K; i++) if (fill[i]) { px[i] = col[i]; used.add(col[i]); }
    const share = px.reduce((a, v) => a + (v ? 1 : 0), 0) / (R * K);
    if (share >= 0.42 && share <= 0.7 && used.size === colors) return { px, mirror };
  }
}

// Unbestimmte Felder (samt Spiegelfeldern) zufällig neu setzen, bis der Löser durchkommt
function makeSolvable(R, K, colors, px, mirror, rnd) {
  const maxSteps = Math.max(40, (R * K) >> 2);
  for (let step = 0; step < maxSteps; step++) {
    const p = colorPuzzleFrom(R, K, px, colors);
    const { grid, solved, passes } = lineSolveColor(p.rowClues, p.colClues, colors);
    if (solved) return { p, passes };
    const open = [];
    for (let i = 0; i < R * K; i++) if (!single(grid[i])) open.push(i);
    const flips = Math.max(1, Math.floor(open.length / 25));
    for (let f = 0; f < flips; f++) {
      const i = open[Math.floor(rnd() * open.length)];
      // einen anderen, laut Löser noch möglichen Wert wählen
      const opts = [];
      for (let v = 0; v <= colors; v++) if (grid[i] & (1 << v) && v !== px[i]) opts.push(v);
      const v = opts.length ? opts[Math.floor(rnd() * opts.length)] : 0;
      const r = Math.floor(i / K), c = i % K;
      px[i] = v;
      if (mirror) px[r * K + (K - 1 - c)] = v;
      if (mirror === 2) { px[(R - 1 - r) * K + c] = v; px[(R - 1 - r) * K + (K - 1 - c)] = v; }
    }
  }
  return null;
}

const CANDIDATES = 20; // aus so vielen lösbaren Mustern wird das schwierigste genommen

export function generateColorLevel(level) {
  const { rows: R, cols: K, colors } = colorLevelParams(level);
  const rnd = mulberry32(level * 7919 + 4243);
  let best = null;
  for (let n = 0; n < CANDIDATES || !best; n++) {
    const { px, mirror } = colorPattern(R, K, colors, rnd);
    const res = makeSolvable(R, K, colors, px, mirror, rnd);
    if (res && (!best || res.passes > best.passes)) best = res;
  }
  return { ...best.p, level };
}
