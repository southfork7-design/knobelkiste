// Zeichenhilfen für Gleise (Spielfeld und Gesamtkarte).
import { DR, DC, bit, opp } from './generator.js';

export const SVGNS = 'http://www.w3.org/2000/svg';
export const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
export const bits = (m) => [0, 1, 2, 3].filter((d) => m & bit(d));

// Pfad für ein Feld (W Felder breit) mit Verbindungsmaske m. `extend(d)` → true,
// wenn das Gleis in Richtung d über den Feldrand hinausragen soll (Start/Ziel).
// `from`: Richtung, aus der gezeichnet wird (für die Fahrtrichtung).
// Kurven sind Viertelkreise um die Feldecke.
export function cellPath(W, i, m, C, extend = () => false, ox = 0, oy = 0, from = -1) {
  const r = Math.floor(i / W), c = i % W;
  const cx = ox + c * C + C / 2, cy = oy + r * C + C / 2;
  const edge = (d) => [cx + DC[d] * C / 2, cy + DR[d] * C / 2];
  const ext = (d) => {
    const [x, y] = edge(d);
    return extend(d) ? [x + DC[d] * C * 0.4, y + DR[d] * C * 0.4] : [x, y];
  };
  const ds = bits(m);
  if (from >= 0 && ds[1] === from) ds.reverse();
  if (ds.length === 1) { const [x, y] = ext(ds[0]); return `M${cx} ${cy} L${x} ${y} `; }
  if (ds.length === 2) {
    const [a, b] = ds.map(ext);
    if (ds[0] === opp(ds[1])) return `M${a[0]} ${a[1]} L${b[0]} ${b[1]} `;
    const [ea, eb] = ds.map(edge);
    const kx = cx + (DC[ds[0]] + DC[ds[1]]) * C / 2, ky = cy + (DR[ds[0]] + DR[ds[1]]) * C / 2;
    const cross = (ea[0] - kx) * (eb[1] - ky) - (ea[1] - ky) * (eb[0] - kx);
    return `M${a[0]} ${a[1]} L${ea[0]} ${ea[1]} A${C / 2} ${C / 2} 0 0 ${cross > 0 ? 1 : 0} ${eb[0]} ${eb[1]} L${b[0]} ${b[1]} `;
  }
  return '';
}

// Gleis-Ebene: Schwellen, Schienen, Zwischenraum
export function trackLayer(parent, cls) {
  const g = el('g', { class: cls });
  const sleepers = el('path', { class: 'sleepers' });
  const rails = el('path', { class: 'rails' });
  const gap = el('path', { class: 'rail-gap' });
  g.append(sleepers, rails, gap);
  parent.appendChild(g);
  return (d) => { sleepers.setAttribute('d', d); rails.setAttribute('d', d); gap.setAttribute('d', d); };
}

// Strecke in Fahrtrichtung als ein Pfad (für die Lös-Animation)
export function routePath(P, C, ox = 0, oy = 0, extend = () => false) {
  const { W, solution, start, startOut } = P;
  let i = start, from = startOut, d = '';
  for (let guard = 0; guard < solution.length && i >= 0; guard++) {
    const ext = (dir) => extend(i, dir);
    d += cellPath(W, i, solution[i], C, ext, ox, oy, from);
    const out = bits(solution[i]).find((x) => x !== from);
    if (out === undefined) break;
    const r = Math.floor(i / W) + DR[out], c = (i % W) + DC[out];
    if (r < 0 || c < 0 || r >= P.H || c >= W) break;
    i = r * W + c; from = opp(out);
  }
  return d;
}

// Felsen: Feld mit ein paar Steinen (fest je Feld, damit es nicht flackert)
export function rocksPath(P, C, ox = 0, oy = 0) {
  let base = '', stones = '';
  const { W, blocked } = P;
  if (!blocked) return { base, stones };
  for (let i = 0; i < blocked.length; i++) {
    if (!blocked[i]) continue;
    const x = ox + (i % W) * C, y = oy + Math.floor(i / W) * C;
    base += `M${x} ${y} h${C} v${C} h${-C} Z `;
    let s = (i * 2654435761) >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 3; k++) {
      const rx = 1.2 + rnd() * 1.3, ry = rx * (0.6 + rnd() * 0.3);
      const px = x + 2.2 + rnd() * (C - 4.4), py = y + 2.2 + rnd() * (C - 4.4);
      stones += `M${px - rx} ${py} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z `;
    }
  }
  return { base, stones };
}

// Gesamtkarte einer Großstrecke. panels: bekannte Felder (mit Lösung),
// solvedCount: wie viele davon gelöst sind; nextIndex: hervorgehobenes Feld.
export function overviewSVG(R, panels, solvedCount, nextIndex = -1) {
  const C = 10, { n, layout } = R;
  const W = layout.cols * n * C, H = layout.rows * n * C;
  const pad = 5;
  const svg = el('svg', { class: 'tracks overview', viewBox: `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}` });
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, class: 'field' }));
  // Felder der Karte
  for (let k = 0; k < R.order.length; k++) {
    const [r, c] = R.order[k];
    const x = c * n * C, y = r * n * C;
    const cls = k < solvedCount ? 'panel solved' : k === nextIndex ? 'panel next' : 'panel todo';
    svg.appendChild(el('rect', { x, y, width: n * C, height: n * C, class: cls }));
    if (k === nextIndex) {
      const t = el('text', { x: x + n * C / 2, y: y + n * C / 2, class: 'panel-label', 'dominant-baseline': 'central' });
      t.textContent = k + 1;
      svg.appendChild(t);
    }
  }
  // Felsen und Gleise der gelösten Felder
  let rb = '', rs = '';
  const draw = trackLayer(svg, 'track given');
  const g = svg.lastChild;
  let d = '';
  panels.slice(0, solvedCount).forEach((p, k) => {
    const ox = p.col * n * C, oy = p.row * n * C;
    const rocks = rocksPath(p, C, ox, oy);
    rb += rocks.base; rs += rocks.stones;
    for (let i = 0; i < n * n; i++) {
      if (!p.solution[i]) continue;
      const extend = (dir) => (k === 0 && i === p.start && dir === p.startOut) ||
        (k === R.count - 1 && i === p.end && dir === p.endOut);
      d += cellPath(n, i, p.solution[i], C, extend, ox, oy);
    }
  });
  svg.insertBefore(el('path', { d: rb, class: 'rock' }), g);
  svg.insertBefore(el('path', { d: rs, class: 'stone' }), g);
  draw(d);
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, class: 'map-frame' }));
  return svg;
}
