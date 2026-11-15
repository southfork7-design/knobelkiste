// Prüft: jedes erzeugte Level ist lösbar. Aufruf: node tools/test-arrows.js
import { generateLevel, solveRounds } from '../js/games/arrows/generator.js';
let bad = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= 200; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const r = solveRounds(L);
  if (!r.solvable) bad++;
  if ([1, 2, 3, 6, 9, 10, 20, 30, 40, 80, 120, 199, 200].includes(lvl)) {
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0);
    console.log(`Level ${lvl}: ${L.shape || "Rechteck"} ${L.w}x${L.h}, ${L.arrows.length} Pfeile, Füllung ${(100 * filled / L.cellCount).toFixed(0)}%, anfangs frei ${r.firstRound}, Runden ${r.rounds}, ${Date.now() - t}ms`);
  }
}
console.log(`Unlösbare Level 1–200: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
