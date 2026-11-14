// Generator für Kronenfeld.
// Regeln: N×N Felder, N farbige Regionen. Genau eine Krone pro Zeile,
// Spalte und Region; Kronen berühren sich nicht (auch nicht diagonal).
//
// Vorgehen: 1) zufällige gültige Kronenverteilung, 2) um jede Krone eine
// Region wachsen lassen, 3) prüfen, dass es GENAU EINE Lösung gibt, und
// 4) prüfen, dass sie ohne Raten (nur mit Schlussregeln) lösbar ist.

import { mulberry32, shuffle } from '../../rng.js';

export function levelParams(level) {
  const n = level <= 3 ? 5 : level <= 10 ? 6 : level <= 22 ? 7 : level <= 40 ? 8 : level <= 70 ? 9 : 10;
  return { n, seed: level * 4243 + 2909 };
}

function randomSolution(n, rnd) {
  const cols = new Array(n);
  const used = new Array(n).fill(false);
  function place(r) {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()], rnd)) {
      if (used[c] || (r > 0 && Math.abs(cols[r - 1] - c) <= 1)) continue;
      used[c] = true; cols[r] = c;
      if (place(r + 1)) return true;
      used[c] = false;
    }
    return false;
  }
  place(0);
  return cols;
}

function growRegions(n, cols, rnd) {
  const reg = new Int8Array(n * n).fill(-1);
  cols.forEach((c, r) => { reg[r * n + c] = r; });
  const nb = (i) => {
    const r = Math.floor(i / n), c = i % n, out = [];
    if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
    return out;
  };
  // Regionen wachsen unterschiedlich schnell → abwechslungsreiche Formen
  const weight = Array.from({ length: n }, () => 0.6 + rnd() * 0.9);
  const size = new Array(n).fill(1);
  let left = n * n - n;
  while (left > 0) {
    const frontier = [];
    for (let i = 0; i < n * n; i++) {
      if (reg[i] !== -1) continue;
      for (const j of nb(i)) if (reg[j] !== -1) frontier.push([i, reg[j]]);
    }
    // Große Regionen wachsen langsamer → ausgewogenere Größen
    const w = (g) => weight[g] / size[g];
    const total = frontier.reduce((s, [, g]) => s + w(g), 0);
    let x = rnd() * total, pick = frontier[0];
    for (const f of frontier) { x -= w(f[1]); if (x <= 0) { pick = f; break; } }
    reg[pick[0]] = pick[1];
    size[pick[1]]++;
    left--;
  }
  return reg;
}

// Zählt Lösungen (bricht bei `limit` ab)
export function countSolutions(n, reg, limit = 2) {
  return findSolutions(n, reg, limit).length;
}

// Findet bis zu `limit` Lösungen (je Lösung: Spalte der Krone pro Zeile)
export function findSolutions(n, reg, limit = 2) {
  const found = [];
  const cols = new Array(n);
  const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false);
  let prev = -9;
  function row(r) {
    if (r === n) { found.push(cols.slice()); return; }
    for (let c = 0; c < n && found.length < limit; c++) {
      const g = reg[r * n + c];
      if (colUsed[c] || regUsed[g] || Math.abs(prev - c) <= 1) continue;
      colUsed[c] = regUsed[g] = true;
      const keep = prev; prev = c; cols[r] = c;
      row(r + 1);
      prev = keep;
      colUsed[c] = regUsed[g] = false;
    }
  }
  row(0);
  return found;
}

// Logischer Löser ohne Raten. Gibt die Anzahl benötigter Durchgänge zurück
// (Maß für Schwierigkeit) oder -1, wenn er steckenbleibt.
// Zustand je Feld: 0 offen, 1 Krone, 2 ausgeschlossen.
export function logicSolve(n, reg) {
  const st = new Uint8Array(n * n);
  const groups = [];
  for (let r = 0; r < n; r++) groups.push([...Array(n).keys()].map((c) => r * n + c));
  for (let c = 0; c < n; c++) groups.push([...Array(n).keys()].map((r) => r * n + c));
  for (let g = 0; g < n; g++) groups.push([...Array(n * n).keys()].filter((i) => reg[i] === g));

  function placeCrown(i) {
    st[i] = 1;
    const r = Math.floor(i / n), c = i % n, g = reg[i];
    for (let j = 0; j < n * n; j++) {
      if (j === i || st[j] !== 0) continue;
      const rj = Math.floor(j / n), cj = j % n;
      if (rj === r || cj === c || reg[j] === g || (Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1)) st[j] = 2;
    }
  }
  // Feld i ausschließen, wenn eine Krone dort eine Gruppe ohne Möglichkeit ließe
  function wouldKill(i) {
    const r = Math.floor(i / n), c = i % n, g = reg[i];
    const blocks = (j) => {
      const rj = Math.floor(j / n), cj = j % n;
      return rj === r || cj === c || reg[j] === g || (Math.abs(rj - r) <= 1 && Math.abs(cj - c) <= 1);
    };
    for (const grp of groups) {
      if (grp.some((j) => st[j] === 1)) continue;
      if (grp.includes(i)) continue;
      if (grp.every((j) => st[j] !== 0 || blocks(j))) return true;
    }
    return false;
  }

  let passes = 0;
  for (;;) {
    if (st.every((s) => s !== 0)) break;
    passes++;
    let progress = false;
    // Regel 1: Gruppe mit nur einer offenen Stelle → Krone
    for (const grp of groups) {
      if (grp.some((j) => st[j] === 1)) continue;
      const open = grp.filter((j) => st[j] === 0);
      if (open.length === 1) { placeCrown(open[0]); progress = true; }
    }
    if (progress) continue;
    // Regel 2: k Regionen liegen vollständig in k Zeilen (oder Spalten) →
    // diese Zeilen sind für andere Regionen gesperrt (und umgekehrt).
    progress = linesRule(true) || linesRule(false);
    if (progress) continue;
    // Regel 3: Feld, dessen Krone eine andere Gruppe unmöglich machen würde
    for (let i = 0; i < n * n; i++) {
      if (st[i] === 0 && wouldKill(i)) { st[i] = 2; progress = true; }
    }
    if (!progress) return -1;
  }
  // Ergebnis muss gültig sein
  return st.filter((s) => s === 1).length === n ? passes : -1;

  function linesRule(rows) {
    let changed = false;
    const lineOf = (i) => (rows ? Math.floor(i / n) : i % n);
    // Für jede Region: in welchen Linien hat sie noch offene Felder?
    const regLines = [];
    for (let g = 0; g < n; g++) {
      const cells = groups[2 * n + g];
      if (cells.some((j) => st[j] === 1)) { regLines.push(null); continue; }
      regLines.push(new Set(cells.filter((j) => st[j] === 0).map(lineOf)));
    }
    // Teilmengen von Regionen der Größe 1..3 prüfen (reicht in der Praxis)
    const regs = [...Array(n).keys()].filter((g) => regLines[g]);
    const check = (set) => {
      const lines = new Set();
      for (const g of set) for (const l of regLines[g]) lines.add(l);
      if (lines.size !== set.length) return;
      for (let i = 0; i < n * n; i++) {
        if (st[i] === 0 && lines.has(lineOf(i)) && !set.includes(reg[i])) { st[i] = 2; changed = true; }
      }
    };
    for (let a = 0; a < regs.length; a++) {
      check([regs[a]]);
      for (let b = a + 1; b < regs.length; b++) {
        check([regs[a], regs[b]]);
        for (let c = b + 1; c < regs.length; c++) check([regs[a], regs[b], regs[c]]);
      }
    }
    return changed;
  }
}

// Ist die Region `g` ohne Feld `skip` noch zusammenhängend?
function connectedWithout(n, reg, g, skip) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (reg[i] === g && i !== skip) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop(), r = Math.floor(i / n), c = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && j !== skip && reg[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

// Macht die Lösung eindeutig: Solange eine zweite Lösung existiert, wird ein
// Feld, auf dem nur die falsche Lösung eine Krone hat, in eine Nachbarregion
// verschoben, die in der falschen Lösung schon eine Krone hat. Damit ist
// diese falsche Lösung ungültig; die richtige bleibt unberührt.
function makeUnique(n, reg, cols, rnd, maxSteps = 60) {
  const isTrue = new Set(cols.map((c, r) => r * n + c));
  for (let step = 0; step < maxSteps; step++) {
    const sols = findSolutions(n, reg, 2);
    const alt = sols.find((s) => s.some((c, r) => c !== cols[r]));
    if (!alt) return true;
    const altCells = alt.map((c, r) => r * n + c);
    const altRegions = new Set(altCells.map((i) => reg[i]));
    const moves = [];
    for (const x of altCells) {
      if (isTrue.has(x)) continue;
      const r = Math.floor(x / n), c = x % n;
      for (const j of [r > 0 ? x - n : -1, r < n - 1 ? x + n : -1, c > 0 ? x - 1 : -1, c < n - 1 ? x + 1 : -1]) {
        if (j < 0) continue;
        const g = reg[j];
        if (g === reg[x] || !altRegions.has(g)) continue;
        if (!connectedWithout(n, reg, reg[x], x)) continue;
        moves.push([x, g]);
      }
    }
    if (!moves.length) return false;
    const [x, g] = moves[Math.floor(rnd() * moves.length)];
    reg[x] = g;
  }
  return false;
}

export function generateLevel(level) {
  const { n, seed } = levelParams(level);
  const rnd = mulberry32(seed);
  for (let attempt = 1; ; attempt++) {
    const cols = randomSolution(n, rnd);
    const reg = growRegions(n, cols, rnd);
    if (!makeUnique(n, reg, cols, rnd)) continue;
    const passes = logicSolve(n, reg);
    if (passes < 0) continue;
    return { n, reg: Array.from(reg), solution: cols, passes, attempts: attempt, level };
  }
}
