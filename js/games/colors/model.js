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
    const i = stack.pop(), r = Math.floor(i / cols), c = i % cols;
    for (const j of [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1]) {
      if (j < 0) continue;
      ok[j] = 1;
      if (s.board[j] === -1 && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
  }
  return ok; // ok[i] = 1: Figur auf i ist erreichbar (falls vorhanden)
}

export const openContainers = (L, s) =>
  L.stacks.map((st, k) => (s.stackPos[k] < st.length ? st[s.stackPos[k]] : null));

// Wohin ginge eine Figur der Farbe c? → { stack: k } | { buffer: true } | null
export function destination(L, s, c) {
  const open = openContainers(L, s);
  const k = open.findIndex((col, i) => col === c && s.fill[i] < CAP);
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

// Führt einen Zug aus. Liefert neuen Zustand und Ereignisliste (für Animationen).
export function applyMove(L, s, i) {
  const t = {
    board: Int8Array.from(s.board), gateIdx: s.gateIdx.slice(),
    stackPos: s.stackPos.slice(), fill: s.fill.slice(), buffer: s.buffer.slice(),
  };
  const events = [];
  const c = t.board[i];
  t.board[i] = -1;
  const dest = destination(L, s, c);
  if (dest.stack !== undefined) { t.fill[dest.stack]++; events.push({ type: 'toContainer', from: i, stack: dest.stack, slot: t.fill[dest.stack] - 1, color: c }); }
  else { t.buffer.push(c); events.push({ type: 'toBuffer', from: i, slot: t.buffer.length - 1, color: c }); }
  // volle Behälter abräumen, Ablage nachziehen (kann sich wiederholen)
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < L.stacks.length; k++) {
      if (t.stackPos[k] < L.stacks[k].length && t.fill[k] === CAP) {
        events.push({ type: 'containerDone', stack: k, color: L.stacks[k][t.stackPos[k]] });
        t.stackPos[k]++; t.fill[k] = 0; changed = true;
      }
    }
    const open = openContainers(L, t);
    for (let k = 0; k < open.length; k++) {
      if (open[k] === null) continue;
      for (let b = 0; b < t.buffer.length && t.fill[k] < CAP; b++) {
        if (t.buffer[b] === open[k]) {
          events.push({ type: 'bufferToContainer', slot: b, stack: k, toSlot: t.fill[k], color: open[k] });
          t.buffer.splice(b, 1); b--; t.fill[k]++; changed = true;
        }
      }
    }
  }
  // Tore nachfüllen
  L.gates.forEach((g, k) => {
    if (t.board[g.cell] === -1 && t.gateIdx[k] < g.queue.length) {
      t.board[g.cell] = g.queue[t.gateIdx[k]++];
      events.push({ type: 'gateIn', gate: k, cell: g.cell, color: t.board[g.cell] });
    }
  });
  return { state: t, events };
}

export const isWon = (L, s) => s.stackPos.every((p, k) => p >= L.stacks[k].length);

export const stateKey = (s) =>
  Array.from(s.board).join(',') + '|' + s.gateIdx.join(',') + '|' + s.stackPos.join(',') + '|' +
  s.fill.join(',') + '|' + s.buffer.slice().sort((a, b) => a - b).join(',');

// Gezielte Suche: weniger Figuren und volle Ablage vermeiden.
export function solve(L, start, maxNodes = 20000) {
  const score = (s) => {
    let left = 0;
    for (const v of s.board) if (v >= 0) left++;
    L.gates.forEach((g, k) => { left += g.queue.length - s.gateIdx[k]; });
    return left * 4 + s.buffer.length * 3;
  };
  const startKey = stateKey(start);
  const seen = new Map([[startKey, null]]);
  const heap = [];
  let counter = 0;
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
  push({ s: start, key: startKey, f: score(start), n: counter++ });
  let nodes = 0;
  while (heap.length) {
    const { s, key } = pop();
    for (const m of legalMoves(L, s)) {
      const { state: t } = applyMove(L, s, m);
      const k = stateKey(t);
      if (seen.has(k)) continue;
      seen.set(k, { prev: key, move: m });
      if (isWon(L, t)) {
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
