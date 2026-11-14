// Prüft Schraubwerk: jedes Level lösbar (Lösung wird nachgespielt).
// Aufruf: node tools/test-screws.js [bisLevel]
import { generateLevel } from '../js/games/screws/generator.js';
import { initialState, applyMove, legalMoves, isWon, screwBlocked } from '../js/games/screws/model.js';

const upTo = Number(process.argv[2] || 30);
let bad = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  if (!L.solution) { bad++; console.log(`Level ${lvl}: KEIN Level gefunden`); continue; }
  let s = initialState(L);
  const covered = s.screws.filter((_, i) => screwBlocked(L, s, i)).length;
  let ok = true;
  for (const m of L.solution) {
    if (!legalMoves(L, s).some(([i, h]) => i === m[0] && h === m[1])) { ok = false; break; }
    s = applyMove(L, s, m);
  }
  ok = ok && isWon(s);
  if (!ok) bad++;
  console.log(`Level ${lvl}: ${L.plates.length} Teile, ${L.screws.length} Schrauben, ${L.holes.length} Löcher, verdeckt ${covered}, Lösung ${L.solution.length} Züge, Versuche ${L.attempts}, ${Date.now() - t}ms${ok ? '' : '  FEHLER'}`);
}
console.log(`Fehlerhafte Level: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
