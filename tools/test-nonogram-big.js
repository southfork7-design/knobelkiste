// Prüft Großbild: jedes der vier Teile ist für sich rein logisch lösbar
// (damit eindeutig), und das Erzeugen ist schnell genug.
// Aufruf: node tools/test-nonogram-big.js [bisLevel]   (Standard 40)
import { generateBigLevel, lineSolve } from '../js/games/nonogram/generator.js';

const MAX = Number(process.argv[2]) || 40;
let bad = 0, slow = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= MAX; lvl++) {
  const t = Date.now();
  const B = generateBigLevel(lvl);
  const ms = Date.now() - t;
  if (ms > 1500) slow++;
  const passes = [];
  B.parts.forEach((P, q) => {
    const r = lineSolve(P.rowClues, P.colClues);
    const ok = P.rows === B.tile && P.cols === B.tile && r.solved && r.grid.every((v, i) => (v === 1) === !!P.pixels[i]);
    if (!ok) { bad++; console.log(`Level ${lvl}, Teil ${q + 1}: NICHT eindeutig lösbar`); }
    passes.push(r.passes);
  });
  if ([1, 3, 7, 15, MAX].includes(lvl)) console.log(`Level ${lvl}: ${B.size}×${B.size} (4× ${B.tile}×${B.tile}), Löserrunden ${passes.join('/')}, ${ms}ms`);
}
console.log(`Fehlerhafte Teile in Level 1–${MAX}: ${bad}, langsame (>1500ms): ${slow}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
