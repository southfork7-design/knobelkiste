// Generator für das Pfeil-Spiel.
//
// Idee: Pfeile werden nacheinander platziert. Jeder neue Pfeil braucht eine
// freie Bahn von seiner Spitze bis zum Rand – bezogen auf alle bisher
// platzierten Pfeile. Rückwärts gelesen ist das eine garantierte Lösung:
// der zuletzt platzierte Pfeil ist zuerst frei, dann der vorletzte usw.
// Da ein Pfeil zu entfernen nie etwas blockiert, kann man sich nicht
// festspielen – es gibt immer mindestens einen freien Pfeil.
//
// Jedes dritte Level hat statt eines Rechtecks eine Figur (Maske aus shapes.js).
// Pfeile liegen nur innerhalb der Figur; ihre Bahn darf über leere Flächen
// außerhalb hinweg bis zum Rand des umgebenden Rechtecks führen.

import { mulberry32, shuffle, randInt } from '../../rng.js';
import { SHAPES, rasterShape } from './shapes.js';

// Richtungen als [dx, dy]: 0 = hoch, 1 = rechts, 2 = runter, 3 = links
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function levelParams(level) {
  const seed = level * 7919 + 104729;
  const base = { seed, minLen: 2, maxLen: 10, turnChance: Math.min(0.25 + level * 0.01, 0.45) };
  if (level % 3 === 0) {
    // Figur: ab 38 Spalten breit, wächst langsam bis 80 (dann zum Zoomen gedacht).
    const k = level / 3;
    const shape = SHAPES[(k - 1 + Math.floor((k - 1) / SHAPES.length) * 5) % SHAPES.length];
    const gw = Math.min(38 + Math.floor(k * 1.5), 80);
    const { w, h, mask } = rasterShape(shape, gw);
    return { ...base, w, h, mask, shape: shape.name };
  }
  // Rechteck: Grundfläche 30 Spalten (füllt die Handybreite), Hochformat; wächst bis 44 Spalten.
  const w = Math.min(30 + Math.floor((level - 1) / 6), 44);
  const h = Math.round(w * 1.45);
  return { ...base, w, h, mask: null, shape: null };
}

export function generate({ w, h, seed, mask = null, minLen = 2, maxLen = 6, turnChance = 0.3, spread = 0.5 }) {
  const rnd = mulberry32(seed);
  const N = w * h;
  const occ = new Int16Array(N).fill(-1);
  const arrows = [];
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => inB(x, y) && (!mask || mask[idx(x, y)] === 1);

  // Liegt auf der Bahn ab (x, y) in Richtung d ein Pfeil?
  function rayBlocked(x, y, d) {
    const [dx, dy] = DIRS[d];
    x += dx; y += dy;
    while (inB(x, y)) { if (occ[idx(x, y)] !== -1) return true; x += dx; y += dy; }
    return false;
  }
  const onRayOf = (hx, hy, d, x, y) => {
    const [dx, dy] = DIRS[d];
    return dx === 0 ? x === hx && (y - hy) * dy > 0 : y === hy && (x - hx) * dx > 0;
  };

  function tryPlace(hx, hy, d) {
    if (!inside(hx, hy) || occ[idx(hx, hy)] !== -1) return null;
    const [dx, dy] = DIRS[d];
    // Das Feld direkt hinter der Spitze bestimmt die Pfeilrichtung.
    const bx = hx - dx, by = hy - dy;
    if (!inside(bx, by) || occ[idx(bx, by)] !== -1) return null;
    if (rayBlocked(hx, hy, d)) return null;
    const used = new Set([idx(hx, hy), idx(bx, by)]);
    const free = (x, y) => inside(x, y) && occ[idx(x, y)] === -1 && !used.has(idx(x, y)) && !onRayOf(hx, hy, d, x, y);
    const cells = [[hx, hy], [bx, by]];

    const target = randInt(rnd, minLen, maxLen);
    let cd = (d + 2) % 4; // Wachstumsrichtung (vom Kopf weg)
    while (cells.length < target) {
      const [cx, cy] = cells[cells.length - 1];
      const turns = [(cd + 1) % 4, (cd + 3) % 4];
      const options = rnd() < turnChance ? [...shuffle(turns, rnd), cd] : [cd, ...shuffle(turns, rnd)];
      let moved = false;
      for (const nd of options) {
        const nx = cx + DIRS[nd][0], ny = cy + DIRS[nd][1];
        if (free(nx, ny)) {
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

  // rayMax[c] = höchste Pfeil-Nummer, deren Bahn (Spitze → Rand) über Feld c läuft.
  const rayMax = new Int16Array(N).fill(-1);
  const addArrow = (a) => {
    a.id = arrows.length;
    for (const [cx, cy] of a.cells) occ[idx(cx, cy)] = a.id;
    let [x, y] = a.cells[a.cells.length - 1];
    const [dx, dy] = DIRS[a.dir];
    x += dx; y += dy;
    while (inB(x, y)) { rayMax[idx(x, y)] = a.id; x += dx; y += dy; }
    arrows.push(a);
  };

  // Lücken schließen. Ein leeres Feld c darf an Pfeil A angehängt werden, wenn kein
  // Pfeil, der vor A herausfliegt (höhere Nummer), seine Bahn über c hat:
  //  – hinten (Schwanz): c liegt zusätzlich nicht auf A's eigener Bahn (rayMax[c] < A),
  //  – vorne (Spitze rückt ein Feld vor): c ist das erste Feld von A's Bahn (rayMax[c] ≤ A).
  // So bleibt die Rückwärts-Lösung gültig.
  const maxTail = maxLen + 4;
  function fillGaps() {
    let grew = false;
    const empty = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (inside(x, y) && occ[idx(x, y)] === -1) empty.push([x, y]);
    shuffle(empty, rnd);
    for (const [x, y] of empty) {
      const c = idx(x, y);
      if (occ[c] !== -1) continue;
      let best = null, bestEnd = 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inB(nx, ny)) continue;
        const id = occ[idx(nx, ny)];
        if (id === -1) continue;
        const a = arrows[id];
        if (a.cells.length >= maxTail) continue;
        const [tx, ty] = a.cells[0];
        const [hx, hy] = a.cells[a.cells.length - 1];
        const [adx, ady] = DIRS[a.dir];
        let end = 0;
        if (tx === nx && ty === ny && rayMax[c] < id) end = 1;
        else if (hx === nx && hy === ny && hx + adx === x && hy + ady === y && rayMax[c] <= id) end = 2;
        if (end && (!best || a.cells.length < best.cells.length)) { best = a; bestEnd = end; }
      }
      if (!best) continue;
      if (bestEnd === 1) best.cells.unshift([x, y]);
      else best.cells.push([x, y]);
      occ[c] = best.id;
      grew = true;
    }
    return grew;
  }

  // Wiederholt Durchläufe über alle freien Felder, bis nichts mehr passt.
  // Reihenfolge grob von innen nach außen (mit Zufall): innere Pfeile kommen zuerst,
  // solange ihre Bahn nach außen noch frei ist – so wird das Brett viel dichter.
  const cx0 = (w - 1) / 2, cy0 = (h - 1) / 2;
  const key = new Float32Array(N);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      key[idx(x, y)] = Math.max(Math.abs(x - cx0) / (w / 2), Math.abs(y - cy0) / (h / 2)) + rnd() * spread;
  let changed = true;
  while (changed) {
    changed = false;
    const cands = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (inside(x, y) && occ[idx(x, y)] === -1) cands.push([x, y]);
    cands.sort((p, q) => key[idx(p[0], p[1])] - key[idx(q[0], q[1])]);
    for (const [x, y] of cands) {
      for (const d of shuffle([0, 1, 2, 3], rnd)) {
        const a = tryPlace(x, y, d);
        if (a) { addArrow(a); changed = true; break; }
      }
    }
    if (fillGaps()) changed = true;
  }

  return { w, h, mask, arrows };
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
// Große Bretter brauchen länger – dort weniger Versuche.
export function generateLevel(level) {
  const p = levelParams(level);
  const cells = p.mask ? p.mask.reduce((s, m) => s + m, 0) : p.w * p.h;
  const tries = Math.max(2, Math.min(4 + level, Math.round(12000 / cells)));
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const L = generate({ ...p, seed: p.seed + i * 31337 });
    const r = solveRounds(L);
    if (!r.solvable) continue;
    const filled = L.arrows.reduce((s, a) => s + a.cells.length, 0) / cells;
    const freeAtStart = r.firstRound / L.arrows.length;
    const score = r.rounds * 3 + filled * 40 - freeAtStart * 12;
    if (score > bestScore) { bestScore = score; best = L; }
  }
  best.level = level;
  best.shape = p.shape;
  best.cellCount = cells;
  return best;
}

// Löst ein Level komplett (Entfernen in Runden). Für Tests und Hinweise.
export function solveRounds(level) {
  const { w, h, arrows } = level;
  const occ = new Int16Array(w * h).fill(-1);
  for (const a of arrows) for (const [x, y] of a.cells) occ[y * w + x] = a.id;
  let left = arrows.map((a) => a.id);
  let rounds = 0, firstRound = 0;
  while (left.length) {
    const free = left.filter((id) => blockDistance(arrows[id], occ, w, h) === null);
    if (!free.length) return { solvable: false, rounds, firstRound, remaining: left.length };
    if (rounds === 0) firstRound = free.length;
    const freeSet = new Set(free);
    for (const id of free) for (const [x, y] of arrows[id].cells) occ[y * w + x] = -1;
    left = left.filter((id) => !freeSet.has(id));
    rounds++;
  }
  return { solvable: true, rounds, firstRound, remaining: 0 };
}
