// Hintergrundprozess: erzeugt Gleisbau-Rätsel, ohne die Bedienung zu blockieren.
import { generateLevel, generateRoutePanel } from './generator.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    const result = type === 'level' ? generateLevel(...args) : generateRoutePanel(...args);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
