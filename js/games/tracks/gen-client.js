// Holt Rätsel aus dem Hintergrundprozess (mit Zwischenspeicher, damit
// vorab angeforderte Rätsel sofort bereitstehen). Fertige Rätsel werden
// zusätzlich im Browser abgelegt, damit das nächste Level auch nach einem
// Neustart der App sofort da ist (große Felder brauchen auf dem Handy einige Sekunden).
import { generateLevel, generateRoutePanel, VERSION } from './generator.js';

const STORE = 'knobelkiste-tracks-cache';
const KEEP = 8; // so viele Rätsel bleiben gespeichert

let worker = null, nextId = 1;
const waiting = new Map();
const cache = new Map();

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return s.v === VERSION && s.items ? s : { v: VERSION, items: {} };
  } catch { return { v: VERSION, items: {} }; }
}
function remember(key, result) {
  try {
    const s = loadStore();
    s.items[key] = result;
    const keys = Object.keys(s.items);
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete s.items[k];
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {}
}

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
  const stored = loadStore().items[key];
  if (stored) { const p = Promise.resolve(stored); cache.set(key, p); return p; }
  const w = getWorker();
  const p = w
    ? new Promise((resolve, reject) => { const id = nextId++; waiting.set(id, { resolve, reject }); w.postMessage({ id, type, args }); })
    : new Promise((resolve) => setTimeout(() => resolve(type === 'level' ? generateLevel(...args) : generateRoutePanel(...args)), 30));
  cache.set(key, p);
  p.then((r) => remember(key, r), () => cache.delete(key));
  return p;
}

export const getLevel = (level) => request(`L${level}`, 'level', [level]);
export const getRoutePanel = (route, k, entry) => request(`R${route}:${k}:${entry ? entry.side + '-' + entry.pos : ''}`, 'panel', [route, k, entry]);
