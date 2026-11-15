// Prüft: jedes erzeugte 3D-Level ist lösbar. Aufruf: node tools/test-arrows3d.js
import { generateLevel, solveRounds, makeBox } from '../js/games/arrows3d/generator.js';
// Topologie-Check: Schritt hin und zurück muss zum Ausgangsfeld führen
function topo(box) {
  let err = 0;
  box.cells.forEach((_, c) => box.tangents(c).forEach((d) => {
    const f = box.step(c, d);
    if (f.c === undefined) err++;
    else if (box.step(f.c, f.d ^ 1).c !== c) err++;
  }));
  return err;
}
let topoErr = topo(makeBox(3, 4, 5));
console.log(`Topologie 3x4x5: Fehler ${topoErr}`);
let bad = 0, shapes = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= 120; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const r = solveRounds(L);
  if (!r.solvable) bad++;
  if (!L.box.isBox) { shapes++; const e = topo(L.box); if (e) console.log(`Level ${lvl}: Topologie-Fehler ${e}`); topoErr += e; }
  if ([1, 2, 3, 6, 12, 30, 33, 60, 120].includes(lvl)) {
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0);
    const kind = L.box.isBox ? L.box.dims.join('x') : `Gebilde ${L.box.dims.join('x')}`;
    console.log(`Level ${lvl}: ${kind}, ${L.box.cells.length} Felder, ${L.arrows.length} Pfeile, Füllung ${(100 * filled / L.box.cells.length).toFixed(0)}%, anfangs frei ${r.firstRound}, Runden ${r.rounds}, ${Date.now() - t}ms`);
  }
}
console.log(`Blockgebilde: ${shapes}, Topologie-Fehler gesamt: ${topoErr}`);
console.log(`Unlösbare Level 1–120: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad || topoErr ? 1 : 0);
