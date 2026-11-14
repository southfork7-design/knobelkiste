// Prüft Farbräumer: jedes Level lösbar (Lösung wird nachgespielt).
// Aufruf: node tools/test-colors.js [bisLevel]
import { generateLevel } from '../js/games/colors/generator.js';
import { initialState, applyMove, legalMoves, isWon } from '../js/games/colors/model.js';

const upTo = Number(process.argv[2] || 30);
let bad = 0;
const t0 = Date.now();
for (let lvl = 1; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  if (!L.solution) { bad++; console.log(`Level ${lvl}: KEIN Level gefunden`); continue; }
  let s = initialState(L);
  let ok = true;
  for (const m of L.solution) {
    if (!legalMoves(L, s).includes(m)) { ok = false; break; }
    s = applyMove(L, s, m).state;
  }
  ok = ok && isWon(L, s);
  if (!ok) bad++;
  const figs = L.board.filter((v) => v >= 0).length + L.gates.reduce((a, g) => a + g.queue.length, 0);
  console.log(`Level ${lvl}: ${L.cols}x${L.rows}, ${figs} Figuren, ${L.stacks.flat().length} Behälter, Tore ${L.gates.length}, Ablage ${L.bufferSize}, Zufallsspiel gewinnt ${Math.round(L.randomWin * 100)}%, ${Date.now() - t}ms${ok ? '' : '  FEHLER'}`);
}
console.log(`Fehlerhafte Level: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
