// Prüft Fallenfeld:
// 1) Der Löser zieht nur sichere Schlüsse: auf kleinen Feldern mit zufällig aufgedeckten
//    Zahlen wird jeder Schluss gegen alle passenden Fallen-Verteilungen geprüft.
// 2) Jedes Level ist vom Startbereich aus ohne Raten lösbar, gleich erzeugt bei gleicher
//    Nummer, und der Löser kommt genau auf die Fallen.
// Aufruf: node tools/test-traps.js [bis-Level]
import { generateLevel, levelParams, logicSolve, makeGrid, countNumbers } from '../js/games/traps/generator.js';
import { mulberry32 } from '../js/rng.js';

const upTo = Number(process.argv[2]) || 60;
let bad = 0;

// 1) Gegenprobe des Lösers mit vollständiger Suche
{
  const t = Date.now();
  const rnd = mulberry32(7);
  let checks = 0, deductions = 0;
  for (let round = 0; round < 3000; round++) {
    const W = 5, H = 4, g = makeGrid(W, H), N = g.N;
    const mines = new Uint8Array(N);
    const M = 3 + Math.floor(rnd() * 5);
    let placed = 0;
    while (placed < M) { const i = Math.floor(rnd() * N); if (!mines[i]) { mines[i] = 1; placed++; } }
    const num = countNumbers(g, mines);
    const known = new Int8Array(N).fill(-1);
    for (let i = 0; i < N; i++) if (!mines[i] && rnd() < 0.45) known[i] = 0;
    const res = logicSolve(g, num, known, M, { reveal: false });
    const unk = [];
    for (let i = 0; i < N; i++) if (known[i] === -1) unk.push(i);
    // alle Verteilungen der Fallen auf die verdeckten Felder, die zu den Zahlen passen
    const okSets = [];
    for (let mask = 0; mask < 1 << unk.length; mask++) {
      const m = new Uint8Array(N);
      let cnt = 0;
      unk.forEach((i, b) => { if (mask >> b & 1) { m[i] = 1; cnt++; } });
      if (cnt !== M) continue;
      let fits = true;
      for (let i = 0; i < N && fits; i++) {
        if (known[i] !== 0) continue;
        let c = 0;
        for (const j of g.nb[i]) c += m[j];
        if (c !== num[i]) fits = false;
      }
      if (fits) okSets.push(m);
    }
    checks++;
    for (let i = 0; i < N; i++) {
      if (known[i] !== -1 || res.K[i] === -1) continue;
      deductions++;
      // gilt der Schluss in jeder passenden Verteilung?
      if (okSets.some((m) => m[i] !== (res.K[i] === 1 ? 1 : 0))) { bad++; console.log('Falscher Schluss', round, i); break; }
    }
  }
  console.log(`Löser-Gegenprobe: ${checks} Stände, ${deductions} Schlüsse geprüft, ${Date.now() - t}ms`);
}

// 2) Level
let maxMs = 0;
for (let level = 1; level <= upTo; level++) {
  const t = Date.now();
  const L = generateLevel(level);
  const ms = Date.now() - t;
  maxMs = Math.max(maxMs, ms);
  const P = levelParams(level);
  const g = makeGrid(L.W, L.H);
  const errs = [];
  if (L.W !== P.W || L.H !== P.H) errs.push('Größe');
  const cnt = L.mines.reduce((a, b) => a + b, 0);
  if (cnt !== P.mines || L.total !== P.mines) errs.push('Fallenzahl');
  if (L.mines[L.start] || L.num[L.start] !== 0) errs.push('Startfeld');
  const known = new Int8Array(g.N).fill(-1);
  known[L.start] = 0;
  const res = logicSolve(g, L.num, known, L.total);
  if (!res.solved) errs.push('nicht ohne Raten lösbar');
  for (let i = 0; i < g.N; i++) if (res.K[i] !== L.mines[i]) { errs.push('Löser irrt'); break; }
  const L2 = generateLevel(level);
  if (L2.start !== L.start || L2.mines.some((v, i) => v !== L.mines[i])) errs.push('nicht gleich erzeugt');
  if (errs.length) bad++;
  console.log(`Level ${level}: ${L.W}×${L.H}, ${L.total} Fallen, Start ${L.opened} Felder, ` +
    `${L.pairUses} Schlüsse mit zwei Zahlen, ${ms}ms${errs.length ? '  FEHLER: ' + errs.join(', ') : ''}`);
}
console.log(bad ? `${bad} FEHLER` : `Alles in Ordnung (längste Erzeugung ${maxMs}ms)`);
process.exit(bad ? 1 : 0);
