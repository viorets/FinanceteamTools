// Excel to Word table: a sheet becomes a table formatted the way Word's Table Design tab formats tables — a style from
// the gallery (Table Grid, Plain, Grid and List tables), Word's six Table Style Options (Header Row, Total Row, Banded
// Rows, First Column, Last Column, Banded Columns), an accent colour (the chart colour theme's, or any HEX), font and
// size. The download is a real Word file (.docx, written with JSZip): every cell carries its own borders, fill, font and
// alignment, the header row repeats on each page, and wide tables get a landscape page. Word tables hold at most 63
// columns, so a wider sheet becomes several tables (the first column repeated when First Column is on). Copy puts the
// same formatting on the clipboard as HTML for pasting into Word. Settings are kept in this browser.
import { pairHex } from './hex-color.js';
import { currentTheme } from './themes.js';

const STORE = 'word-table-v1';
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const MAX_COLS = 63; // Word's limit for one table
const FONTS = ['TH Sarabun New', 'Calibri', 'Aptos', 'Arial', 'Tahoma', 'Cordia New', 'Times New Roman'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NUM = /^[-+(]?\s?[฿$€£¥]?\s?[\d,]*\.?\d+\s?%?\)?$/;

// Colour mixing: tint toward white (Word's "Lighter 80/60/40%"), shade toward black ("Darker 25%").
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const tint = (h, p) => hex(rgb(h).map((v) => v + (255 - v) * p));
const shade = (h, p) => hex(rgb(h).map((v) => v * (1 - p)));
const B = (w, c, kind = 'solid') => `${w}pt ${kind} ${c}`;

// A style gives each cell its borders [top, right, bottom, left], fill, text colour and weight, from the cell's place:
// f = { head, total, first, last, band (banded row or column), edgeT, edgeB, edgeL, edgeR } and the accent a.
export const STYLES = [ // also used by the PDF editor's tables (js/pdf-markup.js)
  { id: 'grid', name: 'Table Grid', group: 'Plain Tables', cell: () => ({ b: Array(4).fill(B(0.5, '#000000')) }) },
  { id: 'plain1', name: 'Plain Table 1', group: 'Plain Tables', cell: (f) => ({
    b: [f.total ? B(1.5, '#bfbfbf', 'double') : B(0.5, '#bfbfbf'), B(0.5, '#bfbfbf'), B(0.5, '#bfbfbf'), B(0.5, '#bfbfbf')],
    bg: f.band && !f.head && !f.total ? '#f2f2f2' : null, bold: f.head || f.total || f.first || f.last }) },
  { id: 'plain3', name: 'Plain Table 3', group: 'Plain Tables', cell: (f) => ({
    b: [f.total ? B(0.5, '#7f7f7f') : null, f.first ? B(0.5, '#7f7f7f') : null, f.head ? B(0.5, '#7f7f7f') : null, null],
    bg: f.band && !f.head && !f.total ? '#f2f2f2' : null, bold: f.head || f.total || f.first || f.last, caps: f.head || f.first }) },
  { id: 'grid1', name: 'Grid Table 1 Light', group: 'Grid Tables', cell: (f, a) => ({
    b: [f.total ? B(1.5, tint(a, 0.6), 'double') : B(0.5, tint(a, 0.6)), B(0.5, tint(a, 0.6)), f.head ? B(1.5, tint(a, 0.4)) : B(0.5, tint(a, 0.6)), B(0.5, tint(a, 0.6))],
    bold: f.head || f.total || f.first || f.last }) },
  { id: 'grid4', name: 'Grid Table 4', group: 'Grid Tables', cell: (f, a) => ({
    b: f.head ? Array(4).fill(B(0.5, a)) : [f.total ? B(1.5, a, 'double') : B(0.5, tint(a, 0.4)), B(0.5, tint(a, 0.4)), B(0.5, tint(a, 0.4)), B(0.5, tint(a, 0.4))],
    bg: f.head ? a : f.band && !f.total ? tint(a, 0.8) : null, color: f.head ? '#ffffff' : null, bold: f.head || f.total || f.first || f.last }) },
  { id: 'grid5', name: 'Grid Table 5 Dark', group: 'Grid Tables', cell: (f, a) => {
    const strong = f.head || f.total || f.first || f.last;
    return { b: Array(4).fill(B(0.5, '#ffffff')), bg: strong ? a : f.band ? tint(a, 0.6) : tint(a, 0.8), color: strong ? '#ffffff' : null, bold: strong };
  } },
  { id: 'grid6', name: 'Grid Table 6 Colorful', group: 'Grid Tables', cell: (f, a) => ({
    b: [f.total ? B(1.5, tint(a, 0.4), 'double') : B(0.5, tint(a, 0.4)), B(0.5, tint(a, 0.4)), f.head ? B(1.5, tint(a, 0.4)) : B(0.5, tint(a, 0.4)), B(0.5, tint(a, 0.4))],
    bg: f.band && !f.head && !f.total ? tint(a, 0.8) : null, color: shade(a, 0.25), bold: f.head || f.total || f.first || f.last }) },
  { id: 'list3', name: 'List Table 3', group: 'List Tables', cell: (f, a) => ({
    b: [f.edgeT || f.total ? (f.total ? B(1.5, a, 'double') : B(0.5, a)) : f.band ? B(0.5, a) : null, f.edgeR ? B(0.5, a) : null, f.edgeB || f.band ? B(0.5, a) : null, f.edgeL ? B(0.5, a) : null],
    bg: f.head ? a : null, color: f.head ? '#ffffff' : null, bold: f.head || f.total || f.first || f.last }) },
  { id: 'list4', name: 'List Table 4', group: 'List Tables', cell: (f, a) => ({
    b: [f.head ? B(0.5, a) : f.total ? B(1.5, a, 'double') : B(0.5, tint(a, 0.4)), f.edgeR ? B(0.5, f.head ? a : tint(a, 0.4)) : null, f.head ? B(0.5, a) : B(0.5, tint(a, 0.4)), f.edgeL ? B(0.5, f.head ? a : tint(a, 0.4)) : null],
    bg: f.head ? a : f.band && !f.total ? tint(a, 0.8) : null, color: f.head ? '#ffffff' : null, bold: f.head || f.total || f.first || f.last }) },
  { id: 'list6', name: 'List Table 6 Colorful', group: 'List Tables', cell: (f, a) => ({
    b: [f.edgeT ? B(0.5, a) : f.total ? B(1.5, a, 'double') : null, null, f.head || f.edgeB ? B(0.5, a) : null, null],
    bg: f.band && !f.head && !f.total ? tint(a, 0.8) : null, color: shade(a, 0.25), bold: f.head || f.total || f.first || f.last }) },
];
const DEFAULTS = { wide: 'auto', style: 'grid4', header: true, total: false, bandRows: true, first: false, last: false, bandCols: false, accent: null, font: 'TH Sarabun New', size: 16, alignNum: true, fit: true };

// Each cell's look from the style and options: { text, b: [top, right, bottom, left] CSS borders, bg, color, bold,
// caps, align, head }. Shared by the page, Copy (HTML) and the .docx, so all three match.
export function looks(rows, o) {
  const st = STYLES.find((s) => s.id === o.style) || STYLES[0];
  const a = o.accent || currentTheme().chart[0];
  const nR = rows.length; const nC = Math.max(1, ...rows.map((r) => r.length));
  const bodyStart = o.header ? 1 : 0; const bodyEnd = o.total ? nR - 1 : nR;
  return rows.map((row, r) => Array.from({ length: nC }, (_, c) => {
    const text = row[c] == null ? '' : String(row[c]);
    const head = o.header && r === 0; const total = o.total && r === nR - 1 && nR > 1;
    const bandRow = o.bandRows && !head && !total && (r - bodyStart) % 2 === 0 && r < bodyEnd;
    const bandCol = o.bandCols && !head && !total && c % 2 === 0;
    const s = st.cell({ head, total, first: o.first && c === 0, last: o.last && c === nC - 1, band: bandRow || bandCol, edgeT: r === 0, edgeB: r === nR - 1, edgeL: c === 0, edgeR: c === nC - 1 }, a);
    return { text, head, b: [0, 1, 2, 3].map((i) => (s.b || [])[i] || null), bg: s.bg || null, color: s.color || '#000000', bold: !!s.bold, caps: !!s.caps,
      align: o.alignNum && !head && NUM.test(text.trim()) ? 'right' : 'left' };
  }));
}
// Column groups for Word: at most 63 columns (Word's limit) and, for the .docx, no more than fit a landscape A4 page
// readably (each column at least ~1 cm per 10 pt of text). The first column repeats in later groups when First Column is on.
const READABLE = (o) => Math.max(4, Math.floor(14570 / (o.size * 60))); // landscape text width (twips) / minimum column width
function colGroups(nC, o, limit = MAX_COLS) {
  const max = Math.min(MAX_COLS, limit);
  if (nC <= max) return [Array.from({ length: nC }, (_, i) => i)];
  const keep = o.first ? 1 : 0; const per = max - keep; const rest = Array.from({ length: nC - keep }, (_, i) => i + keep);
  const n = Math.ceil(rest.length / per); const size = Math.ceil(rest.length / n); const out = [];
  for (let i = 0; i < rest.length; i += size) out.push([...(keep ? [0] : []), ...rest.slice(i, i + size)]);
  return out;
}

// rows: arrays of cell text. Returns the table HTML with every cell's formatting inline (split: Word-sized tables).
export function tableHtml(rows, o, { mini = false, split = false } = {}) {
  const L = looks(rows, o); const nC = L[0]?.length || 1;
  const font = `font-family:'${o.font}',sans-serif;font-size:${o.size}pt`;
  const one = (cols) => {
    const out = L.map((row) => {
      const cells = cols.map((c) => { const x = row[c];
        const css = [`border-top:${x.b[0] || 'none'}`, `border-right:${x.b[1] || 'none'}`, `border-bottom:${x.b[2] || 'none'}`, `border-left:${x.b[3] || 'none'}`,
          x.bg ? `background:${x.bg}` : '', `color:${x.color}`, x.bold ? 'font-weight:bold' : 'font-weight:normal', x.caps ? 'text-transform:uppercase' : '',
          `text-align:${x.align}`, 'vertical-align:top', mini ? 'padding:0;width:12px;height:6px' : `padding:2pt 5.4pt;${font}`].filter(Boolean).join(';');
        const tag = x.head ? 'th' : 'td';
        return `<${tag} style="${css}">${mini ? '' : esc(x.text) || '&nbsp;'}</${tag}>`; }).join('');
      return row[0].head ? `<thead><tr>${cells}</tr></thead><tbody>` : `<tr>${cells}</tr>`;
    });
    return `<table style="border-collapse:collapse;${!mini && o.fit ? 'width:100%;' : ''}${mini ? '' : font}">${out.join('')}${o.header ? '</tbody>' : ''}</table>`;
  };
  const groups = split ? colGroups(nC, o) : [Array.from({ length: nC }, (_, i) => i)];
  return groups.map((g, i) => (groups.length > 1 ? `<p style="${font}">${i ? '<br>' : ''}Columns ${g[o.first ? 1 : 0] + 1}–${g.at(-1) + 1} of ${nC}</p>` : '') + one(g)).join('');
}

// ---------- .docx ----------
const loadZip = () => window.JSZip ? Promise.resolve(window.JSZip) : new Promise((res, rej) => {
  const sc = document.createElement('script'); sc.src = JSZIP; sc.crossOrigin = 'anonymous';
  sc.onload = () => res(window.JSZip); sc.onerror = () => rej(new Error('Could not load the Word file writer. Check the internet connection.')); document.head.append(sc);
});
const xe = (s) => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A CSS border ("0.5pt solid #aabbcc") as a Word border (sz in eighths of a point).
function wBorder(side, css) {
  const m = css && /([\d.]+)pt (\w+) #([0-9a-f]{6})/i.exec(css);
  if (!m) return `<w:${side} w:val="nil"/>`;
  return `<w:${side} w:val="${m[2] === 'double' ? 'double' : 'single'}" w:sz="${Math.max(2, Math.round(+m[1] * (m[2] === 'double' ? 4 : 8)))}" w:space="0" w:color="${m[3].toUpperCase()}"/>`;
}
export async function tableDocx(rows, o, title = 'Table') {
  const JSZip = await loadZip();
  const nC0 = Math.max(1, ...rows.map((r) => r.length));
  // Wide sheets (form responses): one block per row, each a two-column table of question | answer.
  const records = rows.length > 1 && (o.wide === 'records' || (o.wide !== 'split' && nC0 > READABLE(o)));
  if (records) return recordsDocx(JSZip, rows, o, title);
  const L = looks(rows, o); const nC = L[0]?.length || 1; const groups = colGroups(nC, o, o.fit ? READABLE(o) : MAX_COLS);
  const wide = groups.some((g) => g.length > 6);
  const [pw, ph] = wide ? [16838, 11906] : [11906, 16838]; const mar = 1134; const textW = pw - 2 * mar; // A4, 2 cm margins
  const f = xe(o.font); const sz = Math.round(o.size * 2);
  const run = (x, text) => `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${x.bold ? '<w:b/><w:bCs/>' : ''}${x.caps ? '<w:caps/>' : ''}<w:color w:val="${x.color.slice(1).toUpperCase()}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
  const para = (x, text, jc = x.align) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${text.split(/\r?\n/).map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + (t ? run(x, t) : '')).join('')}</w:p>`;
  const table = (cols) => {
    const cw = Math.floor(textW / cols.length);
    const trs = L.map((row) => `<w:tr>${row[0].head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cols.map((c) => { const x = row[c];
      return `<w:tc><w:tcPr><w:tcW w:w="${o.fit ? cw : 0}" w:type="${o.fit ? 'dxa' : 'auto'}"/><w:tcBorders>${wBorder('top', x.b[0])}${wBorder('left', x.b[3])}${wBorder('bottom', x.b[2])}${wBorder('right', x.b[1])}</w:tcBorders>${x.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${x.bg.slice(1).toUpperCase()}"/>` : ''}</w:tcPr>${para(x, x.text)}</w:tc>`; }).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="${o.fit ? 5000 : 0}" w:type="${o.fit ? 'pct' : 'auto'}"/><w:tblLayout w:type="${o.fit ? 'fixed' : 'autofit'}"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>${trs}</w:tbl>`;
  };
  const note = { bold: false, caps: false, color: '#595959', align: 'left' };
  const body = groups.map((g, i) => (groups.length > 1 ? `<w:p><w:pPr>${i ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="120"/></w:pPr>${run(note, `Columns ${g[o.first ? 1 : 0] + 1}–${g.at(-1) + 1} of ${nC}`)}</w:p>` : '') + table(g)).join('');
  return { bytes: await packDocx(JSZip, body, { pw, ph, mar, wide, f, sz, title }), tables: groups.length, landscape: wide };
}

// The .docx package: document (body + A4 section), default styles in the chosen font, core properties.
async function packDocx(JSZip, body, { pw, ph, mar, wide, f, sz, title }) {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:document ${W}><w:body>${body}<w:p/><w:sectPr><w:pgSz w:w="${pw}" w:h="${ph}"${wide ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${mar}" w:right="${mar}" w:bottom="${mar}" w:left="${mar}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title)}</dc:title><dc:creator>TUSU Finance Team Tools</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
  zip.file('word/document.xml', doc); zip.file('word/styles.xml', styles);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// Records layout: for each data row, a heading (row number and its first value) and a two-column table, question |
// answer (blank answers left out), with the questions styled as the table's first column. Portrait A4; the questions take 35% of the width.
async function recordsDocx(JSZip, rows, o, title) {
  const [pw, ph] = [11906, 16838]; const mar = 1134; const textW = pw - 2 * mar;
  const f = xe(o.font); const sz = Math.round(o.size * 2);
  const head = o.header ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`); const data = o.header ? rows.slice(1) : rows;
  const o2 = { ...o, header: false, total: false, first: true, last: false, bandCols: false };
  const run = (x, text) => `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${x.bold ? '<w:b/><w:bCs/>' : ''}<w:color w:val="${x.color.slice(1).toUpperCase()}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`;
  const para = (x, text) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${x.align}"/></w:pPr>${String(text).split(/\r?\n/).map((t, i) => (i ? '<w:r><w:br/></w:r>' : '') + (t ? run(x, t) : '')).join('')}</w:p>`;
  const w1 = Math.round(textW * 0.35); const w2 = textW - w1;
  const block = (row, k) => {
    const pairs = head.map((h, c) => [h, row[c] ?? '']).filter(([, v]) => String(v).trim()); // blank answers are left out
    const L = looks(pairs, o2);
    const trs = L.map((cells) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells.map((x, c) => `<w:tc><w:tcPr><w:tcW w:w="${c ? w2 : w1}" w:type="dxa"/><w:tcBorders>${wBorder('top', x.b[0])}${wBorder('left', x.b[3])}${wBorder('bottom', x.b[2])}${wBorder('right', x.b[1])}</w:tcBorders>${x.bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${x.bg.slice(1).toUpperCase()}"/>` : ''}</w:tcPr>${para({ ...x, align: c ? x.align : 'left' }, x.text)}</w:tc>`).join('')}</w:tr>`).join('');
    const label = String(row.find((v) => String(v).trim()) ?? '').slice(0, 80);
    const h = { bold: true, color: o.accent || currentTheme().chart[0], align: 'left' };
    return `<w:p><w:pPr><w:keepNext/>${k ? '<w:spacing w:before="360" w:after="120"/>' : '<w:spacing w:before="0" w:after="120"/>'}</w:pPr>${run(h, `${k + 1}. ${label}`)}</w:p>`
      + `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0080" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="${w1}"/><w:gridCol w:w="${w2}"/></w:tblGrid>${trs}</w:tbl>`;
  };
  const body = data.map(block).join('');
  return { bytes: await packDocx(JSZip, body, { pw, ph, mar, wide: false, f, sz, title }), tables: data.length, landscape: false, records: true };
}

export function openWordTable(root, { download }) {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* storage off */ }
  const o = { ...DEFAULTS, ...(saved || {}) };
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch { /* not kept */ } };
  let wb = null; let rows = [];
  const OPTIONS = [['header', 'Header Row'], ['first', 'First Column'], ['total', 'Total Row'], ['last', 'Last Column'], ['bandRows', 'Banded Rows'], ['bandCols', 'Banded Columns']];
  root.innerHTML = `
    <div class="sidebar wt-side">
      <div class="control-group"><label for="wordFileInput">Upload Excel file</label><input type="file" id="wordFileInput" accept=".xlsx,.xls,.csv"></div>
      <div class="control-group"><label for="sheetSelector">Sheet</label><select id="sheetSelector"><option value="">Upload a file first…</option></select></div>
      <div class="control-group"><span class="wt-label" id="wtStyleLbl">Table style</span>
        <div class="wt-gallery" role="group" aria-labelledby="wtStyleLbl">${['Plain Tables', 'Grid Tables', 'List Tables'].map((g) => `<span class="wt-group">${g}</span>${STYLES.filter((s) => s.group === g).map((s) => `<button type="button" class="wt-tile" data-style="${s.id}" title="${s.name}" aria-label="${s.name}" aria-pressed="false"></button>`).join('')}`).join('')}</div>
        <p class="help-text wt-style-name" id="wtStyleName"></p></div>
      <fieldset class="wt-opts"><legend>Table style options</legend>${OPTIONS.map(([k, l]) => `<label><input type="checkbox" data-opt="${k}"> ${l}</label>`).join('')}</fieldset>
      <div class="control-group"><span class="wt-label">Accent colour</span>
        <div class="wt-accents" id="wtAccents"></div>
        <div class="wt-accent-pick"><input type="color" id="wtAccent" aria-label="Accent colour"></div></div>
      <div class="control-row">
        <div class="control-group"><label for="wtFont">Font</label><select id="wtFont">${FONTS.map((f) => `<option>${f}</option>`).join('')}</select></div>
        <div class="control-group wt-size"><label for="wtSize">Size (pt)</label><input type="number" id="wtSize" min="6" max="40" step="0.5" inputmode="decimal"></div>
      </div>
      <fieldset class="wt-opts wt-more"><legend>Layout</legend>
        <label><input type="checkbox" id="wtAlign"> Numbers aligned right</label>
        <label><input type="checkbox" id="wtFit"> Fit to page width</label>
      </fieldset>
      <div class="control-group"><label for="wtWide">Wide sheets in the Word file</label><select id="wtWide">
        <option value="auto">Automatic: one block per row when too wide</option><option value="records">One block per row (question | answer)</option><option value="split">Split columns into several tables</option></select></div>
      <div class="export-actions">
        <button type="button" class="action-btn" id="copyTableBtn" style="flex: 1;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copy</button>
        <button type="button" class="action-btn" id="exportDocxBtn" style="flex: 1;">Download .docx</button>
      </div>
      <p class="help-text" id="wtStatus" role="status"></p>
      <p class="help-text">Paste into Word, or open the .docx: the table keeps its borders, shading, bold and font, and its header row repeats on every page. Wide tables get a landscape page; a Word table holds at most 63 columns, so wider sheets become several tables. TH Sarabun New and the other fonts are used when they are installed on the computer that opens the file.</p>
    </div>
    <div class="main-content wt-main"><div id="wordTableOutput" class="wt-paper"><p class="wt-empty">Upload an Excel file: its sheet appears here as a Word table in the style you pick.</p></div></div>`;
  const $ = (s) => root.querySelector(s);
  const status = (s) => { $('#wtStatus').textContent = s; };
  const MINI = [['', '', '', ''], ['', '', '', ''], ['', '', '', ''], ['', '', '', ''], ['', '', '', '']];

  function render() {
    root.querySelectorAll('.wt-tile').forEach((b) => {
      b.innerHTML = tableHtml(MINI, { ...o, style: b.dataset.style }, { mini: true });
      b.setAttribute('aria-pressed', String(b.dataset.style === o.style));
    });
    $('#wtStyleName').textContent = (STYLES.find((s) => s.id === o.style) || STYLES[0]).name;
    root.querySelectorAll('[data-opt]').forEach((c) => { c.checked = !!o[c.dataset.opt]; });
    const a = o.accent || currentTheme().chart[0];
    $('#wtAccent').value = a; syncAccent();
    $('#wtAccents').replaceChildren(...currentTheme().chart.slice(0, 6).map((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'wt-swatch'; b.style.background = c;
      b.title = `Accent ${i + 1} (${c})`; b.setAttribute('aria-label', `Accent ${i + 1}, ${c}`); b.setAttribute('aria-pressed', String(c === a));
      b.onclick = () => { o.accent = c; save(); render(); }; return b;
    }));
    $('#wtWide').value = o.wide || 'auto'; $('#wtFont').value = o.font; $('#wtSize').value = o.size; $('#wtAlign').checked = o.alignNum; $('#wtFit').checked = o.fit;
    $('#wordTableOutput').innerHTML = rows.length ? tableHtml(rows, o) : wb ? '<p class="wt-empty">This sheet is empty.</p>' : $('#wordTableOutput').innerHTML;
    $('#copyTableBtn').disabled = $('#exportDocxBtn').disabled = !rows.length;
  }
  function loadSheet() {
    const ws = wb.Sheets[$('#sheetSelector').value];
    // Cells as Excel shows them (number formats, %), without empty rows and trailing empty columns.
    rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }).filter((r) => r.some((c) => String(c).trim() !== ''));
    const nC = rows.reduce((m, r) => Math.max(m, r.reduceRight((k, c, i) => (k || String(c).trim() === '' ? k : i + 1), 0)), 0);
    rows = rows.map((r) => Array.from({ length: nC }, (_, i) => r[i] ?? ''));
    render();
  }
  const syncAccent = pairHex($('#wtAccent'));
  $('#wtAccent').addEventListener('input', (e) => { o.accent = e.target.value; save(); render(); });
  $('#wordFileInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' });
      $('#sheetSelector').innerHTML = wb.SheetNames.map((n) => `<option>${esc(n)}</option>`).join('');
      loadSheet(); status(`${f.name}: ${rows.length} rows`);
    } catch { status('Could not read this file. Use an .xlsx, .xls or .csv file.'); }
  };
  $('#sheetSelector').onchange = () => wb && loadSheet();
  root.querySelector('.wt-gallery').addEventListener('click', (e) => { const b = e.target.closest('.wt-tile'); if (b) { o.style = b.dataset.style; save(); render(); } });
  root.querySelectorAll('[data-opt]').forEach((c) => c.addEventListener('change', () => { o[c.dataset.opt] = c.checked; save(); render(); }));
  $('#wtFont').onchange = (e) => { o.font = e.target.value; save(); render(); };
  $('#wtSize').onchange = (e) => { o.size = Math.min(40, Math.max(6, +e.target.value || 11)); save(); render(); };
  $('#wtAlign').onchange = (e) => { o.alignNum = e.target.checked; save(); render(); };
  $('#wtFit').onchange = (e) => { o.fit = e.target.checked; save(); render(); };
  $('#wtWide').onchange = (e) => { o.wide = e.target.value; save(); };
  // A new chart colour theme brings its accent.
  addEventListener('site-theme', () => { o.accent = null; save(); render(); });

  $('#copyTableBtn').onclick = async () => {
    const html = tableHtml(rows, o, { split: true }); const text = rows.map((r) => r.join('\t')).join('\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      status('Table copied. Paste it into Word (Ctrl+V).');
    } catch {
      // Older browsers: copy the shown table as a selection.
      const t = $('#wordTableOutput table'); const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(t); sel.removeAllRanges(); sel.addRange(r);
      const ok = document.execCommand('copy'); sel.removeAllRanges();
      status(ok ? 'Table copied. Paste it into Word (Ctrl+V).' : 'Copy was blocked: select the table and press Ctrl+C.');
    }
  };
  $('#exportDocxBtn').onclick = async () => {
    const btn = $('#exportDocxBtn'); btn.disabled = true;
    const title = ($('#sheetSelector').value || 'Table').replace(/[\\/:*?"<>|]+/g, '-');
    try {
      const { bytes, tables, landscape, records } = await tableDocx(rows, o, title);
      download(bytes, `${title}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      status(records ? `${title}.docx downloaded: ${tables} rows, one block each (question | answer), because ${rows[0].length} columns are too wide for a page` : `${title}.docx downloaded${landscape ? ' (landscape page)' : ''}${tables > 1 ? `: ${rows[0].length} columns do not fit one page readably, so it is split into ${tables} tables${o.first ? ', each starting with the first column' : ''}` : ''}`);
    } catch (e) { status(e.message); } finally { btn.disabled = !rows.length; }
  };
  render();
}
