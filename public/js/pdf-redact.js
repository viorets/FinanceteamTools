// Removes text from a PDF page: the text-drawing instructions (Tj, TJ, ', ") whose starting point lies in one of the
// given areas are deleted from the page's content stream, so the old words are gone (not just covered): search and
// copy no longer find them. Everything else on the page (pictures, lines, other text) is untouched.
//
// The text position is followed through the content stream: q/Q/cm (graphics state), BT/Td/TD/Tm/T*/TL/Ts (text
// state). Text drawn inside form XObjects (Do) is not reached; the caller covers those areas instead (the result says
// which areas had nothing removed).

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set([...'()<>[]{}/%'].map((c) => c.charCodeAt(0)));
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];

// The content stream's operators: [{ op, args (numbers or null), start, end }] (start = first operand).
export function parseOps(b) {
  const out = []; let args = []; let argStart = -1; let i = 0; const n = b.length;
  const operand = (start, v) => { if (argStart < 0) argStart = start; args.push(v); };
  while (i < n) {
    const c = b[i];
    if (WS.has(c)) { i++; continue; }
    if (c === 37) { while (i < n && b[i] !== 10 && b[i] !== 13) i++; continue; } // % comment
    const start = i;
    if (c === 40) { // ( literal string ), nested, with \ escapes
      let depth = 0;
      for (; i < n; i++) { const d = b[i]; if (d === 92) { i++; continue; } if (d === 40) depth++; else if (d === 41 && --depth === 0) { i++; break; } }
      operand(start, null); continue;
    }
    if (c === 60 && b[i + 1] === 60) { i += 2; operand(start, null); args.push('<<'); continue; } // dict start (BDC/DP operands)
    if (c === 62 && b[i + 1] === 62) { i += 2; continue; }
    if (c === 60) { while (i < n && b[i] !== 62) i++; i++; operand(start, null); continue; } // <hex>
    if (c === 91 || c === 93) { i++; operand(start, null); continue; } // [ ] (TJ arrays: their strings are operands too)
    if (c === 47) { i++; while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++; operand(start, String.fromCharCode(...b.subarray(start + 1, i))); continue; } // /Name (kept: Do needs it)
    if (c === 123 || c === 125) { i++; continue; }
    // a number or an operator keyword
    while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++;
    const tok = String.fromCharCode(...b.subarray(start, i));
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { operand(start, Number(tok)); continue; }
    if (tok === 'true' || tok === 'false' || tok === 'null') { operand(start, null); continue; }
    if (tok === 'BI') { // inline image: skip to the EI that follows its binary data
      let j = i; while (j < n - 2 && !(b[j] === 73 && b[j + 1] === 68 && WS.has(b[j + 2]) && WS.has(b[j - 1]))) j++; // ID
      j += 3; while (j < n - 1 && !(WS.has(b[j - 1]) && b[j] === 69 && b[j + 1] === 73 && (j + 2 >= n || WS.has(b[j + 2]) || DELIM.has(b[j + 2])))) j++;
      i = j + 2; args = []; argStart = -1; continue;
    }
    out.push({ op: tok, args: args.filter((a) => a !== '<<'), start: argStart < 0 ? start : argStart, end: i });
    args = []; argStart = -1;
  }
  return out;
}

// Which text-showing operators start inside `areas` ([x0, y0, x1, y1] in PDF user space)? ctm: the starting
// transform (a form's Matrix x the CTM where it is drawn). onForm(name, ctm): a form XObject drawn with Do; it returns
// that form's per-area hits.
// -> { cut: [{ start, end, keep }] (keep: text to put back, e.g. "T*" for '), hits: per-area count }
export function findText(ops, areas, { ctm: ctm0 = [1, 0, 0, 1, 0, 0], onForm = null } = {}) {
  let ctm = ctm0; const stack = []; let tm = [1, 0, 0, 1, 0, 0]; let tlm = tm; let leading = 0; let rise = 0;
  const cut = []; const hits = areas.map(() => 0);
  const lineTo = (tx, ty) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  const nums = (a) => a.filter((v) => typeof v === 'number');
  for (const o of ops) {
    const a = nums(o.args);
    switch (o.op) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || ctm; break;
      case 'cm': if (a.length >= 6) ctm = mul(a.slice(-6), ctm); break;
      case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'Td': lineTo(a[0] || 0, a[1] || 0); break;
      case 'TD': leading = -(a[1] || 0); lineTo(a[0] || 0, a[1] || 0); break;
      case 'Tm': if (a.length >= 6) tm = tlm = a.slice(-6); break;
      case 'T*': lineTo(0, -leading); break;
      case 'TL': leading = a[0] || 0; break;
      case 'Ts': rise = a[0] || 0; break;
      case 'Do': {
        const name = o.args.find((v) => typeof v === 'string');
        if (name && onForm) onForm(name, ctm)?.forEach((h, k) => { hits[k] += h; });
        break;
      }
      case "'": case '"': case 'Tj': case 'TJ': {
        if (o.op === "'" || o.op === '"') lineTo(0, -leading);
        const m = mul(tm, ctm); const x = rise * m[2] + m[4]; const y = rise * m[3] + m[5];
        const k = areas.findIndex(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
        if (k >= 0) { hits[k]++; cut.push({ start: o.start, end: o.end, keep: o.op === "'" || o.op === '"' ? ' T* ' : ' ' }); }
        break;
      }
      default:
    }
  }
  return { cut, hits };
}

const cutBytes = (bytes, cut) => {
  const enc = new TextEncoder(); const pieces = []; let from = 0;
  for (const { start, end, keep } of cut) { pieces.push(bytes.subarray(from, start), enc.encode(keep)); from = end; }
  pieces.push(bytes.subarray(from));
  const out = new Uint8Array(pieces.reduce((t, q) => t + q.length, 0)); let at = 0;
  pieces.forEach((q) => { out.set(q, at); at += q.length; });
  return out;
};

// Removes the text in `areas` from page `index` of pdf-lib document `pdf`, including text inside the page's form
// XObjects. Returns the per-area count of removed text pieces (0 = nothing found there: the caller covers that area).
export function removeText(pdf, PDFLib, index, areas) {
  const { PDFArray, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } = PDFLib;
  const ctx = pdf.context; const node = pdf.getPage(index).node;
  const read = (s) => (s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents());
  // Runs one content stream with its resources; returns { bytes (changed or null), res (changed resources or null), hits }.
  function run(bytes, res, ctm, depth) {
    let newRes = null;
    const onForm = (name, at) => {
      if (depth > 4) return null;
      const xo = res && ctx.lookup(res.get(PDFName.of('XObject'))); if (!(xo instanceof PDFDict)) return null;
      const ref = xo.get(PDFName.of(name)); const form = ctx.lookup(ref);
      if (!form?.dict || form.dict.get(PDFName.of('Subtype'))?.toString() !== '/Form') return null;
      const mtx = ctx.lookup(form.dict.get(PDFName.of('Matrix')));
      const m = mtx instanceof PDFArray ? mtx.asArray().map((v) => ctx.lookup(v).asNumber()) : [1, 0, 0, 1, 0, 0];
      const fres = ctx.lookup(form.dict.get(PDFName.of('Resources'))) || res;
      const r = run(read(form), fres instanceof PDFDict ? fres : res, mul(m, at), depth + 1);
      if (r.bytes || r.res) { // a copy of the form for this page, with the text taken out
        const dict = form.dict.clone(ctx); dict.delete(PDFName.of('Filter')); dict.delete(PDFName.of('DecodeParms')); dict.delete(PDFName.of('Length'));
        if (r.res) dict.set(PDFName.of('Resources'), r.res);
        const copy = ctx.flateStream(r.bytes || read(form), {}); dict.entries().forEach(([k, v]) => { if (!copy.dict.has(k)) copy.dict.set(k, v); });
        newRes ||= res.clone(ctx);
        const xs = ctx.lookup(newRes.get(PDFName.of('XObject'))).clone(ctx); xs.set(PDFName.of(name), ctx.register(copy)); newRes.set(PDFName.of('XObject'), xs);
        res = newRes;
      }
      return r.hits;
    };
    const { cut, hits } = findText(parseOps(bytes), areas, { ctm, onForm });
    return { bytes: cut.length ? cutBytes(bytes, cut) : null, res: newRes, hits };
  }
  const c = node.get(PDFName.of('Contents')); if (!c) return areas.map(() => 0);
  const list = ctx.lookup(c) instanceof PDFArray ? ctx.lookup(c).asArray() : [c];
  const parts = list.map((r) => read(ctx.lookup(r)));
  // the streams are one content stream split at token boundaries: join them with a line break
  const total = parts.reduce((t, q) => t + q.length + 1, 0); const bytes = new Uint8Array(total); let at = 0;
  parts.forEach((q) => { bytes.set(q, at); at += q.length; bytes[at++] = 10; });
  const res = node.Resources ? node.Resources() : ctx.lookup(node.get(PDFName.of('Resources')));
  const r = run(bytes, res, [1, 0, 0, 1, 0, 0], 0);
  if (r.bytes) node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(r.bytes)));
  if (r.res) node.set(PDFName.of('Resources'), r.res); // this page's own copy (resources can be shared or inherited)
  return r.hits;
}
