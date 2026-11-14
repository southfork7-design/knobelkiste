// Generator für Pfeile auf der Oberfläche eines Quaders (Würfel = Sonderfall).
//
// Koordinaten sind verdoppelt, damit alles ganzzahlig bleibt: ein Quader mit
// X×Y×Z Feldern reicht von 0 bis 2X / 2Y / 2Z, Feldmitten haben ungerade
// Koordinaten, die Seitenfläche liegt bei 0 oder 2X usw.
//
// Regel: Ein Pfeil gleitet auf der Seite seiner Spitze bis zur Kante und
// fliegt dort ab. Er ist frei, wenn bis zur Kante nichts im Weg liegt.
// Pfeilkörper dürfen um Kanten herumlaufen.
// Lösbarkeit wie in 2D: jeder neue Pfeil braucht freie Bahn gegenüber allen
// bisherigen, rückwärts gelesen ist das die Lösung.

import { mulberry32, shuffle, randInt } from '../../rng.js';

// Achsrichtungen; Gegenrichtung von i ist i ^ 1
export const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const axisOf = (di) => di >> 1;
const dirIndex = (v) => AX.findIndex((a) => a[0] === v[0] && a[1] === v[1] && a[2] === v[2]);

export function makeBox(X, Y, Z) {
  const D = [2 * X, 2 * Y, 2 * Z];
  const cells = [];
  const index = new Map();
  const key = (p) => p[0] + ',' + p[1] + ',' + p[2];

  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const side of [0, D[a]]) {
      for (let i = 1; i < D[b]; i += 2)
        for (let j = 1; j < D[c]; j += 2) {
          const p = [0, 0, 0];
          p[a] = side; p[b] = i; p[c] = j;
          const n = [0, 0, 0]; n[a] = side === 0 ? -1 : 1;
          const face = dirIndex(n);
          index.set(key(p), cells.length);
          cells.push({ p, n, face });
        }
    }
  }

  // Ein Feld weiter in Richtung di; über Kanten hinweg wechselt die Fläche.
  function step(ci, di) {
    const { p, n } = cells[ci];
    const d = AX[di], k = axisOf(di);
    const q = [p[0] + 2 * d[0], p[1] + 2 * d[1], p[2] + 2 * d[2]];
    if (q[k] > 0 && q[k] < D[k]) return { c: index.get(key(q)), d: di };
    const np = [p[0] + d[0] - n[0], p[1] + d[1] - n[1], p[2] + d[2] - n[2]];
    return { c: index.get(key(np)), d: dirIndex([-n[0], -n[1], -n[2]]) };
  }

  // Felder von ci in Richtung di bis zur Kante (gleiche Fläche).
  function ray(ci, di) {
    const out = [];
    const d = AX[di], k = axisOf(di);
    const p = cells[ci].p.slice();
    for (;;) {
      p[0] += 2 * d[0]; p[1] += 2 * d[1]; p[2] += 2 * d[2];
      if (!(p[k] > 0 && p[k] < D[k])) return out;
      out.push(index.get(key(p)));
    }
  }

  // Die vier Richtungen, die auf der Fläche des Feldes liegen
  const tangents = (ci) => [0, 1, 2, 3, 4, 5].filter((di) => axisOf(di) !== axisOf(cells[ci].face));

  return { dims: [X, Y, Z], D, cells, step, ray, tangents };
}

export function levelParams(level) {
  const s = Math.min(3 + Math.floor((level - 1) / 4), 7);
  const dims = level % 3 === 0 ? [s, s + 1, s] : level % 3 === 2 && s > 3 ? [s + 1, s, s - 1] : [s, s, s];
  return {
    dims,
    seed: level * 6007 + 9973,
    minLen: 2,
    maxLen: Math.min(3 + s, 9),
    turnChance: Math.min(0.25 + level * 0.01, 0.5),
  };
}

export function generate(box, { seed, minLen = 2, maxLen = 6, turnChance = 0.3 }) {
  const rnd = mulberry32(seed);
  const occ = new Int16Array(box.cells.length).fill(-1);
  const arrows = [];

  function tryPlace(hc, hd) {
    if (occ[hc] !== -1) return null;
    const ray = box.ray(hc, hd);
    if (ray.some((c) => occ[c] !== -1)) return null;
    const blocked = new Set(ray);
    blocked.add(hc);
    const ok = (c) => occ[c] === -1 && !blocked.has(c);

    const back = box.step(hc, hd ^ 1);
    if (!ok(back.c)) return null;
    const cells = [hc, back.c];
    blocked.add(back.c);
    let cd = back.d;
    const target = randInt(rnd, minLen, maxLen);
    while (cells.length < target) {
      const cur = cells[cells.length - 1];
      const turns = shuffle(box.tangents(cur).filter((t) => t !== cd && t !== (cd ^ 1)), rnd);
      const options = rnd() < turnChance ? [...turns, cd] : [cd, ...turns];
      let moved = false;
      for (const nd of options) {
        const nx = box.step(cur, nd);
        if (ok(nx.c)) { cells.push(nx.c); blocked.add(nx.c); cd = nx.d; moved = true; break; }
      }
      if (!moved) break;
    }
    if (cells.length < minLen) return null;
    return { cells: cells.reverse(), dir: hd }; // Schwanz → Kopf
  }

  let placed = true;
  while (placed) {
    placed = false;
    const cands = shuffle([...box.cells.keys()].filter((c) => occ[c] === -1), rnd);
    for (const c of cands) {
      for (const d of shuffle(box.tangents(c), rnd)) {
        const a = tryPlace(c, d);
        if (a) {
          a.id = arrows.length;
          for (const ci of a.cells) occ[ci] = a.id;
          arrows.push(a);
          placed = true;
          break;
        }
      }
    }
  }
  return { box, arrows };
}

// null = frei, sonst Anzahl freier Felder bis zum Hindernis
export function blockDistance(box, a, occ) {
  const ray = box.ray(a.cells[a.cells.length - 1], a.dir);
  for (let i = 0; i < ray.length; i++) {
    const o = occ[ray[i]];
    if (o !== -1 && o !== a.id) return i;
  }
  return null;
}

export function solveRounds({ box, arrows }) {
  const occ = new Int16Array(box.cells.length).fill(-1);
  for (const a of arrows) for (const c of a.cells) occ[c] = a.id;
  const left = new Set(arrows.map((a) => a.id));
  let rounds = 0, firstRound = 0;
  while (left.size) {
    const free = [...left].filter((id) => blockDistance(box, arrows[id], occ) === null);
    if (!free.length) return { solvable: false, rounds, firstRound };
    if (rounds === 0) firstRound = free.length;
    for (const id of free) { for (const c of arrows[id].cells) occ[c] = -1; left.delete(id); }
    rounds++;
  }
  return { solvable: true, rounds, firstRound };
}

export function generateLevel(level) {
  const p = levelParams(level);
  const box = makeBox(...p.dims);
  const tries = Math.min(4 + level * 2, 40);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const L = generate(box, { ...p, seed: p.seed + i * 31337 });
    const r = solveRounds(L);
    if (!r.solvable) continue;
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0) / box.cells.length;
    const score = r.rounds * 3 + filled * 10 - (r.firstRound / L.arrows.length) * 12;
    if (score > bestScore) { bestScore = score; best = L; }
  }
  best.level = level;
  return best;
}
