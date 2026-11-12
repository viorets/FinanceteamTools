// Appearance and chart colour themes.
// - Appearance (Light, Dark, Follow device) sets <html data-mode>; css/themes.css holds the interface colours. A
//   one-line script in index.html's <head> applies the saved choice before the page draws.
// - Chart colour themes (theme-factory) set colour values only: the Excel to SVG presets and series colours, the
//   Gantt group colours and today line. Changing one fires a 'site-theme' event on window with the theme.
// UI themes per theme-factory theme are on hold (plan doc, "UI themes (on hold)" tab).
const THEME_KEY = 'site-theme'; const MODE_KEY = 'site-mode';
// The chart colours a new visitor gets (and the one not stored): TUSU Finance CI, the internal deck's teals.
const DEFAULT_THEME = 'tusu-ci';
// "Use for the whole site": the chart colour theme also colours the interface (page, panels, text, borders, buttons).
// The CSS is kept so the one-line script in index.html's <head> paints it before the page draws.
const UI_KEY = 'site-ui-theme'; const UI_CSS = 'site-ui-css';
const CI_THEMES = ['default', 'tusu-ci']; // the site's own colours are the CI: these two need no generated set
// chart: series colours, in the order they are handed out; presets: the five swatches beside a colour box (default: the
// first five chart colours); ink: chart text and lines (charts are white paper); today: the Gantt today line.
export const THEMES = [
  // TUSU Finance: the team's CI, Mosaic Blue #00758F with its tints, tones, shades and hue steps (Dashboard CI).
  { id: 'default', name: 'TUSU Finance', chart: ['#00758f', '#002d37', '#80b9c6', '#414b4f', '#005c8f', '#b1d4dd', '#00898d', '#4d9fb1'], presets: ['#00758f', '#014555', '#4d9fb1', '#9bc7cf', '#cbe2e9'], ink: '#002d37', today: '#d1495b' },
  // TUSU Finance CI: the colours of the team's internal deck (ข้อมูลภายใน.pdf, Canva): deep teal #006371, teals #077989 /
  // #0097b2, cyan #2babc2, muted teal #5f9aa3, ice #e8f9ff, ink #1d1d1f, the orange note colour #c25b00 for the today
  // line and the deck's lime highlight #c1ff72 last (it barely shows on white).
  { id: 'tusu-ci', name: 'TUSU Finance CI', chart: ['#006371', '#2babc2', '#077989', '#5f9aa3', '#0097b2', '#1d1d1f', '#c1ff72'], presets: ['#006371', '#077989', '#2babc2', '#5f9aa3', '#e8f9ff'], ink: '#1d1d1f', today: '#c25b00' },
  // The team's own palettes (10 Nov 2026). Series go dark, mid, light in turn so neighbours stay apart; the near-white
  // colours come last because they barely show on white paper. presets = the palette as given.
  { id: 'sakura-dusk', name: 'Sakura Dusk', chart: ['#16131f', '#806c79', '#c1a0ac', '#4a3f4b', '#f0d9e4'], presets: ['#16131f', '#f0d9e4', '#c1a0ac', '#4a3f4b', '#806c79'], ink: '#16131f', today: '#d1495b' },
  { id: 'midnight-violet', name: 'Midnight Violet', chart: ['#3e4b8e', '#3d1534', '#a6bcc9', '#f6e0b6', '#fff4eb'], presets: ['#fff4eb', '#f6e0b6', '#a6bcc9', '#3e4b8e', '#3d1534'], ink: '#3d1534', today: '#d1495b' },
  { id: 'old-rose', name: 'Old Rose', chart: ['#db7f8e', '#604d53', '#9da3a4', '#d5c5c8', '#ffdbda'], presets: ['#ffdbda', '#db7f8e', '#d5c5c8', '#9da3a4', '#604d53'], ink: '#604d53', today: '#b3261e' },
  { id: 'mulled-wine', name: 'Mulled Wine', chart: ['#553758', '#d09db8', '#2b1f21', '#423048', '#fceffa'], presets: ['#fceffa', '#d09db8', '#553758', '#423048', '#2b1f21'], ink: '#2b1f21', today: '#d1495b' },
  { id: 'winter-dawn', name: 'Winter Dawn', chart: ['#525871', '#cd9fa0', '#857c91', '#f2c1a3', '#f8ccaa'], presets: ['#525871', '#857c91', '#cd9fa0', '#f2c1a3', '#f8ccaa'], ink: '#525871', today: '#d1495b' },
  { id: 'autumn-harvest', name: 'Autumn Harvest', chart: ['#743014', '#9d9167', '#442d1c', '#84592b', '#e8d1a7'], presets: ['#442d1c', '#743014', '#84592b', '#9d9167', '#e8d1a7'], ink: '#442d1c', today: '#d1495b' },
  { id: 'kombu-moss', name: 'Kombu Moss', chart: ['#354024', '#889063', '#4c3d19', '#cfbb99', '#e5d7c4'], presets: ['#4c3d19', '#354024', '#889063', '#cfbb99', '#e5d7c4'], ink: '#354024', today: '#d1495b' },
  { id: 'ocean-depths', name: 'Ocean Depths', chart: ['#1a2332', '#2d8b8b', '#a8dadc', '#457b9d', '#e9c46a', '#c0392b', '#6c8ea0'], ink: '#1a2332', today: '#c0392b' },
  { id: 'arctic-frost', name: 'Arctic Frost', chart: ['#4a6fa5', '#1a1a2e', '#a8d8ea', '#5c7a99', '#c0c0c0', '#7fb3d5', '#e07a5f'], ink: '#1a1a2e', today: '#e74c3c' },
  { id: 'botanical-garden', name: 'Botanical Garden', chart: ['#4a7c59', '#f9a620', '#b7472a', '#8fbc8f', '#8b7355', '#ffb7c5', '#2d2a26'], ink: '#2d2a26', today: '#b7472a' },
  { id: 'desert-rose', name: 'Desert Rose', chart: ['#5d2e46', '#c67a5c', '#d4a5a5', '#b87d6d', '#d2b48c', '#7a9e7e', '#3d2b24'], ink: '#3d2b24', today: '#b54a3a' },
  { id: 'forest-canopy', name: 'Forest Canopy', chart: ['#2d5016', '#6b8e23', '#a4ac86', '#8b7355', '#7d8471', '#c8a96e', '#a63d2f'], ink: '#2d2d2d', today: '#a63d2f' },
  { id: 'golden-hour', name: 'Golden Hour', chart: ['#cc5500', '#f4a900', '#8b0000', '#c1666b', '#d4b896', '#4a403a', '#6b8e23'], ink: '#2b1810', today: '#8b0000' },
  { id: 'modern-minimalist', name: 'Modern Minimalist', chart: ['#2c2c2c', '#6c757d', '#a9a9a9', '#36454f', '#708090', '#c0c0c0', '#dc3545'], ink: '#2c2c2c', today: '#dc3545' },
  { id: 'sunset-boulevard', name: 'Sunset Boulevard', chart: ['#264653', '#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#ff6b6b', '#ffa07a'], ink: '#264653', today: '#d32f2f' },
  { id: 'midnight-galaxy', name: 'Midnight Galaxy', chart: ['#4169e1', '#a490c2', '#ffd700', '#4a4e8f', '#2d1b69', '#9a94b8', '#ef5350'], ink: '#0d0d1a', today: '#ef5350' },
  { id: 'tech-innovation', name: 'Tech Innovation', chart: ['#0066ff', '#00a8a8', '#39b54a', '#1e1e2e', '#ffaa00', '#8888a0', '#ff4444'], ink: '#1e1e2e', today: '#ff4444' },
];
// Fonts for chart text (Excel to SVG, Gantt Chart Creator). LINE Seed Sans TH comes from fonts/; Noto Sans Thai,
// Sarabun and Prompt from Google Fonts (index.html); Georgia and Arial from the system.
export const CHART_FONTS = ['LINE Seed Sans TH', 'Noto Sans Thai', 'Sarabun', 'Prompt', 'Georgia', 'Arial'];
export const fontStack = (f) => `'${f}', 'Noto Sans Thai', sans-serif`;
const byId = (id) => THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME);
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not kept */ } };
export const presetsOf = (t) => t.presets || t.chart.slice(0, 5);

export function currentTheme() { return byId(read(THEME_KEY) || DEFAULT_THEME); }
export function setTheme(id) {
  const t = byId(id); write(THEME_KEY, t.id === DEFAULT_THEME ? null : t.id);
  window.dispatchEvent(new CustomEvent('site-theme', { detail: t }));
  return t;
}

// Appearance: 'light' (default), 'dark' or 'auto' (follow the device).
export function currentMode() { const m = read(MODE_KEY); return m === 'dark' || m === 'auto' ? m : 'light'; }
// The browser's own bars (iPad Safari, installed web app) take the page colour.
function syncMeta() { const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f0f7fa'; }
export function setMode(mode) {
  if (mode === 'light') delete document.documentElement.dataset.mode; else document.documentElement.dataset.mode = mode;
  write(MODE_KEY, mode === 'light' ? null : mode); syncMeta();
}

// ---------- the chart theme over the whole site ----------
// The interface colours come from the theme's strongest colour (its hue and saturation) and a second colour for
// accents, at fixed lightness levels chosen like the CI's, so text keeps its contrast in light and dark with any
// palette (a grey palette gives greys). Written as a stylesheet with the same selectors as css/themes.css.
const hsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [(h + 360) % 360, s, l];
};
export function uiCss(t) {
  const cols = t.chart.map((c) => ({ c, hsl: hsl(c) }));
  // the key: the palette's lead colour (the first that is not grey); the accent: the next colour of another hue (or
  // the key). Palettes list their own colours first and warning colours (reds) last, so order is the safest guide.
  const key = cols.find((x) => x.hsl[1] >= 0.12) || cols[0];
  const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const other = cols.find((x) => x !== key && x.c.toLowerCase() !== (t.today || '').toLowerCase() && x.hsl[1] > 0.15 && hueGap(x.hsl[0], key.hsl[0]) > 18) || key; // not the warning colour (the Gantt today line)
  const h = Math.round(key.hsl[0]); const s = Math.min(key.hsl[1], 0.7); const ha = Math.round(other.hsl[0]); const sa = Math.min(other.hsl[1], 0.75);
  const c = (hh, ss, l, a) => (a == null ? `hsl(${hh} ${Math.round(ss * 100)}% ${l}%)` : `hsl(${hh} ${Math.round(ss * 100)}% ${l}% / ${a})`);
  const light = {
    '--bg': c(h, s * 0.5, 96), '--surface': '#ffffff', '--surface-2': c(h, s * 0.4, 94), '--ink': c(h, s * 0.8, 22), '--ink-2': c(h, s * 0.3, 34),
    '--primary': c(h, s, 28), '--primary-hover': c(h, s, 33), '--primary-text': c(h, s * 0.8, 24), '--on-primary': '#ffffff',
    '--accent': c(ha, sa, 50), '--tint': c(h, s * 0.6, 92), '--border': c(h, s * 0.3, 86), '--border-strong': c(h, s * 0.5, 62),
    '--primary-fill': `linear-gradient(100deg, ${c(h, s, 26)}, ${c(ha, sa, 28)})`, '--primary-glow': c(h, s, 30, 0.32),
    '--title-grad': `linear-gradient(90deg, ${c(h, s, 26)}, ${c(ha, sa, 40)})`,
    '--glass-tint': `linear-gradient(135deg, rgba(255, 255, 255, .74), ${c(h, s * 0.5, 92, 0.58)})`, '--glass-solid': c(h, s * 0.4, 97),
    '--backdrop': `radial-gradient(42vmax 42vmax at 8% 6%, ${c(h, s, 40, 0.22)}, transparent 70%), radial-gradient(38vmax 38vmax at 92% 42%, ${c(ha, sa, 50, 0.22)}, transparent 70%), radial-gradient(46vmax 36vmax at 40% 108%, ${c(h, s, 25, 0.14)}, transparent 70%), linear-gradient(160deg, ${c(h, s * 0.4, 97)}, ${c(h, s * 0.4, 92)} 45%, ${c(h, s * 0.5, 84)})`,
  };
  const dark = {
    '--bg': c(h, s * 0.5, 6), '--surface': c(h, s * 0.25, 12), '--surface-2': c(h, s * 0.3, 15), '--ink': c(h, s * 0.15, 94), '--ink-2': c(h, s * 0.12, 68),
    '--primary': c(h, s, 27), '--primary-hover': c(h, s, 32), '--primary-text': c(ha, sa * 0.9, 75), '--on-primary': '#ffffff',
    '--accent': c(ha, sa, 62), '--tint': c(ha, sa, 62, 0.12), '--border': c(h, s * 0.5, 75, 0.14), '--border-strong': c(h, s * 0.4, 25),
    '--primary-fill': `linear-gradient(100deg, ${c(h, s, 26)}, ${c(ha, sa, 28)})`, '--primary-glow': c(h, s, 40, 0.32),
    '--title-grad': `linear-gradient(90deg, ${c(ha, sa, 62)}, ${c(ha, sa * 0.8, 82)})`,
    '--glass-tint': `linear-gradient(135deg, ${c(h, s * 0.25, 12, 0.72)}, ${c(h, s * 0.25, 9, 0.64)})`, '--glass-solid': c(h, s * 0.25, 12),
    '--glass-bar-tint': `linear-gradient(135deg, ${c(h, s * 0.25, 9, 0.94)}, ${c(h, s * 0.25, 9, 0.9)})`, '--glass-border': c(h, s * 0.5, 75, 0.14),
    '--backdrop': `radial-gradient(45vmax 40vmax at 8% 8%, ${c(h, s, 45, 0.11)}, transparent 70%), radial-gradient(40vmax 35vmax at 92% 12%, ${c(ha, sa, 55, 0.07)}, transparent 70%), radial-gradient(45vmax 45vmax at 85% 92%, ${c(h, s, 35, 0.12)}, transparent 70%), linear-gradient(180deg, ${c(h, s * 0.5, 8)}, ${c(h, s * 0.5, 6)})`,
  };
  const block = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v};`).join(' ');
  return `:root { ${block(light)} }\n:root[data-mode="dark"] { ${block(dark)} }\n@media (prefers-color-scheme: dark) { :root[data-mode="auto"] { ${block(dark)} } }`;
}
export const siteWide = () => read(UI_KEY) === '1';
// Paint (or clear) the whole-site colours for theme t, and keep the CSS for the next page load.
export function applySiteWide(t = currentTheme()) {
  const css = siteWide() && !CI_THEMES.includes(t.id) ? uiCss(t) : '';
  let el = document.getElementById('uiTheme');
  if (css) { if (!el) { el = document.createElement('style'); el.id = 'uiTheme'; document.head.append(el); } el.textContent = css; } else el?.remove();
  write(UI_CSS, css || null); syncMeta();
}
export function setSiteWide(on) { write(UI_KEY, on ? '1' : null); applySiteWide(); }

// Side navigation controls: Appearance radio buttons, and the chart colour themes shown as colour strips only (the
// name is in each option's tooltip and read out by screen readers). The strips sit in a <details> that opens a grid.
export function viewControls(modeGroup, chartPick, wholeSite = null) {
  modeGroup.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.checked = r.value === currentMode();
    r.addEventListener('change', () => { if (r.checked) setMode(r.value); });
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncMeta);
  const strip = (t) => `<span class="strip" aria-hidden="true">${t.chart.slice(0, 6).map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
  const now = chartPick.querySelector('.chart-now'); const grid = chartPick.querySelector('.chart-grid'); const sum = chartPick.querySelector('summary');
  grid.innerHTML = THEMES.map((t) => `<label class="chart-opt" title="${t.name}"><input type="radio" name="chartTheme" value="${t.id}" aria-label="${t.name}">${strip(t)}</label>`).join('');
  const show = (t) => {
    now.innerHTML = strip(t); sum.setAttribute('aria-label', `Chart colours: ${t.name}`); sum.title = t.name;
    grid.querySelectorAll('input').forEach((i) => { i.checked = i.value === t.id; });
  };
  show(currentTheme()); applySiteWide();
  grid.addEventListener('change', (e) => { const t = setTheme(e.target.value); show(t); applySiteWide(t); chartPick.open = false; sum.focus(); });
  if (wholeSite) { wholeSite.checked = siteWide(); wholeSite.addEventListener('change', () => setSiteWide(wholeSite.checked)); }
  // Close on Escape or a click elsewhere.
  document.addEventListener('click', (e) => { if (chartPick.open && !chartPick.contains(e.target)) chartPick.open = false; });
  chartPick.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chartPick.open) { chartPick.open = false; sum.focus(); } });
}
