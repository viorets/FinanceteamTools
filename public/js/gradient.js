// Gradient fill for charts: each shape fades from its own colour at the top to a lighter tint of that colour at the
// bottom, so series stay tellable apart and the chart still reads in black and white. Used by the Gantt chart (SVG and
// PNG) and by the Excel to SVG chart (Plotly's on-screen SVG and the downloaded SVG).
const NS = 'http://www.w3.org/2000/svg';
export const TINT = 0.4; // share of white mixed into the bottom stop

const rgbOf = (c) => {
  const s = String(c).trim();
  const h = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(s);
  if (h) { const x = h[1].length === 3 ? [...h[1]].map((d) => d + d).join('') : h[1]; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
  const m = /^rgba?\(([^)]+)\)$/i.exec(s); if (!m) return null;
  const p = m[1].split(',').map((v) => parseFloat(v)); return p.length >= 3 && p.slice(0, 3).every(Number.isFinite) ? p : null;
};
const hex = (rgb) => '#' + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** The colour with `k` of white mixed in, as #rrggbb (the colour itself if it cannot be read). */
export const tint = (c, k = TINT) => { const rgb = rgbOf(c); return rgb ? hex(rgb.map((v, i) => (i < 3 ? v + (255 - v) * k : v))) : c; };

/** <linearGradient> markup, top to bottom, from `c` to its tint; `fade` fades opacity instead (area fills). */
export function gradientDef(id, c, { fade = false, opacity = 1 } = {}) {
  const top = hex(rgbOf(c) || [0, 0, 0]);
  const stops = fade
    ? `<stop offset="0" stop-color="${top}" stop-opacity="${Math.min(1, opacity * 1.8).toFixed(2)}"/><stop offset="1" stop-color="${top}" stop-opacity="0.04"/>`
    : `<stop offset="0" stop-color="${top}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${tint(top)}" stop-opacity="${opacity}"/>`;
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`;
}

// Plotly marks that get a gradient: bars, pie and donut slices, treemap tiles (solid), and area fills (fading).
const SOLID = '.barlayer .point path, .pielayer .slice path.surface, .treemaplayer .slice path.surface';
const FADE = '.scatterlayer .js-fill';

/** Give the marks of a Plotly SVG (on screen or parsed from an export) gradient fills. Safe to run again. */
export function gradientize(svg, prefix = 'tg') {
  if (!svg) return;
  let defs = svg.querySelector(':scope > defs.tg-defs');
  if (!defs) { defs = svg.ownerDocument.createElementNS(NS, 'defs'); defs.setAttribute('class', 'tg-defs'); svg.insertBefore(defs, svg.firstChild); }
  const have = new Set([...defs.children].map((g) => g.id));
  const paint = (el, fade) => {
    const fill = el.style.fill || el.getAttribute('fill') || '';
    if (!fill || fill.startsWith('url(') || fill === 'none') return;
    const rgb = rgbOf(fill); if (!rgb) return;
    // Plotly keeps an rgba fill's alpha in the colour itself (area fills) or in fill-opacity.
    const op = (rgb[3] ?? 1) * (parseFloat(el.style.fillOpacity || el.getAttribute('fill-opacity')) || 1);
    const id = `${prefix}-${fade ? 'f' : 's'}-${hex(rgb).slice(1)}-${Math.round(op * 100)}`;
    if (!have.has(id)) {
      const doc = new DOMParser().parseFromString(`<svg xmlns="${NS}">${gradientDef(id, hex(rgb), { fade, opacity: op })}</svg>`, 'image/svg+xml');
      defs.appendChild(svg.ownerDocument.importNode(doc.documentElement.firstChild, true)); have.add(id);
    }
    // As plain attributes: a url() inside style is saved with &quot; quotes, which PowerPoint and Canva may not read.
    el.style.removeProperty('fill'); el.style.removeProperty('fill-opacity');
    el.setAttribute('fill', `url(#${id})`); el.setAttribute('fill-opacity', '1');
  };
  svg.querySelectorAll(SOLID).forEach((el) => paint(el, false));
  svg.querySelectorAll(FADE).forEach((el) => paint(el, true));
}
