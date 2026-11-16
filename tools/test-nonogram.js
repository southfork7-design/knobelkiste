// Prüft Bilderrätsel: alle Motive und erzeugten Level rein logisch lösbar.
// Aufruf: node tools/test-nonogram.js [bisLevel]   (Standard 80)
import { MOTIFS_10, MOTIFS_15 } from '../js/games/nonogram/motifs.js';
import { puzzleFrom, motifPixels, lineSolve, generateLevel } from '../js/games/nonogram/generator.js';

let bad = 0;
for (const [n, list] of [[10, MOTIFS_10], [15, MOTIFS_15]]) {
  for (const m of list) {
    if (m.rows.length !== n || m.rows.some((r) => r.length !== n)) {
      console.log(`  Motiv „${m.name}“: falsche Größe`); bad++; continue;
    }
    const p = puzzleFrom(n, n, motifPixels(m), m.name);
    const { solved, grid } = lineSolve(p.rowClues, p.colClues);
    const open = grid.filter((v) => v === 0).length;
    console.log(`${solved ? 'ok  ' : 'NEIN'} ${n}x${n} ${m.name}${solved ? '' : ` (${open} Felder offen)`}`);
  }
}
const t0 = Date.now();
let slow = 0;
const MAX = Number(process.argv[2]) || 80;
for (let lvl = 1; lvl <= MAX; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const ms = Date.now() - t;
  if (ms > 1000) slow++;
  const ok = lineSolve(L.rowClues, L.colClues).solved &&
    lineSolve(L.rowClues, L.colClues).grid.every((v, i) => (v === 1) === (L.pixels[i] === 1));
  if (!ok) bad++;
  if ([1, 3, 4, 7, 11, 16, 21, 31, 32, MAX].includes(lvl)) console.log(`Level ${lvl}: ${L.rows}x${L.cols} ${L.name ?? 'Muster'}, ${lineSolve(L.rowClues, L.colClues).passes} Löserrunden, ${ms}ms`);
}
console.log(`Fehlerhafte Level 1–${MAX}: ${bad}, langsame (>1000ms): ${slow}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
