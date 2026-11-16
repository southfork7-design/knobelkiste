// Knobelkiste – App-Rahmen: Menü, Spielstand, Navigation.
import { mountArrows } from './games/arrows/game.js';
import { mountArrows3d } from './games/arrows3d/game.js';
import { mountCrowns } from './games/crowns/game.js';
import { mountTracks, mountTrackRoute } from './games/tracks/game.js';
import { mountNonogram, mountNonogramColor } from './games/nonogram/game.js';
import { mountScrews } from './games/screws/game.js';
import { mountColors } from './games/colors/game.js';
import { mountTraps } from './games/traps/game.js';
import { routeParams } from './games/tracks/generator.js';
import { sound } from './ui/sound.js';

const STORE_KEY = 'knobelkiste.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
const state = load();
for (const id of ['arrows', 'arrows3d', 'crowns', 'tracks', 'nonogram', 'nonogramColor', 'screws', 'colors', 'traps']) state[id] = state[id] || { level: 1, solved: 0 };
state.tracksRoute = state.tracksRoute || { route: 1, done: 0, panels: [] };

const GAMES = [
  { id: 'arrows', name: 'Pfeilwerk', desc: 'Pfeile in der richtigen Reihenfolge herausschieben', icon: '➚', ready: true },
  { id: 'arrows3d', name: 'Pfeilwürfel', desc: 'Pfeile auf Würfeln und Quadern – zum Drehen', icon: '⬢', ready: true },
  {
    id: 'tracks', name: 'Gleisbau', desc: 'Strecke nach Zahlen am Rand legen', icon: '╬', ready: true,
    meta: () => `Level ${state.tracks.level}`,
    modes: [
      { id: 'tracks', name: 'Einzelfeld', desc: 'Felder von 8×8 bis 18×24', meta: () => `Level ${state.tracks.level}` },
      {
        id: 'tracksRoute', name: 'Großstrecke',
        desc: '2, 4 oder 6 Felder nacheinander lösen – am Ende entsteht eine große Karte',
        meta: () => {
          const R = routeParams(state.tracksRoute.route);
          return `Strecke ${state.tracksRoute.route} · ${state.tracksRoute.done}/${R.count}`;
        },
      },
    ],
  },
  { id: 'crowns', name: 'Kronenfeld', desc: 'Eine Krone pro Zeile, Spalte und Region', icon: '♛', ready: true },
  { id: 'nonogram', name: 'Bilderrätsel', desc: 'Zahlen am Rand ergeben ein Bild', icon: '▦', ready: true },
  { id: 'nonogramColor', name: 'Farbbilder', desc: 'Farbige Zahlen am Rand ergeben ein buntes Muster', icon: '▩', ready: true },
  { id: 'screws', name: 'Schraubwerk', desc: 'Schrauben lösen, Teile fallen lassen', icon: '⚙', ready: true },
  { id: 'colors', name: 'Farbräumer', desc: 'Figuren nach Farben vom Brett holen', icon: '●', ready: true },
  { id: 'traps', name: 'Fallenfeld', desc: 'Fallen finden, Zahlen verraten die Nachbarn', icon: '✦', ready: true },
];

const app = document.getElementById('app');

const card = (g, attr, icon = g.icon) => `
  <button class="game-card ${g.ready === false ? 'soon' : ''}" ${attr} ${g.ready === false ? 'disabled' : ''}>
    <span class="game-icon">${icon}</span>
    <span class="game-text">
      <span class="game-title">${g.name}</span>
      <span class="game-desc">${g.desc}</span>
    </span>
    <span class="game-meta">${g.ready === false ? 'bald' : g.meta ? g.meta() : `Level ${state[g.id]?.level ?? 1}`}</span>
  </button>`;

function showMenu() {
  app.className = 'screen menu';
  const games = [...GAMES].map((g) => ({ ...g, ready: !!g.ready })).sort((a, b) => b.ready - a.ready);
  app.innerHTML = `
    <header class="menu-head">
      <div>
        <h1>Knobelkiste</h1>
        <p>Logikrätsel ohne Ende</p>
      </div>
      <button class="icon-btn sound-toggle" aria-label="Geräusche ein/aus">${sound.enabled ? '🔈' : '🔇'}</button>
    </header>
    <div class="game-list">${games.map((g) => card(g, `data-game="${g.id}"`)).join('')}</div>`;
  app.querySelector('.sound-toggle').addEventListener('click', (e) => {
    sound.setEnabled(!sound.enabled);
    e.currentTarget.textContent = sound.enabled ? '🔈' : '🔇';
    sound.click();
  });
  app.querySelectorAll('[data-game]').forEach((b) =>
    b.addEventListener('click', () => {
      const g = GAMES.find((x) => x.id === b.dataset.game);
      if (g.modes) showModes(g); else startGame(g.id);
    }));
}

// Auswahl der Spielarten eines Spiels (z. B. Gleisbau: Einzelfeld / Großstrecke)
function showModes(g) {
  app.className = 'screen menu';
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-back aria-label="Zurück">‹</button>
      <div class="title"><span class="level">${g.name}</span></div>
      <div class="lives"></div>
    </header>
    <div class="game-list">${g.modes.map((m) => card(m, `data-mode="${m.id}"`, g.icon)).join('')}</div>`;
  app.querySelector('[data-back]').addEventListener('click', showMenu);
  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startGame(b.dataset.mode)));
}

const MOUNT = { arrows: mountArrows, arrows3d: mountArrows3d, crowns: mountCrowns, tracks: mountTracks, nonogram: mountNonogram, nonogramColor: mountNonogramColor, screws: mountScrews, colors: mountColors, traps: mountTraps };

// Direkt-Link zum Testen: ?spiel=<id>&level=<n>
// Mit ?level wird ein Testlevel gespielt, ohne den gespeicherten Spielstand zu ändern.
const params = new URLSearchParams(location.search);
const testLevels = {};
if (params.get('spiel') && params.get('level')) testLevels[params.get('spiel')] = Math.max(1, Number(params.get('level')) || 1);

function startGame(id, { intro = true } = {}) {
  app.className = 'screen game';
  if (id === 'tracksRoute') {
    mountTrackRoute(app, {
      rs: state.tracksRoute, save, intro,
      onExit: (how) => (how === 'menu' ? showMenu() : startGame(id, { intro: false })),
    });
    return;
  }
  const mount = MOUNT[id];
  if (!mount) return;
  const testing = testLevels[id] !== undefined;
  mount(app, {
    level: testing ? testLevels[id] : state[id].level,
    onWin: (lvl) => {
      if (testing) { testLevels[id] = lvl + 1; return; }
      state[id].level = Math.max(state[id].level, lvl + 1);
      state[id].solved++;
      save();
    },
    onExit: (how) => {
      if (how === 'menu') showMenu();
      else startGame(id); // restart oder next (Level steht schon im Spielstand)
    },
  });
}

const direct = params.get('spiel');
if (direct && (MOUNT[direct] || direct === 'tracksRoute')) startGame(direct);
else showMenu();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
