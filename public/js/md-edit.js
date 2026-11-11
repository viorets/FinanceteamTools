// Markdown editor: the .md text on the left, the formatted page on the right (Edit, Split or Preview), a ribbon in the
// glass toolbar for headings, emphasis, lists, quotes, links, images, tables, code and find & replace. Typing helpers:
// Enter continues a list, Tab / Shift+Tab indent a list item, "-->" gives → and "==>" gives ➜, and a range copied
// from Excel is pasted as a Markdown table. Downloads: .md, a standalone .html, a Word .doc, or PDF (print).
// Markdown is turned into HTML by marked (GitHub-flavoured: tables, task lists, strikethrough) and cleaned by
// DOMPurify before it is shown. Drafts are kept in this browser (localStorage), by file name.
import { fileTab, markSaved, ribbon, RI, setPressed } from './ribbon.js';
import { actionMenu, clampZoom, fullScreen, helpPop, pinchZoom, viewBar } from './view-tools.js';
import { ARROWS } from './rich-text.js';

const MARKED = 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js';
const PURIFY = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js';
// Edits made on the formatted page are turned back into Markdown by Turndown (+ its GitHub tables / task lists plugin).
const TURNDOWN = 'https://cdnjs.cloudflare.com/ajax/libs/turndown/7.1.2/turndown.min.js';
const TD_GFM = 'https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js';
const STORE = 'md-drafts-v1'; const LAST = 'md-last';
const FONTS = ['Noto Sans Thai', 'Sarabun', 'LINE Seed Sans TH', 'TH Sarabun New', 'Georgia'];
const FORMATS = [['md', 'Markdown (.md)', 'The text as written'], ['html', 'Web page (.html)', 'Formatted, one file with its styles'],
  ['doc', 'Word (.doc)', 'Formatted; opens in Word'], ['pdf', 'PDF', 'Print the formatted page, then Save as PDF']];

const script = (src, global) => window[global] ? Promise.resolve(window[global]) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
  s.onload = () => res(window[global]); s.onerror = () => rej(new Error('Could not load the Markdown tools. Check the internet connection.'));
  document.head.append(s);
});
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>'),
  block: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 10-2 2 2 2M14 10l2 2-2 2"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>'),
  quote: svg('<path d="M7 7h4v4c0 3-2 5-4 5M15 7h4v4c0 3-2 5-4 5"/>'),
  task: svg('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m4.5 8 1 1 2-2M12 8h9M3 16h6M12 16h9"/>'),
  hr: svg('<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".35"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  split: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  sync: svg('<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>'),
  next: svg('<path d="m6 9 6 6 6-6"/>'),
};

// The formatted page: the same rules on screen, in the .html and .doc downloads and in print.
const docCss = (font) => `.md-doc{font-family:'${font}','Noto Sans Thai','Sarabun',sans-serif;font-size:16px;line-height:1.65;color:#1b1f23;max-width:780px;margin:0 auto;padding:40px 48px;background:#fff;overflow-wrap:break-word}
.md-doc>:first-child{margin-top:0}.md-doc h1,.md-doc h2,.md-doc h3,.md-doc h4{font-family:'Prompt','${font}',sans-serif;line-height:1.3;margin:1.4em 0 .5em;color:#002d37}
.md-doc h1{font-size:2em;border-bottom:2px solid #00758f;padding-bottom:.25em}.md-doc h2{font-size:1.5em;border-bottom:1px solid #d5e3e9;padding-bottom:.2em}.md-doc h3{font-size:1.25em}.md-doc h4{font-size:1.05em}
.md-doc p,.md-doc ul,.md-doc ol,.md-doc blockquote,.md-doc table,.md-doc pre{margin:0 0 1em}.md-doc ul,.md-doc ol{padding-left:1.6em}.md-doc li+li{margin-top:.25em}
.md-doc li:has(>input[type=checkbox]){list-style:none;margin-left:-1.4em}.md-doc li>input[type=checkbox]{margin:0 .5em 0 0;width:1em;height:1em;vertical-align:-.1em;accent-color:#00758f}
.md-doc a{color:#00758f}.md-doc blockquote{margin-left:0;padding:.4em 1em;border-left:4px solid #80b9c6;background:#f2f8fa;color:#33454f}
.md-doc code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.88em;background:#eef3f6;padding:.15em .35em;border-radius:4px}
.md-doc pre{background:#0f2a33;color:#e6f1f4;padding:14px 16px;border-radius:8px;overflow:auto}.md-doc pre code{background:none;padding:0;color:inherit}
.md-doc table{border-collapse:collapse;width:auto;max-width:100%;display:block;overflow:auto}.md-doc th,.md-doc td{border:1px solid #c9d6dc;padding:6px 12px}.md-doc th:not([align]),.md-doc td:not([align]){text-align:left}
.md-doc th{background:#00758f;color:#fff}.md-doc tr:nth-child(even) td{background:#f2f8fa}.md-doc img{max-width:100%}.md-doc hr{border:0;border-top:1px solid #c9d6dc;margin:2em 0}
@media print{.md-doc{padding:0;max-width:none}}`;

// Opens the editor in `root`. download(bytes, name, type) saves a file. Resolves { isDirty() }.
export function openMd(root, { download }) {
  let drafts = {}; try { drafts = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { /* storage off */ }
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(drafts)); return true; } catch { return false; } };
  let last = null; try { last = localStorage.getItem(LAST); } catch { /* storage off */ }
  const STARTER = '# Title\n\nWrite here. The preview on the right shows the formatted page.\n\n## Checklist\n\n- [ ] First task\n- [x] Done task\n\n| Item | Amount (฿) |\n| --- | ---: |\n| Venue | 12,000 |\n| Food | 8,500 |\n';
  let name = last && drafts[last] ? last : 'Untitled.md'; let saved = drafts[name]?.text ?? STARTER; let dirty = false;
  let font = FONTS[0]; try { font = localStorage.getItem('md-font') || font; } catch { /* default */ }

  const spec = [
    fileTab('md', { open: 'Open a Markdown file (.md)', newDoc: true, name: 'mdName', download: 'Download as…' }),
    { tab: 'Home', groups: [
      { label: 'Text', items: [{ select: 'md-h', title: 'Paragraph or heading', options: [['', 'Style…'], ['0', 'Paragraph'], ['1', 'Heading 1'], ['2', 'Heading 2'], ['3', 'Heading 3'], ['4', 'Heading 4']], width: 104 },
        { btn: 'md-b', icon: RI.bold, title: 'Bold (Ctrl+B)' }, { btn: 'md-i', icon: RI.italic, title: 'Italic (Ctrl+I)' }, { btn: 'md-s', icon: RI.strike, title: 'Strikethrough' }, { btn: 'md-c', icon: I.code, title: 'Inline code' }] },
      { label: 'Lists', items: [{ btn: 'md-ul', icon: RI.bullets, title: 'Bullets' }, { btn: 'md-ol', icon: RI.numbers, title: 'Numbering' }, { btn: 'md-task', icon: I.task, title: 'Checklist' },
        { btn: 'md-q', icon: I.quote, title: 'Quote' }, { btn: 'md-out', icon: RI.outdent, title: 'Decrease indent (Shift+Tab)' }, { btn: 'md-in', icon: RI.indent, title: 'Increase indent (Tab)' }] },
      { label: 'Insert', items: [{ btn: 'md-link', icon: I.link, title: 'Link (Ctrl+K)' }, { btn: 'md-img', icon: I.image, title: 'Image from a web address' }, { btn: 'md-table', icon: RI.table, title: 'Table (or paste a range from Excel)' },
        { btn: 'md-code', icon: I.block, title: 'Code block' }, { btn: 'md-hr', icon: I.hr, title: 'Divider line' }] },
    ] },
    { tab: 'Find', groups: [
      { label: 'Find and replace', items: [{ input: 'md-fq', title: 'Find', placeholder: 'Find…', width: 160 }, { input: 'md-fr', title: 'Replace with', placeholder: 'Replace with…', width: 160 },
        { btn: 'md-fnext', icon: I.next, title: 'Find next (Enter)' }, { btn: 'md-frep', icon: '', title: 'Replace this match', text: 'Replace' }, { btn: 'md-fall', icon: '', title: 'Replace every match', text: 'Replace all' }] },
    ] },
    { tab: 'View', groups: [
      { label: 'Layout', items: [{ btn: 'md-v-edit', icon: I.edit, title: 'Text only', toggle: true }, { btn: 'md-v-split', icon: I.split, title: 'Text and preview side by side', toggle: true }, { btn: 'md-v-prev', icon: I.eye, title: 'Preview only', toggle: true },
        { btn: 'md-sync', icon: I.sync, title: 'Scroll the preview with the text', toggle: true }] },
      { label: 'Page', items: [{ select: 'md-font', title: 'Preview and download font', options: FONTS, width: 150 }] },
    ] },
  ];

  root.innerHTML = `
    <input type="file" id="mdFile" class="ed-file" accept=".md,.markdown,.txt,text/markdown,text/plain" tabindex="-1" aria-hidden="true">
    <div class="main-content md-main">
      <div class="oe md" id="mdBox">
        <div class="oe-bar md-bar"><div class="md-top"></div></div>
        <div class="md-switch" role="tablist" aria-label="Show"><button type="button" role="tab" data-v="edit" aria-selected="true">Text</button><button type="button" role="tab" data-v="preview" aria-selected="false">Preview</button></div>
        <div class="md-panes" data-view="split">
          <textarea class="md-src" id="mdSrc" spellcheck="true" aria-label="Markdown text" autocapitalize="sentences"></textarea>
          <div class="md-prev" aria-label="Preview"><article class="md-doc" lang="th"></article></div>
        </div>
        <div class="md-foot"><span id="mdStatus" class="md-status" role="status"></span><span id="mdCount"></span><span id="mdPos"></span></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const ta = $('#mdSrc'); const doc = $('.md-doc'); const prev = $('.md-prev'); const panes = $('.md-panes'); const box = $('#mdBox');
  const rb = ribbon(spec, 'md', 1); $('.md-top').append(rb);
  const tools = document.createElement('span'); tools.className = 'oe-tools'; tools.innerHTML = viewBar('md', undefined, { help: true }); $('.md-top').append(tools);
  fullScreen(box, 'md', 'oe-full');
  helpPop($('#md-help'), `<ul>
    <li>Type Markdown on the left or edit the formatted page on the right; each follows the other. Click on the right to find the place on the left.</li>
    <li><kbd>Enter</kbd> continues a list (on an empty item it ends the list); <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> indent it.</li>
    <li><kbd>Ctrl</kbd>+<kbd>B</kbd> bold, <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, <kbd>Ctrl</kbd>+<kbd>K</kbd> link, <kbd>Ctrl</kbd>+<kbd>F</kbd> find and replace.</li>
    <li>Typing <code>--&gt;</code> gives → and <code>==&gt;</code> gives ➜ (not inside code).</li>
    <li>Paste a range copied from Excel to get a table; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> pastes it as plain text. In a table on the right, <kbd>Tab</kbd> moves to the next cell.</li>
    <li>Tick the boxes on the right to tick tasks. Files up to 5 MB; drafts are kept in this browser by file name.</li></ul>`);
  const style = document.createElement('style'); document.head.append(style);
  const say = (t) => { $('#mdStatus').textContent = t; };

  // ---------- preview ----------
  let libs = null; let lib = null; let frame = 0;
  const ready = () => libs ||= Promise.all([script(MARKED, 'marked'), script(PURIFY, 'DOMPurify')]).then(([m, p]) => {
    p.addHook('afterSanitizeAttributes', (n) => { if (n.tagName === 'A' && n.getAttribute('href')) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } });
    return (lib = { m, p });
  });
  const toHtml = async (text) => { const { m, p } = await ready(); return p.sanitize(m.parse(text, { gfm: true, breaks: false })); };
  // The page is built block by block (one top-level element per Markdown block), and each block keeps the stretch of
  // text it came from (data-s / data-e), so an edit on the page rewrites only that stretch, and a click there finds
  // its place in the text.
  async function toBlocks(text) { await ready(); return blocksNow(text); }
  function blocksNow(text) {
    const { m, p } = lib;
    const toks = m.lexer(text, { gfm: true, breaks: false }); const frag = document.createDocumentFragment(); let at = 0;
    for (const t of toks) {
      const s0 = at; at += t.raw.length; if (t.type === 'space') continue;
      const one = [t]; one.links = toks.links;
      const tpl = document.createElement('template'); tpl.innerHTML = p.sanitize(m.parser(one, { gfm: true, breaks: false }));
      const e0 = s0 + t.raw.replace(/\s+$/, '').length;
      tpl.content.childNodes.forEach((n) => { if (n.nodeType === 1) { n.dataset.s = s0; n.dataset.e = e0; } });
      frag.append(tpl.content);
    }
    return frag;
  }
  let snap = { src: null, orig: new Map() }; let caretAt = null;
  function render() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      const src = ta.value; let frag;
      try { frag = await toBlocks(src); } catch (e) { doc.innerHTML = `<p>${esc(e.message)}</p>`; return; }
      if (src !== ta.value) return; // the text changed meanwhile: the next frame draws it
      paint(frag, src);
    });
  }
  function paint(frag, src) {
    const top = prev.scrollTop; doc.replaceChildren(frag); prev.scrollTop = top;
    doc.querySelectorAll('input[type="checkbox"]').forEach((c, k) => { c.disabled = false; c.dataset.k = k; c.setAttribute('aria-label', 'Done'); c.contentEditable = 'false'; });
    snap = { src, orig: new Map([...doc.children].filter((el) => el.dataset.s != null).map((el) => [el, el.outerHTML])) };
    if (caretAt != null) { placeCaret(caretAt); caretAt = null; }
  }
  // A tick in the preview ticks the k-th task in the text.
  doc.addEventListener('change', (e) => {
    const k = +e.target.dataset.k; if (Number.isNaN(k)) return;
    const re = /^(\s*(?:[-*+]|\d+[.)]) \[)([ xX])\]/gm; let m; let n = 0;
    while ((m = re.exec(ta.value))) { if (n++ === k) { const at = m.index + m[1].length; ta.setSelectionRange(at, at + 1); insert(m[2] === ' ' ? 'x' : ' '); return; } }
  });
  // ---------- editing on the formatted page ----------
  // The page is editable. After a pause in typing, each changed block (with any paragraphs typed after it) becomes
  // Markdown again and replaces only its own stretch of the text; the rest of the text keeps its exact spelling.
  // The change goes into the text as one typed edit, so Undo (button, Ctrl+Z on either side) takes it back.
  let tdLib = null;
  const turn = () => tdLib ||= Promise.all([script(TURNDOWN, 'TurndownService'), script(TD_GFM, 'turndownPluginGfm')]).then(([T, G]) => {
    const td = new T({ headingStyle: 'atx', hr: '---', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', strongDelimiter: '**' });
    td.use(G.gfm);
    td.addRule('listItem', { filter: 'li', replacement(content, node, o) { // "- item" / "1. item", not Turndown's "-   item"
      const ol = node.parentNode.nodeName === 'OL'; const i = [...node.parentNode.children].indexOf(node);
      const mark = ol ? `${(+node.parentNode.getAttribute('start') || 1) + i}. ` : `${o.bulletListMarker} `;
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/g, `\n${' '.repeat(mark.length)}`);
      return mark + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    } });
    return td;
  });
  doc.contentEditable = 'true'; doc.spellcheck = true; prev.setAttribute('aria-label', 'Formatted page (editable)');
  let pullT = 0; let lastPane = 'text'; let fromPage = false;
  const later = () => { clearTimeout(pullT); pullT = setTimeout(pull, 450); };
  doc.addEventListener('focusin', () => { lastPane = 'prev'; try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* old browser */ } });
  ta.addEventListener('focusin', () => { lastPane = 'text'; });
  doc.addEventListener('input', (e) => {
    if (e.target.matches?.('input[type="checkbox"]')) return;
    if (e.inputType === 'insertText' && e.data === '>') arrowHere();
    if (!e.isComposing) later();
  });
  doc.addEventListener('compositionend', later);
  doc.addEventListener('focusout', (e) => { if (!doc.contains(e.relatedTarget) && pullT) { clearTimeout(pullT); pull(); } });
  // "-->" / "==>" typed on the page become arrows, as in the text.
  function arrowHere() {
    const sel = getSelection(); const n = sel.anchorNode; if (n?.nodeType !== 3) return;
    const before = n.data.slice(0, sel.anchorOffset); const len = ARROWS[before.slice(-3)] ? 3 : ARROWS[before.slice(-2)] ? 2 : 0; if (!len) return;
    const r = document.createRange(); r.setStart(n, sel.anchorOffset - len); r.setEnd(n, sel.anchorOffset); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertText', false, ARROWS[before.slice(-len)]);
  }
  // Tables: Enter stays in the cell (a Markdown cell is one line); Tab / Shift+Tab move between cells.
  doc.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'y') || mod && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); clearTimeout(pullT); pull(); (e.key === 'y' || e.shiftKey ? $('#md-redo') : $('#md-undo')).click(); return; }
    if (mod && e.key === 'k') { e.preventDefault(); pageCmd('link'); return; }
    const cell = getSelection().anchorNode?.parentElement?.closest('td, th'); if (!cell || !doc.contains(cell)) return;
    if (e.key === 'Enter') { e.preventDefault(); return; }
    if (e.key === 'Tab') {
      e.preventDefault(); const cells = [...cell.closest('table').querySelectorAll('th, td')]; const next = cells[cells.indexOf(cell) + (e.shiftKey ? -1 : 1)]; if (!next) return;
      const r = document.createRange(); r.selectNodeContents(next); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
  });
  // Characters from the start of the page to the caret, and back (the caret survives the page being redrawn).
  function caretOffset() {
    const sel = getSelection(); if (!sel.rangeCount || !doc.contains(sel.anchorNode)) return null;
    const r = document.createRange(); r.selectNodeContents(doc); r.setEnd(sel.anchorNode, sel.anchorOffset); return r.toString().length;
  }
  function placeCaret(n) {
    const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); let t;
    while ((t = w.nextNode())) { if (n <= t.data.length) break; n -= t.data.length; }
    doc.focus({ preventScroll: true }); const sel = getSelection(); const r = document.createRange();
    if (t) r.setStart(t, Math.min(n, t.data.length)); else { r.selectNodeContents(doc); r.collapse(false); }
    r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  }
  async function pull() {
    pullT = 0; const td = await turn(); const src = snap.src; if (src == null || src !== ta.value) return;
    [...doc.childNodes].forEach((n) => { if (n.nodeType === 3 && n.data.trim()) { const pp = document.createElement('p'); n.replaceWith(pp); pp.append(n); } }); // text typed straight onto an empty page
    const kids = [...doc.children]; const groups = [];
    kids.forEach((el) => { if (snap.orig.has(el)) groups.push({ s: +el.dataset.s, els: [el] }); else if (groups.length) groups.at(-1).els.push(el); else groups.push({ s: 0, els: [el], lead: true }); });
    const gone = [...snap.orig.keys()].filter((el) => el.parentNode !== doc).map((el) => +el.dataset.s);
    let out = groups.length && !groups[0].lead ? src.slice(0, groups[0].s) : ''; let any = !groups.length && gone.length > 0;
    groups.forEach((g, i) => {
      const end = groups[i + 1]?.s ?? src.length; const old = src.slice(g.s, end);
      const edited = g.els.some((el) => !snap.orig.has(el) || snap.orig.get(el) !== el.outerHTML) || gone.some((x) => x >= g.s && x < end);
      if (!edited) { out += old; return; }
      any = true; const tail = i < groups.length - 1 ? (old.match(/\s*$/)[0].includes('\n\n') ? old.match(/\s*$/)[0] : '\n\n') : (/\n$/.test(src) ? '\n' : '');
      const md = td.turndown(g.els.map((el) => el.outerHTML).join('')).trim();
      out += md ? md + tail : '';
    });
    if (!any || out === src) return;
    // One typed edit over the part that changed (keeps the text's undo).
    let a = 0; while (a < src.length && src[a] === out[a]) a++;
    let b = 0; while (b < src.length - a && b < out.length - a && src[src.length - 1 - b] === out[out.length - 1 - b]) b++;
    caretAt = caretOffset();
    ta.focus({ preventScroll: true }); ta.setSelectionRange(a, src.length - b);
    const mid = out.slice(a, out.length - b); quiet = Date.now() + 300; fromPage = true;
    try { if (!(mid ? document.execCommand('insertText', false, mid) : document.execCommand('delete'))) ta.setRangeText(mid, a, src.length - b, 'end'); } finally { fromPage = false; }
    cancelAnimationFrame(frame); paint(blocksNow(ta.value), ta.value); // at once: nothing typed meanwhile can be lost
    dirty = ta.value !== saved; counts(); pos();
  }
  // Ribbon buttons act on the page while it has the focus: bold, italic, strikethrough, code, headings, lists, quote,
  // link. The others (checklist, indent, image, table, code block, divider) work in the text.
  function pageCmd(k, v) {
    doc.focus();
    const sel = getSelection(); const text = sel.toString();
    if (k === 'code') document.execCommand('insertHTML', false, `<code>${esc(text || 'code')}</code>`);
    else if (k === 'link') { const url = prompt('Link address (https://…)', 'https://'); if (!url || url === 'https://') return; if (text) document.execCommand('createLink', false, url.trim()); else document.execCommand('insertHTML', false, `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`); }
    else document.execCommand(k, false, v);
    later();
  }
  const onPage = () => lastPane === 'prev' && panes.dataset.view !== 'edit';
  // Click on the page: the text's cursor moves to the same place (in a table, the same cell), and the text scrolls
  // there, without leaving the page.
  let quiet = 0;
  function sourceAt() {
    const sel = getSelection(); if (!sel.rangeCount || !doc.contains(sel.anchorNode)) return null;
    const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const el = node.closest('[data-s]'); if (!el || el.parentNode !== doc || ta.value !== snap.src) return null;
    const s0 = +el.dataset.s; const src = ta.value.slice(s0, +el.dataset.e);
    const cell = node.closest('td, th');
    if (cell && el.tagName === 'TABLE') {
      const rows = [...el.rows]; const r = rows.indexOf(cell.parentElement); const ls = src.split('\n'); const li = r === 0 ? 0 : r + 1; // line 1 is | --- |
      const line = ls[li] ?? ''; let off = ls.slice(0, li).reduce((n, l) => n + l.length + 1, 0);
      let want = cell.cellIndex + (line.trimStart().startsWith('|') ? 1 : 0); let i = 0;
      for (; i < line.length && want > 0; i++) if (line[i] === '|' && line[i - 1] !== '\\') want--;
      while (line[i] === ' ') i++; return s0 + off + i;
    }
    const r = document.createRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode, sel.anchorOffset); const before = r.toString().replace(/\s+/g, ' ');
    const guess = Math.round(src.length * before.length / Math.max(1, el.textContent.length));
    for (const len of [16, 8, 4, 2]) {
      const n = before.slice(-len); if (n.length < Math.min(len, before.length) || !n.trim()) continue;
      let best = -1; for (let k = src.indexOf(n); k >= 0; k = src.indexOf(n, k + 1)) if (best < 0 || Math.abs(k - guess) < Math.abs(best - guess)) best = k;
      if (best >= 0) return s0 + best + n.length;
    }
    return s0 + Math.min(guess, src.length);
  }
  doc.addEventListener('click', (e) => {
    if (e.target.matches('input[type="checkbox"]')) return;
    const at = sourceAt(); if (at == null) return;
    ta.setSelectionRange(at, at); quiet = Date.now() + 300;
    const line = ta.value.slice(0, at).split('\n').length; ta.scrollTop = Math.max(0, (line - 6) * parseFloat(getComputedStyle(ta).lineHeight)); pos();
  });
  const setFont = (f) => { font = f; style.textContent = docCss(f); $('#md-font').value = f; try { localStorage.setItem('md-font', f); } catch { /* not kept */ } };

  // ---------- text editing (insertText keeps the browser's own undo) ----------
  function insert(text) {
    ta.focus();
    const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
    if (!ok) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    changed();
  }
  function wrap(a, b = a, ph = 'text') {
    const { selectionStart: s, selectionEnd: e, value: v } = ta; const sel = v.slice(s, e);
    if (v.slice(s - a.length, s) === a && v.slice(e, e + b.length) === b) { ta.setSelectionRange(s - a.length, e + b.length); insert(sel); ta.setSelectionRange(s - a.length, e - a.length); return; }
    if (sel.length >= a.length + b.length && sel.startsWith(a) && sel.endsWith(b)) { insert(sel.slice(a.length, sel.length - b.length)); ta.setSelectionRange(s, e - a.length - b.length); return; }
    const t = sel || ph; insert(a + t + b); ta.setSelectionRange(s + a.length, s + a.length + t.length);
  }
  // Applies fn to the whole lines the selection touches.
  function lines(fn) {
    const v = ta.value; const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    const endAt = ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd;
    let e = v.indexOf('\n', endAt); if (e < 0) e = v.length;
    const out = fn(v.slice(s, e).split('\n')).join('\n');
    ta.setSelectionRange(s, e); insert(out); ta.setSelectionRange(s, s + out.length);
  }
  const MARK = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] |> ?)/;
  const toggle = (re, make) => lines((ls) => {
    const on = ls.filter((l) => l.trim()).every((l) => re.test(l));
    let k = 0; return ls.map((l) => (!l.trim() ? l : on ? l.replace(re, '$1') : l.replace(MARK, '$1').replace(/^(\s*)/, `$1${make(k++)}`)));
  });
  const indent = (d) => lines((ls) => ls.map((l) => (d > 0 ? (/^\s*\d+[.)] /.test(l) ? '   ' : '  ') + l : l.replace(/^( {1,3}|\t)/, ''))));
  $('#md-b').onclick = () => (onPage() ? pageCmd('bold') : wrap('**')); $('#md-i').onclick = () => (onPage() ? pageCmd('italic') : wrap('*'));
  $('#md-s').onclick = () => (onPage() ? pageCmd('strikeThrough') : wrap('~~')); $('#md-c').onclick = () => (onPage() ? pageCmd('code') : wrap('`', '`', 'code'));
  $('#md-h').onchange = (e) => { const v = e.target.value; e.target.value = ''; if (v === '') return; const n = +v; if (onPage()) { pageCmd('formatBlock', n ? `h${n}` : 'p'); return; } lines((ls) => ls.map((l) => (n ? `${'#'.repeat(n)} ` : '') + l.replace(/^#{1,6}\s+/, ''))); };
  $('#md-ul').onclick = () => (onPage() ? pageCmd('insertUnorderedList') : toggle(/^(\s*)[-*+] (?!\[[ xX]\] )/, () => '- '));
  $('#md-ol').onclick = () => (onPage() ? pageCmd('insertOrderedList') : toggle(/^(\s*)\d+[.)] /, (k) => `${k + 1}. `));
  $('#md-task').onclick = () => toggle(/^(\s*)[-*+] \[[ xX]\] /, () => '- [ ] ');
  $('#md-q').onclick = () => (onPage() ? pageCmd('formatBlock', 'blockquote') : toggle(/^(\s*)> ?/, () => '> '));
  $('#md-in').onclick = () => indent(1); $('#md-out').onclick = () => indent(-1);
  function link(image) {
    const url = prompt(image ? 'Image web address (https://…)' : 'Link address (https://…)', 'https://'); if (!url || url === 'https://') { ta.focus(); return; }
    const { selectionStart: s, selectionEnd: e } = ta; const t = ta.value.slice(s, e) || (image ? 'image' : 'link text');
    insert(`${image ? '!' : ''}[${t}](${url.trim().replace(/\s/g, '%20')})`); ta.setSelectionRange(s + (image ? 2 : 1), s + (image ? 2 : 1) + t.length);
  }
  $('#md-link').onclick = () => (onPage() ? pageCmd('link') : link(false)); $('#md-img').onclick = () => link(true);
  const block = (text) => { const v = ta.value; const s = ta.selectionStart; const pre = s && v[s - 1] !== '\n' ? '\n\n' : s && v[s - 2] !== '\n' ? '\n' : ''; insert(`${pre}${text}\n`); };
  $('#md-table').onclick = () => { const s = ta.selectionStart; block('| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'); const at = ta.value.indexOf('Column 1', s); if (at >= 0) ta.setSelectionRange(at, at + 8); };
  $('#md-code').onclick = () => { const { selectionStart: s, selectionEnd: e, value: v } = ta; const t = v.slice(s, e); if (t.includes('\n') || !t) { block(`\`\`\`\n${t || 'code'}\n\`\`\``); } else wrap('`', '`'); };
  $('#md-hr').onclick = () => block('\n---\n');

  // ---------- typing helpers ----------
  let plainPaste = false;
  ta.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'k')) { e.preventDefault(); if (e.key === 'k') link(false); else wrap(e.key === 'b' ? '**' : '*'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'v') plainPaste = true;
    if (mod && (e.key === 'f' || e.key === 'h')) { e.preventDefault(); rb.querySelector('#md-tab-1').click(); const q = $('#md-fq'); const t = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (t && !t.includes('\n')) q.value = t; q.focus(); q.select(); return; }
    const v = ta.value; const s = ta.selectionStart; const ls = v.lastIndexOf('\n', s - 1) + 1; const line = v.slice(ls, s);
    if (e.key === 'Tab' && (MARK.test(line) || ta.selectionEnd > s)) { e.preventDefault(); indent(e.shiftKey ? -1 : 1); return; }
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || s !== ta.selectionEnd) return;
    const m = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/.exec(line); if (!m) return;
    e.preventDefault();
    if (line === m[0]) { ta.setSelectionRange(ls, s); insert(''); return; } // Enter on an empty item ends the list
    insert(`\n${m[1]}${m[3] ? `${+m[3] + 1}${m[4]} ` : /\[/.test(m[2]) ? '- [ ] ' : m[2]}`);
  });
  ta.addEventListener('input', (e) => {
    if (fromPage) return; // an edit made on the page (pull) redraws the page itself
    if (e.inputType === 'insertText' && e.data === '>') {
      const s = ta.selectionStart; const line = ta.value.slice(ta.value.lastIndexOf('\n', s - 1) + 1, s);
      const len = ARROWS[line.slice(-3)] ? 3 : ARROWS[line.slice(-2)] ? 2 : 0;
      if (len && !line.includes('<!--')) { const rep = ARROWS[line.slice(-len)]; ta.setSelectionRange(s - len, s); insert(rep); return; } // not inside an HTML comment
    }
    changed();
  });
  // A range copied from Excel (tab-separated rows) becomes a Markdown table.
  ta.addEventListener('paste', (e) => {
    const t = e.clipboardData.getData('text/plain'); const plain = plainPaste; plainPaste = false;
    if (plain || !t.includes('\t')) return;
    const rows = t.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((r) => r.split('\t').map((c) => c.trim().replace(/\|/g, '\\|')));
    const n = Math.max(...rows.map((r) => r.length)); if (n < 2) return;
    e.preventDefault();
    const line = (r) => `| ${Array.from({ length: n }, (_, i) => r[i] ?? '').join(' | ')} |`;
    const num = (i) => rows.slice(1).length && rows.slice(1).every((r) => !r[i] || /^[-−(]?[฿$]?[\d,]+(\.\d+)?%?\)?$/.test(r[i]));
    block([line(rows[0]), `| ${Array.from({ length: n }, (_, i) => (num(i) ? '---:' : '---')).join(' | ')} |`, ...rows.slice(1).map(line)].join('\n'));
    say(`Pasted ${rows.length - 1} rows as a table (Ctrl+Shift+V pastes the plain text)`);
  });

  // ---------- find and replace ----------
  const fq = $('#md-fq'); const fr = $('#md-fr');
  const findNext = () => {
    const q = fq.value; if (!q) return false; const v = ta.value.toLowerCase(); const ql = q.toLowerCase();
    let at = v.indexOf(ql, ta.selectionEnd); if (at < 0) at = v.indexOf(ql); if (at < 0) { say(`"${q}" was not found`); return false; }
    ta.focus(); ta.setSelectionRange(at, at + q.length); scrollToSel(); return true;
  };
  const scrollToSel = () => { const before = ta.value.slice(0, ta.selectionStart).split('\n').length; ta.scrollTop = Math.max(0, (before - 4) * parseFloat(getComputedStyle(ta).lineHeight)); };
  $('#md-fnext').onclick = findNext; fq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findNext(); fq.focus(); } });
  $('#md-frep').onclick = () => { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (fq.value && sel.toLowerCase() === fq.value.toLowerCase()) insert(fr.value); findNext(); };
  $('#md-fall').onclick = () => {
    const q = fq.value; if (!q) return; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); const n = (ta.value.match(re) || []).length;
    if (!n) { say(`"${q}" was not found`); return; } ta.focus(); ta.select(); insert(ta.value.replace(re, () => fr.value)); say(`Replaced ${n} match${n > 1 ? 'es' : ''}`);
  };

  // ---------- view: layout, scroll, zoom ----------
  let sync = true;
  // Narrow screens (the .md-switch tabs show, css/md-edit.css): one pane at a time, so side by side becomes text only.
  const narrow = matchMedia('(max-width: 900px)');
  const setView = (v) => {
    if (narrow.matches && v === 'split') v = 'edit';
    panes.dataset.view = v; ['edit', 'split', 'prev'].forEach((k) => setPressed(rb, `md-v-${k}`, k === (v === 'preview' ? 'prev' : v)));
    root.querySelectorAll('.md-switch [data-v]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  };
  narrow.addEventListener('change', () => setView(narrow.matches ? panes.dataset.view : 'split'));
  $('.md-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); });
  $('.md-switch').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { setView(panes.dataset.view === 'preview' ? 'edit' : 'preview'); $(`.md-switch [aria-selected="true"]`).focus(); } });
  $('#md-v-edit').onclick = () => setView('edit'); $('#md-v-split').onclick = () => setView('split'); $('#md-v-prev').onclick = () => setView('preview');
  $('#md-sync').onclick = () => { sync = !sync; setPressed(rb, 'md-sync', sync); };
  ta.addEventListener('scroll', () => { if (!sync || panes.dataset.view !== 'split' || Date.now() < quiet) return; const k = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight); prev.scrollTop = k * (prev.scrollHeight - prev.clientHeight); });
  $('#md-font').onchange = (e) => setFont(e.target.value);
  let z = 1; const pct = $('#md-zfit');
  const zoomTo = (nz) => { z = clampZoom(nz); panes.style.setProperty('--md-z', z); pct.textContent = `${Math.round(z * 100)}%`; };
  $('#md-zin').onclick = () => zoomTo(z * 1.15); $('#md-zout').onclick = () => zoomTo(z / 1.15); pct.onclick = () => zoomTo(1);
  pinchZoom(panes, () => z, (nz) => zoomTo(nz));
  $('#md-undo').onclick = () => { ta.focus(); document.execCommand('undo'); changed(); };
  $('#md-redo').onclick = () => { ta.focus(); document.execCommand('redo'); changed(); };
  const del = $('#md-del'); del.title = 'Clear the text'; del.setAttribute('aria-label', 'Clear the text');
  del.onclick = () => { if (!ta.value || !confirm('Clear all the text? (Undo brings it back.)')) return; ta.select(); insert(''); };

  // ---------- status ----------
  const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'word' }) : null; // Thai has no spaces between words
  let countT = 0;
  function counts() {
    clearTimeout(countT);
    countT = setTimeout(() => {
      const plain = doc.textContent || ''; const words = seg ? [...seg.segment(plain)].filter((x) => x.isWordLike).length : (plain.match(/\S+/g) || []).length;
      $('#mdCount').textContent = `${words.toLocaleString()} words · ${ta.value.length.toLocaleString()} characters${dirty ? ' · not saved' : ''}`;
    }, 200);
  }
  const pos = () => { const b = ta.value.slice(0, ta.selectionStart).split('\n'); $('#mdPos').textContent = `Line ${b.length}, column ${b.at(-1).length + 1}`; };
  ta.addEventListener('keyup', pos); ta.addEventListener('click', pos);
  function changed() { dirty = ta.value !== saved; render(); counts(); pos(); }

  // ---------- files and drafts ----------
  const nameIn = $('#mdName');
  const fileName = () => { let n = nameIn.value.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'Untitled'; if (!/\.(md|markdown|txt)$/i.test(n)) n += '.md'; return n; };
  function load(n, text, note) { name = n; nameIn.value = n; ta.value = text; saved = text; dirty = false; ta.setSelectionRange(0, 0); ta.scrollTop = 0; changed(); say(note); }
  $('#mdFile').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (dirty && !confirm('You have unsaved changes. Open another file anyway?')) return;
    if (f.size > 5 * 1048576) { say('This file is over 5 MB: too large for the Markdown editor.'); return; }
    const text = (await f.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n'); const d = drafts[f.name];
    if (d && d.text !== text && confirm(`A draft of ${f.name} saved on ${new Date(d.at).toLocaleString()} is on this device. Open the draft?\n\nCancel opens the file as uploaded.`)) load(f.name, d.text, `${f.name} · draft restored`);
    else load(f.name, text, `${f.name} opened`);
  };
  $('#md-f-open').onclick = () => $('#mdFile').click();
  $('#md-f-new').onclick = () => { if (dirty && !confirm('You have unsaved changes. Start a new document anyway?')) return; load('Untitled.md', '', 'New document'); ta.focus(); };
  function saveDraft() {
    const n = fileName(); if (n !== name && name in drafts && drafts[name].text === saved) delete drafts[name]; // renamed: the draft moves with it
    drafts[n] = { text: ta.value, at: Date.now() }; name = n; nameIn.value = n;
    if (!keep()) { say('Could not save the draft: this browser\'s storage is full or switched off.'); return; }
    try { localStorage.setItem(LAST, n); } catch { /* not kept */ }
    saved = ta.value; dirty = false; counts(); markSaved(root, 'md'); say('Draft saved on this device');
  }
  $('#md-f-draft').onclick = saveDraft; $('#md-draft').onclick = saveDraft;
  async function exportAs(fmt) {
    const base = fileName().replace(/\.(md|markdown|txt)$/i, ''); const text = ta.value;
    if (fmt === 'md') { download(new TextEncoder().encode(text), `${base}.md`, 'text/markdown;charset=utf-8'); say(`${base}.md downloaded`); return; }
    const body = await toHtml(text); const title = esc((/^#\s+(.+)$/m.exec(text)?.[1] || base).trim());
    const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;700&family=Prompt:wght@500;600&family=Sarabun:wght@400;700&display=swap"><style>body{margin:0;background:#fff}${docCss(font)}</style>`;
    if (fmt === 'html') { download(new TextEncoder().encode(`<!doctype html><html lang="th"><head>${head}</head><body><article class="md-doc">${body}</article></body></html>`), `${base}.html`, 'text/html;charset=utf-8'); say(`${base}.html downloaded`); return; }
    if (fmt === 'doc') {
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title><style>${docCss(font).replace(/max-width:780px;margin:0 auto;padding:40px 48px;/, '')}</style></head><body><div class="md-doc">${body}</div></body></html>`;
      download(new TextEncoder().encode(html), `${base}.doc`, 'application/msword'); say(`${base}.doc downloaded`); return;
    }
    // PDF: the browser's print dialog on the formatted page (Save as PDF), from a hidden frame.
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; f.title = 'Print';
    document.body.append(f); const d = f.contentDocument;
    d.open(); d.write(`<!doctype html><html lang="th"><head>${head}<style>@page{margin:18mm}</style></head><body><article class="md-doc">${body}</article></body></html>`); d.close();
    const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
    (d.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150));
    say('Choose "Save as PDF" in the print window');
  }
  ['#md-dl', '#md-f-dl'].forEach((id) => { const b = $(id); b.onclick = () => actionMenu(b, FORMATS, (v) => exportAs(v).catch((e) => say(e.message))); });

  setFont(FONTS.includes(font) ? font : FONTS[0]); setView('split'); setPressed(rb, 'md-sync', true);
  load(name, saved, drafts[name] ? `${name} · draft restored` : 'Start typing, or open a .md file (File tab)');
  if (drafts[name]) markSaved(root, 'md', drafts[name].at);
  return { isDirty: () => dirty };
}
