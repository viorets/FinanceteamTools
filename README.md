# TUSU Finance Team Tools

Browser-based data tools for the TUSU finance team. Turn an Excel file into a chart or a Word-ready table, or mark up a PDF. Everything runs in the browser, so nothing is uploaded to a server.

**Website:** https://tusu-finance-team-tools.web.app

## Tools

### Excel to SVG
- Upload an `.xlsx` / `.xls` file and pick a chart type
- Choose the grouping field (X axis) and up to two value fields (the second one is drawn over the first)
- Set colors, data label position, label and legend font size and color, and dashed X-axis gridlines
- Filter the rows, then export the chart as **SVG**

### Excel to Word table
- Upload an Excel file and pick the sheet
- Optionally use the first row as the header
- **Copy** the table to paste into Word, or **download** it as a `.doc` file

### PDF editing
- Upload a PDF (up to 12 MB)
- Tools: text box (Thai supported; LINE Seed Sans TH, Noto Sans Thai or Sarabun), highlight text, draw, line, arrow, rectangle
- Hold Shift for straight lines and squares; select a mark to move it, change its width or colour, or delete it; undo/redo with Ctrl+Z / Ctrl+Y
- **Save draft** keeps your marks on this device (browser storage) so you can reopen the same file later
- **Download PDF** saves a marked copy (`<name> (marked).pdf`); the original file is never changed

The editor comes from [TUSUFinanceFeedback](https://github.com/viorets/TUSUFinanceFeedback) (`public/js/markup/pdf-markup.js`).

### Excel editing (beta)
- Upload an `.xlsx` and pick a sheet: cells show their own fonts, colours, borders, number formats, row heights and column widths
- Click a cell to edit it (type `=` for a formula; Enter moves down, Esc cancels)
- Keeps styles, formulas, merged cells, dropdowns, column widths and sheet protection; on a protected sheet, locked cells stay read-only
- Charts, images and pivot tables are **not** kept
- Formulas calculate live as you edit (totals update straight away), and the formula bar shows the picked cell's formula and result, locked cells included
- Excel also recalculates every formula when it opens the downloaded `<name> (edited).xlsx`

### Word editing (beta)
- Upload a `.docx`: it is shown as a page with its own fonts, colours, numbered lists, tables and images
- Click any paragraph or table cell to change its text; formatting around the edit is kept, and new text takes the style of the text before it
- Select text to change its font, size or colour (Thai text included)
- Add text boxes, lines and arrows (saved as real Word shapes); click a shape to move, resize, recolour or delete it. Shapes and text boxes already in the file are shown too, and their text can be edited
- Undo / Redo (Ctrl+Z / Ctrl+Y) for formatting and shape changes; typing is undone by the browser
- Only `word/document.xml` changes: styles, headers, footers, images and page layout stay exactly as they were
- Headers and footers are not shown or editable yet. Shapes are placed from their paragraph, as the page has no page breaks; shapes Word placed from the page edge are shown at their paragraph until moved
- Old `.doc` files are not supported

## Project structure

```
public/index.html                   # the app page: Excel tools (inline) and the PDF, Excel and Word editing tabs
public/js/pdf-markup.js             # PDF editor module
public/css/markup.css               # PDF editor styles
public/js/xlsx-edit.js              # Excel editor (ExcelJS)
public/js/xlsx-relock.js            # puts sheet protection back after saving (from TUSUFinanceFeedback)
public/js/docx-edit.js              # Word editor (JSZip; edits word/document.xml only)
public/css/office-edit.css          # Excel and Word editor styles
public/fonts/LINESeedSansTH_Rg.ttf  # text box font (SIL Open Font License)
public/favicon.png                  # tab icon
firebase.json                       # Firebase Hosting config
.firebaserc                         # Firebase project: tusu-finance-team-tools
```

Libraries are loaded from CDNs: [SheetJS](https://sheetjs.com/) reads the Excel files, [Plotly](https://plotly.com/javascript/) draws the charts, [pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/) show and write PDFs, [ExcelJS](https://github.com/exceljs/exceljs) and [JSZip](https://stuk.github.io/jszip/) edit Excel and Word files, and [HyperFormula](https://hyperformula.handsontable.com/) calculates Excel formulas (used under its GPL-3.0 licence). Fonts: LINE Seed Sans TH, plus Noto Sans Thai and Sarabun from Google Fonts.

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
