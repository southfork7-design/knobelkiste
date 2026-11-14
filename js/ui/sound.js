// Dezente Geräusche, live erzeugt (keine Audiodateien).
// Grundsatz für alle Spiele: keine Musik, keine Jingles – nur leise, kurze Laute.

const KEY = 'knobelkiste.sound';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch {}

const MASTER = 0.5; // Gesamtlautstärke (alle Werte unten sind ohnehin klein)
let ctx = null;
let noiseBuf = null;

function ac() {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

// Kurzer Ton mit weichem Ein- und Ausklang
function tone(freq, { dur = 0.05, vol = 0.05, type = 'sine', attack = 0.003, to = null, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * MASTER, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sound = {
  get enabled() { return enabled; },
  setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
  },

  // Etwas fliegt weg: leises, gefiltertes Rauschen, das in der Höhe abfällt
  whoosh() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, dur = 0.28;
    const src = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * MASTER, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t); src.stop(t + dur + 0.02);
  },

  // Etwas wird gesetzt: kurzer, trockener Klick
  click() {
    tone(1500, { dur: 0.035, vol: 0.06, type: 'triangle', to: 900 });
  },

  // Markierung (z. B. Kreuz): noch leiser
  tick() {
    tone(1100, { dur: 0.025, vol: 0.025, type: 'triangle' });
  },

  // Etwas stößt an / passt nicht: weicher, tiefer Ton
  bump() {
    tone(150, { dur: 0.14, vol: 0.09, to: 110 });
  },

  // Rätsel gelöst: zwei leise, weiche Töne – kein Jingle
  solved() {
    tone(660, { dur: 0.5, vol: 0.035, attack: 0.03 });
    tone(990, { dur: 0.6, vol: 0.03, attack: 0.03, delay: 0.12 });
  },
};
