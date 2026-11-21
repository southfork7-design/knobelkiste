// Prüft Farbschloss:
// 1) Bewertung stimmt an Hand fester Beispiele.
// 2) Jede Stufe ist in ihrer Zeilenzahl lösbar: die Strategie „immer einen Versuch setzen,
//    der zu allen bisherigen Antworten passt“ (wie der Tipp) schafft jeden geprüften Code.
//    Kleine Stufen werden vollständig geprüft, große mit vielen Zufallscodes.
// 3) Levels sind bei gleicher Nummer gleich und halten die Stufenregeln ein.
// Aufruf: node tools/test-codes.js [Codes je großer Stufe]
import { score, allCodes, candidates, codeAt, levelParams, generateLevel } from '../js/games/codes/generator.js';
import { mulberry32 } from '../js/rng.js';

const samples = Number(process.argv[2]) || 400;
let bad = 0;
const fail = (m) => { bad++; console.log('FEHLER', m); };

// 1) Bewertung
const ex = [
  [[0, 1, 2, 3], [0, 1, 2, 3], [4, 0]],
  [[0, 1, 2, 3], [3, 2, 1, 0], [0, 4]],
  [[0, 0, 1, 1], [0, 1, 0, 2], [1, 2]],
  [[0, 0, 0, 1], [0, 2, 2, 2], [1, 0]],
  [[1, 1, 2, 2], [2, 2, 2, 1], [1, 2]],
];
for (const [c, g, want] of ex) {
  const got = score(c, g, 8);
  if (got[0] !== want[0] || got[1] !== want[1]) fail(`score(${c}, ${g}) = ${got}, erwartet ${want}`);
}

// 2) Lösbarkeit je Stufe
function play(params, code, rnd) {
  const hist = [];
  for (let turn = 1; turn <= 30; turn++) {
    const cand = candidates(params, hist);
    const guess = codeAt(params, cand[Math.floor(rnd() * cand.length)]);
    const fb = score(code, guess, params.K);
    if (fb[0] === params.P) return turn;
    hist.push({ guess, fb });
  }
  return 99;
}
const stages = new Map();
for (const P of [4, 6]) for (let l = 1; l <= 60; l++) {
  const p = levelParams(l, P);
  stages.set(`${p.P}/${p.K}/${p.rep}/${p.rows}`, p);
}
for (const p of stages.values()) {
  const t = Date.now();
  const all = allCodes(p);
  const rnd = mulberry32(11);
  const full = all.n <= 1300;
  const count = full ? all.n : samples;
  let max = 0, sum = 0;
  for (let i = 0; i < count; i++) {
    const idx = full ? i : Math.floor(rnd() * all.n);
    const turns = play(p, codeAt(p, idx), rnd);
    max = Math.max(max, turns); sum += turns;
  }
  const ok = max <= p.rows;
  if (!ok) fail(`${p.P} Stellen, ${p.K} Farben${p.rep ? ', mit Wiederholung' : ''}: ${max} Versuche > ${p.rows} Zeilen`);
  console.log(`${p.P} Stellen · ${p.K} Farben · ${p.rep ? 'mit' : 'ohne'} Wdh. · ${all.n} Codes · ${full ? 'alle' : count} geprüft · ` +
    `Ø ${(sum / count).toFixed(2)}, höchstens ${max} von ${p.rows} Zeilen · ${Date.now() - t} ms ${ok ? '' : '  <-- zu knapp'}`);
}

// 3) Levels
for (const P of [4, 6]) for (let l = 1; l <= 60; l++) for (const att of [0, 1]) {
  const a = generateLevel(l, P, att), b = generateLevel(l, P, att);
  if (a.code.join() !== b.code.join()) fail(`Level ${l}/${P} nicht gleich erzeugt`);
  if (a.code.length !== P || a.code.some((k) => k < 0 || k >= a.K)) fail(`Level ${l}/${P}: ungültiger Code`);
  if (!a.rep && new Set(a.code).size !== P) fail(`Level ${l}/${P}: Farbe doppelt, obwohl ohne Wiederholung`);
}
if (generateLevel(5, 4, 0).code.join() === generateLevel(5, 4, 1).code.join() &&
  generateLevel(6, 4, 0).code.join() === generateLevel(6, 4, 1).code.join()) fail('Neuer Versuch ergibt denselben Code');

console.log(bad ? `${bad} Fehler` : 'Alles in Ordnung');
process.exit(bad ? 1 : 0);
