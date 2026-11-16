// Farbräumer – Level-Generator.
// Das Level entsteht entlang einer Lösung: Zuerst wird eine gültige Reihenfolge
// zum Ausgraben der Felder gewählt (jede Figur ist erreichbar, wenn sie dran ist),
// dann bekommen die Figuren in dieser Reihenfolge ihre Farben – so, dass jede
// entweder in einen offenen Behälter passt oder auf die Ablage, die nie überläuft.
// Damit ist jedes Level lösbar; die Lösung wird zusätzlich mit den Spielregeln
// nachgespielt. Schwierigkeit: Ein „gieriger“ Zufallsspieler (direkte Züge sofort,
// sonst irgendeine Figur auf die Ablage) soll meist scheitern.
import { mulberry32, shuffle, randInt } from '../../rng.js';
import { CAP, initialState, place, legalMoves, applyMove, isWon, closure, directStack } from './model.js';

export const VERSION = 2;

export function levelParams(level) {
  const t = Math.min(1, (level - 1) / 40);
  return {
    cols: 7 + Math.round(t * 7),                       // 7 → 14
    rows: 9 + Math.round(t * 11),                      // 9 → 20
    colors: Math.min(7, 4 + Math.floor((level + 4) / 12)), // 4 → 7
    stacks: level <= 6 ? 3 : level <= 24 ? 4 : 5,
    gates: level <= 2 ? 0 : Math.min(4, 1 + Math.floor(level / 12)),
    bufferSize: level <= 4 ? 6 : 5,
    target: level <= 3 ? 0.45 : level <= 10 ? 0.2 : 0.08, // Gewinnrate des Zufallsspielers
    seed: level * 6151 + 2311,
  };
}

// Reihenfolge zum Ausgraben. Liefert Liste von Feldern (Torfelder mehrfach).
function digOrder(P, rnd, gateCells, queueLens, holes) {
  const { cols, rows } = P;
  const n = cols * rows;
  const occupied = new Uint8Array(n).fill(1);
  const open = new Uint8Array(n); // leer und mit Weg nach oben
  for (const h of holes) occupied[h] = 0;
  const gateLeft = new Map(gateCells.map((c, k) => [c, queueLens[k]]));
  const nb = (i) => {
    const r = (i / cols) | 0, c = i % cols, out = [];
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    return out;
  };
  const flood = (i) => {
    const st = [i]; open[i] = 1;
    while (st.length) { const x = st.pop(); for (const j of nb(x)) if (!occupied[j] && !open[j]) { open[j] = 1; st.push(j); } }
  };
  for (let c = 0; c < cols; c++) if (!occupied[c] && !open[c]) flood(c);
  const isFront = (i) => occupied[i] && (i < cols || nb(i).some((j) => open[j]));
  const order = [];
  let last = -1;
  const total = n - holes.length + queueLens.reduce((a, b) => a + b, 0);
  while (order.length < total) {
    const front = [];
    for (let i = 0; i < n; i++) if (isFront(i)) front.push(i);
    // Gänge graben: oft direkt neben dem zuletzt geräumten Feld weitermachen
    let pick;
    const near = last >= 0 ? front.filter((i) => nb(i).includes(last) || i === last) : [];
    if (near.length && rnd() < 0.55) pick = near[Math.floor(rnd() * near.length)];
    else pick = front[Math.floor(rnd() * front.length)];
    order.push(pick);
    last = pick;
    const q = gateLeft.get(pick) || 0;
    if (q > 0) { gateLeft.set(pick, q - 1); continue; } // Tor schiebt nach
    occupied[pick] = 0;
    if (pick < cols || nb(pick).some((j) => open[j])) flood(pick);
  }
  return order;
}

function build(P, rnd, pBuffer) {
  const { cols, rows } = P;
  const n = cols * rows;
  // Tore: Felder am linken/rechten/unteren Rand (nicht in den oberen Reihen)
  const edge = [];
  for (let r = 3; r < rows; r++) edge.push(r * cols, r * cols + cols - 1);
  for (let c = 1; c < cols - 1; c++) edge.push((rows - 1) * cols + c);
  shuffle(edge, rnd);
  const gateCells = edge.slice(0, P.gates);
  const queueLens = gateCells.map(() => randInt(rnd, 4, 8));
  // Figurenzahl auf ein Vielfaches von CAP bringen: einzelne Lücken im Brett
  const holes = [];
  let total = n + queueLens.reduce((a, b) => a + b, 0);
  const free = shuffle([...Array(n).keys()].filter((i) => !gateCells.includes(i) && i >= cols), rnd);
  while (total % CAP) { holes.push(free.pop()); total--; }
  const order = digOrder(P, rnd, gateCells, queueLens, holes);

  // Behälter: Farben möglichst gleich oft, gemischt; auf die Stapel verteilt
  const containers = total / CAP;
  const colorsOf = [];
  for (let k = 0; k < containers; k++) colorsOf.push(k % P.colors);
  // zu Beginn sollen die offenen Behälter verschiedene Farben haben
  for (let k = 0; k < 50; k++) {
    shuffle(colorsOf, rnd);
    if (new Set(colorsOf.slice(0, P.stacks)).size === Math.min(P.stacks, P.colors)) break;
  }
  const stacks = Array.from({ length: P.stacks }, () => []);
  colorsOf.forEach((c, k) => stacks[k % P.stacks].push(c));
  const L0 = { stacks, bufferSize: P.bufferSize, gates: [] };

  // Farben in Grabreihenfolge vergeben
  const left = new Array(P.colors).fill(0); // noch zu vergebende Figuren je Farbe
  for (const c of colorsOf) left[c] += CAP;
  const t = { stackPos: stacks.map(() => 0), fill: stacks.map(() => 0), buffer: [] };
  const seq = [];
  for (let step = 0; step < order.length; step++) {
    const direct = [], later = [];
    for (let c = 0; c < P.colors; c++) {
      if (!left[c]) continue;
      if (directStack(L0, t, c) >= 0) direct.push(c); else later.push(c);
    }
    let c;
    const room = t.buffer.length < P.bufferSize;
    if (later.length && room && (rnd() < pBuffer || !direct.length)) c = later[Math.floor(rnd() * later.length)];
    else if (direct.length) c = direct[Math.floor(rnd() * direct.length)];
    else return null;
    left[c]--;
    seq.push(c);
    place(L0, t, c, null);
  }

  // Brett und Warteschlangen aus der Reihenfolge füllen
  const board = new Array(n).fill(-1);
  const gates = gateCells.map((cell) => ({ cell, queue: [] }));
  const seenGate = new Map();
  order.forEach((cell, k) => {
    const g = gates.find((x) => x.cell === cell);
    if (g && seenGate.has(cell)) g.queue.push(seq[k]);
    else { board[cell] = seq[k]; if (g) seenGate.set(cell, 1); }
  });
  return { cols, rows, board, gates, stacks, bufferSize: P.bufferSize, colors: P.colors, solution: order };
}

// Gieriger Zufallsspieler: direkte Züge sofort, sonst irgendeine erreichbare Figur auf die Ablage.
function greedyWinRate(L, rnd, runs) {
  let wins = 0;
  for (let k = 0; k < runs; k++) {
    let s = closure(L, initialState(L)).state;
    while (!isWon(L, s)) {
      const m = legalMoves(L, s);
      if (!m.length) break;
      s = closure(L, applyMove(L, s, m[Math.floor(rnd() * m.length)]).state).state;
    }
    if (isWon(L, s)) wins++;
  }
  return wins / runs;
}

export function checkSolution(L, path = L.solution) {
  let s = initialState(L);
  for (const m of path) {
    if (!legalMoves(L, s).includes(m)) return false;
    s = applyMove(L, s, m).state;
  }
  return isWon(L, s);
}

export function generateLevel(level) {
  const P = levelParams(level);
  const rnd = mulberry32(P.seed);
  let best = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const pBuffer = 0.12 + 0.05 * attempt;
    const L = build(P, rnd, pBuffer);
    if (!L || !checkSolution(L)) continue;
    const rate = greedyWinRate(L, rnd, 16);
    const score = -Math.abs(rate - P.target);
    if (!best || score > best.score) best = { ...L, score, randomWin: rate, attempts: attempt };
    if (attempt >= 3 && Math.abs(best.randomWin - P.target) < 0.07) break;
  }
  return { ...best, level, v: VERSION };
}
