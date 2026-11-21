// Farbschloss: Level-Erzeugung, Bewertung und Kandidatensuche.
// Regel: Ein versteckter Code aus P Farben (4 oder 6 Stellen) soll erraten werden.
// Nach jedem Versuch zeigt die Antwort, wie viele Stellen Farbe und Platz treffen (voll)
// und wie viele Farben zusätzlich vorkommen, aber woanders stehen (Ring).
//
// Lösbarkeit: Die Zeilenzahl jeder Stufe ist so bemessen, dass schon die einfache Strategie
// „immer einen Versuch setzen, der zu allen bisherigen Antworten passt“ jeden Code schafft
// (geprüft mit `node tools/test-codes.js`). Diese Strategie nutzt auch der Tipp.
import { mulberry32 } from '../../rng.js';

export const VERSION = 1;

// Stufen je Spielart; rep = Farben dürfen mehrfach vorkommen
const STAGES = {
  4: [
    { upTo: 4, K: 6, rep: false, rows: 10 },
    { upTo: 12, K: 6, rep: true, rows: 10 },
    { upTo: 24, K: 8, rep: false, rows: 10 },
    { upTo: Infinity, K: 8, rep: true, rows: 10 },
  ],
  6: [
    { upTo: 4, K: 6, rep: false, rows: 12 },
    { upTo: 12, K: 8, rep: false, rows: 12 },
    { upTo: Infinity, K: 8, rep: true, rows: 12 },
  ],
};

export function levelParams(level, P) {
  const st = STAGES[P].find((s) => level <= s.upTo);
  return { P, K: st.K, rep: st.rep, rows: st.rows };
}

// Antwort auf einen Versuch: [Treffer am Platz, Farbe stimmt woanders]
export function score(code, guess, K) {
  let hit = 0;
  const a = new Uint8Array(K), b = new Uint8Array(K);
  for (let i = 0; i < code.length; i++) {
    if (code[i] === guess[i]) hit++;
    else { a[code[i]]++; b[guess[i]]++; }
  }
  let near = 0;
  for (let k = 0; k < K; k++) near += Math.min(a[k], b[k]);
  return [hit, near];
}

// Alle möglichen Codes einer Stufe als flache Liste (je P Einträge)
const codeCache = new Map();
export function allCodes({ P, K, rep }) {
  const key = `${P}/${K}/${rep}`;
  if (codeCache.has(key)) return codeCache.get(key);
  const out = [];
  const cur = new Array(P);
  const used = new Uint8Array(K);
  (function rec(i) {
    if (i === P) { out.push(...cur); return; }
    for (let k = 0; k < K; k++) {
      if (!rep && used[k]) continue;
      cur[i] = k; used[k]++;
      rec(i + 1);
      used[k]--;
    }
  })(0);
  const res = { P, n: out.length / P, data: Uint8Array.from(out) };
  codeCache.set(key, res);
  return res;
}

// Indizes aller Codes, die zu allen bisherigen Antworten passen
// history: [{ guess: [..], fb: [hit, near] }]
export function candidates(params, history) {
  const { P, n, data } = allCodes(params);
  const { K } = params;
  const out = [];
  const code = new Array(P);
  const a = new Uint8Array(K), b = new Uint8Array(K);
  outer: for (let c = 0; c < n; c++) {
    for (let i = 0; i < P; i++) code[i] = data[c * P + i];
    for (const h of history) {
      let hit = 0;
      a.fill(0); b.fill(0);
      for (let i = 0; i < P; i++) {
        if (code[i] === h.guess[i]) hit++;
        else { a[code[i]]++; b[h.guess[i]]++; }
      }
      if (hit !== h.fb[0]) continue outer;
      let near = 0;
      for (let k = 0; k < K; k++) near += Math.min(a[k], b[k]);
      if (near !== h.fb[1]) continue outer;
    }
    out.push(c);
  }
  return out;
}

export function codeAt(params, idx) {
  const { P, data } = allCodes(params);
  return Array.from(data.subarray(idx * P, idx * P + P));
}

// Code eines Levels; attempt > 0 nach „Neu“ oder einem verlorenen Versuch (anderer Code)
export function generateLevel(level, P, attempt = 0) {
  const params = levelParams(level, P);
  const rnd = mulberry32((level * 7919 + P * 104729 + attempt * 15485863 + VERSION) >>> 0);
  rnd(); rnd();
  const code = [];
  const pool = Array.from({ length: params.K }, (_, k) => k);
  for (let i = 0; i < P; i++) {
    const j = Math.floor(rnd() * pool.length);
    code.push(pool[j]);
    if (!params.rep) pool.splice(j, 1);
  }
  return { ...params, code };
}
