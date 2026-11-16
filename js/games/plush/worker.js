// Hintergrundprozess für Kuschelfracht: Tipp suchen (Probespiele bis zu ~3 s).
import { solve, unpackState } from './model.js';

self.onmessage = (e) => {
  const { id, L, state } = e.data;
  try {
    const r = solve(L, unpackState(state), { ms: 3000, seed: id * 7 + 1 });
    self.postMessage({ id, result: r && r.length ? r[0] : null });
  } catch (err) {
    self.postMessage({ id, result: null, error: String(err) });
  }
};
