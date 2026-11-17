// Generator für Gleisbau.
// Regeln: Eine einzige, durchgehende Strecke ohne Abzweigungen läuft vom
// Start (am Rand) zum Ziel (am Rand). Die Zahlen oben/links geben an, wie
// viele Felder der Spalte/Zeile Gleise enthalten. Einige Teile sind vorgegeben,
// gesperrte Felder (Felsen) können nicht befahren werden.
//
// Felder speichern ihre Verbindungen als Bitmaske:
// 1 = oben, 2 = rechts, 4 = unten, 8 = links.
// Seiten/Richtungen: 0 oben, 1 rechts, 2 unten, 3 links.
// Felder sind W breit und H hoch, Index i = r * W + c.
//
// Jedes Rätsel wird mit einem logischen Löser geprüft, der nur Schlüsse zieht,
// die man auch im Kopf macht (siehe logicSolve). Löst er das Rätsel ganz, ist
// die Lösung eindeutig und ohne Raten erreichbar.

import { mulberry32, shuffle } from '../../rng.js';

export const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
export const bit = (d) => 1 << d;
export const opp = (d) => (d + 2) % 4;
export const VERSION = 2; // Datenformat (für gespeicherte Großstrecken)

// ---------- Stufen ----------
export function levelParams(level) {
  const seed = level * 7349 + 5651;
  let W, H;
  if (level <= 2) [W, H] = [8, 8];
  else if (level <= 6) [W, H] = [10, 12];
  else if (level <= 15) [W, H] = [12, 15];
  else if (level <= 30) [W, H] = [14, 18];
  else if (level <= 50) [W, H] = [16, 20];
  else [W, H] = level % 2 ? [16, 21] : [18, 24];
  // ab Level 8 jedes dritte Level mit Felsen
  const rocks = level >= 8 && level % 3 === 2;
  // Anteil zusätzlicher Vorgaben (über die nötigen hinaus): nur am Anfang
  const extraGivens = Math.max(0, 0.12 - level * 0.02);
  return { W, H, seed, rocks, extraGivens };
}

// ---------- Geometrie ----------
// Kanten: senkrechte Linien (zwischen Spalten) H*(W+1), danach waagrechte
// Linien (zwischen Zeilen) (H+1)*W. Randkanten gehören zu nur einem Feld.
function geometry(W, H) {
  const HO = H * (W + 1), E = HO + (H + 1) * W, N = W * H;
  const cellEdge = new Int32Array(N * 4);
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      cellEdge[i * 4] = HO + r * W + c;
      cellEdge[i * 4 + 2] = HO + (r + 1) * W + c;
      cellEdge[i * 4 + 3] = r * (W + 1) + c;
      cellEdge[i * 4 + 1] = r * (W + 1) + c + 1;
    }
  const ea = new Int32Array(E).fill(-1), eb = new Int32Array(E).fill(-1);
  for (let e = 0; e < E; e++) {
    if (e < HO) {
      const r = Math.floor(e / (W + 1)), x = e % (W + 1);
      if (x > 0) ea[e] = r * W + x - 1;
      if (x < W) eb[e] = r * W + x;
    } else {
      const y = Math.floor((e - HO) / W), c = (e - HO) % W;
      if (y > 0) ea[e] = (y - 1) * W + c;
      if (y < H) eb[e] = y * W + c;
    }
  }
  return { W, H, N, E, cellEdge, ea, eb };
}

// ---------- Logischer Löser ohne Raten ----------
// Schlussregeln:
//  A) Jedes Feld hat 0 oder 2 Anschlüsse: zwei sicher → Rest weg; nur noch zwei
//     möglich und Feld gehört zur Strecke → beide; weniger als zwei möglich → leer.
//  B) Zahlen: Zeile/Spalte voll → übrige Felder leer; genau so viele mögliche
//     Felder wie nötig → alle gehören zur Strecke.
//  C) Keine Ringe: zwei Enden desselben Gleisstücks dürfen nicht verbunden werden;
//     Start- und Zielstück nur, wenn damit alle Gleise verbaut sind.
//  D) kurze Folgerungskette: Anschluss (bzw. kein Anschluss) führt allein mit A–C
//     zu einem Widerspruch → das Gegenteil gilt.
// puz: { W, H, rowC, colC, start, startOut, end, endOut, given, blocked }
// Ergebnis: { solved, es, ct, chains } – es Kantenstand, ct Feldstand (-1/0/1)
export function logicSolve(puz, { chains: useChains = true } = {}) {
  const G = geometry(puz.W, puz.H);
  const st = initState(puz, G);
  if (!st) return { solved: false, chains: 0 };
  const { es, ct } = st;
  const ctx = { puz, G, total: puz.rowC.reduce((a, b) => a + b, 0) };
  let chains = 0;
  if (!propagate(ctx, es, ct)) return { solved: false, es, ct, chains };
  while (useChains && !isDone(es)) {
    const r = chainStep(ctx, es, ct);
    if (r === 0) break;
    if (r < 0) return { solved: false, es, ct, chains };
    chains++;
  }
  return { solved: isDone(es), es, ct, chains };
}

const isDone = (es) => es.indexOf(-1) < 0;

function initState(puz, G) {
  const { W, H, N, E, cellEdge, ea, eb } = G;
  const es = new Int8Array(E).fill(-1), ct = new Int8Array(N).fill(-1);
  const set = (e, v) => { if (es[e] >= 0 && es[e] !== v) return false; es[e] = v; return true; };
  // Randkanten: nur Start- und Zielausgang
  for (let e = 0; e < E; e++) if (ea[e] < 0 || eb[e] < 0) es[e] = 0;
  es[cellEdge[puz.start * 4 + puz.startOut]] = 1;
  es[cellEdge[puz.end * 4 + puz.endOut]] = 1;
  for (let i = 0; i < N; i++) {
    if (puz.blocked && puz.blocked[i]) {
      ct[i] = 0;
      for (let d = 0; d < 4; d++) if (!set(cellEdge[i * 4 + d], 0)) return null;
    }
    const g = puz.given[i];
    if (g >= 0) {
      ct[i] = g ? 1 : 0;
      for (let d = 0; d < 4; d++) if (!set(cellEdge[i * 4 + d], g & bit(d) ? 1 : 0)) return null;
    }
  }
  return { es, ct };
}

// Regeln A–C bis zum Stillstand. false bei Widerspruch.
function propagate(ctx, es, ct) {
  const { puz, G, total } = ctx;
  const { W, H, N, cellEdge, ea, eb } = G;
  const comp = ctx.comp || (ctx.comp = new Int32Array(N));
  const csize = ctx.csize || (ctx.csize = new Int32Array(N));
  const stack = ctx.stack || (ctx.stack = new Int32Array(N));
  for (;;) {
    let changed = false;
    // A) Felder
    for (let i = 0; i < N; i++) {
      let on = 0, unk = 0;
      for (let d = 0; d < 4; d++) { const v = es[cellEdge[i * 4 + d]]; if (v === 1) on++; else if (v < 0) unk++; }
      if (on > 2) return false;
      if (on >= 1) { if (ct[i] === 0) return false; if (ct[i] < 0) { ct[i] = 1; changed = true; } }
      if (!unk) { if (on === 1) return false; if (on === 0 && ct[i] < 0) { ct[i] = 0; changed = true; } continue; }
      let to = -1;
      if (on === 2 || ct[i] === 0 || on + unk < 2) to = 0;
      else if (on + unk === 2 && (ct[i] === 1 || on === 1)) to = 1;
      if (to < 0) continue;
      if (to === 0 && on === 0) { if (ct[i] === 1) return false; ct[i] = 0; }
      if (to === 1) ct[i] = 1;
      for (let d = 0; d < 4; d++) { const e = cellEdge[i * 4 + d]; if (es[e] < 0) es[e] = to; }
      changed = true;
    }
    // B) Zahlen
    for (let line = 0; line < W + H; line++) {
      const isRow = line < H, k = isRow ? line : line - H;
      const len = isRow ? W : H, need = isRow ? puz.rowC[k] : puz.colC[k];
      const at = (j) => (isRow ? k * W + j : j * W + k);
      let t = 0, u = 0;
      for (let j = 0; j < len; j++) { const v = ct[at(j)]; if (v === 1) t++; else if (v < 0) u++; }
      if (t > need || t + u < need) return false;
      if (!u || (t !== need && t + u !== need)) continue;
      const to = t === need ? 0 : 1;
      for (let j = 0; j < len; j++) if (ct[at(j)] < 0) ct[at(j)] = to;
      changed = true;
    }
    if (changed) continue;
    // C) Gleisstücke
    comp.fill(-1);
    let nc = 0;
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0) continue;
      let sp = 0, size = 0, edges = 0;
      stack[sp++] = i; comp[i] = nc;
      while (sp) {
        const a = stack[--sp];
        size++;
        for (let d = 0; d < 4; d++) {
          const e = cellEdge[a * 4 + d];
          if (es[e] !== 1) continue;
          const b = ea[e] === a ? eb[e] : ea[e];
          if (b < 0) continue;
          edges++;
          if (comp[b] < 0) { comp[b] = nc; stack[sp++] = b; }
        }
      }
      if (edges / 2 >= size) return false; // Ring
      csize[nc++] = size;
    }
    const cS = comp[puz.start], cE = comp[puz.end];
    if (cS === cE) {
      // Strecke ist geschlossen: alles andere bleibt leer
      if (csize[cS] !== total) return false;
      for (let i = 0; i < N; i++) {
        if (comp[i] === cS) continue;
        if (ct[i] === 1) return false;
        if (ct[i] < 0) { ct[i] = 0; changed = true; }
      }
    } else {
      for (let e = 0; e < es.length; e++) {
        if (es[e] >= 0) continue;
        const a = comp[ea[e]], b = comp[eb[e]];
        if (a === b || ((a === cS && b === cE) || (a === cE && b === cS)) && csize[cS] + csize[cE] !== total) {
          es[e] = 0; changed = true;
        }
      }
    }
    if (!changed) return true;
  }
}

// D) Folgerungsketten für alle offenen Kanten (ein Durchgang).
// 1 = Fortschritt, 0 = nichts, -1 = Widerspruch
function chainStep(ctx, es, ct) {
  // Kanten an bekannten Gleisfeldern zuerst – dort sucht man auch im Kopf zuerst
  const { ea, eb } = ctx.G;
  const order = [], rest = [];
  for (let e = 0; e < es.length; e++) {
    if (es[e] >= 0) continue;
    (ct[ea[e]] === 1 || ct[eb[e]] === 1 ? order : rest).push(e);
  }
  const es2 = ctx.es2 || (ctx.es2 = new Int8Array(es.length));
  const ct2 = ctx.ct2 || (ctx.ct2 = new Int8Array(ct.length));
  let found = 0;
  for (const list of [order, rest]) {
    for (const e of list) {
      if (es[e] >= 0) continue;
      for (const v of [1, 0]) {
        es2.set(es); ct2.set(ct);
        es2[e] = v;
        if (!propagate(ctx, es2, ct2)) {
          es[e] = 1 - v;
          if (!propagate(ctx, es, ct)) return -1;
          found++;
          break;
        }
      }
    }
    if (found) return 1; // erst wieder bei bekannten Gleisen weitersuchen
  }
  return 0;
}

// Kantenstand → Masken je Feld
function masksFrom(G, es) {
  const m = new Uint8Array(G.N);
  for (let i = 0; i < G.N; i++) for (let d = 0; d < 4; d++) if (es[G.cellEdge[i * 4 + d]] === 1) m[i] |= bit(d);
  return m;
}

// ---------- Zufällige Strecke ----------
const sideCell = (W, H, side, pos) =>
  side === 0 ? pos : side === 1 ? pos * W + W - 1 : side === 2 ? (H - 1) * W + pos : pos * W;
const sideLen = (W, H, side) => (side % 2 === 0 ? W : H);

// Felsen: einige unregelmäßige Haufen (ca. 6–9 % der Felder)
function makeRocks(W, H, rnd, keep) {
  const N = W * H, blocked = new Uint8Array(N);
  const target = Math.round(N * (0.06 + rnd() * 0.03));
  let count = 0, tries = 0;
  while (count < target && tries++ < 400) {
    let r = Math.floor(rnd() * H), c = Math.floor(rnd() * W);
    const size = 2 + Math.floor(rnd() * 5);
    for (let s = 0; s < size && count < target; s++) {
      const i = r * W + c;
      if (!blocked[i] && !keep.has(i)) { blocked[i] = 1; count++; }
      const d = Math.floor(rnd() * 4);
      const nr = r + DR[d], nc = c + DC[d];
      if (nr >= 0 && nc >= 0 && nr < H && nc < W) { r = nr; c = nc; }
    }
  }
  return blocked;
}

// Strecke vom Start zum Ziel, dann durch Ausbuchtungen verlängert:
// ein gerades Stück a→b wird durch a→a'→b'→b ersetzt (a', b' seitlich daneben).
function randomPath(W, H, rnd, blocked, { start, startOut, endSides, fill }) {
  const N = W * H;
  // mögliche Ziele
  const ends = [];
  for (const side of endSides)
    for (let p = 0; p < sideLen(W, H, side); p++) {
      const i = sideCell(W, H, side, p);
      if (i !== start && !blocked[i] && !(i === start && side === startOut)) ends.push([i, side]);
    }
  if (!ends.length) return null;
  const [end, endOut] = ends[Math.floor(rnd() * ends.length)];
  // Weg suchen (Breitensuche mit zufälliger Reihenfolge)
  const prev = new Int32Array(N).fill(-2);
  prev[start] = -1;
  const queue = [start];
  for (let q = 0; q < queue.length && prev[end] === -2; q++) {
    const a = queue[q], r = Math.floor(a / W), c = a % W;
    for (const d of shuffle([0, 1, 2, 3], rnd)) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      const b = nr * W + nc;
      if (blocked[b] || prev[b] !== -2) continue;
      prev[b] = a; queue.push(b);
    }
  }
  if (prev[end] === -2) return null;
  const path = [];
  for (let i = end; i !== -1; i = prev[i]) path.push(i);
  path.reverse();
  const inPath = new Uint8Array(N);
  for (const i of path) inPath[i] = 1;
  const free = N - blocked.reduce((a, b) => a + b, 0);
  const target = Math.round(free * fill);
  let fails = 0;
  while (path.length < target && fails < 4000) {
    const k = Math.floor(rnd() * (path.length - 1));
    const a = path[k], b = path[k + 1];
    const d = b - a === 1 ? 1 : b - a === -1 ? 3 : b > a ? 2 : 0;
    const p = (d + (rnd() < 0.5 ? 1 : 3)) % 4;
    const ar = Math.floor(a / W) + DR[p], ac = (a % W) + DC[p];
    const br = Math.floor(b / W) + DR[p], bc = (b % W) + DC[p];
    if (ar < 0 || ac < 0 || ar >= H || ac >= W || br < 0 || bc < 0 || br >= H || bc >= W) { fails++; continue; }
    const a2 = ar * W + ac, b2 = br * W + bc;
    if (blocked[a2] || blocked[b2] || inPath[a2] || inPath[b2]) { fails++; continue; }
    path.splice(k + 1, 0, a2, b2);
    inPath[a2] = inPath[b2] = 1;
    fails = 0;
  }
  if (path.length < target * 0.9) return null;
  const mask = new Uint8Array(N);
  mask[start] |= bit(startOut);
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const d = b === a - W ? 0 : b === a + 1 ? 1 : b === a + W ? 2 : 3;
    mask[a] |= bit(d); mask[b] |= bit(opp(d));
  }
  mask[end] |= bit(endOut);
  return { cells: path, mask, start, startOut, end, endOut };
}

// ---------- Rätsel ----------
// opts: { startSide, startPos (oder null), endSides, rocks, extraGivens }
export function generatePuzzle(W, H, rnd, { startSide, startPos = null, endSides, rocks = false, extraGivens = 0 }) {
  for (let attempt = 1; attempt < 200; attempt++) {
    const pos = startPos ?? Math.floor(rnd() * sideLen(W, H, startSide));
    const start = sideCell(W, H, startSide, pos);
    const blocked = rocks ? makeRocks(W, H, rnd, new Set([start])) : new Uint8Array(W * H);
    const P = randomPath(W, H, rnd, blocked, { start, startOut: startSide, endSides, fill: 0.5 + rnd() * 0.12 });
    if (!P) continue;
    const rowC = new Array(H).fill(0), colC = new Array(W).fill(0);
    for (const i of P.cells) { rowC[Math.floor(i / W)]++; colC[i % W]++; }
    // Strecke soll sich übers ganze Feld verteilen: höchstens eine leere Zeile/Spalte
    if (rowC.filter((x) => !x).length + colC.filter((x) => !x).length > 1) continue;
    const given = new Array(W * H).fill(-1);
    given[P.start] = P.mask[P.start];
    given[P.end] = P.mask[P.end];
    const puz = { W, H, rowC, colC, given, blocked: Array.from(blocked),
      start: P.start, startOut: P.startOut, end: P.end, endOut: P.endOut };
    const G = geometry(W, H);
    // Vorgaben sollen möglichst einzeln liegen, nicht als schon verbundene Stücke
    const touchesGiven = (i) => [0, 1, 2, 3].some((d) => {
      if (!(P.mask[i] & bit(d))) return false;
      const r = Math.floor(i / W) + DR[d], c = (i % W) + DC[d];
      return r >= 0 && c >= 0 && r < H && c < W && given[r * W + c] >= 0;
    });
    const pickLoose = (list) => {
      const loose = list.filter((i) => !touchesGiven(i));
      const from = loose.length ? loose : list;
      const i = from[Math.floor(rnd() * from.length)];
      list.splice(list.indexOf(i), 1);
      return i;
    };

    // Vorgaben hinzufügen, bis der Löser durchkommt: jeweils ein Gleisfeld, das
    // er noch nicht kennt.
    let ok = false;
    for (let step = 0; step < W * H; step++) {
      const res = logicSolve(puz);
      if (res.solved) {
        const m = masksFrom(G, res.es);
        ok = m.every((v, i) => v === P.mask[i]);
        break;
      }
      if (!res.es) break;
      const m = res.es ? masksFrom(G, res.es) : null;
      const open = P.cells.filter((i) => given[i] < 0 &&
        [0, 1, 2, 3].some((d) => res.es[G.cellEdge[i * 4 + d]] < 0));
      if (!open.length) break;
      // bei vielen offenen Feldern mehrere auf einmal (spart Zeit; Überflüssiges
      // wird unten wieder entfernt)
      for (let k = Math.max(1, Math.floor(open.length / 30)); k > 0 && open.length; k--) {
        const i = pickLoose(open);
        given[i] = P.mask[i];
      }
      void m;
    }
    if (!ok) continue;

    // Überflüssige Vorgaben wieder entfernen (macht es kniffliger) – zuerst die,
    // die an einer anderen Vorgabe hängen
    const removable = shuffle(P.cells.filter((k) => given[k] >= 0 && k !== P.start && k !== P.end), rnd);
    removable.sort((a, b) => touchesGiven(b) - touchesGiven(a));
    for (const i of removable) {
      const keep = given[i];
      given[i] = -1;
      if (!logicSolve(puz).solved) given[i] = keep;
    }
    // für die ersten Level ein paar zusätzliche Hilfen
    const free = P.cells.filter((i) => given[i] < 0);
    const extra = Math.round(free.length * extraGivens);
    for (let k = 0; k < extra; k++) {
      const pick = pickLoose(free);
      given[pick] = P.mask[pick];
    }
    const res = logicSolve(puz);
    return { ...puz, solution: Array.from(P.mask), attempts: attempt, chains: res.chains, v: VERSION };
  }
  throw new Error('Gleisbau: kein Rätsel gefunden');
}

export function generateLevel(level) {
  const { W, H, seed, rocks, extraGivens } = levelParams(level);
  const rnd = mulberry32(seed);
  const startSide = rnd() < 0.5 ? 3 : 0; // links oder oben
  return { ...generatePuzzle(W, H, rnd, { startSide, endSides: [1, 2], rocks, extraGivens }), level };
}

// ---------- Großstrecke ----------
// Mehrere quadratische Felder ergeben zusammen eine Karte; die Strecke läuft
// von Feld zu Feld weiter, in Schlangenreihenfolge durch die Karte.
export function routeParams(route) {
  const count = [2, 4, 6][(route - 1) % 3];
  const n = route <= 3 ? 12 : route <= 9 ? 14 : 16;
  const layout = count === 2 ? { rows: 2, cols: 1 } : count === 4 ? { rows: 2, cols: 2 } : { rows: 3, cols: 2 };
  const order = [];
  for (let r = 0; r < layout.rows; r++)
    for (let k = 0; k < layout.cols; k++) order.push([r, r % 2 === 0 ? k : layout.cols - 1 - k]);
  return { route, n, count, layout, order, seed: route * 9973 + 3301 };
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
  const rocks = (route + k) % 3 === 1 && route > 1;
  const pz = generatePuzzle(n, n, rnd, { startSide, startPos, endSides, rocks });
  return { ...pz, row: r, col: c, k };
}

// Einstieg ins nächste Feld = gegenüberliegende Seite, gleiche Position
export function nextEntry(panel) {
  const { W, end, endOut } = panel;
  return { side: opp(endOut), pos: endOut === 0 || endOut === 2 ? end % W : Math.floor(end / W) };
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
