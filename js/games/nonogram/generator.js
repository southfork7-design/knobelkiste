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
export function lineSolve(rowClues, colClues, start = null) {
  const R = rowClues.length, Cn = colClues.length;
  const grid = start ? start.slice() : new Uint8Array(R * Cn);
  let changed = true, passes = 0;
  while (changed) {
    changed = false;
    passes++;
    for (let r = 0; r < R; r++) {
      const line = Array.from({ length: Cn }, (_, c) => grid[r * Cn + c]);
      const res = solveLine(line, rowClues[r]);
      if (!res) return { grid, solved: false, contradiction: true, passes };
      for (let c = 0; c < Cn; c++) if (res[c] !== line[c]) { grid[r * Cn + c] = res[c]; changed = true; }
    }
    for (let c = 0; c < Cn; c++) {
      const line = Array.from({ length: R }, (_, r) => grid[r * Cn + c]);
      const res = solveLine(line, colClues[c]);
      if (!res) return { grid, solved: false, contradiction: true, passes };
      for (let r = 0; r < R; r++) if (res[r] !== line[r]) { grid[r * Cn + c] = res[r]; changed = true; }
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

// Erzeugtes, symmetrisches Muster (weiche Formen durch Glättung)
function randomPattern(n, rnd) {
  for (;;) {
    let px = new Uint8Array(n * n);
    const mirror = rnd() < 0.75;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) px[r * n + c] = rnd() < 0.52 ? 1 : 0;
    const smooth = () => {
      const nx = new Uint8Array(n * n);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          let s = 0;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr, cc = c + dc;
              if (rr >= 0 && cc >= 0 && rr < n && cc < n) s += px[rr * n + cc];
            }
          nx[r * n + c] = s >= 5 ? 1 : s <= 3 ? 0 : px[r * n + c];
        }
      px = nx;
    };
    const symmetrize = () => {
      if (!mirror) return;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < Math.floor(n / 2); c++) px[r * n + (n - 1 - c)] = px[r * n + c];
    };
    symmetrize();
    smooth();
    if (n > 6) smooth();
    symmetrize();
    const fill = px.reduce((a, b) => a + b, 0) / (n * n);
    if (fill >= 0.35 && fill <= 0.7) return { px, mirror };
  }
}

// Macht ein Muster logisch lösbar: Felder, die der Löser nicht bestimmen
// kann, werden (samt Spiegelfeld) umgeschaltet, bis alles aufgeht.
function makeSolvable(n, px, mirror, rnd, maxSteps = 40) {
  for (let step = 0; step < maxSteps; step++) {
    const p = puzzleFrom(n, n, px);
    const { grid, solved } = lineSolve(p.rowClues, p.colClues);
    if (solved) return p;
    const open = [];
    for (let i = 0; i < n * n; i++) if (grid[i] === 0) open.push(i);
    const i = open[Math.floor(rnd() * open.length)];
    const r = Math.floor(i / n), c = i % n;
    px[i] ^= 1;
    if (mirror) px[r * n + (n - 1 - c)] = px[i];
  }
  return null;
}

export function levelParams(level) {
  if (level <= 3) return { n: 5, motif: null };
  if (level <= 14) return { n: 10, motif: level % 2 === 0 ? MOTIFS_10[(level - 4) / 2] ?? null : null };
  // 15×15: jedes dritte Level ein Motiv (solange vorhanden)
  const idx = (level - 15) / 3;
  return { n: 15, motif: Number.isInteger(idx) ? MOTIFS_15[idx] ?? null : null };
}

export function generateLevel(level) {
  const { n, motif } = levelParams(level);
  if (motif) {
    const p = puzzleFrom(n, n, motifPixels(motif), motif.name);
    if (lineSolve(p.rowClues, p.colClues).solved) return { ...p, level };
  }
  const rnd = mulberry32(level * 5167 + 811);
  for (;;) {
    const { px, mirror } = randomPattern(n, rnd);
    const p = makeSolvable(n, px, mirror, rnd);
    if (p) return { ...p, level };
  }
}
