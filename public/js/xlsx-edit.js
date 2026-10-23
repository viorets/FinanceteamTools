// Excel editor (prototype): edit cell values of an .xlsx in the browser with ExcelJS. Styles, formulas, number
// formats, merged cells and column widths are kept; charts, images and pivot tables are not (ExcelJS drops them).
// On a protected sheet, locked cells stay read-only, and relock() (xlsx-relock.js, from TUSUFinanceFeedback) copies
// the original file's protection back onto the saved copy, so its password never has to be known.
import { relock } from './xlsx-relock.js';

const EXCELJS = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
const MAX_ROWS = 1000; const MAX_COLS = 60; // grid size shown; larger sheets show their top-left part

const loadExcelJS = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = EXCELJS; s.crossOrigin = 'anonymous';
  s.onload = () => res(window.ExcelJS); s.onerror = () => rej(new Error('Could not load the Excel tools. Try again.'));
  document.head.append(s);
});

const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const parseAddr = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); return [+m[2], colNum(m[1])]; };
const pad = (n) => String(n).padStart(2, '0');

// The text a cell shows while it is being edited: "=FORMULA" for formulas, yyyy-mm-dd for dates.
function rawText(cell) {
  if (cell.formula) return `=${cell.formula}`;
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'object') return v.richText ? v.richText.map((r) => r.text).join('') : v.text ?? v.error ?? '';
  return String(v);
}
// The text a cell shows in the grid: a formula's last calculated result (none stored: blank, as in Excel), else its value.
function shownText(cell) {
  if (cell.formula) { const r = cell.result; return r == null ? '' : typeof r === 'object' ? r.error ?? '' : String(r); }
  return rawText(cell);
}
// Typed text -> cell value: "=..." formula, number, date (only where the cell held a date), else text.
function parseValue(text, cell) {
  if (text === '') return null;
  if (text.startsWith('=') && text.length > 1) return { formula: text.slice(1) };
  const num = text.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(num)) return Number(num);
  if (cell.value instanceof Date && /^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00Z`);
  return text;
}

// Marks the saved file so Excel recalculates every formula when it opens it (edited cells change results, and a
// formula typed here has none yet). Done last, on the XML, because relock() rewrites the workbook.
async function recalcOnOpen(buf) {
  const zip = await window.JSZip.loadAsync(buf); // loaded by relock()
  let xml = await zip.file('xl/workbook.xml').async('string');
  xml = /<calcPr\b/.test(xml) ? xml.replace(/<calcPr\b(?![^>]*fullCalcOnLoad)/, '<calcPr fullCalcOnLoad="1"') : xml.replace(/(<\/definedNames>|<\/sheets>)/, '$1<calcPr fullCalcOnLoad="1"/>');
  zip.file('xl/workbook.xml', xml);
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

// Opens the editor in `root`. bytes: the .xlsx (ArrayBuffer). Resolves { isDirty(), save() }; save() resolves the
// edited .xlsx as an ArrayBuffer.
export async function openXlsxEditor(root, bytes) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(bytes.slice(0)); } catch { throw new Error('Could not read this file. Only .xlsx files can be edited.'); }
  if (!wb.worksheets.length) throw new Error('This workbook has no sheets.');
  let dirty = false;

  root.innerHTML = `<div class="oe"><div class="oe-bar">
      <label>Sheet <select id="xe-sheet">${wb.worksheets.map((ws, i) => `<option value="${i}">${ws.name.replace(/</g, '&lt;')}</option>`).join('')}</select></label>
      <span class="oe-note" id="xe-note"></span>
    </div><div class="oe-scroll" id="xe-grid"></div></div>`;
  const grid = root.querySelector('#xe-grid');
  const note = root.querySelector('#xe-note');

  function render(ws) {
    const rows = Math.min(Math.max(ws.rowCount, 1), MAX_ROWS);
    const cols = Math.min(Math.max(ws.columnCount, 1), MAX_COLS);
    const isProtected = !!ws.sheetProtection?.sheet;
    // Merged ranges: the top-left cell spans the range; the others are not drawn.
    const span = new Map(); const covered = new Set();
    (ws.model.merges || []).forEach((m) => {
      const [a, b] = m.split(':').map(parseAddr);
      span.set(`${a[0]}:${a[1]}`, [b[0] - a[0] + 1, b[1] - a[1] + 1]);
      for (let r = a[0]; r <= b[0]; r++) for (let c = a[1]; c <= b[1]; c++) if (r !== a[0] || c !== a[1]) covered.add(`${r}:${c}`);
    });
    const notes = [];
    if (ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS) notes.push(`Showing the first ${rows} rows and ${cols} columns`);
    if (isProtected) notes.push('Protected sheet: grey cells are locked');
    note.textContent = notes.join(' · ');

    const table = document.createElement('table'); table.className = 'xe-table';
    const head = table.insertRow(); head.insertCell().className = 'xe-corner';
    for (let c = 1; c <= cols; c++) {
      const th = document.createElement('th'); th.textContent = colName(c);
      const w = ws.getColumn(c).width; th.style.minWidth = `${Math.round((w || 9) * 7 + 6)}px`;
      head.append(th);
    }
    for (let r = 1; r <= rows; r++) {
      const tr = table.insertRow();
      const rh = document.createElement('th'); rh.textContent = r; tr.append(rh);
      for (let c = 1; c <= cols; c++) {
        if (covered.has(`${r}:${c}`)) continue;
        const cell = ws.getCell(r, c); const td = tr.insertCell();
        const s = span.get(`${r}:${c}`); if (s) { td.rowSpan = s[0]; td.colSpan = s[1]; }
        td.dataset.r = r; td.dataset.c = c; td.textContent = shownText(cell);
        if (cell.font?.bold) td.style.fontWeight = 'bold';
        if (cell.font?.color?.argb) td.style.color = `#${cell.font.color.argb.slice(2)}`;
        if (cell.fill?.type === 'pattern' && cell.fill.fgColor?.argb) td.style.background = `#${cell.fill.fgColor.argb.slice(2)}`;
        if (typeof cell.value === 'number' || cell.formula) td.style.textAlign = 'right';
        if (cell.alignment?.horizontal) td.style.textAlign = cell.alignment.horizontal;
        if (isProtected && cell.protection?.locked !== false) { td.classList.add('xe-locked'); continue; }
        td.contentEditable = 'true'; td.tabIndex = 0;
      }
    }
    grid.replaceChildren(table);

    // Editing: a cell shows its formula while focused; Enter moves down, Escape cancels.
    table.addEventListener('focusin', (e) => { const td = e.target.closest('td[contenteditable]'); if (td) { td.dataset.before = rawText(ws.getCell(+td.dataset.r, +td.dataset.c)); td.textContent = td.dataset.before; } });
    table.addEventListener('focusout', (e) => {
      const td = e.target.closest('td[contenteditable]'); if (!td) return;
      const cell = ws.getCell(+td.dataset.r, +td.dataset.c);
      const text = td.innerText.replace(/\n$/, '');
      if (text !== td.dataset.before) {
        cell.value = parseValue(text, cell);
        td.classList.add('xe-changed'); dirty = true;
      }
      // A formula typed here has no result until Excel calculates it: show the formula itself.
      td.textContent = td.classList.contains('xe-changed') && cell.formula ? `=${cell.formula}` : shownText(cell);
    });
    table.addEventListener('keydown', (e) => {
      const td = e.target.closest('td[contenteditable]'); if (!td) return;
      if (e.key === 'Escape') { td.textContent = td.dataset.before; td.blur(); }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const next = table.querySelector(`td[data-r="${+td.dataset.r + 1}"][data-c="${td.dataset.c}"][contenteditable]`);
        next ? next.focus() : td.blur();
      }
    });
  }

  const sel = root.querySelector('#xe-sheet');
  sel.onchange = () => render(wb.worksheets[+sel.value]);
  render(wb.worksheets[0]);

  return {
    isDirty: () => dirty,
    async save() {
      document.activeElement?.blur?.();
      const edited = await wb.xlsx.writeBuffer();
      const out = await recalcOnOpen(await relock(bytes, edited));
      dirty = false;
      return out;
    },
  };
}
