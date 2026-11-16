// Generator für Bilderrätsel (Nonogramme).
// Ein Rätsel wird nur verwendet, wenn es sich Zeile für Zeile rein logisch
// lösen lässt (dann ist die Lösung auch eindeutig).
//
// Zellwerte im Löser: 0 unbekannt, 1 gefüllt, 2 leer.

import { mulberry32 } from '../../rng.js';
import { MOTIFS_10, MOTIFS_15 } from './motifs.js';

export function cluesOf(line) {
  const out = [];
  let run = 0;
  for (const v of line) {
    if (v) run++;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
}

// Löst eine einzelne Zeile so weit wie möglich.
// Gibt die neue Zeile zurück oder null bei Widerspruch.
export function solveLine(line, clues) {
  const L = line.length, k = clues.length;
  // Mit einem zusätzlichen, immer leeren Feld am Ende rechnen
  const cell = (i) => (i < L ? line[i] : 2);
  const canEmpty = (i) => cell(i) !== 1;
  // filledBlock[i] = Anzahl Felder in [0,i), die sicher leer sind (für Bereichsprüfung)
  const emptyPrefix = new Int32Array(L + 2);
  for (let i = 0; i <= L; i++) emptyPrefix[i + 1] = emptyPrefix[i] + (cell(i) === 2 ? 1 : 0);
  const canFill = (a, b) => b <= L && emptyPrefix[b] - emptyPrefix[a] === 0;

  // f[i][j]: Felder [0,i) belegbar mit den ersten j Blöcken (i ist Blockanfang oder Lücke)
  const N = L + 1;
  const f = Array.from({ length: N + 1 }, () => new Uint8Array(k + 1));
  f[0][0] = 1;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= k; j++) {
      if (!f[i][j]) continue;
      if (canEmpty(i)) f[i + 1][j] = 1;
      if (j < k) {
        const b = clues[j];
        if (canFill(i, i + b) && canEmpty(i + b) && i + b + 1 <= N) f[i + b + 1][j + 1] = 1;
      }
    }
  }
  if (!f[N][k]) return null;
  // g[i][j]: Felder [i,N) belegbar mit den Blöcken j..k-1
  const g = Array.from({ length: N + 2 }, () => new Uint8Array(k + 1));
  g[N][k] = 1;
  for (let i = N - 1; i >= 0; i--) {
    for (let j = k; j >= 0; j--) {
      let ok = canEmpty(i) && g[i + 1][j];
      if (!ok && j < k) {
        const b = clues[j];
        ok = canFill(i, i + b) && canEmpty(i + b) && i + b + 1 <= N && g[i + b + 1][j + 1];
      }
      g[i][j] = ok ? 1 : 0;
    }
  }
  const mayEmpty = new Uint8Array(L), mayFill = new Uint8Array(L);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j <= k; j++) {
      if (!f[i][j]) continue;
      if (canEmpty(i) && g[i + 1][j] && i < L) mayEmpty[i] = 1;
      if (j < k) {
        const b = clues[j];
        if (canFill(i, i + b) && canEmpty(i + b) && i + b + 1 <= N && g[i + b + 1][j + 1]) {
          for (let c = i; c < i + b; c++) mayFill[c] = 1;
          if (i + b < L) mayEmpty[i + b] = 1;
        }
      }
    }
  }
  const out = line.slice();
  for (let i = 0; i < L; i++) {
    if (mayFill[i] && !mayEmpty[i]) out[i] = 1;
    else if (mayEmpty[i] && !mayFill[i]) out[i] = 2;
    else if (!mayFill[i] && !mayEmpty[i]) return null;
  }
  return out;
}

// Löst das ganze Rätsel mit Zeilenlogik. Liefert { grid, solved, passes }.
// Es werden nur Zeilen/Spalten neu betrachtet, in denen sich etwas geändert hat.
export function lineSolve(rowClues, colClues, start = null) {
  const R = rowClues.length, Cn = colClues.length;
  const grid = start ? start.slice() : new Uint8Array(R * Cn);
  const rowDirty = new Uint8Array(R).fill(1), colDirty = new Uint8Array(Cn).fill(1);
  let changed = true, passes = 0;
  const rowLine = new Array(Cn), colLine = new Array(R);
  while (changed) {
    changed = false;
    passes++;
    for (let r = 0; r < R; r++) {
      if (!rowDirty[r]) continue;
      rowDirty[r] = 0;
      for (let c = 0; c < Cn; c++) rowLine[c] = grid[r * Cn + c];
      const res = solveLine(rowLine, rowClues[r]);
      if (!res) return { grid, solved: false, contradiction: true, passes };
      for (let c = 0; c < Cn; c++) if (res[c] !== rowLine[c]) { grid[r * Cn + c] = res[c]; colDirty[c] = 1; changed = true; }
    }
    for (let c = 0; c < Cn; c++) {
      if (!colDirty[c]) continue;
      colDirty[c] = 0;
      for (let r = 0; r < R; r++) colLine[r] = grid[r * Cn + c];
      const res = solveLine(colLine, colClues[c]);
      if (!res) return { grid, solved: false, contradiction: true, passes };
      for (let r = 0; r < R; r++) if (res[r] !== colLine[r]) { grid[r * Cn + c] = res[r]; rowDirty[r] = 1; changed = true; }
    }
  }
  return { grid, solved: grid.every((v) => v !== 0), passes };
}

export function puzzleFrom(rows, cols, pixels, name = null) {
  const rowClues = [], colClues = [];
  for (let r = 0; r < rows; r++) rowClues.push(cluesOf(pixels.slice(r * cols, (r + 1) * cols)));
  for (let c = 0; c < cols; c++) colClues.push(cluesOf(Array.from({ length: rows }, (_, r) => pixels[r * cols + c])));
  return { rows, cols, pixels: Array.from(pixels), rowClues, colClues, name };
}

export const motifPixels = (m) => m.rows.join('').split('').map((ch) => (ch === '#' ? 1 : 0));

// Erzeugtes Muster R×K (Zeilen × Spalten), meist spiegelsymmetrisch
// (links/rechts oder zusätzlich oben/unten wie ein Teppichmuster).
// Nur ein Glättungsschritt → kleinteilige Formen mit vielen Blöcken.
function randomPattern(R, K, rnd) {
  for (;;) {
    let px = new Uint8Array(R * K);
    const q = rnd();
    const mirror = q < 0.8 ? (q < 0.4 ? 2 : 1) : 0; // 2 = auch oben/unten
    const p = 0.5 + rnd() * 0.06;
    for (let i = 0; i < R * K; i++) px[i] = rnd() < p ? 1 : 0;
    const symmetrize = () => {
      if (!mirror) return;
      for (let r = 0; r < R; r++)
        for (let c = 0; c < Math.floor(K / 2); c++) px[r * K + (K - 1 - c)] = px[r * K + c];
      if (mirror === 2)
        for (let r = 0; r < Math.floor(R / 2); r++)
          for (let c = 0; c < K; c++) px[(R - 1 - r) * K + c] = px[r * K + c];
    };
    symmetrize();
    const nx = new Uint8Array(R * K);
    for (let r = 0; r < R; r++)
      for (let c = 0; c < K; c++) {
        let s = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < R && cc < K) s += px[rr * K + cc];
          }
        nx[r * K + c] = s >= 6 ? 1 : s <= 3 ? 0 : px[r * K + c];
      }
    px = nx;
    symmetrize();
    const fill = px.reduce((a, b) => a + b, 0) / (R * K);
    if (fill >= 0.4 && fill <= 0.62) return { px, mirror };
  }
}

// Macht ein Muster logisch lösbar: Felder, die der Löser nicht bestimmen
// kann, werden (samt Spiegelfeld) umgeschaltet, bis alles aufgeht.
// Liefert das Rätsel und die Zahl der Löserrunden (Maß für die Schwierigkeit).
function makeSolvable(R, K, px, mirror, rnd) {
  const maxSteps = Math.max(40, (R * K) >> 2);
  for (let step = 0; step < maxSteps; step++) {
    const p = puzzleFrom(R, K, px);
    const { grid, solved, passes } = lineSolve(p.rowClues, p.colClues);
    if (solved) return { p, passes };
    const open = [];
    for (let i = 0; i < R * K; i++) if (grid[i] === 0) open.push(i);
    // bei vielen offenen Feldern gleich mehrere umschalten (schneller)
    const flips = Math.max(1, Math.floor(open.length / 25));
    for (let f = 0; f < flips; f++) {
      const i = open[Math.floor(rnd() * open.length)];
      const r = Math.floor(i / K), c = i % K;
      px[i] ^= 1;
      if (mirror) px[r * K + (K - 1 - c)] = px[i];
      if (mirror === 2) { px[(R - 1 - r) * K + c] = px[i]; px[(R - 1 - r) * K + (K - 1 - c)] = px[i]; }
    }
  }
  return null;
}

// Feldgröße (rows × cols) je Level; Motive nur in den ersten Leveln.
export function levelParams(level) {
  if (level <= 2) return { rows: 10, cols: 10, motif: MOTIFS_10[level - 1] };
  if (level <= 6) return { rows: 15, cols: 15, motif: level % 2 ? MOTIFS_15[(level - 3) / 2] : null };
  if (level <= 10) return { rows: 20, cols: 20, motif: null };
  if (level <= 15) return { rows: 25, cols: 25, motif: null };
  if (level <= 20) return { rows: 30, cols: 25, motif: null };
  if (level <= 30) return { rows: 35, cols: 30, motif: null };
  return { rows: level % 2 ? 40 : 35, cols: 30, motif: null };
}

const CANDIDATES = 6; // aus so vielen lösbaren Mustern wird das schwierigste genommen

export function generateLevel(level) {
  const { rows: R, cols: K, motif } = levelParams(level);
  if (motif) {
    const p = puzzleFrom(R, K, motifPixels(motif), motif.name);
    if (lineSolve(p.rowClues, p.colClues).solved) return { ...p, level };
  }
  const rnd = mulberry32(level * 5167 + 811);
  let best = null;
  for (let n = 0; n < CANDIDATES || !best; n++) {
    const { px, mirror } = randomPattern(R, K, rnd);
    const res = makeSolvable(R, K, px, mirror, rnd);
    if (res && (!best || res.passes > best.passes)) best = res;
  }
  return { ...best.p, level };
}
