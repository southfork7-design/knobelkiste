// Schraubwerk – Level-Generator. Jedes Level wird mit dem Löser geprüft.
import { mulberry32, randInt, shuffle } from '../../rng.js';
export const VERSION = 6; // bei Änderungen am Generator hochzählen (gespeicherte Level verwerfen)

import { covers, hasHoleAt, initialState, solve, legalMoves, screwBlocked, applyMove } from './model.js';

// Probespiel: zufällige Züge mit Schrauben, die ein Teil halten. Wer so spielt,
// soll nicht schon in den ersten Zügen in einer Sackgasse landen.
function earlyDeadEnd(L, s0, rnd, runs = 4, depth = 15) {
  for (let r = 0; r < runs; r++) {
    let s = s0;
    for (let n = 0; n < depth; n++) {
      const lm = legalMoves(L, s);
      if (!lm.length) return true;
      if (s.poses.every((p) => !p)) break;
      const useful = lm.filter(([i]) => s.pins[i].some((id) => s.poses[id]));
      const pool = useful.length ? useful : lm;
      s = applyMove(L, s, pool[Math.floor(rnd() * pool.length)]);
    }
  }
  return false;
}

// Bretter wachsen von 6×8 bis 12×18 Löchern (hochkant); die Teile liegen
// dicht in vielen Ebenen übereinander. Freie Löcher sind knapp, aber nie so knapp,
// dass ein Zug abseits der Lösung gleich in die Sackgasse führt.
export function levelParams(level) {
  const cols = Math.min(12, 6 + Math.floor((level - 1) / 4));
  const rows = Math.min(18, Math.round(cols * 1.45));
  return {
    cols, rows,
    plates: Math.round(cols * rows * (level <= 3 ? 0.3 : 0.4)),
    holeShare: 0.35,
    minFree: Math.max(5, Math.round(cols * rows * 0.06)),
    hideScrews: level <= 3 ? 0.3 : 0.6,
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
  const cover = new Uint16Array(cols * rows); // wie oft ein Rasterpunkt schon bedeckt ist
  const ident = { θ: 0, tx: 0, ty: 0 };
  // Rasterpunkte, die ein Teil bedeckt (Strebe läuft durch)
  const pointsOf = (p) => {
    const out = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (covers(p, ident, [x, y])) out.push(y * cols + x);
    return out;
  };
  let guard = 0, coveredPts = 0;
  while (plates.length < params.plates && guard++ < params.plates * 60) {
    // mehrere Kandidaten, bevorzugt einer, der wenig Bedecktes bedeckt (dichte Füllung)
    let best = null;
    for (let k = 0; k < 10; k++) {
      const p = randomPlate(rnd, cols, rows);
      if (!p || used.has(key(p))) continue;
      const pts = pointsOf(p);
      // erst flächig füllen, danach eine zweite Ebene über die erste legen
      const want = coveredPts < cols * rows * 0.8 ? 0 : 1;
      const cost = pts.reduce((a, i) => a + (cover[i] - want) ** 2 + (cover[i] < want ? 0.5 : 0), 0) / pts.length + rnd() * 0.5;
      if (!best || cost < best.cost) best = { p, pts, cost };
    }
    if (!best) continue;
    used.add(key(best.p));
    for (const i of best.pts) if (cover[i]++ === 0) coveredPts++;
    plates.push({ ...best.p, id: plates.length, layer: plates.length });
  }
  // Schrauben: je Teil 2 (bei langen Teilen manchmal 3) seiner Löcher
  const screwPts = new Map();
  // Bevorzugt Löcher, die ein höheres Teil verdeckt: dann zählt die Reihenfolge.
  const hiddenBy = (pl, h) => plates.some((o) => o.layer > pl.layer && covers(o, ident, h) && !hasHoleAt(o, ident, h));
  const pierceFree = (h) => {
    const top = Math.max(...plates.filter((o) => hasHoleAt(o, ident, h)).map((o) => o.layer));
    return plates.every((o) => o.layer >= top || !covers(o, ident, h) || hasHoleAt(o, ident, h));
  };
  for (const pl of plates) {
    const n = Math.min(pl.holes.length, pl.holes.length >= 4 && rnd() < 0.3 ? 3 : 2);
    // Ein Schraubenstift darf kein Teil durchbohren: Jedes Teil unter dem obersten
    // gehaltenen Teil, das über dem Loch liegt, braucht dort selbst ein Loch.
    const hs = shuffle(pl.holes.filter(pierceFree), rnd);
    if (rnd() < params.hideScrews) hs.sort((a, b) => hiddenBy(pl, b) - hiddenBy(pl, a));
    for (const h of hs.slice(0, n)) screwPts.set(h.join(':'), h);
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
  // Brettlöcher an gut einem Drittel der übrigen Rasterpunkte, davon einige sofort frei.
  // (Mit nur wenigen freien Löchern führte fast jeder Zug abseits der Lösung in eine Sackgasse.)
  shuffle(cand, rnd);
  const start = cand.slice(0, params.minFree);
  const taken = new Set(start.map((q) => q.join(':')));
  holes.push(...start);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const k = `${x}:${y}`;
      if (!screwPts.has(k) && !taken.has(k) && rnd() < params.holeShare) holes.push([x, y]);
    }
  return {
    cols, rows, plates, holes,
    screws: holes.map((h, i) => (screwPts.has(h.join(':')) ? i : -1)).filter((i) => i >= 0),
  };
}

export function generateLevel(level) {
  const params = levelParams(level);
  const rnd = mulberry32(params.seed);
  let best = null, fallback = null;
  for (let attempt = 1; attempt <= 40; attempt++) {
    const L = buildLevel(params, rnd);
    const s0 = initialState(L);
    if (s0.poses.some((p) => p === null)) continue;          // nichts soll sofort fallen
    if (legalMoves(L, s0).length === 0) continue;
    const res = solve(L, s0, 4000);
    if (!res || !res.path) continue;
    if (earlyDeadEnd(L, s0, rnd)) { fallback ||= { ...L, solution: res.path, score: 0, attempts: attempt }; continue; }
    // Bevorzugt: viele verdeckte Schrauben (Reihenfolge wird wichtig), lange Lösung
    const covered = s0.screws.filter((_, i) => screwBlocked(L, s0, i)).length;
    const score = res.path.length + covered * 3;
    if (!best || score > best.score) best = { ...L, solution: res.path, score, attempts: attempt };
    if (best && attempt >= 3) break;
  }
  return { ...(best || fallback), level };
}
