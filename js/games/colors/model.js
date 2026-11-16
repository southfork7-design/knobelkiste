// Farbräumer – Spielregeln und Löser (ohne Darstellung).
//
// Brett: cols×rows Felder, jedes leer (-1) oder mit einer Figur (Farbnummer).
// Eine Figur ist erreichbar, wenn sie in der obersten Reihe steht oder an ein
// leeres Feld grenzt, von dem aus ein freier Weg nach oben führt.
// Behälter: mehrere Stapel; nur der vorderste Behälter eines Stapels ist offen
// und nimmt CAP Figuren seiner Farbe auf. Voll → verschwindet, der nächste rückt nach.
// Ablage: begrenzte Plätze für Figuren ohne offenen Behälter; Figuren wandern
// von selbst in einen passenden Behälter, sobald einer öffnet.
// Tore: Randfelder mit einer Warteschlange; ist das Torfeld leer, rückt die
// nächste Figur nach.

export const CAP = 3;

// state = { board: Int8Array, gateIdx: [n], stackPos: [n], fill: [n], buffer: [color…] }
export function initialState(L) {
  return {
    board: Int8Array.from(L.board),
    gateIdx: L.gates.map(() => 0),
    stackPos: L.stacks.map(() => 0),
    fill: L.stacks.map(() => 0),
    buffer: [],
  };
}

export const cloneState = (s) => ({
  board: Int8Array.from(s.board), gateIdx: s.gateIdx.slice(),
  stackPos: s.stackPos.slice(), fill: s.fill.slice(), buffer: s.buffer.slice(),
});

export function reachable(L, s) {
  const { cols, rows } = L;
  const ok = new Uint8Array(cols * rows);
  const seen = new Uint8Array(cols * rows);
  const stack = [];
  for (let c = 0; c < cols; c++) {
    ok[c] = 1;
    if (s.board[c] === -1) { seen[c] = 1; stack.push(c); }
  }
  while (stack.length) {
    const i = stack.pop(), r = (i / cols) | 0, c = i % cols;
    const nb = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1];
    for (const j of nb) {
      if (j < 0) continue;
      ok[j] = 1;
      if (s.board[j] === -1 && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  return ok; // ok[i] = 1: Figur auf i ist erreichbar (falls vorhanden)
}

export const openContainers = (L, s) =>
  L.stacks.map((st, k) => (s.stackPos[k] < st.length ? st[s.stackPos[k]] : null));

// offener Behälter mit Platz für Farbe c (der vollste, bei Gleichstand der linke) oder -1
export function directStack(L, s, c) {
  let best = -1;
  for (let k = 0; k < L.stacks.length; k++) {
    if (s.stackPos[k] < L.stacks[k].length && L.stacks[k][s.stackPos[k]] === c && s.fill[k] < CAP &&
      (best < 0 || s.fill[k] > s.fill[best])) best = k;
  }
  return best;
}

// Wohin ginge eine Figur der Farbe c? → { stack: k } | { buffer: true } | null
export function destination(L, s, c) {
  const k = directStack(L, s, c);
  if (k >= 0) return { stack: k };
  if (s.buffer.length < L.bufferSize) return { buffer: true };
  return null;
}

export function legalMoves(L, s) {
  const ok = reachable(L, s);
  const moves = [];
  for (let i = 0; i < s.board.length; i++) {
    if (s.board[i] >= 0 && ok[i] && destination(L, s, s.board[i])) moves.push(i);
  }
  return moves;
}

// Legt eine Figur der Farbe c ab (Behälter oder Ablage) und räumt volle Behälter ab;
// verändert t. Wird auch vom Generator benutzt, damit beide dieselben Regeln haben.
export function place(L, t, c, events, from = -1) {
  const k0 = directStack(L, t, c);
  if (k0 >= 0) { t.fill[k0]++; events && events.push({ type: 'toContainer', from, stack: k0, slot: t.fill[k0] - 1, color: c }); }
  else { t.buffer.push(c); events && events.push({ type: 'toBuffer', from, slot: t.buffer.length - 1, color: c }); }
  // volle Behälter abräumen, Ablage nachziehen (kann sich wiederholen)
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < L.stacks.length; k++) {
      if (t.stackPos[k] < L.stacks[k].length && t.fill[k] === CAP) {
        events && events.push({ type: 'containerDone', stack: k, color: L.stacks[k][t.stackPos[k]] });
        t.stackPos[k]++; t.fill[k] = 0; changed = true;
      }
    }
    for (let k = 0; k < L.stacks.length; k++) {
      if (t.stackPos[k] >= L.stacks[k].length) continue;
      const col = L.stacks[k][t.stackPos[k]];
      for (let b = 0; b < t.buffer.length && t.fill[k] < CAP; b++) {
        if (t.buffer[b] === col) {
          events && events.push({ type: 'bufferToContainer', slot: b, stack: k, toSlot: t.fill[k], color: col });
          t.buffer.splice(b, 1); b--; t.fill[k]++; changed = true;
        }
      }
    }
  }
}

// Zug auf t ausführen (verändert t)
function moveInPlace(L, t, i, events) {
  const c = t.board[i];
  t.board[i] = -1;
  place(L, t, c, events, i);
  // Tore nachfüllen
  for (let k = 0; k < L.gates.length; k++) {
    const g = L.gates[k];
    if (t.board[g.cell] === -1 && t.gateIdx[k] < g.queue.length) {
      t.board[g.cell] = g.queue[t.gateIdx[k]++];
      events && events.push({ type: 'gateIn', gate: k, cell: g.cell, color: t.board[g.cell] });
    }
  }
}

// Führt einen Zug aus. Liefert neuen Zustand und Ereignisliste (für Animationen).
export function applyMove(L, s, i) {
  const t = cloneState(s);
  const events = [];
  moveInPlace(L, t, i, events);
  return { state: t, events };
}

export const isWon = (L, s) => s.stackPos.every((p, k) => p >= L.stacks[k].length);

export const stateKey = (s) =>
  Array.from(s.board).join(',') + '|' + s.gateIdx.join(',') + '|' + s.stackPos.join(',') + '|' +
  s.fill.join(',') + '|' + s.buffer.slice().sort((a, b) => a - b).join(',');

export function figuresLeft(L, s) {
  let n = s.buffer.length;
  for (const v of s.board) if (v >= 0) n++;
  L.gates.forEach((g, k) => { n += g.queue.length - s.gateIdx[k]; });
  return n;
}

// Alle Züge direkt in einen offenen Behälter ausführen, bis keiner mehr geht.
// Das ist fast immer richtig (die Figur muss ohnehin in einen Behälter ihrer Farbe),
// aber nicht immer: Öffnet dadurch früher ein zweiter Behälter derselben Farbe,
// können Figuren dorthin statt in den anderen gehen. Der Löser versucht es deshalb
// zuerst mit dieser Abkürzung und sonst ohne.
export function closure(L, s) {
  const t = cloneState(s);
  const moves = [];
  for (;;) {
    const ok = reachable(L, t);
    let any = false;
    for (let i = 0; i < t.board.length; i++) {
      // ok bleibt gültig: Wegnehmen macht nur mehr erreichbar
      if (t.board[i] >= 0 && ok[i] && directStack(L, t, t.board[i]) >= 0) {
        moveInPlace(L, t, i, null); moves.push(i); any = true;
      }
    }
    if (!any) return { state: t, moves };
  }
}

// Löser: Bestensuche (wenig Figuren, leere Ablage zuerst). Mit fast=true werden direkte
// Züge immer sofort ausgeführt und nur Ablage-Züge verzweigt (schnell, findet aber selten
// nichts); sonst wird über alle Züge verzweigt. Ergebnis:
// { path, branch } – path: alle Züge; branch: Index des ersten Ablage-Zugs (oder path.length)
// | { path: null } (unlösbar) | null (Suchgrenze erreicht).
export function solve(L, start, maxNodes = 4000, fast = true) {
  const close = fast ? (s) => closure(L, s) : (s) => ({ state: s, moves: [] });
  const score = (s) => figuresLeft(L, s) * 2 + s.buffer.length * 5;
  const c0 = close(start);
  const root = { s: c0.state, seg: c0.moves, parent: null };
  const pathOf = (n) => { const parts = []; for (let x = n; x; x = x.parent) parts.unshift(x.seg); return parts.flat(); };
  const result = (n) => {
    const path = pathOf(n);
    let s = start, b = 0;
    while (b < path.length && directStack(L, s, s.board[path[b]]) >= 0) s = applyMove(L, s, path[b++]).state;
    return { path, branch: b };
  };
  if (isWon(L, root.s)) return result(root);
  const seen = new Set([stateKey(root.s)]);
  const heap = [];
  let counter = 0, nodes = 0;
  const less = (a, b) => a.f < b.f || (a.f === b.f && a.n < b.n);
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (less(heap[p], heap[i])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  push({ node: root, f: 0, n: counter++ });
  while (heap.length) {
    const { node } = pop();
    const s = node.s;
    for (const i of legalMoves(L, s)) {
      const t = cloneState(s);
      moveInPlace(L, t, i, null);
      const c = close(t);
      const child = { s: c.state, seg: [i, ...c.moves], parent: node };
      if (isWon(L, c.state)) return result(child);
      const k = stateKey(c.state);
      if (seen.has(k)) continue;
      seen.add(k);
      if (++nodes > maxNodes) return null;
      push({ node: child, f: score(c.state), n: counter++ });
    }
  }
  return { path: null };
}

// Zufällige Probespiele: meist direkte Züge zuerst, sonst eine zufällige Figur auf die Ablage.
function playouts(L, start, runs, rnd = Math.random) {
  for (let k = 0; k < runs; k++) {
    let s = start;
    const path = [];
    while (!isWon(L, s)) {
      const m = legalMoves(L, s);
      if (!m.length) break;
      const direct = m.filter((i) => directStack(L, s, s.board[i]) >= 0);
      const pool = direct.length && rnd() < 0.93 ? direct : m;
      const i = pool[Math.floor(rnd() * pool.length)];
      path.push(i);
      s = applyMove(L, s, i).state;
    }
    if (isWon(L, s)) {
      let t = start, b = 0;
      while (b < path.length && directStack(L, t, t.board[path[b]]) >= 0) t = applyMove(L, t, path[b++]).state;
      return { path, branch: b };
    }
  }
  return null;
}

// Tipp: erst schnell, dann gründlich suchen, zuletzt Probespiele
export function solveForHint(L, s) {
  const r = solve(L, s, 6000, true);
  if (r && r.path) return r;
  return solve(L, s, 8000, false) || playouts(L, s, 300) || r;
}
