# TUSU Finance Team Tools

Browser-based data tools for the TUSU finance team. Upload an Excel file and turn it into a chart or a Word-ready table. Everything runs in the browser, so nothing is uploaded to a server.

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

## Project structure

```
public/index.html   # the whole app (HTML, CSS, JS in one file)
public/favicon.png  # tab icon
firebase.json       # Firebase Hosting config
.firebaserc         # Firebase project: tusu-finance-team-tools
```

Libraries are loaded from CDNs: [SheetJS](https://sheetjs.com/) reads the Excel files, [Plotly](https://plotly.com/javascript/) draws the charts, and the font is LINE Seed Sans TH.

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
