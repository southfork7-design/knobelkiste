// Prüft Kronenfeld: jedes Rätsel der Bank und jedes Level hat genau eine Lösung
// und ist ohne Raten (nur mit Schlussregeln) lösbar.
// Aufruf: node tools/test-crowns.js [bis-Level] [--voll]
// Ohne --voll wird der (langsame) Lösungszähler bei 3-Kronen-Rätseln nur für jedes
// 5. Rätsel angewandt; der logische Löser beweist die Eindeutigkeit ohnehin.
import { generateLevel, countSolutions, logicSolve } from '../js/games/crowns/generator.js';
import { BANK } from '../js/games/crowns/bank.js';

const full = process.argv.includes('--voll');
let bad = 0;
const t0 = Date.now();

// 1) Bank: unabhängige Gegenprobe mit dem Lösungszähler
for (const [key, list] of Object.entries(BANK)) {
  const [n, k] = key.split('-').map(Number);
  const t = Date.now();
  let badHere = 0, score = 0;
  list.forEach((s, x) => {
    const reg = [...s].map((ch) => parseInt(ch, 36));
    const count = full || k < 3 || x % 5 === 0;
    const ok = s.length === n * n && (!count || countSolutions(n, k, reg) === 1);
    const res = logicSolve(n, k, reg);
    if (!ok || !res.solved) badHere++;
    score += res.score;
  });
  bad += badHere;
  console.log(`Bank ${n}x${n}, ${k} Kronen: ${list.length} Rätsel, fehlerhaft ${badHere}, Schwierigkeit Ø ${Math.round(score / list.length)}, ${Date.now() - t}ms`);
}

// 2) Level, wie sie im Spiel ankommen (gedreht/gespiegelt aus der Bank)
const upTo = Number(process.argv.find((a) => /^\d+$/.test(a)) || 150);
const seen = new Map();
for (let lvl = 1; lvl <= upTo; lvl++) {
  const t = Date.now();
  const L = generateLevel(lvl);
  const valid = L.stars.length === L.n * L.k && logicSolve(L.n, L.k, L.reg).solved;
  if (!valid) { bad++; console.log(`Level ${lvl}: FEHLER`); }
  // direkt aufeinanderfolgende Level dürfen nicht gleich aussehen
  const key = L.reg.join(',');
  if (seen.get(key) === lvl - 1) { bad++; console.log(`Level ${lvl}: gleich wie Level ${lvl - 1}`); }
  seen.set(key, lvl);
  const ms = Date.now() - t;
  if ([1, 3, 6, 13, 26, 46, 48, 66, upTo].includes(lvl) || ms > 500)
    console.log(`Level ${lvl}: ${L.n}x${L.n}, ${L.k} Kronen, Schwierigkeit ${L.score}, ${ms}ms`);
}
console.log(`Fehler: ${bad}   (gesamt ${Date.now() - t0}ms)`);
process.exit(bad ? 1 : 0);
