# TUSU Finance Team Tools

Browser-based data tools for the TUSU finance team. Turn an Excel file into a chart or a Word-ready table, or mark up a PDF. Everything runs in the browser, so nothing is uploaded to a server.

**Website:** https://tusu-finance-team-tools.web.app

## Tools

### Excel to SVG
- Upload an `.xlsx` / `.xls` file and pick a chart type
- Choose the grouping field (X axis) and up to two value fields (the second one is drawn over the first)
- Set colors, data label position, label and legend font size and color, and dashed X-axis gridlines
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
- Editors (PDF, Excel, Word, Markdown) have no side panel: the document takes the full width. Before a file is open, a card in the middle has **Open a file** (or drop a file on it), the size limit and tips; the status line sits under the document
- File tab (Excel, Word, Markdown; first tab, the editor opens on Home): **Open…**, **New** (Markdown), file name (Markdown), **Save draft** with the time it was saved, **Download** (a format menu for Excel and Markdown). The PDF editor has Open, Save draft and Download beside zoom
- Editor ribbons (Excel, Word, Markdown) wrap onto more rows instead of scrolling sideways; click the open ribbon tab again to fold the groups away. Markdown shows a Text / Preview switch on narrow screens
- Tinted glass frame: the side navigation, tool options and editor toolbars are frosted CI glass over a soft CI backdrop; documents, charts and tables stay solid white. Without blur support, or when the device asks for less transparency, the glass turns solid

### PDF editing
- Open a PDF (up to 12 MB) from the card or by dropping it on the page
- Tools: text box (Thai supported; LINE Seed Sans TH, Noto Sans Thai, Sarabun, Georgia or Arial), highlight text, draw, line, arrow, rectangle
- Text boxes are rich text: select letters and press **B**, *I*, U, S or the highlighter (Ctrl+B / I / U, Ctrl+Shift+X); click anywhere in a box to edit there; typing `-->` gives → and `==>` gives ➜
- Highlights have their own colour (with HEX entry) and opacity, and sit behind the text (multiply), on screen and in the PDF; letters inside text boxes can be highlighted too
- Hold Shift for straight lines and squares; select a mark to move it, change its width or colour, or delete it; undo/redo with Ctrl+Z / Ctrl+Y or the icon buttons
- Zoom with Ctrl/⌘ + mouse wheel, a trackpad or finger pinch, or − / +; full screen keeps the tools on top, including Save draft and Download
- **Save draft** keeps your marks on this device (browser storage) so you can reopen the same file later
- **Download PDF** saves a marked copy (`<name> (marked).pdf`); the original file is never changed

The editor comes from [TUSUFinanceFeedback](https://github.com/viorets/TUSUFinanceFeedback) (`public/js/markup/pdf-markup.js`).

### Gantt Chart Creator
- Type tasks into the table (task, group, start, end, progress, milestone) or import an Excel sheet with columns Task, Start, End (optional: Group, Progress, Milestone; Thai headings work)
- Gantt (one row per task) or timeline (one lane per group); days, weeks, months or quarters; English or Thai (B.E.) date labels; today line, progress and dates; gradient bars (PNG and SVG)
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
- WordCraft-style: one editable page with a ribbon: font, size, B/I/U/S, colour, highlight (HEX), alignment, bullets and numbering, indent, line spacing, and a styles gallery (Normal, Title, Headings, Quote)
- **Modify…** (or right-click a style) changes a style's font, size, colour, bold, italic, alignment and spacing in the document's styles; ticked styles are remembered in this browser and used when that style is applied in other documents
- Tab stops are laid out as in Word (left, centre, right, dot leaders), so a table of contents shows its dotted lines and page numbers; TOC entries keep the TOC style rather than the link style
- Enter starts a new paragraph; find and replace; word count; export PDF, .txt, .md, .html; **Save draft** keeps the edited document in this browser
- Insert text boxes, lines, arrows, rectangles and pen strokes on the page, saved as Word drawings; typing --> gives → and ==> gives ➜
- Only what changed is rewritten: a text-only edit keeps every run's formatting; headers and footers are not shown; old `.doc` files are not supported

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
| Excel to SVG | Sharp SVG charts in the team colours; Thai labels embedded (LINE Seed Sans TH) | Needs a tidy table; other fonts are only named in the SVG |
| Excel to Word table | Word table styles; copy into Word or download a real .docx; wide form sheets become readable question/answer blocks | Values only, formulas become results; very wide sheets cannot stay one table |
| PDF editing | Thai rich text boxes, highlights, shapes, drafts, full screen | Adds marks on top: cannot edit the PDF's own text or fill form fields; 12 MB limit |
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
public/js/view-tools.js             # zoom, full screen and icon buttons shared by the PDF, Excel and Word editors
public/css/view-tools.css           # their styles, and the HEX field
public/js/hex-color.js              # HEX entry beside every colour picker
public/js/word-table.js             # Excel to Word table with Word table styles
public/js/ribbon.js                 # ribbon (tabs + groups) for the Excel, Word and Markdown editors
public/js/gradient.js               # gradient fill for the charts (Gantt, Excel to SVG)
public/js/xlsx-core.js              # spreadsheet helpers: formats, styles, reference shifting, TEXT() fix
public/js/rich-text.js              # typed arrows and editing helpers
public/js/themes.js                 # appearance (light/dark/device) and chart colour themes
public/css/themes.css               # interface colours for light and dark
public/js/md-edit.js                # Markdown editor (marked + DOMPurify)
public/css/md-edit.css              # Markdown editor styles
public/js/xlsx-edit.js              # Excel editor (ExcelJS)
public/js/xlsx-relock.js            # puts sheet protection back after saving (from TUSUFinanceFeedback)
public/js/docx-edit.js              # Word editor (JSZip; edits word/document.xml only)
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
