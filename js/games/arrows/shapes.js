// Eigene, einfache Umrisse für Pfeilwerk-Level mit Figur.
// Jede Figur liegt in einem Kasten W×H (beliebige Einheiten); inside(x, y) sagt,
// ob ein Punkt dazugehört. Daraus wird ein Raster-Maske in beliebiger Größe.

const inPoly = (pts, x, y) => {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
};
const inCircle = (cx, cy, r, x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (cx, cy, rx, ry, x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x0, y0, x1, y1, x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const starPts = (() => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 21 : 50;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([50 + r * Math.cos(a), 54 + r * Math.sin(a)]);
  }
  return pts;
})();

export const SHAPES = [
  { name: 'Herz', W: 100, H: 92, inside: (x, y) => {
    const X = (x - 50) / 40, Y = (50 - y) / 40;
    return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0;
  } },
  { name: 'Ring', W: 100, H: 100, inside: (x, y) => inCircle(50, 50, 49, x, y) && !inCircle(50, 50, 17, x, y) },
  { name: 'Raute', W: 100, H: 124, inside: (x, y) => Math.abs(x - 50) / 50 + Math.abs(y - 62) / 62 <= 1 },
  { name: 'Stern', W: 100, H: 98, inside: (x, y) => inPoly(starPts, x, y) },
  { name: 'Haus', W: 100, H: 110, inside: (x, y) =>
    (inPoly([[50, 0], [100, 44], [0, 44]], x, y) || inRect(10, 44, 90, 110, x, y) || inRect(68, 6, 82, 30, x, y))
    && !inRect(40, 74, 60, 110, x, y) && !inRect(18, 56, 32, 68, x, y) && !inRect(68, 56, 82, 68, x, y) },
  { name: 'Tanne', W: 100, H: 130, inside: (x, y) =>
    inPoly([[50, 0], [80, 38], [20, 38]], x, y) || inPoly([[50, 22], [90, 72], [10, 72]], x, y)
    || inPoly([[50, 52], [100, 110], [0, 110]], x, y) || inRect(41, 108, 59, 130, x, y) },
  { name: 'Tasse', W: 124, H: 100, inside: (x, y) =>
    inRect(0, 4, 86, 64, x, y) || (inEllipse(43, 64, 43, 36, x, y) && y >= 64)
    || (inEllipse(90, 42, 32, 26, x, y) && !inEllipse(90, 42, 17, 13, x, y) && x > 80) },
  { name: 'Katze', W: 100, H: 100, inside: (x, y) =>
    inEllipse(50, 60, 46, 40, x, y) || inPoly([[8, 0], [42, 26], [10, 46]], x, y) || inPoly([[92, 0], [58, 26], [90, 46]], x, y) },
  { name: 'Fisch', W: 140, H: 84, inside: (x, y) =>
    (inEllipse(56, 42, 56, 34, x, y) || inPoly([[96, 42], [140, 6], [128, 42], [140, 78]], x, y))
    && !inCircle(26, 34, 6, x, y) },
  { name: 'Mond', W: 80, H: 100, inside: (x, y) => inCircle(50, 50, 50, x, y) && !inCircle(76, 40, 42, x, y) },
  { name: 'Pilz', W: 100, H: 100, inside: (x, y) =>
    (inEllipse(50, 50, 50, 48, x, y) && y <= 50) || inRect(4, 46, 96, 52, x, y) || inRect(32, 50, 68, 100, x, y) },
  { name: 'Tropfen', W: 80, H: 110, inside: (x, y) =>
    inCircle(40, 70, 40, x, y) || inPoly([[40, 0], [76, 54], [4, 54]], x, y) },
];

// Rastert eine Figur auf `gw` Spalten. Gibt { w, h, mask } zurück (leere Ränder abgeschnitten).
export function rasterShape(shape, gw) {
  const gh = Math.max(1, Math.round((gw * shape.H) / shape.W));
  const full = [];
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++)
      full.push(shape.inside(((i + 0.5) / gw) * shape.W, ((j + 0.5) / gh) * shape.H) ? 1 : 0);
  let x0 = gw, x1 = -1, y0 = gh, y1 = -1;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++)
      if (full[j * gw + i]) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) mask[j * w + i] = full[(j + y0) * gw + i + x0];
  return { w, h, mask };
}
