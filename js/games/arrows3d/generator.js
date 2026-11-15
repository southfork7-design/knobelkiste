// Generator für Pfeile auf der Oberfläche eines Körpers aus Würfelbausteinen:
// Quader (Würfel = Sonderfall) oder unregelmäßige Blockgebilde aus mehreren Quadern.
//
// Koordinaten sind verdoppelt, damit alles ganzzahlig bleibt: Baustein (i, j, k)
// hat die Mitte (2i+1, 2j+1, 2k+1), ein Feld der Oberfläche liegt eine Einheit
// davor in Richtung seiner Normalen.
//
// Regel: Ein Pfeil gleitet in der Ebene seiner Spitze geradeaus. An einer Außenkante
// fliegt er ab – dahinter muss der Weg durch die Luft frei sein. Eine aufsteigende
// Wand (Innenecke) oder ein anderer Teil des Körpers hält ihn auf, ebenso andere Pfeile.
// Pfeilkörper dürfen um Kanten herumlaufen.
// Lösbarkeit wie in 2D: jeder neue Pfeil braucht freie Bahn gegenüber allen
// bisherigen, rückwärts gelesen ist das die Lösung.

import { mulberry32, shuffle, randInt } from '../../rng.js';

// Achsrichtungen; Gegenrichtung von i ist i ^ 1
export const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const axisOf = (di) => di >> 1;
const dirIndex = (v) => AX.findIndex((a) => a[0] === v[0] && a[1] === v[1] && a[2] === v[2]);

// Körper aus Bausteinen im Raster X×Y×Z; solid(i, j, k) sagt, ob dort ein Baustein ist.
export function makeSolid(X, Y, Z, solidFn, isBox = false) {
  const D = [2 * X, 2 * Y, 2 * Z];
  const vox = new Uint8Array(X * Y * Z);
  for (let i = 0; i < X; i++) for (let j = 0; j < Y; j++) for (let k = 0; k < Z; k++)
    if (solidFn(i, j, k)) vox[(i * Y + j) * Z + k] = 1;
  // Baustein an der Stelle mit (ungeraden) verdoppelten Mittelkoordinaten
  const solidAt = (x, y, z) => {
    const i = (x - 1) >> 1, j = (y - 1) >> 1, k = (z - 1) >> 1;
    return i >= 0 && j >= 0 && k >= 0 && i < X && j < Y && k < Z && vox[(i * Y + j) * Z + k] === 1;
  };
  const S = [D[0] + 3, D[1] + 3, D[2] + 3];
  const key = (p) => ((p[0] + 1) * S[1] + p[1] + 1) * S[2] + p[2] + 1;
  const cells = [];
  const index = new Map();
  for (let i = 0; i < X; i++) for (let j = 0; j < Y; j++) for (let k = 0; k < Z; k++) {
    if (!vox[(i * Y + j) * Z + k]) continue;
    const v = [2 * i + 1, 2 * j + 1, 2 * k + 1];
    for (let face = 0; face < 6; face++) {
      const n = AX[face];
      if (solidAt(v[0] + 2 * n[0], v[1] + 2 * n[1], v[2] + 2 * n[2])) continue;
      const p = [v[0] + n[0], v[1] + n[1], v[2] + n[2]];
      index.set(key(p), cells.length);
      cells.push({ p, n, face });
    }
  }
  const at = (p) => index.get(key(p));
  const solid = (p) => solidAt(p[0], p[1], p[2]);

  // Ein Feld weiter in Richtung di; an Kanten wechselt die Fläche (außen herum oder die Wand hinauf).
  function step(ci, di) {
    const { p, n } = cells[ci];
    const d = AX[di];
    const v = [p[0] - n[0], p[1] - n[1], p[2] - n[2]];
    // Innenecke: schräg darüber liegt ein Baustein → auf dessen Wand hinauf
    if (solid([v[0] + 2 * d[0] + 2 * n[0], v[1] + 2 * d[1] + 2 * n[1], v[2] + 2 * d[2] + 2 * n[2]]))
      return { c: at([p[0] + n[0] + d[0], p[1] + n[1] + d[1], p[2] + n[2] + d[2]]), d: dirIndex(n) };
    // eben weiter
    if (solid([v[0] + 2 * d[0], v[1] + 2 * d[1], v[2] + 2 * d[2]]))
      return { c: at([p[0] + 2 * d[0], p[1] + 2 * d[1], p[2] + 2 * d[2]]), d: di };
    // Außenkante: um den eigenen Baustein herum
    return { c: at([v[0] + d[0], v[1] + d[1], v[2] + d[2]]), d: dirIndex([-n[0], -n[1], -n[2]]) };
  }

  // Bahn von ci in Richtung di: Felder in derselben Ebene bis zur Außenkante.
  // ray.exit = true, wenn der Pfeil dort abfliegen kann (dahinter nur Luft);
  // false, wenn eine Wand oder ein anderer Teil des Körpers im Weg ist.
  const rays = new Array(cells.length * 6);
  function ray(ci, di) {
    const ck = ci * 6 + di;
    if (rays[ck]) return rays[ck];
    const out = [];
    const { p, n, face } = cells[ci];
    const d = AX[di];
    const q = p.slice();
    const mv = (k) => { q[0] += k * d[0]; q[1] += k * d[1]; q[2] += k * d[2]; };
    const above = () => solid([q[0] + n[0], q[1] + n[1], q[2] + n[2]]);
    const below = () => solid([q[0] - n[0], q[1] - n[1], q[2] - n[2]]);
    const inside = () => q.every((x, k) => x > -2 && x < D[k] + 2);
    out.exit = false;
    for (;;) {
      mv(2);
      const c = at(q);
      if (c !== undefined && cells[c].face === face) { out.push(c); continue; }
      if (above()) break; // Wand
      // Außenkante: weiter durch die Luft, bis der Körper verlassen ist
      for (;;) {
        if (above() || below()) break;
        mv(2);
        if (!inside()) { out.exit = true; break; }
      }
      break;
    }
    rays[ck] = out;
    return out;
  }

  // Die vier Richtungen, die auf der Fläche des Feldes liegen
  const tangents = (ci) => [0, 1, 2, 3, 4, 5].filter((di) => axisOf(di) !== axisOf(cells[ci].face));

  return { dims: [X, Y, Z], D, cells, step, ray, tangents, solid, isBox };
}

export const makeBox = (X, Y, Z) => makeSolid(X, Y, Z, () => true, true);

// ---------- Blockgebilde ----------
// Ein Grundquader, an den 2–4 weitere Quader angesetzt werden (auch schmale).
// Ergebnis wird auf seine Ausdehnung zugeschnitten. Gebilde, bei denen sich Bausteine
// nur an einer Kante oder Ecke berühren, werden verworfen (Oberfläche wäre mehrdeutig).
function buildShape(rnd, size) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const G = size + 4;
    const boxes = [];
    const b0 = [randInt(rnd, 5, size - 3), randInt(rnd, 4, size - 4), randInt(rnd, 5, size - 3)];
    boxes.push({ lo: [2, 2, 2], hi: [2 + b0[0], 2 + b0[1], 2 + b0[2]] });
    const extra = randInt(rnd, 2, 4);
    for (let e = 0; e < extra; e++) {
      const B = boxes[Math.floor(rnd() * boxes.length)];
      const a = Math.floor(rnd() * 3), side = rnd() < 0.5 ? 0 : 1;
      const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const len = k === a ? randInt(rnd, 2, Math.max(3, Math.floor(size / 2))) : randInt(rnd, 3, Math.max(4, Math.floor(size * 0.7)));
        if (k === a) {
          if (side) { lo[k] = B.hi[k]; hi[k] = B.hi[k] + len; } else { hi[k] = B.lo[k]; lo[k] = B.lo[k] - len; }
        } else {
          // überlappt den Nachbarquader in dieser Richtung um mindestens 2
          const s = randInt(rnd, B.lo[k] - len + 2, B.hi[k] - 2);
          lo[k] = s; hi[k] = s + len;
        }
        lo[k] = Math.max(0, lo[k]); hi[k] = Math.min(G, hi[k]);
      }
      if (hi.some((h, k) => h - lo[k] < 2)) continue;
      boxes.push({ lo, hi });
    }
    if (boxes.length < 3) continue;
    const inBox = (i, j, k) => boxes.some(({ lo, hi }) => i >= lo[0] && i < hi[0] && j >= lo[1] && j < hi[1] && k >= lo[2] && k < hi[2]);
    // Ausdehnung
    const mn = [G, G, G], mx = [0, 0, 0];
    for (const { lo, hi } of boxes) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], lo[k]); mx[k] = Math.max(mx[k], hi[k]); }
    const ext = mx.map((m, k) => m - mn[k]);
    if (Math.max(...ext) > size + 2) continue;
    const fn = (i, j, k) => inBox(i + mn[0], j + mn[1], k + mn[2]);
    if (!manifold(ext, fn)) continue;
    const solid = makeSolid(ext[0], ext[1], ext[2], fn);
    // genug Fläche, aber nicht zu viel
    if (solid.cells.length < size * size * 4.5 || solid.cells.length > size * size * 7) continue;
    return solid;
  }
  return makeBox(size, size, size);
}

// Keine Bausteine, die sich nur an einer Kante oder nur an einer Ecke berühren
function manifold([X, Y, Z], fn) {
  const s = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < X && j < Y && k < Z && fn(i, j, k);
  for (let i = -1; i < X; i++) for (let j = -1; j < Y; j++) for (let k = -1; k < Z; k++) {
    const c = [];
    for (let m = 0; m < 8; m++) c.push(s(i + (m & 1), j + ((m >> 1) & 1), k + ((m >> 2) & 1)) ? 1 : 0);
    // Kanten: in jeder 2×2-Scheibe nicht genau die beiden Diagonalen
    for (const [a, b, cc, d] of [[0, 3, 1, 2], [4, 7, 5, 6], [0, 5, 1, 4], [2, 7, 3, 6], [0, 6, 2, 4], [1, 7, 3, 5]])
      if (c[a] === c[b] && c[cc] === c[d] && c[a] !== c[cc]) return false;
    // Ecken: nicht nur zwei gegenüberliegende Bausteine (oder nur zwei gegenüberliegende Lücken)
    const n = c.reduce((x, y) => x + y, 0);
    for (let m = 0; m < 4; m++)
      if ((n === 2 && c[m] && c[7 - m]) || (n === 6 && !c[m] && !c[7 - m])) return false;
  }
  return true;
}

export function levelParams(level) {
  // Jede Fläche mindestens 14×14 (feines Raster, kleine Felder); alle vier Level eine Kante größer, höchstens 22.
  const s = Math.min(14 + Math.floor((level - 1) / 4), 22);
  // Jedes dritte Level ein Blockgebilde, sonst Würfel oder Quader.
  const shape = level % 3 === 0;
  const dims = level % 3 === 2 ? [s + 2, s, s + 1] : [s, s, s];
  return {
    dims, shape, size: Math.min(17 + Math.floor((level - 1) / 6), 24),
    seed: level * 6007 + 9973,
    minLen: 2,
    maxLen: 6,
    turnChance: Math.min(0.3 + level * 0.01, 0.5),
    spread: 0.1,  // wenig Zufall: von der Flächenmitte nach außen
    inward: 1,    // Spitzen bevorzugt mit langer Bahn → mehr Abhängigkeiten
  };
}

export function generate(box, { seed, minLen = 2, maxLen = 6, turnChance = 0.3, spread = 0.5, inward = 0 }) {
  const rnd = mulberry32(seed);
  const N = box.cells.length;
  const occ = new Int16Array(N).fill(-1);
  const arrows = [];

  function tryPlace(hc, hd) {
    if (occ[hc] !== -1) return null;
    const ray = box.ray(hc, hd);
    if (!ray.exit || ray.some((c) => occ[c] !== -1)) return null;
    const blocked = new Set(ray);
    blocked.add(hc);
    const ok = (c) => c !== undefined && occ[c] === -1 && !blocked.has(c);

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

  // rayMax[c] = höchste Pfeil-Nummer, deren Bahn (Spitze → Kante) über Feld c läuft.
  const rayMax = new Int16Array(N).fill(-1);
  const addArrow = (a) => {
    a.id = arrows.length;
    for (const ci of a.cells) occ[ci] = a.id;
    for (const c of box.ray(a.cells[a.cells.length - 1], a.dir)) rayMax[c] = a.id;
    arrows.push(a);
  };

  // Lücken schließen (wie in 2D): ein leeres Feld c darf an Pfeil A hängen, wenn kein
  // später platzierter Pfeil (fliegt vor A) seine Bahn über c hat –
  // hinten am Schwanz: rayMax[c] < A; vorne: c ist das erste Feld von A's Bahn, rayMax[c] ≤ A.
  const maxTail = maxLen + 4;
  function fillGaps() {
    let grew = false;
    const empty = shuffle([...Array(N).keys()].filter((c) => occ[c] === -1), rnd);
    for (const c of empty) {
      if (occ[c] !== -1) continue;
      let best = null, bestEnd = 0;
      for (const di of box.tangents(c)) {
        const nb = box.step(c, di).c;
        const id = occ[nb];
        if (id === -1) continue;
        const a = arrows[id];
        if (a.cells.length >= maxTail) continue;
        let end = 0;
        // hinten nur, wenn c wirklich der Nachbar des Schwanzes in Laufrichtung ist
        if (a.cells[0] === nb && rayMax[c] < id) end = 1;
        else if (a.cells[a.cells.length - 1] === nb && rayMax[c] <= id && box.ray(nb, a.dir)[0] === c) end = 2;
        if (end && (!best || a.cells.length < best.cells.length)) { best = a; bestEnd = end; }
      }
      if (!best) continue;
      if (bestEnd === 1) best.cells.unshift(c);
      else best.cells.push(c);
      occ[c] = best.id;
      grew = true;
    }
    return grew;
  }

  // Reihenfolge grob „von innen nach außen“: Felder mit langem Weg bis zur nächsten
  // Abflugkante kommen zuerst, solange ihre Bahn noch frei ist – so wird es dichter
  // und anfangs sind weniger Pfeile frei.
  const sMax = Math.max(...box.dims);
  const key = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    let m = Infinity;
    for (const d of box.tangents(c)) { const r = box.ray(c, d); if (r.exit) m = Math.min(m, r.length); }
    key[c] = (m === Infinity ? -1 : -m / sMax) + rnd() * spread;
  }
  let changed = true;
  while (changed) {
    changed = false;
    const cands = [...Array(N).keys()].filter((c) => occ[c] === -1).sort((x, y) => key[x] - key[y]);
    for (const c of cands) {
      // inward > 0: lieber Richtungen mit langer Bahn – mehr Abhängigkeiten
      const dirs = box.tangents(c).map((d) => [d, box.ray(c, d).length * inward + rnd()]).sort((x, y) => y[1] - x[1]);
      for (const [d] of dirs) {
        const a = tryPlace(c, d);
        if (a) { addArrow(a); changed = true; break; }
      }
    }
    if (fillGaps()) changed = true;
  }
  return { box, arrows };
}

// null = frei, sonst Anzahl freier Felder bis zum Hindernis (anderer Pfeil oder Wand)
export function blockDistance(box, a, occ) {
  const ray = box.ray(a.cells[a.cells.length - 1], a.dir);
  for (let i = 0; i < ray.length; i++) {
    const o = occ[ray[i]];
    if (o !== -1 && o !== a.id) return i;
  }
  return ray.exit ? null : ray.length;
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

// Mehrere Varianten erzeugen und die kniffligste nehmen:
// viele Runden, wenige anfangs freie Pfeile, dicht gefüllt.
export function generateLevel(level) {
  const p = levelParams(level);
  const box = p.shape ? buildShape(mulberry32(p.seed ^ 0x5bd1e995), p.size) : makeBox(...p.dims);
  const tries = Math.max(3, Math.min(4 + level, Math.round(6000 / box.cells.length)));
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const L = generate(box, { ...p, seed: p.seed + i * 31337 });
    const r = solveRounds(L);
    if (!r.solvable) continue;
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0) / box.cells.length;
    const score = r.rounds * 3 + filled * 40 - (r.firstRound / L.arrows.length) * 12;
    if (score > bestScore) { bestScore = score; best = L; }
  }
  best.level = level;
  return best;
}
