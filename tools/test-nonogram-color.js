// Prüft Farbbilder: Zeilenlöser gegen vollständige Suche, dann alle Level
// rein logisch lösbar (damit eindeutig) und schnell genug.
// Aufruf: node tools/test-nonogram-color.js [bisLevel]   (Standard 60)
import { solveLineColor, colorCluesOf, lineSolveColor, generateColorLevel } from '../js/games/nonogram/color.js';
import { mulberry32 } from '../js/rng.js';

let bad = 0;

// 1. Zeilenlöser gegen vollständige Suche (kurze Zeilen, 3 Farben)
const rnd = mulberry32(42);
const k = 3, full = (1 << (k + 1)) - 1;
let lineErr = 0;
for (let t = 0; t < 3000; t++) {
  const L = 3 + Math.floor(rnd() * 5);
  const sol = Array.from({ length: L }, () => (rnd() < 0.35 ? 0 : 1 + Math.floor(rnd() * k)));
  const clues = colorCluesOf(sol);
  // teilweises Wissen: manche Felder eingeschränkt (immer mit der Lösung verträglich)
  const line = sol.map((v) => (rnd() < 0.3 ? (1 << v) | (rnd() < 0.5 ? 1 << Math.floor(rnd() * (k + 1)) : 0) : full));
  // vollständige Suche
  const may = new Array(L).fill(0);
  const total = (k + 1) ** L;
  for (let x = 0; x < total; x++) {
    let y = x; const cand = [];
    for (let i = 0; i < L; i++) { cand.push(y % (k + 1)); y = Math.floor(y / (k + 1)); }
    if (cand.some((v, i) => !(line[i] & (1 << v)))) continue;
    const cc = colorCluesOf(cand);
    if (cc.length !== clues.length || cc.some((b, i) => b.n !== clues[i].n || b.c !== clues[i].c)) continue;
    cand.forEach((v, i) => (may[i] |= 1 << v));
  }
  const res = solveLineColor(line, clues);
  if (!res || res.some((m, i) => m !== may[i])) lineErr++;
}
console.log(`Zeilenlöser gegen vollständige Suche: ${lineErr} Abweichungen in 3000 Zeilen`);
bad += lineErr;

// 2. Level
const MAX = Number(process.argv[2]) || 60;
const t0 = Date.now();
let slow = 0;
for (let lvl = 1; lvl <= MAX; lvl++) {
  const t = Date.now();
  const P = generateColorLevel(lvl);
  const ms = Date.now() - t;
  if (ms > 1500) slow++;
  const r = lineSolveColor(P.rowClues, P.colClues, P.colors);
  const ok = r.solved && r.grid.every((m, i) => m === 1 << P.pixels[i]);
  if (!ok) { bad++; console.log(`Level ${lvl}: NICHT eindeutig lösbar`); }
  if ([1, 5, 11, 18, 21, 26, 27, MAX].includes(lvl))
    console.log(`Level ${lvl}: ${P.rows}x${P.cols}, ${P.colors} Farben, ${r.passes} Löserrunden, ${ms}ms`);
}
console.log(`Fehlerhafte Level 1–${MAX}: ${bad}, langsame (>1500ms): ${slow}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
