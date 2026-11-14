// Generator für Gleisbau.
// Regeln: Eine einzige, durchgehende Strecke ohne Abzweigungen läuft vom
// Start (am Rand) zum Ziel (am Rand). Die Zahlen oben/links geben an, wie
// viele Felder der Spalte/Zeile Gleise enthalten. Einige Teile sind vorgegeben.
//
// Felder speichern ihre Verbindungen als Bitmaske:
// 1 = oben, 2 = rechts, 4 = unten, 8 = links.
// Seiten/Richtungen: 0 oben, 1 rechts, 2 unten, 3 links.

import { mulberry32, randInt } from '../../rng.js';

export const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
export const bit = (d) => 1 << d;
export const opp = (d) => (d + 2) % 4;

export function levelParams(level) {
  const n = level <= 5 ? 7 : level <= 15 ? 8 : level <= 35 ? 9 : 10;
  // Anteil zusätzlicher Vorgaben (über die nötigen hinaus): sinkt mit dem Level
  const extraGivens = Math.max(0, 0.22 - level * 0.006);
  return { n, seed: level * 7349 + 5651, extraGivens };
}

// Feld am Rand `side` an Position `pos`
const sideCell = (n, side, pos) =>
  side === 0 ? pos : side === 1 ? pos * n + n - 1 : side === 2 ? (n - 1) * n + pos : pos * n;
const onSide = (n, i, side) => {
  const r = Math.floor(i / n), c = i % n;
  return side === 0 ? r === 0 : side === 1 ? c === n - 1 : side === 2 ? r === n - 1 : c === 0;
};

// Zufällige Strecke. startSide/startPos: Einstieg; endSides: erlaubte Ausgangsseiten
function randomPath(n, rnd, { startSide, startPos = null, endSides }) {
  const minLen = Math.round(n * n * 0.42), maxLen = Math.round(n * n * 0.62);
  for (;;) {
    const pos = startPos ?? randInt(rnd, 0, n - 1);
    const start = sideCell(n, startSide, pos);
    const startOut = startSide;
    const visited = new Uint8Array(n * n);
    const cells = [start];
    visited[start] = 1;
    let r = Math.floor(start / n), c = start % n, dir = opp(startOut); // Fahrtrichtung
    let ok = false, endOut = -1;
    while (cells.length <= maxLen) {
      if (cells.length >= minLen) {
        const i = r * n + c;
        const outs = endSides.filter((d) => onSide(n, i, d) && d !== opp(dir));
        if (outs.length && rnd() < 0.35) { endOut = outs[Math.floor(rnd() * outs.length)]; ok = true; break; }
      }
      const options = [dir, (dir + 1) % 4, (dir + 3) % 4];
      // meistens geradeaus, manchmal abbiegen
      if (rnd() < 0.45) options.push(options.shift());
      if (rnd() < 0.5) [options[1], options[2]] = [options[2], options[1]];
      let moved = false;
      for (const d of options) {
        const nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= n || nc >= n || visited[nr * n + nc]) continue;
        r = nr; c = nc; dir = d;
        visited[r * n + c] = 1;
        cells.push(r * n + c);
        moved = true;
        break;
      }
      if (!moved) break;
    }
    if (!ok) continue;
    const mask = new Uint8Array(n * n);
    mask[cells[0]] |= bit(startOut);
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1], b = cells[k];
      const d = b === a - n ? 0 : b === a + 1 ? 1 : b === a + n ? 2 : 3;
      mask[a] |= bit(d); mask[b] |= bit(opp(d));
    }
    mask[cells[cells.length - 1]] |= bit(endOut);
    return { cells, mask, start: cells[0], startOut, end: cells[cells.length - 1], endOut };
  }
}

// Sucht bis zu `limit` Lösungen. given[i] = Maske oder -1.
export function solve(n, rowC, colC, start, startOut, end, endOut, given, limit = 2) {
  const total = rowC.reduce((a, b) => a + b, 0);
  const rowU = new Array(n).fill(0), colU = new Array(n).fill(0);
  const visited = new Uint8Array(n * n);
  const mask = new Uint8Array(n * n);
  const givenCount = given.filter((g) => g >= 0).length;
  const er = Math.floor(end / n), ec = end % n;
  const found = [];
  let givenSeen = 0;
  let nodes = 0;
  const NODE_LIMIT = 4e6;

  function visit(i, on) {
    const r = Math.floor(i / n), c = i % n, d = on ? 1 : -1;
    visited[i] = on ? 1 : 0; rowU[r] += d; colU[c] += d;
    if (given[i] >= 0) givenSeen += d;
  }

  function dfs(i, inSide, len) {
    if (found.length >= limit || ++nodes > NODE_LIMIT) return;
    const r = Math.floor(i / n), c = i % n;
    for (let out = 0; out < 4; out++) {
      if (out === inSide) continue;
      if (i === end && out !== endOut) continue;
      const m = bit(inSide) | bit(out);
      if (given[i] >= 0 && given[i] !== m) continue;
      if (i === end) {
        if (len === total && givenSeen === givenCount &&
            rowU.every((u, k) => u === rowC[k]) && colU.every((u, k) => u === colC[k])) {
          mask[i] = m;
          found.push(Array.from(mask));
        }
        continue;
      }
      const nr = r + DR[out], nc = c + DC[out];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const j = nr * n + nc;
      if (visited[j] || rowU[nr] >= rowC[nr] || colU[nc] >= colC[nc]) continue;
      if (given[j] >= 0 && !(given[j] & bit(opp(out)))) continue;
      const remaining = total - (len + 1);
      const dist = Math.abs(nr - er) + Math.abs(nc - ec);
      if (dist > remaining || (remaining - dist) % 2) continue;
      mask[i] = m;
      visit(j, true);
      dfs(j, opp(out), len + 1);
      visit(j, false);
      mask[i] = 0;
      if (found.length >= limit) return;
    }
  }
  visit(start, true);
  dfs(start, startOut, 1);
  return { solutions: found, aborted: nodes > NODE_LIMIT };
}

// Erzeugt ein Rätsel mit eindeutiger Lösung.
export function generatePuzzle(n, rnd, { startSide, startPos = null, endSides, extraGivens = 0 }) {
  for (let attempt = 1; ; attempt++) {
    const P = randomPath(n, rnd, { startSide, startPos, endSides });
    const rowC = new Array(n).fill(0), colC = new Array(n).fill(0);
    for (const i of P.cells) { rowC[Math.floor(i / n)]++; colC[i % n]++; }
    const given = new Array(n * n).fill(-1);
    given[P.start] = P.mask[P.start];
    given[P.end] = P.mask[P.end];
    const run = () => solve(n, rowC, colC, P.start, P.startOut, P.end, P.endOut, given, 2);

    // Vorgaben hinzufügen, bis die Lösung eindeutig ist: jeweils ein Feld,
    // in dem sich eine andere Lösung von der richtigen unterscheidet.
    let unique = false;
    for (let step = 0; step < n * n; step++) {
      const { solutions, aborted } = run();
      if (aborted) break;
      const alt = solutions.find((sol) => sol.some((m, i) => m !== P.mask[i]));
      if (!alt) { unique = true; break; }
      const diff = P.cells.filter((i) => alt[i] !== P.mask[i] && given[i] < 0);
      if (!diff.length) break;
      const i = diff[Math.floor(rnd() * diff.length)];
      given[i] = P.mask[i];
    }
    if (!unique) continue;

    // Überflüssige Vorgaben wieder entfernen (macht es kniffliger) ...
    for (const i of P.cells.filter((k) => given[k] >= 0 && k !== P.start && k !== P.end)) {
      const keep = given[i];
      given[i] = -1;
      const { solutions, aborted } = run();
      if (aborted || solutions.length !== 1) given[i] = keep;
    }
    // ... und für leichtere Rätsel ein paar zusätzliche Hilfen geben.
    const free = P.cells.filter((i) => given[i] < 0);
    const extra = Math.round(free.length * extraGivens);
    for (let k = 0; k < extra; k++) {
      const pick = free.splice(Math.floor(rnd() * free.length), 1)[0];
      given[pick] = P.mask[pick];
    }
    return {
      n, rowC, colC, given, solution: Array.from(P.mask),
      start: P.start, startOut: P.startOut, end: P.end, endOut: P.endOut, attempts: attempt,
    };
  }
}

export function generateLevel(level) {
  const { n, seed, extraGivens } = levelParams(level);
  const rnd = mulberry32(seed);
  const startSide = rnd() < 0.5 ? 3 : 0; // links oder oben
  return { ...generatePuzzle(n, rnd, { startSide, endSides: [1, 2], extraGivens }), level };
}

// ---------- Großstrecke ----------
// Mehrere Felder ergeben zusammen eine Karte; die Strecke läuft von Feld zu
// Feld weiter, in Schlangenreihenfolge durch die Karte.
export function routeParams(route) {
  const count = [2, 4, 6][(route - 1) % 3];
  const n = route <= 3 ? 9 : 10;
  const layout = count === 2 ? { rows: 2, cols: 1 } : count === 4 ? { rows: 2, cols: 2 } : { rows: 3, cols: 2 };
  const order = [];
  for (let r = 0; r < layout.rows; r++)
    for (let k = 0; k < layout.cols; k++) order.push([r, r % 2 === 0 ? k : layout.cols - 1 - k]);
  return { route, n, count, layout, order, seed: route * 9973 + 3301, extraGivens: Math.max(0, 0.1 - route * 0.01) };
}

// Ein Feld der Großstrecke erzeugen. `entry` = {side, pos} des Einstiegs
// (vom vorigen Feld), für das erste Feld null.
export function generateRoutePanel(route, k, entry) {
  const P = routeParams(route);
  const { n, order, layout } = P;
  const rnd = mulberry32(P.seed + k * 7919);
  const [r, c] = order[k];
  const startSide = entry ? entry.side : 3; // erstes Feld: Einstieg von links
  const startPos = entry ? entry.pos : null;
  let endSides;
  if (k < order.length - 1) {
    const [nr, nc] = order[k + 1];
    endSides = [nr > r ? 2 : nr < r ? 0 : nc > c ? 1 : 3];
  } else {
    // letztes Feld: Ausgang an einer Außenkante der Karte (nicht die Einstiegsseite)
    endSides = [0, 1, 2, 3].filter((d) => d !== startSide &&
      ((d === 0 && r === 0) || (d === 2 && r === layout.rows - 1) || (d === 3 && c === 0) || (d === 1 && c === layout.cols - 1)));
  }
  const pz = generatePuzzle(n, rnd, { startSide, startPos, endSides, extraGivens: P.extraGivens });
  return { ...pz, row: r, col: c, k };
}

// Einstieg ins nächste Feld = gegenüberliegende Seite, gleiche Position
export function nextEntry(panel) {
  const { n, end, endOut } = panel;
  return { side: opp(endOut), pos: endOut === 0 || endOut === 2 ? end % n : Math.floor(end / n) };
}

// Ganze Strecke auf einmal (nur für Tests)
export function generateRoute(route) {
  const P = routeParams(route);
  const panels = [];
  let entry = null;
  for (let k = 0; k < P.count; k++) {
    const p = generateRoutePanel(route, k, entry);
    panels.push(p);
    entry = nextEntry(p);
  }
  return { ...P, panels };
}
