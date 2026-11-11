# TUSU Finance Team Tools

Browser-based data tools for the TUSU finance team. Turn an Excel file into a chart or a Word-ready table, or mark up a PDF. Everything runs in the browser, so nothing is uploaded to a server.

**Website:** https://tusu-finance-team-tools.web.app

## Tools

### Chart from Excel
- Open an `.xlsx`, `.xls` or `.csv` file (first sheet; the first row holds the column names), or **Try an example** (a monthly budget and actual)
- Options in three groups: **Data** (chart type, categories, values, second values drawn over the first, filter rows), **Style** (colours, gradient, dashed grid lines) and **Text** (font, value labels, label and legend size and colour); Style and Text stay folded until opened
- **Download SVG** sits above the chart; on iPad and narrow windows the chart comes first and the options under it
- Text categories (months, weeks, names) keep the order of the rows in the file; numbers are sorted. Bar, pie and treemap sort largest first
- A file that cannot be read, an empty sheet or a one-column sheet gets a clear message; so does a filter that leaves no rows
- **Gradient fill**: bars, area fills, pie/donut slices and treemap tiles fade from their colour to a lighter tint, on screen and in the SVG (plain `fill="url(#…)"`, so PowerPoint and Canva read it)
- Filter the rows, then export the chart as **SVG**

### Excel to Word table
- Upload an Excel file and pick the sheet
- Format it like Word's Table Design tab: a table style (Table Grid, Plain, Grid and List tables), the six Table Style Options (Header Row, Total Row, Banded Rows, First Column, Last Column, Banded Columns), an accent colour, font and size, numbers aligned right, fit to page width
- **Copy** the table to paste into Word, or **download** a real Word file (`.docx`): borders, fills, font and alignment come with it, the header row repeats on every page, and wide tables get a landscape page
- Wide sheets (such as Google Form responses): Word tables hold at most 63 columns and only about 15 fit a page readably, so by default a sheet that is too wide becomes one block per row (question | answer, blank answers left out); or choose to split the columns into several tables

### Appearance and chart colours
- Side navigation (top): Light, Dark or Follow device for the site. Dark is black and greys with white controls (monochrome, as on Apple's product pages)
- Chart colours: TUSU Finance (the team CI, Mosaic Blue #00758F; default), TUSU Finance CI (the internal deck's teals #006371, #077989, #2babc2, #5f9aa3, ice #e8f9ff), 7 team palettes (Sakura Dusk, Midnight Violet, Old Rose, Mulled Wine, Winter Dawn, Autumn Harvest, Kombu Moss) and 10 theme-factory themes, shown as colour strips; they set the default colours of the charts, Gantt chart and Word tables
- iPad and narrow windows: the top bar keeps the open tool's name in view (other tools show their icon); fields use 16px text so Safari does not zoom in
- Side menu names: Chart from Excel, Word table from Excel, PDF markup, Gantt chart, Excel editor, Word editor, Merge PDFs, Rename files, Markdown editor
- Each editor has a **?** button beside full screen: tips and keyboard shortcuts. On a Mac (or an iPad with a keyboard) the tips and button labels show ⌘ instead of Ctrl; every shortcut works with either. Opening an Excel or Word file says in the status line what the edited copy will not keep (for example "not kept in the edited copy: 2 charts, 1 image") or what is not shown (headers and footers), read from the file itself
- Editors (PDF, Excel, Word, Markdown) have no side panel: the document takes the full width. Before a file is open, a card in the middle has **Open a file** (or drop a file on it), the size limit and tips; the status line sits under the document
- File tab (Excel, Word, Markdown; first tab, the editor opens on Home): **Open…**, **New** (Markdown), file name (Markdown), **Save draft** with the time it was saved, **Download** (a format menu for Excel and Markdown). The PDF editor has Open, Save draft and Download beside zoom
- Editor ribbons (Excel, Word, Markdown) wrap onto more rows instead of scrolling sideways; click the open ribbon tab again to fold the groups away. Markdown shows a Text / Preview switch on narrow screens
- Tinted glass frame: the side navigation, tool options and editor toolbars are frosted CI glass over a soft CI backdrop; documents, charts and tables stay solid white. Without blur support, or when the device asks for less transparency, the glass turns solid

### PDF editing
- Open a PDF (up to 100 MB; above 12 MB the status line warns that iPad Safari may run short of memory and saving is slow) from the card or by dropping it on the page
- **Edit text**: click a paragraph of the PDF (or a table cell line) and type over it. It opens in place with the nearest site font (the same font when the site has it), its size, line spacing and colour (taken from the page); a centred line stays centred and a right-aligned one (a signature block, a date line) keeps its right edge; the original is covered on screen. In the downloaded PDF the old words are **removed** from the page's drawing instructions (`public/js/pdf-redact.js`), so search and copy find only the new text, and the new text is written as real text with the same line breaks as on screen. Text inside form XObjects (Word headers, stamps, pages placed in pages) is removed too, through a copy of the form used by that page only; only text drawn some other way is covered, and the status line says so. While the tool is on, a caution line in the tool bar says that the text below an edit does not move; an edit that needs more room than the original gets an amber outline. Emptying an edit deletes the paragraph
- **Scanned pages**: clicking a page without text reads it by OCR (once), then its lines and paragraphs edit the same way (in Sarabun); the scan under an edit is covered with the paper's colour and the new text is real text. OCR lines are tidied first: pieces of marks that detection cuts off a line are dropped, the boxes of one line share its size and baseline, and an uneven scan's lines still join into their paragraphs
- Tools: text box (Thai supported; LINE Seed Sans TH, Noto Sans Thai, Sarabun, TH Sarabun New, TH SarabunPSK, EucrosiaUPC, Times New Roman, Arial or Georgia), highlight text, draw, line, arrow, rectangle
- Text boxes are rich text: select letters and press **B**, *I*, U, S or the highlighter (Ctrl+B / I / U, Ctrl+Shift+X); click anywhere in a box to edit there; typing `-->` gives → and `==>` gives ➜
- Highlights have their own colour (with HEX entry) and opacity, and sit behind the text (multiply), on screen and in the PDF; letters inside text boxes can be highlighted too
- Hold Shift for straight lines and squares; select a mark to move it, change its width or colour, or delete it; undo/redo with Ctrl+Z / Ctrl+Y or the icon buttons
- Zoom with Ctrl/⌘ + mouse wheel, a trackpad or finger pinch, or − / +; full screen keeps the tools on top, including Save draft and Download
- **Save draft** keeps your marks on this device (browser storage) so you can reopen the same file later
- **Download PDF** saves a marked copy (`<name> (marked).pdf`); the original file is never changed
- Text boxes are written into the PDF as **real text** (`public/js/pdf-realtext.js`): searchable, copyable and sharp. Thai is shaped with each font's own rules and every glyph placed at its shaped position, so vowels and tone marks sit as on screen; ำ copies out as ำ. Fonts are embedded as subsets from `public/fonts/` (Sarabun, Noto Sans Thai, TH Sarabun New, TH SarabunPSK, LINE Seed Sans TH; bold/italic made by outline and slant where a font has no file). Times New Roman and Arial use the PDF's built-in Times and Helvetica; EucrosiaUPC and Angsana New (Windows fonts we may not host) are read from the computer in Chrome/Edge, else TH Sarabun New is used and the status line says so; **＋ beside the font menu adds a font file from this computer** (.ttf, .otf, or a .ttc collection such as Windows' `angsana.ttc`, which is split into its fonts; bold and italic files too): it is kept in this browser only (IndexedDB), shown on screen and embedded in the PDF like the site's fonts; a file of EucrosiaUPC (`upcel.ttf` from a Windows PC) makes EucrosiaUPC work in Safari too; letters a font lacks come from its fallback font (also on screen). Georgia boxes stay a picture
- Opening a PDF warns (alert window, after TUSUFinanceFeedback's) when it uses fonts the site does not have, naming the nearest font here, and when the PDF is locked by its author: such a PDF can be marked on screen, saved as a draft and converted to Word/Markdown, but a marked copy cannot be downloaded
- **Download as Word (.docx)** or **Markdown** (or **Open in Markdown editor**) turns the PDF's own text into a document (`public/js/pdf-text.js`): headings from text size and bold lines, paragraphs, numbered and bulleted lists, and tables. Bordered tables follow the PDF's ruling lines (cells keep their wrapped text); borderless label-and-text layouts and column layouts become tables too. Financial statements without borders keep their columns: right-aligned figures (1,245,300.50, (15,000.00), -) are told apart by where they end, dot leaders split a label from its amount, and section labels such as "สินทรัพย์หมุนเวียน" stay rows of the same table. Columns of figures are right-aligned (Markdown `---:`). Running headers, footers and page numbers are left out
- The Word file uses the PDF's main font (e.g. TH Sarabun New) and body size, Heading 1–4, Word bullets and numbering, bold and italic, and tables with the PDF's column widths: bordered where the PDF has ruling lines, without borders where it has none, figures aligned right. Thai words are joined by zero-width spaces so Word wraps Thai lines where the browser's Thai word breaker allows (without them Word wraps only at spaces). Checked by opening the files in Microsoft Word
- Thai is repaired on the way: legacy shifted-mark characters (U+F700–F71A), `ํา` for ำ, marks out of order, and Word's PDF-export faults (`จ ำกัด`, `ก าหนด`, bold `กิจกำร`, common words that lose ำ such as `กาไร`)
- **OCR**: scanned pages, and pages whose stored Thai is damaged by the program that made the PDF (letters and symbols inside words, as from Safari or Microsoft Forms; or common words that lost a stacked tone mark or upper vowel, such as ที for ที่ and เปด for เปิด, as in Canva's PDFs: one such word flags a page of a file made by Canva, two and at least 1% of the words flag any other page). Edit text reads such pages by OCR too. Text that a PDF draws two or three times over itself (Canva's outline and shadow effects) is read once, are read from the page image instead (`public/js/pdf-ocr.js`): PaddleOCR (PP-OCRv3 mobile detection + PP-OCRv5 Thai recognition) running in the browser with onnxruntime-web; the file never leaves the device. About 4–5 s a page; the status line names the OCR pages so names and figures can be checked. Measured about 90% of characters right on a 200-dpi scan (small tone marks are the usual misses). Each OCR line is then checked against a Thai word list (PyThaiNLP `words_th.txt`, 62,000 words, CC0; `public/models/ocr/words_th.txt`, cached with the models, `public/js/thai-check.js`): a word missing one mark is put right when exactly one real word comes of it (ผูบริหาร → ผู้บริหาร); a word one swapped letter or one extra mark away from a real word is not changed but listed in the status line to check, with its suggestion (บัญซี (บัญชี?)). On ~15,000 words of normal Thai documents this changed nothing. A misreading that is itself a real word (ซึง for ซึ้ง, ซิ for ซี) cannot be caught this way
- OCR files are served from this site: models in `public/models/ocr/` (about 10 MB, Apache-2.0, ONNX from [monkt/paddleocr-onnx](https://huggingface.co/monkt/paddleocr-onnx)) and the engine in `public/vendor/ort/` (onnxruntime-web 1.20.1, MIT, about 11 MB). They load the first time OCR is used and are cached for 30 days (`firebase.json`)

The editor came from [TUSUFinanceFeedback](https://github.com/viorets/TUSUFinanceFeedback); this repository is now the source of truth for the PDF, Excel and Word editors, and Feedback keeps hand copies in its `public/js/markup/`. For it, `openPdfEditor` takes `editText: false, ocr: false, maxBytes` (Edit text and OCR are off there, and their code is then never loaded), `pdf-realtext.js` has `setFontDir()`, and `ribbon.js` has `setRibbonLang(t)` for Thai ribbon labels. Apple Pencil palm rejection came back from Feedback: once a pen is used, finger touches no longer draw, and a touch during a pen stroke is ignored.

### Gantt Chart Creator
- Type tasks into the table (task, group, start, end, progress, milestone) or import an Excel sheet with columns Task, Start, End (optional: Group, Progress, Milestone; Thai headings work)
- Gantt (one row per task) or timeline (one lane per group); days, weeks, months or quarters; English or Thai (B.E.) date labels; today line, progress and dates; gradient bars (PNG and SVG)
- Dates are typed day/month/year (dd/mm/yyyy, whatever the browser's language; a Buddhist-era year such as 2569 counts as 2026) or picked from the calendar button
- Group colours with HEX entry
- Download **PNG** (3×, white or transparent background) or **SVG** (font included); both match the preview
- Tasks are kept in this browser between visits

### Excel editing (beta)
- GridCraft-style: a ribbon (Home, Insert, Formulas, Data, View), Name Box, formula bar with coloured cell references and function help, sheet tabs and a status bar (Sum, Average, Count)
- Select ranges (drag, Shift+click, Shift+arrows), type to edit (F2 or double-click), copy and paste to and from Excel, fill handle for copies and series
- Format cells (font, size, B/I/U, colours with HEX, alignment, wrap, merge, number formats incl. ฿ and Thai B.E. dates, borders); insert and delete rows and columns (formulas follow); sort, filter, freeze panes
- **Format as table**: a header row, banded rows, borders and filter buttons in any chart colour theme (written as cell formatting; not on protected sheets)
- No size limit (the grid draws only what is on screen); undo and redo
- **Save draft** keeps the edited workbook in this browser (IndexedDB); opening the same file again offers the draft
- **Download as** `.xlsx`, or the active sheet as shown: CSV UTF-8 (opens in Excel with Thai intact), tab-separated `.tsv`, Unicode text (UTF-16), JSON (header row as keys) or an HTML table. The toolbar's Download button lists the same formats, so it works in full screen
- Formulas calculate live (HyperFormula; TEXT() uses Excel's number formats); charts, images and pivot tables are **not** kept

### Word editing (beta)
- WordCraft-style: the document is shown in pages with a ribbon: font, size, B/I/U/S, colour, highlight (HEX), alignment, bullets and numbering, indent, line spacing, and a styles gallery (Normal, Title, Headings, Quote)
- **Modify…** (or right-click a style) changes a style's font, size, colour, bold, italic, alignment and spacing in the document's styles; ticked styles are remembered in this browser and used when that style is applied in other documents
- Tab stops are laid out as in Word (left, centre, right, dot leaders), so a table of contents shows its dotted lines and page numbers; TOC entries keep the TOC style rather than the link style
- Enter starts a new paragraph; find and replace; word count; export PDF, .txt, .md, .html; **Save draft** keeps the edited document in this browser
- Insert text boxes, lines, arrows, rectangles and pen strokes on the page, saved as Word drawings; typing --> gives → and ==> gives ➜
- **Pages**: the text is laid out page by page as in Word: a paragraph or table row that would cross the bottom margin moves to the next page; page breaks, "page break before" and section breaks start a new page. The pages are drawn behind the text, so typing and undo work as before. Line breaks inside a paragraph are not split across pages (the whole paragraph moves), so a page can end a little earlier than in Word
- **Headers and footers**: each page shows its section's header and footer, including a different first page and odd/even pages; PAGE, NUMPAGES, IF and = fields are worked out per page. Double-click one (or Insert > Header & footer) to type in it; the text keeps its formatting, and fields and pictures stay as they are. Typing in an empty header or footer adds one to that section
- **Page numbers** (Insert > Page numbers): footer or header, left/centre/right, format 1 2 3 · i ii iii · I II III · a b c · A B C · ๑ ๒ ๓, text before (e.g. หน้า), the total ("of N" / "จาก N"), the first number, and the page to **start** and **stop** on. They are written as Word fields (PAGE inside IF and = fields), so Word numbers the pages itself; applying again replaces them (and a footer line that held only a page number), and "No page numbers" removes them. Numbers then count the pages of the whole document (sections' own restarts are cleared)
- Only what changed is rewritten: a text-only edit keeps every run's formatting; old `.doc` files are not supported

### Merge PDFs
- **Add PDFs** (or drop them on the page); each file's pages are added at the end, as page cards with thumbnails. On iPad and narrow windows the pages come first and the file list under them
- Keep only some pages of a file (**Pages**: `1-3, 5`, `8-`); move a whole file up or down with its pages
- Choose pages, then act on them: tap or click a page to choose it (Shift: a run of pages); the bar above the pages moves them **Earlier** or **Later**, **Turn**s them a quarter, or **Remove**s them. Pages can also be dragged (the chosen ones move together). Keyboard: arrows move between pages, Space chooses, Delete removes, Ctrl/⌘ + arrows move, Ctrl/⌘ + A chooses all, Esc chooses none
- **Undo** (or Ctrl/⌘ + Z) takes back the last change, including removing a file or **Clear** (which asks first above 10 pages); a page range that cannot be read is shown under its field. Each card has the shape of its page (a landscape slide is a landscape card)
- **Save as PDF**: Chrome and Edge ask where to save; other browsers download the file under the name given. Pages are copied with pdf-lib, so text stays searchable and links and fonts stay as they are
- **Print**: the merged PDF opens in a new tab (opened on the tap, so Safari allows it), to print from there
- A PDF locked by its author is added with a note; its pages are copied when the PDF allows it. Up to 100 MB of PDFs in all; above 12 MB the status line warns that saving may be slow on iPad

### Rename files
- **Add files**, **Add a folder**, or drop them on the page; nothing is uploaded. On iPad and narrow windows the preview comes first and the rules under it
- **New name** template with tokens: `{name}` (the old name), `{n}` (a number), `{date}` (the file's date), `{today}`, `{folder}`, `{ext}`; e.g. `อมธ_{date}_{n}_{name}`
- Folding sections: **Find and replace** (plain text or a pattern, match case), **Numbering** (start, step, digits, Thai digits; order as added, by name, date or size, or move files up and down), **Dates** (dd-mm-yyyy, yyyy-mm-dd or yyyymmdd; Buddhist year), **Tidy** (UPPER, lower or Title Case; single spaces; keep the file type), **Names from a list** (an Excel or CSV sheet of old name → new name; files on it take its name)
- **Presets** (under the rules) keep a set of rules in this browser; deleting one asks first
- The preview lists every file with its new name; names that clash get " (2)", " (3)"; characters that Windows or macOS do not allow become `_`; a name that is only a file type (".pdf", which would be a hidden file) is flagged; a rule that leaves a file without a name blocks the download until it is fixed
- **Download renamed (ZIP)**: renamed copies in one ZIP, in every browser; the original files are unchanged
- **Open folder to rename in place** (Chrome and Edge only): renames the files in that folder (through temporary names, so swapping two names works); **Undo renaming** puts the old names back while the page is open. Safari cannot change files on disk, so there it is the ZIP

### Markdown editing
- Write Markdown on the left, see the formatted page on the right (or text only / preview only); scroll stays in step
- Ribbon: paragraph and heading styles, bold, italic, strikethrough, inline code, bullets, numbering, checklists, quotes, indent, links, images, tables, code blocks, divider; find and replace
- Typing helpers: Enter continues a list (Enter on an empty item ends it), Tab / Shift+Tab indent, `-->` gives →, `==>` gives ➜; Ctrl+B / I / K
- Paste a range copied from Excel and it becomes a Markdown table (number columns aligned right); Ctrl+Shift+V pastes the plain text
- Tick a checkbox in the preview to tick the task in the text
- **Edit on the formatted page too**: type, press Enter, or use Bold, Italic, Strikethrough, Code, headings, lists, quote and link from the ribbon. After a short pause only the changed blocks become Markdown again (Turndown), so the rest of the text keeps its exact spelling; Undo works on both sides. In tables Enter stays in the cell and Tab moves to the next one; an edited table or list is rewritten in standard Markdown (`-` bullets, `| --- |` dividers)
- Click anywhere on the formatted page and the cursor in the text moves to the same place (in a table, the same cell)
- **Save draft** keeps the text in this browser by file name; **Download as** Markdown, a web page (.html), Word (.doc) or PDF (print); full screen keeps Save draft and Download in the toolbar
- Markdown is converted by [marked](https://marked.js.org/) (GitHub-flavoured) and cleaned by [DOMPurify](https://github.com/cure53/DOMPurify) before it is shown

## Pros and cons at a glance

| Tool | Strong at | Watch for |
|---|---|---|
| Chart from Excel | Sharp SVG charts in the team colours; Thai labels embedded (LINE Seed Sans TH) | Needs a tidy table; other fonts are only named in the SVG |
| Excel to Word table | Word table styles; copy into Word or download a real .docx; wide form sheets become readable question/answer blocks | Values only, formulas become results; very wide sheets cannot stay one table |
| PDF editing | Edit the PDF's own text (old words removed, Thai shaped); Thai rich text boxes, highlights, shapes, drafts, full screen; PDF text to Word or Markdown with tables and Thai repairs | Edited text does not move the text below; on scans, OCR can misread; no form filling; 100 MB limit (slow above 12 MB on iPad); OCR is slower and can miss small tone marks; slides and posters convert roughly; a lone lost tone mark that leaves a real word (เสี่ยง → เสียง) is not detected |
| Gantt Chart Creator | Quick Gantt or timeline from typed tasks or Excel; PNG/SVG match the preview | No dependencies or critical path; tasks stay in this browser |
| Excel editing (beta) | Excel-like ribbon, live formulas, no size limit, Format as table, many export formats | Charts, images and pivot tables are dropped; filtered-out rows hidden on screen only |
| Markdown editing | Fast writing with a live preview; Excel ranges paste as tables; .md, .html, Word, PDF downloads | PDF goes through the print window; images must be web addresses (no upload); Word file is .doc (web format) |
| Word editing (beta) | Document in its own formatting, safe text edits, custom styles, TOC with leaders | One continuous page; no headers/footers; editing formatting near links or fields rebuilds the paragraph |

Everything runs in the browser and needs the internet for its libraries. Drafts, saved styles and Gantt tasks live in this browser only; clearing the site's data deletes them. The full list is in the plan doc's "Pros and cons" tab.

## Project structure

```
public/index.html                   # the app page: side navigation, Excel tools (inline) and the PDF, Gantt, Excel and Word tabs
public/js/pdf-markup.js             # PDF editor module
public/css/markup.css               # PDF editor styles
public/js/gantt.js                  # Gantt Chart Creator (layout → SVG and PNG)
public/css/gantt.css                # Gantt Chart Creator styles
public/css/batch.css                # Merge PDFs and Rename files styles
public/js/view-tools.js             # zoom, full screen and icon buttons shared by the PDF, Excel and Word editors
public/css/view-tools.css           # their styles, and the HEX field
public/js/hex-color.js              # HEX entry beside every colour picker
public/js/word-table.js             # Excel to Word table with Word table styles
public/js/ribbon.js                 # ribbon (tabs + groups) for the Excel, Word and Markdown editors
public/js/gradient.js               # gradient fill for the charts (Gantt, Chart from Excel)
public/js/xlsx-core.js              # spreadsheet helpers: formats, styles, reference shifting, TEXT() fix
public/js/rich-text.js              # typed arrows and editing helpers
public/js/pdf-text.js               # PDF text to blocks (headings, lists, tables, Thai repairs), Markdown and .docx
public/js/pdf-ocr.js                # OCR for scanned or damaged pages (PaddleOCR + onnxruntime-web)
public/js/pdf-realtext.js           # text boxes as real, shaped Thai text in the PDF; font faces and fallbacks
public/js/pdf-redact.js             # removes text in given areas from a page's content stream (Edit text)
public/fonts/                       # embeddable fonts (OFL / GPL): Sarabun, Noto Sans Thai, TH Sarabun New, TH SarabunPSK, LINE Seed Sans TH
public/models/ocr/                  # PaddleOCR detection and Thai recognition models (ONNX)
public/vendor/ort/                  # onnxruntime-web 1.20.1 (served from this site)
public/js/themes.js                 # appearance (light/dark/device) and chart colour themes
public/css/themes.css               # interface colours for light and dark
public/js/md-edit.js                # Markdown editor (marked + DOMPurify)
public/css/md-edit.css              # Markdown editor styles
public/js/xlsx-edit.js              # Excel editor (ExcelJS)
public/js/xlsx-relock.js            # puts sheet protection back after saving (from TUSUFinanceFeedback)
public/js/pdf-merge.js              # Merge PDFs (pdf.js thumbnails, pdf-lib copyPages)
public/js/batch-rename.js           # Rename files (rules, presets, ZIP, rename in place)
public/js/docx-edit.js              # Word editor (JSZip; edits word/document.xml, headers and footers; pages)
public/css/office-edit.css          # Excel and Word editor styles
public/fonts/LINESeedSansTH_Rg.ttf  # text box font (SIL Open Font License)
public/favicon.png                  # tab icon (paper plane, FINANCE-TEAM_2.png)
public/apple-touch-icon.png         # home-screen icon for iPad / iPhone
firebase.json                       # Firebase Hosting config
.firebaserc                         # Firebase project: tusu-finance-team-tools
```

Libraries are loaded from CDNs: [SheetJS](https://sheetjs.com/) reads the Excel files, [Plotly](https://plotly.com/javascript/) draws the charts, [pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/) show and write PDFs, [ExcelJS](https://github.com/exceljs/exceljs) and [JSZip](https://stuk.github.io/jszip/) edit Excel and Word files, and [HyperFormula](https://hyperformula.handsontable.com/) calculates Excel formulas (used under its GPL-3.0 licence). Fonts: LINE Seed Sans TH, plus Noto Sans Thai and Sarabun from Google Fonts. Product notes for design work: `PRODUCT.md`.

## Run locally

Open `public/index.html` in a browser, or run:

```bash
firebase serve --only hosting
```

## Deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```
