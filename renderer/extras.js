/* Built-in add-ons: Vorynth starts with only the Windows basics in the sidebar. Everything else is grouped into add-ons you switch on or off
   (Add-ons page, or the one-time picker). Switched-off tools are still found by Ctrl+K search, which offers to switch them on. */
{
  const PACKS = [
    { id: 'sys', essential: true, icon: '🖥️', title: 'System & devices', desc: 'System, display and sound, Bluetooth and devices, notifications, apps, accounts and power, Windows Update.', pages: ['system', 'devices', 'notifications', 'apps', 'session', 'update', 'cursorfix', 'diag'] },
    { id: 'net', essential: true, icon: '🌐', title: 'Network & internet', desc: 'Wi-Fi, Ethernet, VPN, proxy and network tools.', pages: ['network'] },
    { id: 'pers', essential: true, icon: '🎨', title: 'Personalize, language & gaming', desc: 'Colours and themes, Start and taskbar, time and language, accessibility, Windows gaming settings.', pages: ['personalization', 'startmenu', 'time', 'access', 'gaming'] },
    { id: 'priv', essential: true, icon: '🔒', title: 'Privacy & De-AI', desc: 'Privacy settings, De-AI Windows (Copilot, Recall, Click to Do) and Turn off Microsoft features (ads, tips, tracking, Edge promos).', pages: ['privacy', 'ai', 'msoff'] },
    { id: 'life', icon: '🌙', title: 'Daily life', desc: 'Prayer times and Hijri date, zakat, world clock for suppliers, colour picker, exchange rates.', pages: ['salah', 'zakat', 'worldclock', 'picker', 'fx'] },
    { id: 'health', icon: '🩺', title: 'PC health & cleanup', desc: 'Vorynth Doctor, PC rating, disk space map, duplicate finder, space finder, backup, toolbox.', pages: ['autodoc', 'pcrating', 'diskmap', 'dupes', 'space', 'backup', 'toolbox'] },
    { id: 'gamer', icon: '🎮', title: 'Gaming extras', desc: 'Controller setup and the live GPU monitor.', pages: ['controllers', 'gpumon'] },
    { id: 'looks', icon: '✨', title: 'Looks & fun', desc: 'Vorynth looks and themes, milestones, desktop look, customize OS, journey, labs.', pages: ['looks', 'milestones', 'desklook', 'oscustomize', 'journey', 'labs'] },
    { id: 'power', icon: '⚡', title: 'Power tools', desc: 'Profiles, automation, your own commands, mods, utilities, tweaks, Windows tools.', pages: ['profiles', 'automation', 'mycmds', 'mods', 'utils', 'tweaks', 'wintools'] },
    { id: 'apps', icon: '🛍️', title: 'Vorynth apps & store', desc: 'Vorynth Store, Vorynth Apps, Plus, Toolkit and Vorynth OS.', pages: ['store', 'aurora-apps', 'aurora-plus', 'aurora-pro', 'aurora-os'] }
  ];
  const ORIGINAL = PAGES.slice(); const known = new Set(ORIGINAL.map((p) => p.id));
  PACKS.forEach((p) => { p.pages = p.pages.filter((id) => known.has(id)); }); // Vorynth OS (Linux) has fewer pages
  const ACTIVE = PACKS.filter((p) => p.pages.length); const validIds = new Set(ACTIVE.map((p) => p.id));
  const PACK_OF = {}; ACTIVE.forEach((p) => p.pages.forEach((id) => { PACK_OF[id] = p.id; }));
  const packOf = (pageId) => PACK_OF[pageId] || null; const packById = (id) => ACTIVE.find((p) => p.id === id);
  const pageTitle = (id) => (ORIGINAL.find((p) => p.id === id) || {}).title || id;
  const ESS = ACTIVE.filter((p) => p.essential).map((p) => p.id);
  const PRESETS = [['Essentials only', ESS], ['Gamer', ESS.concat(['gamer', 'looks', 'health'])], ['Tinkerer', ESS.concat(['health', 'power', 'apps', 'looks'])], ['Everything', ACTIVE.map((p) => p.id)], ['Bare (Home + Add-ons)', []]];

  // Older versions stored single pages in prefs.extras; turn those into add-ons the first time.
  const read = () => { let v = prefs.get('packs'); if (!Array.isArray(v)) { const old = Array.isArray(prefs.get('extras')) ? prefs.get('extras') : []; v = ESS.concat(ACTIVE.filter((p) => !p.essential && p.pages.some((id) => old.includes(id))).map((p) => p.id)); } return new Set(v.filter((x) => validIds.has(x))); };
  // Version 2: the Windows basics are add-ons too. Anyone with an older saved choice keeps it and gets the basics added once.
  const migrate = () => { try { if (prefs.get('packsV') !== 2) { if (Array.isArray(prefs.get('packs'))) { const on = read(); ESS.forEach((id) => on.add(id)); write(on); } prefs.set('packsV', 2); } } catch (_) { /* ignore */ } };
  const write = (set) => prefs.set('packs', [...set]);
  const isPackOn = (id) => read().has(id);
  const isOn = (pageId) => { const k = packOf(pageId); return !k || isPackOn(k); };

  const css = document.createElement('style'); css.id = 'packs-css';
  css.textContent = '.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}.pk-row{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);cursor:pointer;transition:border-color .15s}.pk-row.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.pk-row summary{cursor:pointer;opacity:.8}.pk-bar{position:sticky;bottom:-22px;background:var(--bg);padding:10px 0 2px}.pk-row input{margin-top:4px;width:18px;height:18px;flex:none}.pk-row .sub{margin-top:3px;line-height:1.4}.pk-presets{display:flex;gap:8px;flex-wrap:wrap}.pk-veil{position:fixed;inset:0;z-index:10050;background:rgba(5,5,15,.62);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px}.pk-panel{width:min(820px,100%);max-height:88vh;overflow:auto;border-radius:18px;border:1px solid var(--border);background:var(--bg);padding:22px;display:grid;gap:14px}';
  document.head.append(css);

  const apply = () => {
    const on = read(); PAGES.length = 0; for (const p of ORIGINAL) { const k = packOf(p.id); if (!k || on.has(k)) PAGES.push(p); }
    if (window.auroraCustomOrder) window.auroraCustomOrder();
    INDEX.length = 0; PAGES.forEach((p) => p.sections.forEach((s) => s.items.forEach((it) => INDEX.push({ it, page: p, section: s }))));
    // Ctrl+K still finds tools whose add-on is off; choosing one switches the add-on on and opens it.
    for (const p of ORIGINAL) { const k = packOf(p.id); if (!k || on.has(k)) continue; const pk = packById(k); INDEX.push({ it: { label: p.title, desc: 'Switched off. Opening it turns on the "' + pk.title + '" add-on.', kw: p.sections.flatMap((s) => s.items.map((i) => (i.label || '') + ' ' + (i.kw || ''))).join(' ') + ' ' + (p.sub || ''), type: 'packoff', packId: k }, page: { id: p.id, title: 'Switched off' }, section: { title: pk.title + ' add-on' } }); }
    if (typeof currentPage !== 'undefined' && !PAGES.some((p) => p.id === currentPage)) { try { go('home'); return; } catch (_) { /* fall through */ } }
    renderNav();
  };
  const setPack = (id, value) => { if (!validIds.has(id)) return; const on = read(); value ? on.add(id) : on.delete(id); write(on); apply(); };
  const set = (pageId, value) => { const k = packOf(pageId); if (k) setPack(k, value); }; // kept for older callers that pass a page id

  // The list of add-ons, used by the Add-ons page (live) and the first-run picker (applied on Done)
  function packList(sel, onChange) {
    const wrap = el('div'); wrap.style.cssText = 'display:grid;gap:12px'; const rows = {};
    const sync = () => ACTIVE.forEach((p) => { rows[p.id].cb.checked = sel.has(p.id); rows[p.id].row.classList.toggle('on', sel.has(p.id)); });
    const presets = el('div', 'pk-presets'); presets.append(el('span', 'sub', 'Quick setups:'));
    PRESETS.forEach(([name, ids]) => { const b = el('button', 'btn', name); b.dataset.preset = name; b.onclick = () => { sel.clear(); ids.filter((i) => validIds.has(i)).forEach((i) => sel.add(i)); sync(); onChange(null, null); }; presets.append(b); });
    const gridE = el('div', 'pk-grid'), gridX = el('div', 'pk-grid');
    ACTIVE.forEach((p) => { const row = el('div', 'pk-row'); row.dataset.pack = p.id; const cb = el('input'); cb.type = 'checkbox'; cb.onchange = () => { cb.checked ? sel.add(p.id) : sel.delete(p.id); row.classList.toggle('on', cb.checked); onChange(p, cb.checked); }; const body = el('div'); body.style.minWidth = 0; const det = document.createElement('details'); det.className = 'sub'; const sm = document.createElement('summary'); sm.textContent = p.pages.length + (p.pages.length === 1 ? ' page' : ' pages'); det.append(sm, el('div', 'sub', p.pages.map(pageTitle).join(', '))); body.append(el('b', '', p.icon + ' ' + p.title), el('div', 'sub', p.desc), det); row.append(cb, body); row.onclick = (e) => { if (e.target.closest('details,input')) return; cb.click(); }; (p.essential ? gridE : gridX).append(row); rows[p.id] = { row, cb }; });
    sync(); const h = (t) => { const d = el('div', 'label', t); d.style.marginTop = '4px'; return d; }; wrap.append(presets, h('Essentials (Windows basics, on by default)'), gridE, h('Extras (off until you want them)'), gridX); return wrap;
  }
  const extrasCard = () => {
    const c = el('div', 'card extras-card'); c.style.cssText = 'display:grid;gap:12px'; const sel = read(); const head = el('b'); const count = () => { head.textContent = '🧩 Built-in add-ons: ' + sel.size + ' of ' + ACTIVE.length + ' on'; }; count();
    c.append(head, el('div', 'muted', 'Everything except Home and Add-ons is an add-on. The Windows basics are on to start with; turn on any extra you use and its pages appear, turn one off and it disappears. Ctrl+K still finds everything.'));
    c.append(packList(sel, (p, v) => { write(sel); apply(); count(); if (p) toast(p.title + (v ? ' add-on is on' : ' add-on is off')); else toast('Add-ons updated'); }));
    return c;
  };
  // Any link to a page whose add-on is off (a search result, "Install in Vorynth Store", a tile) switches the add-on on first, so nothing breaks.
  const baseGo = goBase;
  goBase = function (pageId, focusId) { const k = packOf(pageId); if (k && !isPackOn(k)) { setPack(k, true); toast(packById(k).title + ' add-on switched on'); } return baseGo(pageId, focusId); };

  function showPicker() {
    if (document.getElementById('pk-veil')) return;
    const sel = read(); const veil = el('div', 'pk-veil'); veil.id = 'pk-veil'; const panel = el('div', 'pk-panel');
    panel.append(el('h2', '', 'Make Vorynth yours'), el('div', 'muted', 'Choose the add-ons you want. You can change this any time on the Add-ons page, and Ctrl+K search still finds everything.'));
    panel.append(packList(sel, () => {})); const bar = el('div', 'pk-bar'); bar.style.cssText += 'display:flex;gap:8px;justify-content:flex-end';
    const done = el('button', 'btn primary', 'Done'); done.id = 'packs-done'; done.onclick = () => { write(sel); prefs.set('packsAsked', true); veil.remove(); apply(); toast(sel.size ? sel.size + ' add-ons on' : 'Starting light. Add more any time.'); }; bar.append(done); panel.append(bar); veil.append(panel); document.body.append(veil);
  }
  // Test harness flag: ?aurora_packs=all turns everything on and skips the picker so older automated tests keep working.
  try { if (new URLSearchParams(location.search).get('aurora_packs') === 'all') { write(new Set(ACTIVE.map((p) => p.id))); prefs.set('packsAsked', true); } } catch (_) { /* ignore */ }
  migrate();
  window.auroraExtras = { PACKS: ACTIVE, packOf, isOn, isPackOn, setPack, set, card: extrasCard, apply, allPages: () => ORIGINAL.slice(), showPicker, PRESETS };
  apply();
  // No popup: Vorynth just starts with the essentials. One quiet hint, once.
  if (!prefs.get('packsAsked')) { prefs.set('packsAsked', true); setTimeout(() => { try { toast('Only the essentials are on. Get more under Add-ons (or press Ctrl+K).'); } catch (_) { /* ignore */ } }, 2500); }
}
CUSTOM.extras = (box) => { box.append(window.auroraExtras.card()); };
