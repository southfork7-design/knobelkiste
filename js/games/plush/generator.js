// Kuschelfracht – Level-Erzeugung entlang einer Lösung.
//
// Gebaut wird rückwärts: Zuerst steht die Form, die im Spiel als letzte verschwindet, auf einem
// fast leeren Brett. Jede neu hinzugefügte Form wird im Spiel FRÜHER erledigt: Sie bekommt einen
// freien Weg und ihre Plüschtiere auf Felder dieses Weges (oder vorn in einen Raum). Ihre Startlage und
// ihre Tiere dürfen auf den Wegen später erledigter Formen liegen – so entstehen Abhängigkeiten.
// Manchmal wird zusätzlich eine schon stehende Form (oft ein graues Hindernis) so verschoben,
// dass sie den neuen Weg versperrt; im Spiel muss sie dann zuerst beiseite.
// Nach jedem Schritt wird die ganze Lösung mit den echten Regeln nachgespielt.
import { mulberry32, shuffle, randInt } from '../../rng.js';
import { SHAPES, prep, cellsAt, initialState, occupancy, touches, reach, pathTo, applyMove, isWon } from './model.js';

export const VERSION = 3;

export function levelParams(level) {
  const t = Math.min(1, (level - 1) / 39);
  const cols = Math.round(8 + 8 * t);
  const rows = Math.round(cols * 1.6);
  return {
    cols, rows,
    colors: level < 16 ? 6 : level < 31 ? 7 : 8,   // mindestens 6 Farben (Wunsch), später 7 und 8
    maxSize: level < 3 ? 3 : level < 7 ? 4 : 5,
    rooms: level < 3 ? 0 : Math.min(5, 1 + Math.floor((level - 3) / 6)),
    greys: level < 6 ? 0 : Math.min(8, 1 + Math.floor((level - 6) / 4)),
    axisFrac: level < 9 ? 0 : Math.min(0.3, 0.12 + (level - 9) * 0.006),
    locks: level < 12 ? 0 : Math.min(5, 1 + Math.floor((level - 12) / 7)),
    maxLock: level < 12 ? 0 : Math.min(5, 2 + Math.floor((level - 12) / 10)),
    walls: level < 15 ? 0 : Math.min(12, 2 + Math.floor((level - 15) / 4)),
    reloc: Math.min(0.75, 0.25 + level * 0.015),
    free: 0.14,
  };
}

const sizeWeights = (max) => [0, 2, 4, 4, 3, 2].slice(0, max + 1);
function pickWeighted(w, rnd) {
  let sum = 0;
  for (const x of w) sum += x;
  let r = rnd() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r < 0) return i; }
  return w.length - 1;
}

// Bau-Zustand → spielbares Level (Startlagen = Lagen zu Beginn der frühesten Phase)
function toLevel(G, extra = null) {
  const pieces = G.pieces.map((p) => ({ cells: p.cells, color: p.color, axis: p.axis, lock: p.lock, start: p.cur }));
  if (extra) pieces.push({ ...extra, lock: 0, start: -1 });
  return {
    v: VERSION, cols: G.cols, rows: G.rows, wall: G.wall, colors: G.colors,
    pieces, plush: G.plush, rooms: G.rooms.map((r) => ({ door: r.door, side: r.side, queue: r.queue })),
    plan: G.plan,
  };
}
const snapshot = (G) => ({
  pieces: G.pieces.map((p) => ({ ...p })), plush: Int8Array.from(G.plush),
  rooms: G.rooms.map((r) => ({ ...r, queue: r.queue.slice() })), plan: G.plan.slice(),
});
const restore = (G, S) => { G.pieces = S.pieces; G.plush = S.plush; G.rooms = S.rooms; G.plan = S.plan; };

// Lösung mit den Spielregeln nachspielen
export function checkPlan(L) {
  let s = initialState(L);
  for (let p = 0; p < L.pieces.length; p++) {
    if (s.pos[p] >= 0 && L.pieces[p].lock <= 0 && touches(L, s, p, s.pos[p])) return false;
  }
  for (const m of L.plan) {
    const r = applyMove(L, s, m);
    if (!r) return false;
    s = r.state;
  }
  return isWon(L, s);
}

function makeWalls(G, n, rnd) {
  const { cols, rows } = G;
  const wall = new Uint8Array(cols * rows);
  // Ecken abschneiden
  for (const [cx, cy] of [[0, 0], [cols - 1, 0], [0, rows - 1], [cols - 1, rows - 1]]) {
    if (rnd() < 0.5) continue;
    const w = randInt(rnd, 1, 2), h = randInt(rnd, 1, 2);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      wall[(cy === 0 ? dy : cy - dy) * cols + (cx === 0 ? dx : cx - dx)] = 1;
    }
  }
  // Pfeiler im Innern
  for (let k = 0; k < n; k++) {
    const x = randInt(rnd, 2, cols - 3), y = randInt(rnd, 2, rows - 3);
    wall[y * cols + x] = 1;
    if (rnd() < 0.4) wall[y * cols + x + (rnd() < 0.5 ? 1 : cols)] = 1;
  }
  // zusammenhängend?
  const N = cols * rows;
  const start = wall.findIndex((v) => !v);
  const seen = new Uint8Array(N); seen[start] = 1;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % cols;
    for (const n of [x > 0 ? c - 1 : -1, x < cols - 1 ? c + 1 : -1, c - cols, c + cols]) {
      if (n >= 0 && n < N && !wall[n] && !seen[n]) { seen[n] = 1; q.push(n); }
    }
  }
  if (q.length !== wall.reduce((a, v) => a + (v ? 0 : 1), 0)) return makeWalls(G, n, rnd);
  return wall;
}

function makeRooms(G, n, rnd) {
  const { cols, rows, wall } = G, out = [], used = new Set();
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const side = ['N', 'S', 'W', 'E'][randInt(rnd, 0, 3)];
    const k = side === 'N' || side === 'S' ? randInt(rnd, 1, cols - 2) : randInt(rnd, 1, rows - 2);
    const [x, y] = side === 'N' ? [k, 0] : side === 'S' ? [k, rows - 1] : side === 'W' ? [0, k] : [cols - 1, k];
    const door = y * cols + x;
    if (wall[door] || used.has(door) || used.has(door - 1) || used.has(door + 1) || used.has(door - cols) || used.has(door + cols)) continue;
    used.add(door);
    out.push({ door, side, max: [2, 3, 5][randInt(rnd, 0, 2)], queue: [] });
  }
  return out;
}

function placeGreys(G, n, rnd) {
  const L = toLevel(G);
  const occ = occupancy(L, initialState(L));
  for (let k = 0; k < n; k++) {
    const cells = shuffle(SHAPES[randInt(rnd, 2, 4)].slice(), rnd)[0];
    const piece = { cells, color: -1, axis: 0, lock: 0, cur: -1 };
    const w = 1 + Math.max(...cells.map((c) => c[0])), h = 1 + Math.max(...cells.map((c) => c[1]));
    for (let tries = 0; tries < 50; tries++) {
      const ax = randInt(rnd, 0, G.cols - w), ay = randInt(rnd, 0, G.rows - h);
      const cs = cells.map(([dx, dy]) => (ay + dy) * G.cols + ax + dx);
      if (cs.some((c) => occ[c] !== 0)) continue;
      cs.forEach((c) => { occ[c] = 99; });
      piece.cur = ay * G.cols + ax;
      G.pieces.push(piece);
      break;
    }
  }
}

// Eine neue (im Spiel früher erledigte) Form hinzufügen. true = geklappt.
function tryAdd(G, prm, rnd, small = false) {
  const sz = small ? randInt(rnd, 1, 2) : pickWeighted(sizeWeights(prm.maxSize), rnd);
  const shape = SHAPES[sz][Math.floor(rnd() * SHAPES[sz].length)];
  const color = Math.floor(rnd() * prm.colors);
  const axis = sz > 1 && rnd() < prm.axisFrac ? (rnd() < 0.5 ? 1 : 2) : 0;
  const L = toLevel(G, { cells: shape, color, axis });
  const p = L.pieces.length - 1;
  const s = initialState(L);
  const occ = occupancy(L, s);
  const { doorAt } = prep(L);

  // Startlage: frei und ohne Berührung; davon die mit dem längsten möglichen Weg
  const anchors = shuffle(Array.from({ length: G.cols * G.rows }, (_, i) => i), rnd);
  let best = null, tried = 0;
  for (const a of anchors) {
    const cs = cellsAt(L, p, a);
    if (!cs || cs.some((c) => occ[c] !== 0) || touches(L, s, p, a, cs)) continue;
    s.pos[p] = a;
    cs.forEach((c) => { occ[c] = p + 1; });
    const r = reach(L, s, occ, p);
    cs.forEach((c) => { occ[c] = 0; });
    if (r.free.length && (!best || r.free.length > best.r.free.length)) best = { a, r };
    if ((best && best.r.free.length >= 6) || ++tried > 8) break;
  }
  if (!best) return false;
  const start = best.a, { par, free } = best.r;
  s.pos[p] = start;
  const startCells = cellsAt(L, p, start);
  startCells.forEach((c) => { occ[c] = p + 1; });

  // Ziel: eher weit weg
  const withLen = free.map((a) => ({ a, path: pathTo(par, a) }));
  withLen.sort((x, y) => y.path.length - x.path.length);
  let pick = withLen[Math.floor(Math.pow(rnd(), 1.6) * withLen.length)];
  // oft zu einem Raum mit freiem Platz fahren (Tür im Weg, nicht schon am Start)
  if (G.rooms.length && rnd() < 0.6) {
    const atDoor = withLen.filter((x) => cellsAt(L, p, x.a).some((c) => {
      const r = doorAt[c];
      return r >= 0 && G.rooms[r].queue.length < G.rooms[r].max && !cellsAt(L, p, start).includes(c);
    }));
    if (atDoor.length) pick = atDoor[Math.floor(rnd() * atDoor.length)];
  }
  const path = pick.path;
  // Plätze für die Tiere: Felder, die die Form auf ihrem Weg überfährt (nicht schon am Start),
  // oder vorn in einem Raum, an dessen Tür der Weg vorbeiführt. t = wann sie das Feld zuerst erreicht.
  const cand = new Map(); // key -> { t, room?, cell? }
  for (let t = 1; t < path.length; t++) {
    for (const c of cellsAt(L, p, path[t])) {
      if (!startCells.includes(c) && occ[c] === 0 && !cand.has('c' + c)) cand.set('c' + c, { t, cell: c });
      const r = doorAt[c];
      if (r >= 0 && !startCells.includes(c) && !cand.has('r' + r)) {
        const free = G.rooms[r].max - G.rooms[r].queue.length;
        if (free > 0) cand.set('r' + r, { t, room: r, free });
      }
    }
  }
  const list = [...cand.values()];
  let slots = list.reduce((a, x) => a + (x.room !== undefined ? x.free : 1), 0);
  if (slots < sz) return false;
  // spätere Berührungen bevorzugen (die Form muss den Weg wirklich gehen), Räume gern nehmen
  list.forEach((x) => { x.key = x.t / path.length + rnd() * 0.8 + (x.room !== undefined ? 1.5 : 0); });
  list.sort((a, b) => b.key - a.key);
  const chosen = [];
  let need = sz;
  for (const x of list) {
    if (!need) break;
    const k = x.room !== undefined ? Math.min(need, randInt(rnd, 1, x.free)) : 1;
    chosen.push({ ...x, k });
    need -= k;
  }
  if (need) return false;
  const maxT = Math.max(...chosen.map((x) => x.t));

  const snap = snapshot(G);
  G.pieces.push({ cells: shape, color, axis, lock: 0, cur: start });
  for (const x of chosen) {
    if (x.cell !== undefined) G.plush[x.cell] = color;
    else for (let i = 0; i < x.k; i++) G.rooms[x.room].queue.unshift(color);
  }
  const ePath = path.slice(0, maxT + 1);
  G.plan.unshift({ p, path: ePath });

  // Hindernis verschieben, sodass es den neuen Weg versperrt
  const wayCells = new Set();
  for (let t = 1; t < ePath.length; t++) for (const c of cellsAt(L, p, ePath[t])) wayCells.add(c);
  for (let k = 0; k < 2 && rnd() < prm.reloc; k++) {
    const L2 = toLevel(G);
    const s2 = initialState(L2), occ2 = occupancy(L2, s2);
    const others = [];
    for (let b = 0; b < L2.pieces.length; b++) {
      if (b === p || L2.pieces[b].lock) continue;
      const w = L2.pieces[b].color < 0 ? 3 : 1;
      for (let i = 0; i < w; i++) others.push(b);
    }
    shuffle(others, rnd);
    let done = false;
    for (const b of others.slice(0, 8)) {
      const r = reach(L2, s2, occ2, b);
      const ok = r.free.filter((a) => cellsAt(L2, b, a).some((c) => wayCells.has(c)));
      if (!ok.length) continue;
      const a = ok[Math.floor(rnd() * ok.length)];
      G.pieces[b].cur = a;
      G.plan.unshift({ p: b, path: pathTo(r.par, a).reverse() });
      done = true;
      break;
    }
    if (!done) break;
  }

  if (!checkPlan(toLevel(G))) { restore(G, snap); return false; }
  return true;
}

function freeRatio(G) {
  const L = toLevel(G);
  const occ = occupancy(L, initialState(L));
  let free = 0, all = 0;
  for (const v of occ) { if (v !== -1) all++; if (v === 0) free++; }
  return free / all;
}

function assignLocks(G, prm, rnd) {
  if (!prm.locks) return;
  const L = toLevel(G);
  const idx = new Map(), movedBefore = new Set(), seen = new Set();
  // Hauptzug einer Form = ihr letzter Zug (dort verschwindet sie)
  const last = new Map();
  L.plan.forEach((m, i) => last.set(m.p, i));
  let gone = 0;
  L.plan.forEach((m, i) => {
    if (last.get(m.p) === i && L.pieces[m.p].color >= 0) { idx.set(m.p, gone); gone++; }
    else if (!seen.has(m.p)) movedBefore.add(m.p);
    seen.add(m.p);
  });
  const cands = shuffle([...idx.keys()].filter((p) => !movedBefore.has(p) && idx.get(p) >= 2), rnd);
  let placed = 0;
  for (const p of cands) {
    if (placed >= prm.locks) break;
    G.pieces[p].lock = randInt(rnd, 1, Math.min(prm.maxLock, idx.get(p)));
    if (checkPlan(toLevel(G))) placed++;
    else G.pieces[p].lock = 0;
  }
}

export function generateLevel(level) {
  const prm = levelParams(level);
  for (let attempt = 0; ; attempt++) {
    const rnd = mulberry32(level * 7919 + attempt * 104729 + 13);
    const G = { cols: prm.cols, rows: prm.rows, colors: prm.colors, pieces: [], plan: [] };
    G.wall = prm.walls ? makeWalls(G, prm.walls, rnd) : new Uint8Array(prm.cols * prm.rows);
    G.plush = new Int8Array(prm.cols * prm.rows).fill(-1);
    G.rooms = makeRooms(G, prm.rooms, rnd);
    placeGreys(G, prm.greys, rnd);
    let fails = 0;
    while (fails < 160) {
      if (tryAdd(G, prm, rnd, fails > 50)) {
        fails = 0;
        if (freeRatio(G) <= prm.free) break;
      } else fails++;
    }
    assignLocks(G, prm, rnd);
    // leere Räume entfernen
    const keep = G.rooms.filter((r) => r.queue.length);
    G.rooms = keep;
    const L = toLevel(G);
    L.level = level;
    L.wall = Array.from(L.wall);
    L.plush = Array.from(L.plush);
    const colored = L.pieces.filter((p) => p.color >= 0).length;
    if ((checkPlan(L) && colored >= 4) || attempt > 6) return L;
  }
}
