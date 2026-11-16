// Hintergrundprozess für Farbräumer: Tipp suchen (große Bretter brauchen bis ~1 s).
import { solveForHint } from './model.js';

self.onmessage = (e) => {
  const { id, L, state } = e.data;
  try {
    const r = solveForHint(L, state);
    self.postMessage({ id, result: r && r.path ? { path: r.path, branch: r.branch } : null });
  } catch (err) {
    self.postMessage({ id, result: null, error: String(err) });
  }
};
