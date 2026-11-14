// Farbräumer – Level-Generator. Jedes Level wird vom Löser geprüft.
// Zusätzlich wird geprüft, dass planloses Spielen oft scheitert (sonst zu leicht).
import { mulberry32, shuffle, randInt } from '../../rng.js';
import { CAP, initialState, solve, legalMoves, applyMove, isWon } from './model.js';

export function levelParams(level) {
  return {
    cols: level <= 3 ? 5 : 6,
    rows: level <= 3 ? 5 : level <= 10 ? 6 : 7,
    colors: level <= 3 ? 3 : level <= 10 ? 4 : level <= 20 ? 5 : 6,
    stacks: level <= 6 ? 2 : 3,
    gates: level <= 4 ? 0 : level <= 14 ? 1 : 2,
    bufferSize: level <= 12 ? 5 : 4,
    fillRatio: Math.min(0.62 + level * 0.008, 0.8),
    seed: level * 6151 + 2311,
  };
}

function build(P, rnd) {
  const { cols, rows } = P;
  const cells = cols * rows;
  // Tore: Felder am linken/rechten/unteren Rand (nicht oberste Reihe)
  const gateCells = [];
  const edge = [];
  for (let r = 2; r < rows; r++) { edge.push(r * cols, r * cols + cols - 1); }
  for (let c = 1; c < cols - 1; c++) edge.push((rows - 1) * cols + c);
  shuffle(edge, rnd);
  for (let k = 0; k < P.gates; k++) gateCells.push(edge[k]);
  const queueLens = gateCells.map(() => randInt(rnd, 3, 5));

  // Anzahl Figuren: Brettanteil + Warteschlangen, auf Vielfache von CAP gerundet
  const onBoard = Math.round(cells * P.fillRatio);
  let total = onBoard + queueLens.reduce((a, b) => a + b, 0);
  total = Math.round(total / CAP) * CAP;
  const containers = total / CAP;
  // Behälterfarben: jede Farbe mindestens einmal
  const colorsOf = [];
  for (let k = 0; k < containers; k++) colorsOf.push(k < P.colors ? k : randInt(rnd, 0, P.colors - 1));
  shuffle(colorsOf, rnd);
  const stacks = Array.from({ length: P.stacks }, () => []);
  colorsOf.forEach((c, k) => stacks[k % P.stacks].push(c));

  // Figuren verteilen
  const figures = shuffle(colorsOf.flatMap((c) => [c, c, c]), rnd);
  const board = new Array(cells).fill(-1);
  const gates = gateCells.map((cell, k) => ({ cell, queue: [] }));
  // Warteschlangen zuerst (Tor-Feld selbst bekommt auch eine Figur)
  gates.forEach((g, k) => { for (let q = 0; q < queueLens[k]; q++) g.queue.push(figures.pop()); });
  // Restliche Figuren aufs Brett; leere Felder eher oben (Zugänge)
  const order = [...Array(cells).keys()].sort((a, b) => {
    const wa = Math.floor(a / cols) + rnd() * 3, wb = Math.floor(b / cols) + rnd() * 3;
    return wb - wa; // untere Reihen zuerst füllen
  });
  for (const g of gates) { board[g.cell] = figures.pop(); }
  for (const i of order) {
    if (!figures.length) break;
    if (board[i] === -1) board[i] = figures.pop();
  }
  if (figures.length) return null; // passt nicht aufs Brett
  return { cols, rows, board, gates, stacks, bufferSize: P.bufferSize };
}

// Wie oft gelingt planloses Spielen? (Zufallszüge) – Maß für Schwierigkeit
function randomWinRate(L, rnd, runs = 30) {
  let wins = 0;
  for (let k = 0; k < runs; k++) {
    let s = initialState(L);
    for (;;) {
      const m = legalMoves(L, s);
      if (!m.length) break;
      s = applyMove(L, s, m[Math.floor(rnd() * m.length)]).state;
    }
    if (isWon(L, s)) wins++;
  }
  return wins / runs;
}

export function generateLevel(level) {
  const P = levelParams(level);
  const rnd = mulberry32(P.seed);
  let best = null;
  for (let attempt = 1; attempt <= 40; attempt++) {
    const L = build(P, rnd);
    if (!L) continue;
    const res = solve(L, initialState(L), 6000);
    if (!res || !res.path) continue;
    const rate = randomWinRate(L, rnd);
    // Ziel: Zufallsspiel soll oft scheitern, aber nicht unmöglich wirken
    const target = level <= 3 ? 0.6 : level <= 10 ? 0.3 : 0.12;
    const score = -Math.abs(rate - target);
    if (!best || score > best.score) best = { ...L, solution: res.path, score, randomWin: rate, attempts: attempt };
    if (attempt >= 8 && best && Math.abs(best.randomWin - target) < 0.1) break;
  }
  return { ...best, level };
}
