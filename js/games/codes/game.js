// Farbschloss: Darstellung und Bedienung.
// Farbe unten antippen → kommt auf die markierte Stelle der aktuellen Zeile.
// Stelle antippen → markieren; markierte, gefüllte Stelle nochmal antippen → leeren.
// Fertige Zeile antippen → ihre Farben in die aktuelle Zeile übernehmen.
// Farbe unten lange drücken → als „kommt nicht vor“ abblenden (nur Merkhilfe).
// Tipp: setzt einen Versuch, der zu allen bisherigen Antworten passt.
import { generateLevel, score, candidates, codeAt } from './generator.js';
import { createShell, timeText } from '../../ui/shell.js';
import { sound } from '../../ui/sound.js';
import { mulberry32 } from '../../rng.js';

const LONG_MS = 450;
const NAMES = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Orange', 'Weiß', 'Rosa'];

export const mountCodes4 = (root, opts) => mountCodes(root, { ...opts, P: 4 });
export const mountCodes6 = (root, opts) => mountCodes(root, { ...opts, P: 6 });

function mountCodes(root, { level, P, onWin, onExit }) {
  const SAVE_KEY = `knobelkiste-codes${P}-stand`;
  const TRY_KEY = `knobelkiste-codes${P}-versuch`;
  const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const storeJSON = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Versuch-Nummer: nach „Neu“ oder verlorenem Spiel kommt ein anderer Code
  const tr = loadJSON(TRY_KEY);
  const attempt = tr && tr.level === level ? tr.attempt : 0;
  const L = generateLevel(level, P, attempt);
  const { K, rep, rows, code } = L;
  const params = { P, K, rep };

  let history = [];                       // [{ guess, fb }]
  let cur = new Array(P).fill(-1);
  let placed = [];                        // Reihenfolge des Setzens (für ↶)
  let sel = 0;
  let tips = 0, over = false;
  let excluded = new Set();
  let elapsed = 0, t0 = performance.now();
  const hintRnd = mulberry32(level * 31 + attempt * 977 + P);

  const sv = loadJSON(SAVE_KEY);
  if (sv && sv.level === level && sv.attempt === attempt && sv.P === P) {
    history = sv.history; cur = sv.cur; tips = sv.tips; elapsed = sv.elapsed || 0;
    excluded = new Set(sv.excluded || []);
    sel = Math.max(0, cur.indexOf(-1));
  }

  const newTry = () => storeJSON(TRY_KEY, { level, attempt: attempt + 1 });
  const shell = createShell(root, {
    name: 'Farbschloss', level,
    onExit: (how) => {
      if (how === 'menu') saveState();
      else { storeJSON(SAVE_KEY, null); if (how === 'restart') newTry(); }
      onExit(how);
    },
    onHint: hint,
    onUndo: undo,
  });

  const wrap = document.createElement('div');
  wrap.className = `codes p${P}`;
  wrap.innerHTML = `
    <div class="codes-info">${P} Stellen · ${K} Farben · ${rep ? 'Farben können doppelt vorkommen' : 'jede Farbe höchstens einmal'}</div>
    <div class="codes-secret"></div>
    <div class="codes-rows"></div>
    <div class="codes-palette"></div>
    <button class="primary codes-check">Prüfen</button>
    <div class="toast"></div>`;
  shell.board.appendChild(wrap);
  const secretEl = wrap.querySelector('.codes-secret');
  const rowsEl = wrap.querySelector('.codes-rows');
  const palEl = wrap.querySelector('.codes-palette');
  const checkBtn = wrap.querySelector('.codes-check');
  const toast = wrap.querySelector('.toast');

  let toastTimer = 0;
  function say(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // ---------- Aufbau ----------
  const peg = (k, extra = '', attrs = '') =>
    `<span class="codes-peg ${k < 0 ? 'empty' : ''} ${extra}" ${k >= 0 ? `style="--c: var(--k${k})"` : ''} ${attrs}></span>`;

  function fbHtml(fb) {
    const out = [];
    for (let i = 0; i < P; i++) out.push(`<span class="fb ${i < fb[0] ? 'hit' : i < fb[0] + fb[1] ? 'near' : ''}"></span>`);
    return `<div class="codes-fb" aria-label="${fb[0]} am Platz, ${fb[1]} woanders">${out.join('')}</div>`;
  }

  function renderSecret(show) {
    secretEl.innerHTML = `<span class="codes-num"></span><div class="codes-slots">${
      code.map((k) => (show ? peg(k) : '<span class="codes-peg hidden">?</span>')).join('')}</div><div class="codes-fb-space"></div>`;
    secretEl.classList.toggle('open', show);
  }

  function render() {
    let html = '';
    for (let r = 0; r < rows; r++) {
      if (r < history.length) {
        const h = history[r];
        html += `<div class="codes-row done" data-row="${r}"><span class="codes-num">${r + 1}</span>
          <div class="codes-slots">${h.guess.map((k) => peg(k)).join('')}</div>${fbHtml(h.fb)}</div>`;
      } else if (r === history.length && !over) {
        html += `<div class="codes-row cur"><span class="codes-num">${r + 1}</span>
          <div class="codes-slots">${cur.map((k, i) => peg(k, i === sel ? 'sel' : '', `data-slot="${i}" role="button" aria-label="Stelle ${i + 1}${k >= 0 ? ': ' + NAMES[k] : ''}"`)).join('')}</div>
          <div class="codes-fb-space"></div></div>`;
      } else {
        html += `<div class="codes-row future"><span class="codes-num">${r + 1}</span>
          <div class="codes-slots">${cur.map(() => '<span class="codes-peg empty"></span>').join('')}</div>
          <div class="codes-fb-space"></div></div>`;
      }
    }
    rowsEl.innerHTML = html;
    palEl.innerHTML = Array.from({ length: K }, (_, k) =>
      `<button class="codes-color ${excluded.has(k) ? 'out' : ''}" data-color="${k}" style="--c: var(--k${k})" aria-label="${NAMES[k]}"></button>`).join('');
    checkBtn.disabled = over || cur.includes(-1);
    shell.setCounter(over ? '' : `Zeile ${history.length + 1} von ${rows}`);
    const curRow = rowsEl.querySelector('.cur');
    if (curRow && rowsEl.scrollHeight > rowsEl.clientHeight) curRow.scrollIntoView({ block: 'nearest' });
  }

  // Größe der Steine an den Platz anpassen (alle Zeilen sollen ohne Scrollen passen)
  function fit() {
    const r = shell.board.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cols = P + 2.4;                    // Nummer + Steine + Antwort
    const byW = (r.width - 8) / cols - 6;
    const fixed = 22 + 54 + 56 + 14;          // Info, Farben, Prüfen, Abstände
    const byH = (r.height - fixed) / (rows + 1.3) - 6;
    const s = Math.max(22, Math.min(46, byW, byH));
    wrap.style.setProperty('--s', s.toFixed(1) + 'px');
    wrap.style.setProperty('--ps', Math.min(44, Math.max(30, (r.width - 8) / K - 8)).toFixed(1) + 'px');
  }

  // ---------- Bedienung ----------
  function nextEmpty(from) {
    for (let d = 1; d <= P; d++) { const i = (from + d) % P; if (cur[i] < 0) return i; }
    return -1;
  }

  function put(k) {
    if (over) return;
    if (sel < 0) { sound.bump(); say('Alle Stellen belegt – Stelle antippen zum Ändern'); return; }
    cur[sel] = k;
    placed = placed.filter((i) => i !== sel); placed.push(sel);
    const n = nextEmpty(sel);
    sel = n;
    sound.click();
    render();
  }

  function tapSlot(i) {
    if (over) return;
    if (sel === i && cur[i] >= 0) { cur[i] = -1; placed = placed.filter((x) => x !== i); sound.tick(); }
    else { sel = i; sound.tick(); }
    render();
  }

  function copyRow(r) {
    if (over) return;
    cur = [...history[r].guess];
    placed = cur.map((_, i) => i);
    sel = -1;
    sound.tick();
    render();
  }

  function undo() {
    if (over) return;
    const i = placed.pop();
    if (i === undefined) { sound.bump(); return; }
    cur[i] = -1;
    sel = i;
    sound.tick();
    render();
  }

  function check() {
    if (over) return;
    if (cur.includes(-1)) { sound.bump(); say('Erst alle Stellen belegen'); return; }
    const guess = [...cur];
    const fb = score(code, guess, K);
    history.push({ guess, fb });
    if (fb[0] === P) { win(); return; }
    if (history.length >= rows) { lose(); return; }
    cur = new Array(P).fill(-1); placed = []; sel = 0;
    sound.click();
    render();
    saveState();
  }

  function hint() {
    if (over) return;
    const cand = candidates(params, history);
    const g = codeAt(params, cand[Math.floor(hintRnd() * cand.length)]);
    cur = g; placed = g.map((_, i) => i); sel = -1;
    tips++;
    sound.tick();
    render();
    say(cand.length === 1 ? 'Nur noch diese Möglichkeit' :
      `Passt zu allen Antworten · noch ${cand.length.toLocaleString('de-DE')} Möglichkeiten`);
  }

  function finish() {
    over = true;
    storeJSON(SAVE_KEY, null);
    render();
    renderSecret(true);
  }

  function win() {
    finish();
    storeJSON(TRY_KEY, null);
    onWin(level);
    const n = history.length;
    const details = [n === 1 ? '1 Versuch' : `${n} Versuche`, timeText(elapsed + performance.now() - t0)];
    if (tips) details.push(tips === 1 ? '1 Tipp' : `${tips} Tipps`);
    setTimeout(() => shell.win(details), 600);
  }

  function lose() {
    finish();
    newTry();
    sound.bump();
    setTimeout(() => shell.showCard(`<h2>Nicht gelöst</h2>
      <p>Level ${level} · alle ${rows} Zeilen verbraucht · der Code steht oben</p>
      <button class="primary" data-act="next">Neuer Code</button>
      <button class="secondary" data-act="back">Zum Menü</button>`), 700);
  }

  function saveState() {
    if (over) return;
    if (!history.length && !cur.some((k) => k >= 0) && !excluded.size) { storeJSON(SAVE_KEY, null); return; }
    storeJSON(SAVE_KEY, {
      P, level, attempt, history, cur, tips, excluded: [...excluded],
      elapsed: elapsed + performance.now() - t0,
    });
  }

  // Farbleiste: kurz tippen = setzen, lange drücken = abblenden
  let press = null;
  palEl.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    const k = Number(b.dataset.color);
    press = { k, long: false, timer: setTimeout(() => {
      press.long = true;
      if (excluded.has(k)) excluded.delete(k); else excluded.add(k);
      sound.tick();
      shell.vibrate(15);
      render();
    }, LONG_MS) };
  });
  const endPress = (e, cancel) => {
    if (!press) return;
    clearTimeout(press.timer);
    const p = press; press = null;
    if (!cancel && !p.long) put(p.k);
  };
  palEl.addEventListener('pointerup', (e) => endPress(e, false));
  palEl.addEventListener('pointercancel', (e) => endPress(e, true));
  palEl.addEventListener('pointerleave', (e) => endPress(e, true));
  palEl.addEventListener('contextmenu', (e) => e.preventDefault());

  rowsEl.addEventListener('click', (e) => {
    const s = e.target.closest('[data-slot]');
    if (s) { tapSlot(Number(s.dataset.slot)); return; }
    const r = e.target.closest('.codes-row.done');
    if (r) copyRow(Number(r.dataset.row));
  });
  checkBtn.addEventListener('click', check);

  const ro = new ResizeObserver(() => { if (!wrap.isConnected) { ro.disconnect(); return; } fit(); });
  ro.observe(shell.board);
  const onHide = () => {
    if (!wrap.isConnected) { document.removeEventListener('visibilitychange', onHide); return; }
    if (document.visibilityState === 'hidden') saveState();
  };
  document.addEventListener('visibilitychange', onHide);

  renderSecret(false);
  fit();
  render();
  if (history.length) say('Spielstand fortgesetzt');
}
