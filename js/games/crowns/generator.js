// Generator für Kronenfeld.
// Regeln: N×N Felder, N farbige Regionen. Genau k Kronen pro Zeile, Spalte
// und Region (k = 1, 2 oder 3); Kronen berühren sich nicht (auch nicht diagonal).
//
// Vorgehen: 1) zufällige gültige Kronenverteilung, 2) Kronen zu Gruppen zu je k
// zusammenfassen und je Gruppe eine verwinkelte Region wachsen lassen,
// 3) Regionen so lange umbauen, bis der logische Löser (Schlussregeln, kein Raten)
// das Rätsel ganz löst – damit ist die Lösung zugleich eindeutig.
// Weil das für große Felder zu lange dauert, werden die Rätsel vorab erzeugt
// (tools/make-crowns-bank.js → bank.js) und im Spiel gedreht/gespiegelt verwendet.

import { mulberry32, shuffle } from '../../rng.js';
import { BANK } from './bank.js';

// Stufen: n = Feldgröße, k = Kronen je Zeile/Spalte/Region, bank = Schlüssel in bank.js.
// Die Rätsel kommen aus einer vorab berechneten Bank (tools/make-crowns-bank.js),
// weil das Erzeugen auf dem Handy zu lange dauern würde; jedes wird gedreht bzw.
// gespiegelt wiederverwendet. Fehlt eine Stufe in der Bank, wird direkt erzeugt.
export function levelParams(level) {
  const seed = level * 4243 + 2909;
  const P = (n, k) => ({ n, k, bank: `${n}-${k}`, seed });
  if (level <= 2) return P(7, 1);
  if (level <= 5) return P(9, 1);
  if (level <= 12) return P(10, 2);
  if (level <= 25) return P(11, 2);
  if (level <= 45) return P(12, 2);
  // danach im Wechsel: zweimal 14×14 mit 2 Kronen, dann 15×15 bzw. 16×16 mit 3 Kronen
  if (level % 3 === 0) return level > 60 && level % 6 === 0 ? P(16, 3) : P(15, 3);
  return P(14, 2);
}

// ---------- Hilfsstrukturen ----------
function context(n, k, reg) {
  const N = n * n;
  const groups = [];
  for (let r = 0; r < n; r++) groups.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) groups.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let g = 0; g < n; g++) groups.push([]);
  for (let i = 0; i < N; i++) groups[2 * n + reg[i]].push(i);
  const cellGroups = [], nb8 = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / n), c = i % n;
    cellGroups.push([r, n + c, 2 * n + reg[i]]);
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc);
      }
    nb8.push(out);
  }
  return { n, k, N, reg, groups, cellGroups, nb8 };
}

const touching = (n, a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;

// Gibt es unter `cells` `need` Felder, die sich paarweise nicht berühren?
function canFit(n, cells, need) {
  if (need <= 0) return true;
  if (cells.length < need) return false;
  const pick = [];
  function rec(from) {
    if (pick.length === need) return true;
    for (let a = from; a <= cells.length - (need - pick.length); a++) {
      const x = cells[a];
      if (pick.some((p) => touching(n, p, x))) continue;
      pick.push(x);
      if (rec(a + 1)) return true;
      pick.pop();
    }
    return false;
  }
  return rec(0);
}

// ---------- Grundregeln (für Löser und Lösungszähler) ----------
// Zustand je Feld: 0 offen, 1 Krone, 2 ausgeschlossen.
// Setzt eine Krone; false bei Widerspruch.
function star(ctx, st, i) {
  st[i] = 1;
  for (const j of ctx.nb8[i]) {
    if (st[j] === 1) return false;
    st[j] = 2;
  }
  return true;
}

// Wendet die Grundregeln an, bis sich nichts mehr ändert:
// Gruppe voll → Rest ausschließen; Gruppe hat genau so viele offene Felder wie
// noch Kronen fehlen → alle Kronen. Gibt false bei Widerspruch zurück.
// strict: zusätzlich prüfen, ob jede Gruppe und jeder Streifen aus zwei
// benachbarten Linien die fehlenden Kronen noch unterbringen kann.
function basic(ctx, st, strict = false) {
  const { k, groups, n } = ctx;
  for (let changed = true; changed;) {
    changed = false;
    for (const grp of groups) {
      let stars = 0, open = 0;
      for (const j of grp) { if (st[j] === 1) stars++; else if (st[j] === 0) open++; }
      const need = k - stars;
      if (need < 0) return false;
      if (need === 0) {
        if (open) { for (const j of grp) if (st[j] === 0) st[j] = 2; changed = true; }
      } else if (open < need) return false;
      else if (open === need) {
        for (const j of grp) if (st[j] === 0 && !star(ctx, st, j)) return false;
        changed = true;
      }
    }
  }
  if (!strict) return true;
  const needs = groups.map((grp) => grp.reduce((t, j) => t - (st[j] === 1), k));
  for (let gi = 0; gi < groups.length; gi++) {
    if (needs[gi] > 1 && !canFit(n, groups[gi].filter((j) => st[j] === 0), needs[gi])) return false;
  }
  const isOpen = (j) => st[j] === 0;
  for (let l = 0; l < n - 1; l++)
    for (const base of [0, n]) {
      const a = base + l, b = a + 1;
      if (needs[a] + needs[b] > 1 && !stripFits(groups[a], groups[b], isOpen, needs[a], needs[b])) return false;
    }
  return true;
}

// ---------- Lösungen zählen ----------
// Findet bis zu `limit` Lösungen (je Lösung: sortierte Liste der Kronenfelder),
// wahlweise ausgehend von einem Zwischenstand `start` und mit begrenzter Suche
// (`budget` Knoten; danach wird abgebrochen und das bisher Gefundene geliefert).
export function findSolutions(n, k, reg, limit = 2, start = null, budget = Infinity) {
  const ctx = context(n, k, reg);
  const found = [];
  function rec(st) {
    if (found.length >= limit || --budget < 0) return;
    if (!basic(ctx, st, true)) return;
    // Gruppe mit den wenigsten Wahlmöglichkeiten
    let best = null, bestScore = Infinity;
    for (const grp of ctx.groups) {
      let stars = 0; const open = [];
      for (const j of grp) { if (st[j] === 1) stars++; else if (st[j] === 0) open.push(j); }
      if (k - stars > 0 && open.length < bestScore) { bestScore = open.length; best = open; }
    }
    if (!best) {
      const s = [];
      for (let i = 0; i < ctx.N; i++) if (st[i] === 1) s.push(i);
      found.push(s);
      return;
    }
    const i = best[0];
    const a = st.slice();
    if (star(ctx, a, i)) rec(a);
    const b = st.slice();
    b[i] = 2;
    rec(b);
  }
  rec(start ? start.slice() : new Uint8Array(ctx.N));
  return found;
}

export function countSolutions(n, k, reg, limit = 2) {
  return findSolutions(n, k, reg, limit).length;
}

// Passen in einen Streifen aus zwei benachbarten Zeilen (oder Spalten) genau
// needA Kronen in die erste und needB in die zweite Linie? Positionsweise:
// je Position höchstens eine Krone, und keine an zwei benachbarten Positionen.
function stripFits(cellsA, cellsB, isOpen, needA, needB) {
  if (needA < 0 || needB < 0) return false;
  // Erreichbare Zählstände (ta, tb) als Bitmaske, Bit ta * 4 + tb (needA, needB ≤ 3);
  // free: vorige Position ohne Krone, used: vorige Position mit Krone
  let valid = 0;
  for (let ta = 0; ta <= needA; ta++) for (let tb = 0; tb <= needB; tb++) valid |= 1 << (ta * 4 + tb);
  let free = 1, used = 0;
  for (let p = 0; p < cellsA.length; p++) {
    let nu = 0;
    if (isOpen(cellsA[p])) nu |= free << 4;
    if (isOpen(cellsB[p])) nu |= (free << 1) & 0xeeee;
    free |= used;
    used = nu & valid;
  }
  return !!((free | used) >> (needA * 4 + needB) & 1);
}

// ---------- Logischer Löser ohne Raten ----------
// Regeln, wie man sie auch im Kopf anwendet (in dieser Reihenfolge versucht):
//  A) Grundregeln: Nachbarn einer Krone fallen weg; Gruppe voll → Rest weg;
//     genau so viele offene Felder wie fehlende Kronen → alle Kronen
//  B) Ohne dieses Feld bekäme eine Zeile/Spalte/Region ihre Kronen nicht unter → Krone
//  C) Zählregel: Regionen liegen ganz in Zeilen (Spalten), denen zusammen genau so viele
//     Kronen fehlen wie ihnen → dort keine anderen Regionen; ebenso umgekehrt
//  D) Eine Krone hier ließe einer Zeile/Spalte/Region zu wenig Platz → Feld weg
//  E) wie B und D, aber für zwei benachbarte Zeilen/Spalten zusammen (2×2-Überlegung)
//  F) kurze Folgerungskette bis zum Widerspruch (siehe chain)
// Ergebnis: { solved, st, score, used }. st ist der erreichte Stand.
export function logicSolve(n, k, reg) {
  const ctx = context(n, k, reg);
  const { groups, N, nb8, cellGroups } = ctx;
  const st = new Uint8Array(N);
  let score = 0;
  const used = { B: 0, C: 0, D: 0, E: 0, F: 0 };
  // Streifen aus zwei benachbarten Zeilen bzw. Spalten
  const strips = [], stripsOf = Array.from({ length: N }, () => []);
  for (let l = 0; l < n - 1; l++)
    for (const base of [0, n]) {
      const id = strips.length;
      strips.push([base + l, base + l + 1]);
      for (const j of groups[base + l]) stripsOf[j].push(id);
      for (const j of groups[base + l + 1]) stripsOf[j].push(id);
    }

  const needOf = (gi) => { let s = k; for (const j of groups[gi]) if (st[j] === 1) s--; return s; };
  const fail = () => ({ solved: false, st, score, used });

  // Bleibt alles erfüllbar, wenn die Felder in `gone` wegfallen und (optional)
  // auf `at` eine Krone steht? Geprüft werden nur betroffene Gruppen bzw. Streifen.
  function feasible(gone, at, useStrips) {
    const isOpen = (j) => st[j] === 0 && !gone.has(j) && j !== at;
    const hit = (gi) => (at >= 0 && cellGroups[at].includes(gi) ? 1 : 0);
    const touched = new Set();
    if (!useStrips) {
      for (const j of gone) for (const gi of cellGroups[j]) touched.add(gi);
      if (at >= 0) for (const gi of cellGroups[at]) touched.add(gi);
      for (const gi of touched) {
        const need = needOf(gi) - hit(gi);
        if (need < 0) return false;
        if (need > 0 && !canFit(n, groups[gi].filter(isOpen), need)) return false;
      }
      return true;
    }
    for (const j of gone) for (const s of stripsOf[j]) touched.add(s);
    if (at >= 0) for (const s of stripsOf[at]) touched.add(s);
    for (const s of touched) {
      const [ga, gb] = strips[s];
      if (!stripFits(groups[ga], groups[gb], isOpen, needOf(ga) - hit(ga), needOf(gb) - hit(gb))) return false;
    }
    return true;
  }
  // Was eine Krone auf i sofort ausschließt
  function goneByStar(i) {
    const gone = new Set(nb8[i].filter((j) => st[j] === 0));
    for (const gi of cellGroups[i]) if (needOf(gi) === 1) for (const j of groups[gi]) if (st[j] === 0 && j !== i) gone.add(j);
    return gone;
  }

  // Krone erzwungen (B bzw. E) oder Feld ausgeschlossen (D bzw. E)
  function hypo(useStrips, forceStar, forceEmpty) {
    let changed = false;
    for (let i = 0; i < N; i++) {
      if (st[i] !== 0) continue;
      if (forceStar && !feasible(new Set([i]), -1, useStrips)) {
        star(ctx, st, i);
        return true;
      }
      if (forceEmpty && !feasible(goneByStar(i), i, useStrips)) { st[i] = 2; changed = true; }
    }
    return changed;
  }

  // F) Kurze Folgerungskette: Krone (bzw. keine Krone) hier führt allein mit den
  //    Grundregeln zu einem Widerspruch → das Gegenteil gilt.
  function chain() {
    for (let i = 0; i < N; i++) {
      if (st[i] !== 0) continue;
      const a = st.slice();
      if (!star(ctx, a, i) || !basic(ctx, a, true)) { st[i] = 2; return true; }
      const b = st.slice();
      b[i] = 2;
      if (!basic(ctx, b, true)) { star(ctx, st, i); return true; }
    }
    return false;
  }

  function ruleC() {
    const popNeed = (mask, needs) => { let t = 0; for (let x = 0; mask; x++, mask >>= 1) if (mask & 1) t += needs[x]; return t; };
    // src: Bitmasken (welche Ziele berührt jede Quelle), Bedarf von Quellen und Zielen.
    // Findet Quellen-Mengen (bis 4), deren Bedarf genau dem der berührten Ziele entspricht.
    function find(srcMask, srcNeed, dstNeed, apply) {
      const ids = [];
      for (let x = 0; x < n; x++) if (srcNeed[x] > 0) ids.push(x);
      let changed = false;
      const rec = (from, mask, need, set) => {
        if (set.length && need === popNeed(mask, dstNeed) && apply(set, mask)) changed = true;
        if (set.length === 4) return;
        for (let a = from; a < ids.length; a++) {
          const x = ids[a];
          set.push(x);
          rec(a + 1, mask | srcMask[x], need + srcNeed[x], set);
          set.pop();
        }
      };
      rec(0, 0, 0, []);
      return changed;
    }
    const regNeed = [], regCells = [];
    for (let g = 0; g < n; g++) { regNeed.push(needOf(2 * n + g)); regCells.push(groups[2 * n + g]); }
    for (const rows of [true, false]) {
      const lineOf = (i) => (rows ? Math.floor(i / n) : i % n);
      const lineGi = (l) => (rows ? 0 : n) + l;
      const lineNeed = [], regMask = new Array(n).fill(0), lineMask = new Array(n).fill(0);
      for (let l = 0; l < n; l++) lineNeed.push(needOf(lineGi(l)));
      for (let i = 0; i < N; i++) if (st[i] === 0) { regMask[reg[i]] |= 1 << lineOf(i); lineMask[lineOf(i)] |= 1 << reg[i]; }
      // Regionen ganz in Linien → in diesen Linien keine anderen Regionen
      const c1 = find(regMask, regNeed, lineNeed, (set, mask) => {
        let ch = false;
        for (let l = 0; l < n; l++) if (mask >> l & 1)
          for (const j of groups[lineGi(l)]) if (st[j] === 0 && !set.includes(reg[j])) { st[j] = 2; ch = true; }
        return ch;
      });
      if (c1) return true;
      // Linien ganz in Regionen → diese Regionen nicht außerhalb dieser Linien
      const c2 = find(lineMask, lineNeed, regNeed, (set, mask) => {
        let ch = false;
        for (let g = 0; g < n; g++) if (mask >> g & 1)
          for (const j of regCells[g]) if (st[j] === 0 && !set.includes(lineOf(j))) { st[j] = 2; ch = true; }
        return ch;
      });
      if (c2) return true;
    }
    return false;
  }

  for (;;) {
    if (!basic(ctx, st)) return fail();
    if (st.every((s) => s !== 0)) break;
    if (hypo(false, true, false)) { used.B++; score += 1; continue; }
    if (ruleC()) { used.C++; score += 2; continue; }
    if (hypo(false, false, true)) { used.D++; score += 2; continue; }
    if (hypo(true, true, true)) { used.E++; score += 3; continue; }
    if (chain()) { used.F++; score += 4; continue; }
    return fail();
  }
  for (let gi = 0; gi < groups.length; gi++) if (needOf(gi) !== 0) return fail();
  return { solved: true, st, score, used };
}

// ---------- Erzeugen ----------
// Zufällige Kronenverteilung: k Kronen je Zeile und Spalte, ohne Berührung
function randomSolution(n, k, rnd) {
  const colCnt = new Array(n).fill(0);
  const rows = [];
  // alle Teilmengen von k nicht benachbarten Spalten
  const combos = [];
  (function gen(from, cur) {
    if (cur.length === k) { combos.push(cur.slice()); return; }
    for (let c = from; c < n; c++) { cur.push(c); gen(c + 2, cur); cur.pop(); }
  })(0, []);
  let budget = 20000;
  function place(r) {
    if (r === n) return true;
    if (--budget < 0) return false;
    const left = n - r;
    for (let c = 0; c < n; c++) if (k - colCnt[c] > Math.ceil(left / 2)) return false;
    const prev = r ? rows[r - 1] : [];
    for (const combo of shuffle(combos.slice(), rnd)) {
      if (combo.some((c) => colCnt[c] >= k || prev.some((p) => Math.abs(p - c) <= 1))) continue;
      combo.forEach((c) => colCnt[c]++);
      rows[r] = combo;
      if (place(r + 1)) return true;
      combo.forEach((c) => colCnt[c]--);
    }
    return false;
  }
  if (!place(0)) return null;
  const stars = [];
  rows.forEach((cs, r) => cs.forEach((c) => stars.push(r * n + c)));
  return stars;
}

const nb4 = (n, i) => {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
  return out;
};

// Kronen in Gruppen zu je k aufteilen, je Gruppe eine Region bilden
function buildRegions(n, k, stars, rnd) {
  const N = n * n;
  const reg = new Int16Array(N).fill(-1);
  const isStar = new Set(stars);
  // Gruppen: nahe beieinander liegende Kronen
  const left = shuffle(stars.slice(), rnd);
  const teams = [];
  const dist = (a, b) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n));
  while (left.length) {
    const a = left.pop();
    const team = [a];
    while (team.length < k) {
      let bi = -1, bd = Infinity;
      left.forEach((b, x) => { const d = dist(a, b) + rnd() * 3; if (d < bd) { bd = d; bi = x; } });
      team.push(left.splice(bi, 1)[0]);
    }
    teams.push(team);
  }
  // Kronen einer Gruppe durch einen (leicht zufälligen) Weg verbinden
  for (let g = 0; g < n; g++) {
    const team = teams[g];
    reg[team[0]] = g;
    for (let t = 1; t < k; t++) {
      // Breitensuche von der Region g zur nächsten Krone, fremde Kronen meiden
      const target = team[t];
      const prev = new Int32Array(N).fill(-2);
      let queue = [];
      for (let i = 0; i < N; i++) if (reg[i] === g) { prev[i] = -1; queue.push(i); }
      let hit = false;
      while (queue.length && !hit) {
        const next = [];
        for (const i of shuffle(queue, rnd)) {
          for (const j of shuffle(nb4(n, i), rnd)) {
            if (prev[j] !== -2) continue;
            if (j !== target && (reg[j] !== -1 || isStar.has(j))) continue;
            prev[j] = i;
            if (j === target) { hit = true; break; }
            next.push(j);
          }
          if (hit) break;
        }
        queue = next;
      }
      if (!hit) return null;
      for (let j = target; prev[j] !== -1; j = prev[j]) reg[j] = g;
    }
  }
  // Restliche Felder verteilen: Wachstum bevorzugt Felder mit nur einem Nachbarn
  // derselben Region → schmale Arme und Haken statt runder Flächen
  const size = new Array(n).fill(0);
  for (let i = 0; i < N; i++) if (reg[i] >= 0) size[reg[i]]++;
  const weight = Array.from({ length: n }, () => 0.5 + rnd());
  let free = 0;
  for (let i = 0; i < N; i++) if (reg[i] < 0) free++;
  while (free > 0) {
    const cand = [];
    let total = 0;
    for (let i = 0; i < N; i++) {
      if (reg[i] !== -1) continue;
      const seen = new Map();
      for (const j of nb4(n, i)) if (reg[j] >= 0) seen.set(reg[j], (seen.get(reg[j]) || 0) + 1);
      for (const [g, same] of seen) {
        const w = weight[g] / Math.pow(size[g], 1.3) * (same === 1 ? 1 : same === 2 ? 0.25 : 0.08);
        cand.push([i, g, w]);
        total += w;
      }
    }
    let x = rnd() * total, pick = cand[0];
    for (const f of cand) { x -= f[2]; if (x <= 0) { pick = f; break; } }
    reg[pick[0]] = pick[1];
    size[pick[1]]++;
    free--;
  }
  return reg;
}

// Teile der Region von `skip`, die ohne `skip` zerfallen: Liste der Teilstücke
function piecesWithout(n, reg, skip) {
  const g = reg[skip], seen = new Set([skip]), pieces = [];
  for (const s of nb4(n, skip)) {
    if (reg[s] !== g || seen.has(s)) continue;
    const piece = [s], stack = [s];
    seen.add(s);
    while (stack.length) {
      const i = stack.pop();
      for (const j of nb4(n, i)) if (reg[j] === g && !seen.has(j)) { seen.add(j); piece.push(j); stack.push(j); }
    }
    pieces.push(piece);
  }
  return pieces;
}

// Mögliche Umbauten: Feld x (ohne echte Krone) in eine angrenzende Region.
// Zerfällt die alte Region dabei, wandern die abgetrennten Stücke ohne echte
// Krone mit. Kleine Umbauten werden bevorzugt.
function movesFor(n, reg, isTrue, cells) {
  const moves = [];
  for (const x of cells) {
    if (isTrue.has(x)) continue;
    const pieces = piecesWithout(n, reg, x);
    const orphans = pieces.filter((p) => !p.some((i) => isTrue.has(i)));
    if (pieces.length - orphans.length !== 1) continue;
    const carried = orphans.reduce((s, p) => s + p.length, 0);
    for (const j of nb4(n, x)) if (reg[j] !== reg[x]) moves.push([x, reg[j], orphans, carried]);
  }
  if (!moves.length) return moves;
  const minC = Math.min(...moves.map((m) => m[3]));
  return moves.filter((m) => m[3] <= minC + 2);
}

// Bringt die Regionen dahin, dass der logische Löser das Rätsel ganz löst (dann
// ist die Lösung zugleich eindeutig). Bleibt er stecken, wird ein noch offenes
// Feld ohne echte Krone in eine Nachbarregion verschoben: Jede andere Lösung mit
// einer Krone auf diesem Feld wird damit ungültig (die Nachbarregion hätte dort
// k+1 Kronen), die richtige Lösung bleibt gültig. Von einigen möglichen
// Umbauten wird der genommen, nach dem der Löser am weitesten kommt.
// Felder, auf denen eine kurz gesuchte andere Lösung Kronen hat, werden bevorzugt.
function makeLogical(n, k, reg, stars, rnd, maxSteps = 6 * n * k, tries = 8) {
  const isTrue = new Set(stars);
  const openCount = (st) => st.reduce((t, v) => t + (v === 0), 0);
  let res = logicSolve(n, k, reg);
  const tabu = []; // zuletzt verschobene Felder nicht gleich zurückschieben
  for (let step = 0; step < maxSteps; step++) {
    if (res.solved) return res;
    const alt = findSolutions(n, k, reg, 2, res.st, 300).find((s) => s.some((i) => !isTrue.has(i)));
    const altCells = alt ? alt.filter((i) => !isTrue.has(i) && !tabu.includes(i)) : [];
    const openCells = [];
    for (let i = 0; i < n * n; i++) if (res.st[i] === 0 && !isTrue.has(i) && !tabu.includes(i)) openCells.push(i);
    const moves = [
      ...shuffle(movesFor(n, reg, isTrue, altCells), rnd).slice(0, tries >> 1),
      ...shuffle(movesFor(n, reg, isTrue, openCells), rnd),
    ].slice(0, tries);
    if (!moves.length) {
      // keine offenen Felder umbaubar: andere Felder der Umgebung nehmen
      const near = new Set();
      for (let i = 0; i < n * n; i++) if (res.st[i] === 0) for (const j of nb4(n, i)) near.add(j);
      moves.push(...shuffle(movesFor(n, reg, isTrue, [...near]), rnd).slice(0, tries));
    }
    if (!moves.length) return null;
    let best = null;
    for (const [x, g, orphans] of moves) {
      const r2 = reg.slice();
      r2[x] = g;
      for (const p of orphans) for (const i of p) r2[i] = g;
      const res2 = logicSolve(n, k, r2);
      const score = res2.solved ? -1 : openCount(res2.st);
      if (!best || score < best.score) best = { score, r2, res2, x };
    }
    reg.set(best.r2);
    res = best.res2;
    tabu.push(best.x);
    if (tabu.length > 8) tabu.shift();
  }
  return res.solved ? res : null;
}

// Erzeugt ein Rätsel n×n mit k Kronen. Nimmt das erste mit Schwierigkeit ≥ minScore,
// sonst nach maxAttempts gelungenen Versuchen das schwerste.
export function generatePuzzle(n, k, seed, minScore = 0, maxAttempts = 12) {
  const rnd = mulberry32(seed);
  let best = null, done = 0;
  for (let attempt = 1; ; attempt++) {
    const stars = randomSolution(n, k, rnd);
    if (!stars) continue;
    const reg = buildRegions(n, k, stars, rnd);
    if (!reg) continue;
    const res = makeLogical(n, k, reg, stars, rnd);
    if (!res) continue;
    const L = { n, k, reg: Array.from(reg), stars: stars.slice().sort((a, b) => a - b), score: res.score, used: res.used, attempts: attempt };
    if (res.score >= minScore) return L;
    if (!best || res.score > best.score) best = L;
    if (++done >= maxAttempts) return best;
  }
}

// Rätsel aus der Bank, gedreht/gespiegelt (8 Möglichkeiten). Jede Stufe läuft
// die Bank in einer festen, gemischten Reihenfolge durch; danach mit anderer Drehung.
function fromBank(n, k, key, level) {
  const list = BANK[key];
  const idx = level;
  const order = shuffle([...list.keys()], mulberry32(list.length * 31 + n));
  const pick = order[idx % list.length];
  const t = (Math.floor(idx / list.length) * 3 + pick) % 8;
  const src = list[pick];
  const reg = new Array(n * n);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      let rr = r, cc = c;
      if (t & 1) cc = n - 1 - cc;
      if (t & 2) rr = n - 1 - rr;
      if (t & 4) [rr, cc] = [cc, rr];
      reg[r * n + c] = parseInt(src[rr * n + cc], 36);
    }
  const res = logicSolve(n, k, reg);
  const stars = [];
  for (let i = 0; i < n * n; i++) if (res.st[i] === 1) stars.push(i);
  return { n, k, reg, stars, score: res.score, used: res.used, attempts: 0 };
}

export function generateLevel(level) {
  const p = levelParams(level);
  const L = p.bank && BANK[p.bank]?.length ? fromBank(p.n, p.k, p.bank, level) : generatePuzzle(p.n, p.k, p.seed);
  return { ...L, level };
}
