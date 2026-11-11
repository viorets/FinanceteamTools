// Merge PDFs (Acrobat's Combine files): add several PDFs, keep a page range of each, put the pages in order, turn or
// remove pages, then Save as one PDF or print it. Pages are copied with pdf-lib, so text, links and fonts stay as
// they are; nothing leaves the device.
// Pages are chosen, then acted on: tap or click a page to choose it (Shift: a run of pages), and the bar above the
// pages turns, moves or removes the chosen ones. Keyboard: arrows move between pages, Space chooses, Delete removes,
// Ctrl/⌘ + arrows move the chosen pages, Ctrl/⌘ + A chooses all, Ctrl/⌘ + Z undoes. Pages can also be dragged.
import { loadLibs } from './pdf-markup.js';
import { noticeBox } from './view-tools.js';

const WARN_BYTES = 12 * 1024 * 1024; // above this in all, iPad Safari may run short of memory
const CAP_BYTES = 100 * 1024 * 1024;
const THUMB = 132; // thumbnail width, px
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const size = (n) => (n < 102400 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const isLocked = (bytes) => /\/Encrypt\b/.test(new TextDecoder('latin1').decode(bytes));

// Line icons for the batch tools (24px grid, 2px stroke, as the site's other icons).
const svg = (d) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const BI = {
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'), down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  left: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'), right: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  turn: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'), remove: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'), close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  add: svg('<path d="M12 5v14M5 12h14"/>'), merge: '<svg class="ed-ic" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/><path d="M14 7h5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-5"/><path d="M10 10h6M13 7v6"/></svg>',
};

// "1-3, 5, 8-" -> page indexes (0-based) of a file with n pages; empty means every page; null when it cannot be read.
export function parseRange(text, n) {
  const t = String(text || '').trim(); if (!t) return [...Array(n).keys()];
  const out = [];
  for (const part of t.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d+)?\s*(?:[-–](\s*\d+)?)?$/.exec(part); if (!m || (!m[1] && !part.includes('-'))) return null;
    const a = m[1] ? +m[1] : 1; const b = part.includes('-') ? (m[2] ? +m[2] : n) : a;
    if (a < 1 || b < a || a > n) return null;
    for (let i = a; i <= Math.min(b, n); i++) out.push(i - 1);
  }
  return out;
}

export function openPdfMerge(root, { download }) {
  // files: { id, name, bytes, doc, n, range, locked }; tiles: { key, fid, i, rot, ar } (ar: page width / height)
  const st = { files: [], tiles: [], nextId: 1, nextKey: 1, sel: new Set(), anchor: null, focus: 0, undo: [] };
  const $ = (s) => root.querySelector(s);
  root.innerHTML = `
    <div class="sidebar bt-side">
      <input type="file" id="mgFiles" accept=".pdf,application/pdf" multiple hidden>
      <div class="control-group"><span class="bt-label">Files</span><ol class="mg-files" id="mgList"></ol>
        <button type="button" class="gc-btn bt-add" id="mgAdd">${BI.add}<span>Add PDFs</span></button>
        <p class="help-text">Or drop PDFs on this page. Each file's pages go at the end.</p></div>
      <div class="control-group"><label for="mgName">File name</label><input type="text" id="mgName" value="merged.pdf" autocomplete="off" maxlength="120"></div>
      <p class="gc-status bt-status" id="mgStatus" role="status"></p>
    </div>
    <div class="main-content bt-main">
      <div class="gc-bar"><h2 class="gc-h">Pages <span class="bt-count" id="mgCount"></span></h2>
        <button type="button" class="bt-ic" id="mgUndo" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled>${BI.undo}</button>
        <button type="button" class="gc-btn gc-quiet" id="mgClear" disabled>Clear</button>
        <button type="button" class="gc-btn" id="mgPrint" disabled>Print</button>
        <button type="button" class="gc-btn gc-primary" id="mgSave" disabled>Save as PDF</button></div>
      <div class="mg-selbar" id="mgSelbar" role="toolbar" aria-label="Chosen pages" hidden>
        <span class="mg-selcount" id="mgSelcount"></span>
        <button type="button" class="bt-tool" data-act="left" title="Move earlier (Ctrl+←)">${BI.left}<span>Earlier</span></button>
        <button type="button" class="bt-tool" data-act="right" title="Move later (Ctrl+→)">${BI.right}<span>Later</span></button>
        <button type="button" class="bt-tool" data-act="turn" title="Turn a quarter">${BI.turn}<span>Turn</span></button>
        <button type="button" class="bt-tool bt-danger" data-act="del" title="Remove (Delete)">${BI.remove}<span>Remove</span></button>
        <button type="button" class="bt-tool" data-act="none" title="Choose none (Esc)">${BI.close}<span>Done</span></button>
      </div>
      <div class="mg-grid" id="mgGrid" role="listbox" aria-multiselectable="true" aria-label="Pages of the merged PDF, in order" tabindex="-1"></div>
      <div class="cx-empty" id="mgEmpty">${BI.merge}<h3>Merge PDFs into one file</h3>
        <p>Add two or more PDFs, keep the pages you need, put them in order, then save one PDF or print it.</p>
        <div class="cx-acts"><button type="button" class="action-btn" id="mgAdd2">Add PDFs</button></div>
        <p class="bt-quiet">Or drop them here. The files stay on this device.</p></div>
    </div>`;
  const grid = $('#mgGrid'); const list = $('#mgList');
  const status = (t) => { $('#mgStatus').textContent = t; };
  const fileOf = (id) => st.files.find((f) => f.id === id);
  ['#mgAdd', '#mgAdd2'].forEach((s) => { $(s).onclick = () => $('#mgFiles').click(); });

  // ---------- undo: the file list and the pages before each change ----------
  const snap = (label) => {
    st.undo.push({ label, files: st.files.map((f) => ({ ...f })), tiles: st.tiles.map((t) => ({ ...t })) });
    if (st.undo.length > 50) st.undo.shift();
  };
  function undo() {
    const s = st.undo.pop(); if (!s) return;
    const inGrid = grid.contains(document.activeElement); // keep the keyboard on the pages after Ctrl+Z
    st.files = s.files; st.tiles = s.tiles; st.sel.clear(); draw(); status(`Undone: ${s.label}`);
    if (inGrid && st.tiles.length) focusTile(st.focus);
  }
  $('#mgUndo').onclick = undo;

  // ---------- adding files ----------
  async function addFiles(fs) {
    const pdfs = [...fs].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) { status('Choose PDF files.'); return; }
    const [pdfjs] = await loadLibs();
    let added = 0;
    for (const f of pdfs) {
      const total = st.files.reduce((s, x) => s + x.bytes.length, 0) + f.size;
      if (total > CAP_BYTES) { status(`${f.name} not added: all the files together would pass ${size(CAP_BYTES)}.`); continue; }
      status(`Opening ${f.name}…`);
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        if (!added++) snap(`adding ${pdfs.length > 1 ? `${pdfs.length} files` : f.name}`);
        const file = { id: st.nextId++, name: f.name, bytes, doc, n: doc.numPages, range: '', locked: isLocked(bytes) };
        st.files.push(file);
        for (let i = 0; i < file.n; i++) st.tiles.push({ key: st.nextKey++, fid: file.id, i, rot: 0 });
      } catch (err) { status(`${f.name} could not be opened${/password/i.test(err.message) ? ' (it needs a password)' : ''}.`); continue; }
    }
    draw();
    const total = st.files.reduce((s, x) => s + x.bytes.length, 0);
    const locked = st.files.filter((x) => x.locked).map((x) => x.name);
    status([`${st.files.length} file${st.files.length === 1 ? '' : 's'}, ${st.tiles.length} pages (${size(total)})`,
      total > WARN_BYTES ? 'large files: on iPad, saving may take a while' : '',
      locked.length ? `locked by its author: ${locked.join(', ')} (its pages are copied if the PDF allows it)` : ''].filter(Boolean).join(' · '));
  }
  $('#mgFiles').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  root.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('ed-drop'); } });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove('ed-drop'); });
  root.addEventListener('drop', (e) => { root.classList.remove('ed-drop'); if (!e.dataTransfer?.files.length) return; e.preventDefault(); addFiles(e.dataTransfer.files); });

  // ---------- the file list: page range, order, remove ----------
  function drawList() {
    list.innerHTML = st.files.map((f, k) => `<li class="mg-file" data-id="${f.id}">
      <span class="mg-fname" title="${esc(f.name)}">${esc(f.name)}</span><span class="mg-fmeta">${f.n} page${f.n === 1 ? '' : 's'} · ${size(f.bytes.length)}${f.locked ? ' · locked' : ''}</span>
      <label class="mg-range">Pages to keep <input type="text" inputmode="numeric" value="${esc(f.range)}" placeholder="all, or e.g. 1-3, 5" aria-describedby="mgErr${f.id}"></label>
      <p class="bt-err" id="mgErr${f.id}" hidden></p>
      <span class="mg-fbtns"><button type="button" class="bt-ic" data-act="up" aria-label="Move ${esc(f.name)} up"${k ? '' : ' disabled'}>${BI.up}</button><button type="button" class="bt-ic" data-act="down" aria-label="Move ${esc(f.name)} down"${k < st.files.length - 1 ? '' : ' disabled'}>${BI.down}</button><button type="button" class="bt-ic" data-act="remove" aria-label="Take ${esc(f.name)} out">${BI.close}</button></span></li>`).join('');
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const id = +b.closest('.mg-file').dataset.id; const f = fileOf(id);
    if (b.dataset.act === 'remove') { snap(`taking out ${f.name}`); st.files = st.files.filter((x) => x.id !== id); st.tiles = st.tiles.filter((t) => t.fid !== id); st.sel.clear(); draw(); status(`${f.name} taken out · Undo puts it back`); return; }
    // the file and its pages move together, before or after the next file's pages
    const k = st.files.findIndex((x) => x.id === id); const j = b.dataset.act === 'up' ? k - 1 : k + 1; if (j < 0 || j >= st.files.length) return;
    snap(`moving ${f.name}`); [st.files[k], st.files[j]] = [st.files[j], st.files[k]];
    const order = st.files.map((x) => x.id); st.tiles.sort((a, c) => order.indexOf(a.fid) - order.indexOf(c.fid)); draw();
  });
  list.addEventListener('change', (e) => {
    const inp = e.target.closest('.mg-range input'); if (!inp) return; const f = fileOf(+inp.closest('.mg-file').dataset.id);
    const err = $(`#mgErr${f.id}`); const keep = parseRange(inp.value, f.n);
    if (!keep) { inp.setAttribute('aria-invalid', 'true'); err.textContent = `Write the pages like 1-3, 5 (this file has ${f.n}).`; err.hidden = false; return; }
    inp.removeAttribute('aria-invalid'); err.hidden = true;
    snap(`pages of ${f.name}`); f.range = inp.value.trim();
    // the file's pages, in the order asked for, where its first page was
    const at = st.tiles.findIndex((t) => t.fid === f.id); const old = new Map(st.tiles.filter((t) => t.fid === f.id).map((t) => [t.i, t]));
    st.tiles = st.tiles.filter((t) => t.fid !== f.id);
    st.tiles.splice(at < 0 ? st.tiles.length : at, 0, ...keep.map((i) => old.get(i) || { key: st.nextKey++, fid: f.id, i, rot: 0 }));
    st.sel.clear(); draw(); status(`${f.name}: ${keep.length} of ${f.n} pages`);
  });

  // ---------- the pages: thumbnails, choosing, order, turn, remove ----------
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { seen.unobserve(e.target); paint(e.target); } }), { root: null, rootMargin: '300px' });
  async function paint(tile) {
    const t = st.tiles.find((x) => x.key === +tile.dataset.key); const f = t && fileOf(t.fid); if (!f) return;
    try {
      const page = await f.doc.getPage(t.i + 1); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: (THUMB * 2) / vp0.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      t.ar = vp0.width / vp0.height; shape(tile, t);
      tile.querySelector('.mg-thumb').replaceChildren(cv);
    } catch { /* a page that will not draw keeps its blank card */ }
  }
  // the thumbnail's box follows the page (a landscape slide gets a landscape box), turned or not
  const shape = (tile, t) => { const th = tile.querySelector('.mg-thumb'); const ar = t.ar || 1 / 1.414; th.style.aspectRatio = String(t.rot % 180 ? 1 / ar : ar); th.style.setProperty('--rot', `${t.rot}deg`); th.toggleAttribute('data-quarter', t.rot % 180 !== 0); th.style.setProperty('--fit', String(t.rot % 180 ? Math.min(ar, 1 / ar) : 1)); };
  const selected = () => st.tiles.filter((t) => st.sel.has(t.key));
  function draw() {
    drawList();
    const many = st.tiles.length; const several = new Set(st.tiles.map((t) => t.fid)).size > 1;
    st.sel.forEach((k) => { if (!st.tiles.some((t) => t.key === k)) st.sel.delete(k); });
    st.focus = Math.min(st.focus, Math.max(0, many - 1));
    $('#mgCount').textContent = many ? `(${many})` : '';
    ['#mgSave', '#mgPrint', '#mgClear'].forEach((s) => { $(s).disabled = !many; });
    $('#mgUndo').disabled = !st.undo.length;
    $('#mgEmpty').hidden = !!many; grid.hidden = !many;
    grid.replaceChildren(...st.tiles.map((t, k) => {
      const f = fileOf(t.fid); const el = document.createElement('figure'); el.className = 'mg-tile'; el.dataset.key = t.key; el.draggable = true;
      el.setAttribute('role', 'option'); el.setAttribute('aria-selected', String(st.sel.has(t.key))); el.tabIndex = k === st.focus ? 0 : -1;
      el.setAttribute('aria-label', `Page ${k + 1}: ${f.name} page ${t.i + 1}${t.rot ? `, turned ${t.rot}°` : ''}`);
      el.innerHTML = `<div class="mg-thumb" aria-hidden="true"></div><figcaption aria-hidden="true"><b>${k + 1}</b> <span title="${esc(f.name)}">${several ? `${esc(f.name.replace(/\.pdf$/i, ''))} · ` : ''}p.${t.i + 1}</span></figcaption>`;
      shape(el, t); seen.observe(el); return el;
    }));
    const n = st.sel.size; $('#mgSelbar').hidden = !n;
    $('#mgSelcount').textContent = n ? `${n} page${n === 1 ? '' : 's'} chosen` : '';
  }
  const tileAt = (k) => grid.children[k];
  function focusTile(k, opts = {}) { st.focus = Math.max(0, Math.min(st.tiles.length - 1, k)); [...grid.children].forEach((c, i) => { c.tabIndex = i === st.focus ? 0 : -1; }); tileAt(st.focus)?.focus(opts); }
  function choose(k, { range = false, only = false } = {}) {
    const key = st.tiles[k].key;
    if (range && st.anchor != null) {
      const a = st.tiles.findIndex((t) => t.key === st.anchor); const [lo, hi] = a < k ? [a, k] : [k, a];
      for (let i = lo; i <= hi; i++) st.sel.add(st.tiles[i].key);
    } else if (only) { st.sel.clear(); st.sel.add(key); st.anchor = key; } else { if (st.sel.has(key)) st.sel.delete(key); else st.sel.add(key); st.anchor = key; }
    st.focus = k; draw(); tileAt(k)?.focus({ preventScroll: true });
  }
  grid.addEventListener('click', (e) => { const el = e.target.closest('.mg-tile'); if (!el) return; choose([...grid.children].indexOf(el), { range: e.shiftKey }); });
  // the chosen pages: move one place earlier or later, turn, remove
  function act(a) {
    const chosen = selected(); if (!chosen.length) return;
    if (a === 'none') { st.sel.clear(); draw(); focusTile(st.focus); return; }
    if (a === 'turn') { snap('turning pages'); chosen.forEach((t) => { t.rot = (t.rot + 90) % 360; }); draw(); focusTile(st.focus); status(`${chosen.length} page${chosen.length === 1 ? '' : 's'} turned`); return; }
    if (a === 'del') {
      snap(`removing ${chosen.length} page${chosen.length === 1 ? '' : 's'}`);
      st.tiles = st.tiles.filter((t) => !st.sel.has(t.key)); st.sel.clear(); draw(); focusTile(st.focus);
      status(`${chosen.length} page${chosen.length === 1 ? '' : 's'} removed · Undo puts ${chosen.length === 1 ? 'it' : 'them'} back`); return;
    }
    const d = a === 'left' ? -1 : 1; const idx = st.tiles.map((t, i) => (st.sel.has(t.key) ? i : -1)).filter((i) => i >= 0);
    if ((d < 0 && idx[0] === 0) || (d > 0 && idx.at(-1) === st.tiles.length - 1)) return;
    snap('moving pages');
    for (const i of d < 0 ? idx : idx.reverse()) [st.tiles[i], st.tiles[i + d]] = [st.tiles[i + d], st.tiles[i]];
    draw(); const first = st.tiles.findIndex((t) => st.sel.has(t.key)); focusTile(d < 0 ? first : st.tiles.findLastIndex((t) => st.sel.has(t.key)));
    status(`Moved to page ${first + 1}`);
  }
  $('#mgSelbar').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) act(b.dataset.act); });
  grid.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey; const k = st.focus; const cols = Math.max(1, Math.round(grid.clientWidth / (tileAt(0)?.offsetWidth || 150)));
    const go = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, Home: -Infinity, End: Infinity }[e.key];
    if (mod && (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); if (!st.sel.size) choose(k, { only: true }); act(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 'left' : 'right'); return; }
    if (go != null) { e.preventDefault(); const to = Math.max(0, Math.min(st.tiles.length - 1, k + (Number.isFinite(go) ? go : go < 0 ? -k : st.tiles.length))); if (e.shiftKey) choose(to, { range: true }); else focusTile(to); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); choose(k); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (!st.sel.size) choose(k, { only: true }); act('del'); return; }
    if (e.key === 'Escape' && st.sel.size) { e.preventDefault(); act('none'); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); st.tiles.forEach((t) => st.sel.add(t.key)); draw(); focusTile(k); }
  });
  root.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest('input')) { e.preventDefault(); undo(); } });
  // dragging a page (and the other chosen pages with it) to a new place
  let dragKey = null;
  grid.addEventListener('dragstart', (e) => { const el = e.target.closest('.mg-tile'); if (!el) return; dragKey = +el.dataset.key; el.classList.add('mg-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragKey)); });
  grid.addEventListener('dragend', () => { dragKey = null; grid.querySelectorAll('.mg-dragging, .mg-over').forEach((x) => x.classList.remove('mg-dragging', 'mg-over')); });
  grid.addEventListener('dragover', (e) => { if (dragKey == null) return; e.preventDefault(); e.stopPropagation(); grid.querySelectorAll('.mg-over').forEach((x) => x.classList.remove('mg-over')); e.target.closest('.mg-tile')?.classList.add('mg-over'); });
  grid.addEventListener('drop', (e) => {
    if (dragKey == null) return; e.preventDefault(); e.stopPropagation();
    const target = e.target.closest('.mg-tile'); const toKey = target ? +target.dataset.key : null;
    const moving = st.sel.has(dragKey) ? selected() : st.tiles.filter((t) => t.key === dragKey);
    if (moving.some((t) => t.key === toKey)) { dragKey = null; return; }
    snap('moving pages');
    st.tiles = st.tiles.filter((t) => !moving.includes(t)); const at = toKey == null ? st.tiles.length : st.tiles.findIndex((t) => t.key === toKey);
    st.tiles.splice(at, 0, ...moving); dragKey = null; draw(); status(`Moved to page ${at + 1}`);
  });
  $('#mgClear').onclick = async () => {
    if (st.tiles.length > 10 && !(await noticeBox('Clear all pages?', `<p>${st.files.length} file${st.files.length === 1 ? '' : 's'} and ${st.tiles.length} pages come off the list. Undo puts them back.</p>`, [{ v: false, label: 'Keep them' }, { v: true, label: 'Clear', primary: true }], { none: false }))) return;
    snap('clearing'); st.files = []; st.tiles = []; st.sel.clear(); draw(); status('Cleared · Undo puts the files back');
  };

  // ---------- the merged PDF ----------
  async function merged() {
    const [, PDFLib] = await loadLibs();
    const out = await PDFLib.PDFDocument.create(); const src = new Map();
    for (const f of st.files) {
      if (!st.tiles.some((t) => t.fid === f.id)) continue;
      try { src.set(f.id, await PDFLib.PDFDocument.load(f.bytes, { ignoreEncryption: true })); }
      catch { throw new Error(`${f.name} could not be read for merging.`); }
    }
    for (const [k, t] of st.tiles.entries()) {
      if (k % 20 === 0) status(`Merging page ${k + 1} of ${st.tiles.length}…`);
      const [pg] = await out.copyPages(src.get(t.fid), [t.i]);
      if (t.rot) pg.setRotation(PDFLib.degrees((pg.getRotation().angle + t.rot) % 360));
      out.addPage(pg);
    }
    out.setProducer('TUSU Finance Team Tools');
    return out.save();
  }
  const outName = () => { const n = ($('#mgName').value.trim() || 'merged').replace(/[\\/:*?"<>|]/g, '_'); return /\.pdf$/i.test(n) ? n : `${n}.pdf`; };
  $('#mgSave').onclick = async () => {
    const name = outName();
    // Chrome and Edge ask where to save (Save as); elsewhere the file downloads under its name
    let handle = null;
    if (window.showSaveFilePicker) {
      try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] }); }
      catch (err) { if (err.name === 'AbortError') return; handle = null; }
    }
    try {
      const bytes = await merged();
      if (handle) { const w = await handle.createWritable(); await w.write(bytes); await w.close(); status(`Saved ${handle.name} (${st.tiles.length} pages, ${size(bytes.length)})`); }
      else { download(bytes, name, 'application/pdf'); status(`${name} downloaded (${st.tiles.length} pages, ${size(bytes.length)})`); }
    } catch (err) { status(err.message); }
  };
  $('#mgPrint').onclick = async () => {
    // The tab opens on the tap (Safari blocks one opened later); the merged PDF loads in it, where Print is a tap away.
    const w = window.open('', '_blank');
    try {
      const bytes = await merged(); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (w) { w.location.href = url; status('The merged PDF is open in a new tab: print it from there.'); }
      else { download(bytes, outName(), 'application/pdf'); status('Pop-ups are blocked: the merged PDF was downloaded instead; print it from there.'); }
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    } catch (err) { w?.close(); status(err.message); }
  };
  draw();
  return { addFiles };
}
