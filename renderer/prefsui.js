/* Aurora-only settings: how Aurora itself looks and behaves. These do not exist in Windows; they live inside Aurora. */
{
  const DEF = { startPage: 'home', compactNav: false, hiddenPages: [], density: 'comfortable', textSize: 100, radius: 'normal', clickSounds: false, toastSeconds: 2.4, toastPos: 'bottom', reduceGlass: false, dir: 'auto', clock: 'system', confirmCommands: false };
  const cfg = () => ({ ...DEF, ...(prefs.get('ui') || {}) });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const set = (patch) => { prefs.set('ui', { ...cfg(), ...patch }); apply(); };
  function apply() {
    const c = cfg(), r = document.documentElement;
    r.dataset.density = c.density; r.dataset.nav = c.compactNav ? 'compact' : 'full'; r.dataset.radius = c.radius; r.dataset.glass = c.reduceGlass ? 'low' : 'full'; r.dataset.toast = c.toastPos;
    r.dir = c.dir === 'auto' ? 'ltr' : c.dir; // the interface is English; "auto" keeps left-to-right
    const content = document.querySelector('.content'); if (content) content.style.zoom = String(clamp(Number(c.textSize) || 100, 80, 140) / 100);
    if (typeof renderNav === 'function') renderNav();
  }
  window.auroraUi = { DEF, cfg, set, apply };
  apply();

  /* start page */
  const sp = cfg().startPage; if (sp !== 'home') { const target = sp === 'last' ? prefs.get('lastPage') : sp; if (target && PAGES.some((p) => p.id === target) && target !== 'home') go(target); }

  /* quiet click sounds */
  let ac = null, lastTick = 0;
  document.addEventListener('click', (e) => {
    if (!cfg().clickSounds) return; const t = e.target.closest && e.target.closest('button, .nav-item, .chip, .switch'); if (!t) return; const now = performance.now(); if (now - lastTick < 60) return; lastTick = now;
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 1400; g.gain.setValueAtTime(0.04, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.05); o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.06); window.__ticks = (window.__ticks || 0) + 1; } catch (_) {}
  }, true);

  CUSTOM.auroraprefs = (box) => {
    box.style.gap = '10px';
    const row = (label, desc, ctl) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', label)); if (desc) l.append(el('div', 'sub', desc)); r.append(l, ctl); return r; };
    const sel = (opts, val, fn) => { const s = el('select', 'filter'); s.style.width = 'auto'; opts.forEach(([v, l]) => s.append(Object.assign(el('option', '', l), { value: v }))); s.value = String(val); s.onchange = () => fn(s.value); return s; };
    const sw = (val, fn) => { const l = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = !!val; i.onchange = () => fn(i.checked); l.append(i, el('span', 'track'), el('span', 'thumb')); return l; };
    const draw = () => {
      box.replaceChildren(); const c = cfg();
      box.append(el('div', 'muted', 'These settings belong to Aurora only. Windows has no equivalent, and nothing here changes Windows.'));
      const pageOpts = [['home', 'Home'], ['last', 'The page I was on last'], ...PAGES.filter((p) => p.id !== 'home').map((p) => [p.id, p.title])];
      box.append(row('Open Aurora on', 'Which page you see first', sel(pageOpts, c.startPage, (v) => { set({ startPage: v }); toast('Aurora will open on that page next time'); })));
      box.append(row('Compact sidebar', 'Icons only, more room for content', sw(c.compactNav, (v) => { set({ compactNav: v }); })));
      box.append(row('Spacing', 'How tightly things are packed', sel([['comfortable', 'Comfortable'], ['compact', 'Compact']], c.density, (v) => set({ density: v }))));
      box.append(row('Text size', 'Scales the content area', sel([[90, 'Small (90%)'], [100, 'Normal'], [110, 'Large (110%)'], [125, 'Larger (125%)'], [140, 'Largest (140%)']], c.textSize, (v) => set({ textSize: Number(v) }))));
      box.append(row('Corners', 'Shape of cards and buttons', sel([['sharp', 'Sharp'], ['normal', 'Normal'], ['round', 'Round']], c.radius, (v) => set({ radius: v }))));
      box.append(row('Frosted glass', 'Turn off the blur for a flatter look and a lighter load on weak PCs', sw(!c.reduceGlass, (v) => set({ reduceGlass: !v }))));
      box.append(row('Interface direction', 'Right to left mirrors the layout. Useful for Arabic add-ons and notes.', sel([['auto', 'Left to right (default)'], ['ltr', 'Left to right'], ['rtl', 'Right to left']], c.dir, (v) => set({ dir: v }))));
      box.append(row('Message position', 'Where little notifications pop up', sel([['bottom', 'Bottom'], ['top', 'Top']], c.toastPos, (v) => set({ toastPos: v }))));
      box.append(row('Message time', 'How long messages stay (errors stay longer)', sel([[1.5, '1.5 seconds'], [2.4, '2.4 seconds'], [4, '4 seconds'], [7, '7 seconds']], c.toastSeconds, (v) => set({ toastSeconds: Number(v) }))));
      box.append(row('Tiny click sounds', 'A very quiet tick when you press things', sw(c.clickSounds, (v) => set({ clickSounds: v }))));
      box.append(row('Clocks', 'Used by the Big clock', sel([['system', 'Like my system'], ['12', '12-hour'], ['24', '24-hour']], c.clock, (v) => set({ clock: v }))));
      box.append(row('Ask before commands change settings', 'The command bar asks "Run this command?" before changing sound, brightness, theme, power or keep-awake', sw(c.confirmCommands, (v) => set({ confirmCommands: v }))));
      const pages = el('div'); pages.append(el('div', 'label', 'Pages in the sidebar')); pages.append(el('div', 'sub', 'Untick pages you never use. They stay available from the command bar (Ctrl+K). Home and Personalization always stay.'));
      const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px;margin-top:6px';
      PAGES.forEach((p) => { const l = el('label', 'sub'); const i = el('input'); i.type = 'checkbox'; i.checked = !c.hiddenPages.includes(p.id); i.disabled = ['home', 'personalization'].includes(p.id); i.dataset.page = p.id; i.onchange = () => { const hs = new Set(cfg().hiddenPages); i.checked ? hs.delete(p.id) : hs.add(p.id); set({ hiddenPages: [...hs] }); }; l.append(i, ` ${p.icon} ${p.title}`); grid.append(l); });
      pages.append(grid); box.append(pages, el('div', 'savebar')); const reset = el('button', 'btn', 'Reset all of these to the defaults'); reset.onclick = () => { if (!confirm('Reset every Aurora-only setting?')) return; prefs.set('ui', { ...DEF }); apply(); draw(); toast('Back to the defaults'); }; box.lastChild.append(reset);
    }; draw();
  };
}
