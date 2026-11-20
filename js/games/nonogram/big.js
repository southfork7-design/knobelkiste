// Großbild: vier Bilderrätsel (2×2), die einzeln gelöst werden und zusammen
// ein großes Bild ergeben. Die Übersicht zeigt die vier Teile; Tippen auf ein
// Teil öffnet es (Reihenfolge frei). Jedes Teil hat eigene 3 Herzen und einen
// eigenen gespeicherten Stand; gelöste Teile bleiben gelöst, bis das Bild fertig ist.
import { generateBigLevel } from './generator.js';
import { mountNonogram } from './game.js';
import { createShell, timeText, mistakesText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';

const C = 10;
const SVGNS = 'http://www.w3.org/2000/svg';
const PROGRESS_KEY = 'knobelkiste-nonogramBig-teile';
const tileKey = (q) => `knobelkiste-nonogramBig-stand-${q}`;

let cache = null; // zuletzt erzeugtes Level (Zurück zur Übersicht ohne Neuberechnung)
const levelData = (level) => (cache && cache.level === level ? cache : (cache = generateBigLevel(level)));

function loadProgress(level) {
  try {
    const p = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (p && p.level === level && Array.isArray(p.done) && p.done.length === 4) return p;
  } catch {}
  return { level, done: [null, null, null, null] };
}
const saveProgress = (p) => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {} };
function clearAll() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
    for (let q = 0; q < 4; q++) localStorage.removeItem(tileKey(q));
  } catch {}
}
// Zwischenstand eines angefangenen Teils (für die Vorschau in der Übersicht)
function tileState(q, level, t) {
  try {
    const sv = JSON.parse(localStorage.getItem(tileKey(q)));
    if (sv && sv.level === level && sv.R === t && sv.K === t && sv.st.length === t * t)
      return Uint8Array.from(sv.st, (ch) => parseInt(ch, 16));
  } catch {}
  return null;
}

export function mountNonogramBig(root, { level, onWin, onExit }) {
  const B = levelData(level);
  const progress = loadProgress(level);
  saveProgress(progress);
  showOverview();

  function showOverview(finished = false) {
    const t = B.tile, S = B.size;
    const doneCount = progress.done.filter(Boolean).length;
    const shell = createShell(root, {
      name: 'Großbild', level, label: `Level ${level} · ${S}×${S}`,
      onExit: (how) => {
        if (how === 'next') { clearAll(); onExit('next'); } else onExit('menu');
      },
    });
    root.querySelector('[data-act="hint"]').hidden = true;
    root.querySelector('[data-act="restart"]').hidden = true;
    shell.setCounter(`${doneCount} von 4 Teilen`);
    shell.board.classList.add('nono-big-wrap');

    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', `nono-big ${finished ? 'solved' : ''}`);
    svg.setAttribute('viewBox', `-2 -2 ${S * C + 4} ${S * C + 4}`);
    let html = '';
    for (let q = 0; q < 4; q++) {
      const P = B.parts[q], x0 = (q & 1) * t * C, y0 = (q >> 1) * t * C;
      const done = !!progress.done[q];
      const st = done ? null : tileState(q, level, t);
      let d = '';
      for (let i = 0; i < t * t; i++) {
        const on = done ? P.pixels[i] : st && st[i] === 1;
        if (on) d += `M${x0 + (i % t) * C} ${y0 + Math.floor(i / t) * C}h${C}v${C}h${-C}z`;
      }
      html += `<g class="part ${done ? 'done' : 'open'}" data-q="${q}">
        <rect class="part-bg" x="${x0}" y="${y0}" width="${t * C}" height="${t * C}"/>
        <path class="part-fill" d="${d}"/>
        ${done ? '' : `<text class="part-label" x="${x0 + (t * C) / 2}" y="${y0 + (t * C) / 2}">${q + 1}</text>`}
      </g>`;
    }
    if (!finished) html += `<path class="part-cut" d="M${t * C} 0V${S * C}M0 ${t * C}H${S * C}"/>`;
    html += `<rect class="part-frame" width="${S * C}" height="${S * C}"/>`;
    svg.innerHTML = html;
    shell.board.appendChild(svg);
    const note = document.createElement('p');
    note.className = 'nono-big-note';
    note.textContent = finished ? '' : `Vier Teile zu je ${t}×${t} Feldern, in beliebiger Reihenfolge. Teil antippen zum Lösen.`;
    shell.board.appendChild(note);

    if (finished) {
      const sum = (k) => progress.done.reduce((a, d) => a + d[k], 0);
      const details = [timeText(sum('time')), mistakesText(sum('mistakes'))];
      const h = sum('hints');
      if (h) details.push(`${h} ${h === 1 ? 'Tipp' : 'Tipps'}`);
      clearAll();
      onWin && onWin(level);
      setTimeout(() => { if (svg.isConnected) shell.win(details); }, 900);
      return;
    }
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('.part.open');
      if (!g) return;
      sound.tick();
      openPart(Number(g.dataset.q));
    });
  }

  function openPart(q) {
    mountNonogram(root, {
      level, puzzle: B.parts[q], saveKey: tileKey(q),
      name: 'Großbild', label: `Level ${level} · Teil ${q + 1}`,
      onExit: (how) => (how === 'restart' ? openPart(q) : showOverview()),
      onSolved: (res) => {
        progress.done[q] = res;
        saveProgress(progress);
        try { localStorage.removeItem(tileKey(q)); } catch {}
        showOverview(progress.done.every(Boolean));
      },
    });
  }
}
