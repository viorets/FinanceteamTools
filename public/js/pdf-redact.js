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
    if (c === 47) { i++; while (i < n && !WS.has(b[i]) && !DELIM.has(b[i])) i++; operand(start, null); continue; } // /Name
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

// Which text-showing operators start inside `areas` ([x0, y0, x1, y1] in PDF user space)?
// -> { cut: [{ start, end, keep }] (keep: text to put back, e.g. "T*" for '), hits: per-area count }
export function findText(ops, areas) {
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let tm = [1, 0, 0, 1, 0, 0]; let tlm = tm; let leading = 0; let rise = 0;
  const cut = []; const hits = areas.map(() => 0);
  const lineTo = (tx, ty) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  for (const o of ops) {
    const a = o.args;
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

// Removes the text in `areas` from page `index` of pdf-lib document `pdf`. Returns the per-area count of removed
// text pieces (0 = nothing found there: the caller should cover that area).
export function removeText(pdf, PDFLib, index, areas) {
  const { PDFArray, PDFName, PDFRawStream, decodePDFRawStream } = PDFLib;
  const node = pdf.getPage(index).node; const ctx = pdf.context;
  const c = node.get(PDFName.of('Contents')); if (!c) return areas.map(() => 0);
  const list = ctx.lookup(c) instanceof PDFArray ? ctx.lookup(c).asArray() : [c];
  const parts = list.map((r) => { const s = ctx.lookup(r); return s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents(); });
  // the streams are one content stream split at token boundaries: join them with a line break
  const total = parts.reduce((t, p) => t + p.length + 1, 0); const bytes = new Uint8Array(total); let at = 0;
  parts.forEach((p) => { bytes.set(p, at); at += p.length; bytes[at++] = 10; });
  const { cut, hits } = findText(parseOps(bytes), areas);
  if (!cut.length) return hits;
  const enc = new TextEncoder(); const pieces = []; let from = 0;
  for (const { start, end, keep } of cut) { pieces.push(bytes.subarray(from, start), enc.encode(keep)); from = end; }
  pieces.push(bytes.subarray(from));
  const out = new Uint8Array(pieces.reduce((t, p) => t + p.length, 0)); at = 0; pieces.forEach((p) => { out.set(p, at); at += p.length; });
  node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(out)));
  return hits;
}
