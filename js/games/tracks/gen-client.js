// Holt Rätsel aus dem Hintergrundprozess (mit Zwischenspeicher, damit
// vorab angeforderte Rätsel sofort bereitstehen).
import { generateLevel, generateRoutePanel } from './generator.js';

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

function request(key, type, args) {
  if (cache.has(key)) return cache.get(key);
  const w = getWorker();
  const p = w
    ? new Promise((resolve, reject) => { const id = nextId++; waiting.set(id, { resolve, reject }); w.postMessage({ id, type, args }); })
    : new Promise((resolve) => setTimeout(() => resolve(type === 'level' ? generateLevel(...args) : generateRoutePanel(...args)), 30));
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export const getLevel = (level) => request(`L${level}`, 'level', [level]);
export const getRoutePanel = (route, k, entry) => request(`R${route}:${k}`, 'panel', [route, k, entry]);
