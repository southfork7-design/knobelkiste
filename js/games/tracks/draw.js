// Zeichenhilfen für Gleise (Spielfeld und Gesamtkarte).
import { DR, DC, bit, opp } from './generator.js';

export const SVGNS = 'http://www.w3.org/2000/svg';
export const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
export const bits = (m) => [0, 1, 2, 3].filter((d) => m & bit(d));

// Pfad für ein Feld mit Verbindungsmaske m. `extend(d)` → true, wenn das
// Gleis in Richtung d über den Feldrand hinausragen soll (Start/Ziel).
export function cellPath(n, i, m, C, extend = () => false, ox = 0, oy = 0) {
  const r = Math.floor(i / n), c = i % n;
  const cx = ox + c * C + C / 2, cy = oy + r * C + C / 2;
  const edge = (d) => [cx + DC[d] * C / 2, cy + DR[d] * C / 2];
  const ext = (d) => {
    const [x, y] = edge(d);
    return extend(d) ? [x + DC[d] * C * 0.32, y + DR[d] * C * 0.32] : [x, y];
  };
  const ds = bits(m);
  if (ds.length === 1) { const [x, y] = ext(ds[0]); return `M${cx} ${cy} L${x} ${y} `; }
  if (ds.length === 2) {
    const [a, b] = ds.map(ext);
    if (ds[0] === opp(ds[1])) return `M${a[0]} ${a[1]} L${b[0]} ${b[1]} `;
    const [ea, eb] = ds.map(edge);
    return `M${a[0]} ${a[1]} L${ea[0]} ${ea[1]} Q${cx} ${cy} ${eb[0]} ${eb[1]} L${b[0]} ${b[1]} `;
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

// Gesamtkarte einer Großstrecke. panels: bekannte Felder (mit Lösung),
// solvedCount: wie viele davon gelöst sind; nextIndex: hervorgehobenes Feld.
export function overviewSVG(R, panels, solvedCount, nextIndex = -1) {
  const C = 10, { n, layout } = R;
  const W = layout.cols * n * C, H = layout.rows * n * C;
  const pad = 4;
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
  // Gleise der gelösten Felder
  const draw = trackLayer(svg, 'track given');
  let d = '';
  panels.slice(0, solvedCount).forEach((p, k) => {
    const ox = p.col * n * C, oy = p.row * n * C;
    for (let i = 0; i < n * n; i++) {
      if (!p.solution[i]) continue;
      const extend = (dir) => (k === 0 && i === p.start && dir === p.startOut) ||
        (k === R.count - 1 && i === p.end && dir === p.endOut);
      d += cellPath(n, i, p.solution[i], C, extend, ox, oy);
    }
  });
  draw(d);
  svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, class: 'map-frame' }));
  return svg;
}
