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
// - Teil mit genau einer Schraube: pendelt, bis der Schwerpunkt unter ihr hängt
//   oder es an einen Schraubenstift stößt (siehe Physik).
// - Teil ohne Schraube: fällt, rutscht an Stiften ab oder bleibt auf ihnen liegen.

export const THICK = 0.42;      // halbe Strebenbreite (für Überdeckung)
export const ALIGN = 0.18;      // Toleranz für „Loch liegt auf Loch“

const rot = (θ, [x, y]) => [Math.cos(θ) * x - Math.sin(θ) * y, Math.sin(θ) * x + Math.cos(θ) * y];
export const toWorld = (pose, p) => { const [x, y] = rot(pose.θ, p); return [x + pose.tx, y + pose.ty]; };

function distSeg([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}

// Weltlage eines Teils (zwischengespeichert je Lage-Objekt)
const geoCache = new WeakMap();
function geo(plate, pose) {
  let g = geoCache.get(pose);
  if (g && g.plate === plate) return g;
  const pts = plate.points.map((p) => toWorld(pose, p));
  const holes = plate.holes.map((p) => toWorld(pose, p));
  const m = THICK + 0.05;
  g = {
    plate, pts, holes,
    x0: Math.min(...pts.map((p) => p[0])) - m, x1: Math.max(...pts.map((p) => p[0])) + m,
    y0: Math.min(...pts.map((p) => p[1])) - m, y1: Math.max(...pts.map((p) => p[1])) + m,
  };
  geoCache.set(pose, g);
  return g;
}

// Liegt Teil (in Lage pose) über Punkt q?
export function covers(plate, pose, q) {
  const g = geo(plate, pose);
  if (q[0] < g.x0 || q[0] > g.x1 || q[1] < g.y0 || q[1] > g.y1) return false;
  const pts = g.pts;
  for (let k = 1; k < pts.length; k++) if (distSeg(q, pts[k - 1], pts[k]) < THICK + 0.05) return true;
  return false;
}
// Hat das Teil an Punkt q ein Loch?
export function hasHoleAt(plate, pose, q) {
  const g = geo(plate, pose);
  if (q[0] < g.x0 || q[0] > g.x1 || q[1] < g.y0 || q[1] > g.y1) return false;
  return g.holes.some((w) => Math.abs(w[0] - q[0]) < ALIGN && Math.abs(w[1] - q[1]) < ALIGN && Math.hypot(w[0] - q[0], w[1] - q[1]) < ALIGN);
}

const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- Physik ----------
// Jede Schraube, die Teile hält, ragt als Stift vom Brett bis zu ihrem obersten
// gehaltenen Teil. Teile in diesen Lagen (die sie nicht hält) stoßen daran an.
// Teile verschiedener Lagen gehen aneinander vorbei.
export const PEG = 0.18;              // Stiftradius
const REACH = THICK + PEG;            // Abstand Stiftmitte – Strebenmitte bei Berührung

// Stifte, an die ein Teil stoßen kann (Weltpunkte)
function pegsFor(level, s, plate, tops) {
  const out = [];
  s.screws.forEach((hi, j) => {
    if (tops[j] >= plate.layer && !s.pins[j].includes(plate.id)) out.push(level.holes[hi]);
  });
  return out;
}
function topsOf(level, s) {
  return s.pins.map((ps) => {
    let t = -1;
    for (const id of ps) if (s.poses[id] && level.plates[id].layer > t) t = level.plates[id].layer;
    return t;
  });
}
function hitsPeg(plate, pose, pegs, slack = 0) {
  const g = geo(plate, pose), m = PEG + slack;
  for (const q of pegs) {
    if (q[0] < g.x0 - m || q[0] > g.x1 + m || q[1] < g.y0 - m || q[1] > g.y1 + m) continue;
    for (let k = 1; k < g.pts.length; k++) if (distSeg(q, g.pts[k - 1], g.pts[k]) < REACH + slack) return true;
  }
  return false;
}

// Pendeln um Punkt B: dreht in Richtung der Schwerkraft, bis der Schwerpunkt unter B
// hängt oder das Teil an einen Stift stößt (dann bleibt es angelehnt).
function swing(plate, pose, B, pegs, rec) {
  const h = plate.holes.find((hh) => { const w = toWorld(pose, hh); return Math.hypot(w[0] - B[0], w[1] - B[1]) < ALIGN; });
  const v = [plate.com[0] - h[0], plate.com[1] - h[1]];
  if (Math.hypot(v[0], v[1]) < 1e-6) return pose;
  const θ0 = pose.θ;
  const θeq = Math.PI / 2 - Math.atan2(v[1], v[0]);
  const at = (θ) => { const [rx, ry] = rot(θ, h); return { θ: normAngle(θ), tx: B[0] - rx, ty: B[1] - ry }; };
  const delta = normAngle(θeq - θ0);
  if (Math.abs(delta) < 1e-9) return pose;
  const n = Math.max(1, Math.ceil(Math.abs(delta) / 0.02));
  let prev = θ0;
  for (let k = 1; k <= n; k++) {
    const θ = θ0 + (delta * k) / n;
    if (hitsPeg(plate, at(θ), pegs)) {
      let lo = prev, hi = θ;
      for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (hitsPeg(plate, at(mid), pegs)) hi = mid; else lo = mid; }
      if (Math.abs(lo - θ0) < 1e-9) return pose;
      const p = at(lo);
      if (rec) rec.push(p);
      return p;
    }
    if (rec) rec.push(at(θ));
    prev = θ;
  }
  return at(θ0 + delta);
}

// Fallen: kleine Starrkörper-Simulation (Schwerkraft, Stifte mit Reibung).
// Liefert die Ruhelage oder null, wenn das Teil vom Brett fällt.
const DT = 1 / 120, GRAV = 30, MU = 0.35;
function fall(plate, pose, pegs, bottom, rec) {
  const g0 = geo(plate, pose);
  const way = pegs.filter((q) => q[0] > g0.x0 - PEG && q[0] < g0.x1 + PEG && q[1] > g0.y0 - PEG);
  // Kein Stift im Weg nach unten: fällt einfach heraus
  if (!way.length) {
    if (rec) for (let k = 1; k <= 12; k++) rec.push({ θ: pose.θ, tx: pose.tx, ty: pose.ty + (k / 12) ** 2 * (bottom + 2 - g0.y0) });
    return null;
  }
  const com = plate.com;
  const local = plate.points.map(([x, y]) => [x - com[0], y - com[1]]);
  let mass = 0, inertia = 0;
  for (let k = 1; k < local.length; k++) {
    const [x1, y1] = local[k - 1], [x2, y2] = local[k];
    const len = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    mass += len; inertia += (len ** 3) / 12 + len * (mx * mx + my * my);
  }
  mass = Math.max(mass, 0.5); inertia = Math.max(inertia, 0.1);
  const ext = Math.max(...local.map(([x, y]) => Math.hypot(x, y))) + THICK;
  // kleiner Anstoß, damit nichts unnatürlich auf einer Stiftspitze balanciert
  let [cx, cy] = toWorld(pose, com), θ = pose.θ, vx = 0, vy = 0, w = plate.id % 2 ? 0.5 : -0.5;
  const poseOf = () => { const [rx, ry] = rot(θ, com); return { θ: normAngle(θ), tx: cx - rx, ty: cy - ry }; };
  const contacts = () => {
    const c = Math.cos(θ), sn = Math.sin(θ);
    const pts = local.map(([x, y]) => [c * x - sn * y + cx, sn * x + c * y + cy]);
    const out = [];
    for (const q of way) {
      if (Math.abs(q[0] - cx) > ext + PEG || Math.abs(q[1] - cy) > ext + PEG) continue;
      let best = null;
      for (let k = 1; k < pts.length; k++) {
        const [x1, y1] = pts[k - 1], [x2, y2] = pts[k];
        const dx = x2 - x1, dy = y2 - y1;
        const u = Math.max(0, Math.min(1, ((q[0] - x1) * dx + (q[1] - y1) * dy) / (dx * dx + dy * dy || 1)));
        const px = x1 + u * dx, py = y1 + u * dy, d = Math.hypot(px - q[0], py - q[1]);
        if (!best || d < best.d) best = { d, px, py };
      }
      if (best && best.d < REACH + 0.01 && best.d > 1e-9) {
        const nx = (best.px - q[0]) / best.d, ny = (best.py - q[1]) / best.d;
        // Berührpunkt auf der Oberfläche, relativ zum Schwerpunkt
        out.push({ nx, ny, rx: best.px - nx * THICK - cx, ry: best.py - ny * THICK - cy, pen: REACH - best.d, pn: 0, pt: 0 });
      }
    }
    return out;
  };
  let calm = 0;
  for (let step = 0; step < 900; step++) {
    vy += GRAV * DT;
    const cs = contacts();
    for (let it = 0; it < 6; it++) {
      for (const k of cs) {
        const vcx = vx - w * k.ry, vcy = vy + w * k.rx;
        const vn = vcx * k.nx + vcy * k.ny;
        const rn = k.rx * k.ny - k.ry * k.nx;
        let jn = -vn / (1 / mass + (rn * rn) / inertia);
        const pn = Math.max(0, k.pn + jn); jn = pn - k.pn; k.pn = pn;
        vx += (jn * k.nx) / mass; vy += (jn * k.ny) / mass; w += (rn * jn) / inertia;
        const tx = -k.ny, ty = k.nx;
        const vcx2 = vx - w * k.ry, vcy2 = vy + w * k.rx;
        const vt = vcx2 * tx + vcy2 * ty;
        const rt = k.rx * ty - k.ry * tx;
        let jt = -vt / (1 / mass + (rt * rt) / inertia);
        const pt = Math.max(-MU * k.pn, Math.min(MU * k.pn, k.pt + jt)); jt = pt - k.pt; k.pt = pt;
        vx += (jt * tx) / mass; vy += (jt * ty) / mass; w += (rt * jt) / inertia;
      }
    }
    vx *= 0.998; vy *= 0.998; w *= 0.99;
    cx += vx * DT; cy += vy * DT; θ += w * DT;
    for (const k of contacts()) if (k.pen > 0) { cx += k.nx * k.pen * 0.8; cy += k.ny * k.pen * 0.8; }
    if (rec && step % 3 === 2) rec.push(poseOf());
    if (cy - ext > bottom + 0.5) return null;
    const speed = Math.hypot(vx, vy) + Math.abs(w) * ext;
    calm = cs.length && speed < 0.04 ? calm + 1 : 0;
    if (calm >= 30) break;
  }
  const p = poseOf();
  if (Math.abs(normAngle(p.θ - pose.θ)) < 1e-4 && Math.abs(p.tx - pose.tx) < 1e-4 && Math.abs(p.ty - pose.ty) < 1e-4) return pose;
  if (rec) rec.push(p);
  return p;
}

// Ergebnisse merken (gleiche Lage + gleiche Stifte → gleiches Ergebnis)
const memo = new Map();
function cached(kind, plate, pose, pegs, extra, fn) {
  const key = `${kind}${plate.id}|${pose.θ},${pose.tx},${pose.ty}|${extra}|${pegs.map((q) => q[0] + ',' + q[1]).join(';')}`;
  if (memo.has(key)) return memo.get(key);
  if (memo.size > 50000) memo.clear();
  const r = fn();
  memo.set(key, r);
  return r;
}

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

// Teile mit 1 Schraube pendeln, ohne Schraube fallen sie oder bleiben an Stiften liegen.
// rec (optional): Map plateId → Liste von Zwischenlagen für die Animation.
function settle(level, s, rec) {
  const poses = s.poses.slice();
  const cnt = new Array(poses.length).fill(0), last = new Array(poses.length).fill(-1);
  s.pins.forEach((ps, i) => { for (const id of ps) if (s.poses[id]) { cnt[id]++; last[id] = i; } });
  const tops = topsOf(level, s);
  const bottom = level.rows + 0.5;
  for (const pl of level.plates) {
    const pose = poses[pl.id];
    if (!pose || cnt[pl.id] >= 2) continue;
    const pegs = pegsFor(level, s, pl, tops);
    const frames = rec ? [] : null;
    if (cnt[pl.id] === 1) {
      const B = level.holes[s.screws[last[pl.id]]];
      poses[pl.id] = rec ? swing(pl, pose, B, pegs, frames)
        : cached('s', pl, pose, pegs, B.join(','), () => swing(pl, pose, B, pegs, null));
    } else {
      poses[pl.id] = rec ? fall(pl, pose, pegs, bottom, frames)
        : cached('f', pl, pose, pegs, '', () => fall(pl, pose, pegs, bottom, null));
    }
    if (rec && frames.length) rec.set(pl.id, frames);
  }
  const pins = s.pins.map((ps) => ps.filter((id) => poses[id]));
  return { ...s, pins, poses };
}

// Stifte, an denen ein lose liegendes Teil gerade anliegt (für die Löser-Bewertung)
function supports(level, s, tops) {
  const out = new Set();
  const held = new Set(s.pins.flat());
  for (const pl of level.plates) {
    const pose = s.poses[pl.id];
    if (!pose || held.has(pl.id)) continue;
    s.screws.forEach((hi, j) => {
      if (tops[j] >= pl.layer && hitsPeg(pl, pose, [level.holes[hi]], 0.03)) out.add(j);
    });
  }
  return out;
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

export function applyMove(level, s, [i, hi], rec) {
  const q = level.holes[hi];
  const screws = s.screws.slice(); screws[i] = hi;
  const pins = s.pins.slice();
  pins[i] = level.plates.filter((pl) => s.poses[pl.id] && hasHoleAt(pl, s.poses[pl.id], q)).map((pl) => pl.id);
  return settle(level, { screws, pins, poses: s.poses }, rec);
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

// Sinnvolle Züge, nach Nutzen sortiert (für Löser und Tipp). Schrauben, die
// kein Teil halten, werden nicht bewegt; je Zug zählt, ob ein Teil fällt oder
// pendelt und ob die Schraube im Ziel ungewollt weitere Teile festhält.
export function rankedMoves(level, s, limit = 10) {
  const free = level.holes.map((_, hi) => hi).filter((hi) => targetFree(level, s, hi));
  if (!free.length) return [];
  const hold = new Array(s.poses.length).fill(0);
  s.pins.forEach((ps) => { for (const id of ps) if (s.poses[id]) hold[id]++; });
  const pinCost = free.map((hi) => {
    const q = level.holes[hi];
    let c = 0;
    for (const pl of level.plates) if (s.poses[pl.id] && hasHoleAt(pl, s.poses[pl.id], q)) c++;
    return c;
  });
  const moves = [];
  const sup = supports(level, s, topsOf(level, s));
  s.screws.forEach((_, i) => {
    const mine = s.pins[i].filter((id) => s.poses[id]);
    if (!mine.length || screwBlocked(level, s, i)) return;
    let v = sup.has(i) ? 8 : 0;
    for (const id of mine) v += hold[id] === 1 ? 10 : hold[id] === 2 ? 3 : 1;
    free.forEach((hi, k) => moves.push({ m: [i, hi], v: v - 4 * pinCost[k] }));
  });
  moves.sort((a, b) => b.v - a.v);
  return moves.slice(0, limit).map((x) => x.m);
}

// Gezielte Suche (Best-First über die sinnvollsten Züge).
// Liefert { path, nodes } oder null, wenn nichts gefunden wurde.
export function solve(level, start, maxNodes = 3000, width = 10) {
  const startKey = stateKey(start);
  const seen = new Map([[startKey, null]]);
  const heap = [];
  let counter = 0;
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.n > b.n);
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
  if (isWon(start)) return { path: [], nodes: 0 };
  push({ s: start, key: startKey, f: score(start), n: counter++ });
  let nodes = 0;
  while (heap.length) {
    const { s, key } = pop();
    if (++nodes > maxNodes) return null;
    for (const m of rankedMoves(level, s, width)) {
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
      push({ s: t, key: k, f: score(t), n: counter++ });
    }
  }
  return null;
}
