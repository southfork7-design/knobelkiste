// Generator für das Pfeil-Spiel.
//
// Idee: Pfeile werden nacheinander platziert. Jeder neue Pfeil braucht eine
// freie Bahn von seiner Spitze bis zum Rand – bezogen auf alle bisher
// platzierten Pfeile. Rückwärts gelesen ist das eine garantierte Lösung:
// der zuletzt platzierte Pfeil ist zuerst frei, dann der vorletzte usw.
// Da ein Pfeil zu entfernen nie etwas blockiert, kann man sich nicht
// festspielen – es gibt immer mindestens einen freien Pfeil.

import { mulberry32, shuffle, randInt } from '../../rng.js';

// Richtungen als [dx, dy]: 0 = hoch, 1 = rechts, 2 = runter, 3 = links
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function levelParams(level) {
  const w = Math.min(5 + Math.floor((level - 1) / 3), 16);
  const h = w + Math.floor(w / 3);
  return {
    w,
    h,
    seed: level * 7919 + 104729,
    minLen: 2,
    maxLen: Math.min(3 + Math.floor(w / 2), 10),
    turnChance: Math.min(0.2 + level * 0.01, 0.45),
  };
}

export function generate({ w, h, seed, minLen = 2, maxLen = 6, turnChance = 0.3 }) {
  const rnd = mulberry32(seed);
  const occ = new Int16Array(w * h).fill(-1);
  const arrows = [];
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const idx = (x, y) => y * w + x;

  function rayCells(x, y, d) {
    const [dx, dy] = DIRS[d];
    const cells = [];
    x += dx; y += dy;
    while (inB(x, y)) { cells.push(idx(x, y)); x += dx; y += dy; }
    return cells;
  }

  function tryPlace(hx, hy, d) {
    if (occ[idx(hx, hy)] !== -1) return null;
    const ray = rayCells(hx, hy, d);
    if (ray.some((c) => occ[c] !== -1)) return null;
    const onRay = new Set(ray);
    const free = (x, y, used) =>
      inB(x, y) && occ[idx(x, y)] === -1 && !onRay.has(idx(x, y)) && !used.has(idx(x, y));

    const [dx, dy] = DIRS[d];
    // Das Feld direkt hinter der Spitze bestimmt die Pfeilrichtung.
    const bx = hx - dx, by = hy - dy;
    const used = new Set([idx(hx, hy)]);
    if (!free(bx, by, used)) return null;
    const cells = [[hx, hy], [bx, by]];
    used.add(idx(bx, by));

    const target = randInt(rnd, minLen, maxLen);
    let cd = (d + 2) % 4; // Wachstumsrichtung (vom Kopf weg)
    while (cells.length < target) {
      const [cx, cy] = cells[cells.length - 1];
      let options = [];
      const straight = cd;
      const turns = [(cd + 1) % 4, (cd + 3) % 4];
      if (rnd() < turnChance) options = [...shuffle(turns, rnd), straight];
      else options = [straight, ...shuffle(turns, rnd)];
      let moved = false;
      for (const nd of options) {
        const nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
        if (free(nx, ny, used)) {
          cells.push([nx, ny]);
          used.add(idx(nx, ny));
          cd = nd;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    if (cells.length < minLen) return null;
    // Speichern von Schwanz zu Kopf
    return { cells: cells.reverse(), dir: d };
  }

  // Wiederholt Durchläufe über alle freien Felder, bis nichts mehr passt.
  let placedSomething = true;
  while (placedSomething) {
    placedSomething = false;
    const cands = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (occ[idx(x, y)] === -1) cands.push([x, y]);
    shuffle(cands, rnd);
    for (const [x, y] of cands) {
      const dirs = shuffle([0, 1, 2, 3], rnd);
      for (const d of dirs) {
        const a = tryPlace(x, y, d);
        if (a) {
          a.id = arrows.length;
          for (const [cx, cy] of a.cells) occ[idx(cx, cy)] = a.id;
          arrows.push(a);
          placedSomething = true;
          break;
        }
      }
    }
  }

  return { w, h, arrows };
}

// Prüft, ob der Pfeil `a` auf dem Brett (Belegung `occ`) frei herausfahren kann.
// Gibt null zurück, wenn frei, sonst die Anzahl freier Felder bis zum Hindernis.
export function blockDistance(a, occ, w, h) {
  const [hx, hy] = a.cells[a.cells.length - 1];
  const [dx, dy] = DIRS[a.dir];
  let x = hx + dx, y = hy + dy, dist = 0;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    const o = occ[y * w + x];
    if (o !== -1 && o !== a.id) return dist;
    dist++; x += dx; y += dy;
  }
  return null;
}

// Erzeugt mehrere Varianten und wählt die kniffligste:
// viele Runden, wenige anfangs freie Pfeile, gut gefülltes Brett.
export function generateLevel(level) {
  const p = levelParams(level);
  const tries = Math.min(4 + level * 2, 60);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const L = generate({ ...p, seed: p.seed + i * 31337 });
    const r = solveRounds(L);
    if (!r.solvable) continue;
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0) / (p.w * p.h);
    const freeAtStart = r.firstRound / L.arrows.length;
    const score = r.rounds * 3 + filled * 10 - freeAtStart * 12;
    if (score > bestScore) { bestScore = score; best = L; }
  }
  best.level = level;
  return best;
}

// Löst ein Level komplett (Entfernen in Runden). Für Tests und Hinweise.
export function solveRounds(level) {
  const { w, h, arrows } = level;
  const occ = new Int16Array(w * h).fill(-1);
  for (const a of arrows) for (const [x, y] of a.cells) occ[y * w + x] = a.id;
  const left = new Set(arrows.map((a) => a.id));
  let rounds = 0, firstRound = 0;
  while (left.size) {
    const free = [...left].filter((id) => blockDistance(arrows[id], occ, w, h) === null);
    if (!free.length) return { solvable: false, rounds, firstRound, remaining: left.size };
    if (rounds === 0) firstRound = free.length;
    for (const id of free) {
      for (const [x, y] of arrows[id].cells) occ[y * w + x] = -1;
      left.delete(id);
    }
    rounds++;
  }
  return { solvable: true, rounds, firstRound, remaining: 0 };
}
