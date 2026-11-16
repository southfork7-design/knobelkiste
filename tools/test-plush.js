// Prüft Kuschelfracht: jedes Level lösbar (die beim Bauen entstandene Lösung wird mit den
// Spielregeln nachgespielt), außerdem ob der Tipp-Löser vom Start aus eine Lösung findet
// und wie oft ein zufälliger Spieler (nimmt irgendeinen Zug, bei dem Tiere einspringen) durchkommt.
// Aufruf: node tools/test-plush.js [bisLevel] [abLevel]
import { generateLevel, checkPlan } from '../js/games/plush/generator.js';
import { initialState, solve, rollout, hopeless, applyMove } from '../js/games/plush/model.js';
import { mulberry32 } from '../js/rng.js';

const upTo = Number(process.argv[2] || 30);
const from = Number(process.argv[3] || 1);
let bad = 0, noHint = 0;
const t0 = Date.now();
for (let lvl = from; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const ms = Date.now() - t;
  // Lösung nachspielen; auf dem Lösungsweg darf nie eine Sackgasse gemeldet werden
  let ok = checkPlan(L), st = initialState(L);
  for (const m of L.plan) { if (hopeless(L, st)) { ok = false; console.log('  Sackgasse fälschlich gemeldet'); break; } st = applyMove(L, st, m).state; }
  if (!ok) bad++;
  const t2 = Date.now();
  const h = solve(L, initialState(L), { tries: 30, ms: 8000 });
  if (!h) noHint++;
  const tHint = Date.now() - t2;
  // zufälliger Spieler
  let wins = 0;
  const R = 10, rnd = mulberry32(lvl);
  for (let i = 0; i < R; i++) if (rollout(L, initialState(L), { rnd, smart: false, maxMoves: 4 * L.plan.length + 40 })) wins++;
  const colored = L.pieces.filter((p) => p.color >= 0);
  const plush = L.plush.filter((v) => v >= 0).length + L.rooms.reduce((a, r) => a + r.queue.length, 0);
  const cells = L.cols * L.rows - L.wall.reduce((a, v) => a + v, 0);
  const used = L.pieces.reduce((a, p) => a + p.cells.length, 0) + L.plush.filter((v) => v >= 0).length;
  const extra = L.plan.length - colored.length;
  console.log(`Level ${lvl}: ${L.cols}x${L.rows}, ${colored.length} Formen, ${plush} Tiere, ${L.colors} Farben, grau ${L.pieces.length - colored.length}, `
    + `Räume ${L.rooms.length} (${L.rooms.map((r) => r.queue.length).join("/")}), Schlösser ${L.pieces.filter((p) => p.lock).length}, Richtung ${L.pieces.filter((p) => p.axis).length}, `
    + `gefüllt ${Math.round(used / cells * 100)}%, Lösung ${L.plan.length} Züge (${extra} Beiseiteschieben), ${ms}ms, `
    + `Löser ${h ? h.length + ' Züge' : 'nichts'} ${tHint}ms, Zufall ${wins}/${R}${ok ? '' : '  FEHLER'}`);
}
console.log(`Fehlerhafte Level: ${bad}, Löser ohne Ergebnis: ${noHint}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
