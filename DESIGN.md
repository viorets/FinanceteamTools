---
name: TUSU Finance Team Tools
description: Browser tools that turn the team's Excel, Word, PDF and Markdown files into finished outputs, without uploading them.
colors:
  deep-navy: "#1b4965"
  deep-navy-hover: "#24597a"
  tusu-teal: "#00758f"
  sky-accent: "#5fa8d3"
  lagoon-border: "#62b6cb"
  mist-tint: "#e6f2f8"
  morning-bg: "#f0f7fa"
  paper: "#ffffff"
  quiet-fill: "#eef5f8"
  slate-ink: "#3d5a6c"
  hairline: "#d5e3e9"
  alert-red: "#b3261e"
  alert-tint: "#fdecee"
  sheet-green: "#1a7f45"
  night-black: "#000000"
  night-surface: "#1c1c1e"
  night-raised: "#2c2c2e"
  night-ink: "#f5f5f7"
  night-ink-2: "#a1a1a6"
  night-border: "#38383a"
  night-border-strong: "#545458"
  night-alert: "#ff453a"
typography:
  headline:
    fontFamily: "Prompt, -apple-system, 'SF Pro Display', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Prompt, -apple-system, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Noto Sans Thai', 'Helvetica Neue', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
  ribbon-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Noto Sans Thai', system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1
  output:
    fontFamily: "'LINE Seed Sans TH', 'Noto Sans Thai', Sarabun, sans-serif"
    fontSize: "14px"
    fontWeight: 400
rounded:
  input: "4px"
  control: "8px"
  button: "10px"
  card: "12px"
  panel: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.button}"
    padding: "12px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.deep-navy-hover}"
  nav-item:
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.button}"
    padding: "10px 12px"
    height: "44px"
  nav-item-active:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.paper}"
  ribbon-button:
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.control}"
    size: "36px"
  ribbon-button-pressed:
    backgroundColor: "{colors.mist-tint}"
  ribbon-tab-selected:
    backgroundColor: "{colors.deep-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "4px 12px"
  input-field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.control}"
    height: "34px"
  chip-beta:
    backgroundColor: "{colors.mist-tint}"
    textColor: "{colors.deep-navy}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
  document-paper:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
---

# Design System: TUSU Finance Team Tools

## Overview

**Creative North Star: "The Glass Desk"**

The site is a desk. The tools (side navigation, options panels, editor toolbars, pop-ups) are sheets of frosted glass tinted with the team's CI, resting over a calm teal backdrop. The work itself (PDF pages, Word pages, Excel grids, charts, the Markdown preview) is solid white paper in the middle of the desk, in both light and dark mode, because that is what the output will look like in a report. The glass frames the paper; it never covers it.

The mood is calm and precise. Controls have soft 8–16px corners and quiet hairline borders, each panel has one strong primary action in Deep Navy, and the interface keeps its voice low so the document stays loudest. Density is that of an office tool: ribbons, groups and 36–40px icon buttons. Every control is still finger-sized on iPad.

Thai is first-class: Noto Sans Thai sits in every UI font stack, and output files use LINE Seed Sans TH. Dark mode is not a tinted navy; it is black and greys with white controls, in the manner of Apple's product pages.

**Key Characteristics:**
- Frosted, CI-tinted glass for the frame; solid white paper for every document and chart.
- One primary action per panel, in Deep Navy (light) or white (dark).
- Office-style ribbon toolbars that float over the document and stay in place in full screen.
- Soft, consistent corners: 8px controls, 10px buttons, 12px documents, 16px panels.
- Chart colour themes change chart values only, never the interface.

## Colors

A cool teal-and-navy palette with one CI accent; colour is rationed so the documents carry the colour.

### Primary
- **Deep Navy** (#1b4965): text and headings, primary buttons, the open navigation item, the selected ribbon tab. It is also the interface ink (light mode).
- **TUSU Teal** (#00758f): the team's CI colour (Mosaic Blue). It leads the default chart theme, the Format-as-table header, Markdown headings rules and table heads. It appears in outputs more than in the interface.

### Secondary
- **Sky Accent** (#5fa8d3): focus rings, text selection, secondary marks.
- **Lagoon Border** (#62b6cb): borders of inputs and panels that need to be seen (border-strong).

### Neutral
- **Morning Background** (#f0f7fa): the page behind the backdrop.
- **Paper** (#ffffff): documents, charts, inputs and the solid work area.
- **Quiet Fill** (#eef5f8): table heads, quiet fills, status bars.
- **Mist Tint** (#e6f2f8): hover and selected fills, pressed ribbon buttons, the beta chip.
- **Slate Ink** (#3d5a6c): secondary text, help text, ribbon group labels.
- **Hairline** (#d5e3e9): dividers and quiet borders.
- **Alert Red** (#b3261e) on **Alert Tint** (#fdecee): destructive actions and errors.

### Dark mode (Apple-like monochrome)
- **Night Black** (#000000) page, **Night Surface** (#1c1c1e) panels and inputs, **Night Raised** (#2c2c2e) hover and quiet fills.
- **Night Ink** (#f5f5f7) text and the primary button fill (with black text); **Night Ink 2** (#a1a1a6) secondary text.
- **Night Border** (#38383a) and **Night Border Strong** (#545458); **Night Alert** (#ff453a).

### Editor accents
- **Sheet Green** (#1a7f45): the Excel editor's selection outline, active cell and fill handle only, as in Excel.

### Named Rules
**The Paper Stays White Rule.** Documents, grids, charts and previews are white (#ffffff) in every appearance mode. Dark mode darkens the desk and the glass, never the paper.

**The Values-Only Theme Rule.** Chart colour themes (TUSU Finance and the 17 others) set chart, Gantt, Word-table and Format-as-table colours. They never recolour the interface tokens.

## Typography

**Display Font:** Prompt (with the system UI stack)
**Body Font:** System UI: SF Pro on Apple devices, Segoe UI on Windows (with Noto Sans Thai)
**Output Font:** LINE Seed Sans TH (with Noto Sans Thai and Sarabun) for charts, Gantt charts and PDF text boxes

**Character:** Prompt's geometric bold gives headings the Budget Pitching voice; the native system font keeps controls familiar on every device; Noto Sans Thai carries Thai at the same weight everywhere.

### Hierarchy
- **Headline** (700, 20px, Prompt, -0.01em): section titles inside tools ("Chart", "Tasks").
- **Title** (700, 15px, Prompt, 1.25): the brand line in the side navigation.
- **Body** (400, 15–16px, system, 1.5): navigation items, buttons, inputs. Inputs use 16px so iPad never zooms on focus.
- **Label** (700, 12px, system): form labels above fields, in Slate Ink.
- **Ribbon label** (400, 10.5px, system): the group name under each ribbon group.
- **Output** (400, LINE Seed Sans TH): text inside exported charts and PDFs; chosen per chart in the Chart font menu.

### Named Rules
**The 16px Input Rule.** Every text field, select and textarea is at least 16px so iPad Safari does not zoom when it is focused.

## Layout

A two-column app shell: a 240px glass side navigation, then the open tool. Each tool is an options panel (glass, 16px corners, 20px padding) beside a solid work area (white, 16px corners, 20px padding). Below 1280px the options panel stacks above the work area; below 900px the side navigation becomes a horizontal bar on top.

Editors (PDF, Excel, Word, Markdown) fill a fixed-height box (viewport minus 200px, at least 500px). Their toolbar floats 8px inside the top of the box, and the document scrolls under it. Full screen makes the box fill the browser window (not the browser's own full screen API), and the toolbar keeps zoom, Save draft, Download, Undo, Redo, Delete and Exit.

Spacing follows a 4px base: 4, 8, 12, 20, 24px. Ribbon groups are separated by 1px Hairline dividers with 8px side padding.

## Elevation & Depth

Depth comes from material, not stacked shadows: frosted glass (blur 16px, saturate 160%) with a 1px bright rim on its top edge and one soft ambient shadow, over a fixed backdrop of three blurred CI colour shapes. Paper sits flat on the desk with a light shadow. Without backdrop-filter support, or when the device asks for reduced transparency, glass becomes solid (#f4fafb light, #1c1c1e dark).

### Shadow Vocabulary
- **Glass ambient** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.85), 0 8px 32px rgba(0,45,55,.10), 0 1px 2px rgba(0,45,55,.06)`): every glass surface.
- **Work area** (`box-shadow: 0 8px 32px rgba(0,45,55,.08), 0 1px 2px rgba(0,45,55,.05)`): the solid tool area.
- **Page on desk** (`box-shadow: 0 2px 10px rgba(0,0,0,.15)`): Word and PDF pages inside an editor.
- **Focus ring** (`outline: 2px solid` Sky Accent, 2px offset): every focusable control.

### Named Rules
**The One Light Rule.** Light comes from the top: the only highlight is the 1px rim on the top edge of glass. No glows, no coloured shadows.

## Shapes

Soft, consistent rounding that grows with the size of the surface: 4px for small legacy inputs, 8px for controls, ribbon buttons and inputs, 10px for primary buttons and navigation items, 12px for documents, previews and pop-ups, 16px for panels and floating toolbars, and full pills for chips (beta, the brand subtitle). Borders are 1px.

## Components

### Buttons
- **Shape:** gently rounded (10px).
- **Primary:** Deep Navy fill, white 600-weight text, 12px padding, full width in options panels. Dark mode: white fill, black text.
- **Hover / Focus:** fill lightens to #24597a over 0.2s; 2px Sky Accent focus ring with 2px offset. Disabled at 45% opacity.
- **Secondary:** white fill, Deep Navy 1px border (Gantt buttons) or a quiet Hairline border.

### Ribbon (editor toolbar)
- **Signature component.** Tabs (Home, Insert, …) in a row; the selected tab is a Deep Navy pill. Under it, groups of 36px icon buttons (40px on touch screens) with a 10.5px group label.
- Buttons are transparent at rest, Mist Tint on hover, and Mist Tint with a 1px Lagoon inset ring when pressed (`aria-pressed`).
- Pressing a ribbon button never takes the focus or selection away from the document.
- Colour boxes always pair a swatch with a HEX field; dragging a swatch scrubs hue (left/right) and lightness (up/down).

### Navigation
- 44px rows, 10px corners, a 20px line icon and a 15px label in Deep Navy. Hover: Mist Tint. Open tool: Deep Navy fill with white text and 600 weight. "beta" is a Mist Tint pill.

### Inputs / Fields
- **Style:** white fill, 1px Lagoon border, 8px corners, 34px tall (40px on touch), 16px text.
- **Focus:** 2px Sky Accent ring.

### Cards / Containers
- **Options panel:** glass, 16px corners, 20px padding, scrolls on its own.
- **Work area / document:** white paper, 12–16px corners, Hairline border, work-area shadow.
- **Pop-ups and menus** (function help, filter menu, Format as table, Modify style, Download as): glass, 12–14px corners, 6–12px padding, 40px menu rows.

### Chips
- **Beta:** Mist Tint pill, 11px text; on the active navigation item it turns white at 20% opacity.

## Do's and Don'ts

### Do:
- **Do** keep every document, grid, chart and preview on white paper (#ffffff) in both modes.
- **Do** use one Deep Navy primary button per panel; everything else is quiet.
- **Do** put new editor actions in the floating ribbon, so they also work in full screen.
- **Do** give every control a 2px Sky Accent focus ring and at least 40px of touch target on iPad.
- **Do** pair every colour picker with a HEX field.
- **Do** use LINE Seed Sans TH (or the chosen chart font) for text that goes into an output file.

### Don't:
- **Don't** let chart colour themes recolour the interface.
- **Don't** tint dark mode navy: it is black, greys and white controls.
- **Don't** use the browser's own full-screen API (Edge's scareware blocker flags it); fill the window instead.
- **Don't** add glows, coloured shadows or gradient text; depth comes from the glass and one ambient shadow.
- **Don't** set inputs smaller than 16px.
