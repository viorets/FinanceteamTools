// Thai OCR check: words the reader got almost right are put right from a Thai word list, and words still unknown
// are listed for the user to check. OCR's usual Thai misses are one mark (a tone mark, ์ or ็ left out or added) or
// one look-alike letter (ซ/ช, ี/ึ/ื, ด/ต, บ/ป…), so each unknown word tries those one-step changes. Only an added mark
// changes the text, and only when exactly one real word comes of it (checked on ~15,000 words of the team's Thai
// documents: no change); a swapped or removed letter could be a deliberate spelling (เชอร์/เซอร์), so such words are
// listed with their suggestion for the user to check.
// Word list: PyThaiNLP words_th.txt (62,000 words, CC0 1.0), served from models/ocr/ and cached like the OCR models.

const WORDS_URL = new URL('../models/ocr/words_th.txt', import.meta.url).href;
let wordsP = null;
export const loadWords = (fetchText = () => fetch(WORDS_URL).then((r) => { if (!r.ok) throw new Error('The Thai word list is missing'); return r.text(); })) =>
  wordsP ||= fetchText().then((t) => new Set(t.split(/\r?\n/).map((w) => w.trim().normalize('NFC')).filter(Boolean))).catch((e) => { wordsP = null; throw e; });

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const THAI_WORD = /^[ก-๎]+$/;
const MARK = /[ั-ฺ็-๎]/; // vowel and tone marks over and under a letter
const INSERT = ['่', '้', '๊', '๋', '์', '็'];
const LOOK = [['ซ', 'ช'], ['ี', 'ึ'], ['ี', 'ื'], ['ึ', 'ื'], ['ด', 'ต'], ['บ', 'ป'], ['ผ', 'ฝ'], ['พ', 'ฟ'], ['ฎ', 'ฏ'], ['ข', 'ฃ'], ['ค', 'ฅ'], ['ำ', 'า'], ['ั', 'ิ'], ['ุ', 'ู'], ['ร', 'ธ'], ['ม', 'ฆ'], ['ภ', 'ถ'], ['ล', 'ส'], ['น', 'ม'], ['ห', 'ท'], ['๊', '๋'], ['่', '้']];
const SWAP = new Map(); LOOK.forEach(([a, b]) => { SWAP.set(a, [...(SWAP.get(a) || []), b]); SWAP.set(b, [...(SWAP.get(b) || []), a]); });
const letters = (w) => w.replace(/[ั-ฺ็-๎]/g, '').length;

// One-step changes of w that OCR could have made.
function edits(w) { // -> { add: Set (a mark added), other: Set (a letter swapped or a mark taken away) }
  const add = new Set(); const other = new Set();
  for (let i = 1; i <= w.length; i++) for (const m of INSERT) add.add((w.slice(0, i) + m + w.slice(i)).normalize('NFC'));
  for (let i = 0; i < w.length; i++) {
    if (MARK.test(w[i])) other.add(w.slice(0, i) + w.slice(i + 1));
    for (const b of SWAP.get(w[i]) || []) other.add(w.slice(0, i) + b + w.slice(i + 1));
  }
  add.delete(w); other.delete(w); return { add, other };
}

// text -> { text, fixed: [[from, to]], unsure: [[word, suggestion or '']] }. unsure: words one change away from real
// words that were not changed (a swap, or more than one possible word); words far from any (names, terms) are left.
export function fixThai(text, dict) {
  if (!seg || !dict) return { text, fixed: [], unsure: [] };
  const parts = [...seg.segment(text.normalize('NFC'))].map((s) => s.segment);
  const thai = (w) => !!w && THAI_WORD.test(w);
  const unknown = (w) => thai(w) && !dict.has(w);
  const fixed = []; const unsure = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i]; if (!unknown(w)) continue;
    // a misread word is often cut in pieces where the word breaker found something it knows: try the piece joined
    // with up to two pieces on each side (shortest first), then on its own; a bare consonant alone is not a word
    const tries = [];
    for (let a = i; a >= Math.max(0, i - 2) && thai(parts[a]); a--) for (let b = i; b <= Math.min(parts.length - 1, i + 2) && thai(parts[b]); b++) {
      if (a === i && b === i && letters(w) < 2 && !MARK.test(w)) continue;
      tries.push([a, b]);
    }
    tries.sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
    let done = false; let maybe = null;
    for (const [a, b] of tries) {
      const src = parts.slice(a, b + 1).join(''); const e = edits(src);
      const add = [...e.add].filter((c) => dict.has(c));
      if (add.length === 1) { fixed.push([src, add[0]]); parts[a] = add[0]; for (let k = a + 1; k <= b; k++) parts[k] = ''; i = b; done = true; break; }
      if (!maybe) { const all = [...add, ...[...e.other].filter((c) => dict.has(c))]; if (all.length) maybe = [src, all.length === 1 ? all[0] : '']; }
    }
    if (!done && maybe) unsure.push(maybe);
  }
  return { text: parts.join(''), fixed, unsure };
}
