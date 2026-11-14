// Holt Schraubwerk-Level und Tipps aus dem Hintergrundprozess.
import { generateLevel } from './generator.js';
import { solve } from './model.js';

let worker = null, nextId = 1;
const waiting = new Map();
const cache = new Map();

function getWorker() {
  if (worker === null) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const w = waiting.get(e.data.id);
        if (!w) return;
        waiting.delete(e.data.id);
        e.data.error ? w.reject(new Error(e.data.error)) : w.resolve(e.data.result);
      };
      worker.onerror = () => { worker = false; };
    } catch { worker = false; }
  }
  return worker || null;
}

function call(type, args, fallback) {
  const w = getWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(fallback()), 30));
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    w.postMessage({ id, type, args });
  });
}

export function getLevel(level) {
  const key = `L${level}`;
  if (!cache.has(key)) {
    const p = call('level', [level], () => generateLevel(level));
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return cache.get(key);
}

export function getHint(level, state) {
  return call('hint', [level, state], () => {
    const r = solve(level, state, 15000);
    return r && r.path ? { move: r.path[0] ?? null } : { move: null, unsolvable: !!r };
  });
}
