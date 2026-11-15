// Erzeugt vorab große Kronenfeld-Rätsel (zu langsam für das Handy) und hängt sie
// zeilenweise an tools/crowns-bank/<n>-<k>-<startSeed>.jsonl an (mehrere Läufe parallel möglich). Danach mit
// `node tools/make-crowns-bank.js --build` daraus js/games/crowns/bank.js bauen.
// Aufruf: node tools/make-crowns-bank.js <n> <k> <anzahl> [startSeed]
import { appendFileSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { generatePuzzle, logicSolve } from '../js/games/crowns/generator.js';

const enc = (reg) => reg.map((g) => g.toString(36)).join('');

if (process.argv[2] === '--build') {
  // Stufen, die in die Bank kommen (Reihenfolge = Reihenfolge in bank.js)
  const sets = process.argv.slice(3).length ? process.argv.slice(3) : ['7-1', '9-1', '10-2', '11-2', '12-2', '14-2', '15-3', '16-3'];
  const out = {};
  for (const key of sets) {
    const files = readdirSync('tools/crowns-bank').filter((f) => f.startsWith(key + '-'));
    const list = files.flatMap((f) => readFileSync('tools/crowns-bank/' + f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    if (!list.length) continue;
    // je Seed nur einmal; das leichteste Drittel fällt weg; nach Seed sortiert (stabile Bank)
    const seen = new Set();
    const uniq = list.filter((p) => !seen.has(p.seed) && seen.add(p.seed)).sort((a, b) => b.score - a.score);
    const keep = uniq.slice(0, Math.max(1, Math.ceil(uniq.length * 2 / 3)));
    out[key] = keep.sort((a, b) => a.seed - b.seed).map((p) => p.reg);
  }
  const body = Object.entries(out).map(([key, regs]) => `  '${key}': [\n${regs.map((r) => `    '${r}',`).join('\n')}\n  ],`).join('\n');
  writeFileSync('js/games/crowns/bank.js',
    `// Vorab erzeugte große Kronenfeld-Rätsel (tools/make-crowns-bank.js), je Stufe 'n-k'.\n` +
    `// Jede Zeichenkette: Region je Feld zeilenweise (0–9, a–z). Alle eindeutig und ohne Raten lösbar.\n` +
    `export const BANK = {\n${body}\n};\n`);
  console.log(Object.entries(out).map(([k, v]) => `${k}: ${v.length}`).join(', '));
  process.exit(0);
}

const [n, k, count, start = 1] = process.argv.slice(2).map(Number);
mkdirSync('tools/crowns-bank', { recursive: true });
const file = `tools/crowns-bank/${n}-${k}-${start}.jsonl`;
let made = 0;
for (let seed = start; made < count; seed++) {
  const t = Date.now();
  const L = generatePuzzle(n, k, seed * 7919 + n * 101 + k, 0, 2);
  // Gegenprobe
  if (!logicSolve(n, k, L.reg).solved) { console.log('Fehler bei Seed', seed); continue; }
  appendFileSync(file, JSON.stringify({ seed, n, k, score: L.score, reg: enc(L.reg) }) + '\n');
  made++;
  console.log(`${n}x${n} k${k} seed ${seed}: Schwierigkeit ${L.score} ${JSON.stringify(L.used)}, ${Date.now() - t}ms`);
}
