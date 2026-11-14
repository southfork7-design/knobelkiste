// Schraubwerk – Spielmodell (ohne Darstellung, auch im Test nutzbar).
//
// Koordinaten in Rastereinheiten: Lochabstand = 1, y zeigt nach unten.
// Bauteile sind dicke Streben (Polylinien). Jedes Teil hat Löcher an allen
// Rasterpunkten entlang seiner Strebe (in seiner Ausgangslage).
// Lage eines Teils: world = R(θ)·local + t.
//
// Regeln:
// - Eine Schraube hält alle Teile, die beim Eindrehen ein Loch an dieser Stelle hatten.
// - Eine Schraube ist blockiert, wenn ein höher liegendes Teil (das sie nicht hält)
//   über ihr liegt.
// - Ziel-Loch ist frei, wenn keine Schraube darin steckt und jedes Teil, das
//   darüber liegt, dort selbst ein Loch hat (dann hält die Schraube es mit).
// - Teil mit genau einer Schraube: pendelt, bis der Schwerpunkt unter ihr hängt.
// - Teil ohne Schraube: fällt.

export const THICK = 0.42;      // halbe Strebenbreite (für Überdeckung)
export const ALIGN = 0.18;      // Toleranz für „Loch liegt auf Loch“

const rot = (θ, [x, y]) => [Math.cos(θ) * x - Math.sin(θ) * y, Math.sin(θ) * x + Math.cos(θ) * y];
export const toWorld = (pose, p) => { const [x, y] = rot(pose.θ, p); return [x + pose.tx, y + pose.ty]; };

function distSeg([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// Liegt Teil (in Lage pose) über Punkt q?
export function covers(plate, pose, q) {
  const pts = plate.points.map((p) => toWorld(pose, p));
  for (let k = 1; k < pts.length; k++) if (distSeg(q, pts[k - 1], pts[k]) < THICK + 0.05) return true;
  return false;
}
// Hat das Teil an Punkt q ein Loch?
export function hasHoleAt(plate, pose, q) {
  return plate.holes.some((h) => { const w = toWorld(pose, h); return Math.hypot(w[0] - q[0], w[1] - q[1]) < ALIGN; });
}

// Gleichgewichtslage beim Hängen an Punkt B (Weltkoordinate), ausgehend von pose
export function hangPose(plate, pose, B) {
  // lokales Loch, das gerade an B liegt
  const h = plate.holes.find((hh) => { const w = toWorld(pose, hh); return Math.hypot(w[0] - B[0], w[1] - B[1]) < ALIGN; });
  const v = [plate.com[0] - h[0], plate.com[1] - h[1]];
  if (Math.hypot(...v) < 1e-6) return pose; // Schwerpunkt genau auf der Schraube: bleibt
  const θ = Math.PI / 2 - Math.atan2(v[1], v[0]);
  const [rx, ry] = rot(θ, h);
  return { θ: normAngle(θ), tx: B[0] - rx, ty: B[1] - ry };
}
const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- Zustand ----------
// state = { screws: [holeIndex], pins: [[plateId…] je Schraube], poses: [pose|null] }
export function initialState(level) {
  const poses = level.plates.map(() => ({ θ: 0, tx: 0, ty: 0 }));
  const pins = level.screws.map((hi) => {
    const q = level.holes[hi];
    return level.plates.filter((pl) => hasHoleAt(pl, poses[pl.id], q)).map((pl) => pl.id);
  });
  return settle(level, { screws: level.screws.slice(), pins, poses });
}

// Teile mit 0 Schrauben fallen, mit 1 Schraube pendeln
function settle(level, s) {
  const poses = s.poses.slice();
  for (const pl of level.plates) {
    if (!poses[pl.id]) continue;
    const holding = s.pins.map((ps, i) => (ps.includes(pl.id) ? i : -1)).filter((i) => i >= 0);
    if (holding.length === 0) poses[pl.id] = null;
    else if (holding.length === 1) poses[pl.id] = hangPose(pl, poses[pl.id], level.holes[s.screws[holding[0]]]);
  }
  return { ...s, poses };
}

export function screwBlocked(level, s, i) {
  const q = level.holes[s.screws[i]];
  const mine = s.pins[i].filter((id) => s.poses[id]);
  const top = mine.length ? Math.max(...mine.map((id) => level.plates[id].layer)) : -1;
  return level.plates.some((pl) => s.poses[pl.id] && !mine.includes(pl.id) &&
    pl.layer > top && covers(pl, s.poses[pl.id], q));
}

export function targetFree(level, s, hi) {
  if (s.screws.includes(hi)) return false;
  const q = level.holes[hi];
  return level.plates.every((pl) => !s.poses[pl.id] || !covers(pl, s.poses[pl.id], q) || hasHoleAt(pl, s.poses[pl.id], q));
}

export function legalMoves(level, s) {
  const free = level.holes.map((_, hi) => hi).filter((hi) => targetFree(level, s, hi));
  const moves = [];
  s.screws.forEach((_, i) => {
    if (screwBlocked(level, s, i)) return;
    for (const hi of free) moves.push([i, hi]);
  });
  return moves;
}

export function applyMove(level, s, [i, hi]) {
  const q = level.holes[hi];
  const screws = s.screws.slice(); screws[i] = hi;
  const pins = s.pins.slice();
  pins[i] = level.plates.filter((pl) => s.poses[pl.id] && hasHoleAt(pl, s.poses[pl.id], q)).map((pl) => pl.id);
  // gefallene Teile aus allen Schrauben entfernen
  return settle(level, { screws, pins, poses: s.poses });
}

export const isWon = (s) => s.poses.every((p) => p === null);

// Schrauben sind untereinander gleich: Schlüssel nur aus belegten Löchern
export function stateKey(s) {
  const r = (v) => Math.round(v * 100);
  const occ = s.screws.map((h, i) => `${h}:${s.pins[i].filter((id) => s.poses[id]).sort((a, b) => a - b).join('.')}`).sort();
  return occ.join(',') + '|' + s.poses.map((p) => (p ? `${r(p.θ)}:${r(p.tx)}:${r(p.ty)}` : 'x')).join(',');
}

// Bewertung für die gezielte Suche: wenige Teile, wenige Schrauben in Teilen
function score(s) {
  let alive = 0, held = 0;
  s.poses.forEach((p) => { if (p) alive++; });
  s.pins.forEach((ps) => { held += ps.filter((id) => s.poses[id]).length; });
  return alive * 10 + held;
}

// Gezielte Suche (Best-First). Liefert { path, nodes } oder null bei Abbruch.
// path === null heißt: vollständig durchsucht, unlösbar.
export function solve(level, start, maxNodes = 20000) {
  const startKey = stateKey(start);
  const seen = new Map([[startKey, null]]);
  const heap = [];
  let counter = 0;
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(heap[p], heap[i])) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.n < b.n);
  push({ s: start, key: startKey, f: score(start), n: counter++ });
  let nodes = 0;
  while (heap.length) {
    const { s, key } = pop();
    for (const m of legalMoves(level, s)) {
      const t = applyMove(level, s, m);
      const k = stateKey(t);
      if (seen.has(k)) continue;
      seen.set(k, { prev: key, move: m });
      if (isWon(t)) {
        const path = [];
        let cur = k;
        while (seen.get(cur)) { path.unshift(seen.get(cur).move); cur = seen.get(cur).prev; }
        return { path, nodes };
      }
      if (++nodes > maxNodes) return null;
      push({ s: t, key: k, f: score(t), n: counter++ });
    }
  }
  return { path: null, nodes };
}
