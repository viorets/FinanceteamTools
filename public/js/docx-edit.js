// Word editor (WordCraft-style): the document is one editable page in its own fonts, sizes, colours, alignment and
// spacing, with its tables and images. A ribbon in the floating glass bar formats text (font, size, B/I/U/S, colour,
// highlight), paragraphs (alignment, lists, indent, spacing) and applies the document's paragraph styles; Find &
// replace, export (PDF, .txt, .md, .html) and a word count; text boxes, pen, lines, arrows and rectangles on the page
// are saved as Word drawings. The file is opened as a zip (JSZip): document.xml changes, plus styles, numbering,
// relationships and media only where a style, list or drawing is added. A text-only edit rewrites just the changed
// characters (every run keeps its formatting); a formatting edit rebuilds the paragraph's runs, each from its source
// run. Headers and footers are not shown.
import { cssZoom, floatBar, fullScreen, viewBar } from './view-tools.js';
import { fileTab, ribbon, RI, setPressed } from './ribbon.js';
import { pairHex } from './hex-color.js';
import { arrowize, exec } from './rich-text.js';

const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const THAI = /[฀-๿]/;
const HIGHLIGHT = { darkYellow: '#808000', lightGray: '#d3d3d3', darkGray: '#a9a9a9' }; // the rest are CSS colour names

const loadJSZip = () => window.JSZip ? Promise.resolve(window.JSZip) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = JSZIP; s.crossOrigin = 'anonymous';
  s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error('Could not load the Word tools. Try again.'));
  document.head.append(s);
});

const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
const kids = (el, name) => el ? [...el.children].filter((c) => c.namespaceURI === W && c.localName === name) : [];
const kid = (el, name) => kids(el, name)[0] || null;
const attr = (el, name) => el?.getAttributeNS(W, name) || null;
const val = (el) => attr(el, 'val');
const on = (el) => !['0', 'false', 'off'].includes(val(el));
const ancestor = (el, name) => { for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) if (n.namespaceURI === W && n.localName === name) return n; return null; };
// Text pieces of a run: w:t, and w:tab / w:br directly in a run (a w:tab under w:tabs is a tab stop; page breaks are kept).
const isPiece = (el) => el.parentNode?.localName === 'r' && (el.localName === 't' || el.localName === 'tab' || el.localName === 'cr' || (el.localName === 'br' && !el.getAttributeNS(W, 'type')));
const pieceText = (el) => el.localName === 't' ? el.textContent : el.localName === 'tab' ? '\t' : '\n';
const pt = (twips) => `${twips / 20}pt`;

// Formatting resolved the way Word does it: document defaults, then the paragraph style (and the styles it is based
// on), then the character style, then the run's own properties. Theme fonts come from the theme part.
function styleReader(stylesXml, themeXml, numberingXml) {
  const tf = {};
  if (themeXml) {
    const t = parse(themeXml);
    for (const kind of ['major', 'minor']) {
      const f = t.getElementsByTagNameNS(A, `${kind}Font`)[0]; if (!f) continue;
      const latin = f.getElementsByTagNameNS(A, 'latin')[0]?.getAttribute('typeface');
      const cs = f.getElementsByTagNameNS(A, 'cs')[0]?.getAttribute('typeface');
      const thai = [...f.getElementsByTagNameNS(A, 'font')].find((x) => x.getAttribute('script') === 'Thai')?.getAttribute('typeface');
      tf[`${kind}HAnsi`] = tf[`${kind}Ascii`] = latin; tf[`${kind}Bidi`] = cs || thai;
    }
  }
  function rProps(rPr) {
    const o = {}; if (!rPr) return o;
    const f = kid(rPr, 'rFonts');
    if (f) { const a = attr(f, 'ascii') || tf[attr(f, 'asciiTheme')]; const c = attr(f, 'cs') || tf[attr(f, 'cstheme')]; if (a) o.ascii = a; if (c) o.cs = c; }
    for (const k of ['b', 'bCs', 'i', 'iCs', 'strike', 'caps']) { const e = kid(rPr, k); if (e) o[k] = on(e); }
    const u = kid(rPr, 'u'); if (u) o.u = val(u) !== 'none';
    const sz = kid(rPr, 'sz'); if (sz) o.sz = +val(sz) / 2;
    const szCs = kid(rPr, 'szCs'); if (szCs) o.szCs = +val(szCs) / 2;
    const c = kid(rPr, 'color'); if (val(c) && val(c) !== 'auto') o.color = `#${val(c)}`;
    const h = kid(rPr, 'highlight'); if (val(h) && val(h) !== 'none') o.highlight = HIGHLIGHT[val(h)] || val(h);
    const fill = attr(kid(rPr, 'shd'), 'fill'); if (fill && fill !== 'auto') o.shade = `#${fill}`;
    const va = kid(rPr, 'vertAlign'); if (va) o.vertAlign = val(va);
    return o;
  }
  function pProps(pPr) {
    const o = {}; if (!pPr) return o;
    const jc = kid(pPr, 'jc'); if (jc) o.jc = val(jc);
    const sp = kid(pPr, 'spacing');
    if (sp) { for (const k of ['before', 'after', 'line']) { const v = attr(sp, k); if (v) o[k] = +v; } if (attr(sp, 'lineRule')) o.lineRule = attr(sp, 'lineRule'); }
    const ind = kid(pPr, 'ind');
    if (ind) {
      for (const [k, alt] of [['left', 'start'], ['right', 'end']]) { const v = attr(ind, k) || attr(ind, alt); if (v) o[k] = +v; }
      if (attr(ind, 'hanging')) { o.hanging = +attr(ind, 'hanging'); o.firstLine = 0; } else if (attr(ind, 'firstLine')) { o.firstLine = +attr(ind, 'firstLine'); o.hanging = 0; }
    }
    const num = kid(pPr, 'numPr');
    if (num) { const id = val(kid(num, 'numId')); if (id) o.numId = id; const lv = val(kid(num, 'ilvl')); if (lv) o.ilvl = +lv; }
    const fill = attr(kid(pPr, 'shd'), 'fill'); if (fill && fill !== 'auto') o.shade = `#${fill}`;
    const tabs = kid(pPr, 'tabs'); if (tabs) o.tabs = kids(tabs, 'tab').map((t) => ({ val: val(t), pos: +attr(t, 'pos') || 0, leader: attr(t, 'leader') || 'none' }));
    const bdr = kid(pPr, 'pBdr');
    if (bdr) {
      o.border = {};
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const e = kid(bdr, side); if (!e || ['nil', 'none'].includes(val(e))) continue;
        o.border[side] = { width: Math.max(0.5, (+attr(e, 'sz') || 4) / 8), color: attr(e, 'color') && attr(e, 'color') !== 'auto' ? `#${attr(e, 'color')}` : '#000', space: +attr(e, 'space') || 0 };
      }
    }
    return o;
  }
  const mergeTabs = (a = [], b = []) => { const m = new Map(a.map((t) => [t.pos, t])); b.forEach((t) => { if (t.val === 'clear') m.delete(t.pos); else m.set(t.pos, t); }); return [...m.values()].sort((x, y) => x.pos - y.pos); };
  const doc = stylesXml ? parse(stylesXml) : null;
  const styles = new Map(); let defaultPara = null;
  for (const s of doc?.getElementsByTagNameNS(W, 'style') || []) {
    styles.set(attr(s, 'styleId'), s);
    if (attr(s, 'type') === 'paragraph' && ['1', 'true', 'on'].includes(attr(s, 'default'))) defaultPara = attr(s, 'styleId');
  }
  const dd = doc?.getElementsByTagNameNS(W, 'docDefaults')[0];
  const base = { r: rProps(kid(kid(dd, 'rPrDefault'), 'rPr')), p: pProps(kid(kid(dd, 'pPrDefault'), 'pPr')) };
  const memo = new Map();
  function style(id) {
    if (!id || !styles.has(id)) return { r: {}, p: {}, borders: false };
    if (memo.has(id)) return memo.get(id);
    memo.set(id, { r: {}, p: {}, borders: false }); // a style based on itself stops here
    const s = styles.get(id); const parent = style(val(kid(s, 'basedOn')));
    const tb = kid(kid(s, 'tblPr'), 'tblBorders');
    const own = pProps(kid(s, 'pPr'));
    const out = { r: { ...parent.r, ...rProps(kid(s, 'rPr')) }, p: { ...parent.p, ...own, tabs: mergeTabs(parent.p.tabs, own.tabs) }, borders: tb ? hasBorder(tb) : parent.borders };
    memo.set(id, out); return out;
  }
  const hasBorder = (tb) => [...tb.children].some((b) => !['nil', 'none'].includes(val(b)));

  // Lists (numbering.xml): a paragraph's numId points to a list definition; each level has a number format, the
  // marker text ("%1.") and its own indent. Each numId counts on its own (checked against Word).
  const nums = new Map(); const abstracts = new Map();
  if (numberingXml) {
    const nd = parse(numberingXml);
    for (const a of nd.getElementsByTagNameNS(W, 'abstractNum')) abstracts.set(attr(a, 'abstractNumId'), a);
    for (const n of nd.getElementsByTagNameNS(W, 'num')) nums.set(attr(n, 'numId'), n);
  }
  function level(numId, ilvl) {
    const n = nums.get(numId); if (!n) return null;
    const absId = val(kid(n, 'abstractNumId')); const a = abstracts.get(absId); if (!a) return null;
    const lvl = (x) => kids(x, 'lvl').find((l) => +attr(l, 'ilvl') === ilvl);
    const override = kids(n, 'lvlOverride').find((o) => +attr(o, 'ilvl') === ilvl);
    const l = lvl(override) || lvl(a); if (!l) return null;
    const startOverride = val(kid(override, 'startOverride'));
    return { list: numId, fmt: val(kid(l, 'numFmt')) || 'decimal', text: val(kid(l, 'lvlText')) ?? '', start: +(startOverride ?? val(kid(l, 'start')) ?? 1), p: pProps(kid(l, 'pPr')), r: rProps(kid(l, 'rPr')) };
  }
  const styleName = (id) => val(kid(styles.get(id), 'name')) || id;
  return {
    levelOf: (numId, ilvl) => level(String(numId), ilvl),
    defaultStyle: () => defaultPara,
    // Paragraph styles: [{ id, name }] (Word's built-in names: "heading 1" shown as "Heading 1").
    styleList: () => [...styles.entries()].filter(([, el]) => attr(el, 'type') === 'paragraph').map(([id]) => ({ id, name: styleName(id).replace(/^heading (\d)$/i, 'Heading $1').replace(/^title$/i, 'Title').replace(/^subtitle$/i, 'Subtitle').replace(/^quote$/i, 'Quote').replace(/^normal$/i, 'Normal') })),
    // CSS for a gallery preview of a style (size capped so the gallery stays one row).
    styleCss: (id) => { const x = style(id || defaultPara); const r = { ...base.r, ...x.r }; const shade = x.p.shade || base.p.shade; return runCss({ ...r, sz: Math.min(r.sz || 11, 14), szCs: Math.min(r.szCs || r.sz || 11, 14) }, false) + (shade ? `;background:${shade};padding:0 4px;border-radius:3px` : ''); },
    para(p) {
      const pPr = kid(p, 'pPr'); const st = style(val(kid(pPr, 'pStyle')) || defaultPara);
      const own = pProps(pPr); const merged = { ...base.p, ...st.p, ...own, tabs: mergeTabs(st.p.tabs, own.tabs) };
      const lv = merged.numId && merged.numId !== '0' ? level(merged.numId, merged.ilvl || 0) : null;
      // The list level's indent applies unless the paragraph or its style sets one.
      return { p: lv ? { ...base.p, ...st.p, ...lv.p, ...own, tabs: merged.tabs } : merged, r: { ...base.r, ...st.r }, level: lv, ilvl: merged.ilvl || 0 };
    },
    // Table of contents paragraphs (styles "toc 1" … "toc 9"): Word shows their entries in the TOC style, not in the
    // Hyperlink character style their runs carry.
    isToc: (id) => !!id && /^toc \d$/i.test(styleName(id)),
    run(r, paraR, plainLinks = false) {
      const rPr = kid(r, 'rPr'); const cs = val(kid(rPr, 'rStyle'));
      const skip = plainLinks && cs && /^hyperlink$/i.test(styleName(cs));
      return { ...paraR, ...(skip ? {} : style(cs).r), ...rProps(rPr) };
    },
    // A paragraph style's own settings, for the style editor.
    styleLook: (id) => { const x = style(id || defaultPara); const r = { ...base.r, ...x.r }; const pp = { ...base.p, ...x.p }; return { font: r.ascii || r.cs || '', size: r.sz || 11, b: !!r.b, i: !!r.i, color: r.color || '#000000', jc: pp.jc || 'left', before: (pp.before || 0) / 20, after: (pp.after || 0) / 20 }; },
    tableBorders(tbl) { const tblPr = kid(tbl, 'tblPr'); const tb = kid(tblPr, 'tblBorders'); return tb ? hasBorder(tb) : style(val(kid(tblPr, 'tblStyle'))).borders; },
  };
}

// List markers: numbers in the level's format; bullets from symbol fonts shown as the matching Unicode character.
const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
const roman = (n) => ROMAN.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const letters = (n, abc) => abc[(n - 1) % abc.length].repeat(Math.floor((n - 1) / abc.length) + 1);
const THAI_LETTERS = 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ';
function formatNumber(n, fmt) {
  switch (fmt) {
    case 'lowerLetter': return letters(n, 'abcdefghijklmnopqrstuvwxyz');
    case 'upperLetter': return letters(n, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    case 'lowerRoman': return roman(n);
    case 'upperRoman': return roman(n).toUpperCase();
    case 'decimalZero': return String(n).padStart(2, '0');
    case 'thaiNumbers': case 'thaiCounting': return String(n).replace(/\d/g, (d) => String.fromCharCode(0x0E50 + +d));
    case 'thaiLetters': return letters(n, THAI_LETTERS);
    case 'none': return '';
    default: return String(n);
  }
}
const BULLETS = { '': '•', '': '▪', '': '➢', '': '✓', '': '❖', '': '◦', o: '◦' };

function paraCss(p) {
  const list = p.numId && p.numId !== '0';
  const s = [`margin:${pt(p.before || 0)} ${pt(p.right || 0)} ${pt(p.after || 0)} ${pt(p.left || (list ? 720 : 0))}`];
  if (p.jc) s.push(`text-align:${{ both: 'justify', distribute: 'justify', start: 'left', end: 'right' }[p.jc] || p.jc}`);
  // A list paragraph's marker hangs in the indent (::before); its text starts at the left indent.
  if (list) s.push(`--hang:${pt(p.hanging || 360)}`);
  else if (p.firstLine) s.push(`text-indent:${pt(p.firstLine)}`); else if (p.hanging) s.push(`text-indent:-${pt(p.hanging)}`);
  for (const [side, b] of Object.entries(p.border || {})) s.push(`border-${side}:${b.width}pt solid ${b.color}`, `padding-${side}:${b.space}pt`);
  if (p.line) s.push(p.lineRule === 'exact' || p.lineRule === 'atLeast' ? `line-height:${pt(p.line)}` : `line-height:${(p.line / 240 * 1.2).toFixed(2)}`);
  if (p.shade) s.push(`background:${p.shade}`);
  return s.join(';');
}
// Thai text uses the complex-script font, size, bold and italic, as Word does.
function runCss(r, thai) {
  const fonts = (thai ? [r.cs, r.ascii] : [r.ascii, r.cs]).filter(Boolean).map((f) => `"${f}"`);
  const size = (thai ? r.szCs ?? r.sz : r.sz) || 11;
  const s = [`font-family:${[...fonts, 'sans-serif'].join(',')}`, `font-size:${size}pt`];
  // Off is written too: a run can turn off the bold or italic of its paragraph's style (TOC entries do).
  const bold = thai ? r.bCs ?? r.b : r.b; const ital = thai ? r.iCs ?? r.i : r.i;
  if (bold != null) s.push(`font-weight:${bold ? 'bold' : 'normal'}`);
  if (ital != null) s.push(`font-style:${ital ? 'italic' : 'normal'}`);
  const deco = [r.u && 'underline', r.strike && 'line-through'].filter(Boolean); if (deco.length) s.push(`text-decoration:${deco.join(' ')}`);
  if (r.color) s.push(`color:${r.color}`);
  if (r.highlight || r.shade) s.push(`background:${r.highlight || r.shade}`);
  if (r.caps) s.push('text-transform:uppercase');
  if (r.vertAlign === 'superscript' || r.vertAlign === 'subscript') s.push(`vertical-align:${r.vertAlign === 'superscript' ? 'super' : 'sub'};font-size:${size * 0.65}pt`);
  return s.join(';');
}

// Opens the editor in `root`. bytes: the .docx (ArrayBuffer). Resolves { isDirty(), save() }; save() resolves the
// edited .docx as an ArrayBuffer.
export async function openDocxEditor(root, bytes) {
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(bytes.slice(0)); } catch { zip = null; }
  const part = zip?.file('word/document.xml');
  if (!part) throw new Error('Could not read this file. Only .docx files can be edited (not old .doc files).');
  const xml = parse(await part.async('string'));
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const text = (path) => zip.file(path)?.async('string');
  let stylesXml = await text('word/styles.xml'); const themeXml = await text('word/theme/theme1.xml'); let numberingXml = await text('word/numbering.xml');
  let st = styleReader(stylesXml, themeXml, numberingXml);
  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = await zip.file(relsPath)?.async('string') || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1]; const t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t && !/TargetMode="External"/.test(m[0])) rels[id] = t.startsWith('/') ? t.slice(1) : `word/${t}`.replace(/[^/]+\/\.\.\//g, '');
  }
  const changedParts = new Set(); // other parts written on save (styles, numbering, rels, content types, media)

  // Each paragraph's own text pieces (pieces of a text box inside it belong to the text box's paragraphs).
  const pieces = new Map();
  for (const el of xml.getElementsByTagNameNS(W, '*')) {
    if (!isPiece(el)) continue;
    const p = ancestor(el, 'p'); if (!p || ancestor(p, 'txbxContent')) continue;
    if (!pieces.has(p)) pieces.set(p, []);
    pieces.get(p).push(el);
  }

  const items = []; // { p, div, struct, plain, align }: one per paragraph shown
  const runRefs = []; const hyperRefs = []; // spans point at their source w:r (data-ri) and w:hyperlink (data-h)
  function image(drawing) {
    const span = document.createElement('span'); span.className = 'de-img'; span.contentEditable = 'false';
    const ext = drawing.getElementsByTagNameNS(WP, 'extent')[0];
    const w = +ext?.getAttribute('cx') / 9525 || 0; const h = +ext?.getAttribute('cy') / 9525 || 0; // EMU -> px
    const rid = drawing.getElementsByTagNameNS(A, 'blip')[0]?.getAttributeNS(R, 'embed');
    const file = rid && rels[rid] && zip.file(rels[rid]);
    if (!file) return span;
    const img = document.createElement('img'); img.alt = ''; if (w) { img.width = w; img.height = h; }
    file.async('blob').then((b) => { img.src = URL.createObjectURL(b); });
    span.append(img);
    return span;
  }
  const counters = new Map();
  function marker(lv, ilvl) {
    if (lv.fmt === 'bullet') return BULLETS[lv.text] || lv.text || '•';
    const c = counters.get(lv.list) || []; counters.set(lv.list, c);
    c[ilvl] = c[ilvl] == null ? lv.start : c[ilvl] + 1; c.length = ilvl + 1;
    return lv.text.replace(/%(\d)/g, (_, k) => formatNumber(c[k - 1] ?? 1, k - 1 === ilvl ? lv.fmt : 'decimal'));
  }
  function renderPara(p, i = items.length) {
    const { p: pp, r: pr, level: lv, ilvl } = st.para(p);
    const div = document.createElement('div');
    div.className = 'de-p'; div.dataset.i = i;
    div.style.cssText = `${runCss(pr, false)};${paraCss(pp)}`;
    if (lv) { div.classList.add('de-li'); div.dataset.num = `${lv.list}:${ilvl}`; if (lv.r.b) div.style.setProperty('--mark-weight', 'bold'); }
    const sid = val(kid(kid(p, 'pPr'), 'pStyle')); if (sid) div.dataset.style = sid;
    const toc = st.isToc(sid);
    if (pp.tabs?.length) div.dataset.tabs = JSON.stringify(pp.tabs.map((t) => [t.val, t.pos, t.leader]));
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      if (ancestor(r, 'p') !== p || ancestor(r, 'del')) continue;
      const rp = st.run(r, pr, toc); const ri = runRefs.push(r) - 1;
      const h = ancestor(r, 'hyperlink'); const hi = h ? (hyperRefs.indexOf(h) + 1 || hyperRefs.push(h)) - 1 : null;
      const txt = [...r.children].filter(isPiece).map(pieceText).join('');
      let span = null; let shown = false;
      for (const c of r.children) {
        if (isPiece(c)) {
          if (!span) { span = document.createElement('span'); span.style.cssText = runCss(rp, THAI.test(txt)); span.dataset.ri = ri; if (hi != null) { span.dataset.h = hi; span.classList.add('de-a'); } div.append(span); }
          if (pieceText(c) === '\n') span.append(document.createElement('br'));
          else if (c.localName === 'tab') { const t = document.createElement('span'); t.className = 'de-tab'; t.contentEditable = 'false'; t.textContent = '\t'; span.append(t); }
          else span.append(pieceText(c));
          shown = true;
        } else if (c.localName === 'drawing' || c.localName === 'pict') { span = null; const im = c.localName === 'drawing' ? image(c) : document.createElement('span'); im.classList.add('de-img'); im.contentEditable = 'false'; im.dataset.ri = ri; im.dataset.keep = '1'; div.append(im); shown = true; }
      }
      // Runs with nothing to show (field codes, footnote marks, …) stay in place, untouched.
      if (!shown && [...r.children].some((c) => c.localName !== 'rPr')) { const k = document.createElement('span'); k.className = 'de-keep'; k.contentEditable = 'false'; k.dataset.ri = ri; k.dataset.keep = '1'; div.append(k); }
    }
    if (!div.childNodes.length) div.append(document.createElement('br'));
    items[i] = { p, div, struct: structOf(div), plain: plainText(div), align: div.style.textAlign };
    return div;
  }
  const tcOf = new WeakMap();
  function renderTable(tbl) {
    const table = document.createElement('table');
    table.className = `de-tbl${st.tableBorders(tbl) ? ' de-borders' : ''}`;
    if (val(kid(kid(tbl, 'tblPr'), 'jc')) === 'center') table.style.margin = '0 auto';
    for (const tr of kids(tbl, 'tr')) {
      const row = table.insertRow();
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr'); const td = row.insertCell(); tcOf.set(td, tc);
        const span = +val(kid(tcPr, 'gridSpan')) || 1; if (span > 1) td.colSpan = span;
        const vm = kid(tcPr, 'vMerge'); if (vm && val(vm) !== 'restart') td.classList.add('de-vcont');
        const w = kid(tcPr, 'tcW'); if (attr(w, 'type') === 'dxa') td.style.width = `${+attr(w, 'w') / 15}px`;
        const fill = attr(kid(tcPr, 'shd'), 'fill'); if (fill && fill !== 'auto') td.style.background = `#${fill}`;
        const va = val(kid(tcPr, 'vAlign')); if (va) td.style.verticalAlign = va === 'center' ? 'middle' : va;
        renderBlock(tc, td);
      }
    }
    return table;
  }
  function renderBlock(el, into) {
    for (const c of el.children) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === 'p') into.append(renderPara(c));
      else if (c.localName === 'tbl') into.append(renderTable(c));
      else if (c.localName === 'sdt' || c.localName === 'customXml') renderBlock(kid(c, 'sdtContent') || c, into);
    }
  }
  // A paragraph's text (pieces: text, \t, \n from <br>), and its shape without the text (to tell a text-only edit).
  function plainText(div) {
    let s = '';
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) s += c.data.replace(/ /g, ' '); else if (c.nodeName === 'BR') { if (c !== n.lastChild || n !== div) s += '\n'; } else if (!c.dataset?.keep) walk(c); } };
    walk(div); return s.replace(/\n$/, '');
  }
  function structOf(div) { const c = div.cloneNode(true); c.querySelectorAll('.de-tab').forEach((t) => { t.removeAttribute('style'); t.removeAttribute('data-leader'); }); const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); const ts = []; for (let n = w.nextNode(); n; n = w.nextNode()) ts.push(n); ts.forEach((t) => { t.data = ''; }); return c.innerHTML.replace(/<br>/g, ''); }
  function renumber() {
    counters.clear();
    page.querySelectorAll('.de-p').forEach((d) => {
      if (!d.dataset.num) { delete d.dataset.marker; d.classList.remove('de-li'); return; }
      const [numId, ilvl] = d.dataset.num.split(':'); const lv = st.levelOf(numId, +ilvl);
      if (!lv) return; d.classList.add('de-li'); d.dataset.marker = marker(lv, +ilvl);
    });
  }

  // Tab stops, as Word lays them out: each tab runs to the next stop after it (the paragraph's own stops, else every
  // 0.5 in), measured from the left margin. Right and centre stops line up the text after the tab with the stop; dot,
  // hyphen and underscore leaders fill the gap (a table of contents). Laid out again whenever the page's text changes.
  const DEFAULT_TAB = 720;
  function layoutTabs(div, left0, z) {
    const tabs = div.querySelectorAll('.de-tab'); if (!tabs.length) return;
    const stops = JSON.parse(div.dataset.tabs || '[]').filter(([v]) => v !== 'bar' && v !== 'clear');
    tabs.forEach((t) => { t.style.width = '0px'; });
    tabs.forEach((t, k) => {
      const x = (t.getBoundingClientRect().left - left0) / z;
      const hit = stops.find(([, pos]) => pos / 15 > x + 0.5) || ['left', (Math.floor((x * 15) / DEFAULT_TAB) + 1) * DEFAULT_TAB, 'none'];
      const [kind, pos, leader] = hit; const sx = pos / 15;
      let w = sx - x;
      if (kind !== 'left' && kind !== 'start' && kind !== 'num') {
        const r = document.createRange(); r.setStartAfter(t); if (tabs[k + 1]) r.setEndBefore(tabs[k + 1]); else r.setEnd(div, div.childNodes.length);
        const fw = r.getBoundingClientRect().width / z;
        w = kind === 'center' ? sx - x - fw / 2 : sx - x - fw;
      }
      t.style.width = `${Math.max(2, w)}px`;
      if (leader && leader !== 'none') t.dataset.leader = leader; else delete t.dataset.leader;
    });
  }
  let tabFrame = 0;
  function layoutAllTabs() {
    cancelAnimationFrame(tabFrame);
    tabFrame = requestAnimationFrame(() => {
      const pr = page.getBoundingClientRect(); const z = pr.width / page.offsetWidth || 1;
      const left0 = pr.left + parseFloat(getComputedStyle(page).paddingLeft) * z;
      page.querySelectorAll('.de-p').forEach((d) => { if (d.querySelector('.de-tab')) layoutTabs(d, left0, z); });
    });
  }

  // The page: its width and side margins from the document's last section.
  const sect = kid(body, 'sectPr'); const pgW = +attr(kid(sect, 'pgSz'), 'w') || 11906; const pgH = +attr(kid(sect, 'pgSz'), 'h') || 16838; const mar = kid(sect, 'pgMar');
  const margins = ['top', 'right', 'bottom', 'left'].map((k) => (+attr(mar, k) || 1440) / 15);
  const page = document.createElement('div'); page.className = 'de-page';
  page.style.cssText = `width:${pgW / 15}px;min-height:${pgH / 15}px;padding:${margins.map((m) => `${m}px`).join(' ')}`;
  renderBlock(body, page);
  if (!items.length) throw new Error('No text was found in this document.');
  renumber();
  page.contentEditable = 'true'; page.spellcheck = true; page.setAttribute('aria-label', 'Document page');
  new MutationObserver(layoutAllTabs).observe(page, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(layoutAllTabs); layoutAllTabs();
  const sheet = document.createElement('div'); sheet.className = 'de-sheet'; sheet.append(page);
  const ink = document.createElement('div'); ink.className = 'de-ink'; ink.innerHTML = '<svg class="de-svg" xmlns="http://www.w3.org/2000/svg"></svg>'; sheet.append(ink);

  // ---------- ribbon ----------
  const FONTS_W = ['TH Sarabun New', 'Calibri', 'Aptos', 'Arial', 'Tahoma', 'Cordia New', 'Angsana New', 'Noto Sans Thai', 'LINE Seed Sans TH', 'Times New Roman', 'Georgia'];
  const SIZES_W = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
  const spec = [
    fileTab('de', { open: 'Open a Word file (.docx)', download: 'Download .docx' }),
    { tab: 'Home', groups: [
      { label: 'Clipboard', items: [{ btn: 'de-cut', icon: RI.cut, title: 'Cut (Ctrl+X)' }, { btn: 'de-copy', icon: RI.copy, title: 'Copy (Ctrl+C)' }, { btn: 'de-paste', icon: RI.paste, title: 'Paste (Ctrl+V)' }] },
      { label: 'Font', items: [{ select: 'de-font', title: 'Font', options: FONTS_W, width: 140 }, { select: 'de-size', title: 'Font size', options: SIZES_W.map(String), width: 58 },
        { btn: 'de-b', icon: RI.bold, title: 'Bold (Ctrl+B)', toggle: true }, { btn: 'de-i', icon: RI.italic, title: 'Italic (Ctrl+I)', toggle: true }, { btn: 'de-u', icon: RI.underline, title: 'Underline (Ctrl+U)', toggle: true }, { btn: 'de-s', icon: RI.strike, title: 'Strikethrough', toggle: true },
        { color: 'de-fc', icon: RI.color, title: 'Font colour' }, { color: 'de-hl', icon: RI.hl, title: 'Highlight colour' }, { btn: 'de-clear', icon: '<span style="font:700 12px Georgia,serif">A✕</span>', title: 'Clear formatting' }] },
      { label: 'Paragraph', items: [{ btn: 'de-bul', icon: RI.bullets, title: 'Bullets', toggle: true }, { btn: 'de-num', icon: RI.numbers, title: 'Numbering', toggle: true }, { btn: 'de-out', icon: RI.outdent, title: 'Decrease indent (Shift+Tab in a list)' }, { btn: 'de-in', icon: RI.indent, title: 'Increase indent (Tab in a list)' },
        { btn: 'de-al', icon: RI.left, title: 'Align left', toggle: true }, { btn: 'de-ac', icon: RI.center, title: 'Center', toggle: true }, { btn: 'de-ar', icon: RI.right, title: 'Align right', toggle: true }, { btn: 'de-aj', icon: RI.justify, title: 'Justify', toggle: true },
        { select: 'de-line', title: 'Line spacing', options: [['', 'Spacing…'], ['240', '1.0'], ['276', '1.15'], ['360', '1.5'], ['480', '2.0']], width: 96 }] },
      { label: 'Styles', items: [{ html: '<div class="de-gal" id="de-gal" role="group" aria-label="Paragraph styles"></div>' }] },
    ] },
    { tab: 'Insert', groups: [
      { label: 'Draw on the page', items: [{ btn: 'de-t-text', icon: RI.select, title: 'Type in the document', toggle: true }, { btn: 'de-t-textbox', icon: RI.textbox, title: 'Text box', toggle: true }, { btn: 'de-t-pen', icon: RI.pen, title: 'Draw', toggle: true },
        { btn: 'de-t-line', icon: RI.line, title: 'Line', toggle: true }, { btn: 'de-t-arrow', icon: RI.arrow, title: 'Arrow', toggle: true }, { btn: 'de-t-rect', icon: RI.rect, title: 'Rectangle', toggle: true }] },
      { label: 'Shape style', items: [{ color: 'de-shc', icon: RI.color, title: 'Shape and text box colour' }, { select: 'de-shw', title: 'Line width', options: [['1', '1 pt'], ['1.5', '1.5 pt'], ['2', '2 pt'], ['3', '3 pt'], ['4.5', '4.5 pt'], ['6', '6 pt']], width: 76 }] },
    ] },
    { tab: 'Find & export', groups: [
      { label: 'Find', items: [{ btn: 'de-find', icon: RI.find, title: 'Find and replace (Ctrl+F / Ctrl+H)', text: 'Find & replace' }] },
      { label: 'Export', items: [{ btn: 'de-x-pdf', icon: RI.pdf, title: 'Export PDF (print to PDF)' }, { btn: 'de-x-txt', icon: RI.txt, title: 'Export plain text (.txt)' }, { btn: 'de-x-md', icon: RI.md, title: 'Export Markdown (.md)' }, { btn: 'de-x-html', icon: RI.html, title: 'Export web page (.html)' }] },
    ] },
  ];
  root.innerHTML = `<div class="oe de"><div class="oe-bar de-bar"><div class="de-top"></div>
      <div class="de-findbar" id="de-findbar" hidden><input id="de-q" class="rb-in" placeholder="Find…" aria-label="Find" autocomplete="off"><input id="de-r" class="rb-in" placeholder="Replace with…" aria-label="Replace with" autocomplete="off">
        <label class="de-chk"><input type="checkbox" id="de-case"> Match case</label><label class="de-chk"><input type="checkbox" id="de-word"> Whole word</label>
        <button type="button" class="rb-btn" id="de-prev" title="Previous match">↑</button><button type="button" class="rb-btn" id="de-next" title="Next match">↓</button>
        <button type="button" class="rb-btn" id="de-rep">Replace</button><button type="button" class="rb-btn" id="de-repall">Replace all</button><span class="de-count" id="de-count" role="status"></span>
        <button type="button" class="rb-btn" id="de-fclose" title="Close" aria-label="Close find">✕</button></div></div>
    <div class="oe-scroll de-doc"></div><div class="de-foot"><span id="de-wc" role="status"></span><span class="de-hintline">Edited paragraphs are marked on the left · typing --&gt; gives → and ==&gt; gives ➜</span></div>
    <div class="de-pop" id="de-pop" hidden></div></div>`;
  const $ = (s) => root.querySelector(s);
  const scroller = $('.de-doc'); const box = $('.oe');
  scroller.append(sheet);
  const rb = ribbon(spec, 'de', 1); $('.de-top').append(rb);
  const tools = document.createElement('span'); tools.className = 'oe-tools'; tools.innerHTML = viewBar('de', undefined, { help: true }); $('.de-top').append(tools);
  const view = cssZoom(box, scroller, () => sheet, 'de');
  requestAnimationFrame(() => { const room = scroller.clientWidth - 48; if (room > 0 && page.offsetWidth > room) view.zoomTo(room / page.offsetWidth); });
  fullScreen(box, 'de', 'oe-full');
  floatBar(box, $('.oe-bar'));
  const syncFc = pairHex($('#de-fc')); const syncHl = pairHex($('#de-hl')); pairHex($('#de-shc'));
  $('#de-fc').value = '#c00000'; syncFc(); $('#de-hl').value = '#ffff00'; syncHl(); $('#de-shc').value = '#c00000'; $('#de-shc').dispatchEvent(new Event('input'));

  // ---------- paragraphs: which one, commit, redraw ----------
  const paraOf = (n) => (n?.nodeType === 3 ? n.parentElement : n)?.closest?.('.de-p');
  const selParas = () => {
    const s = getSelection(); if (!s.rangeCount || !page.contains(s.anchorNode)) return [];
    const r = s.getRangeAt(0); const all = [...page.querySelectorAll('.de-p')];
    const a = paraOf(r.startContainer), b = paraOf(r.endContainer); if (!a) return [];
    const i = all.indexOf(a), j = Math.max(i, all.indexOf(b)); return all.slice(i, j + 1);
  };
  // The XML paragraph for a div: its own, or a new one (Enter made the div), placed after the previous paragraph.
  const ownerOf = new WeakMap(); // div -> p for divs whose item index is shared with an earlier div (made by Enter)
  function pOf(div, claimed) {
    const i = div.dataset.i;
    if (i != null && !claimed.has(i) && items[+i]?.div === div) { claimed.add(i); return { p: items[+i].p, item: items[+i] }; }
    if (ownerOf.has(div)) return { p: ownerOf.get(div), item: null };
    const src = i != null ? items[+i]?.p : null;
    const p = xml.createElementNS(W, 'w:p'); const sp = src && kid(src, 'pPr');
    if (sp) { const c = sp.cloneNode(true); [...c.children].filter((x) => x.localName === 'sectPr' || x.localName === 'pPrChange').forEach((x) => x.remove()); p.append(c); }
    // After the previous paragraph in the same container (page or table cell).
    let prev = div.previousElementSibling; while (prev && !prev.classList.contains('de-p')) prev = prev.previousElementSibling;
    const prevP = prev ? (items[+prev.dataset.i]?.div === prev ? items[+prev.dataset.i].p : ownerOf.get(prev)) : null;
    if (prevP?.parentNode) prevP.after(p);
    else { const td = div.closest('td'); const cont = td ? tcOf.get(td) : body; const first = [...cont.children].find((x) => x.localName === 'p' || x.localName === 'tbl'); if (first) first.before(p); else if (cont === body && sect) sect.before(p); else cont.append(p); }
    ownerOf.set(div, p);
    return { p, item: null };
  }
  // Writes a div's content into its XML paragraph when it changed. Text-only edits keep every run (setText);
  // formatting edits rebuild the runs from the page, each starting from its source run's formatting.
  function commit(div, claimed = new Set()) {
    const { p, item } = pOf(div, claimed);
    const txt = plainText(div);
    if (item && structOf(div) === item.struct) { if (txt !== item.plain) setText(p, txt); }
    else rebuildRuns(p, div);
    if (item && div.style.textAlign !== item.align) setJc(p, div.style.textAlign);
    if (!item && div.style.textAlign) setJc(p, div.style.textAlign);
    return p;
  }
  function redraw(div, p) {
    const i = items.findIndex((it) => it?.div === div); const nd = renderPara(p, i >= 0 ? i : items.length);
    div.replaceWith(nd); ownerOf.delete(div); renumber(); return nd;
  }
  // Paragraph commands: commit, change the XML, redraw; one undo step (the paragraphs' XML before and after).
  const custom = { undo: [], redo: [] }; let lastNative = 0;
  function paraCmd(fn, label) {
    const divs = selParas(); if (!divs.length) { status('Click in a paragraph first.'); return; }
    const sel = saveSel(); const claimed = new Set(); const recs = [];
    for (const d of divs) {
      const p = commit(d, claimed); const before = p.cloneNode(true); fn(p); recs.push({ p, before, after: p.cloneNode(true) });
      redraw(d, p);
    }
    custom.undo.push({ recs, label, t: performance.now() }); custom.redo = []; dirty = true;
    restoreSel(sel); refreshState();
  }
  function applyRecs(recs, which) {
    for (const r of recs) {
      const div = [...page.querySelectorAll('.de-p')].find((d) => items[+d.dataset.i]?.p === r.p || ownerOf.get(d) === r.p);
      const nx = r[which].cloneNode(true); r.p.replaceWith(nx);
      const it = items.find((x) => x?.p === r.p); if (it) it.p = nx;
      if (div) { if (ownerOf.get(div) === r.p) ownerOf.set(div, nx); redraw(div, nx); }
      recs.forEach((q) => { if (q !== r && q.p === r.p) q.p = nx; }); r.p = nx;
    }
  }
  // Selection as paragraph index + text offsets, so it survives a redraw.
  function saveSel() {
    const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); const all = [...page.querySelectorAll('.de-p')];
    const pos = (n, o) => { const d = paraOf(n); if (!d) return null; const pre = document.createRange(); pre.selectNodeContents(d); pre.setEnd(n, o); return { i: all.indexOf(d), o: pre.toString().length }; };
    return { a: pos(r.startContainer, r.startOffset), b: pos(r.endContainer, r.endOffset) };
  }
  function restoreSel(sv) {
    if (!sv?.a) return; const all = [...page.querySelectorAll('.de-p')];
    const at = ({ i, o }) => { const d = all[i]; if (!d) return null; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let left = o; for (let n = w.nextNode(); n; n = w.nextNode()) { if (left <= n.data.length) return [n, left]; left -= n.data.length; } return [d, d.childNodes.length]; };
    const a = at(sv.a), b = sv.b ? at(sv.b) : a; if (!a || !b) return;
    const r = document.createRange(); try { r.setStart(...a); r.setEnd(...b); } catch { return; }
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  // ---------- XML helpers ----------
  const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];
  const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
  const wEl = (name, attrs = {}) => { const e = xml.createElementNS(W, `w:${name}`); Object.entries(attrs).forEach(([k, v]) => e.setAttributeNS(W, `w:${k}`, v)); return e; };
  function setChild(parent, order, name, el) {
    kids(parent, name).forEach((x) => x.remove()); if (!el) return;
    const at = order.indexOf(name); const next = [...parent.children].find((c) => order.indexOf(c.localName) > at);
    if (next) next.before(el); else parent.append(el);
  }
  const pPrOf = (p) => { let pp = kid(p, 'pPr'); if (!pp) { pp = wEl('pPr'); p.prepend(pp); } return pp; };
  const setJc = (p, align) => setChild(pPrOf(p), PPR_ORDER, 'jc', align ? wEl('jc', { val: { left: 'left', center: 'center', right: 'right', justify: 'both', start: 'left', end: 'right' }[align] || 'left' }) : null);

  // Rebuilds a paragraph's runs from its div. Each text keeps its source run's properties, plus what changed on the
  // page (bold, italic, underline, strike, colour, highlight, size, font) compared with the source run.
  const rgbHex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m || m[4] === '0') return null; return [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  function looks(el, div) {
    const cs = getComputedStyle(el); let deco = ''; let bg = null;
    for (let e = el; e && e !== div.parentElement; e = e.parentElement) { const c = getComputedStyle(e); deco += ` ${c.textDecorationLine || ''}`; if (!bg && e !== div) bg = rgbHex(c.backgroundColor); }
    return { b: +cs.fontWeight >= 600 || cs.fontWeight === 'bold', i: /italic|oblique/.test(cs.fontStyle), u: deco.includes('underline'), s: deco.includes('line-through'),
      color: rgbHex(cs.color), bg, sz: Math.round(parseFloat(cs.fontSize) * 0.75 * 2), font: cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '') };
  }
  function rebuildRuns(p, div) {
    const out = []; // { ri, props, h, text } or { keep: ri }
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          if (!c.data) continue;
          const src = c.parentElement.closest('[data-ri]'); const inDiv = src && div.contains(src) ? src : null;
          const now = looks(c.parentElement, div); const base = looks(inDiv || div, div);
          const props = {}; for (const k of Object.keys(now)) if (now[k] !== base[k]) props[k] = now[k];
          const ri = inDiv ? +inDiv.dataset.ri : null; const h = c.parentElement.closest('[data-h]')?.dataset.h ?? null; const key = JSON.stringify([ri, props, h]);
          const last = out.at(-1); const t = c.data.replace(/ /g, ' ');
          if (last && last.key === key) last.text += t; else out.push({ key, ri, props, h, text: t });
        } else if (c.nodeName === 'BR') {
          if (c === div.lastChild && n === div) continue;
          const last = out.at(-1); if (last && !last.keep) last.text += '\n'; else out.push({ key: '"br"', ri: null, props: {}, h: null, text: '\n' });
        } else if (c.dataset?.keep) out.push({ keep: +c.dataset.ri });
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(div);
    // Remove the old runs (and the run containers that only held runs), then add the new ones.
    [...p.children].filter((c) => ['r', 'hyperlink', 'ins', 'del', 'smartTag', 'proofErr', 'fldSimple'].includes(c.localName)).forEach((c) => c.remove());
    const markR = kid(kid(p, 'pPr'), 'rPr');
    let hyperEl = null; let hyperIdx = null;
    for (const o of out) {
      let run;
      if (o.keep != null) run = runRefs[o.keep].cloneNode(true);
      else {
        run = wEl('r'); const srcR = o.ri != null ? runRefs[o.ri] : null;
        const rp = srcR && kid(srcR, 'rPr') ? kid(srcR, 'rPr').cloneNode(true) : markR ? (() => { const c = markR.cloneNode(true); [...c.children].filter((x) => x.localName === 'ins' || x.localName === 'del').forEach((x) => x.remove()); return c; })() : wEl('rPr');
        applyProps(rp, o.props); if (rp.children.length) run.append(rp);
        run.append(...textPieces(o.text));
      }
      const h = o.keep != null ? (ancestor(runRefs[o.keep], 'hyperlink') ? hyperRefs.indexOf(ancestor(runRefs[o.keep], 'hyperlink')) : null) : o.h != null ? +o.h : null;
      if (h != null && h >= 0) { if (hyperIdx !== h) { hyperEl = hyperRefs[h].cloneNode(false); hyperIdx = h; p.append(hyperEl); } hyperEl.append(run); }
      else { hyperEl = null; hyperIdx = null; p.append(run); }
    }
    pieces.set(p, [...p.getElementsByTagNameNS(W, '*')].filter(isPiece));
  }
  function applyProps(rp, pr) {
    const onoff = (name, on) => setChild(rp, RPR_ORDER, name, wEl(name, on ? {} : { val: '0' }));
    if ('b' in pr) { onoff('b', pr.b); onoff('bCs', pr.b); }
    if ('i' in pr) { onoff('i', pr.i); onoff('iCs', pr.i); }
    if ('u' in pr) setChild(rp, RPR_ORDER, 'u', wEl('u', { val: pr.u ? 'single' : 'none' }));
    if ('s' in pr) onoff('strike', pr.s);
    if ('color' in pr && pr.color) setChild(rp, RPR_ORDER, 'color', wEl('color', { val: pr.color }));
    if ('bg' in pr) { setChild(rp, RPR_ORDER, 'highlight', null); setChild(rp, RPR_ORDER, 'shd', pr.bg ? wEl('shd', { val: 'clear', color: 'auto', fill: pr.bg }) : null); }
    if ('sz' in pr && pr.sz) { setChild(rp, RPR_ORDER, 'sz', wEl('sz', { val: String(pr.sz) })); setChild(rp, RPR_ORDER, 'szCs', wEl('szCs', { val: String(pr.sz) })); }
    if ('font' in pr && pr.font && pr.font !== 'sans-serif') setChild(rp, RPR_ORDER, 'rFonts', wEl('rFonts', { ascii: pr.font, hAnsi: pr.font, cs: pr.font, eastAsia: pr.font }));
  }
  function textPieces(t) {
    const out = [];
    t.split('\n').forEach((line, li) => {
      if (li) out.push(xml.createElementNS(W, 'w:br'));
      line.split('\t').forEach((part, pi) => {
        if (pi) out.push(xml.createElementNS(W, 'w:tab'));
        if (!part) return;
        const e = xml.createElementNS(W, 'w:t'); e.setAttributeNS(XML_NS, 'xml:space', 'preserve'); e.textContent = part; out.push(e);
      });
    });
    return out;
  }
  // Replace a paragraph's text, keeping each run's formatting: only the part between the unchanged start and end is
  // rewritten, and new text takes the formatting of the character before it.
  function setText(p, txt) {
    const old = pieces.get(p) || [];
    if (!old.length) {
      const run = wEl('r'); const markRPr = kid(kid(p, 'pPr'), 'rPr');
      if (markRPr) { const rPr = markRPr.cloneNode(true); [...rPr.children].filter((c) => c.localName === 'ins' || c.localName === 'del').forEach((c) => c.remove()); run.append(rPr); }
      const added = textPieces(txt); run.append(...added); p.append(run); pieces.set(p, added); return;
    }
    const oldText = old.map(pieceText).join('');
    const { keep, ins } = diff(oldText, txt);
    const result = []; let off = 0;
    old.forEach((el, n) => {
      const t = pieceText(el); const from = off; off += t.length;
      let s = n === 0 ? ins[0] : ''; let same = !s;
      for (let k = from; k < off; k++) { if (keep[k]) s += oldText[k]; else same = false; if (ins[k + 1]) { s += ins[k + 1]; same = false; } }
      if (same) { result.push(el); return; }
      const repl = textPieces(s); el.replaceWith(...repl); result.push(...repl);
    });
    pieces.set(p, result);
  }
  function diff(a, b) {
    const n = a.length, m = b.length;
    const keep = new Array(n).fill(false); const ins = new Array(n + 1).fill('');
    if ((n + 1) * (m + 1) > 4e6) {
      let s = 0; while (s < n && s < m && a[s] === b[s]) s++;
      let e = 0; while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
      for (let i = 0; i < n; i++) keep[i] = i < s || i >= n - e;
      ins[n - e] = b.slice(s, m - e); return { keep, ins };
    }
    const L = new Uint32Array((n + 1) * (m + 1)); const at = (i, j) => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[at(i, j)] = a[i] === b[j] ? L[at(i + 1, j + 1)] + 1 : Math.max(L[at(i + 1, j)], L[at(i, j + 1)]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) { keep[i] = true; i++; j++; }
      else if (j < m && (i === n || L[at(i, j + 1)] >= L[at(i + 1, j)])) { ins[i] += b[j]; j++; }
      else i++;
    }
    return { keep, ins };
  }

  // ---------- Home: text formatting (the browser's editing commands, so Ctrl+Z undoes them) ----------
  let dirty = false;
  const status = (s) => { $('#de-wc').dataset.msg = s; wordCount(); clearTimeout(status.t); status.t = setTimeout(() => { delete $('#de-wc').dataset.msg; wordCount(); }, 4000); };
  const inPage = () => { const s = getSelection(); return s && s.rangeCount && page.contains(s.getRangeAt(0).commonAncestorContainer); };
  const fmt = (cmd, v = null, css = false) => { if (!inPage()) { status('Select text in the document first.'); return; } exec('styleWithCSS', css); exec(cmd, v); exec('styleWithCSS', false); dirty = true; refreshState(); };
  $('#de-b').onclick = () => fmt('bold'); $('#de-i').onclick = () => fmt('italic'); $('#de-u').onclick = () => fmt('underline'); $('#de-s').onclick = () => fmt('strikeThrough');
  $('#de-clear').onclick = () => fmt('removeFormat');
  $('#de-fc').addEventListener('change', (e) => fmt('foreColor', e.target.value, true));
  $('#de-hl').addEventListener('change', (e) => fmt('hiliteColor', e.target.value, true));
  // Font and size: the browser marks the selection with <font>; it becomes a span with the exact font or size.
  function fontCmd(kind, v) {
    if (!inPage()) { status('Select text in the document first.'); return; }
    exec('styleWithCSS', false); exec(kind === 'face' ? 'fontName' : 'fontSize', kind === 'face' ? v : '7');
    page.querySelectorAll(kind === 'face' ? `font[face="${CSS.escape(v)}"]` : 'font[size="7"]').forEach((f) => {
      const s = document.createElement('span'); if (kind === 'face') s.style.fontFamily = `'${v}'`; else s.style.fontSize = `${v}pt`;
      s.append(...f.childNodes); f.replaceWith(s);
    });
    dirty = true; refreshState();
  }
  $('#de-font').onchange = (e) => fontCmd('face', e.target.value);
  $('#de-size').onchange = (e) => fontCmd('size', e.target.value);
  const align = (a) => fmt({ left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }[a]);
  $('#de-al').onclick = () => align('left'); $('#de-ac').onclick = () => align('center'); $('#de-ar').onclick = () => align('right'); $('#de-aj').onclick = () => align('justify');
  $('#de-cut').onclick = () => fmt('cut'); $('#de-copy').onclick = () => exec('copy');
  $('#de-paste').onclick = async () => { try { const t = await navigator.clipboard.readText(); fmt('insertText', t); } catch { status('Paste with Ctrl+V (the browser blocked reading the clipboard).'); } };

  // ---------- Paragraph: lists, indent, spacing, styles ----------
  const numbering = { bullet: null, decimal: null };
  async function ensureNumbering(kind) {
    if (numbering[kind]) return numbering[kind];
    let nx = numberingXml ? parse(numberingXml) : parse(`<w:numbering xmlns:w="${W}"/>`);
    const root0 = nx.documentElement;
    const absIds = [...root0.getElementsByTagNameNS(W, 'abstractNum')].map((a) => +attr(a, 'abstractNumId'));
    const numIds = [...root0.getElementsByTagNameNS(W, 'num')].map((n) => +attr(n, 'numId'));
    const absId = Math.max(-1, ...absIds) + 1; const numId = Math.max(0, ...numIds) + 1;
    const lvls = Array.from({ length: 9 }, (_, l) => {
      const ind = 720 * (l + 1);
      return kind === 'bullet'
        ? `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][l % 3]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${ind}" w:hanging="360"/></w:pPr></w:lvl>`
        : `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman'][l % 3]}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${ind}" w:hanging="360"/></w:pPr></w:lvl>`;
    }).join('');
    const frag = parse(`<x xmlns:w="${W}"><w:abstractNum w:abstractNumId="${absId}"><w:multiLevelType w:val="hybridMultilevel"/>${lvls}</w:abstractNum><w:num w:numId="${numId}"><w:abstractNumId w:val="${absId}"/></w:num></x>`).documentElement;
    const [abs, num] = [...frag.children].map((c) => nx.importNode(c, true));
    const firstNum = [...root0.children].find((c) => c.localName === 'num');
    if (firstNum) firstNum.before(abs); else root0.append(abs);
    root0.append(num);
    numberingXml = new XMLSerializer().serializeToString(nx); changedParts.add('numbering');
    if (!zip.file('word/numbering.xml') && !numbering.relAdded) {
      numbering.relAdded = true;
      addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering', 'numbering.xml');
      await addContentType('/word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml', true);
    }
    st = styleReader(stylesXml, themeXml, numberingXml);
    numbering[kind] = String(numId); return numbering[kind];
  }
  async function listCmd(kind) {
    const nid = await ensureNumbering(kind);
    const first = selParas()[0]; const on = first?.dataset.num?.split(':')[0] === nid; // pressing it again turns the list off
    paraCmd((p) => {
      const pp = pPrOf(p);
      if (on) setChild(pp, PPR_ORDER, 'numPr', null);
      else { const np = wEl('numPr'); np.append(wEl('ilvl', { val: '0' }), wEl('numId', { val: nid })); setChild(pp, PPR_ORDER, 'numPr', np); }
    }, kind === 'bullet' ? 'bullets' : 'numbering');
  }
  $('#de-bul').onclick = () => listCmd('bullet'); $('#de-num').onclick = () => listCmd('decimal');
  function indentCmd(d) {
    paraCmd((p) => {
      const pp = pPrOf(p); const np = kid(pp, 'numPr');
      if (np) { const lv = kid(np, 'ilvl') || (() => { const e = wEl('ilvl', { val: '0' }); np.prepend(e); return e; })(); lv.setAttributeNS(W, 'w:val', String(Math.max(0, Math.min(8, (+val(lv) || 0) + d)))); return; }
      const ind = kid(pp, 'ind'); const left = Math.max(0, (+attr(ind, 'left') || +attr(ind, 'start') || 0) + d * 720);
      const ne = ind ? ind.cloneNode(true) : wEl('ind'); ne.removeAttributeNS(W, 'start'); ne.setAttributeNS(W, 'w:left', String(left)); setChild(pp, PPR_ORDER, 'ind', ne);
    }, d > 0 ? 'indent' : 'outdent');
  }
  $('#de-in').onclick = () => indentCmd(1); $('#de-out').onclick = () => indentCmd(-1);
  $('#de-line').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (!v) return; paraCmd((p) => { const pp = pPrOf(p); const sp = kid(pp, 'spacing'); const ne = sp ? sp.cloneNode(true) : wEl('spacing'); ne.setAttributeNS(W, 'w:line', v); ne.setAttributeNS(W, 'w:lineRule', 'auto'); setChild(pp, PPR_ORDER, 'spacing', ne); }, 'line spacing'); };
  // Styles gallery: the document's own paragraph styles; Heading 1–3, Title and Quote are added if it has none.
  const WANT = [['Normal', null], ['Title', '<w:rPr><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>'], ['Subtitle', '<w:rPr><w:color w:val="595959"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>'],
    ['Heading 1', '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3864"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>'],
    ['Heading 2', '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="2F5496"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr>'],
    ['Heading 3', '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3864"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>'],
    ['Quote', '<w:pPr><w:spacing w:before="160" w:after="160"/><w:ind w:left="864" w:right="864"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="404040"/></w:rPr>']];
  function galleryStyles() {
    const list = st.styleList();
    return WANT.map(([name]) => list.find((s) => s.name.toLowerCase() === name.toLowerCase()) || { id: name.replace(/\s/g, ''), name, missing: true });
  }
  function drawGallery() {
    $('#de-gal').innerHTML = galleryStyles().map((s) => { const pv = st.styleCss(s.missing ? null : s.id); return `<button type="button" class="de-sty rb-btn" data-style="${s.id}" data-name="${s.name}" title="${s.name}${presets()[s.name] ? ' (your saved style)' : ''} · right-click to change it"><span style="${pv.replace(/"/g, "'")}">${s.name}</span></button>`; }).join('')
      + `<button type="button" class="rb-btn de-stymod" id="de-stymod" title="Change a style's font, size, colour and spacing">Modify…</button>`;
  }
  // Style presets: kept in this browser (localStorage) by style name, so "my Heading 1" follows the user into other
  // documents. A preset is written into a document's styles.xml the first time that style is used there.
  const PRESET_KEY = 'word-style-presets';
  const presets = () => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch { return {}; } };
  const savePresets = (o) => { try { localStorage.setItem(PRESET_KEY, JSON.stringify(o)); } catch { /* storage off: this document only */ } };
  const presetDone = new Set();
  function writeStyle(id, look) {
    const sx = parse(stylesXml); const el = [...sx.getElementsByTagNameNS(W, 'style')].find((x) => attr(x, 'styleId') === id); if (!el) return;
    const mk = (name, attrs = {}) => { const e = sx.createElementNS(W, `w:${name}`); Object.entries(attrs).forEach(([k, v]) => e.setAttributeNS(W, `w:${k}`, v)); return e; };
    const part = (name) => { let e = kid(el, name); if (!e) { e = mk(name); const after = name === 'pPr' ? (kid(el, 'rPr') || kid(el, 'tblPr')) : kid(el, 'tblPr'); if (after) after.before(e); else el.append(e); } return e; };
    const set = (parent, order, name, e) => { kids(parent, name).forEach((x) => x.remove()); if (!e) return; const at = order.indexOf(name); const next = [...parent.children].find((c) => order.indexOf(c.localName) > at); if (next) next.before(e); else parent.append(e); };
    const pp = part('pPr'); const rp = part('rPr');
    set(pp, PPR_ORDER, 'jc', mk('jc', { val: look.jc === 'justify' ? 'both' : look.jc }));
    const sp = kid(pp, 'spacing')?.cloneNode(true) || mk('spacing'); sp.setAttributeNS(W, 'w:before', String(Math.round(look.before * 20))); sp.setAttributeNS(W, 'w:after', String(Math.round(look.after * 20))); set(pp, PPR_ORDER, 'spacing', sp);
    if (look.font) set(rp, RPR_ORDER, 'rFonts', mk('rFonts', { ascii: look.font, hAnsi: look.font, cs: look.font, eastAsia: look.font }));
    for (const [k, on] of [['b', look.b], ['bCs', look.b], ['i', look.i], ['iCs', look.i]]) set(rp, RPR_ORDER, k, mk(k, { val: on ? '1' : '0' }));
    set(rp, RPR_ORDER, 'color', mk('color', { val: look.color.replace('#', '').toUpperCase() }));
    set(rp, RPR_ORDER, 'sz', mk('sz', { val: String(Math.round(look.size * 2)) })); set(rp, RPR_ORDER, 'szCs', mk('szCs', { val: String(Math.round(look.size * 2)) }));
    stylesXml = new XMLSerializer().serializeToString(sx); changedParts.add('styles');
    st = styleReader(stylesXml, themeXml, numberingXml);
    // Every paragraph is drawn again with the new style (each is committed first, so no edit is lost).
    const sel = saveSel(); const claimed = new Set();
    [...page.querySelectorAll('.de-p')].forEach((d) => { const p = commit(d, claimed); redraw(d, p); });
    restoreSel(sel); drawGallery(); dirty = true;
  }
  function applyPreset(s) {
    const pr = presets()[s.name]; if (!pr || presetDone.has(s.name)) return;
    presetDone.add(s.name); writeStyle(s.id, pr);
  }
  function styleEditor(name) {
    const list = galleryStyles(); let s = list.find((x) => x.name === name) || list[0];
    const pop = $('#de-pop'); const fonts = [...new Set([...FONTS_W])];
    const fill = () => {
      const lk = presets()[s.name] || st.styleLook(s.missing ? null : s.id);
      pop.innerHTML = `<form class="de-sform"><div class="de-shead"><b>Modify style</b><button type="button" class="rb-btn" data-x aria-label="Close">✕</button></div>
        <label>Style <select name="style">${list.map((x) => `<option${x.name === s.name ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label>Font <select name="font">${(lk.font && !fonts.includes(lk.font) ? [lk.font, ...fonts] : fonts).map((f) => `<option${f === lk.font ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
        <div class="de-srow"><label>Size (pt) <input name="size" type="number" min="6" max="96" step="0.5" value="${lk.size}"></label><label>Colour <input name="color" type="color" value="${lk.color}"></label></div>
        <div class="de-srow"><label class="de-chk"><input name="b" type="checkbox"${lk.b ? ' checked' : ''}> Bold</label><label class="de-chk"><input name="i" type="checkbox"${lk.i ? ' checked' : ''}> Italic</label>
          <label>Align <select name="jc">${['left', 'center', 'right', 'justify'].map((a) => `<option${a === lk.jc || (a === 'justify' && lk.jc === 'both') ? ' selected' : ''}>${a}</option>`).join('')}</select></label></div>
        <div class="de-srow"><label>Space before (pt) <input name="before" type="number" min="0" max="200" value="${lk.before}"></label><label>after (pt) <input name="after" type="number" min="0" max="200" value="${lk.after}"></label></div>
        <label class="de-chk"><input name="keep" type="checkbox" checked> Remember in this browser for my other documents</label>
        <div class="de-srow"><button type="submit" class="rb-btn de-sok">Apply</button>${presets()[s.name] ? '<button type="button" class="rb-btn" data-forget>Forget saved style</button>' : ''}</div></form>`;
      const f = pop.querySelector('form'); pairHex(f.elements.color);
      f.elements.style.onchange = () => { s = list.find((x) => x.name === f.elements.style.value); fill(); };
      pop.querySelector('[data-x]').onclick = () => { pop.hidden = true; };
      const fg = pop.querySelector('[data-forget]'); if (fg) fg.onclick = () => { const o = presets(); delete o[s.name]; savePresets(o); drawGallery(); fill(); status(`${s.name}: the saved style is forgotten (this document keeps its look)`); };
      f.onsubmit = (e) => {
        e.preventDefault(); const E = f.elements;
        const look = { font: E.font.value, size: Math.max(6, Math.min(96, +E.size.value || 11)), b: E.b.checked, i: E.i.checked, color: E.color.value, jc: E.jc.value, before: Math.max(0, +E.before.value || 0), after: Math.max(0, +E.after.value || 0) };
        const id = ensureStyle(s); s = { ...s, id, missing: false };
        if (E.keep.checked) { const o = presets(); o[s.name] = look; savePresets(o); }
        presetDone.add(s.name); writeStyle(id, look); pop.hidden = true; status(`${s.name} updated${E.keep.checked ? ' and saved in this browser' : ''}`);
      };
    };
    fill(); pop.hidden = false;
    const r = $('#de-gal').getBoundingClientRect(); const b = box.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left - b.left, b.width - 330))}px`; pop.style.top = `${r.bottom - b.top + 8}px`;
    pop.querySelector('select').focus();
  }
  function ensureStyle(s) {
    if (!s.missing) return s.id;
    const def = WANT.find(([n]) => n === s.name)[1] || '';
    const sx = parse(stylesXml || `<w:styles xmlns:w="${W}"/>`);
    const el = parse(`<x xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="${s.id}"><w:name w:val="${s.name.toLowerCase().startsWith('heading') ? s.name.toLowerCase() : s.name}"/><w:basedOn w:val="${st.defaultStyle() || 'Normal'}"/><w:next w:val="${st.defaultStyle() || 'Normal'}"/><w:uiPriority w:val="9"/><w:qFormat/>${def}</w:style></x>`).documentElement.firstElementChild;
    sx.documentElement.append(sx.importNode(el, true));
    stylesXml = new XMLSerializer().serializeToString(sx); changedParts.add('styles');
    st = styleReader(stylesXml, themeXml, numberingXml); drawGallery();
    return s.id;
  }
  $('.de-top').addEventListener('contextmenu', (e) => { const b = e.target.closest('.de-sty'); if (!b) return; e.preventDefault(); styleEditor(b.dataset.name); });
  $('.de-top').addEventListener('click', (e) => {
    if (e.target.closest('#de-stymod')) { styleEditor(selParas()[0] ? (galleryStyles().find((x) => x.id === (selParas()[0].dataset.style || st.defaultStyle()))?.name) : null); return; }
    const b = e.target.closest('.de-sty'); if (!b) return;
    let s = galleryStyles().find((x) => x.id === b.dataset.style); const id = ensureStyle(s); s = { ...s, id }; applyPreset(s);
    paraCmd((p) => { const pp = pPrOf(p); setChild(pp, PPR_ORDER, 'pStyle', id === st.defaultStyle() ? null : wEl('pStyle', { val: id })); }, `style ${s.name}`);
  });
  drawGallery();

  // ---------- typing ----------
  page.addEventListener('beforeinput', (e) => {
    // Tab in a list paragraph changes its level, as in Word.
    if (e.inputType === 'insertText' && e.data === '\t') { /* handled in keydown */ }
  });
  page.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { const d = paraOf(getSelection().anchorNode); if (d?.dataset.num) { e.preventDefault(); indentCmd(e.shiftKey ? -1 : 1); return; } e.preventDefault(); exec('insertText', '\t'); return; }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); exec('insertLineBreak'); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'f' || e.key === 'h')) { e.preventDefault(); openFind(); }
  });
  page.addEventListener('paste', (e) => { e.preventDefault(); exec('insertText', e.clipboardData.getData('text/plain')); });
  page.addEventListener('input', (e) => {
    lastNative = performance.now(); dirty = true;
    if (e.inputType === 'insertText' && e.data === '>') queueMicrotask(arrowize); // after the typing command has finished
    // Enter makes a copy of the paragraph (Chrome and Safari clone its attributes): it becomes a new paragraph on save.
    const here = paraOf(getSelection().anchorNode);
    [here, here?.previousElementSibling, here?.nextElementSibling].forEach((d) => { if (!d?.classList?.contains('de-p')) return; const it = items[+d.dataset.i]; d.classList.toggle('de-changed', !it || it.div !== d || plainText(d) !== it.plain || structOf(d) !== it.struct); });
    clearTimeout(renumber.t); renumber.t = setTimeout(renumber, 150); wordCount();
  });
  document.addEventListener('selectionchange', () => { if (root.isConnected && inPage()) refreshState(); });
  function refreshState() {
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    setPressed(rb, 'de-b', q('bold')); setPressed(rb, 'de-i', q('italic')); setPressed(rb, 'de-u', q('underline')); setPressed(rb, 'de-s', q('strikeThrough'));
    const d = paraOf(getSelection().anchorNode);
    const ta = d ? getComputedStyle(d).textAlign : '';
    setPressed(rb, 'de-al', ta === 'left' || ta === 'start'); setPressed(rb, 'de-ac', ta === 'center'); setPressed(rb, 'de-ar', ta === 'right' || ta === 'end'); setPressed(rb, 'de-aj', ta === 'justify');
    const lv = d?.dataset.num ? st.levelOf(d.dataset.num.split(':')[0], +d.dataset.num.split(':')[1]) : null;
    setPressed(rb, 'de-bul', lv?.fmt === 'bullet'); setPressed(rb, 'de-num', !!lv && lv.fmt !== 'bullet');
    const n = getSelection().anchorNode; const el = n?.nodeType === 3 ? n.parentElement : n;
    if (el && page.contains(el)) { const cs = getComputedStyle(el); const f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (FONTS_W.includes(f)) $('#de-font').value = f; const pt = Math.round(parseFloat(cs.fontSize) * 0.75); if (SIZES_W.includes(pt)) $('#de-size').value = String(pt); }
    root.querySelectorAll('.de-sty').forEach((b) => b.setAttribute('aria-pressed', String(!!d && (d.dataset.style || st.defaultStyle()) === b.dataset.style)));
  }

  // ---------- undo / redo / delete ----------
  $('#de-undo').onclick = () => {
    const c = custom.undo.at(-1);
    if (c && c.t > lastNative) { custom.undo.pop(); applyRecs(c.recs, 'before'); custom.redo.push(c); status(`Undone: ${c.label}`); return; }
    if (inkHist.undo.length && inkHist.undo.at(-1).t > lastNative) { inkStep('undo'); return; }
    page.focus(); exec('undo');
  };
  $('#de-redo').onclick = () => {
    const c = custom.redo.at(-1);
    if (c) { custom.redo.pop(); applyRecs(c.recs, 'after'); c.t = performance.now(); custom.undo.push(c); status(`Redone: ${c.label}`); return; }
    if (inkHist.redo.length) { inkStep('redo'); return; }
    page.focus(); exec('redo');
  };
  $('#de-del').title = 'Delete the selected text or shape'; $('#de-del').setAttribute('aria-label', 'Delete the selected text or shape');
  $('#de-del').onclick = () => { if (selShape) { deleteShape(); return; } if (inPage() && !getSelection().isCollapsed) exec('delete'); };
  root.querySelectorAll('.vt-acts button').forEach((b) => { b.addEventListener('pointerdown', (e) => e.preventDefault()); b.addEventListener('mousedown', (e) => e.preventDefault()); });

  // ---------- find & replace ----------
  const fb = $('#de-findbar'); let matches = []; let mi = -1;
  function openFind() { fb.hidden = false; const s = getSelection(); if (inPage() && !s.isCollapsed && s.toString().length < 80) $('#de-q').value = s.toString(); $('#de-q').focus(); $('#de-q').select(); search(); }
  $('#de-find').onclick = openFind;
  $('#de-fclose').onclick = () => { fb.hidden = true; matches = []; };
  function search() {
    const q = $('#de-q').value; matches = []; mi = -1; if (!q) { $('#de-count').textContent = ''; return; }
    const cs = $('#de-case').checked; const whole = $('#de-word').checked;
    const re = new RegExp(`${whole ? '(?<![\\p{L}\\p{N}])' : ''}${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${whole ? '(?![\\p{L}\\p{N}])' : ''}`, `gu${cs ? '' : 'i'}`);
    page.querySelectorAll('.de-p').forEach((d) => {
      const nodes = []; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let txt = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, txt.length]); txt += n.data; }
      for (const m of txt.matchAll(re)) {
        const at = (o, end) => { for (let k = nodes.length - 1; k >= 0; k--) { if (o > nodes[k][1] || (!end && o === nodes[k][1])) return [nodes[k][0], o - nodes[k][1]]; } return [nodes[0][0], 0]; };
        const r = document.createRange(); const a = at(m.index, false), b = at(m.index + m[0].length, true); r.setStart(...a); r.setEnd(...b); matches.push(r);
      }
    });
    $('#de-count').textContent = matches.length ? `${matches.length} found` : 'No matches';
  }
  function go(d) {
    if (!matches.length) search(); if (!matches.length) return;
    mi = (mi + d + matches.length) % matches.length; const r = matches[mi];
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    r.startContainer.parentElement.scrollIntoView({ block: 'center' }); $('#de-count').textContent = `${mi + 1} of ${matches.length}`;
  }
  $('#de-q').addEventListener('input', search); $('#de-case').onchange = search; $('#de-word').onchange = search;
  $('#de-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') $('#de-fclose').click(); });
  $('#de-next').onclick = () => go(1); $('#de-prev').onclick = () => go(-1);
  $('#de-rep').onclick = () => {
    if (mi < 0) { go(1); return; } const r = matches[mi]; const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    page.focus(); exec('insertText', $('#de-r').value); search(); go(0);
  };
  $('#de-repall').onclick = () => {
    search(); const n = matches.length; if (!n) return;
    page.focus(); for (let k = matches.length - 1; k >= 0; k--) { const s = getSelection(); s.removeAllRanges(); s.addRange(matches[k]); exec('insertText', $('#de-r').value); }
    search(); status(`Replaced ${n}`);
  };

  // ---------- word count, export ----------
  const segW = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  function wordCount() {
    const el = $('#de-wc'); if (el.dataset.msg) { el.textContent = el.dataset.msg; return; }
    const t = [...page.querySelectorAll('.de-p')].map(plainText).join('\n');
    const words = segW ? [...segW.segment(t)].filter((x) => x.isWordLike).length : (t.match(/\S+/g) || []).length;
    el.textContent = `${words.toLocaleString()} words · ${t.replace(/\s/g, '').length.toLocaleString()} characters`;
  }
  const baseName = () => (root.dataset.name || 'document').replace(/\.docx$/i, '');
  function exportFile(data, ext, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = `${baseName()}.${ext}`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); status(`${baseName()}.${ext} downloaded`); }
  const paras = () => [...page.querySelectorAll('.de-p')];
  $('#de-x-txt').onclick = () => exportFile(paras().map(plainText).join('\r\n'), 'txt', 'text/plain');
  $('#de-x-md').onclick = () => exportFile(paras().map((d) => {
    const t = plainText(d).replace(/\n/g, '  \n'); const s = (d.dataset.style || '').toLowerCase();
    const h = /^heading([1-6])$/.exec(s.replace(/\s/g, '')); if (h) return `${'#'.repeat(+h[1])} ${t}`; if (s === 'title') return `# ${t}`;
    if (d.dataset.marker) { const lvl = +(d.dataset.num || '0:0').split(':')[1]; return `${'  '.repeat(lvl)}${/\d|[a-z]\.?$/i.test(d.dataset.marker) ? '1.' : '-'} ${t}`; }
    return t;
  }).join('\n\n'), 'md', 'text/markdown');
  const docHtml = () => `<!doctype html><html><head><meta charset="utf-8"><title>${baseName()}</title><style>body{margin:0;background:#fff}.de-page{margin:0 auto;box-sizing:border-box;color:#000;line-height:1.2}.de-p{white-space:pre-wrap;min-height:1.2em;position:relative}.de-li::before{content:attr(data-marker);position:absolute;left:calc(-1*var(--hang,18pt))}.de-tbl{border-collapse:collapse}.de-tbl.de-borders td{border:1px solid #000}.de-tbl td{padding:0 7px;vertical-align:top}.de-keep{display:none}@page{size:${pgW / 1440}in ${pgH / 1440}in;margin:0}</style></head><body>${(() => { const c = sheet.cloneNode(true); c.querySelector('.de-page').removeAttribute('contenteditable'); c.querySelectorAll('.de-changed').forEach((x) => x.classList.remove('de-changed')); c.style.zoom = ''; return c.innerHTML; })()}</body></html>`;
  $('#de-x-html').onclick = () => exportFile(docHtml(), 'html', 'text/html');
  $('#de-x-pdf').onclick = () => {
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.append(f);
    f.srcdoc = docHtml(); f.onload = () => { setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300); };
    status('Choose "Save as PDF" in the print window');
  };

  // ---------- drawing on the page: text boxes, pen, lines, arrows, rectangles ----------
  let tool = 'text'; let shapes = []; let selShape = null; const inkHist = { undo: [], redo: [] }; let nextId = 1;
  const svg = ink.querySelector('svg'); const NS = 'http://www.w3.org/2000/svg';
  const shColor = () => $('#de-shc').value; const shWidth = () => +$('#de-shw').value * 4 / 3; // pt -> px
  function setTool(t) {
    tool = t; ['text', 'textbox', 'pen', 'line', 'arrow', 'rect'].forEach((k) => setPressed(rb, `de-t-${k}`, k === t));
    sheet.dataset.tool = t; selShape = null; paintInk();
  }
  ['text', 'textbox', 'pen', 'line', 'arrow', 'rect'].forEach((k) => { $(`#de-t-${k}`).onclick = () => setTool(k); });
  const inkSnap = () => JSON.stringify(shapes.map((s) => ({ ...s, el: undefined })));
  function inkPush(label) { inkHist.undo.push({ before: inkHist.cur ?? '[]', after: inkSnap(), label, t: performance.now() }); inkHist.cur = inkSnap(); inkHist.redo = []; dirty = true; }
  function inkStep(dir) {
    const h = inkHist[dir].pop(); if (!h) return; inkHist[dir === 'undo' ? 'redo' : 'undo'].push(h);
    shapes = JSON.parse(dir === 'undo' ? h.before : h.after); inkHist.cur = inkSnap(); selShape = null; paintInk(); dirty = true;
  }
  inkHist.cur = '[]';
  const zoomK = () => view.get();
  const at = (e) => { const r = sheet.getBoundingClientRect(); const z = zoomK(); return [(e.clientX - r.left) / z, (e.clientY - r.top) / z]; };
  function arrowHead(a, b, w) { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const L = 7 + w * 2.6; const s = Math.PI / 6; return [[b[0] - L * Math.cos(ang - s), b[1] - L * Math.sin(ang - s)], b, [b[0] - L * Math.cos(ang + s), b[1] - L * Math.sin(ang + s)]]; }
  function paintInk() {
    svg.setAttribute('width', sheet.offsetWidth); svg.setAttribute('height', sheet.offsetHeight);
    svg.replaceChildren(); ink.querySelectorAll('.de-tb').forEach((t) => { if (!shapes.some((s) => s.id === +t.dataset.id)) t.remove(); });
    for (const s of shapes) {
      if (s.type === 'textbox') {
        let t = ink.querySelector(`.de-tb[data-id="${s.id}"]`);
        if (!t) { t = document.createElement('div'); t.className = 'de-tb'; t.dataset.id = s.id; t.contentEditable = 'true'; t.innerHTML = s.html || ''; ink.append(t); t.addEventListener('input', () => { s.html = t.innerHTML; if (t.dataset.typed !== '1') { t.dataset.typed = '1'; } dirty = true; }); t.addEventListener('blur', () => { if (!t.textContent.trim()) { shapes = shapes.filter((x) => x !== s); paintInk(); } inkPush('text box'); }); t.addEventListener('input', (e) => { if (e.inputType === 'insertText' && e.data === '>') queueMicrotask(arrowize); }); }
        Object.assign(t.style, { left: `${s.x}px`, top: `${s.y}px`, minWidth: `${Math.max(40, s.w)}px`, color: s.color });
        t.classList.toggle('on', selShape === s.id); continue;
      }
      const g = document.createElementNS(NS, 'g'); g.dataset.id = s.id; if (selShape === s.id) g.setAttribute('class', 'on');
      const st0 = { stroke: s.color, 'stroke-width': s.width, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      const add = (tag, a) => { const e = document.createElementNS(NS, tag); Object.entries({ ...st0, ...a }).forEach(([k, v]) => e.setAttribute(k, v)); g.append(e); };
      if (s.type === 'pen') add('polyline', { points: s.pts.map((p) => p.join(',')).join(' ') });
      if (s.type === 'line' || s.type === 'arrow') add('line', { x1: s.a[0], y1: s.a[1], x2: s.b[0], y2: s.b[1] });
      if (s.type === 'arrow') add('polyline', { points: arrowHead(s.a, s.b, s.width).map((p) => p.join(',')).join(' ') });
      if (s.type === 'rect') add('rect', { x: s.x, y: s.y, width: s.w, height: s.h });
      svg.append(g);
    }
  }
  let draw = null;
  ink.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.de-tb')) return;
    const p = at(e);
    if (tool === 'text') {
      const g = e.target.closest('g[data-id]'); if (!g) return;
      selShape = +g.dataset.id; const s = shapes.find((x) => x.id === selShape); draw = { kind: 'move', s, last: p, moved: false }; paintInk(); ink.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (tool === 'textbox') {
      const s = { id: nextId++, type: 'textbox', x: p[0], y: p[1] - 10, w: 160, h: 30, color: shColor(), html: '' };
      shapes.push(s); paintInk(); const t = ink.querySelector(`.de-tb[data-id="${s.id}"]`); setTool('text'); t.focus(); e.preventDefault(); return;
    }
    const s = { id: nextId++, type: tool, color: shColor(), width: shWidth() };
    if (tool === 'pen') s.pts = [p]; else if (tool === 'rect') Object.assign(s, { x: p[0], y: p[1], w: 0, h: 0 }); else Object.assign(s, { a: p, b: p });
    shapes.push(s); draw = { kind: 'draw', s, start: p }; try { ink.setPointerCapture(e.pointerId); } catch { /* gone */ } e.preventDefault();
  });
  ink.addEventListener('pointermove', (e) => {
    if (!draw) return; const p = at(e); const s = draw.s;
    if (draw.kind === 'move') {
      const dx = p[0] - draw.last[0], dy = p[1] - draw.last[1]; draw.last = p; draw.moved = true;
      if (s.pts) s.pts = s.pts.map(([x, y]) => [x + dx, y + dy]); if (s.a) { s.a = [s.a[0] + dx, s.a[1] + dy]; s.b = [s.b[0] + dx, s.b[1] + dy]; } if ('x' in s) { s.x += dx; s.y += dy; }
    } else if (s.type === 'pen') s.pts.push(p);
    else if (s.type === 'rect') { s.x = Math.min(draw.start[0], p[0]); s.y = Math.min(draw.start[1], p[1]); s.w = Math.abs(p[0] - draw.start[0]); s.h = Math.abs(p[1] - draw.start[1]); }
    else s.b = p;
    paintInk();
  });
  ink.addEventListener('pointerup', () => {
    const d = draw; draw = null; if (!d) return;
    const s = d.s; const tiny = (s.type === 'rect' && s.w < 3 && s.h < 3) || (s.a && Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < 3) || (s.type === 'pen' && s.pts.length < 2);
    if (d.kind === 'draw' && tiny) { shapes = shapes.filter((x) => x !== s); paintInk(); return; }
    if (d.kind === 'move' && !d.moved) return;
    inkPush(d.kind === 'move' ? 'move' : s.type);
  });
  // Text boxes move by dragging their edge (the text inside stays editable).
  ink.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('.de-tb'); if (!t) return;
    const r = t.getBoundingClientRect(); const edge = e.clientX < r.left + 6 || e.clientX > r.right - 6 || e.clientY < r.top + 6 || e.clientY > r.bottom - 6;
    selShape = +t.dataset.id; paintInk(); if (!edge) return;
    draw = { kind: 'move', s: shapes.find((x) => x.id === selShape), last: at(e), moved: false }; ink.setPointerCapture(e.pointerId); e.preventDefault();
  }, true);
  function deleteShape() { shapes = shapes.filter((x) => x.id !== selShape); selShape = null; paintInk(); inkPush('delete'); }
  document.addEventListener('keydown', (e) => { if (!root.isConnected || !selShape || e.target.closest?.('.de-tb') || inPage()) return; if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteShape(); } });
  new ResizeObserver(paintInk).observe(page);
  setTool('text');

  // Shapes into the .docx: each one is a floating drawing anchored to the paragraph above it (Word text boxes and
  // shapes; pen strokes as a transparent PNG picture).
  const EMU = 9525; const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'; const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
  const NSDECL = `xmlns:w="${W}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:wps="${WPS}" xmlns:pic="${PIC}" xmlns:r="${R}"`;
  let inserted = []; // nodes added on the last save (removed before the next one)
  function addRel(type, target) {
    const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]); const id = `rId${Math.max(0, ...ids) + 1}`;
    relsXml = relsXml.replace('</Relationships>', `<Relationship Id="${id}" Type="${type}" Target="${target}"/></Relationships>`); changedParts.add('rels'); return id;
  }
  async function addContentType(partOrExt, type, override = false) {
    let ct = await zip.file('[Content_Types].xml').async('string');
    if (override ? ct.includes(`PartName="${partOrExt}"`) : ct.includes(`Extension="${partOrExt}"`)) return;
    ct = ct.replace('</Types>', override ? `<Override PartName="${partOrExt}" ContentType="${type}"/></Types>` : `<Default Extension="${partOrExt}" ContentType="${type}"/></Types>`);
    zip.file('[Content_Types].xml', ct);
  }
  function anchorPara(y) {
    const tops = [...page.children].filter((d) => d.classList?.contains('de-p'));
    let best = tops[0]; for (const d of tops) { if (d.offsetTop <= y) best = d; }
    return best;
  }
  const hex6 = (c) => c.replace('#', '').toUpperCase();
  function anchorXml(id, x, y, w, h, uri, graphic) {
    return `<w:r ${NSDECL}><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251659264 + id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(x * EMU)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(y * EMU)}</wp:posOffset></wp:positionV><wp:extent cx="${Math.max(1, Math.round(w * EMU))}" cy="${Math.max(1, Math.round(h * EMU))}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${9000 + id}" name="Shape ${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="${uri}">${graphic}</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  }
  function tbRuns(t) {
    const out = []; const ps = [[]];
    const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) ps.at(-1).push([c.data, c.parentElement]); else if (c.nodeName === 'BR') ps.push([]); else if (c.nodeName === 'DIV' || c.nodeName === 'P') { if (ps.at(-1).length) ps.push([]); walk(c); } else walk(c); } };
    walk(t);
    for (const p of ps) {
      const runs = p.map(([txt, el]) => {
        const cs = getComputedStyle(el); let deco = ''; for (let e = el; e && e !== t.parentElement; e = e.parentElement) deco += getComputedStyle(e).textDecorationLine;
        const font = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const sz = Math.round(parseFloat(cs.fontSize) * 1.5);
        const rp = `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>${+cs.fontWeight >= 600 ? '<w:b/><w:bCs/>' : ''}${/italic/.test(cs.fontStyle) ? '<w:i/><w:iCs/>' : ''}${deco.includes('line-through') ? '<w:strike/>' : ''}<w:color w:val="${rgbHex(cs.color) || '000000'}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>${deco.includes('underline') ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
        return `<w:r>${rp}<w:t xml:space="preserve">${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r>`;
      }).join('');
      out.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${runs}</w:p>`);
    }
    return out.join('');
  }
  async function shapesToXml() {
    inserted.forEach((n) => n.remove()); inserted = [];
    for (const s of shapes) {
      let x, y, w, h, uri = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape', g;
      const lw = Math.round((s.width || 1.33) * 0.75 * 12700);
      if (s.type === 'rect' || s.type === 'line' || s.type === 'arrow') {
        if (s.type === 'rect') { x = s.x; y = s.y; w = s.w; h = s.h; } else { x = Math.min(s.a[0], s.b[0]); y = Math.min(s.a[1], s.b[1]); w = Math.abs(s.b[0] - s.a[0]); h = Math.abs(s.b[1] - s.a[1]); }
        const flip = s.type === 'rect' ? '' : `${s.b[0] < s.a[0] ? ' flipH="1"' : ''}${s.b[1] < s.a[1] ? ' flipV="1"' : ''}`;
        g = `<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm${flip}><a:off x="0" y="0"/><a:ext cx="${Math.max(1, Math.round(w * EMU))}" cy="${Math.max(1, Math.round(h * EMU))}"/></a:xfrm><a:prstGeom prst="${s.type === 'rect' ? 'rect' : 'line'}"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="${lw}" cap="rnd"><a:solidFill><a:srgbClr val="${hex6(s.color)}"/></a:solidFill><a:round/>${s.type === 'arrow' ? '<a:tailEnd type="arrow" w="med" len="med"/>' : ''}</a:ln></wps:spPr><wps:bodyPr/></wps:wsp>`;
      } else if (s.type === 'textbox') {
        const t = ink.querySelector(`.de-tb[data-id="${s.id}"]`); if (!t || !t.textContent.trim()) continue;
        x = s.x; y = s.y; w = t.offsetWidth + 4; h = t.offsetHeight + 4;
        g = `<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx><w:txbxContent>${tbRuns(t)}</w:txbxContent></wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:spAutoFit/></wps:bodyPr></wps:wsp>`;
      } else if (s.type === 'pen') {
        const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]); const pad = s.width;
        x = Math.min(...xs) - pad; y = Math.min(...ys) - pad; w = Math.max(...xs) - x + pad; h = Math.max(...ys) - y + pad;
        const k = 3; const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); const ctx = c.getContext('2d');
        ctx.scale(k, k); ctx.strokeStyle = s.color; ctx.lineWidth = s.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); s.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px - x, py - y) : ctx.moveTo(px - x, py - y))); ctx.stroke();
        const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const name = `media/ink${s.id}_${Date.now()}.png`;
        zip.file(`word/${name}`, await blob.arrayBuffer()); await addContentType('png', 'image/png');
        const rid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', name);
        uri = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
        g = `<pic:pic><pic:nvPicPr><pic:cNvPr id="${9000 + s.id}" name="Ink ${s.id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`;
      } else continue;
      const d = anchorPara(y); const p = ownerOf.get(d) || items[+d.dataset.i]?.p; if (!p) continue;
      const run = xml.importNode(parse(anchorXml(s.id, x, y - d.offsetTop, w, h, uri, g)).documentElement, true);
      const pp = kid(p, 'pPr'); if (pp) pp.after(run); else p.prepend(run); inserted.push(run);
    }
  }

  wordCount();
  return {
    isDirty: () => dirty || page.querySelector('.de-changed') != null,
    async save() {
      document.activeElement?.blur?.();
      const claimed = new Set(); const seen = new Set();
      for (const d of page.querySelectorAll('.de-p')) { const p = commit(d, claimed); seen.add(p); }
      // Paragraphs deleted on the page go from the file (a table cell keeps at least one).
      for (const it of items) {
        if (!it || seen.has(it.p) || !it.p.parentNode) continue;
        const parent = it.p.parentNode; if (parent.localName === 'tc' && kids(parent, 'p').length <= 1) continue;
        it.p.remove();
      }
      await shapesToXml();
      let out = new XMLSerializer().serializeToString(xml);
      if (!out.startsWith('<?xml')) out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${out}`;
      inserted.forEach((n) => n.remove()); inserted = []; // shapes stay on the overlay and are written again next save
      zip.file('word/document.xml', out);
      if (changedParts.has('styles')) zip.file('word/styles.xml', stylesXml);
      if (changedParts.has('numbering')) zip.file('word/numbering.xml', numberingXml);
      if (changedParts.has('rels')) zip.file(relsPath, relsXml);
      // Show the page as saved: every paragraph redrawn from the file.
      runRefs.length = 0; hyperRefs.length = 0; items.length = 0; pieces.clear();
      for (const el of xml.getElementsByTagNameNS(W, '*')) { if (!isPiece(el)) continue; const p = ancestor(el, 'p'); if (!p || ancestor(p, 'txbxContent')) continue; if (!pieces.has(p)) pieces.set(p, []); pieces.get(p).push(el); }
      page.replaceChildren(); renderBlock(body, page); renumber();
      const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
      dirty = false;
      return buf;
    },
  };
}
