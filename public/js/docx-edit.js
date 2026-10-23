// Word editor (prototype): the document is shown as a page in its own fonts, sizes, colours, alignment and spacing,
// with its tables and images, and the text of any paragraph or table cell can be changed in place. The file is opened
// as a zip (JSZip) and only word/document.xml changes, so styles, headers, footers, images and page layout stay as
// they were. Only the changed characters are rewritten, so the rest of a paragraph keeps its bold, colours and fonts,
// and new text takes the formatting of the text before it; edited paragraphs are redrawn as saved after Download.
// Headers, footers and text boxes are not shown.
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
    const out = { r: { ...parent.r, ...rProps(kid(s, 'rPr')) }, p: { ...parent.p, ...pProps(kid(s, 'pPr')) }, borders: tb ? hasBorder(tb) : parent.borders };
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
  return {
    para(p) {
      const pPr = kid(p, 'pPr'); const st = style(val(kid(pPr, 'pStyle')) || defaultPara);
      const own = pProps(pPr); const merged = { ...base.p, ...st.p, ...own };
      const lv = merged.numId && merged.numId !== '0' ? level(merged.numId, merged.ilvl || 0) : null;
      // The list level's indent applies unless the paragraph or its style sets one.
      return { p: lv ? { ...base.p, ...st.p, ...lv.p, ...own } : merged, r: { ...base.r, ...st.r }, level: lv, ilvl: merged.ilvl || 0 };
    },
    run(r, paraR) { const rPr = kid(r, 'rPr'); return { ...paraR, ...style(val(kid(rPr, 'rStyle'))).r, ...rProps(rPr) }; },
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
  if (thai ? r.bCs ?? r.b : r.b) s.push('font-weight:bold');
  if (thai ? r.iCs ?? r.i : r.i) s.push('font-style:italic');
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
  const st = styleReader(await text('word/styles.xml'), await text('word/theme/theme1.xml'), await text('word/numbering.xml'));
  const rels = {};
  for (const m of (await zip.file('word/_rels/document.xml.rels')?.async('string') || '').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1]; const t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t && !/TargetMode="External"/.test(m[0])) rels[id] = t.startsWith('/') ? t.slice(1) : `word/${t}`.replace(/[^/]+\/\.\.\//g, '');
  }

  // Each paragraph's own text pieces (pieces of a text box inside it belong to the text box's paragraphs).
  const pieces = new Map();
  for (const el of xml.getElementsByTagNameNS(W, '*')) {
    if (!isPiece(el)) continue;
    const p = ancestor(el, 'p'); if (!p || ancestor(p, 'txbxContent')) continue;
    if (!pieces.has(p)) pieces.set(p, []);
    pieces.get(p).push(el);
  }

  const items = []; // { p, div, text }: one per paragraph shown
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
  // List numbers count on in document order, per list; a level resets the levels below it.
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
    div.style.cssText = `${runCss(pr, false)};${paraCss(pp)}`; // the paragraph's own font: used for empty lines and new text
    const mark = items[i]?.marker ?? (lv ? marker(lv, ilvl) : null); // a redrawn paragraph keeps its number
    if (mark) { div.classList.add('de-li'); div.dataset.marker = mark; if (lv?.r.b) div.style.setProperty('--mark-weight', 'bold'); }
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      if (ancestor(r, 'p') !== p || ancestor(r, 'del')) continue;
      const rp = st.run(r, pr);
      const text = [...r.children].filter(isPiece).map(pieceText).join('');
      let span = null;
      for (const c of r.children) {
        if (isPiece(c)) {
          if (!span) { span = document.createElement('span'); span.style.cssText = runCss(rp, THAI.test(text)); div.append(span); }
          span.textContent += pieceText(c);
        } else if (c.localName === 'drawing') { span = null; div.append(image(c)); }
      }
    }
    div.contentEditable = 'plaintext-only'; if (div.contentEditable !== 'plaintext-only') div.contentEditable = 'true';
    items[i] = { p, div, text: null, marker: mark };
    return div;
  }
  function renderTable(tbl) {
    const table = document.createElement('table');
    table.className = `de-tbl${st.tableBorders(tbl) ? ' de-borders' : ''}`;
    if (val(kid(kid(tbl, 'tblPr'), 'jc')) === 'center') table.style.margin = '0 auto';
    for (const tr of kids(tbl, 'tr')) {
      const row = table.insertRow();
      for (const tc of kids(tr, 'tc')) {
        const tcPr = kid(tc, 'tcPr'); const td = row.insertCell();
        const span = +val(kid(tcPr, 'gridSpan')) || 1; if (span > 1) td.colSpan = span;
        const vm = kid(tcPr, 'vMerge'); if (vm && val(vm) !== 'restart') td.classList.add('de-vcont'); // rest of a vertically merged cell
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

  // The page: its width and side margins from the document's last section.
  const sect = kid(body, 'sectPr'); const pgW = +attr(kid(sect, 'pgSz'), 'w') || 11906; const mar = kid(sect, 'pgMar');
  const page = document.createElement('div'); page.className = 'de-page';
  page.style.cssText = `width:${pgW / 15}px;padding:${(+attr(mar, 'top') || 1440) / 15}px ${(+attr(mar, 'right') || 1440) / 15}px ${(+attr(mar, 'bottom') || 1440) / 15}px ${(+attr(mar, 'left') || 1440) / 15}px`;
  renderBlock(body, page);
  if (!items.length) throw new Error('No text was found in this document.');
  root.innerHTML = `<div class="oe"><div class="oe-bar"><span class="oe-note">Click any text to edit it · edited paragraphs are marked on the left</span></div><div class="oe-scroll de-doc"></div></div>`;
  root.querySelector('.de-doc').append(page);
  const textOf = (div) => div.innerText.replace(/\n$/, '');
  items.forEach((it) => { it.text = textOf(it.div); }); // read once the page is laid out

  const changed = new Set();
  page.addEventListener('input', (e) => {
    const div = e.target.closest('.de-p'); if (!div) return;
    const i = +div.dataset.i;
    if (textOf(div) === items[i].text) changed.delete(i); else changed.add(i);
    div.classList.toggle('de-changed', changed.has(i));
  });

  // Text -> run pieces: w:t for text, w:tab for tabs, w:br for line breaks.
  function textPieces(text) {
    const out = [];
    text.split('\n').forEach((line, li) => {
      if (li) out.push(xml.createElementNS(W, 'w:br'));
      line.split('\t').forEach((part, pi) => {
        if (pi) out.push(xml.createElementNS(W, 'w:tab'));
        if (!part) return;
        const t = xml.createElementNS(W, 'w:t'); t.setAttributeNS(XML_NS, 'xml:space', 'preserve'); t.textContent = part;
        out.push(t);
      });
    });
    return out;
  }
  // Replace a paragraph's text, keeping each run's formatting: only the part between the unchanged start and end is
  // rewritten, and new text takes the formatting of the character before it, as typing in Word does. A paragraph
  // with no text gets a new run in the paragraph mark's formatting.
  function setText(p, text) {
    const old = pieces.get(p) || [];
    if (!old.length) {
      const run = xml.createElementNS(W, 'w:r');
      const markRPr = kid(kid(p, 'pPr'), 'rPr');
      if (markRPr) {
        const rPr = markRPr.cloneNode(true);
        [...rPr.children].filter((c) => c.localName === 'ins' || c.localName === 'del').forEach((c) => c.remove());
        run.append(rPr);
      }
      const added = textPieces(text); run.append(...added); p.append(run);
      pieces.set(p, added);
      return;
    }
    const oldText = old.map(pieceText).join('');
    const { keep, ins } = diff(oldText, text);
    const result = []; let off = 0;
    old.forEach((el, n) => {
      const t = pieceText(el); const from = off; off += t.length;
      // This piece's kept characters, each followed by what was typed after it; text typed at the very start of the
      // paragraph goes into the first piece.
      let s = n === 0 ? ins[0] : ''; let same = !s;
      for (let k = from; k < off; k++) { if (keep[k]) s += oldText[k]; else same = false; if (ins[k + 1]) { s += ins[k + 1]; same = false; } }
      if (same) { result.push(el); return; }
      const repl = textPieces(s); el.replaceWith(...repl); result.push(...repl);
    });
    pieces.set(p, result);
  }
  // Character diff (longest common subsequence): keep[i] says whether old character i stays; ins[i] is the text
  // inserted just before old character i (ins[old.length]: at the end). Long paragraphs fall back to one changed span
  // between the unchanged start and end.
  function diff(a, b) {
    const n = a.length, m = b.length;
    const keep = new Array(n).fill(false); const ins = new Array(n + 1).fill('');
    if ((n + 1) * (m + 1) > 4e6) {
      let s = 0; while (s < n && s < m && a[s] === b[s]) s++;
      let e = 0; while (e < n - s && e < m - s && a[n - 1 - e] === b[m - 1 - e]) e++;
      for (let i = 0; i < n; i++) keep[i] = i < s || i >= n - e;
      ins[n - e] = b.slice(s, m - e);
      return { keep, ins };
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

  return {
    isDirty: () => changed.size > 0,
    async save() {
      for (const i of changed) {
        const it = items[i];
        setText(it.p, textOf(it.div));
        const fresh = renderPara(it.p, i); it.div.replaceWith(fresh); // show the paragraph as it is saved
        items[i].text = textOf(fresh);
      }
      changed.clear();
      let out = new XMLSerializer().serializeToString(xml);
      if (!out.startsWith('<?xml')) out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${out}`;
      zip.file('word/document.xml', out);
      return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    },
  };
}
