/* Interface look: choose how the whole app is laid out and styled (Vorynth, macOS, Windows, Android, GNOME) and where the menu sits. */
(function () {
  const STYLES = [['aurora', 'Vorynth (default)'], ['macos', 'macOS'], ['windows', 'Windows 11'], ['android', 'Android (Material You)'], ['gnome', 'GNOME / Linux']];
  const NAVS = [['left', 'Menu on the left'], ['right', 'Menu on the right'], ['top', 'Menu on top']];
  const css = `
html[data-ui="macos"] { --radius: 12px; --font: -apple-system, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif; }
html[data-ui="macos"] .sidebar { background: color-mix(in srgb, var(--bg) 70%, transparent); backdrop-filter: blur(30px) saturate(1.6); border-right: 1px solid var(--border); }
html[data-ui="macos"] .nav-item { border-radius: 8px; padding-top: 6px; padding-bottom: 6px; }
html[data-ui="macos"] .nav-item:hover { transform: none; }
html[data-ui="macos"] .nav-item.active { background: var(--accent); color: #fff; }
html[data-ui="macos"] .nav-item.active::before { display: none; }
html[data-ui="macos"] .titlebar { padding-left: 82px; position: relative; }
html[data-ui="macos"] .titlebar::before { content: ""; position: absolute; left: 16px; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; box-shadow: 20px 0 #febc2e, 40px 0 #28c840; }
html[data-ui="macos"] .card { border-radius: 10px; box-shadow: none; }
html[data-ui="windows"] { --radius: 8px; --font: "Segoe UI Variable", "Segoe UI", "Inter", system-ui, sans-serif; }
html[data-ui="windows"] .sidebar { background: color-mix(in srgb, var(--bg) 85%, transparent); }
html[data-ui="windows"] .nav-item { border-radius: 6px; }
html[data-ui="windows"] .nav-item:hover { transform: none; }
html[data-ui="windows"] .nav-item.active { background: var(--surface-hover); }
html[data-ui="windows"] .nav-item.active::before { height: 16px; width: 3px; border-radius: 3px; }
html[data-ui="windows"] .card { border-radius: 4px; box-shadow: none; }
html[data-ui="windows"] .page-title { font-size: 24px; font-weight: 600; }
html[data-ui="android"] { --radius: 28px; --font: "Google Sans", "Roboto", "Inter", system-ui, sans-serif; }
html[data-ui="android"] .sidebar { padding-top: 8px; }
html[data-ui="android"] .nav-item { border-radius: 999px; padding: 10px 16px; }
html[data-ui="android"] .nav-item:hover { transform: none; }
html[data-ui="android"] .nav-item.active { background: color-mix(in srgb, var(--accent) 30%, transparent); }
html[data-ui="android"] .nav-item.active::before { display: none; }
html[data-ui="android"] .card { border-radius: 24px; padding: 18px 22px; box-shadow: none; border-color: transparent; background: var(--surface); }
html[data-ui="android"] .page-title { font-size: 34px; font-weight: 500; }
html[data-ui="android"] .search-btn { border-radius: 999px; padding: 12px 18px; }
html[data-ui="gnome"] { --radius: 12px; --font: "Cantarell", "Adwaita Sans", "Inter", system-ui, sans-serif; }
html[data-ui="gnome"] .sidebar { background: color-mix(in srgb, var(--bg) 92%, #000); }
html[data-ui="gnome"] .nav-item { border-radius: 8px; }
html[data-ui="gnome"] .nav-item:hover { transform: none; }
html[data-ui="gnome"] .nav-item.active::before { display: none; }
html[data-ui="gnome"] .card { border-radius: 12px; box-shadow: none; }
html[data-nav="right"] .shell { flex-direction: row-reverse; }
html[data-nav="top"] .shell { flex-direction: column; }
html[data-nav="top"] .sidebar { width: auto !important; min-width: 0 !important; flex-direction: row; flex-wrap: wrap; align-items: center; overflow-x: auto; overflow-y: hidden; padding: 0 12px 8px; border-right: 0; max-height: 130px; }
html[data-nav="top"] #nav { flex-direction: row; flex-wrap: wrap; }
html[data-nav="top"] .search-btn { min-width: 220px; }
html[data-nav="top"] .content { padding-left: 36px; }`;
  let st = document.getElementById('aurora-ui-css'); if (!st) { st = document.createElement('style'); st.id = 'aurora-ui-css'; document.head.append(st); } st.textContent = css;
  const okS = (v) => STYLES.some((s) => s[0] === v), okN = (v) => NAVS.some((s) => s[0] === v);
  window.auroraUI = { STYLES, NAVS, okS, okN, apply(ui, nav) { const r = document.documentElement; if (ui && ui !== 'aurora' && okS(ui)) r.dataset.ui = ui; else delete r.dataset.ui; if (nav && nav !== 'left' && okN(nav)) r.dataset.nav = nav; else delete r.dataset.nav; } };
})();
