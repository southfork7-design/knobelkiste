// Schraubwerk – Level-Generator. Jedes Level wird mit dem Löser geprüft.
import { mulberry32, randInt, shuffle } from '../../rng.js';
import { covers, hasHoleAt, initialState, solve, legalMoves, screwBlocked } from './model.js';

export function levelParams(level) {
  return {
    cols: 5,
    rows: level <= 4 ? 6 : 7,
    plates: Math.min(3 + Math.floor((level + 1) / 2), 11),
    extraHoles: level <= 6 ? 3 : 2,
    seed: level * 8191 + 1237,
  };
}

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function randomPlate(rnd, cols, rows) {
  for (let tries = 0; tries < 100; tries++) {
    const x = randInt(rnd, 0, cols - 1), y = randInt(rnd, 0, rows - 1);
    const pts = [[x, y]];
    const kind = rnd();
    if (kind < 0.6) {
      // gerade Strebe
      const [dx, dy] = DIRS[Math.floor(rnd() * (rnd() < 0.75 ? 2 : 4))];
      const len = randInt(rnd, 1, 3);
      pts.push([x + dx * len, y + dy * len]);
    } else {
      // Winkel (L-Form)
      const horizFirst = rnd() < 0.5;
      const a = randInt(rnd, 1, 2) * (rnd() < 0.5 ? 1 : -1), b = randInt(rnd, 1, 2) * (rnd() < 0.5 ? 1 : -1);
      const mid = horizFirst ? [x + a, y] : [x, y + a];
      pts.push(mid, horizFirst ? [mid[0], mid[1] + b] : [mid[0] + b, mid[1]]);
    }
    if (pts.some(([px, py]) => px < 0 || py < 0 || px >= cols || py >= rows)) continue;
    // Löcher an allen Rasterpunkten entlang der Strebe
    const holes = [];
    for (let k = 1; k < pts.length; k++) {
      const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
      const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      // Löcher an Enden und Ecken immer, an Zwischenpunkten nur manchmal –
      // so verdecken Teile darunterliegende Schrauben und Löcher.
      for (let s = k === 1 ? 0 : 1; s <= n; s++) {
        const corner = s === 0 || s === n;
        if (corner || rnd() < 0.35) holes.push([x1 + ((x2 - x1) * s) / n, y1 + ((y2 - y1) * s) / n]);
      }
    }
    // Schwerpunkt (Streben gewichtet nach Länge)
    let sx = 0, sy = 0, sw = 0;
    for (let k = 1; k < pts.length; k++) {
      const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
      const w = Math.hypot(x2 - x1, y2 - y1);
      sx += w * (x1 + x2) / 2; sy += w * (y1 + y2) / 2; sw += w;
    }
    return { points: pts, holes, com: [sx / sw, sy / sw] };
  }
  return null;
}

function buildLevel(params, rnd) {
  const { cols, rows } = params;
  const plates = [];
  const key = (p) => p.holes.map((h) => h.join(':')).sort().join('|');
  const used = new Set();
  while (plates.length < params.plates) {
    const p = randomPlate(rnd, cols, rows);
    if (!p || used.has(key(p))) continue;
    used.add(key(p));
    plates.push({ ...p, id: plates.length, layer: plates.length });
  }
  const ident = { θ: 0, tx: 0, ty: 0 };
  // Schrauben: je Teil 2 (bei langen Teilen manchmal 3) seiner Löcher
  const screwPts = new Map();
  for (const pl of plates) {
    const n = Math.min(pl.holes.length, pl.holes.length >= 4 && rnd() < 0.3 ? 3 : 2);
    for (const h of shuffle(pl.holes.slice(), rnd).slice(0, n)) screwPts.set(h.join(':'), h);
  }
  const holes = [...screwPts.values()];
  // Zusätzliche freie Löcher: nicht überdeckt oder passend unter Teil-Löchern
  const cand = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (screwPts.has(`${x}:${y}`)) continue;
      const q = [x, y];
      const ok = plates.every((pl) => !covers(pl, ident, q) || hasHoleAt(pl, ident, q));
      if (ok) cand.push(q);
    }
  shuffle(cand, rnd);
  holes.push(...cand.slice(0, params.extraHoles));
  // Ein paar weitere Brettlöcher (auch unter Teilen) für Abwechslung
  const more = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) more.push([x, y]);
  for (const q of shuffle(more, rnd).slice(0, 3)) if (!holes.some((h) => h[0] === q[0] && h[1] === q[1])) holes.push(q);
  return {
    cols, rows, plates, holes,
    screws: holes.map((h, i) => (screwPts.has(h.join(':')) ? i : -1)).filter((i) => i >= 0),
  };
}

export function generateLevel(level) {
  const params = levelParams(level);
  const rnd = mulberry32(params.seed);
  let best = null;
  for (let attempt = 1; attempt <= 60; attempt++) {
    const L = buildLevel(params, rnd);
    const s0 = initialState(L);
    if (s0.poses.some((p) => p === null)) continue;          // nichts soll sofort fallen
    if (legalMoves(L, s0).length === 0) continue;
    const res = solve(L, s0, 4000);
    if (!res || !res.path) continue;
    // Bevorzugt: viele verdeckte Schrauben (Reihenfolge wird wichtig), lange Lösung
    const covered = s0.screws.filter((_, i) => screwBlocked(L, s0, i)).length;
    const score = res.path.length + covered * 6;
    if (!best || score > best.score) best = { ...L, solution: res.path, score, attempts: attempt };
    if (attempt >= 14 && best) break;
  }
  return { ...best, level };
}
