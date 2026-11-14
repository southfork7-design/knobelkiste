// Hintergrundprozess für Schraubwerk: Level erzeugen, Tipp suchen.
import { generateLevel } from './generator.js';
import { solve } from './model.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    let result;
    if (type === 'level') result = generateLevel(...args);
    else {
      const [level, state] = args;
      const r = solve(level, state, 15000);
      result = r && r.path ? { move: r.path[0] ?? null } : { move: null, unsolvable: !!r };
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
