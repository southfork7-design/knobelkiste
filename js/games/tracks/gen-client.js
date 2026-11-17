// Holt Rätsel aus dem Hintergrundprozess (mit Zwischenspeicher, damit
// vorab angeforderte Rätsel sofort bereitstehen). Fertige Rätsel werden
// zusätzlich im Browser abgelegt, damit das nächste Level auch nach einem
// Neustart der App sofort da ist (große Felder brauchen auf dem Handy einige Sekunden).
// Absicherung: stürzt der Hintergrundprozess ab oder antwortet er nicht
// (z. B. weil das Handy ihn beendet hat), wird das Rätsel direkt erzeugt –
// es bleibt also nie bei „Rätsel wird gebaut“ hängen.
import { generateLevel, generateRoutePanel, VERSION } from './generator.js';

const STORE = 'knobelkiste-tracks-cache';
const CACHE_V = VERSION + '.4'; // bei geänderter Rätselauswahl hochzählen
const KEEP = 8; // so viele Rätsel bleiben gespeichert
const TIMEOUT = 40000; // ms, danach gilt der Hintergrundprozess als hängend

let worker = null, nextId = 1, workerOk = true;
const waiting = new Map(); // id → { resolve, type, args, timer }
const cache = new Map();

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return s.v === CACHE_V && s.items ? s : { v: CACHE_V, items: {} };
  } catch { return { v: CACHE_V, items: {} }; }
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

const direct = (type, args) => (type === 'level' ? generateLevel(...args) : generateRoutePanel(...args));
const later = (type, args) => new Promise((resolve) => setTimeout(() => resolve(direct(type, args)), 30));

// Hintergrundprozess aufgeben: alle offenen Aufträge direkt erledigen
function dropWorker() {
  if (worker) { try { worker.terminate(); } catch {} }
  worker = null; workerOk = false;
  const jobs = [...waiting.values()];
  waiting.clear();
  for (const j of jobs) { clearTimeout(j.timer); later(j.type, j.args).then(j.resolve); }
}

function getWorker() {
  if (!workerOk) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const j = waiting.get(e.data.id);
        if (!j) return;
        waiting.delete(e.data.id);
        clearTimeout(j.timer);
        if (e.data.error) later(j.type, j.args).then(j.resolve);
        else j.resolve(e.data.result);
      };
      worker.onerror = dropWorker;
      worker.onmessageerror = dropWorker;
    } catch { worker = null; workerOk = false; }
  }
  return worker;
}

function request(key, type, args) {
  if (cache.has(key)) return cache.get(key);
  const stored = loadStore().items[key];
  if (stored) { const p = Promise.resolve(stored); cache.set(key, p); return p; }
  const w = getWorker();
  const p = w
    ? new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, { resolve, type, args, timer: setTimeout(dropWorker, TIMEOUT) });
        w.postMessage({ id, type, args });
      })
    : later(type, args);
  cache.set(key, p);
  p.then((r) => remember(key, r), () => cache.delete(key));
  return p;
}

export const getLevel = (level) => request(`L${level}`, 'level', [level]);
export const getRoutePanel = (route, k, entry) => request(`R${route}:${k}:${entry ? entry.side + '-' + entry.pos : ''}`, 'panel', [route, k, entry]);
