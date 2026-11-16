/* Customize everything: fonts, colours, corners, background, sidebar names, icons and order, and your own CSS. Saved on this PC, can be exported and imported. */
{
  const FONTS = [['Default', ''], ['Arial', 'Arial, Helvetica, sans-serif'], ['Verdana', 'Verdana, Geneva, sans-serif'], ['Trebuchet', '"Trebuchet MS", sans-serif'], ['Tahoma', 'Tahoma, sans-serif'], ['Georgia (serif)', 'Georgia, "Times New Roman", serif'], ['Code font', '"Cascadia Mono", Consolas, "Courier New", monospace'], ['Comic', '"Comic Sans MS", cursive']];
  const DEF = { font: '', accent: '', radius: 0, sidebar: 0, ui: 'aurora', nav: 'left', bg: { on: false, a: '#0b1020', b: '#1b2a50', angle: 160 }, names: {}, order: [], css: '' };
  const hex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  const cleanCss = (s) => String(s || '').slice(0, 20000).replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?\s*(?:https?:|file:|javascript:|\/\/)[^)]*\)/gi, 'none').replace(/<\/?style/gi, '');
  /* pure: turn anything (including a pasted file) into a safe settings object */
  const sanitize = (v) => {
    const o = JSON.parse(JSON.stringify(DEF)); if (!v || typeof v !== 'object') return o;
    if (typeof v.font === 'string' && /^[\w ,"'\-]{0,120}$/.test(v.font)) o.font = v.font;
    if (hex(v.accent)) o.accent = v.accent.toLowerCase();
    o.radius = v.radius ? num(v.radius, 0, 40, 0) : 0; o.sidebar = v.sidebar ? num(v.sidebar, 180, 420, 0) : 0;
    if (window.auroraUI && window.auroraUI.okS(v.ui)) o.ui = v.ui; if (window.auroraUI && window.auroraUI.okN(v.nav)) o.nav = v.nav;
    if (v.bg && typeof v.bg === 'object') { o.bg.on = v.bg.on === true; if (hex(v.bg.a)) o.bg.a = v.bg.a; if (hex(v.bg.b)) o.bg.b = v.bg.b; o.bg.angle = num(v.bg.angle, 0, 360, 160); }
    if (v.names && typeof v.names === 'object') for (const k of Object.keys(v.names).slice(0, 60)) { if (!/^[a-z0-9-]{1,30}$/.test(k)) continue; const n = v.names[k]; if (!n || typeof n !== 'object') continue; const t = typeof n.t === 'string' ? n.t.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').slice(0, 30).trim() : ''; const i = typeof n.i === 'string' ? Array.from(n.i).slice(0, 2).join('') : ''; if (t || i) o.names[k] = { t, i }; }
    if (Array.isArray(v.order)) o.order = v.order.filter((x) => typeof x === 'string' && /^[a-z0-9-]{1,30}$/.test(x)).slice(0, 60);
    o.css = cleanCss(v.css); return o;
  };
  const orderPages = (list, order) => { const idx = new Map(order.map((id, i) => [id, i])); const base = new Map(list.map((p, i) => [p.id, i])); return list.slice().sort((a, b) => { const x = idx.has(a.id) ? idx.get(a.id) : 1e6 + base.get(a.id), y = idx.has(b.id) ? idx.get(b.id) : 1e6 + base.get(b.id); return x - y; }); };
  const get = () => sanitize(prefs.get('custom'));
  const save = (patch) => { prefs.set('custom', sanitize({ ...get(), ...patch })); apply('order' in patch ? 'rebuild' : 'labels'); };
  const ORIG = new Map(); const origOf = (p) => { if (!ORIG.has(p.id)) ORIG.set(p.id, { t: p.title, i: p.icon }); return ORIG.get(p.id); };
  const allPages = () => (window.auroraExtras ? window.auroraExtras.allPages() : PAGES);
  window.auroraCustomOrder = () => { const c = get(); for (const p of allPages()) { const o = origOf(p), n = c.names[p.id]; p.title = (n && n.t) || o.t; p.icon = (n && n.i) || o.i; } if (c.order.length) { const sorted = orderPages(PAGES, c.order); PAGES.length = 0; PAGES.push(...sorted); } };
  /* rename in place: rebuilding the sidebar while you are clicking in it would swallow the click */
  function refreshLabels() { const nav = document.getElementById('nav'); if (!nav) return; for (const p of PAGES) { const b = nav.querySelector(`[data-page="${p.id}"]`); if (!b) continue; b.title = p.title; const ico = b.querySelector('.ico'); if (ico) ico.textContent = p.icon; const lab = b.children[1]; if (lab) lab.textContent = p.title; } }
  function apply(mode) {
    const c = get(), r = document.documentElement;
    r.style.setProperty('--font', c.font || ''); if (!c.font) r.style.removeProperty('--font');
    if (c.accent) { applyAccent(c.accent); prefs.set('accent', c.accent); }
    if (c.radius) r.style.setProperty('--radius', c.radius + 'px'); else r.style.removeProperty('--radius');
    if (window.auroraUI) window.auroraUI.apply(c.ui, c.nav);
    const sb = document.querySelector('.sidebar'); if (sb) { sb.style.width = c.sidebar ? c.sidebar + 'px' : ''; sb.style.minWidth = c.sidebar ? c.sidebar + 'px' : ''; }
    if (c.bg.on) { r.style.setProperty('--custom-bg', `linear-gradient(${c.bg.angle}deg, ${c.bg.a}, ${c.bg.b})`); r.dataset.customBg = '1'; } else { r.style.removeProperty('--custom-bg'); delete r.dataset.customBg; }
    let st = document.getElementById('aurora-custom-css'); if (!st) { st = document.createElement('style'); st.id = 'aurora-custom-css'; document.head.append(st); }
    st.textContent = 'html[data-custom-bg] body { background: var(--custom-bg) !important; }\n' + c.css;
    window.auroraCustomOrder(); if (mode === 'labels') refreshLabels(); else if (typeof renderNav === 'function') renderNav();
  }
  window.auroraCustom = { sanitize, orderPages, cleanCss, get, FONTS, DEF };
  apply();

  CUSTOM.customize = (box) => {
    box.style.gap = '12px';
    const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
    const card = (t, sub) => { const c = el('div', 'card cz-card'); c.append(el('b', '', t)); if (sub) c.append(el('div', 'muted', sub)); box.append(c); return c; };
    const row = (...k) => { const r = el('div', 'savebar'); r.append(...k); return r; };
    const inp = (type, val, w) => { const i = el('input', 'filter'); i.type = type; i.value = val; i.style.margin = '0'; if (w) i.style.width = w; return i; };
    const draw = () => {
      box.replaceChildren(); const c = get();
      { const k = card('Font and colour', 'Pick a font and an exact accent colour.'); const sel = el('select', 'filter'); sel.style.margin = '0'; FONTS.forEach(([n, v]) => sel.append(new Option(n, v))); sel.value = FONTS.some((f) => f[1] === c.font) ? c.font : ''; sel.onchange = () => { save({ font: sel.value }); };
        const acc = inp('color', c.accent || '#4cc2ff', '60px'); acc.dataset.cz = 'accent'; acc.onchange = () => save({ accent: acc.value }); const hx = inp('text', c.accent, '110px'); hx.placeholder = '#4cc2ff'; hx.dataset.cz = 'accent-hex'; hx.onchange = () => { if (!hex(hx.value)) return toast('Type a colour like #4cc2ff', true); save({ accent: hx.value }); draw(); };
        k.append(row(el('span', 'muted', 'Font'), sel), row(el('span', 'muted', 'Accent colour'), acc, hx, B('Back to default', '', () => { prefs.set('custom', sanitize({ ...get(), accent: '' })); prefs.set('accent', ACCENTS[0]); applyAccent(ACCENTS[0]); draw(); }))); }
      { const k = card('App look and layout', 'Make the whole app look like macOS, Windows, Android or GNOME, and move the menu.'); const us = el('select', 'filter'); us.style.margin = '0'; us.dataset.cz = 'ui'; window.auroraUI.STYLES.forEach(([v, n]) => us.append(new Option(n, v))); us.value = c.ui; us.onchange = () => save({ ui: us.value }); const ns = el('select', 'filter'); ns.style.margin = '0'; ns.dataset.cz = 'nav'; window.auroraUI.NAVS.forEach(([v, n]) => ns.append(new Option(n, v))); ns.value = c.nav; ns.onchange = () => save({ nav: ns.value });
        k.append(row(el('span', 'muted', 'Style'), us), row(el('span', 'muted', 'Menu position'), ns)); }
      { const k = card('Shape and size'); const rad = inp('range', c.radius || 14); rad.min = 0; rad.max = 40; rad.dataset.cz = 'radius'; rad.onchange = () => save({ radius: Number(rad.value) }); const sbw = inp('range', c.sidebar || 260); sbw.min = 180; sbw.max = 420; sbw.dataset.cz = 'sidebar'; sbw.onchange = () => save({ sidebar: Number(sbw.value) });
        k.append(row(el('span', 'muted', 'Corner roundness'), rad, B('Default', '', () => { save({ radius: 0 }); draw(); })), row(el('span', 'muted', 'Sidebar width'), sbw, B('Default', '', () => { save({ sidebar: 0 }); draw(); }))); }
      { const k = card('Background', 'Replace the background with your own two-colour gradient.'); const on = el('input'); on.type = 'checkbox'; on.checked = c.bg.on; on.dataset.cz = 'bg-on'; const a = inp('color', c.bg.a, '60px'), b = inp('color', c.bg.b, '60px'); const ang = inp('range', c.bg.angle); ang.min = 0; ang.max = 360;
        const upd = () => save({ bg: { on: on.checked, a: a.value, b: b.value, angle: Number(ang.value) } }); [on, a, b, ang].forEach((x) => { x.onchange = upd; }); a.dataset.cz = 'bg-a'; b.dataset.cz = 'bg-b'; k.append(row(el('label', 'row', ''), on, el('span', '', ' Use my background'), a, b, el('span', 'muted', 'Angle'), ang)); }
      { const k = card('Sidebar names, icons and order', 'Rename any page, give it your own emoji, and move it up or down.'); const pages = PAGES.slice(); const list = el('div', 'cz-list');
        pages.forEach((p, i) => { const o = origOf(p), n = c.names[p.id] || {}; const r = el('div', 'cz-row'); r.dataset.page = p.id; const ic = inp('text', n.i || o.i, '52px'); ic.dataset.cz = 'icon'; const nm = inp('text', n.t || o.t, '200px'); nm.dataset.cz = 'name'; nm.maxLength = 30;
          const commit = () => { const names = { ...get().names }; const t = nm.value.trim(), icv = ic.value.trim(); if ((t === o.t || !t) && (icv === o.i || !icv)) delete names[p.id]; else names[p.id] = { t: t === o.t ? '' : t, i: icv === o.i ? '' : icv }; save({ names }); }; nm.onchange = commit; ic.onchange = commit;
          const mv = (d) => { const ids = PAGES.map((x) => x.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; save({ order: ids }); draw(); };
          r.append(ic, nm, B('↑', '', () => mv(-1)), B('↓', '', () => mv(1))); list.append(r); });
        k.append(list, row(B('Reset names, icons and order', '', () => { save({ names: {}, order: [] }); draw(); }))); }
      { const k = card('Your own CSS', 'For people who like to tweak. Anything you write here is applied on top of Aurora. External web addresses are blocked.'); const ta = el('textarea', 'util-ta'); ta.rows = 6; ta.value = c.css; ta.placeholder = '.nav-item { letter-spacing: .5px; }'; ta.dataset.cz = 'css'; k.append(ta, row(B('Apply', 'primary', () => { save({ css: ta.value }); toast('Applied'); }), B('Clear', '', () => { save({ css: '' }); draw(); }))); }
      { const k = card('Save, share, reset', 'Export all of this as text to back it up or share it. Import text to apply it.'); const ta = el('textarea', 'util-ta'); ta.rows = 4; ta.dataset.cz = 'io'; ta.placeholder = 'Exported settings appear here. Paste settings here to import.';
        k.append(ta, row(B('Export', '', () => { ta.value = JSON.stringify(get()); }), B('Import', '', () => { try { const v = JSON.parse(ta.value); prefs.set('custom', sanitize(v)); apply(); draw(); toast('Imported'); } catch (_) { toast('That is not valid settings text', true); } }), B('Copy', '', async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch (_) { toast('Could not copy', true); } }), B('Reset everything here', '', async () => { if (!(await askText('Reset every customization on this page? Type yes to confirm.')).trim().toLowerCase().startsWith('y')) return; prefs.set('custom', sanitize({})); apply(); draw(); }))); }
    };
    draw();
  };
}
