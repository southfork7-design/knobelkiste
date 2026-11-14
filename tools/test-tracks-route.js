// Prüft Großstrecken: jedes Feld eindeutig lösbar, Übergänge passen zusammen.
// Aufruf: node tools/test-tracks-route.js
import { generateRoute, solve, DR, DC } from '../js/games/tracks/generator.js';
let bad = 0;
const t0 = Date.now();
for (let route = 1; route <= 12; route++) {
  const t = Date.now();
  const R = generateRoute(route);
  const n = R.n;
  R.panels.forEach((p, k) => {
    const { solutions } = solve(n, p.rowC, p.colC, p.start, p.startOut, p.end, p.endOut, p.given, 2);
    if (solutions.length !== 1) { bad++; console.log(`  Strecke ${route} Feld ${k + 1}: nicht eindeutig`); }
    const q = R.panels[k + 1];
    if (q) {
      // Ausgang von p und Eingang von q müssen in Kartenkoordinaten aneinanderstoßen
      const gp = (pp, i) => [pp.row * n + Math.floor(i / n), pp.col * n + (i % n)];
      const [ar, ac] = gp(p, p.end), [br, bc] = gp(q, q.start);
      if (ar + DR[p.endOut] !== br || ac + DC[p.endOut] !== bc || q.startOut !== (p.endOut + 2) % 4) {
        bad++; console.log(`  Strecke ${route}: Übergang ${k + 1}→${k + 2} passt nicht`);
      }
    }
  });
  console.log(`Strecke ${route}: ${R.count} Felder à ${n}x${n} (${R.layout.rows}x${R.layout.cols}), ${Date.now() - t}ms`);
}
console.log(`Fehler: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
