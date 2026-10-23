// Word editor (prototype): change the text of a .docx's paragraphs and table cells without touching anything else.
// The file is opened as a zip (JSZip) and only word/document.xml changes, so styles, headers, footers, images and page
// layout stay as they were. An edited paragraph takes the formatting of its first text run (mixed bold/italic inside
// that one paragraph becomes one style). Headers, footers and text boxes are not listed.
const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

const loadJSZip = () => window.JSZip ? Promise.resolve(window.JSZip) : new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = JSZIP; s.crossOrigin = 'anonymous';
  s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error('Could not load the Word tools. Try again.'));
  document.head.append(s);
});

const ancestor = (el, name) => { for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) if (n.namespaceURI === W && n.localName === name) return n; return null; };
// Text pieces of a run: w:t, and w:tab / w:br directly in a run (a w:tab under w:tabs is a tab stop; page breaks are kept).
const isPiece = (el) => el.parentNode?.localName === 'r' && (el.localName === 't' || el.localName === 'tab' || el.localName === 'cr' || (el.localName === 'br' && !el.getAttributeNS(W, 'type')));
const pieceText = (el) => el.localName === 't' ? el.textContent : el.localName === 'tab' ? '\t' : '\n';
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Opens the editor in `root`. bytes: the .docx (ArrayBuffer). Resolves { isDirty(), save() }; save() resolves the
// edited .docx as an ArrayBuffer.
export async function openDocxEditor(root, bytes) {
  const JSZip = await loadJSZip();
  let zip;
  try { zip = await JSZip.loadAsync(bytes.slice(0)); } catch { zip = null; }
  const part = zip?.file('word/document.xml');
  if (!part) throw new Error('Could not read this file. Only .docx files can be edited (not old .doc files).');
  const xml = new DOMParser().parseFromString(await part.async('string'), 'application/xml');

  // Each paragraph's own text pieces (pieces of a text box inside it belong to the text box's paragraphs).
  const pieces = new Map();
  for (const el of xml.getElementsByTagNameNS(W, '*')) {
    if (!isPiece(el)) continue;
    const p = ancestor(el, 'p'); if (!p || ancestor(p, 'txbxContent')) continue;
    if (!pieces.has(p)) pieces.set(p, []);
    pieces.get(p).push(el);
  }
  // Listed: paragraphs with text, and every table-cell paragraph (empty cells are often the ones to fill in).
  const items = [...xml.getElementsByTagNameNS(W, 'p')]
    .filter((p) => !ancestor(p, 'txbxContent') && (pieces.has(p) || ancestor(p, 'tc')))
    .map((p) => ({ p, inTable: !!ancestor(p, 'tc'), text: (pieces.get(p) || []).map(pieceText).join('') }));
  if (!items.length) throw new Error('No text was found in this document.');

  root.innerHTML = `<div class="oe"><div class="oe-bar"><span class="oe-note">${items.length} paragraphs and table cells · edited ones are marked</span></div>
    <div class="oe-scroll de-list">${items.map((it, i) => `<label class="de-item${it.inTable ? ' de-cell' : ''}"><span>${it.inTable ? 'Table cell' : 'Paragraph'}</span><textarea data-i="${i}" rows="${Math.max(1, it.text.split('\n').length)}">${escapeHtml(it.text)}</textarea></label>`).join('')}</div></div>`;
  const changed = new Set();
  root.querySelector('.de-list').addEventListener('input', (e) => {
    const ta = e.target; const i = +ta.dataset.i;
    ta.rows = Math.max(1, ta.value.split('\n').length);
    if (ta.value === items[i].text) changed.delete(i); else changed.add(i);
    ta.closest('.de-item').classList.toggle('de-changed', changed.has(i));
  });

  // Replace a paragraph's text: the pieces go, and the new text goes into its first text run (or a new run that takes
  // the paragraph mark's formatting when the paragraph had no text).
  function setText(p, text) {
    const old = pieces.get(p) || [];
    let run = old[0]?.parentNode;
    old.forEach((el) => el.remove());
    if (!run) {
      run = xml.createElementNS(W, 'w:r');
      const markRPr = [...p.getElementsByTagNameNS(W, 'pPr')].find((x) => x.parentNode === p)?.getElementsByTagNameNS(W, 'rPr')[0];
      if (markRPr) {
        const rPr = markRPr.cloneNode(true);
        [...rPr.children].filter((c) => c.localName === 'ins' || c.localName === 'del').forEach((c) => c.remove());
        run.append(rPr);
      }
      p.append(run);
    }
    const added = [];
    text.split('\n').forEach((line, li) => {
      if (li) added.push(xml.createElementNS(W, 'w:br'));
      line.split('\t').forEach((part, pi) => {
        if (pi) added.push(xml.createElementNS(W, 'w:tab'));
        if (!part) return;
        const t = xml.createElementNS(W, 'w:t'); t.setAttributeNS(XML_NS, 'xml:space', 'preserve'); t.textContent = part;
        added.push(t);
      });
    });
    run.append(...added);
    pieces.set(p, added);
  }

  return {
    isDirty: () => changed.size > 0,
    async save() {
      root.querySelectorAll('.de-list textarea').forEach((ta) => {
        const i = +ta.dataset.i; if (!changed.has(i)) return;
        setText(items[i].p, ta.value); items[i].text = ta.value;
      });
      changed.clear(); root.querySelectorAll('.de-changed').forEach((x) => x.classList.remove('de-changed'));
      let out = new XMLSerializer().serializeToString(xml);
      if (!out.startsWith('<?xml')) out = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n${out}`;
      zip.file('word/document.xml', out);
      return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    },
  };
}
