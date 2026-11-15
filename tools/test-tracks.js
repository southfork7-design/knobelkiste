// Prüft Gleisbau-Level: der logische Löser (ohne Raten) löst jedes Level ganz
// und kommt auf die hinterlegte Lösung. Bei kleinen Feldern bestätigt zusätzlich
// eine vollständige Suche, dass es genau eine Lösung gibt (Gegenprobe für den Löser).
// Aufruf: node tools/test-tracks.js [bisLevel]
import { generateLevel, logicSolve, bit, DR, DC, opp } from '../js/games/tracks/generator.js';

// Vollständige Suche: zählt Lösungen (bis `limit`)
export function bruteCount(L, limit = 2) {
  const { W, H, rowC, colC, start, startOut, end, endOut, given } = L;
  const blocked = L.blocked || [];
  const total = rowC.reduce((a, b) => a + b, 0);
  const rowU = new Array(H).fill(0), colU = new Array(W).fill(0);
  const visited = new Uint8Array(W * H);
  const givenCount = given.filter((g) => g > 0).length;
  const er = Math.floor(end / W), ec = end % W;
  let found = 0, givenSeen = 0, nodes = 0;
  const visit = (i, on) => {
    const d = on ? 1 : -1;
    visited[i] = on ? 1 : 0; rowU[Math.floor(i / W)] += d; colU[i % W] += d;
    if (given[i] > 0) givenSeen += d;
  };
  function dfs(i, inSide, len) {
    if (found >= limit || ++nodes > 5e7) return;
    const r = Math.floor(i / W), c = i % W;
    for (let out = 0; out < 4; out++) {
      if (out === inSide || (i === end && out !== endOut)) continue;
      const m = bit(inSide) | bit(out);
      if (given[i] >= 0 && given[i] !== m) continue;
      if (i === end) {
        if (len === total && givenSeen === givenCount && rowU.every((u, k) => u === rowC[k]) && colU.every((u, k) => u === colC[k])) found++;
        continue;
      }
      const nr = r + DR[out], nc = c + DC[out];
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      const j = nr * W + nc;
      if (visited[j] || blocked[j] || rowU[nr] >= rowC[nr] || colU[nc] >= colC[nc]) continue;
      if (given[j] >= 0 && !(given[j] & bit(opp(out)))) continue;
      const remaining = total - (len + 1), dist = Math.abs(nr - er) + Math.abs(nc - ec);
      if (dist > remaining || (remaining - dist) % 2) continue;
      visit(j, true); dfs(j, opp(out), len + 1); visit(j, false);
      if (found >= limit) return;
    }
  }
  visit(start, true);
  dfs(start, startOut, 1);
  return nodes > 5e7 ? -1 : found;
}

// Kantenstand des Lösers → Masken
function masks(L, res) {
  const { W, H } = L, HO = H * (W + 1);
  return Array.from({ length: W * H }, (_, i) => {
    const r = Math.floor(i / W), c = i % W;
    const e = [HO + r * W + c, r * (W + 1) + c + 1, HO + (r + 1) * W + c, r * (W + 1) + c];
    return e.reduce((m, x, d) => m | (res.es[x] === 1 ? bit(d) : 0), 0);
  });
}

if (process.argv[1] && process.argv[1].endsWith('test-tracks.js')) {
  let bad = 0;
  const t0 = Date.now();
  const upTo = Number(process.argv[2] || 60);
  for (let lvl = 1; lvl <= upTo; lvl++) {
    const t = Date.now();
    const L = generateLevel(lvl);
    const ms = Date.now() - t;
    const res = logicSolve(L);
    let ok = res.solved && masks(L, res).every((m, i) => m === L.solution[i]);
    let brute = '';
    if (L.W * L.H <= 64) {
      const n = bruteCount(L);
      brute = `, Suche: ${n} Lösung${n === 1 ? '' : 'en'}`;
      if (n !== 1) ok = false;
    }
    if (!ok) bad++;
    const track = L.solution.filter((m) => m).length;
    const givens = L.given.filter((g) => g >= 0).length;
    const rocks = L.blocked.filter((b) => b).length;
    console.log(`Level ${lvl}: ${L.W}x${L.H}, Gleise ${track}, Vorgaben ${givens}, Felsen ${rocks}, Ketten ${res.chains}, ${ms}ms${brute}${ok ? '' : '  FEHLER'}`);
  }
  console.log(`Fehlerhafte Level 1–${upTo}: ${bad}   (gesamt ${Date.now() - t0}ms)`);
  process.exit(bad ? 1 : 0);
}
