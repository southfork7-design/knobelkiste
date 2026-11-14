// Prüft: jedes Gleisbau-Level hat genau eine Lösung. Aufruf: node tools/test-tracks.js
import { generateLevel, solve } from '../js/games/tracks/generator.js';
let bad = 0;
const t0 = Date.now();
const upTo = Number(process.argv[2] || 80);
for (let lvl = 1; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const { solutions } = solve(L.n, L.rowC, L.colC, L.start, L.startOut, L.end, L.endOut, L.given, 2);
  const ok = solutions.length === 1 && solutions[0].every((m, i) => m === L.solution[i]);
  if (!ok) bad++;
  const ms = Date.now() - t;
  if ([1, 4, 9, 17, 31, 51, 80].includes(lvl) || ms > 1500) {
    const track = L.solution.filter((m) => m).length;
    const givens = L.given.filter((g) => g >= 0).length;
    console.log(`Level ${lvl}: ${L.n}x${L.n}, Gleise ${track}, Vorgaben ${givens}, Versuche ${L.attempts}, ${ms}ms`);
  }
}
console.log(`Fehlerhafte Level 1–${upTo}: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
