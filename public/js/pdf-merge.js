// Merge PDFs (Acrobat's Combine files): add several PDFs, keep a page range of each, put the pages in order (drag,
// or the arrow buttons), turn or remove pages, then Save as one PDF or print it. Pages are copied with pdf-lib, so
// text, links and fonts stay as they are; nothing leaves the device.
import { loadLibs } from './pdf-markup.js';

const WARN_BYTES = 12 * 1024 * 1024; // above this in all, iPad Safari may run short of memory
const CAP_BYTES = 100 * 1024 * 1024;
const THUMB = 132; // thumbnail width, px
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const isLocked = (bytes) => /\/Encrypt\b/.test(new TextDecoder('latin1').decode(bytes));

// "1-3, 5, 8-" -> page indexes (0-based) of a file with n pages; empty means every page.
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
  const st = { files: [], tiles: [], nextId: 1 }; // files: { id, name, bytes, doc, n, range, locked }; tiles: { fid, i, rot }
  const $ = (s) => root.querySelector(s);
  root.innerHTML = `
    <div class="sidebar bt-side">
      <div class="control-group"><label for="mgFiles">Add PDFs</label><input type="file" id="mgFiles" accept=".pdf,application/pdf" multiple>
        <p class="help-text">Or drop PDFs on this page. Each file's pages are added at the end; drag the pages (or use the arrows) to put them in order.</p></div>
      <div class="control-group"><span class="bt-label">Files</span><ol class="mg-files" id="mgList"></ol></div>
      <div class="control-group"><label for="mgName">File name</label><input type="text" id="mgName" value="merged.pdf" autocomplete="off" maxlength="120"></div>
      <div class="bt-actions"><button type="button" class="gc-btn gc-primary" id="mgSave" disabled>Save as PDF</button><button type="button" class="gc-btn" id="mgPrint" disabled>Print</button><button type="button" class="gc-btn gc-quiet" id="mgClear" disabled>Clear</button></div>
      <p class="gc-status" id="mgStatus" role="status"></p>
    </div>
    <div class="main-content bt-main">
      <div class="gc-bar"><h2 class="gc-h">Pages <span class="bt-count" id="mgCount"></span></h2></div>
      <div class="mg-grid" id="mgGrid" aria-label="Pages of the merged PDF, in order"><div class="gc-empty" id="mgEmpty"><b>Merge PDFs into one file.</b><br>Add two or more PDFs, choose the pages of each, put them in order, then Save as PDF or Print.</div></div>
    </div>`;
  const grid = $('#mgGrid'); const list = $('#mgList');
  const status = (t) => { $('#mgStatus').textContent = t; };
  const fileOf = (id) => st.files.find((f) => f.id === id);

  // ---------- adding files ----------
  async function addFiles(fs) {
    const pdfs = [...fs].filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!pdfs.length) { status('Choose PDF files.'); return; }
    const [pdfjs] = await loadLibs();
    for (const f of pdfs) {
      const total = st.files.reduce((s, x) => s + x.bytes.length, 0) + f.size;
      if (total > CAP_BYTES) { status(`${f.name} not added: all the files together would pass ${mb(CAP_BYTES)}.`); continue; }
      status(`Opening ${f.name}…`);
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
        const file = { id: st.nextId++, name: f.name, bytes, doc, n: doc.numPages, range: '', locked: isLocked(bytes) };
        st.files.push(file);
        for (let i = 0; i < file.n; i++) st.tiles.push({ fid: file.id, i, rot: 0 });
      } catch (err) { status(`${f.name} could not be opened${/password/i.test(err.message) ? ' (it needs a password)' : ''}.`); continue; }
    }
    draw();
    const total = st.files.reduce((s, x) => s + x.bytes.length, 0);
    const locked = st.files.filter((x) => x.locked).map((x) => x.name);
    status([`${st.files.length} file${st.files.length === 1 ? '' : 's'}, ${st.tiles.length} pages (${mb(total)})`,
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
      <span class="mg-fname" title="${esc(f.name)}">${esc(f.name)}</span><span class="mg-fmeta">${f.n} page${f.n === 1 ? '' : 's'} · ${mb(f.bytes.length)}${f.locked ? ' · locked' : ''}</span>
      <label class="mg-range">Pages <input type="text" inputmode="numeric" value="${esc(f.range)}" placeholder="all, e.g. 1-3, 5" aria-label="Pages of ${esc(f.name)} to keep"></label>
      <span class="mg-fbtns"><button type="button" class="bt-ic" data-act="up" aria-label="Move ${esc(f.name)} up"${k ? '' : ' disabled'}>↑</button><button type="button" class="bt-ic" data-act="down" aria-label="Move ${esc(f.name)} down"${k < st.files.length - 1 ? '' : ' disabled'}>↓</button><button type="button" class="bt-ic" data-act="remove" aria-label="Remove ${esc(f.name)}">✕</button></span></li>`).join('');
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const id = +b.closest('.mg-file').dataset.id;
    if (b.dataset.act === 'remove') { st.files = st.files.filter((f) => f.id !== id); st.tiles = st.tiles.filter((t) => t.fid !== id); fileOf(id)?.doc.destroy?.(); draw(); return; }
    // move the file and its pages together, before or after the next file's pages
    const k = st.files.findIndex((f) => f.id === id); const j = b.dataset.act === 'up' ? k - 1 : k + 1; if (j < 0 || j >= st.files.length) return;
    [st.files[k], st.files[j]] = [st.files[j], st.files[k]];
    const order = st.files.map((f) => f.id); st.tiles.sort((a, b2) => order.indexOf(a.fid) - order.indexOf(b2.fid)); draw();
  });
  list.addEventListener('change', (e) => {
    const inp = e.target.closest('.mg-range input'); if (!inp) return; const f = fileOf(+inp.closest('.mg-file').dataset.id);
    const keep = parseRange(inp.value, f.n); if (!keep) { status(`Pages of ${f.name}: write them like 1-3, 5 (it has ${f.n}).`); inp.value = f.range; return; }
    f.range = inp.value.trim();
    // the file's pages, in the order asked for, where its first page was
    const at = st.tiles.findIndex((t) => t.fid === f.id); const rot = new Map(st.tiles.filter((t) => t.fid === f.id).map((t) => [t.i, t.rot]));
    st.tiles = st.tiles.filter((t) => t.fid !== f.id);
    st.tiles.splice(at < 0 ? st.tiles.length : at, 0, ...keep.map((i) => ({ fid: f.id, i, rot: rot.get(i) || 0 })));
    draw(); status(`${f.name}: ${keep.length} of ${f.n} pages`);
  });

  // ---------- page tiles: thumbnails, order, turn, remove ----------
  const seen = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { seen.unobserve(e.target); paint(e.target); } }), { root: null, rootMargin: '300px' });
  async function paint(tile) {
    const t = st.tiles[+tile.dataset.k]; const f = t && fileOf(t.fid); if (!f) return;
    try {
      const page = await f.doc.getPage(t.i + 1); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: (THUMB * 2) / vp0.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      tile.querySelector('.mg-thumb').replaceChildren(cv);
    } catch { /* a page that will not draw keeps its blank card */ }
  }
  function draw() {
    drawList();
    const many = st.tiles.length; const several = new Set(st.tiles.map((t) => t.fid)).size > 1;
    $('#mgCount').textContent = many ? `(${many})` : '';
    ['#mgSave', '#mgPrint', '#mgClear'].forEach((s) => { $(s).disabled = !many; });
    if (!many) { grid.replaceChildren($('#mgEmpty') || Object.assign(document.createElement('div'), { className: 'gc-empty', id: 'mgEmpty', innerHTML: '<b>Merge PDFs into one file.</b><br>Add two or more PDFs, choose the pages of each, put them in order, then Save as PDF or Print.' })); return; }
    grid.replaceChildren(...st.tiles.map((t, k) => {
      const f = fileOf(t.fid); const el = document.createElement('figure'); el.className = 'mg-tile'; el.dataset.k = k; el.draggable = true;
      el.innerHTML = `<div class="mg-thumb" style="--rot:${t.rot}deg"${t.rot % 180 ? ' data-quarter' : ''} aria-hidden="true"></div>
        <figcaption><b>${k + 1}</b> <span title="${esc(f.name)}">${several ? `${esc(f.name.replace(/\.pdf$/i, ''))} · ` : ''}p.${t.i + 1}</span></figcaption>
        <div class="mg-tbtns"><button type="button" class="bt-ic" data-act="left" aria-label="Move page ${k + 1} earlier"${k ? '' : ' disabled'}>←</button><button type="button" class="bt-ic" data-act="rot" aria-label="Turn page ${k + 1}">⟳</button><button type="button" class="bt-ic" data-act="del" aria-label="Remove page ${k + 1}">✕</button><button type="button" class="bt-ic" data-act="right" aria-label="Move page ${k + 1} later"${k < many - 1 ? '' : ' disabled'}>→</button></div>`;
      seen.observe(el); return el;
    }));
  }
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return; const k = +b.closest('.mg-tile').dataset.k; const t = st.tiles[k];
    if (b.dataset.act === 'rot') { t.rot = (t.rot + 90) % 360; const th = b.closest('.mg-tile').querySelector('.mg-thumb'); th.style.setProperty('--rot', `${t.rot}deg`); th.toggleAttribute('data-quarter', t.rot % 180 !== 0); return; }
    if (b.dataset.act === 'del') st.tiles.splice(k, 1);
    else { const j = b.dataset.act === 'left' ? k - 1 : k + 1; [st.tiles[k], st.tiles[j]] = [st.tiles[j], st.tiles[k]]; }
    draw(); grid.querySelector(`.mg-tile[data-k="${Math.min(k, st.tiles.length - 1)}"] [data-act="${b.dataset.act}"]`)?.focus();
  });
  let dragK = null;
  grid.addEventListener('dragstart', (e) => { const el = e.target.closest('.mg-tile'); if (!el) return; dragK = +el.dataset.k; el.classList.add('mg-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragK)); });
  grid.addEventListener('dragend', () => { dragK = null; grid.querySelectorAll('.mg-dragging, .mg-over').forEach((x) => x.classList.remove('mg-dragging', 'mg-over')); });
  grid.addEventListener('dragover', (e) => { if (dragK == null) return; const el = e.target.closest('.mg-tile'); e.preventDefault(); e.stopPropagation(); grid.querySelectorAll('.mg-over').forEach((x) => x.classList.remove('mg-over')); el?.classList.add('mg-over'); });
  grid.addEventListener('drop', (e) => {
    if (dragK == null) return; e.preventDefault(); e.stopPropagation();
    const el = e.target.closest('.mg-tile'); const to = el ? +el.dataset.k : st.tiles.length - 1;
    const [t] = st.tiles.splice(dragK, 1); st.tiles.splice(to, 0, t); dragK = null; draw();
  });
  $('#mgClear').onclick = () => { st.files.forEach((f) => f.doc.destroy?.()); st.files = []; st.tiles = []; draw(); status(''); };

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
      if (handle) { const w = await handle.createWritable(); await w.write(bytes); await w.close(); status(`Saved ${handle.name} (${st.tiles.length} pages, ${mb(bytes.length)})`); }
      else { download(bytes, name, 'application/pdf'); status(`${name} downloaded (${st.tiles.length} pages, ${mb(bytes.length)})`); }
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
