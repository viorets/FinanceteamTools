# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- TUSU finance team members, who make charts, Word-ready tables and marked-up PDFs for reports, budget pitching and feedback rounds.
- Other TUSU members and committees, who receive, review or reuse those outputs.
- Daily personal use: noting class PDFs (lecture slides, readings) with text boxes, highlights and drawings.

## Product Purpose

A set of browser tools that turn the team's own files into finished outputs without uploading them anywhere: Excel to chart (SVG), Excel to Word table, PDF markup, light Excel and Word editing, and Gantt/timeline charts. Success: an output that drops straight into a report or deck, made in minutes, with Thai text correct.

## Positioning

Everything runs in the browser: files never leave the device, there is no account, and Thai shaping is right in every output (Thai fonts, correct vowel and tone mark placement in exported PDFs).

## Operating Context

- Used on PC, laptop and iPad (iPad Air 4 up to the current iPad Pro), with mouse, trackpad, touch, Apple Pencil and keyboard. Every feature is checked on all of these before it is called done (see the Claude Docs plan, "Device framework" tab).
- Outputs go into Word reports, PowerPoint/Canva decks, and LINE chats.
- Inputs: Excel workbooks, Word documents, PDFs (some are scans with no text layer).

## Capabilities and Constraints

- Static site on Firebase Hosting (`public/`), plain HTML, CSS and ES modules; libraries from CDNs (SheetJS, Plotly, pdf.js, pdf-lib, ExcelJS, JSZip, HyperFormula).
- Oldest supported browser: Safari 15.4 (iPadOS 15.4).
- Limits: PDF 12 MB; Excel grid shows up to 1000 rows × 60 columns.
- Gantt Chart Creator: tasks typed into a table on the page, or loaded from an Excel sheet; export as PNG (with or without background) or SVG.
- Labels are in English; Thai content is fully supported.

## Brand Commitments

- Name: TUSU Finance Team Tools (page heading "TUSU: Finance team | Data Tools").
- Fonts in use: LINE Seed Sans TH (UI and charts), Noto Sans Thai and Sarabun.
- Chart theme colours in use: #1b4965, #5fa8d3, #62b6cb, #bee9e8, #cae9ff.

## Evidence on Hand

No testimonials, usage numbers or case studies exist; none should be invented.

## Product Principles

1. Files stay on the device.
2. Thai is first-class: what you see on screen is what the exported file shows.
3. One job per tool, finished in minutes; outputs are ready to paste.
4. Works the same with a mouse, a finger or an Apple Pencil.
