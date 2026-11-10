// Gantt Chart Creator: tasks typed into a table (or loaded from an Excel sheet) become a Gantt chart (one row per task)
// or a timeline (one lane per group, items packed into the lane). The chart is laid out once as a list of shapes; the
// same list is written as SVG (preview and SVG download) and drawn on a canvas (PNG download), so both match and Thai
// text is shaped by the browser. The SVG download carries LINE Seed Sans TH inside it, so it looks the same elsewhere.
// Tasks and options are kept in this browser (localStorage) between visits.
import { pairHex } from './hex-color.js';
import { gradientDef, tint } from './gradient.js';
import { ICON } from './view-tools.js';
import { CHART_FONTS, currentTheme, fontStack } from './themes.js';

const FONT = 'LINE Seed Sans TH';
const FAMILY = `'${FONT}', 'Noto Sans Thai', 'Sarabun', sans-serif`;
const FONT_URL = new URL('../fonts/LINESeedSansTH_Rg.ttf', import.meta.url);
const STORE = 'gantt-creator-v1';
// Fallbacks; the chart takes its colours from the site theme (o.palette, o.ink, o.todayColor).
const PALETTE = ['#1b4965', '#5fa8d3', '#2a9d8f', '#e9a23b', '#8e6c8a', '#d1495b', '#62b6cb', '#6b8f3e'];
const INK = '#1b2a33'; const MUTED = '#5d6f7a'; const GRID = '#dbe5ea'; const BAND = '#f3f8fa'; const TODAY = '#d1495b';
const DAY = 864e5;

// ---------- dates (whole days, UTC, so time zones never shift a bar) ----------
const dayOf = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null; };
const isoOf = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const todayDay = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY; };
const fmt = (locale, o) => new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'UTC', ...o });
// A date from Excel or typed text: a Date, an Excel serial number, YYYY-MM-DD, or D/M/YYYY (Thai years over 2400 are B.E.).
function toIso(v) {
  if (v instanceof Date && !isNaN(v)) { const t = new Date(v.getTime() + 12 * 36e5); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
  if (typeof v === 'number' && window.XLSX) { const p = window.XLSX.SSF.parse_date_code(v); if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; }
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}

// ---------- measuring text (the same browser fonts the canvas uses) ----------
const mctx = document.createElement('canvas').getContext('2d');
let MFAM = FAMILY; // the family being laid out (layout() sets it from o.font)
const textW = (s, size, weight = 400) => { mctx.font = `${weight} ${size}px ${MFAM}`; return mctx.measureText(s).width; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const onColour = (hex, ink = INK) => (lum(hex) > 0.35 ? ink : '#ffffff');
function fitText(s, size, weight, max) {
  if (textW(s, size, weight) <= max) return s;
  let t = s; while (t.length > 1 && textW(`${t}…`, size, weight) > max) t = t.slice(0, -1);
  return `${t}…`;
}

// ---------- layout ----------
const UNITS = { day: { px: 26 }, week: { px: 5 }, month: { px: 3.2 }, quarter: { px: 1.15 } };
function pickUnit(span) { return span <= 31 ? 'day' : span <= 150 ? 'week' : span <= 800 ? 'month' : 'quarter'; }
// Tick days from d0 to d1 for a unit: [day, label] pairs; and the bands of the header above them.
function ticks(unit, d0, d1, locale) {
  const out = []; const dt = (d) => new Date(d * DAY);
  if (unit === 'day') { for (let d = d0; d <= d1; d++) out.push([d, String(dt(d).getUTCDate())]); }
  else if (unit === 'week') { let d = d0 - ((dt(d0).getUTCDay() + 6) % 7); for (; d <= d1; d += 7) out.push([d, fmt(locale, { day: 'numeric', month: 'short' }).format(dt(d))]); }
  else {
    const step = unit === 'month' ? 1 : 3; const s = dt(d0); let y = s.getUTCFullYear(); let m = Math.floor(s.getUTCMonth() / step) * step;
    for (;;) {
      const d = Date.UTC(y, m, 1) / DAY; if (d > d1) break;
      out.push([d, unit === 'month' ? fmt(locale, { month: 'short' }).format(dt(d)) : `Q${m / 3 + 1}`]);
      m += step; if (m > 11) { m -= 12; y++; }
    }
  }
  return out;
}
function bands(unit, d0, d1, locale) {
  const out = []; const top = unit === 'day' || unit === 'week' ? 'month' : 'year';
  let d = d0;
  while (d <= d1) {
    const t = new Date(d * DAY); const y = t.getUTCFullYear(); const m = t.getUTCMonth();
    const next = top === 'month' ? Date.UTC(y, m + 1, 1) / DAY : Date.UTC(y + 1, 0, 1) / DAY;
    out.push([d, Math.min(next, d1 + 1), top === 'month' ? fmt(locale, { month: 'long', year: 'numeric' }).format(t) : fmt(locale, { year: 'numeric' }).format(t)]);
    d = next;
  }
  return out;
}

// Shapes: { t: 'rect' | 'line' | 'text' | 'poly', ... } in chart units (1 unit = 1 CSS px at 100%).
// fitW: the width to fill (the preview's), so the chart needs no sideways scrolling unless it is long.
export function layout(tasks, o, fitW = 1100) {
  const family = o.font ? fontStack(o.font) : FAMILY; MFAM = family;
  const rows = tasks.map((t) => ({ ...t, s: dayOf(t.start), e: dayOf(t.milestone ? t.start : t.end || t.start) }))
    .filter((t) => t.name.trim() && t.s != null && t.e != null).map((t) => (t.e < t.s ? { ...t, s: t.e, e: t.s } : t));
  const groups = []; rows.forEach((t) => { const g = t.group.trim(); if (!groups.includes(g)) groups.push(g); });
  const pal = o.palette || PALETTE; const ink = o.ink || INK; const todayC = o.todayColor || TODAY;
  const colour = (g) => o.colors[g] || pal[groups.indexOf(g) % pal.length];
  const shapes = [];
  const pad = 24; const titleH = o.title.trim() ? 44 : 0; const headH = 52;
  if (!rows.length) return { shapes, w: 640, h: 200, groups, colour, family, empty: true };

  let d0 = Math.min(...rows.map((t) => t.s)); let d1 = Math.max(...rows.map((t) => t.e));
  if (o.today) { const td = todayDay(); if (td >= d0 - 60 && td <= d1 + 60) { d0 = Math.min(d0, td); d1 = Math.max(d1, td); } }
  const unit = o.scale === 'auto' ? pickUnit(d1 - d0 + 1) : o.scale;
  // Start and end on whole units, so the first and last ticks are full.
  const tk0 = ticks(unit, d0, d1, o.locale); if (tk0.length) d0 = Math.min(d0, tk0[0][0]);
  const endT = new Date((d1 + 1) * DAY);
  if (unit === 'month') d1 = Date.UTC(endT.getUTCFullYear(), endT.getUTCMonth() + (endT.getUTCDate() > 1 ? 1 : 0), 1) / DAY - 1;
  if (unit === 'quarter') { const q = Math.floor(endT.getUTCMonth() / 3) * 3; d1 = Date.UTC(endT.getUTCFullYear(), q + (endT.getUTCDate() > 1 || endT.getUTCMonth() % 3 ? 3 : 0), 1) / DAY - 1; }
  if (unit === 'week') d1 = d0 + Math.ceil((d1 - d0 + 1) / 7) * 7 - 1;
  const days = d1 - d0 + 1;

  const timeline = o.mode === 'timeline';
  const labelSize = 13; const groupSize = 13;
  const labelCol = Math.min(320, Math.max(120, ...(timeline ? groups.map((g) => textW(g || 'Tasks', groupSize, 700)) : rows.map((t) => textW(t.name, labelSize) + (groups.length > 1 || groups[0] ? 14 : 0)))) + 24);
  const range = (t) => (t.milestone || t.s === t.e
    ? fmt(o.locale, { day: 'numeric', month: 'short' }).format(new Date(t.s * DAY))
    : `${fmt(o.locale, { day: 'numeric', month: 'short' }).format(new Date(t.s * DAY))} – ${fmt(o.locale, { day: 'numeric', month: 'short' }).format(new Date(t.e * DAY))}`);
  // Room on the right for the text after the last bars (dates, %, or timeline labels), so nothing is cut off.
  const after = (t) => timeline ? textW(o.dates ? `${t.name} · ${range(t)}` : t.name, 12) + 22
    : textW([o.dates ? range(t) : '', o.progress && !t.milestone && t.progress !== '' && t.progress != null ? '100%' : ''].filter(Boolean).join(' · '), 11) + 18;
  const lastEnd = Math.max(...rows.map((t) => t.e));
  const rightRoom = Math.min(260, Math.max(12, ...rows.filter((t) => t.e >= lastEnd - (lastEnd - d0) * 0.25).map(after)));
  const plotW = Math.max(days * UNITS[unit].px, 520, fitW - labelCol - pad * 2 - rightRoom); // narrower views scroll sideways
  const px = plotW / days;
  const X = (d) => pad + labelCol + (d - d0) * px;
  const top = pad + titleH; const bodyTop = top + headH;
  const W = pad * 2 + labelCol + plotW + rightRoom;

  if (titleH) shapes.push({ t: 'text', x: pad, y: pad + 14, text: o.title.trim(), size: 20, weight: 700, fill: ink });
  // Header: bands (months or years) over ticks.
  bands(unit, d0, d1, o.locale).forEach(([a, b, label]) => {
    const x0 = X(a); const x1 = X(b);
    shapes.push({ t: 'line', x1: x0, y1: top, x2: x0, y2: top + 24, stroke: GRID, width: 1 });
    shapes.push({ t: 'text', x: x0 + 8, y: top + 12, text: fitText(label, 12, 700, Math.max(0, x1 - x0 - 12)), size: 12, weight: 700, fill: ink });
  });
  const tk = ticks(unit, d0, d1, o.locale).filter(([d]) => d >= d0 && d <= d1);
  const tickW = tk.length > 1 ? (tk[1][0] - tk[0][0]) * px : plotW;
  tk.forEach(([d, label]) => shapes.push({ t: 'text', x: unit === 'day' ? X(d) + px / 2 : X(d) + 6, y: top + 38, text: fitText(label, 11, 400, tickW - 8), size: 11, fill: MUTED, anchor: unit === 'day' ? 'middle' : 'start' }));

  // Body rows.
  const items = []; // { y, h, label, ... } rows in reading order
  const rowH = 34; const barH = 18;
  let y = bodyTop;
  if (!timeline) {
    let band = 0;
    groups.forEach((g) => {
      if (g) { items.push({ kind: 'group', y, h: 28, g }); y += 28; }
      rows.filter((t) => t.group.trim() === g).forEach((t) => { items.push({ kind: 'task', y, h: rowH, t, band: band++ % 2 }); y += rowH; });
    });
  } else {
    groups.forEach((g, gi) => {
      // Pack the lane: each item takes the first sub-row where it (with its label) fits.
      const lanes = []; const placed = [];
      rows.filter((t) => t.group.trim() === g).sort((a, b) => a.s - b.s).forEach((t) => {
        const x0 = X(t.s); const x1 = t.milestone ? x0 + 8 : X(t.e + 1);
        const lw = textW(t.name, 12) + 16; const inside = !t.milestone && x1 - x0 >= lw;
        const end = (inside ? x1 : Math.max(x1, x0) + 8 + lw) + 10;
        let li = lanes.findIndex((r) => r <= (t.milestone ? x0 - 8 : x0)); if (li < 0) { li = lanes.length; lanes.push(0); }
        lanes[li] = end; placed.push({ t, li, inside });
      });
      const h = Math.max(1, lanes.length) * rowH + 12;
      items.push({ kind: 'lane', y, h, g, gi, placed });
      y += h;
    });
  }
  const bodyBottom = y;
  // Row bands, then grid lines over the whole body.
  items.forEach((it) => {
    if (it.kind === 'task' && it.band) shapes.push({ t: 'rect', x: pad, y: it.y, w: labelCol + plotW, h: it.h, fill: BAND });
    if (it.kind === 'lane' && it.gi % 2) shapes.push({ t: 'rect', x: pad, y: it.y, w: labelCol + plotW, h: it.h, fill: BAND });
  });
  tk.forEach(([d]) => shapes.push({ t: 'line', x1: X(d), y1: top + 26, x2: X(d), y2: bodyBottom, stroke: GRID, width: 1 }));
  shapes.push({ t: 'line', x1: X(d1 + 1), y1: top + 26, x2: X(d1 + 1), y2: bodyBottom, stroke: GRID, width: 1 });
  shapes.push({ t: 'line', x1: pad, y1: bodyTop, x2: pad + labelCol + plotW, y2: bodyTop, stroke: '#b9cbd3', width: 1 });
  shapes.push({ t: 'line', x1: pad, y1: bodyBottom, x2: pad + labelCol + plotW, y2: bodyBottom, stroke: '#b9cbd3', width: 1 });

  const diamond = (cx, cy, r, fill) => ({ t: 'poly', pts: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], fill });
  const bar = (t, x0, x1, cy, c) => {
    const w = Math.max(2, x1 - x0);
    if (o.progress && t.progress !== '' && t.progress != null) {
      const p = Math.min(100, Math.max(0, +t.progress)) / 100;
      shapes.push({ t: 'rect', x: x0, y: cy - barH / 2, w, h: barH, rx: 4, fill: c, opacity: 0.3, grad: o.gradient });
      if (p > 0) shapes.push({ t: 'rect', x: x0, y: cy - barH / 2, w: Math.max(2, w * p), h: barH, rx: 4, fill: c, grad: o.gradient });
    } else shapes.push({ t: 'rect', x: x0, y: cy - barH / 2, w, h: barH, rx: 4, fill: c, grad: o.gradient });
  };

  // Today line under the bars and labels, so it never covers text.
  if (o.today) {
    const td = todayDay();
    if (td >= d0 && td <= d1) {
      const x = X(td) + px / 2;
      shapes.push({ t: 'line', x1: x, y1: bodyTop - 4, x2: x, y2: bodyBottom, stroke: todayC, width: 1.5, dash: '4 3' });
      shapes.push({ t: 'text', x, y: bodyBottom + 12, text: o.locale === 'th' ? 'วันนี้' : 'Today', size: 11, weight: 700, fill: todayC, anchor: 'middle' });
    }
  }
  items.forEach((it) => {
    if (it.kind === 'group') {
      shapes.push({ t: 'rect', x: pad, y: it.y + 9, w: 10, h: 10, rx: 2, fill: colour(it.g) });
      shapes.push({ t: 'text', x: pad + 16, y: it.y + 14, text: fitText(it.g, groupSize, 700, labelCol - 24), size: groupSize, weight: 700, fill: ink });
      return;
    }
    if (it.kind === 'task') {
      const t = it.t; const c = colour(t.group.trim()); const cy = it.y + it.h / 2;
      shapes.push({ t: 'text', x: pad + (groups.some(Boolean) ? 16 : 0), y: cy, text: fitText(t.name, labelSize, 400, labelCol - 24), size: labelSize, fill: ink });
      const x0 = X(t.s); const x1 = X(t.e + 1);
      if (t.milestone) shapes.push(diamond(x0, cy, 8, c)); else bar(t, x0, x1, cy, c);
      const after = (t.milestone ? x0 + 8 : x1) + 8;
      const note = [o.dates ? range(t) : '', o.progress && !t.milestone && t.progress !== '' && t.progress != null ? `${Math.round(+t.progress)}%` : ''].filter(Boolean).join(' · ');
      if (note) shapes.push({ t: 'text', x: after, y: cy, text: note, size: 11, fill: MUTED });
      return;
    }
    // Timeline lane.
    const c = colour(it.g);
    shapes.push({ t: 'rect', x: pad, y: it.y + 14, w: 4, h: it.h - 28 > 0 ? it.h - 28 : 6, rx: 2, fill: c });
    shapes.push({ t: 'text', x: pad + 14, y: it.y + 20, text: fitText(it.g || 'Tasks', groupSize, 700, labelCol - 28), size: groupSize, weight: 700, fill: ink });
    it.placed.forEach(({ t, li, inside }) => {
      const cy = it.y + 6 + li * rowH + rowH / 2; const x0 = X(t.s); const x1 = X(t.e + 1);
      const label = o.dates ? `${t.name} · ${range(t)}` : t.name;
      if (t.milestone) {
        shapes.push(diamond(x0, cy, 8, c));
        shapes.push({ t: 'text', x: x0 + 14, y: cy, text: label, size: 12, fill: ink });
        return;
      }
      bar(t, x0, x1, cy, c);
      const fits = textW(label, 12) + 16 <= x1 - x0;
      if (inside && fits) shapes.push({ t: 'text', x: x0 + 8, y: cy, text: label, size: 12, fill: o.progress && t.progress !== '' && +t.progress < 60 ? ink : onColour(c, ink) });
      else shapes.push({ t: 'text', x: x1 + 8, y: cy, text: label, size: 12, fill: ink });
    });
  });

  return { shapes, w: Math.ceil(W), h: Math.ceil(bodyBottom + (o.today ? 24 : 0) + pad), groups, colour, family };
}

// ---------- output ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function toSvg({ shapes, w, h, family = FAMILY }, { bg = '#ffffff', fontCss = '' } = {}) {
  // Gradient bars (js/gradient.js): one <linearGradient> per colour, top colour to a lighter tint at the bottom.
  const grads = new Map(); const gid = (c) => { if (!grads.has(c)) grads.set(c, `gc-${c.replace('#', '')}`); return grads.get(c); };
  const out = shapes.map((s) => {
    if (s.t === 'rect') return `<rect x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${s.h.toFixed(1)}"${s.rx ? ` rx="${s.rx}"` : ''} fill="${s.grad ? `url(#${gid(s.fill)})` : s.fill}"${s.opacity != null ? ` fill-opacity="${s.opacity}"` : ''}/>`;
    if (s.t === 'line') return `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${s.stroke}" stroke-width="${s.width}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.t === 'poly') return `<polygon points="${s.pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${s.fill}"/>`;
    return `<text x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" font-size="${s.size}"${s.weight ? ` font-weight="${s.weight}"` : ''} fill="${s.fill}" dominant-baseline="central"${s.anchor && s.anchor !== 'start' ? ` text-anchor="${s.anchor}"` : ''}>${esc(s.text)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${esc(family)}">${grads.size ? `<defs>${[...grads].map(([c, id]) => gradientDef(id, c)).join('')}</defs>` : ''}${fontCss ? `<style>${fontCss}</style>` : ''}${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${out}</svg>`;
}
export async function toPng({ shapes, w, h, family = FAMILY }, { bg = '#ffffff', scale = 3 } = {}) {
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d'); ctx.scale(scale, scale);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  shapes.forEach((s) => {
    ctx.globalAlpha = s.opacity ?? 1;
    if (s.t === 'rect') {
      if (s.grad) { const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h); g.addColorStop(0, s.fill); g.addColorStop(1, tint(s.fill)); ctx.fillStyle = g; } else ctx.fillStyle = s.fill;
      ctx.beginPath(); if (s.rx && ctx.roundRect) ctx.roundRect(s.x, s.y, s.w, s.h, s.rx); else ctx.rect(s.x, s.y, s.w, s.h); ctx.fill(); }
    if (s.t === 'line') { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.width; ctx.setLineDash(s.dash ? s.dash.split(' ').map(Number) : []); ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
    if (s.t === 'poly') { ctx.fillStyle = s.fill; ctx.beginPath(); s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); }
    if (s.t === 'text') { ctx.fillStyle = s.fill; ctx.font = `${s.weight || 400} ${s.size}px ${family}`; ctx.textBaseline = 'middle'; ctx.textAlign = s.anchor === 'middle' ? 'center' : s.anchor === 'end' ? 'right' : 'left'; ctx.fillText(s.text, s.x, s.y); }
  });
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
let fontCss = null;
async function embeddedFont() {
  if (fontCss != null) return fontCss;
  try {
    const buf = new Uint8Array(await (await fetch(FONT_URL)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    fontCss = `@font-face{font-family:'${FONT}';src:url(data:font/ttf;base64,${btoa(bin)}) format('truetype');font-weight:400;}`;
  } catch { fontCss = ''; }
  return fontCss;
}

// ---------- Excel ----------
const HEAD = {
  name: /^(task|name|activity|item|งาน|ชื่องาน|กิจกรรม|รายการ)/i, start: /^(start|begin|from|เริ่ม|วันเริ่ม)/i,
  end: /^(end|finish|due|to|until|สิ้นสุด|เสร็จ|วันสิ้นสุด|ถึง)/i, group: /^(group|phase|category|section|team|stage|กลุ่ม|ระยะ|หมวด|ฝ่าย|ขั้น)/i,
  progress: /^(progress|%|complete|done|ความคืบหน้า)/i, milestone: /^(milestone|หมุด|เหตุการณ์สำคัญ)/i,
};
export function tasksFromSheet(ws) {
  const rows = window.XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
  if (!rows.length) return [];
  const keys = Object.keys(rows[0]); const col = {};
  Object.entries(HEAD).forEach(([k, re]) => { col[k] = keys.find((h) => re.test(String(h).trim())); });
  if (!col.name) col.name = keys[0];
  if (!col.start) throw new Error('No start date column was found. Name the columns Task, Start, End (optional: Group, Progress, Milestone).');
  return rows.map((r) => {
    const start = toIso(r[col.start]); const end = col.end ? toIso(r[col.end]) : '';
    const ms = col.milestone ? /^(y|yes|true|1|x|✓|ใช่)$/i.test(String(r[col.milestone]).trim()) : false;
    const prog = col.progress ? r[col.progress] : '';
    const p = prog === '' ? '' : Math.round((typeof prog === 'number' && prog <= 1 ? prog * 100 : parseFloat(prog)) || 0);
    return { name: String(r[col.name] ?? '').trim(), group: col.group ? String(r[col.group] ?? '').trim() : '', start, end: ms ? '' : end || start, progress: p, milestone: ms || (!end && !!start && !!col.end) };
  }).filter((t) => t.name && t.start);
}

// ---------- the tool ----------
const blank = () => ({ name: '', group: '', start: isoOf(todayDay()), end: isoOf(todayDay() + 6), progress: '', milestone: false });
function example() {
  const t = todayDay(); const d = (n) => isoOf(t + n);
  return [
    { name: 'Collect budget requests', group: 'Planning', start: d(-14), end: d(-4), progress: 100, milestone: false },
    { name: 'Draft budget plan', group: 'Planning', start: d(-6), end: d(6), progress: 60, milestone: false },
    { name: 'Budget pitching day', group: 'Review', start: d(10), end: '', progress: '', milestone: true },
    { name: 'Committee feedback', group: 'Review', start: d(11), end: d(20), progress: 0, milestone: false },
    { name: 'Final report', group: 'Report', start: d(21), end: d(34), progress: 0, milestone: false },
    { name: 'Submit to council', group: 'Report', start: d(35), end: '', progress: '', milestone: true },
  ];
}
const DEFAULTS = { title: '', font: FONT, mode: 'gantt', scale: 'auto', locale: 'en', today: true, progress: true, dates: false, gradient: false, transparent: false, colors: {} };

export function openGantt(root, { download }) {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* storage off */ }
  const st = { tasks: saved?.tasks || [], o: { ...DEFAULTS, ...(saved?.o || {}) } };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch { /* storage off: nothing kept */ } };
  const $ = (s) => root.querySelector(s);
  root.innerHTML = `
    <div class="sidebar gc-side">
      <div class="control-group"><label for="gcFile">Import Excel (.xlsx, .xls, .csv)</label><input type="file" id="gcFile" accept=".xlsx,.xls,.csv">
        <p class="help-text">Columns: Task, Start, End. Optional: Group, Progress (%), Milestone (yes). Thai headings work too (งาน, เริ่ม, สิ้นสุด, กลุ่ม).</p></div>
      <div class="control-group"><label for="gcTitle">Chart title</label><input type="text" id="gcTitle" placeholder="e.g. Budget plan 2026…" maxlength="120" autocomplete="off"></div>
      <div class="control-group"><label for="gcFont">Chart font</label><select id="gcFont">${CHART_FONTS.map((f) => `<option>${f}</option>`).join('')}</select></div>
      <div class="control-group"><label for="gcMode">Chart type</label><select id="gcMode"><option value="gantt">Gantt: one row per task</option><option value="timeline">Timeline: one lane per group</option></select></div>
      <div class="gc-pair">
        <div class="control-group"><label for="gcScale">Time scale</label><select id="gcScale"><option value="auto">Auto</option><option value="day">Days</option><option value="week">Weeks</option><option value="month">Months</option><option value="quarter">Quarters</option></select></div>
        <div class="control-group"><label for="gcLocale">Date labels</label><select id="gcLocale"><option value="en">English</option><option value="th">ไทย (พ.ศ.)</option></select></div>
      </div>
      <fieldset class="gc-checks"><legend>Show</legend>
        <div class="gc-today"><label><input type="checkbox" id="gcToday"> Today line</label><span class="gc-today-c"><input type="color" id="gcTodayC" aria-label="Today line colour" title="Today line colour"></span></div>
        <label><input type="checkbox" id="gcProgress"> Progress</label>
        <label><input type="checkbox" id="gcDates"> Dates beside bars</label>
        <label><input type="checkbox" id="gcGrad"> Gradient bars</label>
      </fieldset>
      <div class="control-group"><span class="gc-label">Group colours</span><div id="gcColors" class="gc-colors"></div></div>
    </div>
    <div class="main-content gc-main">
      <div class="gc-out">
        <div class="gc-bar"><h2 class="gc-h">Chart</h2>
          <label class="gc-transp"><input type="checkbox" id="gcTransp"> Transparent background</label>
          <button type="button" class="gc-btn gc-primary" id="gcPng">Download PNG</button><button type="button" class="gc-btn" id="gcSvg">Download SVG</button></div>
        <div class="gc-preview" id="gcPreview" aria-label="Chart preview"></div>
        <p class="help-text gc-status" id="gcStatus" role="status"></p>
      </div>
      <div class="gc-editor">
        <div class="gc-bar"><h2 class="gc-h">Tasks</h2>
          <div class="gc-tools" role="toolbar" aria-label="Task tools">
            <button type="button" class="gc-ib" id="gcAdd" title="Add task" aria-label="Add task">${ICON.zin}</button>
            <label class="gc-ib gc-sort" title="Sort tasks by…">${ICON.sort}<span class="gc-chev">${ICON.chev}</span>
              <select id="gcSort" aria-label="Sort tasks by"><option value="" selected disabled>Sort by…</option><option value="start">Start date</option><option value="end">End date</option><option value="group">Group</option><option value="name">Task name</option></select></label>
            <button type="button" class="gc-ib" id="gcExample" title="Load example tasks" aria-label="Load example tasks">${ICON.sample}</button>
            <button type="button" class="gc-ib gc-ib-danger" id="gcClear" title="Clear all tasks" aria-label="Clear all tasks">${ICON.del}</button>
          </div></div>
        <div class="gc-table-wrap"><table class="gc-table"><thead><tr><th scope="col">Task</th><th scope="col">Group</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Progress %</th><th scope="col">Milestone</th><th scope="col"><span class="gc-sr">Remove</span></th></tr></thead><tbody id="gcRows"></tbody></table></div>
        <datalist id="gcGroups"></datalist>
      </div>
    </div>`;
  const status = (s) => { $('#gcStatus').textContent = s; };
  const fitW = () => Math.floor(($('#gcPreview').clientWidth || 1100) - 2);
  // The options plus the colours of the site theme; colours picked here win over the theme's.
  const opts = () => { const t = currentTheme(); return { ...st.o, palette: t.chart, ink: t.ink, todayColor: st.o.todayColor || t.today }; };
  let model = null;

  // chartOnly: a colour is being picked; keep its picker open and only redraw the chart.
  function draw(chartOnly = false) {
    const prev = $('#gcPreview');
    model = layout(st.tasks, opts(), fitW());
    $('#gcTodayC').value = opts().todayColor; syncToday();
    if (model.empty) {
      prev.innerHTML = `<div class="gc-empty"><p><b>No tasks yet.</b> Add tasks in the table below, import an Excel sheet, or load the example to see how it works.</p></div>`;
    } else prev.innerHTML = toSvg(model, { bg: '#ffffff' }); // the preview stays white; transparency applies to the PNG
    $('#gcPng').disabled = $('#gcSvg').disabled = !!model.empty;
    if (chartOnly) return;
    // Group colours: one picker (with HEX) per group in use.
    const box = $('#gcColors'); const used = model.groups || [];
    box.innerHTML = used.length ? '' : '<p class="help-text">Groups you type appear here.</p>';
    used.forEach((g) => {
      const row = document.createElement('label'); row.className = 'gc-color';
      const name = document.createElement('span'); name.textContent = g || 'No group';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = model.colour(g); inp.setAttribute('aria-label', `Colour of ${g || 'tasks with no group'}`);
      inp.addEventListener('input', () => { st.o.colors[g] = inp.value; save(); draw(true); });
      row.append(name, inp); box.append(row); pairHex(inp);
    });
    $('#gcGroups').innerHTML = used.filter(Boolean).map((g) => `<option value="${esc(g)}">`).join('');
  }
  let t0 = 0; const redrawSoon = () => { clearTimeout(t0); t0 = setTimeout(() => draw(), 120); };

  const COLS = ['name', 'group', 'start', 'end', 'progress', 'milestone'];
  function rowsUi() {
    const tb = $('#gcRows'); tb.replaceChildren();
    st.tasks.forEach((t, i) => {
      const tr = document.createElement('tr'); tr.dataset.i = i;
      tr.innerHTML = `<td><input type="text" data-k="name" aria-label="Task name" placeholder="Task name…" autocomplete="off"></td>
        <td><input type="text" data-k="group" aria-label="Group" list="gcGroups" placeholder="Group…" autocomplete="off"></td>
        <td><input type="date" data-k="start" aria-label="Start date"></td>
        <td><input type="date" data-k="end" aria-label="End date"></td>
        <td><input type="number" data-k="progress" aria-label="Progress in percent" min="0" max="100" step="5" inputmode="numeric"></td>
        <td class="gc-c"><input type="checkbox" data-k="milestone" aria-label="Milestone (one day)"></td>
        <td class="gc-c"><button type="button" class="gc-del" aria-label="Remove task ${i + 1}" title="Remove task">${ICON.del}</button></td>`;
      COLS.forEach((k) => { const el = tr.querySelector(`[data-k="${k}"]`); if (k === 'milestone') el.checked = !!t.milestone; else el.value = t[k] ?? ''; });
      tr.querySelector('[data-k="end"]').disabled = !!t.milestone;
      tb.append(tr);
    });
  }
  $('#gcRows').addEventListener('input', (e) => {
    const k = e.target.dataset.k; const tr = e.target.closest('tr'); if (!k || !tr) return;
    const t = st.tasks[+tr.dataset.i];
    t[k] = k === 'milestone' ? e.target.checked : k === 'progress' ? (e.target.value === '' ? '' : Math.min(100, Math.max(0, +e.target.value))) : e.target.value;
    if (k === 'milestone') tr.querySelector('[data-k="end"]').disabled = t.milestone;
    save(); redrawSoon();
  });
  $('#gcRows').addEventListener('click', (e) => {
    const b = e.target.closest('.gc-del'); if (!b) return;
    st.tasks.splice(+b.closest('tr').dataset.i, 1); save(); rowsUi(); draw();
  });
  $('#gcAdd').onclick = () => {
    const last = st.tasks.at(-1); const t = blank();
    if (last) { t.group = last.group; const e = dayOf(last.end || last.start); if (e != null) { t.start = isoOf(e + 1); t.end = isoOf(e + 7); } }
    st.tasks.push(t); save(); rowsUi(); draw();
    $('#gcRows').lastElementChild?.querySelector('[data-k="name"]')?.focus();
  };
  // Sort by: start date, end date, group (groups in order of their first start) or task name; the table order is the chart order.
  const startOf = (t) => dayOf(t.start) ?? 1e9; const endOf = (t) => dayOf(t.milestone ? t.start : t.end || t.start) ?? 1e9;
  $('#gcSort').onchange = (e) => {
    const by = e.target.value; e.target.value = ''; if (!by || !st.tasks.length) return;
    const first = {}; st.tasks.forEach((t) => { const g = t.group.trim(); first[g] = Math.min(first[g] ?? 1e9, startOf(t)); });
    const cmp = {
      start: (a, b) => startOf(a) - startOf(b) || endOf(a) - endOf(b),
      end: (a, b) => endOf(a) - endOf(b) || startOf(a) - startOf(b),
      group: (a, b) => first[a.group.trim()] - first[b.group.trim()] || a.group.localeCompare(b.group, 'th') || startOf(a) - startOf(b),
      name: (a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }),
    }[by];
    st.tasks.sort(cmp); save(); rowsUi(); draw(); status(`Sorted by ${{ start: 'start date', end: 'end date', group: 'group', name: 'task name' }[by]}`);
  };
  $('#gcExample').onclick = () => { if (st.tasks.length && !confirm('Replace the tasks with the example?')) return; st.tasks = example(); save(); rowsUi(); draw(); };
  $('#gcClear').onclick = () => { if (!st.tasks.length || !confirm('Remove all tasks?')) return; st.tasks = []; save(); rowsUi(); draw(); };

  // Options.
  const bind = (id, k, kind = 'value') => {
    const el = $(id); el[kind] = st.o[k];
    el.addEventListener(kind === 'checked' ? 'change' : 'input', () => { st.o[k] = el[kind]; save(); redrawSoon(); });
  };
  bind('#gcTitle', 'title'); bind('#gcMode', 'mode');
  // Chart font: load its faces first so measuring and drawing use the real font.
  const loadFont = (f) => Promise.all(['400', '700'].map((wt) => document.fonts.load(`${wt} 13px "${f}"`).catch(() => {})));
  $('#gcFont').value = st.o.font;
  $('#gcFont').addEventListener('change', async (e) => { st.o.font = e.target.value; save(); await loadFont(st.o.font); draw(); }); bind('#gcScale', 'scale'); bind('#gcLocale', 'locale');
  bind('#gcToday', 'today', 'checked'); bind('#gcProgress', 'progress', 'checked'); bind('#gcDates', 'dates', 'checked'); bind('#gcGrad', 'gradient', 'checked'); bind('#gcTransp', 'transparent', 'checked');

  $('#gcFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const wb = window.XLSX.read(await f.arrayBuffer(), { cellDates: true });
      let tasks = [];
      for (const n of wb.SheetNames) { try { tasks = tasksFromSheet(wb.Sheets[n]); } catch (err) { if (n === wb.SheetNames.at(-1)) throw err; } if (tasks.length) break; }
      if (!tasks.length) throw new Error('No task rows with a start date were found in this file.');
      if (st.tasks.length && !confirm(`Replace the ${st.tasks.length} tasks in the table with ${tasks.length} from ${f.name}?`)) return;
      st.tasks = tasks; save(); rowsUi(); draw(); status(`Imported ${tasks.length} tasks from ${f.name}`);
    } catch (err) { status(err.message); }
  };
  const fileName = () => (st.o.title.trim() || 'gantt-chart').replace(/[\\/:*?"<>|]+/g, '-');
  $('#gcSvg').onclick = async () => {
    // LINE Seed Sans TH travels inside the SVG; other fonts are named, so the app opening it needs them installed.
    const embed = st.o.font === FONT;
    const svg = toSvg(layout(st.tasks, opts(), fitW()), { bg: st.o.transparent ? '' : '#ffffff', fontCss: embed ? await embeddedFont() : '' });
    download(new TextEncoder().encode(svg), `${fileName()}.svg`, 'image/svg+xml');
    status(embed ? 'SVG downloaded (font included)' : `SVG downloaded (uses ${st.o.font}: the app opening it needs that font; the PNG always looks exact)`);
  };
  $('#gcPng').onclick = async () => {
    const blob = await toPng(layout(st.tasks, opts(), fitW()), { bg: st.o.transparent ? '' : '#ffffff' });
    download(new Uint8Array(await blob.arrayBuffer()), `${fileName()}.png`, 'image/png');
    status(`PNG downloaded${st.o.transparent ? ' (transparent background)' : ''}, 3× size for sharp printing`);
  };

  const syncToday = pairHex($('#gcTodayC'));
  $('#gcTodayC').addEventListener('input', (e) => { st.o.todayColor = e.target.value; save(); draw(true); });
  // A new site theme brings its own colour values: group and today-line colours picked here go back to the theme's.
  addEventListener('site-theme', () => { st.o.colors = {}; st.o.todayColor = null; save(); draw(); });
  // Refit when the preview changes width (window, iPad rotation, switching to this tab).
  let lastW = 0;
  new ResizeObserver(() => { const w = $('#gcPreview').clientWidth; if (w && Math.abs(w - lastW) > 8) { lastW = w; redrawSoon(); } }).observe($('#gcPreview'));
  rowsUi();
  loadFont(st.o.font).then(() => draw());
  draw();
}
