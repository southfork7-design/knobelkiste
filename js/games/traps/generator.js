// Fallenfeld: Level-Erzeugung und logischer Löser (ohne Raten).
// Regel: In manchen Feldern liegen Fallen. Ein aufgedecktes Feld zeigt, wie viele
// Fallen in seinen 8 Nachbarfeldern liegen. Alle Felder ohne Falle aufdecken.
//
// Der Löser kennt nur Schlüsse, die auch ein Mensch zieht:
//  1. eine Zahl allein (alle Fallen schon gefunden → Rest frei; so viele verdeckte
//     Nachbarn wie fehlende Fallen → alles Fallen),
//  2. zwei Zahlen gemeinsam (Überschneidung ihrer verdeckten Nachbarn),
//  3. die Anzahl der übrigen Fallen (nur ganz am Ende: 0 übrig bzw. alle übrigen Felder).
// Der Generator verschiebt Fallen so lange, bis der Löser vom Startbereich aus alles schafft.
import { mulberry32 } from '../../rng.js';

export const VERSION = 1;
const SIZES = [10, 12, 14, 16, 20, 24, 28, 32, 38, 44, 50];

export function levelParams(level) {
  const st = Math.min(SIZES.length - 1, Math.floor((level - 1) / 3));
  const n = SIZES[st];
  const dens = 0.14 + (0.07 * st) / (SIZES.length - 1) + ((level - 1) % 3) * 0.003;
  return { W: n, H: n, mines: Math.round(n * n * dens) };
}

// Nachbarn (8) und Umgebung im Abstand 2 (24) für jedes Feld
const gridCache = new Map();
export function makeGrid(W, H) {
  const key = W + 'x' + H;
  if (gridCache.has(key)) return gridCache.get(key);
  const N = W * H;
  const nb = [], nb2 = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / W), c = i % W;
    const a = [], b = [];
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
        const j = rr * W + cc;
        b.push(j);
        if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) a.push(j);
      }
    nb.push(Int32Array.from(a));
    nb2.push(Int32Array.from(b));
  }
  const g = { W, H, N, nb, nb2 };
  gridCache.set(key, g);
  return g;
}

export function countNumbers(g, mines) {
  const num = new Uint8Array(g.N);
  for (let i = 0; i < g.N; i++) if (mines[i]) for (const j of g.nb[i]) num[j]++;
  return num;
}

// known: Int8Array, -1 verdeckt, 0 aufgedeckt (frei), 1 Falle bekannt.
// reveal: als frei erkannte Felder werden aufgedeckt (ihre Zahl hilft weiter). Ohne reveal
// bekommen sie den Wert 2 (frei, aber noch zu) – so zieht der Löser nur Schlüsse aus dem,
// was gerade zu sehen ist (für Tipps und die Gegenprobe im Test).
// Gibt den Endstand zurück; mit record die Schlüsse in Reihenfolge
// ({ i, mine, rule }: rule 0 = Aufdecken einer Null, 1 = eine Zahl, 2 = zwei Zahlen, 3 = Anzahl).
export function logicSolve(g, num, known, total, { record = false, maxSteps = Infinity, reveal = true } = {}) {
  const { N, nb, nb2 } = g;
  const K = Int8Array.from(known);
  let unknown = 0, minesKnown = 0;
  for (let i = 0; i < N; i++) { if (K[i] === -1) unknown++; else if (K[i] === 1) minesKnown++; }
  const queue = [], inQ = new Uint8Array(N), dirty = new Uint8Array(N);
  const steps = [];
  let pairUses = 0, deduced = 0;
  const pend = [];

  function touch(i) {
    for (const j of nb[i]) if (K[j] === 0) {
      dirty[j] = 1;
      if (!inQ[j]) { inQ[j] = 1; queue.push(j); }
    }
  }
  function set(i, v, rule) {
    pend.push(i, v, rule);
    while (pend.length) {
      const ru = pend.pop(), vv = pend.pop(), x = pend.pop();
      if (K[x] !== -1) continue;
      K[x] = vv || reveal ? vv : 2; unknown--; deduced++;
      if (vv) minesKnown++;
      if (record) steps.push({ i: x, mine: !!vv, rule: ru });
      touch(x);
      if (!vv && reveal) {
        dirty[x] = 1;
        if (!inQ[x]) { inQ[x] = 1; queue.push(x); }
        if (num[x] === 0) for (const j of nb[x]) if (K[j] === -1) pend.push(j, 0, 0);
      }
    }
  }
  // verdeckte Nachbarn und fehlende Fallen einer Zahl
  const U = [[], []];
  function info(c, slot) {
    const u = U[slot];
    u.length = 0;
    let m = 0;
    for (const j of nb[c]) { if (K[j] === -1) u.push(j); else if (K[j] === 1) m++; }
    return num[c] - m;
  }
  function single(c) {
    const r = info(c, 0);
    const u = U[0];
    if (!u.length) return false;
    if (r === 0) { for (const j of [...u]) set(j, 0, 1); return true; }
    if (r === u.length) { for (const j of [...u]) set(j, 1, 1); return true; }
    return false;
  }
  function pair(a, b) {
    const ra = info(a, 0), rb = info(b, 1);
    const ua = U[0], ub = U[1];
    if (!ua.length || !ub.length) return false;
    let inter = 0;
    for (const x of ua) if (ub.includes(x)) inter++;
    if (!inter) return false;
    const oa = ua.length - inter, ob = ub.length - inter;
    const maxI = Math.min(ra, rb, inter), minI = Math.max(0, ra - oa, rb - ob);
    const res = [];
    // nur in a / nur in b / gemeinsam
    if (oa && ra - maxI === oa) for (const x of ua) if (!ub.includes(x)) res.push(x, 1);
    if (oa && ra - minI === 0) for (const x of ua) if (!ub.includes(x)) res.push(x, 0);
    if (ob && rb - maxI === ob) for (const x of ub) if (!ua.includes(x)) res.push(x, 1);
    if (ob && rb - minI === 0) for (const x of ub) if (!ua.includes(x)) res.push(x, 0);
    if (minI === inter) for (const x of ua) if (ub.includes(x)) res.push(x, 1);
    if (maxI === 0) for (const x of ua) if (ub.includes(x)) res.push(x, 0);
    if (!res.length) return false;
    pairUses++;
    for (let k = 0; k < res.length; k += 2) set(res[k], res[k + 1], 2);
    return true;
  }

  for (let i = 0; i < N; i++) if (K[i] === 0) { inQ[i] = 1; dirty[i] = 1; queue.push(i); }
  // Nullen, die schon offen sind, aber verdeckte Nachbarn haben (z. B. Startfeld)
  for (let i = 0; i < N; i++) if (K[i] === 0 && num[i] === 0) for (const j of nb[i]) if (K[j] === -1) set(j, 0, 0);

  while (unknown > 0 && deduced < maxSteps) {
    while (queue.length && deduced < maxSteps) {
      const c = queue.pop();
      inQ[c] = 0;
      single(c);
    }
    if (!unknown || deduced >= maxSteps) break;
    let prog = false;
    for (let a = 0; a < N && !prog; a++) {
      if (!dirty[a] || K[a] !== 0) continue;
      dirty[a] = 0;
      let hasU = false;
      for (const j of nb[a]) if (K[j] === -1) { hasU = true; break; }
      if (!hasU) continue;
      for (const b of nb2[a]) {
        if (K[b] !== 0) continue;
        if (pair(a, b)) { prog = true; break; }
      }
    }
    if (prog) continue;
    const rest = total - minesKnown;
    if (rest === 0 || rest === unknown) {
      for (let i = 0; i < N; i++) if (K[i] === -1) set(i, rest ? 1 : 0, 3);
      continue;
    }
    break;
  }
  return { solved: unknown === 0, K, steps, unknown, pairUses, deduced };
}

// Aus mehreren Kandidaten das schwierigste: viele Schlüsse mit zwei Zahlen,
// kleiner Startbereich.
const CANDIDATES = 6;
export function generateLevel(level) {
  const P = levelParams(level);
  const rnd = mulberry32((level * 2654435761 + 12345) >>> 0);
  let best = null;
  for (let k = 0; k < CANDIDATES; k++) {
    const L = generateOne(P, rnd);
    L.level = level;
    if (!best || L.score > best.score) best = L;
  }
  return best;
}

function generateOne({ W, H, mines: M }, rnd) {
  const g = makeGrid(W, H);
  const { N, nb } = g;
  for (let attempt = 0; attempt < 200; attempt++) {
    // Startfeld nicht am Rand; es und seine Nachbarn bleiben frei
    const sr = 2 + Math.floor(rnd() * (H - 4)), sc = 2 + Math.floor(rnd() * (W - 4));
    const start = sr * W + sc;
    const prot = new Uint8Array(N);
    prot[start] = 1;
    for (const j of nb[start]) prot[j] = 1;
    const mines = new Uint8Array(N);
    const free = [];
    for (let i = 0; i < N; i++) if (!prot[i]) free.push(i);
    for (let k = 0; k < M; k++) {
      const x = k + Math.floor(rnd() * (free.length - k));
      [free[k], free[x]] = [free[x], free[k]];
      mines[free[k]] = 1;
    }
    for (let rep = 0; rep < N; rep++) {
      const num = countNumbers(g, mines);
      const known = new Int8Array(N).fill(-1);
      known[start] = 0;
      const res = logicSolve(g, num, known, M);
      if (res.solved) {
        // Größe des Startbereichs (aufgedeckte Nullen samt Rand)
        const open = new Int8Array(N).fill(-1);
        open[start] = 0;
        const opened = logicSolve(g, num, open, M, { maxSteps: 0 }).deduced;
        const score = res.pairUses * 3 - opened / 4;
        return { W, H, mines, num, start, total: M, repairs: rep, attempts: attempt, pairUses: res.pairUses, opened, score };
      }
      // Reparatur: eine Falle am Rand des gelösten Bereichs in unberührtes Gebiet verlegen
      const K = res.K;
      const edge = [], deep = [];
      for (let i = 0; i < N; i++) {
        if (K[i] !== -1) continue;
        let near = false;
        for (const j of nb[i]) if (K[j] === 0) { near = true; break; }
        if (near) { if (mines[i]) edge.push(i); }
        else if (!mines[i] && !prot[i]) {
          let far = true;
          for (const j of nb[i]) if (K[j] !== -1) { far = false; break; }
          if (far) deep.push(i);
        }
      }
      if (!edge.length || !deep.length) break;
      const x = edge[Math.floor(rnd() * edge.length)], y = deep[Math.floor(rnd() * deep.length)];
      mines[x] = 0;
      mines[y] = 1;
    }
  }
  throw new Error('Fallenfeld: kein Level erzeugt');
}
