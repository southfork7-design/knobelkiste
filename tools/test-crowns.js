// Prüft: jedes Kronenfeld-Level hat genau eine Lösung und ist ohne Raten lösbar.
// Aufruf: node tools/test-crowns.js
import { generateLevel, countSolutions, logicSolve } from '../js/games/crowns/generator.js';
let bad = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= 100; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const ok = countSolutions(L.n, L.reg) === 1 && logicSolve(L.n, L.reg) >= 0;
  if (!ok) bad++;
  if ([1, 4, 11, 23, 41, 71, 100].includes(lvl))
    console.log(`Level ${lvl}: ${L.n}x${L.n}, Versuche ${L.attempts}, Logik-Durchgänge ${L.passes}, ${Date.now() - t}ms`);
}
console.log(`Fehlerhafte Level 1–100: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
