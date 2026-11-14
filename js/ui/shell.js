// Gemeinsamer Rahmen für alle Spiele: Kopfleiste, Leben, Werkzeugleiste, Dialoge.
// Ton: nüchtern, keine Lobeshymnen (siehe README „Grundsätze“).
import { sound } from './sound.js';

export function createShell(root, { name, level, label = null, lives = 0, onExit, onHint, onUndo }) {
  root.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" data-act="back" aria-label="Zurück">‹</button>
      <div class="title"><span class="game-name">${name}</span><span class="level">${label ?? 'Level ' + level}</span></div>
      <div class="lives" aria-label="Leben"></div>
    </header>
    <div class="board-wrap"></div>
    <footer class="toolbar">
      <button class="tool-btn" data-act="restart" aria-label="Neu starten">↺ Neu</button>
      <span class="counter"></span>
      ${onUndo ? '<button class="tool-btn" data-act="undo" aria-label="Rückgängig">↶</button>' : ''}
      <button class="tool-btn" data-act="hint">💡 Tipp</button>
    </footer>
    <div class="overlay" hidden></div>`;

  const livesEl = root.querySelector('.lives');
  const counterEl = root.querySelector('.counter');
  const overlay = root.querySelector('.overlay');
  const maxLives = lives;

  root.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'hint') onHint && onHint();
    else if (act === 'undo') onUndo && onUndo();
    else onExit(act === 'back' ? 'menu' : act); // 'menu' | 'restart' | 'next'
  };

  function showOverlay(html) {
    overlay.innerHTML = `<div class="card">${html}</div>`;
    overlay.hidden = false;
  }

  return {
    board: root.querySelector('.board-wrap'),
    setLives(n) {
      if (!maxLives) return;
      livesEl.innerHTML = Array.from({ length: maxLives }, (_, i) =>
        `<span class="heart ${i < n ? '' : 'lost'}">♥</span>`).join('');
    },
    setCounter(text) { counterEl.textContent = text; },
    // Eigene Karte im Dialog anzeigen; gibt das Karten-Element zurück
    showCard(html) { showOverlay(html); return overlay.querySelector('.card'); },
    hideCard() { overlay.hidden = true; overlay.innerHTML = ''; },
    vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} },
    // details: Liste nüchterner Angaben, z. B. ['2 Fehler', '1:24 min']
    win(details = []) {
      sound.solved();
      showOverlay(`<h2>Gelöst</h2>
        <p>${['Level ' + level, ...details].join(' · ')}</p>
        <button class="primary" data-act="next">Level ${level + 1}</button>
        <button class="secondary" data-act="back">Zum Menü</button>`);
    },
    lose(tip) {
      showOverlay(`<h2>Keine Leben mehr</h2>
        <p>${tip}</p>
        <button class="primary" data-act="restart">Nochmal</button>
        <button class="secondary" data-act="back">Zum Menü</button>`);
    },
  };
}

export const mistakesText = (n) => (n === 0 ? 'ohne Fehler' : `${n} Fehler`);
export function timeText(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}
