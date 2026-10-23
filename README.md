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

## Project structure

```
public/index.html                   # the app page: Excel tools (inline) and the PDF tab
public/js/pdf-markup.js             # PDF editor module
public/css/markup.css               # PDF editor styles
public/fonts/LINESeedSansTH_Rg.ttf  # text box font (SIL Open Font License)
public/favicon.png                  # tab icon
firebase.json                       # Firebase Hosting config
.firebaserc                         # Firebase project: tusu-finance-team-tools
```

Libraries are loaded from CDNs: [SheetJS](https://sheetjs.com/) reads the Excel files, [Plotly](https://plotly.com/javascript/) draws the charts, and [pdf.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/) show and write PDFs. Fonts: LINE Seed Sans TH, plus Noto Sans Thai and Sarabun from Google Fonts.

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
