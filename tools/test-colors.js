// Prüft Farbräumer: jedes Level lösbar (Lösung wird mit den Spielregeln nachgespielt),
// außerdem, ob der Tipp-Löser vom Start aus eine Lösung findet.
// Aufruf: node tools/test-colors.js [bisLevel] [abLevel]
import { generateLevel, checkSolution } from '../js/games/colors/generator.js';
import { initialState, solve } from '../js/games/colors/model.js';

const upTo = Number(process.argv[2] || 30);
const from = Number(process.argv[3] || 1);
let bad = 0, noHint = 0;
const t0 = Date.now();
for (let lvl = from; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const ok = !!L.solution && checkSolution(L);
  if (!ok) bad++;
  const ms = Date.now() - t;
  const t2 = Date.now();
  const h = solve(L, initialState(L), 4000);
  if (!h || !h.path) noHint++;
  const figs = L.board.filter((v) => v >= 0).length + L.gates.reduce((a, g) => a + g.queue.length, 0);
  console.log(`Level ${lvl}: ${L.cols}x${L.rows}, ${figs} Figuren, ${L.colors} Farben, ${L.stacks.flat().length} Behälter in ${L.stacks.length} Stapeln, Tore ${L.gates.length}, Ablage ${L.bufferSize}, Zufallsspiel gewinnt ${Math.round(L.randomWin * 100)}%, ${ms}ms, Löser ${h ? (h.path ? 'ok' : 'unlösbar?!') : 'Grenze'} ${Date.now() - t2}ms${ok ? '' : '  FEHLER'}`);
}
console.log(`Fehlerhafte Level: ${bad}, Löser ohne Ergebnis: ${noHint}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
