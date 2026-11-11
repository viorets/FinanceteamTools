// Batch rename: pick files (or a folder), set rules that build each new name, check the preview, then download the
// renamed copies as one ZIP (every browser) or, in Chrome and Edge, rename the files in their folder (with Undo).
// Rules, applied in order: a name template with tokens, find and replace, numbering, letter case, tidy spaces.
// An Excel or CSV list of old name -> new name can name the files instead. Presets keep a set of rules.
import { noticeBox } from './view-tools.js';

const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const STORE = 'tusu-rename-presets';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadZip = () => (window.JSZip ? Promise.resolve(window.JSZip) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = JSZIP; s.crossOrigin = 'anonymous';
  s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error('Could not load the ZIP tool. Try again.')); document.head.append(s);
}));

const thaiDigits = (s) => s.replace(/\d/g, (d) => String.fromCharCode(0x0E50 + +d));
const splitName = (n) => { const m = /^(.*?)(\.[^.]{1,10})?$/.exec(n); return { base: m[1] || n, ext: m[2] ? m[2].slice(1) : '' }; };
// Names every system accepts: no \ / : * ? " < > |, no control characters, no trailing dot or space (Windows).
export function safeName(n) {
  return n.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').slice(0, 200).trim();
}
function fmtDate(d, f, be) {
  const y = d.getFullYear() + (be ? 543 : 0); const m = String(d.getMonth() + 1).padStart(2, '0'); const dd = String(d.getDate()).padStart(2, '0');
  return f === 'ymd' ? `${y}-${m}-${dd}` : f === 'compact' ? `${y}${m}${dd}` : `${dd}-${m}-${y}`;
}
// One file's new name from the rules. i: its place in the list (0-based).
export function newName(file, i, r) {
  const { base, ext } = splitName(file.name);
  let num = String(r.start + i * r.step).padStart(r.pad, '0'); if (r.thai) num = thaiDigits(num);
  const date = fmtDate(new Date(file.lastModified || Date.now()), r.dateFmt, r.be);
  let out = (r.template || '{name}').replace(/\{(name|ext|n|date|today|folder)\}/gi, (_, k) => ({
    name: base, ext, n: num, date, today: fmtDate(new Date(), r.dateFmt, r.be), folder: file.folder || '',
  })[k.toLowerCase()]);
  if (r.find) {
    try { out = out.replace(r.regex ? new RegExp(r.find, r.matchCase ? 'g' : 'gi') : new RegExp(r.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), r.matchCase ? 'g' : 'gi'), r.replace); } catch { /* a pattern still being typed */ }
  }
  if (r.caseMode === 'upper') out = out.toUpperCase(); else if (r.caseMode === 'lower') out = out.toLowerCase();
  else if (r.caseMode === 'title') out = out.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
  if (r.tidy) out = out.replace(/\s+/g, ' ').replace(/\s*([_-])\s*/g, '$1').trim();
  return r.keepExt && ext && !/\{ext\}/i.test(r.template) ? `${out}.${ext}` : out;
}

const DEFAULTS = { template: '{name}', find: '', replace: '', regex: false, matchCase: false, start: 1, step: 1, pad: 2, thai: false, dateFmt: 'dmy', be: true, caseMode: 'keep', tidy: true, keepExt: true, sort: 'added' };

export function openBatchRename(root, { download }) {
  const st = { files: [], r: { ...DEFAULTS }, map: null, dir: null, undo: null }; // files: { name, file, lastModified, size, folder, handle, added }
  const $ = (s) => root.querySelector(s);
  const presets = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
  const savePresets = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); return true; } catch { return false; } };
  const canFolder = typeof window.showDirectoryPicker === 'function';
  root.innerHTML = `
    <div class="sidebar bt-side">
      <div class="control-group"><label for="rnFiles">Add files</label><input type="file" id="rnFiles" multiple>
        <div class="bt-actions rn-src"><label class="gc-btn rn-pick">Add a folder<input type="file" id="rnFolder" webkitdirectory multiple hidden></label>${canFolder ? '<button type="button" class="gc-btn" id="rnDir" title="Chrome and Edge: rename the files where they are">Open folder to rename in place</button>' : ''}</div>
        <p class="help-text">Or drop files here. Nothing is uploaded: the files stay on this device.</p></div>
      <div class="control-group"><label for="rnPreset">Preset</label><div class="rn-row"><select id="rnPreset"><option value="">Choose a preset…</option></select><button type="button" class="bt-ic" id="rnDelP" title="Delete this preset" aria-label="Delete this preset">✕</button></div>
        <div class="rn-row"><input type="text" id="rnPName" placeholder="Name, e.g. Receipts by date" aria-label="Preset name" autocomplete="off" maxlength="60"><button type="button" class="gc-btn" id="rnSaveP">Save preset</button></div></div>
      <div class="control-group"><label for="rnTpl">New name</label><input type="text" id="rnTpl" autocomplete="off" spellcheck="false">
        <p class="help-text rn-tokens">Tokens: <button type="button" data-tok="{name}">{name}</button> <button type="button" data-tok="{n}">{n}</button> <button type="button" data-tok="{date}">{date}</button> <button type="button" data-tok="{today}">{today}</button> <button type="button" data-tok="{folder}">{folder}</button> <button type="button" data-tok="{ext}">{ext}</button><br>e.g. <code>อมธ_{date}_{n}_{name}</code></p></div>
      <details class="rn-set"><summary>Find and replace</summary>
        <div class="gc-pair"><input type="text" id="rnFind" placeholder="Find" aria-label="Find" autocomplete="off" spellcheck="false"><input type="text" id="rnRep" placeholder="Replace with" aria-label="Replace with" autocomplete="off" spellcheck="false"></div>
        <label class="rn-chk"><input type="checkbox" id="rnRegex"> Pattern (regular expression)</label><label class="rn-chk"><input type="checkbox" id="rnCase"> Match case</label></details>
      <details class="rn-set"><summary>Numbering {n}</summary>
        <div class="rn-three"><label>Start <input type="number" id="rnStart" min="0" max="999999"></label><label>Step <input type="number" id="rnStep" min="1" max="1000"></label><label>Digits <input type="number" id="rnPad" min="1" max="8"></label></div>
        <label class="rn-chk"><input type="checkbox" id="rnThai"> Thai digits (๑ ๒ ๓)</label>
        <label>Order <select id="rnSort"><option value="added">As added (or moved)</option><option value="name">By name</option><option value="date">By date (oldest first)</option><option value="size">By size (smallest first)</option></select></label></details>
      <details class="rn-set"><summary>Dates {date} {today}</summary>
        <div class="gc-pair"><select id="rnDate" aria-label="Date format"><option value="dmy">dd-mm-yyyy</option><option value="ymd">yyyy-mm-dd</option><option value="compact">yyyymmdd</option></select><label class="rn-chk"><input type="checkbox" id="rnBe"> Buddhist year (2569)</label></div></details>
      <details class="rn-set"><summary>Tidy</summary>
        <label>Letters <select id="rnCaseMode"><option value="keep">As they are</option><option value="upper">UPPER CASE</option><option value="lower">lower case</option><option value="title">Title Case</option></select></label>
        <label class="rn-chk"><input type="checkbox" id="rnTidy"> Single spaces, none around _ and -</label><label class="rn-chk"><input type="checkbox" id="rnExt"> Keep the file type (.pdf, .xlsx…)</label></details>
      <details class="rn-set"><summary>Names from a list</summary><input type="file" id="rnMap" accept=".xlsx,.xls,.csv" aria-label="Excel or CSV list of old and new names">
        <p class="help-text">An Excel or CSV sheet: old name in the first column, new name in the second. Files on the list take its name; the others follow the rules.</p></details>
    </div>
    <div class="main-content bt-main">
      <div class="gc-bar"><h2 class="gc-h">Preview <span class="bt-count" id="rnCount"></span></h2>
        <button type="button" class="gc-btn gc-primary" id="rnZip" disabled>Download renamed (ZIP)</button>${canFolder ? '<button type="button" class="gc-btn" id="rnApply" disabled>Rename in folder</button><button type="button" class="gc-btn gc-quiet" id="rnUndo" hidden>Undo renaming</button>' : ''}<button type="button" class="gc-btn gc-quiet" id="rnClear" disabled>Clear</button></div>
      <p class="gc-status" id="rnStatus" role="status"></p>
      <div class="rn-wrap"><table class="rn-table"><thead><tr><th scope="col">#</th><th scope="col">Now</th><th scope="col">New name</th><th scope="col" aria-label="Order"></th></tr></thead><tbody id="rnBody"></tbody></table>
        <div class="gc-empty" id="rnEmpty"><b>Rename many files at once.</b><br>Add files, set the new name with the rules on the left, check the list, then download them renamed as a ZIP${canFolder ? ' or rename them in their folder' : ''}.</div></div>
    </div>`;
  const status = (t) => { $('#rnStatus').textContent = t; };
  const ids = { rnTpl: 'template', rnFind: 'find', rnRep: 'replace', rnRegex: 'regex', rnCase: 'matchCase', rnStart: 'start', rnStep: 'step', rnPad: 'pad', rnThai: 'thai', rnDate: 'dateFmt', rnBe: 'be', rnCaseMode: 'caseMode', rnTidy: 'tidy', rnExt: 'keepExt', rnSort: 'sort' };
  const fill = () => Object.entries(ids).forEach(([id, k]) => { const el = $(`#${id}`); if (el.type === 'checkbox') el.checked = !!st.r[k]; else el.value = st.r[k]; });
  const read = () => Object.entries(ids).forEach(([id, k]) => { const el = $(`#${id}`); st.r[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(+el.min || 0, Math.round(+el.value || 0)) : el.value; });
  root.querySelector('.bt-side').addEventListener('input', (e) => { if (e.target.type === 'file' || e.target.id === 'rnPName' || e.target.id === 'rnPreset') return; read(); draw(); });
  root.querySelector('.rn-tokens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tok]'); if (!b) return; const t = $('#rnTpl'); const a = t.selectionStart ?? t.value.length;
    t.value = t.value.slice(0, a) + b.dataset.tok + t.value.slice(t.selectionEnd ?? a); t.focus(); t.selectionStart = t.selectionEnd = a + b.dataset.tok.length; read(); draw();
  });

  // ---------- presets ----------
  function drawPresets() { const p = presets(); $('#rnPreset').innerHTML = `<option value="">Choose a preset…</option>${Object.keys(p).sort().map((n) => `<option>${esc(n)}</option>`).join('')}`; }
  $('#rnPreset').onchange = (e) => { const p = presets()[e.target.value]; if (!p) return; st.r = { ...DEFAULTS, ...p }; fill(); draw(); status(`Preset: ${e.target.value}`); };
  $('#rnSaveP').onclick = () => {
    const name = $('#rnPName').value.trim() || $('#rnPreset').value; if (!name) { status('Give the preset a name first.'); $('#rnPName').focus(); return; }
    const o = presets(); o[name] = { ...st.r }; if (!savePresets(o)) { status('This browser does not allow saving presets.'); return; } drawPresets(); $('#rnPreset').value = name; $('#rnPName').value = ''; status(`Preset saved: ${name} (in this browser)`);
  };
  $('#rnDelP').onclick = () => { const n = $('#rnPreset').value; if (!n) return; const o = presets(); delete o[n]; savePresets(o); drawPresets(); status(`Preset deleted: ${n}`); };

  // ---------- files in ----------
  let added = 0;
  const addFiles = (fs, folderOf = (f) => (f.webkitRelativePath || '').split('/').slice(-2, -1)[0] || '') => {
    for (const f of fs) st.files.push({ name: f.name, file: f, lastModified: f.lastModified, size: f.size, folder: folderOf(f), handle: f.handle || null, added: added++ });
    st.undo = null; draw(); status(`${st.files.length} file${st.files.length === 1 ? '' : 's'}`);
  };
  $('#rnFiles').onchange = (e) => { st.dir = null; addFiles(e.target.files); e.target.value = ''; };
  $('#rnFolder').onchange = (e) => { st.dir = null; addFiles([...e.target.files].filter((f) => !/^\./.test(f.name))); e.target.value = ''; };
  root.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); root.classList.add('ed-drop'); } });
  root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove('ed-drop'); });
  root.addEventListener('drop', (e) => { root.classList.remove('ed-drop'); if (!e.dataTransfer?.files.length) return; e.preventDefault(); st.dir = null; addFiles(e.dataTransfer.files); });
  $('#rnDir')?.addEventListener('click', async () => {
    let dir; try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (err) { if (err.name !== 'AbortError') status(err.message); return; }
    st.files = []; st.dir = dir; const list = [];
    for await (const h of dir.values()) if (h.kind === 'file' && !h.name.startsWith('.')) { const f = await h.getFile(); f.handle = h; list.push(f); }
    list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    addFiles(list, () => dir.name); status(`${list.length} files in ${dir.name}: the new names are written there when you press Rename in folder.`);
  });
  $('#rnMap').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const wb = window.XLSX.read(await f.arrayBuffer(), { type: 'array' }); const rows = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: false });
      st.map = new Map(rows.filter((r) => r[0] && r[1]).map((r) => [String(r[0]).trim().normalize('NFC'), String(r[1]).trim()]));
      draw(); status(`${st.map.size} names from ${f.name}${st.files.length ? `; ${st.files.filter((x) => st.map.has(x.name.normalize('NFC'))).length} of the files are on it` : ''}`);
    } catch { status(`${f.name} could not be read: use an Excel or CSV file with old and new names in the first two columns.`); }
  };

  // ---------- preview ----------
  function ordered() {
    const s = st.r.sort; const fs = [...st.files];
    if (s === 'name') fs.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }));
    else if (s === 'date') fs.sort((a, b) => a.lastModified - b.lastModified); else if (s === 'size') fs.sort((a, b) => a.size - b.size);
    return fs;
  }
  // New names for every file; a clash gets " (2)", " (3)"… so no file is overwritten.
  function plan() {
    const fs = ordered(); const used = new Map();
    return fs.map((f, i) => {
      const listed = st.map?.get(f.name.normalize('NFC'));
      let to = safeName(listed ? (st.r.keepExt && !/\.[^.]+$/.test(listed) && splitName(f.name).ext ? `${listed}.${splitName(f.name).ext}` : listed) : newName(f, i, st.r));
      const empty = !splitName(to).base;
      if (!empty) {
        const key = to.toLowerCase(); let k = used.get(key) || 0; used.set(key, k + 1);
        if (k) { const { base, ext } = splitName(to); do { k++; to = `${base} (${k})${ext ? `.${ext}` : ''}`; } while (used.has(to.toLowerCase())); used.set(to.toLowerCase(), 1); }
      }
      return { f, to, empty, same: to === f.name, listed: !!listed, clash: false };
    });
  }
  function draw() {
    const rows = plan(); const n = rows.length; const changed = rows.filter((r) => !r.same && !r.empty).length; const bad = rows.filter((r) => r.empty).length;
    $('#rnCount').textContent = n ? `(${changed} of ${n} renamed${bad ? `, ${bad} without a name` : ''})` : '';
    $('#rnEmpty').hidden = !!n; $('#rnZip').disabled = !n || !!bad; if ($('#rnApply')) $('#rnApply').disabled = !n || !!bad || !st.dir || !changed; $('#rnClear').disabled = !n;
    const manual = st.r.sort === 'added';
    $('#rnBody').innerHTML = rows.map((r, i) => `<tr class="${r.empty ? 'rn-bad' : r.same ? 'rn-same' : ''}"><td>${i + 1}</td><td class="rn-old" title="${esc(r.f.name)}">${esc(r.f.name)}</td>
      <td class="rn-new" title="${esc(r.to)}">${r.empty ? '<em>No name: change the rules</em>' : esc(r.to)}${r.listed ? ' <span class="rn-tag">list</span>' : ''}</td>
      <td class="rn-mv">${manual ? `<button type="button" class="bt-ic" data-mv="-1" data-a="${r.f.added}" aria-label="Move ${esc(r.f.name)} up"${i ? '' : ' disabled'}>↑</button><button type="button" class="bt-ic" data-mv="1" data-a="${r.f.added}" aria-label="Move ${esc(r.f.name)} down"${i < n - 1 ? '' : ' disabled'}>↓</button><button type="button" class="bt-ic" data-rm data-a="${r.f.added}" aria-label="Take ${esc(r.f.name)} off the list">✕</button>` : ''}</td></tr>`).join('');
  }
  $('#rnBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (!b) return; const k = st.files.findIndex((f) => f.added === +b.dataset.a);
    if (b.hasAttribute('data-rm')) st.files.splice(k, 1);
    else { const j = k + +b.dataset.mv; if (j < 0 || j >= st.files.length) return; [st.files[k], st.files[j]] = [st.files[j], st.files[k]]; }
    draw();
  });
  $('#rnClear').onclick = () => { st.files = []; st.dir = null; st.undo = null; if ($('#rnUndo')) $('#rnUndo').hidden = true; draw(); status(''); };

  // ---------- out: a ZIP of renamed copies ----------
  $('#rnZip').onclick = async () => {
    const rows = plan(); if (rows.some((r) => r.empty)) return;
    try {
      status('Making the ZIP…'); const JSZip = await loadZip(); const z = new JSZip();
      for (const r of rows) z.file(r.to, r.f.file);
      const bytes = await z.generateAsync({ type: 'uint8array', compression: 'STORE' }, (m) => status(`Making the ZIP… ${Math.round(m.percent)}%`));
      const stamp = fmtDate(new Date(), 'compact', false);
      download(bytes, `renamed-${stamp}.zip`, 'application/zip'); status(`renamed-${stamp}.zip downloaded: ${rows.length} files. The original files are unchanged.`);
    } catch (err) { status(err.message); }
  };

  // ---------- out: rename in the folder (Chrome, Edge) ----------
  async function renameAll(pairs) { // [[handle, newName]]: first to temporary names, so A->B and B->A both work
    const tmp = []; let k = 0;
    for (const [h] of pairs) { const t = `~rn-${Date.now()}-${k++}.tmp`; await move(h, t); tmp.push(t); }
    for (const [i, [h, to]] of pairs.entries()) await move(h, to, tmp[i]);
  }
  async function move(h, to, from = h.name) {
    if (typeof h.move === 'function') { await h.move(to); return; }
    // no move(): copy under the new name, then remove the old file
    const src = await (await st.dir.getFileHandle(from)).getFile(); const nh = await st.dir.getFileHandle(to, { create: true });
    const w = await nh.createWritable(); await w.write(src); await w.close(); await st.dir.removeEntry(from);
  }
  $('#rnApply')?.addEventListener('click', async () => {
    const rows = plan().filter((r) => !r.same); if (!rows.length || !st.dir) return;
    const ok = await noticeBox(`Rename ${rows.length} file${rows.length === 1 ? '' : 's'}?`, `<p>The files in ${esc(st.dir.name)} get their new names. <b>Undo renaming</b> puts the old names back while this page is open.</p>`,
      [{ v: false, label: 'Cancel' }, { v: true, label: 'Rename', primary: true }], { none: false });
    if (!ok) return;
    try {
      if ((await st.dir.requestPermission?.({ mode: 'readwrite' })) === 'denied') { status('The browser was not allowed to change this folder.'); return; }
      const before = rows.map((r) => [r.to, r.f.name]);
      await renameAll(rows.map((r) => [r.f.handle, r.to]));
      for (const r of rows) r.f.handle = await st.dir.getFileHandle(r.to); // fresh handles (a copied file is a new one)
      st.undo = before; $('#rnUndo').hidden = false;
      rows.forEach((r) => { r.f.name = r.to; }); draw(); status(`${rows.length} files renamed in ${st.dir.name}.`);
    } catch (err) { status(`Renaming stopped: ${err.message}. Check the folder; files already renamed keep their new names.`); }
  });
  $('#rnUndo')?.addEventListener('click', async () => {
    if (!st.undo) return;
    try {
      const pairs = st.undo.map(([now, old]) => [st.files.find((f) => f.name === now)?.handle, old]).filter(([h]) => h);
      await renameAll(pairs);
      for (const f of st.files) { const u = st.undo.find(([now]) => now === f.name); if (u) { f.name = u[1]; f.handle = await st.dir.getFileHandle(f.name); } }
      st.undo = null; $('#rnUndo').hidden = true; draw(); status('The old names are back.');
    } catch (err) { status(`Undo stopped: ${err.message}`); }
  });

  fill(); drawPresets(); draw();
  return {};
}
