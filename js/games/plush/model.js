// Kuschelfracht – Regeln, Zustand und Löser (ohne Browser nutzbar, auch im Worker und in Node).
//
// Brett aus Feldern (cols × rows), einzelne Felder können Wand sein.
// Formen (Polyominos) haben eine Farbe (oder sind grau = Hindernis, Farbe -1), lassen sich
// Feld für Feld schieben (axis 1 = nur waagerecht, 2 = nur senkrecht) und fassen je Quadrat
// ein Plüschtier. Gleichfarbige Plüschtiere sind für eine Form kein Hindernis: Schiebt man sie
// auf das Feld eines solchen Tiers, fällt es hinein (andersfarbige Tiere versperren den Weg;
// mehr Tiere, als noch Platz ist, kann sie nicht überfahren). Ist sie voll, verschwindet sie. Räume hängen außen am Rand an einem Türfeld; das vorderste
// Tier springt in eine gleichfarbige Form, die auf dem Türfeld steht, dann rückt das nächste nach.
// Verdeckte Formen (lock = k) sind gesperrt, bis insgesamt k Formen verschwunden sind.

export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- Formen ----------
const BASE = {
  1: [[[0, 0]]],
  2: [[[0, 0], [1, 0]]],
  3: [[[0, 0], [1, 0], [2, 0]], [[0, 0], [1, 0], [0, 1]]],
  4: [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
  ],
  5: [
    [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  ],
};
function normalize(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function orientations(cells) {
  const out = new Map();
  let cur = cells;
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      cur = cur.map(([x, y]) => [y, -x]);
      const n = normalize(cur);
      out.set(JSON.stringify(n), n);
    }
    cur = cur.map(([x, y]) => [-x, y]);
  }
  return [...out.values()];
}
// SHAPES[size] = Liste aller Lagen (gedreht/gespiegelt)
export const SHAPES = {};
for (const k in BASE) SHAPES[k] = BASE[k].flatMap(orientations);

// ---------- Vorberechnung je Level (nicht gespeichert) ----------
const cache = new WeakMap();
export function prep(L) {
  let P = cache.get(L);
  if (P) return P;
  const { cols, rows } = L, N = cols * rows;
  const nb = [];
  for (let i = 0; i < N; i++) {
    const x = i % cols, y = (i / cols) | 0, list = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !L.wall[ny * cols + nx]) list.push(ny * cols + nx);
    }
    nb.push(list);
  }
  const doorAt = new Int16Array(N).fill(-1);
  L.rooms.forEach((r, k) => { doorAt[r.door] = k; });
  const w = L.pieces.map((p) => 1 + Math.max(...p.cells.map((c) => c[0])));
  const h = L.pieces.map((p) => 1 + Math.max(...p.cells.map((c) => c[1])));
  P = { N, nb, doorAt, w, h, touch: null };
  cache.set(L, P);
  return P;
}

// Felder der Form p, wenn ihre linke obere Ecke auf a liegt (null = ragt hinaus)
export function cellsAt(L, p, a) {
  const P = prep(L), cols = L.cols;
  const ax = a % cols, ay = (a / cols) | 0;
  if (ax + P.w[p] > cols || ay + P.h[p] > L.rows) return null;
  return L.pieces[p].cells.map(([dx, dy]) => (ay + dy) * cols + ax + dx);
}

// ---------- Zustand ----------
export function initialState(L) {
  return {
    pos: Int16Array.from(L.pieces.map((p) => p.start)),
    fill: new Int8Array(L.pieces.length),
    plush: Int8Array.from(L.plush),
    room: new Int8Array(L.rooms.length),
    gone: 0,
  };
}
export function cloneState(s) {
  return { pos: Int16Array.from(s.pos), fill: Int8Array.from(s.fill), plush: Int8Array.from(s.plush), room: Int8Array.from(s.room), gone: s.gone };
}
export const packState = (s) => ({ pos: Array.from(s.pos), fill: Array.from(s.fill), plush: Array.from(s.plush), room: Array.from(s.room), gone: s.gone });
export const unpackState = (o) => ({ pos: Int16Array.from(o.pos), fill: Int8Array.from(o.fill), plush: Int8Array.from(o.plush), room: Int8Array.from(o.room), gone: o.gone });
export function stateKey(s) {
  return `${s.pos.join(',')}|${s.fill.join('')}|${s.room.join('')}|${s.gone}`;
}

export const isLocked = (L, s, p) => L.pieces[p].lock > s.gone;
export const isAlive = (s, p) => s.pos[p] >= 0;
export const canMove = (L, s, p) => s.pos[p] >= 0 && !isLocked(L, s, p);
export const size = (L, p) => L.pieces[p].cells.length;

// Belegung: -1 Wand, 0 frei, -10-c Plüschtier der Farbe c, p+1 Form p
export const plushCode = (c) => -10 - c;
export function occupancy(L, s) {
  const occ = new Int16Array(L.cols * L.rows);
  for (let i = 0; i < occ.length; i++) occ[i] = L.wall[i] ? -1 : s.plush[i] >= 0 ? plushCode(s.plush[i]) : 0;
  for (let p = 0; p < L.pieces.length; p++) {
    if (s.pos[p] < 0) continue;
    for (const c of cellsAt(L, p, s.pos[p])) occ[c] = p + 1;
  }
  return occ;
}

const dirAllowed = (axis, d) => axis === 0 || (axis === 1 ? d < 2 : d >= 2);

// Nächste Ecke beim Schritt in Richtung d (oder -1, wenn nicht möglich).
// cap = wie viele Tiere die Form noch fasst (so viele gleichfarbige darf sie neu überfahren).
export function stepTarget(L, occ, p, a, d, cap = 99) {
  const cols = L.cols, P = prep(L);
  if (!dirAllowed(L.pieces[p].axis, d)) return -1;
  const ax = a % cols + DIRS[d][0], ay = ((a / cols) | 0) + DIRS[d][1];
  if (ax < 0 || ay < 0 || ax + P.w[p] > cols || ay + P.h[p] > L.rows) return -1;
  const na = ay * cols + ax, mine = plushCode(L.pieces[p].color);
  let n = 0;
  for (const [dx, dy] of L.pieces[p].cells) {
    const v = occ[(ay + dy) * cols + ax + dx];
    if (v === 0 || v === p + 1) continue;
    if (v === mine && L.pieces[p].color >= 0) { n++; continue; }
    return -1;
  }
  return n > cap ? -1 : na;
}

// Würde Form p auf Ecke a ein Tier aufnehmen (gleichfarbiges Tier darunter oder Raumtür)?
export function touches(L, s, p, a, cells = cellsAt(L, p, a)) {
  const col = L.pieces[p].color;
  if (col < 0) return false;
  const { doorAt } = prep(L);
  for (const c of cells) {
    if (s.plush[c] === col) return true;
    const r = doorAt[c];
    if (r >= 0 && L.rooms[r].queue[s.room[r]] === col) return true;
  }
  return false;
}

// Form p nimmt gleichfarbige Tiere unter sich und aus dem Raum an ihrer Tür auf
// (ev: Ereignisliste für die Darstellung; k = Quadrat der Form, in das das Tier fällt)
export function absorb(L, s, occ, p, ev) {
  const piece = L.pieces[p];
  if (piece.color < 0 || s.pos[p] < 0 || piece.lock > s.gone) return;
  const { doorAt } = prep(L);
  const k = piece.cells.length, col = piece.color;
  const cells = cellsAt(L, p, s.pos[p]);
  cells.forEach((c, i) => {
    if (s.plush[c] === col && s.fill[p] < k) {
      s.plush[c] = -1;
      ev && ev.push({ t: 'take', p, from: c, k: i });
      s.fill[p]++;
    }
  });
  cells.forEach((c, i) => {
    const r = doorAt[c];
    if (r >= 0) {
      const q = L.rooms[r].queue;
      while (s.fill[p] < k && s.room[r] < q.length && q[s.room[r]] === col) {
        ev && ev.push({ t: 'room', p, r, idx: s.room[r], k: i });
        s.room[r]++; s.fill[p]++;
      }
    }
  });
  if (s.fill[p] >= k) {
    const at = s.pos[p];
    for (const c of cells) occ[c] = 0;
    s.pos[p] = -1;
    s.gone++;
    ev && ev.push({ t: 'gone', p, at });
    for (let q = 0; q < L.pieces.length; q++) {
      if (L.pieces[q].lock === s.gone && s.pos[q] >= 0) {
        ev && ev.push({ t: 'open', p: q });
        absorb(L, s, occ, q, ev);
      }
    }
  }
}

// Ein Schritt (mutiert s und occ). Gibt false zurück, wenn er nicht geht.
export function step(L, s, occ, p, d, ev) {
  if (!canMove(L, s, p)) return false;
  const a = s.pos[p];
  const na = stepTarget(L, occ, p, a, d, size(L, p) - s.fill[p]);
  if (na < 0) return false;
  for (const c of cellsAt(L, p, a)) occ[c] = 0;
  for (const c of cellsAt(L, p, na)) occ[c] = p + 1;
  s.pos[p] = na;
  ev && ev.push({ t: 'step', p, from: a, to: na });
  absorb(L, s, occ, p, ev);
  return true;
}

export function dirBetween(L, a, b) {
  const d = b - a;
  if (d === 1) return 0;
  if (d === -1) return 1;
  if (d === L.cols) return 2;
  if (d === -L.cols) return 3;
  return -1;
}

// Zug = { p, path: [Ecken] } (path[0] = Startlage). Gibt { state, events } oder null.
export function applyMove(L, s0, move) {
  const s = cloneState(s0), occ = occupancy(L, s), ev = [];
  const { p, path } = move;
  if (s.pos[p] !== path[0]) return null;
  for (let i = 1; i < path.length; i++) {
    if (s.pos[p] < 0) return null; // schon voll – Rest des Weges gibt es nicht
    const d = dirBetween(L, path[i - 1], path[i]);
    if (d < 0 || !step(L, s, occ, p, d, ev)) return null;
  }
  return { state: s, events: ev };
}

export function isWon(L, s) {
  for (let p = 0; p < L.pieces.length; p++) if (L.pieces[p].color >= 0 && s.pos[p] >= 0) return false;
  return true;
}
export function plushLeft(L, s) {
  let n = 0;
  for (const v of s.plush) if (v >= 0) n++;
  L.rooms.forEach((r, k) => { n += r.queue.length - s.room[k]; });
  return n;
}

// ---------- Erreichbare Lagen ----------
// Breitensuche über die Ecken von Form p. Lagen, in denen sie ein Tier aufnehmen würde,
// werden als Ziel gemerkt, aber nicht weiter durchlaufen.
export function reach(L, s, occ, p) {
  const N = L.cols * L.rows;
  const par = new Int32Array(N).fill(-2);
  const start = s.pos[p];
  par[start] = -1;
  const queue = [start], hits = [], free = [];
  const cap = L.pieces[p].color >= 0 ? size(L, p) - s.fill[p] : 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const a = queue[qi];
    for (let d = 0; d < 4; d++) {
      const na = stepTarget(L, occ, p, a, d, cap);
      if (na < 0 || par[na] !== -2) continue;
      par[na] = a;
      if (touches(L, s, p, na)) hits.push(na);
      else { free.push(na); queue.push(na); }
    }
  }
  return { par, hits, free };
}
export function pathTo(par, a) {
  const path = [];
  for (let x = a; x !== -1; x = par[x]) path.push(x);
  return path.reverse();
}

// ---------- Sackgasse (nur sicher erkannte) ----------
// Gelockert: Jede Form kann überall hin, wo sie ohne andere Formen und Tiere hinkäme
// (nur Wände und ihre Schieberichtung zählen). Reicht selbst das nicht, damit jede Form genau
// so viele erreichbare Tiere bekommt, wie sie fasst, ist das Level verloren.
// Dazu: Zwei Formen, die nur waagerecht (bzw. nur senkrecht) gleiten und sich eine Zeile (Spalte)
// teilen, kommen nie aneinander vorbei, solange beide da sind. Formen, die nicht einmal dann
// genug Tiere erreichen, wenn alle möglicherweise verschwindenden Formen weg sind, bleiben für immer.
function touchFor(L, p, from, lo, hi) {
  const P = prep(L);
  P.touch = P.touch || new Map();
  const key = `${p}:${lo}:${hi}`;
  let t = P.touch.get(key);
  if (t) return t;
  const N = P.N, cols = L.cols, axis = L.pieces[p].axis;
  const occ = new Int16Array(N);
  for (let i = 0; i < N; i++) occ[i] = L.wall[i] ? -1 : 0;
  const coord = (a) => (axis === 2 ? (a / cols) | 0 : a % cols);
  const seen = new Uint8Array(N), near = new Uint8Array(N), own = new Uint8Array(N);
  const queue = [from];
  seen[from] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const a = queue[qi];
    for (const c of cellsAt(L, p, a)) { near[c] = 1; own[c] = 1; }
    for (let d = 0; d < 4; d++) {
      const na = stepTarget(L, occ, p, a, d);
      if (na < 0 || seen[na]) continue;
      if (axis && (coord(na) < lo || coord(na) > hi)) continue;
      seen[na] = 1; queue.push(na);
    }
  }
  t = { near, doors: L.rooms.map((r) => !!own[r.door]) };
  P.touch.set(key, t);
  return t;
}
// Bereich einer Form mit fester Richtung: andere Formen gleicher Richtung, die eine Zeile
// (bzw. Spalte) mit ihr teilen, bleiben immer auf derselben Seite.
export function rangeOf(L, s, p, away = null) {
  const P = prep(L), cols = L.cols, axis = L.pieces[p].axis;
  if (!axis) return [0, 0];
  const total = axis === 1 ? cols : L.rows;
  // je Form: Ecke längs/quer und Zellen als [längs, quer]
  const info = (q) => {
    const a = s.pos[q];
    const along = axis === 1 ? a % cols : (a / cols) | 0, cross = axis === 1 ? (a / cols) | 0 : a % cols;
    const lineMin = new Map(), lineMax = new Map();
    for (const [dx, dy] of L.pieces[q].cells) {
      const o = axis === 1 ? dx : dy, l = cross + (axis === 1 ? dy : dx);
      lineMin.set(l, Math.min(lineMin.get(l) ?? 99, o));
      lineMax.set(l, Math.max(lineMax.get(l) ?? -1, o));
    }
    return { along, lineMin, lineMax, len: axis === 1 ? P.w[q] : P.h[q] };
  };
  const I = info(p);
  let lo = 0, hi = total - I.len;
  for (let q = 0; q < L.pieces.length; q++) {
    if (q === p || s.pos[q] < 0 || L.pieces[q].axis !== axis || (away && away.has(q))) continue;
    const J = info(q);
    const shared = [...I.lineMin.keys()].filter((l) => J.lineMin.has(l));
    if (!shared.length) continue;
    const l0 = shared[0];
    const qLeft = J.along + J.lineMin.get(l0) < I.along + I.lineMin.get(l0);
    for (const l of shared) {
      if (qLeft) lo = Math.max(lo, J.lineMax.get(l) - I.lineMin.get(l) + 1);
      else hi = Math.min(hi, total - J.len + J.lineMin.get(l) - I.lineMax.get(l) - 1);
    }
  }
  return [lo, hi];
}

export function hopeless(L, s, dbg) {
  const T = [];
  const alive = [];
  for (let p = 0; p < L.pieces.length; p++) {
    if (L.pieces[p].color < 0 || s.pos[p] < 0) continue;
    alive.push(p);
    T[p] = touchFor(L, p, s.pos[p], 0, 1e9);
  }
  // Welche Formen können überhaupt noch verschwinden? (wachsend bis zum Fixpunkt)
  if (alive.some((p) => L.pieces[p].axis)) {
    const count = (p, t) => {
      const col = L.pieces[p].color;
      let n = 0;
      for (let i = 0; i < s.plush.length; i++) if (s.plush[i] === col && t.near[i]) n++;
      L.rooms.forEach((r, k) => { if (t.doors[k]) for (let j = s.room[k]; j < r.queue.length; j++) if (r.queue[j] === col) n++; });
      return n;
    };
    const can = new Set(alive.filter((p) => !L.pieces[p].axis));
    for (let changed = true; changed;) {
      changed = false;
      for (const p of alive) {
        if (can.has(p)) continue;
        const [lo, hi] = rangeOf(L, s, p, can);
        if (count(p, touchFor(L, p, s.pos[p], lo, hi)) >= size(L, p) - s.fill[p]) { can.add(p); changed = true; }
      }
    }
    if (can.size < alive.length) { if (dbg) dbg.push({ stuck: alive.filter((p) => !can.has(p)) }); return true; }
  }
  const ncol = L.colors;
  for (let col = 0; col < ncol; col++) {
    const pcs = [];
    for (let p = 0; p < L.pieces.length; p++) {
      if (L.pieces[p].color === col && s.pos[p] >= 0) pcs.push(p);
    }
    const items = []; // je Tier: Liste der Formen, die es erreichen können
    for (let i = 0; i < s.plush.length; i++) {
      if (s.plush[i] !== col) continue;
      items.push(pcs.filter((p) => T[p].near[i]));
    }
    L.rooms.forEach((r, k) => {
      for (let j = s.room[k]; j < r.queue.length; j++) {
        if (r.queue[j] === col) items.push(pcs.filter((p) => T[p].doors[k]));
      }
    });
    if (!items.length && !pcs.length) continue;
    // Zuordnung mit Kapazitäten (augmentierende Wege)
    const cap = new Map(pcs.map((p) => [p, size(L, p) - s.fill[p]]));
    let need = 0;
    for (const p of pcs) need += cap.get(p);
    if (need !== items.length) return true;
    const assigned = new Map(pcs.map((p) => [p, []]));
    const owner = new Array(items.length).fill(-1);
    const tryItem = (i, seenP) => {
      for (const p of items[i]) {
        if (seenP.has(p)) continue;
        seenP.add(p);
        if (assigned.get(p).length < cap.get(p)) { assigned.get(p).push(i); owner[i] = p; return true; }
        for (const j of assigned.get(p)) {
          if (tryItem(j, seenP)) {
            const list = assigned.get(p);
            list.splice(list.indexOf(j), 1, i);
            owner[i] = p;
            return true;
          }
        }
      }
      return false;
    };
    for (let i = 0; i < items.length; i++) if (!tryItem(i, new Set())) { if (dbg) dbg.push({ col, i, items }); return true; }
  }
  return false;
}

// Kann sich überhaupt noch etwas bewegen?
export function anyStep(L, s, occ = occupancy(L, s)) {
  for (let p = 0; p < L.pieces.length; p++) {
    if (!canMove(L, s, p)) continue;
    for (let d = 0; d < 4; d++) if (stepTarget(L, occ, p, s.pos[p], d) >= 0) return true;
  }
  return false;
}
export const deadEnd = (L, s) => !isWon(L, s) && (hopeless(L, s) || !anyStep(L, s));

// ---------- Löser (für Tipps und zum Prüfen) ----------
// Zufällige, gelenkte Probespiele: erst Züge, bei denen Tiere einspringen
// (eingeschränkte Formen zuerst), sonst Formen beiseiteschieben, die einem Weg im Weg stehen.
function productive(L, s, occ) {
  const out = [];
  for (let p = 0; p < L.pieces.length; p++) {
    if (L.pieces[p].color < 0 || !canMove(L, s, p)) continue;
    const { par, hits } = reach(L, s, occ, p);
    if (!hits.length) continue;
    let best = null;
    for (const a of hits) {
      const path = pathTo(par, a);
      const g = gain(L, s, p, a);
      if (!best || g > best.g || (g === best.g && path.length < best.path.length)) best = { p, path, g };
    }
    out.push(best);
  }
  return out;
}
function gain(L, s, p, a) {
  const col = L.pieces[p].color, { doorAt } = prep(L);
  const cells = cellsAt(L, p, a);
  let g = 0;
  for (const c of cells) {
    if (s.plush[c] === col) g++;
    const r = doorAt[c];
    if (r >= 0) for (let j = s.room[r]; j < L.rooms[r].queue.length && L.rooms[r].queue[j] === col; j++) g++;
  }
  return Math.min(g, size(L, p) - s.fill[p]);
}

// Beiseiteschieben: kürzester Weg einer Form, bei dem andere bewegliche Formen durchquert
// werden dürfen (je Lage, die eine fremde Form überdeckt, Kosten 1). goal(a) entscheidet, wo es hingeht.
export function costSearch(L, s, occ, p, goal) {
  const N = L.cols * L.rows, cols = L.cols, P = prep(L);
  const cost = new Int32Array(N).fill(1e9), par = new Int32Array(N).fill(-2);
  const start = s.pos[p];
  cost[start] = 0; par[start] = -1;
  let layer = [start], c = 0;
  const later = [];
  const passable = (na) => {
    let k = 0;
    for (const x of cellsAt(L, p, na)) {
      const v = occ[x];
      if (v === -1) return -1;
      if (v <= -10) { if (v === plushCode(L.pieces[p].color) && L.pieces[p].color >= 0) continue; return -1; }
      if (v > 0 && v !== p + 1) { if (!canMove(L, s, v - 1)) return -1; k = 1; }
    }
    return k;
  };
  while (layer.length && c < 6) {
    for (let qi = 0; qi < layer.length; qi++) {
      const a = layer[qi];
      if (cost[a] !== c) continue;
      if (a !== start && goal(a)) return { a, cost: c, par };
      for (let d = 0; d < 4; d++) {
        if (!dirAllowed(L.pieces[p].axis, d)) continue;
        const ax2 = a % cols + DIRS[d][0], ay2 = ((a / cols) | 0) + DIRS[d][1];
        if (ax2 < 0 || ay2 < 0 || ax2 + P.w[p] > cols || ay2 + P.h[p] > L.rows) continue;
        const na = ay2 * cols + ax2;
        const k = passable(na);
        if (k < 0 || cost[na] <= c + k) continue;
        cost[na] = c + k; par[na] = a;
        (k ? later : layer).push(na);
      }
    }
    layer = later.splice(0);
    c++;
  }
  return null;
}
function cellsOfPath(L, p, path) {
  const set = new Set();
  for (const a of path) for (const x of cellsAt(L, p, a)) set.add(x);
  return set;
}
// Form q aus den Feldern forbid wegbringen; nötigenfalls zuerst eine Form, die ihr im Weg steht.
// Gibt den als Nächstes auszuführenden Zug zurück.
function escape(L, s, occ, q, forbid, depth, rnd) {
  if (!canMove(L, s, q)) return null;
  const r = costSearch(L, s, occ, q, (a) => cellsAt(L, q, a).every((x) => !forbid.has(x)));
  if (!r) return null;
  const path = pathTo(r.par, r.a);
  if (r.cost === 0) return { p: q, path };
  if (depth <= 0) return null;
  const cells = cellsOfPath(L, q, path);
  const blockers = new Set();
  for (const x of cells) if (occ[x] > 0 && occ[x] !== q + 1) blockers.add(occ[x] - 1);
  const more = new Set([...forbid, ...cells]);
  for (const b of shuffleIn([...blockers], rnd)) {
    const m = escape(L, s, occ, b, more, depth - 1, rnd);
    if (m) return m;
  }
  return null;
}
function shuffleIn(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
export function clearing(L, s, occ, rnd) {
  const out = [];
  const order = [];
  for (let p = 0; p < L.pieces.length; p++) if (L.pieces[p].color >= 0 && canMove(L, s, p)) order.push(p);
  shuffleIn(order, rnd);
  for (const p of order) {
    const r = costSearch(L, s, occ, p, (a) => touches(L, s, p, a));
    if (!r) continue;
    const path = pathTo(r.par, r.a);
    const cells = cellsOfPath(L, p, path);
    const blockers = new Set();
    for (const x of cells) if (occ[x] > 0 && occ[x] !== p + 1) blockers.add(occ[x] - 1);
    for (const b of blockers) {
      const m = escape(L, s, occ, b, cells, 2, rnd);
      if (m) { out.push(m); break; }
    }
    if (out.length >= 4) break;
  }
  return out;
}
function randomShift(L, s, occ, rnd) {
  const ps = [];
  for (let p = 0; p < L.pieces.length; p++) if (canMove(L, s, p)) ps.push(p);
  for (let tries = 0; tries < 12 && ps.length; tries++) {
    const p = ps[Math.floor(rnd() * ps.length)];
    const r = reach(L, s, occ, p);
    if (r.free.length) {
      const a = r.free[Math.floor(rnd() * r.free.length)];
      return { p, path: pathTo(r.par, a) };
    }
  }
  return null;
}

// Reihenfolge, in der die Lösung des Generators die Formen erledigt (0 = zuerst … 1 = zuletzt)
function planRank(L) {
  const P = prep(L);
  if (P.rank !== undefined) return P.rank;
  if (!L.plan || !L.plan.length) return (P.rank = null);
  const rank = new Float32Array(L.pieces.length).fill(1);
  L.plan.forEach((m, i) => { rank[m.p] = i / L.plan.length; });
  return (P.rank = rank);
}
// Ein Probespiel. greedy=false: rein zufällige Auswahl unter den einspringenden Zügen.
export function rollout(L, s0, { rnd = Math.random, maxMoves = 400, smart = true, info = null, guide = 0 } = {}) {
  const fail = (why) => { if (info) { info.why = why; info.left = plushLeft(L, s); info.moves = moves.length; info.state = s; } return null; };
  let s = cloneState(s0);
  const moves = [];
  let idle = 0;
  while (moves.length < maxMoves) {
    if (isWon(L, s)) return moves;
    const occ = occupancy(L, s);
    let cands = productive(L, s, occ);
    let chosen = null;
    if (cands.length) {
      idle = 0;
      if (smart) {
        // eingeschränkte Formen und große Gewinne zuerst, mit etwas Zufall
        const rank = planRank(L);
        cands.forEach((c) => { c.score = c.g * 2 + (L.pieces[c.p].axis ? 3 : 0) - c.path.length * 0.05 + rnd() * 2.5 + (rank ? (1 - rank[c.p]) * guide : 0); });
        cands.sort((a, b) => b.score - a.score);
        for (const c of cands.slice(0, 4)) {
          const r = applyMove(L, s, c);
          if (r && !hopeless(L, r.state)) { chosen = r; moves.push(c); break; }
        }
      } else {
        const c = cands[Math.floor(rnd() * cands.length)];
        chosen = applyMove(L, s, c);
        moves.push(c);
      }
    }
    if (!chosen) {
      if (++idle > 25) return fail('idle');
      const cl = clearing(L, s, occ, rnd);
      const m = cl.length && rnd() < 0.85 ? cl[Math.floor(rnd() * cl.length)] : randomShift(L, s, occ, rnd);
      if (!m) return fail('nomove');
      chosen = applyMove(L, s, m);
      if (!chosen) return fail('bad');
      moves.push(m);
    }
    s = chosen.state;
    if (smart && hopeless(L, s)) return fail('hopeless');
  }
  return fail('max');
}

// Lösung suchen: mehrere Probespiele, bis eines durchkommt (oder die Zeit um ist)
export function solve(L, s0, { tries = 40, ms = 3000, seed = 1 } = {}) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const t0 = Date.now();
  const maxMoves = 4 * (L.plan ? L.plan.length : 100) + 40;
  for (let i = 0; i < tries && Date.now() - t0 < ms; i++) {
    // abwechselnd frei und an der Reihenfolge der bekannten Lösung orientiert
    const r = rollout(L, s0, { rnd, maxMoves, guide: i % 2 ? 0 : 6 });
    if (r) return r;
  }
  return null;
}
