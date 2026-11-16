// Hintergrundprozess für Schraubwerk: Level erzeugen, Tipp suchen.
import { generateLevel } from './generator.js';
import { hintMove } from './gen-client.js';

self.onmessage = (e) => {
  const { id, type, args } = e.data;
  try {
    const result = type === 'level' ? generateLevel(...args) : hintMove(...args);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
