// Offline-Cache. Bei jeder Änderung an der App VERSION hochzählen.
const VERSION = 'knobelkiste-v24';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/app.js', './js/rng.js',
  './js/ui/shell.js', './js/ui/sound.js',
  './js/games/tracks/game.js', './js/games/tracks/generator.js',
  './js/games/tracks/draw.js', './js/games/tracks/gen-client.js', './js/games/tracks/worker.js',
  './js/games/nonogram/game.js', './js/games/nonogram/generator.js', './js/games/nonogram/motifs.js', './js/games/nonogram/color.js',
  './js/games/screws/game.js', './js/games/screws/model.js', './js/games/screws/generator.js',
  './js/games/screws/gen-client.js', './js/games/screws/worker.js',
  './js/games/colors/game.js', './js/games/colors/model.js', './js/games/colors/generator.js',
  './js/games/crowns/game.js', './js/games/crowns/generator.js', './js/games/crowns/bank.js',
  './js/games/arrows/game.js', './js/games/arrows/generator.js', './js/games/arrows/shapes.js',
  './js/games/arrows3d/game.js', './js/games/arrows3d/generator.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
// Erst Netz (damit Updates ankommen), sonst Cache (offline).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // cache: 'no-cache' → immer beim Server nachfragen, ob es eine neue Version gibt
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
