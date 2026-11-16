// Holt Schraubwerk-Level und Tipps aus dem Hintergrundprozess. Fertige Level
// werden zusätzlich im Browser abgelegt, damit das nächste Level auch nach
// einem Neustart sofort da ist (große Bretter brauchen auf dem Handy einige Sekunden).
import { generateLevel, VERSION } from './generator.js';
import { solve } from './model.js';

const STORE = 'knobelkiste-screws-cache';
const KEEP = 4;

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
    const stored = loadStore().items[key];
    const p = stored ? Promise.resolve(stored) : call('level', [level], () => generateLevel(level));
    cache.set(key, p);
    p.then((r) => { if (!stored) remember(key, r); }, () => cache.delete(key));
  }
  return cache.get(key);
}

export function hintMove(level, state) {
  const r = solve(level, state, 2500);
  return r ? { move: r.path[0] ?? null } : { move: null };
}
export const getHint = (level, state) => call('hint', [level, state], () => hintMove(level, state));
