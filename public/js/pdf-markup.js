// PDF markup editor: text box (rich text per character), highlight text, freehand draw, line, arrow, rectangle;
// adjustable width; Shift keeps lines at 45° steps and rectangles square. Marks are kept as data (page + points in PDF
// units), so a draft is a small JSON list. "Download" writes the marks into a copy of the PDF with pdf-lib; the
// original bytes are never changed. Text boxes are drawn by the browser (correct Thai shaping) and embedded as PNG.
// Libraries load only when the editor opens: pdf.js (pages + text layer) and pdf-lib (writing).
// pdf.js 4.4 needs Promise.withResolvers (Safari 17.4). Older Safari (iPad on iPadOS 15.4–17.3, v2.13) gets the
// legacy build of the same version, which brings its own polyfills; cdnjs has no legacy build, so it comes from jsDelivr.
// Tools sit in one bar on top of the pages (also in full screen).
// Zoom: Ctrl/⌘ + mouse wheel, trackpad or finger pinch, or the − / + buttons. Pages are drawn only while near the
// visible area, so long files and high zoom stay inside iPad Safari's canvas memory limit.
import { normHex, pairHex } from './hex-color.js';
import { addFontFile, fontStack, loadUserFonts, siteFont, textWriter } from './pdf-realtext.js';
import { damagedThai, madeByCanva, pageParagraphs } from './pdf-text.js';
// pdf-redact.js (Edit text) and pdf-ocr.js (scanned pages) load only when used: the Feedback site leaves both out.
import { ICON, clampZoom, floatBar, fullScreen, iconBtn, pinchZoom, viewBar, zoomAround } from './view-tools.js';

const PDFJS_BASE = Promise.withResolvers ? 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/' : 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/legacy/build/';
const PDFJS = `${PDFJS_BASE}pdf.min.mjs`;
const PDFJS_WORKER = `${PDFJS_BASE}pdf.worker.min.mjs`;
const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
// Size: up to 100 MB; above 12 MB the page warns that iPad Safari may run short of memory and saving is slow
// (decided 11 Nov 2026; was a 12 MB limit). The Feedback site passes its own maxBytes (12 MB, its upload limit).
export const WARN_BYTES = 12 * 1024 * 1024;
export const MAX_BYTES = 100 * 1024 * 1024;
// Text box default (decided 20 Oct): LINE Seed Sans TH, 11 pt, #990000, clear background, no border.
export const TEXT = { font: 'LINE Seed Sans TH', size: 11, color: '#990000', lineHeight: 1.35 };
// Fonts a text box can use (js/pdf-realtext.js FACES: files and the fallback for letters a font lacks). All but
// Georgia are written into the PDF as real text; Georgia boxes stay a picture. EucrosiaUPC and Times New Roman are
// the computer's own fonts on screen.
export const FONTS = ['LINE Seed Sans TH', 'Noto Sans Thai', 'Sarabun', 'TH Sarabun New', 'TH SarabunPSK', 'EucrosiaUPC', 'Angsana New', 'Times New Roman', 'Arial', 'Georgia'];
const fontOf = (m) => m.font || TEXT.font; // text boxes from v2.12 drafts have no font: the old default
const HIGHLIGHT = '#ffe14d';
const HL_OPACITY = 0.45; // highlights from older drafts have no colour or opacity: these
const MAX_CANVAS_PX = 8e6; // pixels per page canvas (iPad Safari: 16.7M per canvas, ~384 MB for all canvases)
// Typed arrows: the text before the caret is replaced when ">" is typed. "—>" is "-->" after iPad smart punctuation.
const RESET_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/></svg>';
const ARROWS = { '-->': '→', '==>': '➜', '—>': '→' };
const TOOLS = [
  ['select', 'Select', 'เลือก'], ['edit', 'Edit text', 'แก้ข้อความ'], ['text', 'Text box', 'กล่องข้อความ'], ['highlight', 'Highlight', 'ไฮไลต์'],
  ['pen', 'Draw', 'วาด'], ['line', 'Line', 'เส้น'], ['arrow', 'Arrow', 'ลูกศร'], ['rect', 'Rectangle', 'สี่เหลี่ยม'],
];
// Text formats: [execCommand name, run key, button face, English, Thai]
const FMT = [
  ['bold', 'b', 'B', 'Bold (Ctrl+B)', 'ตัวหนา'], ['italic', 'i', 'I', 'Italic (Ctrl+I)', 'ตัวเอียง'],
  ['underline', 'u', 'U', 'Underline (Ctrl+U)', 'ขีดเส้นใต้'], ['strikeThrough', 's', 'S', 'Strikethrough (Ctrl+Shift+X)', 'ขีดฆ่า'],
  ['hilite', 'hl', ICON.hl, 'Highlight', 'ไฮไลต์'],
];
const KEY = Object.fromEntries(FMT.map(([cmd, k]) => [cmd, k]));
// Alignment of a text box's lines (within the box's width, or its longest line)
const alignIcon = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="${d}"/></svg>`;
// Bullets and numbering: "• " or "1. " at the start of each line (plain characters, so the PDF keeps them as text).
const listIcon = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${d}</svg>`;
const LISTS = [
  ['bullet', listIcon('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>'), 'Bullets', 'สัญลักษณ์แสดงหัวข้อย่อย'],
  ['number', listIcon('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4.5h1.2V9M3.6 9h2.6" stroke-width="1.5"/><path d="M3.7 14.3c.3-.6 1.9-.8 2 .3.1.9-2.3 2-2.3 3.4h2.5" stroke-width="1.5"/>'), 'Numbering', 'ลำดับเลข'],
];
const LIST_MARK = /^(• |(\d+)\. )/;
const ALIGN = [
  ['left', alignIcon('M4 6h16M4 10h10M4 14h16M4 18h10'), 'Align left', 'ชิดซ้าย'],
  ['center', alignIcon('M4 6h16M7 10h10M4 14h16M7 18h10'), 'Centre', 'กึ่งกลาง'],
  ['right', alignIcon('M4 6h16M10 10h10M4 14h16M10 18h10'), 'Align right', 'ชิดขวา'],
];

let libs = null;
export function loadLibs() { // pdf.js and pdf-lib, loaded once (also used by js/pdf-merge.js)
  return libs || (libs = Promise.all([
    import(PDFJS).then((m) => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; }),
    new Promise((res, rej) => {
      if (window.PDFLib) { res(window.PDFLib); return; }
      const s = document.createElement('script'); s.src = PDFLIB; s.crossOrigin = 'anonymous';
      s.onload = () => res(window.PDFLib); s.onerror = () => { libs = null; rej(new Error('Could not load the PDF tools. Try again.')); };
      document.head.append(s);
    }),
    document.fonts.load(`${TEXT.size}px "${TEXT.font}"`),
  ]));
}
// Regular, bold and italic faces of each font, so the screen and the exported PNG use the same faces.
const loadFonts = (fonts) => Promise.all([...new Set(fonts)].flatMap((f) => ['', 'bold ', 'italic ', 'italic bold ']
  .map((v) => document.fonts.load(`${v}${TEXT.size}px "${f}"`).catch(() => {}))));

// ---------- colours and rich-text runs ----------
const rgbOf = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => `rgba(${rgbOf(h).join(', ')}, ${a})`;
function parseColor(s) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/i.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return { hex: `#${[m[1], m[2], m[3]].map((v) => Math.round(+v).toString(16).padStart(2, '0')).join('')}`, a };
  }
  const h = normHex(s); return h ? { hex: h, a: 1 } : null;
}
// A text box's content: runs [{ t, b?, i?, u?, s?, hl?, ha? }] (bold, italic, underline, strike, highlight colour and
// opacity). m.text is kept as the plain text. Boxes from older drafts have only text: one plain run.
const runsOf = (m) => m.runs || [{ t: m.text || '' }];
const styleKey = ({ t, ...s }) => JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k]]));
function mergeRuns(rs) {
  const out = [];
  rs.forEach((r) => { const l = out.at(-1); if (l && styleKey(l) === styleKey(r)) l.t += r.t; else if (r.t) out.push({ ...r }); });
  return out.length ? out : [{ t: '' }];
}
// Characters [a, z) of the runs get `patch`.
function styleRange(runs, a, z, patch) {
  const out = []; let i = 0;
  runs.forEach((r) => {
    const e = i + r.t.length;
    [[i, a], [a, z], [z, e]].forEach(([s0, s1]) => {
      const lo = Math.max(s0, i); const hi = Math.min(s1, e);
      if (hi > lo) out.push({ ...r, ...(lo >= a && hi <= z ? patch : {}), t: r.t.slice(lo - i, hi - i) });
    });
    i = e;
  });
  return mergeRuns(out);
}
// One run as DOM: the same elements the browser's own Bold/Italic/... commands make, so they can undo them.
function runNode(r) {
  let n = document.createTextNode(r.t);
  const wrap = (tag) => { const e = document.createElement(tag); e.append(n); n = e; return e; };
  if (r.c) wrap('span').style.color = r.c; // a colour of its own (Markup typing in Edit text)
  if (r.hl) wrap('span').style.backgroundColor = rgba(r.hl, r.ha ?? HL_OPACITY);
  if (r.s) wrap('strike');
  if (r.u) wrap('u');
  if (r.i) wrap('i');
  if (r.b) wrap('b');
  return n;
}
// The style a text node shows inside a box. Underline, strike and background are not inherited, so the ancestors are read.
function styleOf(el, box) {
  const r = {}; const cs = getComputedStyle(el);
  if (cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600) r.b = 1;
  if (el !== box && cs.color !== getComputedStyle(box).color) { const p = parseColor(cs.color); if (p) r.c = p.hex; } // not the box's own colour
  if (/italic|oblique/.test(cs.fontStyle)) r.i = 1;
  let bg = false;
  for (let e = el; e && e !== box; e = e.parentElement) {
    const c = getComputedStyle(e); const d = `${c.textDecorationLine || c.webkitTextDecorationLine || c.textDecoration || ''}`;
    if (d.includes('underline')) r.u = 1;
    if (d.includes('line-through')) r.s = 1;
    if (!bg && e.style.backgroundColor) { // the nearest background set on an element wins ("transparent" = removed)
      bg = true; const p = parseColor(e.style.backgroundColor);
      if (p && p.a > 0) { r.hl = p.hex; r.ha = Math.round(p.a * 100) / 100; }
    }
  }
  return r;
}
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
// The edited box back to runs. A run never splits a Thai vowel or tone mark from its letter (each grapheme takes the
// style of its first character), so the exported PNG shapes Thai the same way as the screen.
function readRuns(box) {
  const chars = [];
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === 3) { const s = styleOf(n.parentElement, box); for (const ch of n.data.replace(/ /g, ' ')) chars.push([ch, s]); }
    else if (n.nodeName === 'BR') chars.push(['\n', styleOf(n.parentElement, box)]);
    else if (/^(DIV|P)$/.test(n.nodeName) && chars.length && chars.at(-1)[0] !== '\n') chars.push(['\n', {}]);
  }
  while (chars.length && chars.at(-1)[0] === '\n') chars.pop();
  const text = chars.map((c) => c[0]).join('');
  const out = []; let i = 0;
  for (const g of seg ? Array.from(seg.segment(text), (x) => x.segment) : [...text]) { out.push({ ...chars[i][1], t: g }); i += [...g].length; }
  return mergeRuns(out);
}
function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const c = document.caretPositionFromPoint(x, y);
    if (c && c.offsetNode) { const r = document.createRange(); r.setStart(c.offsetNode, c.offset); r.collapse(true); return r; }
  }
  return document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
}
// Character offsets inside an open text box, counted as readRuns counts them (a <br> is one character).
function boxOffset(box, node, off) {
  let end = null; // a position after an element's last child: count everything inside it
  if (node.nodeType !== 3) { const c = node.childNodes[off]; if (c) { node = c; off = 0; } else end = node; }
  let k = 0; let inside = false;
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (end) { if (end.contains(n)) inside = true; else if (inside) return k; }
    else if (n === node) return k + (n.nodeType === 3 ? off : 0);
    if (n.nodeType === 3) k += n.data.length; else if (n.nodeName === 'BR') k += 1;
  }
  return k;
}
function boxPos(box, k) {
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let last = null;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.nodeType === 3) { if (k <= n.data.length) return [n, k]; k -= n.data.length; last = [n, n.data.length]; }
    else if (n.nodeName === 'BR') { if (k === 0) return [n.parentNode, [...n.parentNode.childNodes].indexOf(n)]; k -= 1; last = [n.parentNode, [...n.parentNode.childNodes].indexOf(n) + 1]; }
  }
  return last || [box, box.childNodes.length];
}
// Runs with characters [a, z) replaced by str (in the style of the text around it, without highlight or lines).
function spliceRuns(runs, a, z, str) {
  const chars = runs.flatMap((r) => r.t.split('').map((ch) => ({ ...r, t: ch })));
  const near = chars[a] || chars[a - 1] || {}; const { hl, ha, u, s, ...st } = near;
  chars.splice(a, z - a, ...str.split('').map((ch) => ({ ...st, t: ch })));
  return mergeRuns(chars);
}
const exec = (cmd, v = null) => { try { return document.execCommand(cmd, false, v); } catch { return false; } };

// Opens the editor in `root`. bytes: the PDF (ArrayBuffer); name: file name; draft: saved marks or null.
// t(en, th) translates labels. Resolves an editor handle { marks(), isDirty(), exportPdf() }.
// defaults (admin console, v2.13): { size, textColor, shapeColor, font } of new text boxes and shapes; TEXT where not given.
// editText: the Edit text tool (and its OCR of scanned or damaged pages, when ocr is on). Feedback turns both off.
export async function openPdfEditor(root, { bytes, name, draft = null, t = (en) => en, onDraft = () => {}, onStatus = () => {}, defaults = {}, maxBytes = MAX_BYTES, editText = true, ocr = true, fonts = FONTS }) {
  const textSize = defaults.size || TEXT.size;
  // fonts: the font menu (Feedback shows four); fonts added from this computer before come after them
  const userFonts = (await loadUserFonts()).filter((f) => !fonts.includes(f));
  const fontOptions = (sel) => [...fonts, ...userFonts].map((f) => `<option ${f === sel ? 'selected' : ''}>${f}</option>`).join('');
  const font0 = fonts.includes(defaults.font) || userFonts.includes(defaults.font) ? defaults.font : fonts.includes(TEXT.font) ? TEXT.font : fonts[0];
  const limit = Math.round(maxBytes / 1048576);
  if (bytes.byteLength > maxBytes) throw new Error(t(`This file is over ${limit} MB, so it cannot be marked. Open it in Drive instead.`, `ไฟล์ใหญ่เกิน ${limit} MB จึงทำเครื่องหมายไม่ได้ กรุณาเปิดใน Drive`));
  root.innerHTML = `<div class="mk" data-tool="select"><div class="mk-bar" role="toolbar" aria-label="${t('PDF tools', 'เครื่องมือ PDF')}">
      <div class="mk-tools">${TOOLS.filter(([k]) => editText || k !== 'edit').map(([k, en, th]) => `<button type="button" data-tool="${k}" aria-pressed="false">${t(en, th)}</button>`).join('')}</div>
      <div class="mk-g mk-g-text">
        <div class="mk-fmt" role="group" aria-label="${t('Text format', 'รูปแบบตัวอักษร')}">${FMT.map(([cmd, , face, en, th]) => `<button type="button" data-fmt="${cmd}" aria-pressed="false" title="${t(en, th)}" aria-label="${t(en, th)}">${face}</button>`).join('')}</div>
        <div class="mk-fmt mk-list" role="group" aria-label="${t('Lists', 'รายการ')}">${LISTS.map(([v, face, en, th]) => `<button type="button" data-list="${v}" title="${t(en, th)}" aria-label="${t(en, th)}">${face}</button>`).join('')}</div>
        <div class="mk-fmt mk-align" role="group" aria-label="${t('Alignment', 'การจัดแนว')}">${ALIGN.map(([v, face, en, th]) => `<button type="button" data-align="${v}" aria-pressed="false" title="${t(en, th)}" aria-label="${t(en, th)}">${face}</button>`).join('')}</div>
        <label class="mk-ctl">${t('Font', 'แบบอักษร')} <select id="mk-f">${fontOptions(font0)}</select></label><button type="button" class="mk-addf" id="mk-addf" title="${t('Add a font from this computer (.ttf, .otf, .ttc)', 'เพิ่มแบบอักษรจากเครื่องนี้ (.ttf, .otf, .ttc)')}" aria-label="${t('Add a font from this computer', 'เพิ่มแบบอักษรจากเครื่องนี้')}">＋</button><input type="file" id="mk-ffile" accept=".ttf,.otf,.ttc,font/ttf,font/otf,font/collection" multiple hidden>
        <label class="mk-ctl">${t('Text size', 'ขนาดตัวอักษร')} <span><input type="number" id="mk-s" min="6" max="72" step="1" value="${textSize}"> pt</span></label>
      </div>
      <div class="mk-g mk-g-shape"><label class="mk-ctl">${t('Width', 'ความหนา')} <span><input type="range" id="mk-w" min="1" max="12" step="0.5" value="2"><output id="mk-wv">2</output></span></label></div>
      <div class="mk-g mk-g-color"><label class="mk-ctl">${t('Colour', 'สี')} <span><input type="color" id="mk-c" value="${defaults.shapeColor || TEXT.color}"></span></label></div>
      <div class="mk-g mk-g-hl">
        <button type="button" id="mk-hl" class="mk-hl-btn">${t('Highlight selection', 'ไฮไลต์ข้อความที่เลือก')}</button>
        <label class="mk-ctl">${t('Highlight colour', 'สีไฮไลต์')} <span><input type="color" id="mk-hc" value="${HIGHLIGHT}"></span></label>
        <label class="mk-ctl">${t('Opacity', 'ความทึบ')} <span><input type="range" id="mk-o" min="10" max="100" step="5" value="${HL_OPACITY * 100}"><output id="mk-ov">${HL_OPACITY * 100}%</output></span></label>
      </div>
      <span class="mk-grow"></span>
      ${viewBar('mk', t, { open: true, help: true })}${iconBtn('mk-reset', t('Reset edits: remove every mark (Undo brings them back)', 'ล้างการแก้ไข: ลบเครื่องหมายทั้งหมด (เลิกทำเพื่อนำกลับมา)'), RESET_ICON)}
      <span class="mk-emode" role="group" aria-label="${t('New text in Edit text', 'ข้อความใหม่ในการแก้ข้อความ')}"><button type="button" data-emode="edit" title="${t('New text takes the format of the paragraph', 'ข้อความใหม่ใช้รูปแบบเดิมของย่อหน้า')}">${t('Edit', 'แก้ไข')}</button><button type="button" data-emode="markup" title="${t('New text takes your text colour, so the changes stand out', 'ข้อความใหม่ใช้สีข้อความของคุณ ให้เห็นการแก้ไขชัด')}">${t('Markup', 'มาร์กอัป')}</button></span>
      <p class="mk-caution" role="note"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg><span>${t('Edit text: the text below an edit does not move. A longer edit can overlap it (amber outline); a shorter one leaves a gap.', 'แก้ข้อความ: ข้อความด้านล่างจะไม่เลื่อนตาม ถ้าแก้ให้ยาวขึ้นอาจทับข้อความด้านล่าง (กรอบสีส้ม) ถ้าสั้นลงจะเหลือช่องว่าง')}</span></p>
    </div><div class="mk-pages" id="mk-pages"><p class="mk-wait">${t('Loading…', 'กำลังโหลด…')}</p></div></div>`;
  const [pdfjs, PDFLib] = await loadLibs();
  await loadFonts([font0, ...(draft || []).filter((m) => m.type === 'text').map(fontOf)]);
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const canva = madeByCanva(doc); // Canva PDFs can lose tone marks: such pages are read by OCR for Edit text
  const mk = root.querySelector('.mk');
  const pagesEl = root.querySelector('#mk-pages');
  const $ = (s) => root.querySelector(s);
  pagesEl.innerHTML = '';
  const syncC = pairHex($('#mk-c')); const syncHC = pairHex($('#mk-hc'));
  floatBar(mk, $('.mk-bar'));

  // Two current colours (v2.13): one for text boxes, one for shapes; the colour box shows the one in use.
  // Highlights have their own colour and opacity.
  const st = {
    tool: 'select', width: 2, textColor: defaults.textColor || TEXT.color, shapeColor: defaults.shapeColor || TEXT.color,
    hlColor: HIGHLIGHT, hlOpacity: HL_OPACITY, font: font0, size: textSize, zoom: 1,
    marks: draft ? structuredClone(draft) : [], undo: [], redo: [], sel: null, dirty: false,
    markup: (() => { try { return localStorage.getItem('mk-edit-markup') === '1'; } catch { return false; } })(), // Edit text: Markup or Edit
  };
  const pages = []; // { el, canvas, hls, svg, boxes, text, page, base, fit, scale, w, h, gen, done, near, task }
  const avail = () => Math.max(280, pagesEl.clientWidth - 32);
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  const size = (p) => {
    p.el.style.width = `${p.w * p.scale}px`; p.el.style.height = `${p.h * p.scale}px`;
    p.el.style.setProperty('--scale-factor', p.scale);
  };

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const fit = Math.min(1.6, avail() / base.width);
    const el = document.createElement('div');
    el.className = 'mk-page'; el.dataset.page = n - 1;
    const canvas = document.createElement('canvas');
    const text = document.createElement('div'); text.className = 'textLayer';
    const mkSvg = (cls) => { const s = svgEl('svg', { viewBox: `0 0 ${base.width} ${base.height}` }); s.classList.add(cls); return s; };
    const hls = mkSvg('mk-hls'); const svg = mkSvg('mk-svg');
    const boxes = document.createElement('div'); boxes.className = 'mk-boxes';
    el.append(canvas, hls, text, svg, boxes);
    pagesEl.append(el);
    const p = { el, canvas, hls, svg, boxes, text, page, base, fit, scale: fit, w: base.width, h: base.height, gen: 0, done: null, near: false, task: null };
    size(p); pages.push(p);
  }

  // ---------- drawing pages (only near the visible area) ----------
  let queue = Promise.resolve();
  async function renderPage(p) {
    if (!p.near || p.done === p.scale) return;
    const gen = ++p.gen; const scale = p.scale;
    const vp = p.page.getViewport({ scale });
    const k = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PX / (vp.width * vp.height)));
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width * k); c.height = Math.floor(vp.height * k);
    p.task = p.page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: k !== 1 ? [k, 0, 0, k, 0, 0] : null });
    try { await p.task.promise; } catch { c.width = c.height = 0; return; } // cancelled
    if (gen !== p.gen) { c.width = c.height = 0; return; }
    const old = p.canvas; p.canvas = c; old.replaceWith(c); old.width = old.height = 0;
    p.done = scale;
    try {
      const tl = document.createElement('div'); tl.className = 'textLayer';
      await new pdfjs.TextLayer({ textContentSource: p.page.streamTextContent(), container: tl, viewport: vp }).render();
      if (gen === p.gen) { p.text.replaceWith(tl); p.text = tl; }
    } catch { /* no text layer: highlight is unavailable here */ }
  }
  const want = (p) => { queue = queue.then(() => renderPage(p)).catch(() => {}); };
  const drop = (p) => { p.gen++; p.task?.cancel(); p.canvas.width = p.canvas.height = 0; p.done = null; };
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    const p = pages[+en.target.dataset.page]; p.near = en.isIntersecting;
    if (p.near) want(p); else drop(p);
  }), { root: pagesEl, rootMargin: '150% 0px' });
  pages.forEach((p) => io.observe(p.el));
  let renderTimer = 0;
  const rerender = () => { clearTimeout(renderTimer); renderTimer = setTimeout(() => pages.forEach((p) => p.near && want(p)), 160); };

  // ---------- marks ----------
  // Every mark: { id, page, type, ...geometry in page units (1 = 1/72 in, origin top-left), color, width }.
  // pen: pts [[x,y]…]; line/arrow: a [x,y], b [x,y]; rect: x, y, w, h; highlight: rects [[x,y,w,h]…], color, opacity;
  // text: x, y, text, runs, color, size, font.
  const uid = () => Math.random().toString(36).slice(2, 10);
  const snapshot = () => { st.undo.push(JSON.stringify(st.marks)); if (st.undo.length > 100) st.undo.shift(); st.redo = []; };
  const changed = () => { st.dirty = true; onDraft(st.marks); paint(); };
  const selMark = () => st.marks.find((x) => x.id === st.sel);
  const editingBox = () => root.querySelector('.mk-box.editing');
  // Open arrow head like ←: two strokes from the tip, 30° either side, drawn with the line's own width and round ends.
  const arrowHead = (a, b, w) => {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const L = 7 + w * 2.6; const s = Math.PI / 6;
    return [b, [b[0] - L * Math.cos(ang - s), b[1] - L * Math.sin(ang - s)], [b[0] - L * Math.cos(ang + s), b[1] - L * Math.sin(ang + s)]];
  };
  function drawMark(m, g) {
    const stroke = { stroke: m.color, 'stroke-width': m.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (m.type === 'pen') g.append(svgEl('path', { d: inkPath(m), fill: m.color }));
    if (m.type === 'line' || m.type === 'arrow') g.append(svgEl('line', { ...stroke, x1: m.a[0], y1: m.a[1], x2: m.b[0], y2: m.b[1] }));
    if (m.type === 'arrow') { const [t, p1, p2] = arrowHead(m.a, m.b, m.width); g.append(svgEl('polyline', { ...stroke, points: [p1, t, p2].map((p) => p.join(',')).join(' ') })); }
    if (m.type === 'rect') g.append(svgEl('rect', { ...stroke, x: m.x, y: m.y, width: m.w, height: m.h }));
    if (m.type === 'highlight') m.rects.forEach(([x, y, w, h]) => g.append(svgEl('rect', { x, y, width: w, height: h, fill: m.color || HIGHLIGHT, 'fill-opacity': m.opacity ?? HL_OPACITY, class: 'mk-hl' })));
  }
  function paint() {
    pages.forEach((p, i) => {
      p.svg.replaceChildren(); p.hls.replaceChildren(); p.boxes.replaceChildren();
      st.marks.filter((m) => m.page === i).forEach((m) => {
        if (m.type === 'text') {
          const b = document.createElement('div');
          b.className = `mk-box${st.sel === m.id ? ' on' : ''}`; b.dataset.id = m.id;
          runsOf(m).forEach((r) => b.append(runNode(r)));
          b.style.cssText = `left:${m.x * p.scale}px;top:${m.y * p.scale}px;color:${m.color};font-size:${m.size * p.scale}px;font-family:${fontStack(fontOf(m))};line-height:${m.lh || TEXT.lineHeight}`
            + (m.wrap ? `;width:${m.wrap * p.scale}px;white-space:pre-wrap` : '') + (m.align ? `;text-align:${m.align}` : '');
          if (m.cover) { // an edited paragraph: the original is hidden under the page's own background colour
            const c = document.createElement('div'); c.className = 'mk-cover'; const [x, y, w, h] = m.cover.box;
            c.style.cssText = `left:${x * p.scale}px;top:${y * p.scale}px;width:${w * p.scale}px;height:${h * p.scale}px;background:${m.cover.bg}`;
            p.boxes.append(c);
          }
          p.boxes.append(b);
          if (m.cover) { // a PDF cannot move the text below down: say so when the edit needs more room than it had
            const over = b.offsetHeight > (m.cover.box[3] + m.size * 0.6) * p.scale;
            b.classList.toggle('mk-over', over); b.title = over ? 'Longer than the original: it may overlap the text below' : '';
          }
          return;
        }
        const g = svgEl('g', { 'data-id': m.id, class: `mk-mark${st.sel === m.id ? ' on' : ''}` });
        drawMark(m, g);
        // Highlights have their own layer, blended with multiply: the page takes the colour, the ink stays dark.
        (m.type === 'highlight' ? p.hls : p.svg).append(g);
      });
      // Select: a handle at the picked mark's lower-right corner resizes it (a text box: its text size).
      const s = st.tool === 'select' ? selMark() : null;
      if (s && s.page === i && s.type !== 'highlight') {
        const [x, y, w, h] = bbox(s, p); const hd = document.createElement('div'); hd.className = 'mk-handle';
        hd.style.cssText = `left:${(x + w) * p.scale + 4}px;top:${(y + h) * p.scale + 4}px`; p.boxes.append(hd);
      }
    });
    refreshBar();
  }

  // ---------- the tools rail ----------
  // Which controls show: text (text tool, a picked or open text box), highlight, shape, or none.
  function mode() {
    const m = selMark();
    if (st.tool === 'text' || st.tool === 'edit' || m?.type === 'text' || editingBox()) return 'text';
    if (st.tool === 'highlight' || m?.type === 'highlight') return 'highlight';
    if (m || ['pen', 'line', 'arrow', 'rect'].includes(st.tool)) return 'shape';
    return '';
  }
  // The colour box is about text while the Text box tool is on or a text box is picked, else about shapes.
  function textMode() { return st.tool === 'text' || st.tool === 'edit' || selMark()?.type === 'text'; }
  function refreshBar() {
    const m = selMark();
    mk.dataset.mode = mode();
    $('#mk-del').disabled = !st.sel;
    if (m?.type === 'text') { $('#mk-s').value = m.size; $('#mk-f').value = fontOf(m); } // the picked text box's size and font
    $('#mk-c').value = m && m.type !== 'highlight' && m.color ? m.color : textMode() ? st.textColor : st.shapeColor; syncC();
    $('#mk-hc').value = m?.type === 'highlight' ? m.color || HIGHLIGHT : st.hlColor; syncHC();
    const op = Math.round((m?.type === 'highlight' ? m.opacity ?? HL_OPACITY : st.hlOpacity) * 100);
    $('#mk-o').value = op; $('#mk-ov').textContent = `${op}%`;
    $('#mk-undo').disabled = !st.undo.length;
    $('#mk-redo').disabled = !st.redo.length;
    $('#mk-reset').disabled = !st.marks.length;
    updateFmt();
  }
  // Is style key k on every character of the selection in the open box (the caret's character when nothing is selected)?
  function selectionHas(ed, k) {
    const s = window.getSelection(); if (!s || !s.rangeCount) return false;
    const r = s.getRangeAt(0); if (!ed.contains(r.commonAncestorContainer)) return false;
    if (r.collapsed) { const n = r.startContainer; return !!styleOf(n.nodeType === 3 ? n.parentElement : n, ed)[k]; }
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT); let any = false;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!r.intersectsNode(n) || !n.data.length) continue;
      if ((n === r.endContainer && r.endOffset === 0) || (n === r.startContainer && r.startOffset === n.data.length)) continue;
      any = true; if (!styleOf(n.parentElement, ed)[k]) return false;
    }
    return any;
  }
  function updateFmt() {
    const ed = editingBox(); const m = !ed && selMark()?.type === 'text' ? selMark() : null;
    root.querySelectorAll('[data-fmt]').forEach((b) => {
      const k = KEY[b.dataset.fmt];
      b.setAttribute('aria-pressed', String(ed ? selectionHas(ed, k) : m ? runsOf(m).every((r) => r[k]) : false));
    });
    const a = ed ? st.marks.find((x) => x.id === ed.dataset.id) : m;
    root.querySelectorAll('[data-align]').forEach((b) => b.setAttribute('aria-pressed', String(!!a && (a.align || 'left') === b.dataset.align)));
  }
  // Bullets / Numbering: the lines the selection touches in the open box, or every line of the picked box. Pressed
  // again on lines that all have it, it is taken off; numbering counts 1, 2, 3 down the lines.
  function toggleList(kind) {
    const ed = editingBox(); const m = ed ? st.marks.find((x) => x.id === ed.dataset.id) : selMark()?.type === 'text' ? selMark() : null;
    if (!m) return;
    let runs = ed ? readRuns(ed) : runsOf(m); const text = runs.map((r) => r.t).join('');
    let a = 0; let z = text.length;
    const sel = getSelection(); const r = ed && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.getRangeAt(0) : null;
    if (r) { a = Math.min(text.length, boxOffset(ed, r.startContainer, r.startOffset)); z = Math.min(text.length, boxOffset(ed, r.endContainer, r.endOffset)); }
    const starts = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const lines = starts.filter((s0, i) => s0 <= z && (i + 1 < starts.length ? starts[i + 1] - 1 : text.length) >= a);
    const markOf = (s0) => text.slice(s0).match(LIST_MARK);
    const off = lines.every((s0) => (kind === 'bullet' ? markOf(s0)?.[1] === '• ' : !!markOf(s0)?.[2]));
    let n = 0; const edits = lines.map((s0) => [s0, markOf(s0)?.[0].length || 0, off ? '' : kind === 'bullet' ? '• ' : `${++n}. `]);
    const map = (x) => edits.reduce((y, [s0, len, add]) => (s0 + len <= x ? y + add.length - len : s0 < x ? y - (x - s0) + add.length : y), x);
    const a2 = map(a); const z2 = map(z);
    [...edits].reverse().forEach(([s0, len, add]) => { runs = spliceRuns(runs, s0, s0 + len, add); });
    if (!ed) { snapshot(); m.runs = runs; m.text = runs.map((x) => x.t).join(''); changed(); return; }
    ed.replaceChildren(...runs.map(runNode));
    const rr = document.createRange(); rr.setStart(...boxPos(ed, a2)); rr.setEnd(...boxPos(ed, z2)); sel.removeAllRanges(); sel.addRange(rr);
  }
  // Left / Centre / Right: the open box (it is saved when it closes) or the picked box.
  function align(v) {
    const ed = editingBox(); const m = ed ? st.marks.find((x) => x.id === ed.dataset.id) : selMark()?.type === 'text' ? selMark() : null;
    if (!m || (m.align || 'left') === v) return;
    if (!ed) snapshot(); // an open box took its snapshot when it opened
    if (v === 'left') delete m.align; else m.align = v;
    if (ed) { ed.style.textAlign = v; updateFmt(); } else changed();
  }
  // B / I / U / S / highlight: on the selected characters of the open box, or on the whole picked box.
  function format(cmd) {
    const ed = editingBox();
    if (ed) {
      if (cmd === 'hilite') {
        const on = selectionHas(ed, 'hl');
        exec('styleWithCSS', true); exec('hiliteColor', on ? 'transparent' : rgba(st.hlColor, st.hlOpacity)); exec('styleWithCSS', false);
      } else exec(cmd);
      updateFmt();
      return;
    }
    const m = selMark(); if (m?.type !== 'text') return;
    const k = KEY[cmd]; const runs = runsOf(m).map((r) => ({ ...r })); const all = runs.every((r) => r[k]);
    snapshot();
    runs.forEach((r) => {
      if (all) { delete r[k]; if (k === 'hl') delete r.ha; }
      else if (k === 'hl') { r.hl = st.hlColor; r.ha = st.hlOpacity; }
      else r[k] = 1;
    });
    m.runs = mergeRuns(runs); changed();
  }
  const fmtBar = $('.mk-fmt');
  // Keep the text selection and the focus in the box while a format button is pressed (mouse, touch, Pencil).
  fmtBar.addEventListener('pointerdown', (e) => e.preventDefault());
  fmtBar.addEventListener('mousedown', (e) => e.preventDefault());
  fmtBar.addEventListener('click', (e) => { const b = e.target.closest('[data-fmt]'); if (b) format(b.dataset.fmt); });
  const listBar = $('.mk-list');
  listBar.addEventListener('pointerdown', (e) => e.preventDefault());
  listBar.addEventListener('mousedown', (e) => e.preventDefault());
  listBar.addEventListener('click', (e) => { const b = e.target.closest('[data-list]'); if (b) toggleList(b.dataset.list); });
  const alignBar = $('.mk-align');
  alignBar.addEventListener('pointerdown', (e) => e.preventDefault());
  alignBar.addEventListener('mousedown', (e) => e.preventDefault());
  alignBar.addEventListener('click', (e) => { const b = e.target.closest('[data-align]'); if (b) align(b.dataset.align); });
  const onSel = () => { if (!root.isConnected) { document.removeEventListener('selectionchange', onSel); return; } if (editingBox()) { updateFmt(); caretInView(); } };
  // iPad: the on-screen keyboard covers the lower part of the screen. While a text box is open, the pages scroll so the
  // caret's line stays between the toolbar and the keyboard; room is added below the last page so a box near the end
  // can come up too.
  let viewFrame = 0;
  function caretInView() {
    if (viewFrame) return;
    viewFrame = requestAnimationFrame(() => {
      viewFrame = 0; const vv = window.visualViewport; const ed = editingBox();
      const kb = vv && ed ? Math.max(0, document.documentElement.clientHeight - vv.height) : 0;
      if (kb < 80) { pagesEl.style.paddingBottom = ''; return; } // no keyboard
      pagesEl.style.paddingBottom = `${kb + 16}px`;
      const s = getSelection(); let r = s.rangeCount && ed.contains(s.anchorNode) ? s.getRangeAt(0).getBoundingClientRect() : null;
      if (!r || (!r.width && !r.height)) r = ed.getBoundingClientRect();
      const top = Math.max(vv.offsetTop, $('.mk-bar').getBoundingClientRect().bottom) + 8; const bottom = vv.offsetTop + vv.height - 16;
      if (r.bottom > bottom) pagesEl.scrollTop += Math.min(r.bottom - bottom, r.top - top);
      else if (r.top < top) pagesEl.scrollTop -= top - r.top;
    });
  }
  window.visualViewport?.addEventListener('resize', caretInView);
  document.addEventListener('selectionchange', onSel);

  const setTool = (k) => {
    editingBox()?.blur();
    st.tool = k;
    root.querySelectorAll('button[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === k)));
    mk.dataset.tool = k;
    if (k !== 'select') st.sel = null;
    paint();
  };
  $('.mk-tools').onclick = (e) => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); };
  // Edit text: Edit (new text in the paragraph's own format) or Markup (new text in your text colour); kept in this browser
  const showEmode = () => root.querySelectorAll('[data-emode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.emode === 'markup') === st.markup)));
  root.querySelector('.mk-emode').onclick = (e) => { const b = e.target.closest('[data-emode]'); if (!b) return; st.markup = b.dataset.emode === 'markup'; try { localStorage.setItem('mk-edit-markup', st.markup ? '1' : '0'); } catch { /* not kept */ } showEmode(); };
  root.querySelector('.mk-emode').addEventListener('pointerdown', (e) => e.preventDefault()); // keep the caret in the edit
  showEmode();
  // A slider or colour drag on a picked mark is one undo step.
  let tweakId = null;
  let menuKeys = () => false; // Escape closes the hold menu first (set with the menu below)
  const tweak = (m, f) => { if (tweakId !== m.id) { snapshot(); tweakId = m.id; } f(m); changed(); };
  ['#mk-w', '#mk-c', '#mk-hc', '#mk-o'].forEach((s) => $(s).addEventListener('change', () => { tweakId = null; }));
  $('#mk-w').oninput = (e) => {
    st.width = +e.target.value; $('#mk-wv').textContent = e.target.value;
    const m = selMark(); if (m && m.width) tweak(m, (x) => { x.width = st.width; });
  };
  // Text size (pt): the picked text box, and every new one after it.
  $('#mk-s').onchange = (e) => {
    const v = Math.min(72, Math.max(6, Math.round(+e.target.value) || textSize));
    e.target.value = v; st.size = v;
    const m = selMark();
    if (m?.type === 'text' && m.size !== v) { snapshot(); m.size = v; changed(); }
  };
  $('#mk-c').oninput = (e) => {
    const v = e.target.value;
    if (textMode()) st.textColor = v; else st.shapeColor = v;
    const m = selMark(); if (m && m.type !== 'highlight') tweak(m, (x) => { x.color = v; });
  };
  // Highlight colour and opacity: the picked highlight, and every new highlight (also inside text boxes).
  $('#mk-hc').oninput = (e) => {
    st.hlColor = e.target.value;
    const m = selMark(); if (m?.type === 'highlight') tweak(m, (x) => { x.color = st.hlColor; });
  };
  $('#mk-o').oninput = (e) => {
    st.hlOpacity = +e.target.value / 100; $('#mk-ov').textContent = `${e.target.value}%`;
    const m = selMark(); if (m?.type === 'highlight') tweak(m, (x) => { x.opacity = st.hlOpacity; });
  };
  // Font: the picked text box, and every new one after it.
  // "Add a font from this computer": .ttf/.otf files, kept in this browser only; a family's bold and italic files too.
  $('#mk-addf').onclick = () => $('#mk-ffile').click();
  $('#mk-ffile').onchange = async (e) => {
    const files = [...e.target.files]; e.target.value = ''; let last = null;
    for (const f of files) {
      try {
        const r = await addFontFile(f); last = r.family;
        if (r.site) onStatus(t(`${r.family} is already one of the site's fonts.`, `${r.family} มีอยู่ในเว็บแล้ว`));
        else { if (!fonts.includes(r.family) && !userFonts.includes(r.family)) userFonts.push(r.family); onStatus(t(`Font added: ${r.family} (kept in this browser only)`, `เพิ่มแบบอักษรแล้ว: ${r.family} (เก็บไว้ในเบราว์เซอร์นี้เท่านั้น)`)); }
      } catch (err) { onStatus(err.message); }
    }
    $('#mk-f').innerHTML = fontOptions(last || st.font);
    if (last) $('#mk-f').dispatchEvent(new Event('change'));
  };
  $('#mk-f').onchange = async (e) => {
    st.font = e.target.value;
    await loadFonts([st.font]);
    const m = selMark();
    if (m?.type === 'text' && fontOf(m) !== st.font) { snapshot(); m.font = st.font; changed(); }
  };
  const undo = () => { editingBox()?.blur(); if (!st.undo.length) return; st.redo.push(JSON.stringify(st.marks)); st.marks = JSON.parse(st.undo.pop()); st.sel = null; changed(); };
  const redo = () => { editingBox()?.blur(); if (!st.redo.length) return; st.undo.push(JSON.stringify(st.marks)); st.marks = JSON.parse(st.redo.pop()); st.sel = null; changed(); };
  const del = () => { editingBox()?.blur(); if (!st.sel) return; snapshot(); st.marks = st.marks.filter((m) => m.id !== st.sel); st.sel = null; changed(); };
  // Reset edits (from TUSUFinanceFeedback v2.16): every mark goes in one step; Undo brings them back.
  const reset = () => { editingBox()?.blur(); if (!st.marks.length) return; snapshot(); st.marks = []; st.sel = null; changed(); };
  $('#mk-undo').onclick = undo; $('#mk-redo').onclick = redo; $('#mk-del').onclick = del; $('#mk-reset').onclick = reset;

  // ---------- zoom ----------
  // z: zoom against "fit to width"; (cx, cy): the screen point that stays put (the cursor or the pinch centre).
  function zoomTo(z, cx, cy) {
    z = clampZoom(z); if (z === st.zoom) return;
    editingBox()?.blur();
    const k = z / st.zoom; st.zoom = z;
    zoomAround(pagesEl, k, cx, cy, () => { pages.forEach((p) => { p.scale = p.fit * z; size(p); }); paint(); });
    $('#mk-zfit').textContent = `${Math.round(z * 100)}%`;
    rerender();
  }
  // Fit to width again after the editor changes size (full screen, iPad rotation, window resize).
  function refit() {
    const a = avail(); const top = pagesEl.scrollTop / Math.max(1, pagesEl.scrollHeight);
    let moved = false;
    pages.forEach((p) => { const f = Math.min(1.6, a / p.base.width); if (Math.abs(f - p.fit) > 0.005) { p.fit = f; p.scale = f * st.zoom; size(p); moved = true; } });
    if (!moved) return;
    paint(); pagesEl.scrollTop = top * pagesEl.scrollHeight; rerender();
  }
  let fitTimer = 0;
  new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(refit, 120); }).observe(pagesEl);
  $('#mk-zin').onclick = () => zoomTo(st.zoom * 1.25);
  $('#mk-zout').onclick = () => zoomTo(st.zoom / 1.25);
  $('#mk-zfit').onclick = () => zoomTo(1);
  pinchZoom(pagesEl, () => st.zoom, zoomTo);

  // ---------- full screen (tools on top) ----------
  fullScreen(mk, 'mk', 'mk-full', t);

  const onKey = (e) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomTo(st.zoom * 1.25); }
    else if (mod && e.key === '-') { e.preventDefault(); zoomTo(st.zoom / 1.25); }
    else if (mod && e.key === '0') { e.preventDefault(); zoomTo(1); }
    else if (mod && st.sel && selMark()?.type === 'text' && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault(); format({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
    }
    else if (e.key === 'Delete' || e.key === 'Backspace') { if (st.sel) { e.preventDefault(); del(); } }
    else if (e.key === 'Escape') { if (!menuKeys(e)) { st.sel = null; paint(); } }
  };
  document.addEventListener('keydown', onKey);

  // Pointer position on a page, in page units.
  const at = (p, e) => { const r = p.el.getBoundingClientRect(); return [(e.clientX - r.left) / p.scale, (e.clientY - r.top) / p.scale]; };
  // Shift: lines snap to 45° steps; rectangles become squares.
  const snap = (a, b, shift) => {
    if (!shift) return b;
    const dx = b[0] - a[0], dy = b[1] - a[1]; const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4); const len = Math.hypot(dx, dy);
    return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)];
  };

  // A mark's box in page units [x, y, w, h] (a text box is measured on screen).
  function bbox(m, p) {
    if (m.type === 'text') { const b = p?.boxes.querySelector(`[data-id="${m.id}"]`); return [m.x, m.y, (b?.offsetWidth || 0) / (p?.scale || 1), (b?.offsetHeight || 0) / (p?.scale || 1)]; }
    const pts = m.pts || (m.a ? [m.a, m.b] : m.rects ? m.rects.flatMap(([x, y, w, h]) => [[x, y], [x + w, y + h]]) : [[m.x, m.y], [m.x + m.w, m.y + m.h]]);
    const xs = pts.map((q) => q[0]); const ys = pts.map((q) => q[1]); const x = Math.min(...xs); const y = Math.min(...ys);
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
  }
  const shift = (m, dx, dy) => {
    if (m.pts) m.pts = m.pts.map(([x, y, ...pr]) => [x + dx, y + dy, ...pr]);
    if (m.a) { m.a = [m.a[0] + dx, m.a[1] + dy]; m.b = [m.b[0] + dx, m.b[1] + dy]; }
    if (m.rects) m.rects = m.rects.map(([x, y, w, h]) => [x + dx, y + dy, w, h]);
    if ('x' in m) { m.x += dx; m.y += dy; }
  };
  // Mark m becomes o (its copy when the resize began) scaled by f from point [ox, oy]; a text box changes its text size.
  function scaleMark(m, o, f, [ox, oy]) {
    const S = ([x, y, ...pr]) => [ox + (x - ox) * f, oy + (y - oy) * f, ...pr];
    if (o.pts) m.pts = o.pts.map(S);
    if (o.a) { m.a = S(o.a); m.b = S(o.b); }
    if (o.type === 'rect') { [m.x, m.y] = S([o.x, o.y]); m.w = o.w * f; m.h = o.h * f; }
    if (o.type === 'text') { m.size = Math.min(72, Math.max(6, Math.round(o.size * f * 2) / 2)); if (o.wrap) m.wrap = o.wrap * m.size / o.size; }
  }

  // Hold a picked mark (or right-click it) in Select: Copy, Duplicate, Delete. Hold the page after a Copy: Paste there.
  let clip = null; // the copied mark, as JSON
  let hold = null; // a press being held: { id, x, y, timer }
  const holdEnd = () => { if (hold) clearTimeout(hold.timer); hold = null; };
  const holdStart = (e, fn) => { holdEnd(); hold = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(() => { hold = null; fn(); }, 550) }; };
  let menu = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  function showMenu(cx, cy, p, m, at) {
    closeMenu();
    const items = m ? [['copy', t('Copy', 'คัดลอก')], ['dup', t('Duplicate', 'ทำซ้ำ')], ['del', t('Delete', 'ลบ')]] : clip ? [['paste', t('Paste', 'วาง')]] : [];
    if (!items.length) return;
    menu = document.createElement('div'); menu.className = 'mk-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map(([k, label]) => `<button type="button" role="menuitem" data-act="${k}">${label}</button>`).join('');
    mk.append(menu);
    const r = mk.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(cx - r.left - menu.offsetWidth / 2, r.width - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(cy - r.top - menu.offsetHeight - 16, r.height - menu.offsetHeight - 8))}px`;
    menu.onpointerdown = (e) => e.preventDefault();
    menu.onkeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); } };
    menu.onclick = (e) => {
      const k = e.target.closest('[data-act]')?.dataset.act; if (!k) return; closeMenu();
      const copyOf = (src) => { const c = JSON.parse(src); c.id = uid(); delete c.cover; return c; }; // a copied edit is new text
      if (k === 'copy') clip = JSON.stringify(m);
      else if (k === 'del') { st.sel = m.id; del(); }
      else if (k === 'dup') { snapshot(); const c = copyOf(JSON.stringify(m)); shift(c, 12, 12); st.marks.push(c); st.sel = c.id; changed(); }
      else if (k === 'paste') {
        snapshot(); const c = copyOf(clip); c.page = pages.indexOf(p);
        const [x, y] = c.type === 'text' ? [c.x, c.y] : bbox(c); shift(c, at[0] - x, at[1] - y);
        st.marks.push(c); st.sel = c.id; changed();
      }
    };
    menu.querySelector('button').focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  menuKeys = (e) => { if (menu && e.key === 'Escape') { e.preventDefault(); closeMenu(); return true; } return false; };
  pagesEl.addEventListener('scroll', closeMenu, { passive: true });
  pagesEl.addEventListener('contextmenu', (e) => {
    if (st.tool !== 'select' || editingBox()) return;
    const tgt = document.elementFromPoint(e.clientX, e.clientY) || e.target; // a long press: the mark pressed was redrawn when picked
    const pel = tgt.closest('.mk-page'); if (!pel) return;
    const p = pages[+pel.dataset.page]; const id = tgt.closest('[data-id]')?.dataset.id;
    if (!id && !clip) return;
    e.preventDefault(); if (drag) cancelDrag();
    if (id) { st.sel = id; paint(); }
    showMenu(e.clientX, e.clientY, p, id ? selMark() : null, at(p, e));
  });

  let drag = null;
  // A pen point: Apple Pencil adds its pressure (0–1); a mouse or finger draws at the set width.
  const inkPt = (pt, e) => (e.pointerType === 'pen' && e.pressure > 0 ? [pt[0], pt[1], Math.round(e.pressure * 100) / 100] : pt);
  // While drawing, only the stroke being drawn is redrawn, once per frame.
  let inkFrame = 0;
  const drawLive = (d) => {
    if (inkFrame) return;
    inkFrame = requestAnimationFrame(() => { inkFrame = 0; const g = d.p.svg.querySelector(`[data-id="${d.m.id}"]`); if (!g) { paint(); return; } g.replaceChildren(); drawMark(d.m, g); });
  };
  // A second finger during a finger stroke or move is a pinch: undo what the first finger started.
  const cancelDrag = () => { const d = drag; drag = null; if (!d) return; st.marks = JSON.parse(st.undo.pop()); paint(); };
  // Apple Pencil (from TUSUFinanceFeedback): once a pen has been used, finger touches no longer draw (a resting palm
  // would); switch to Select to scroll by finger. A touch during a pen stroke is the palm: it is ignored.
  let penSeen = false;
  const penOnly = () => penSeen && ['pen', 'line', 'arrow', 'rect'].includes(st.tool);
  // The ignored palm still made Safari select text or the whole page on a long press: its touch is cancelled too.
  pagesEl.addEventListener('touchstart', (e) => {
    if (drag?.ptype === 'pen' || (penOnly() && e.target.closest?.('.mk-page'))) e.preventDefault();
  }, { passive: false });
  // iPad: a focus made on pointerdown does not bring up the keyboard (for touch and Apple Pencil only a release counts
  // as the tap), so text boxes opened by touch or pen open on pointerup.
  let tapOpen = null; let tapOff = null;
  const openOnTap = (e, fn) => { if (e.pointerType === 'mouse') fn(); else tapOpen = { id: e.pointerId, fn }; };
  pagesEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') penSeen = true;
    if (drag) { if (e.pointerType === 'touch' && drag.ptype !== 'pen') cancelDrag(); return; }
    // iPad: a quick tap beside the pages (not a scroll, not a resting palm) switches to Select.
    if (e.pointerType !== 'mouse' && st.tool !== 'select' && !e.target.closest('.mk-page')) { tapOff = { id: e.pointerId, t: Date.now() }; return; }
    if (e.pointerType === 'touch' && penOnly()) return;
    if (e.button !== 0) return;
    // Inside the open text box the browser places the caret and selects text. A press anywhere else first saves it.
    const ed = editingBox();
    if (ed) { if (ed.contains(e.target)) return; ed.blur(); }
    tweakId = null;
    const tgt = ed ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
    const pel = tgt?.closest('.mk-page'); if (!pel) return;
    const p = pages[+pel.dataset.page]; const pt = at(p, e);
    if (st.tool === 'highlight') return; // the text layer selects; pointerup turns the selection into a highlight
    if (st.tool === 'edit') { // click a paragraph of the PDF to edit it in place
      const hit = tgt.closest('.mk-box'); const xy = [e.clientX, e.clientY];
      if (hit) { openOnTap(e, () => { st.sel = hit.dataset.id; paint(); editBox(p, hit.dataset.id, false, xy); }); e.preventDefault(); return; }
      e.preventDefault(); editAt(p, pt).catch((err) => console.error(err));
      return;
    }
    if (st.tool === 'text') {
      const hit = tgt.closest('.mk-box'); const xy = [e.clientX, e.clientY];
      if (hit) { openOnTap(e, () => { st.sel = hit.dataset.id; paint(); editBox(p, hit.dataset.id, false, xy); }); e.preventDefault(); return; }
      openOnTap(e, () => {
        snapshot();
        const m = { id: uid(), page: +pel.dataset.page, type: 'text', x: pt[0], y: pt[1] - st.size * 0.7, text: '', runs: [{ t: '' }], color: st.textColor, size: st.size, font: st.font };
        st.marks.push(m); st.sel = m.id; paint(); editBox(p, m.id, true);
      });
      e.preventDefault();
      return;
    }
    if (st.tool === 'select') {
      if (tgt.closest('.mk-handle') && selMark()) {
        const m = selMark(); snapshot();
        drag = { kind: 'resize', p, m, o: structuredClone(m), box: bbox(m, p), moved: false, id: e.pointerId, ptype: e.pointerType };
        pel.setPointerCapture(e.pointerId); e.preventDefault();
        return;
      }
      const id = tgt.closest('[data-id]')?.dataset.id || null; st.sel = id; paint();
      if (!id) { if (clip && e.pointerType !== 'mouse') holdStart(e, () => showMenu(e.clientX, e.clientY, p, null, pt)); return; }
      const m = selMark();
      if (m.type === 'text' && e.detail === 2) { editBox(p, id, false, [e.clientX, e.clientY]); e.preventDefault(); return; }
      snapshot(); drag = { kind: 'move', p, last: pt, m, moved: false, id: e.pointerId, ptype: e.pointerType, cx: e.clientX, cy: e.clientY };
      if (e.pointerType !== 'mouse') holdStart(e, () => { if (drag?.m === m && !drag.moved) { drag = null; st.undo.pop(); } showMenu(e.clientX, e.clientY, p, m); });
      pel.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    snapshot();
    const base = { id: uid(), page: +pel.dataset.page, color: st.shapeColor, width: st.width };
    const m = st.tool === 'pen' ? { ...base, type: 'pen', pts: [inkPt(pt, e)] } : st.tool === 'rect' ? { ...base, type: 'rect', x: pt[0], y: pt[1], w: 0, h: 0 } : { ...base, type: st.tool, a: pt, b: pt };
    st.marks.push(m); drag = { kind: 'draw', p, start: pt, m, id: e.pointerId, ptype: e.pointerType };
    pel.setPointerCapture(e.pointerId); e.preventDefault(); paint();
  });
  // Double-click opens a text box with the Select tool where pointerdown carries no click count.
  pagesEl.addEventListener('dblclick', (e) => {
    if (st.tool !== 'select' || editingBox()) return;
    const hit = e.target.closest('.mk-box'); const pel = e.target.closest('.mk-page'); if (!hit || !pel) return;
    editBox(pages[+pel.dataset.page], hit.dataset.id, false, [e.clientX, e.clientY]);
  });
  pagesEl.addEventListener('pointermove', (e) => {
    if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8) holdEnd();
    if (!drag || e.pointerId !== drag.id) return;
    const pt = at(drag.p, e); const m = drag.m;
    if (drag.kind === 'resize') {
      const [x, y, w, h] = drag.box; drag.moved = true;
      scaleMark(m, drag.o, Math.max(0.1, Math.hypot(pt[0] - x, pt[1] - y) / (Math.hypot(w, h) || 1)), [x, y]);
    } else if (drag.kind === 'move') {
      if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 6) return; // a held press stays still
      holdEnd();
      const dx = pt[0] - drag.last[0], dy = pt[1] - drag.last[1]; drag.last = pt; drag.moved = true;
      shift(m, dx, dy);
    } else if (m.type === 'pen') {
      // Shift while drawing: a straight stroke from where it started. Apple Pencil reports more points than are
      // sent as events (up to 240 a second): every one is kept.
      if (e.shiftKey) m.pts = [drag.start, snap(drag.start, pt, true)];
      else (e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]).forEach((c) => m.pts.push(inkPt(at(drag.p, c), c)));
      drawLive(drag); return;
    } else if (m.type === 'rect') {
      let w = pt[0] - drag.start[0], h = pt[1] - drag.start[1];
      if (e.shiftKey) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
      m.x = Math.min(drag.start[0], drag.start[0] + w); m.y = Math.min(drag.start[1], drag.start[1] + h); m.w = Math.abs(w); m.h = Math.abs(h);
    } else m.b = snap(drag.start, pt, e.shiftKey);
    paint();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { m, kind, moved } = drag; drag = null;
    if ((kind === 'move' || kind === 'resize') && !moved) { st.undo.pop(); return; } // a click that only selected
    const tiny = (m.type === 'rect' && m.w < 2 && m.h < 2) || ((m.type === 'line' || m.type === 'arrow') && Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) < 2) || (m.type === 'pen' && m.pts.length < 2);
    if (kind === 'draw' && tiny) { st.marks = st.marks.filter((x) => x !== m); st.undo.pop(); paint(); return; }
    changed();
  };
  pagesEl.addEventListener('pointerup', (e) => {
    if (hold?.id === e.pointerId) holdEnd();
    if (tapOff?.id === e.pointerId) { const quick = Date.now() - tapOff.t < 400; tapOff = null; if (quick) setTool('select'); }
    if (tapOpen?.id === e.pointerId) { const { fn } = tapOpen; tapOpen = null; fn(); }
    endDrag(e);
  });
  pagesEl.addEventListener('pointercancel', (e) => {
    if (hold?.id === e.pointerId) holdEnd();
    if (tapOff?.id === e.pointerId) tapOff = null;
    if (tapOpen?.id === e.pointerId) tapOpen = null;
    if (drag && e.pointerId === drag.id) cancelDrag();
  });

  // Highlight: the text selected with the Highlight tool gets the highlight colour. Over the PDF's own text that is a
  // highlight mark (boxes over those words); inside a text box it is those characters. A mouse highlights on release;
  // touch and Apple Pencil (iPad, v2.13) select with the handles first, then press "Highlight selection"
  // (Safari sends no mouseup after a long-press selection).
  pagesEl.addEventListener('mouseup', () => { if (st.tool === 'highlight') highlightSelection(); });
  $('#mk-hl').onclick = highlightSelection;
  $('#mk-hl').onpointerdown = (e) => e.preventDefault(); // keep the text selection
  $('#mk-hl').onmousedown = (e) => e.preventDefault();
  function highlightSelection() {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const r0 = sel.getRangeAt(0); const ca = r0.commonAncestorContainer;
    const boxEl = (ca.nodeType === 3 ? ca.parentElement : ca).closest?.('.mk-box');
    if (boxEl) {
      const m = st.marks.find((x) => x.id === boxEl.dataset.id);
      const pre = document.createRange(); pre.selectNodeContents(boxEl); pre.setEnd(r0.startContainer, r0.startOffset);
      const a = pre.toString().length; const z = a + r0.toString().length;
      sel.removeAllRanges();
      if (m && z > a) { snapshot(); m.runs = styleRange(runsOf(m), a, z, { hl: st.hlColor, ha: st.hlOpacity }); changed(); }
      return;
    }
    const byPage = new Map();
    for (let i = 0; i < sel.rangeCount; i++) {
      [...withPunctuation(sel.getRangeAt(i).cloneRange()).getClientRects()].forEach((r) => {
        if (r.width < 1 || r.height < 1) return;
        const p = pages.find((x) => { const b = x.el.getBoundingClientRect(); return r.top >= b.top - 2 && r.bottom <= b.bottom + 2; });
        if (!p) return;
        const b = p.el.getBoundingClientRect();
        const rect = [(r.left - b.left) / p.scale, (r.top - b.top) / p.scale, r.width / p.scale, r.height / p.scale];
        const k = +p.el.dataset.page; byPage.set(k, [...(byPage.get(k) || []), rect]);
      });
    }
    sel.removeAllRanges();
    if (!byPage.size) return;
    snapshot();
    byPage.forEach((rects, page) => st.marks.push({ id: uid(), page, type: 'highlight', rects: mergeRects(rects), color: st.hlColor, opacity: st.hlOpacity }));
    changed();
  }

  // Replaces "-->" / "==>" before the caret with an arrow; Ctrl+Z gives the typed characters back.
  function arrowize() {
    const s = window.getSelection(); if (!s.rangeCount || !s.isCollapsed) return;
    const { startContainer: n, startOffset: o } = s.getRangeAt(0);
    if (n.nodeType !== 3) return;
    const len = o >= 3 && ARROWS[n.data.slice(o - 3, o)] ? 3 : o >= 2 && ARROWS[n.data.slice(o - 2, o)] ? 2 : 0;
    if (!len) return;
    const r = document.createRange(); r.setStart(n, o - len); r.setEnd(n, o);
    s.removeAllRanges(); s.addRange(r); exec('insertText', ARROWS[n.data.slice(o - len, o)]);
  }

  // Text box editing: rich text per character; Enter = new line; the caret goes where the box was pressed (at the end
  // for a new box); an empty box is removed when it loses focus.
  function editBox(p, id, fresh = false, pt = null) {
    const m = st.marks.find((x) => x.id === id); if (!m) return;
    const b = p.boxes.querySelector(`[data-id="${id}"]`); if (!b || b.classList.contains('editing')) return;
    if (!fresh) snapshot();
    b.contentEditable = 'true'; b.spellcheck = false;
    b.classList.add('editing'); exec('styleWithCSS', false);
    b.focus({ preventScroll: true });
    let r = pt && caretAt(pt[0], pt[1]);
    if (!r || !b.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(b); r.collapse(false); }
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    mk.dataset.mode = 'text'; updateFmt();
    b.onkeydown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        // In a list line, Enter starts the next item ("• " or the next number); on an empty item it ends the list.
        const s = getSelection(); const text = readRuns(b).map((x) => x.t).join('');
        const k = s.rangeCount ? Math.min(text.length, boxOffset(b, s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset)) : text.length;
        const s0 = text.lastIndexOf('\n', k - 1) + 1; const e0 = text.indexOf('\n', k) < 0 ? text.length : text.indexOf('\n', k);
        const mm = text.slice(s0).match(LIST_MARK);
        if (mm && e0 - s0 === mm[0].length) { const r = document.createRange(); r.setStart(...boxPos(b, s0)); r.setEnd(...boxPos(b, e0)); s.removeAllRanges(); s.addRange(r); exec('delete'); return; }
        if (!exec('insertLineBreak')) exec('insertHTML', '<br>');
        if (mm) exec('insertText', mm[2] ? `${+mm[2] + 1}. ` : '• ');
      }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); exec('strikeThrough'); updateFmt(); }
      else if (e.key === 'Escape') { e.preventDefault(); b.blur(); }
    };
    b.onpaste = (e) => { e.preventDefault(); exec('insertText', e.clipboardData?.getData('text/plain') || ''); };
    b.oninput = (e) => { if (e.inputType === 'insertText' && e.data === '>') arrowize(); updateFmt(); caretInView(); };
    // Markup (Edit text): what is typed into a paragraph of the PDF takes your text colour; Edit keeps the paragraph's
    b.onbeforeinput = (e) => {
      if (!m.cover || !st.markup || !/^insert(Text|CompositionText|FromPaste|ReplacementText)$/.test(e.inputType)) return;
      if (getSelection().isCollapsed) exec('foreColor', st.textColor);
    };
    b.onblur = () => {
      pagesEl.style.paddingBottom = '';
      b.onblur = null; b.classList.remove('editing'); b.contentEditable = 'false';
      m.runs = readRuns(b); m.text = m.runs.map((x) => x.t).join('');
      if (!m.text.trim() && !m.cover) { st.marks = st.marks.filter((x) => x.id !== id); if (st.sel === id) st.sel = null; } // an emptied edit deletes the paragraph
      changed();
    };
  }

  // ---------- Edit text ----------
  // The paragraph under point pt (page units) becomes a text box in its place: its text, the nearest site font, its
  // size, line spacing and colour; the original is covered on screen and removed from the downloaded PDF.
  async function editAt(p, pt) {
    const paras = await (p.paras ||= pageText(p));
    const pad = 2; const u = paras.findLast(({ box: [x, y, w, h] }) => pt[0] >= x - pad && pt[0] <= x + w + pad && pt[1] >= y - pad && pt[1] <= y + h + pad);
    if (!u) return;
    const n = pages.indexOf(p); const key = `${n}:${u.box.map((v) => v.toFixed(1)).join(',')}`;
    const had = st.marks.find((m) => m.cover?.key === key);
    if (had) { st.sel = had.id; paint(); editBox(p, had.id); return; }
    const font = u.fam ? siteFont(u.fam) : 'Sarabun'; await loadFonts([font]); // OCR text has no font name
    const { ink, bg } = sampleColours(p, u.box);
    const c = document.createElement('canvas').getContext('2d'); c.font = `${u.size}px ${fontStack(font)}`;
    const mt = c.measureText('Hg'); const asc = mt.fontBoundingBoxAscent ?? u.size * 0.8; const desc = mt.fontBoundingBoxDescent ?? u.size * 0.25;
    const lh = u.lines > 1 ? u.lh : TEXT.lineHeight;
    snapshot();
    const m = {
      id: uid(), page: n, type: 'text', x: u.align ? u.col[0] : u.box[0] + 1, y: u.first - ((lh * u.size - asc - desc) / 2 + asc), align: u.align,
      runs: u.runs.map((r) => ({ t: r.t, ...(r.b ? { b: 1 } : {}), ...(r.i ? { i: 1 } : {}) })), text: u.text, color: ink, size: u.size, font, lh,
      // wrap width: a paragraph keeps its own width; one line may run to the page's text margin; centred text
      // stays centred in the page's text column; right-aligned text keeps its own right edge
      wrap: u.align === 'right' ? u.box[0] + u.box[2] - 1 - u.col[0] : u.align ? u.col[1] - u.col[0] : u.lines > 1 ? u.box[2] + u.size * 0.3 : Math.max(u.box[2], u.col[1] - u.box[0]) + u.size * 0.3,
      cover: { key, box: u.box, bg, scan: !!p.scanned, rects: u.rects.map(([x0, y0, x1, y1]) => [x0 - u.size * 0.8, y0, x1, y1]) },
    };
    st.marks.push(m); st.sel = m.id; changed(); editBox(p, m.id, true);
  }
  // The page's paragraphs; a page without text (a scan), or whose Thai text the PDF holds damaged, is read by OCR
  // first, once.
  async function pageText(p) {
    const own = await pageParagraphs(p.page);
    const text = own.map((u) => u.text).join(' ');
    const damaged = text.trim().length >= 10 && damagedThai(text, { canva: await canva });
    if ((text.trim().length >= 10 && !damaged) || !ocr) return own;
    try {
      onStatus(damaged ? t('The Thai text in this page is damaged in the PDF: reading it with OCR…', 'ข้อความภาษาไทยในหน้านี้เสียหาย กำลังอ่านด้วย OCR…')
        : t('Reading this scanned page with OCR…', 'กำลังอ่านหน้าสแกนด้วย OCR…'));
      const { ocrPage } = await import('./pdf-ocr.js');
      const items = await ocrPage(p.page, onStatus); p.scanned = !damaged; // a damaged page still has text to remove
      const read = await pageParagraphs(p.page, items);
      const chk = (items.check || []).slice(0, 6).map(([w, s]) => (s ? `${w} (${s}?)` : w)).join(', ');
      const more = chk ? t(` Words to check: ${chk}${items.check.length > 6 ? '…' : ''}.`, ` คำที่ควรตรวจ: ${chk}${items.check.length > 6 ? '…' : ''}`) : '';
      onStatus((damaged ? t(`Page read by OCR: ${read.length} paragraphs to edit. Check names and figures.`, `อ่านหน้านี้ด้วย OCR แล้ว ${read.length} ย่อหน้า กรุณาตรวจชื่อและตัวเลข`)
        : t(`Scanned page read by OCR: ${read.length} paragraphs to edit. Check names and figures.`, `อ่านหน้าสแกนแล้ว ${read.length} ย่อหน้า กรุณาตรวจชื่อและตัวเลข`)) + more);
      return read;
    } catch (err) { p.paras = null; onStatus(err.message); return own; }
  }
  // The text and background colours under a box, from the drawn page: the darkest and the most common light pixels.
  function sampleColours(p, [x, y, w, h]) {
    const cv = p.canvas; const k = cv.width / p.w; const fall = { ink: '#000000', bg: '#ffffff' };
    if (!cv.width) return fall;
    try {
      const d = cv.getContext('2d').getImageData(Math.max(0, x * k), Math.max(0, y * k), Math.max(1, w * k), Math.max(1, h * k)).data;
      const px = []; for (let i = 0; i < d.length; i += 16) px.push([d[i], d[i + 1], d[i + 2], 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]]);
      px.sort((a, b) => a[3] - b[3]);
      const avg = (list) => `#${[0, 1, 2].map((j) => Math.round(list.reduce((s, q) => s + q[j], 0) / list.length).toString(16).padStart(2, '0')).join('')}`;
      // Ink: the darkest 1% (thin Thai strokes have few solid pixels; a wider share averages in their grey edges, and
      // the new text came out lighter than the old). A near-black grey is black drawn smooth: it becomes black.
      const dark = px.slice(0, Math.max(1, Math.round(px.length * 0.01)));
      let ink = avg(dark); const [r, g, b] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
      if (Math.max(r, g, b) < 72 && Math.max(r, g, b) - Math.min(r, g, b) < 24) ink = '#000000';
      return { ink, bg: avg(px.slice(Math.floor(px.length * 0.6))) };
    } catch { return fall; }
  }
  // An edited paragraph's runs with its line breaks where the screen wraps them (the PDF has no wrapping).
  function wrapRuns(m) {
    const runs = runsOf(m); const pv = pages[m.page]; const box = pv?.boxes.querySelector(`[data-id="${m.id}"]`);
    if (!box) return runs;
    const breaks = new Set(); let off = 0; let top = null; const r = document.createRange();
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      for (const { segment, index } of (seg ? [...seg.segment(t.data)] : [...t.data].map((s, i) => ({ segment: s, index: i })))) {
        if (segment === '\n') { top = null; off += 1; continue; }
        r.setStart(t, index); r.setEnd(t, index + segment.length); const rect = r.getClientRects()[0];
        if (rect) { if (top != null && rect.top > top + rect.height / 2) breaks.add(off); top = rect.top; }
        off += segment.length;
      }
    }
    const out = []; off = 0;
    for (const run of runs) {
      let t = '';
      for (const ch of run.t) { if (breaks.has(off)) t = `${t.replace(/ $/, '')}\n`; t += ch; off++; }
      out.push({ ...run, t });
    }
    return out;
  }

  setTool('select');
  paint();

  // ---------- writing the marked PDF ----------
  async function exportPdf() {
    document.activeElement?.blur?.();
    await loadFonts(st.marks.filter((m) => m.type === 'text').map(fontOf));
    const out = await PDFLib.PDFDocument.load(bytes.slice(0));
    const { rgb, LineCapStyle } = PDFLib;
    const hex = (c) => { const [r, g, b] = rgbOf(c); return rgb(r / 255, g / 255, b / 255); };
    const outPages = out.getPages();
    const P0 = (n, [x, y]) => { const pg = outPages[n]; const { x: ox, y: oy } = pg.getMediaBox ? pg.getMediaBox() : { x: 0, y: 0 }; return { x: ox + x, y: oy + pages[n].h - y }; };
    // Text boxes as real text (searchable, copyable); a box whose font cannot be embedded is drawn as a picture.
    const writer = st.marks.some((m) => m.type === 'text') ? await textWriter(out, PDFLib) : null;
    // Edited paragraphs: their old text is removed from the page (search and copy no longer find it); where it cannot
    // be removed (text inside a form XObject), it is covered with the page's background colour.
    const edits = st.marks.filter((m) => m.type === 'text' && m.cover); let covered = 0;
    const { removeText } = edits.length ? await import('./pdf-redact.js') : {};
    for (const n of [...new Set(edits.map((m) => m.page))]) {
      const mine = edits.filter((m) => m.page === n); const areas = mine.flatMap((m) => m.cover.rects);
      const hits = removeText(out, PDFLib, n, areas); let k = 0;
      for (const m of mine) {
        const got = m.cover.rects.map(() => hits[k++]);
        // a scan has no text to remove: its picture is covered (no note); otherwise covering is the fallback
        if (got.some((h) => !h)) { if (!m.cover.scan) covered++; const [x, y, w, h] = m.cover.box; const a = P0(n, [x, y + h]); outPages[n].drawRectangle({ x: a.x, y: a.y, width: w, height: h, color: hex(m.cover.bg) }); }
      }
    }
    // Highlights first, so every other mark (and the page's ink, through multiply) sits on top of them.
    const order = [...st.marks.filter((m) => m.type === 'highlight'), ...st.marks.filter((m) => m.type !== 'highlight')];
    for (const m of order) {
      const pg = outPages[m.page]; const pv = pages[m.page]; if (!pg || !pv) continue;
      const { x: ox, y: oy } = pg.getMediaBox ? pg.getMediaBox() : { x: 0, y: 0 };
      // Page units (top-left origin) -> PDF user space (bottom-left origin). Pages with /Rotate are not handled yet.
      const P = ([x, y]) => ({ x: ox + x, y: oy + pv.h - y });
      const line = (a, b, w, c) => pg.drawLine({ start: P(a), end: P(b), thickness: w, color: hex(c), lineCap: LineCapStyle.Round });
      if (m.type === 'pen') pg.drawSvgPath(inkPath(m), { x: ox, y: oy + pv.h, color: hex(m.color) }); // the outline, as on screen
      if (m.type === 'line' || m.type === 'arrow') line(m.a, m.b, m.width, m.color);
      if (m.type === 'arrow') { const [t, p1, p2] = arrowHead(m.a, m.b, m.width); line(p1, t, m.width, m.color); line(p2, t, m.width, m.color); }
      if (m.type === 'rect') {
        const c = [[m.x, m.y], [m.x + m.w, m.y], [m.x + m.w, m.y + m.h], [m.x, m.y + m.h]];
        for (let i = 0; i < 4; i++) line(c[i], c[(i + 1) % 4], m.width, m.color);
      }
      if (m.type === 'highlight') {
        m.rects.forEach(([x, y, w, h]) => {
          const a = P([x, y + h]);
          pg.drawRectangle({ x: a.x, y: a.y, width: w, height: h, color: hex(m.color || HIGHLIGHT), opacity: m.opacity ?? HL_OPACITY, blendMode: PDFLib.BlendMode?.Multiply });
        });
      }
      if (m.type === 'text' && m.text.trim() && await writer.draw(pg, { ...m, runs: m.wrap ? wrapRuns(m) : runsOf(m) }, (x, y) => P([x, y]), { lineHeight: m.lh || TEXT.lineHeight, fontFamily: fontOf })) continue;
      if (m.type === 'text' && m.text.trim()) {
        const png = await textPng({ ...m, runs: m.wrap ? wrapRuns(m) : runsOf(m) });
        const img = await out.embedPng(png.bytes);
        const a = P([m.x, m.y - png.oy + png.h]);
        pg.drawImage(img, { x: a.x, y: a.y, width: png.w, height: png.h });
      }
    }
    exportNotes = writer ? [...writer.notes] : [];
    if (covered) exportNotes.push(`${covered} edited paragraph${covered > 1 ? 's' : ''} could not be removed from the page (the PDF draws ${covered > 1 ? 'them' : 'it'} in a way this tool cannot change), so ${covered > 1 ? 'they were' : 'it was'} covered instead`);
    return out.save();
  }
  let exportNotes = [];

  return { marks: () => structuredClone(st.marks), isDirty: () => st.dirty, clean: () => { st.dirty = false; }, exportPdf, notes: () => exportNotes, name, doc };
}

// A text box drawn by the browser at 4x (so Thai vowels and tone marks are placed correctly), as PNG bytes, its size
// in page units and oy, how far above the box's top the image starts. Lines are laid out as CSS does: each line is
// line-height tall, with the font's ascent + descent centred in it. Highlights are filled first, under all letters.
async function textPng(m) {
  const k = 4; const px = m.size * k; const lh = m.size * TEXT.lineHeight * k; const fam = fontStack(fontOf(m));
  const fontFor = (r) => `${r.i ? 'italic ' : ''}${r.b ? 'bold ' : ''}${px}px ${fam}`;
  const lines = [[]];
  runsOf(m).forEach((r) => r.t.split('\n').forEach((piece, i) => { if (i) lines.push([]); if (piece) lines.at(-1).push({ ...r, t: piece }); }));
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = fontFor({}); const mt = ctx.measureText('Hg');
  const asc = mt.fontBoundingBoxAscent ?? px * 0.8; const desc = mt.fontBoundingBoxDescent ?? px * 0.25;
  const lay = lines.map((l) => { let x = 0; return l.map((r) => { ctx.font = fontFor(r); const w = ctx.measureText(r.t).width; const o = { r, x, w }; x += w; return o; }); });
  const pad = Math.max(0, (asc + desc - lh) / 2); // tall Thai fonts reach above and below the line box
  const lineW = (l) => (l.length ? l.at(-1).x + l.at(-1).w : 0);
  let W = Math.max(1, ...lay.map(lineW)) + px * 0.15 + 2 * k;
  if (m.align === 'center' || m.align === 'right') { // place each line in the box's width (or its longest line), as on screen
    const span = Math.max(...lay.map(lineW), (m.wrap || 0) * k); W = Math.max(W, span);
    lay.forEach((l) => { const dx = (span - lineW(l)) / (m.align === 'center' ? 2 : 1); l.forEach((o) => { o.x += dx; }); });
  }
  c.width = Math.ceil(W); c.height = Math.ceil(lh * lines.length + 2 * pad);
  const top = (i) => pad + i * lh + (lh - asc - desc) / 2; // top of the font box on line i
  lay.forEach((l, i) => l.forEach(({ r, x, w }) => { if (r.hl) { ctx.fillStyle = rgba(r.hl, r.ha ?? HL_OPACITY); ctx.fillRect(x, top(i), w, asc + desc); } }));
  ctx.textBaseline = 'alphabetic'; const th = Math.max(k, px / 14);
  lay.forEach((l, i) => l.forEach(({ r, x, w }) => {
    ctx.fillStyle = r.c || m.color; const base = top(i) + asc; ctx.font = fontFor(r); ctx.fillText(r.t, x, base);
    if (r.u) ctx.fillRect(x, base + px * 0.1, w, th);
    if (r.s) ctx.fillRect(x, base - px * 0.3, w, th);
  }));
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width / k, h: c.height / k, oy: pad / k };
}

// iPad: a selection dragged to the end of a line stopped before a closing ")" or full stop (often its own span in the
// text layer), so the highlight came out one character short. Each end of range r takes in the closing or opening
// punctuation right next to it, also from the neighbouring span on the same line.
const CLOSE = /^[)\]}"'”’».,;:!?%…]+/u, OPEN = /[(\[{"'“‘«]+$/u;
function textEnd(n, o, atEnd) { // the text node and offset at a range boundary
  while (n.nodeType !== 3) {
    const c = atEnd ? n.childNodes[o - 1] : n.childNodes[o]; if (!c) return null;
    n = c; o = atEnd ? (c.nodeType === 3 ? c.data.length : c.childNodes.length) : 0;
  }
  return [n, o];
}
function sideText(n, next) { // the text of the span beside n's span on the same line (a <br> ends the line)
  const span = n.parentElement; const s = next ? span?.nextElementSibling : span?.previousElementSibling;
  if (!s || s.tagName !== 'SPAN' || !span.parentElement?.classList.contains('textLayer')) return null;
  const a = span.getBoundingClientRect(), b = s.getBoundingClientRect();
  if (Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > a.height / 2) return null;
  return s.firstChild?.nodeType === 3 ? s.firstChild : null;
}
function withPunctuation(r) {
  const e = textEnd(r.endContainer, r.endOffset, true);
  if (e) {
    let [n, o] = e; let m = CLOSE.exec(n.data.slice(o));
    if (!m && o === n.data.length) { const nx = sideText(n, true); if (nx && (m = CLOSE.exec(nx.data))) { n = nx; o = 0; } }
    if (m) r.setEnd(n, o + m[0].length);
  }
  const s = textEnd(r.startContainer, r.startOffset, false);
  if (s) {
    let [n, o] = s; let m = OPEN.exec(n.data.slice(0, o));
    if (!m && o === 0) { const pv = sideText(n, false); if (pv && (m = OPEN.exec(pv.data))) { n = pv; o = pv.data.length; } }
    if (m) r.setStart(n, o - m[0].length);
  }
  return r;
}

// Draw (12 Nov 2026, "like GoodNotes"): a pen stroke is one filled outline instead of a line of fixed width. The points
// ease towards the pen (less jitter), Apple Pencil pressure (a third value per point) makes the line thinner or
// thicker, the ends are round, and the outline is joined with curves. The same path is drawn on screen and in the PDF.
function inkOutline(raw, width) {
  const pts = []; let prev = null;
  raw.forEach(([x, y, p], i) => {
    const q = prev ? [prev[0] + (x - prev[0]) * 0.55, prev[1] + (y - prev[1]) * 0.55, p] : [x, y, p];
    if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 0.25 || i === raw.length - 1) { pts.push(q); prev = q; }
  });
  const last = raw.at(-1); if (pts.length > 1) pts.push([last[0], last[1], last[2]]); // the stroke still ends at the pen
  const rad = pts.map(([, , p]) => (width / 2) * (p == null ? 1 : Math.min(1.6, Math.max(0.3, 0.4 + 1.2 * p))));
  const r = rad.map((v, i) => (rad[Math.max(0, i - 1)] + 2 * v + rad[Math.min(rad.length - 1, i + 1)]) / 4); // no sudden steps
  const n = pts.length; const arc = (c, rr, a0, steps, dir) => Array.from({ length: steps }, (_, k) => { const a = a0 + dir * (k + 1) * Math.PI / (steps + 1); return [c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]; });
  if (n === 1 || pts.every((q) => Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]) < 0.01)) { const [c, rr] = [pts[0], r[0]]; return [[c[0] + rr, c[1]], ...arc(c, rr, 0, 7, 1), [c[0] - rr, c[1]], ...arc(c, rr, Math.PI, 7, 1)]; } // a dot
  const left = []; const right = []; const norm = [];
  pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    norm.push(Math.atan2(dx, -dy)); // the left normal (-dy, dx) as an angle
    left.push([q[0] - dy * r[i], q[1] + dx * r[i]]); right.push([q[0] + dy * r[i], q[1] - dx * r[i]]);
  });
  return [...left, ...arc(pts[n - 1], r[n - 1], norm[n - 1], 5, -1), ...right.reverse(), ...arc(pts[0], r[0], norm[0] + Math.PI, 5, -1)];
}
function inkPath(m) {
  const o = inkOutline(m.pts, m.width); const f = (v) => Math.round(v * 100) / 100;
  const d = o.map((a, i) => { const b = o[(i + 1) % o.length]; return `${f(a[0])} ${f(a[1])} ${f((a[0] + b[0]) / 2)} ${f((a[1] + b[1]) / 2)}`; });
  return `M${f(o[0][0])} ${f(o[0][1])}Q${d.join(' ')}Z`;
}

// Selection rectangles of one line come in pieces: join neighbours on the same line.
function mergeRects(rs) {
  const out = [];
  rs.sort((a, b) => a[1] - b[1] || a[0] - b[0]).forEach((r) => {
    const last = out.at(-1);
    if (last && Math.abs(last[1] - r[1]) < 2 && r[0] <= last[0] + last[2] + 3) {
      const x2 = Math.max(last[0] + last[2], r[0] + r[2]); last[2] = x2 - last[0]; last[3] = Math.max(last[3], r[3]);
    } else out.push([...r]);
  });
  return out;
}
