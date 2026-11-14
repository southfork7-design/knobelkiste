// Prüft: jedes erzeugte 3D-Level ist lösbar. Aufruf: node tools/test-arrows3d.js
import { generateLevel, solveRounds, makeBox } from '../js/games/arrows3d/generator.js';
// Topologie-Check: Schritt hin und zurück muss zum Ausgangsfeld führen
const box = makeBox(3, 4, 5);
let topoErr = 0;
box.cells.forEach((_, c) => box.tangents(c).forEach((d) => {
  const f = box.step(c, d);
  if (f.c === undefined) topoErr++;
  else if (box.step(f.c, f.d ^ 1).c !== c) topoErr++;
}));
console.log(`Topologie 3x4x5: ${box.cells.length} Felder, Fehler ${topoErr}`);
let bad = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= 120; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const r = solveRounds(L);
  if (!r.solvable) bad++;
  if ([1, 2, 3, 6, 12, 24, 60, 120].includes(lvl)) {
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0);
    console.log(`Level ${lvl}: ${L.box.dims.join('x')}, ${L.arrows.length} Pfeile, Füllung ${(100 * filled / L.box.cells.length).toFixed(0)}%, anfangs frei ${r.firstRound}, Runden ${r.rounds}, ${Date.now() - t}ms`);
  }
}
console.log(`Unlösbare Level 1–120: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad || topoErr ? 1 : 0);
