/* Aurora Store UI. Backend: lib/appstore.js (handlers appStore*). Uses the helpers from app.js: el, call, toast, errText, askText, go. */
CUSTOM.appstore = (box) => {
  const FEATURED = ['Mozilla.Firefox', 'VideoLAN.VLC', 'Microsoft.VisualStudioCode', '7zip.7zip', 'Notepad++.Notepad++', 'OBSProject.OBSStudio', 'Git.Git', 'Discord.Discord', 'Spotify.Spotify'];
  const CAT_ICON = { Browsers: '🌐', Media: '🎬', Developer: '🧑‍💻', Utilities: '🧰', Games: '🎮', Communication: '💬', Security: '🛡️', Productivity: '📝', Graphics: '🎨', 'System tools': '⚙️', Education: '🎓', 'Added by you': '➕' };
  const pref = (k, d) => { try { return localStorage.getItem('aurora.store.' + k) || d; } catch (_) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('aurora.store.' + k, v); } catch (_) { /* private mode: just don't remember */ } };
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  let data = { categories: [], apps: [] }, jobs = [], cat = 'All', q = '', updates = null, report = null, open = null, infoCache = {}, failMsg = '', loading = true;
  let sort = pref('sort', 'name'), view = pref('view', 'grid'), batch = null, timer = null;
  box.classList.add('sx'); box.style.gap = '14px';

  /* ---------- skeleton of the page ---------- */
  const hero = el('div', 'sx-hero'), heroText = el('div', 'sx-hero-text'), stats = el('div', 'sx-stats'), heroBtns = el('div', 'sx-hero-btns');
  heroText.append(el('div', 'sx-title', '🛍️ Aurora Store'), el('div', 'sx-sub', 'Free apps from the public Windows Package Manager catalog. Every download is checked against its published SHA-256 fingerprint before it runs.'));
  const search = el('input', 'filter sx-search'); search.placeholder = 'Search apps…  ( press / )'; search.setAttribute('aria-label', 'Search apps');
  const chk = el('button', 'btn', '🔄 Check for updates'), upAll = el('button', 'btn primary', 'Update all'), add = el('button', 'btn', '➕ Add by package ID'); upAll.hidden = true;
  heroBtns.append(chk, upAll, add); hero.append(heroText, stats, heroBtns);
  const bar = el('div', 'sx-toolbar'), sortSel = document.createElement('select'); sortSel.className = 'filter sx-sort'; sortSel.setAttribute('aria-label', 'Sort apps');
  [['name', 'Sort: A–Z'], ['category', 'Sort: Category'], ['status', 'Sort: Installed first']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sortSel.append(o); }); sortSel.value = sort;
  const vg = el('button', 'sx-vbtn', '▦'), vl = el('button', 'sx-vbtn', '☰'); vg.title = 'Grid view'; vl.title = 'List view'; vg.setAttribute('aria-label', 'Grid view'); vl.setAttribute('aria-label', 'List view');
  const vwrap = el('div', 'sx-views'); vwrap.append(vg, vl); bar.append(search, sortSel, vwrap);
  const note = el('div', 'sx-note'); note.hidden = true;
  const chips = el('div', 'store-chips sx-chips'), featured = el('div', 'sx-featured'), grid = el('div', 'store-grid sx-grid');
  box.append(hero, bar, note, chips, featured, grid);

  /* ---------- helpers ---------- */
  const busy = () => jobs.some((j) => j.status === 'queued' || j.status === 'working');
  const jobOf = (a) => jobs.find((j) => j.appId === a.id && (j.status === 'queued' || j.status === 'working')) || jobs.slice().reverse().find((j) => j.appId === a.id && ['error', 'done', 'cancelled'].includes(j.status));
  const updOf = (a) => updates && updates.find((u) => u.id === a.id);
  async function reload() { try { data = await call('appStoreCatalog'); jobs = await call('appStoreJobs'); failMsg = ''; } catch (e) { failMsg = errText(e); } loading = false; render(); }
  async function start(a, fn, okMsg) { try { await fn(); toast(okMsg); } catch (e) { toast(errText(e), true); } jobs = await call('appStoreJobs').catch(() => jobs); render(); poll(); }
  // An app that finished installing/updating is no longer "outdated": drop it from the update list right away.
  function pruneUpdates() {
    if (!updates || !updates.length) return;
    updates = updates.filter((u) => !jobs.some((j) => j.appId === u.id && j.status === 'done' && j.action !== 'uninstall'));
    if (!updates.length && cat === 'Updates') cat = 'All';
  }
  function poll() {
    if (timer) return;
    timer = setInterval(async () => {
      if (!document.body.contains(box)) { clearInterval(timer); timer = null; return; }
      const was = busy(); try { jobs = await call('appStoreJobs'); } catch (_) { return; }
      if (was && !busy()) { clearInterval(timer); timer = null; pruneUpdates(); batch = null; await reload(); } else render();
    }, 900);
  }

  /* ---------- pieces ---------- */
  const tile = (a) => { const t = el('div', 'sx-tile', a.icon || CAT_ICON[a.category] || '📦'); t.style.setProperty('--h', hue(a.category || a.id)); return t; };
  const badge = (txt, kind) => el('span', 'sx-badge ' + kind, txt);
  function statsRow() {
    stats.replaceChildren(); const installed = data.apps.filter((a) => a.installed).length;
    const mk = (n, label, tone, onclick) => { const s = el(onclick ? 'button' : 'div', 'sx-stat ' + (tone || '')); s.append(el('b', '', String(n)), el('span', '', label)); if (onclick) { s.onclick = onclick; s.title = 'Show ' + label.toLowerCase(); } return s; };
    stats.append(mk(data.apps.length, 'apps', '', () => { cat = 'All'; render(); }), mk(installed, 'installed', 'ok', () => { cat = 'Installed'; render(); }), mk(updates ? updates.length : '–', 'updates', updates && updates.length ? 'warn' : '', updates && updates.length ? () => { cat = 'Updates'; render(); } : null));
  }
  function chipRow() {
    chips.replaceChildren(); const count = (f) => data.apps.filter(f).length;
    const items = [['All', '✨ All', data.apps.length], ['Installed', '✅ Installed', count((a) => a.installed)]];
    if (updates && updates.length) items.push(['Updates', '⬆️ Updates', updates.length]);
    data.categories.forEach((c) => items.push([c, (CAT_ICON[c] || '📦') + ' ' + c, count((a) => a.category === c)]));
    if (data.apps.some((a) => a.custom)) items.push(['Added by you', '➕ Added by you', count((a) => a.custom)]);
    items.forEach(([key, label, n]) => { const b = el('button', 'chip' + (cat === key ? ' on' : ''), label); if (n != null) b.append(el('span', 'sx-count', String(n))); b.onclick = () => { cat = key; render(); }; chips.append(b); });
  }
  function showNote() {
    const bits = []; if (report && report.limited) bits.push('⏳ ' + report.limited);
    if (report && report.errors && report.errors.length) bits.push(`${report.errors.length} app${report.errors.length === 1 ? '' : 's'} could not be checked and ${report.errors.length === 1 ? 'was' : 'were'} skipped.`);
    note.hidden = !bits.length; note.textContent = bits.join(' ');
  }
  function actions(a, c) {
    const j = jobOf(a), upd = updOf(a), act = el('div', 'store-actions'), active = j && (j.status === 'queued' || j.status === 'working');
    if (active) {
      const pb = el('div', 'bar sx-bar'), i = document.createElement('i'); i.style.width = Math.max(4, j.percent) + '%'; pb.append(i);
      c.append(pb, el('div', 'sub', (j.action === 'uninstall' ? 'Removing: ' : '') + j.step));
      if (j.cancellable) { const x = el('button', 'btn', 'Cancel'); x.onclick = () => start(a, () => call('appStoreCancel', { jobId: j.id }), 'Cancelled'); act.append(x); }
      return act;
    }
    if (j && j.status === 'error') c.append(el('div', 'store-err', j.error)); else if (j && j.status === 'done' && j.note) c.append(el('div', 'sub', j.note));
    if (a.installed) {
      if (upd) { const u = el('button', 'btn primary', `⬆️ Update to ${upd.latest}`); u.onclick = () => start(a, () => call('appStoreInstall', { id: a.id }), 'Updating ' + a.name); act.append(u); }
      const rm = el('button', 'btn danger', 'Uninstall'); rm.onclick = () => { if (confirm(`Uninstall ${a.name}?`)) start(a, () => call('appStoreUninstall', { id: a.id }), 'Removing ' + a.name); }; act.append(rm);
    } else { const b = el('button', 'btn primary', j && j.status === 'error' ? 'Try again' : '⬇️ Install'); b.onclick = () => start(a, () => call('appStoreInstall', { id: a.id }), 'Installing ' + a.name); act.append(b); }
    const d = el('button', 'btn', open === a.id ? 'Hide details' : 'Details'); d.onclick = async () => {
      open = open === a.id ? null : a.id; render();
      if (open && !infoCache[a.id]) { try { infoCache[a.id] = await call('appStoreInfo', { id: a.id }); } catch (e) { infoCache[a.id] = { error: errText(e) }; } render(); }
    }; act.append(d);
    if (a.custom && !a.installed) { const r = el('button', 'btn', 'Remove from list'); r.onclick = () => start(a, () => call('appStoreRemove', { id: a.id }), 'Removed').then(reload); act.append(r); }
    return act;
  }
  function details(a) {
    const i = infoCache[a.id], dv = el('div', 'store-info');
    if (!i) { dv.textContent = 'Loading…'; return dv; } if (i.error) { dv.textContent = i.error; return dv; }
    dv.append(el('div', '', `Latest version ${i.latest}${i.publisher ? ' · ' + i.publisher : ''}${i.license ? ' · ' + i.license : ''}`),
      el('div', 'sub', `Installer: ${i.installerType || 'unknown'} · downloads from ${i.download || 'unknown'} · ${i.needsAdmin ? 'asks for administrator permission' : 'no administrator permission needed'}`));
    if (i.homepage) { const w = el('button', 'btn', 'Open website'); w.style.marginTop = '8px'; w.onclick = () => call('appStoreHomepage', { id: a.id }).catch((e) => toast(errText(e), true)); dv.append(w); }
    return dv;
  }
  function card(a) {
    const upd = updOf(a), c = el('div', 'store-card sx-card' + (view === 'list' ? ' list' : '')); c.dataset.app = a.id;
    const head = el('div', 'store-head'); head.append(tile(a));
    const t = el('div', 'sx-meta'); t.append(el('div', 'store-name', a.name), el('div', 'sub', a.category + (a.installed && a.version ? ' · v' + a.version : ''))); head.append(t);
    const bs = el('div', 'sx-badges'); if (upd) bs.append(badge('Update', 'warn')); else if (a.installed) bs.append(badge(a.via === 'system' ? 'On this PC' : 'Installed', 'ok')); head.append(bs);
    c.append(head, el('div', 'store-desc', a.desc || 'No description'));
    if (upd) c.append(el('div', 'store-ok', `Installed ${upd.installed} · version ${upd.latest} is available`));
    c.append(actions(a, c)); if (open === a.id && !jobOf(a)?.status?.match(/queued|working/)) c.append(details(a));
    return c;
  }
  function featuredRow() {
    featured.replaceChildren(); featured.hidden = true;
    if (cat !== 'All' || q) return;
    const picks = FEATURED.map((id) => data.apps.find((a) => a.id === id)).filter((a) => a && !a.installed).slice(0, 8); if (picks.length < 3) return;
    featured.hidden = false; featured.append(el('div', 'sx-h', '⭐ Popular picks'));
    const row = el('div', 'sx-frow');
    picks.forEach((a) => { const f = el('div', 'sx-fcard'); f.append(tile(a), el('div', 'store-name', a.name)); const b = el('button', 'btn primary', 'Install'); const j = jobOf(a); if (j && (j.status === 'queued' || j.status === 'working')) { b.textContent = j.percent + '%'; b.disabled = true; } else b.onclick = () => start(a, () => call('appStoreInstall', { id: a.id }), 'Installing ' + a.name); f.append(b); row.append(f); });
    featured.append(row);
  }
  function skeleton() { grid.replaceChildren(); for (let i = 0; i < 9; i++) { const s = el('div', 'store-card sx-skel'); s.append(el('div', 'sx-sk-a'), el('div', 'sx-sk-b'), el('div', 'sx-sk-b short')); grid.append(s); } }

  function render() {
    pruneUpdates(); statsRow(); chipRow(); showNote();
    vg.classList.toggle('on', view === 'grid'); vl.classList.toggle('on', view === 'list'); grid.classList.toggle('list', view === 'list');
    const n = updates ? updates.length : 0; upAll.hidden = !n;
    if (batch) { const left = batch.ids.filter((id) => jobs.some((j) => j.appId === id && (j.status === 'queued' || j.status === 'working'))).length; upAll.textContent = left ? `Updating ${batch.ids.length - left + 1} of ${batch.ids.length}…` : 'Update all'; upAll.disabled = !!left; } else { upAll.textContent = `Update all (${n})`; upAll.disabled = false; }
    if (loading) { featured.hidden = true; return skeleton(); }
    grid.replaceChildren(); featuredRow();
    if (failMsg) return grid.append(el('div', 'muted', failMsg));
    let list = data.apps.filter((a) => {
      if (q && !(a.name + ' ' + a.desc + ' ' + a.category + ' ' + a.id).toLowerCase().includes(q)) return false;
      if (cat === 'All') return true; if (cat === 'Installed') return a.installed; if (cat === 'Updates') return !!updOf(a); return a.category === cat;
    });
    const cmp = { name: (x, y) => x.name.localeCompare(y.name), category: (x, y) => x.category.localeCompare(y.category) || x.name.localeCompare(y.name), status: (x, y) => (Number(!!updOf(y)) - Number(!!updOf(x))) || (Number(y.installed) - Number(x.installed)) || x.name.localeCompare(y.name) }[sort];
    list = list.slice().sort(cmp);
    if (!list.length) { const e = el('div', 'sx-empty'); e.append(el('div', 'sx-empty-i', q ? '🔍' : cat === 'Installed' ? '📦' : '✨'), el('div', '', cat === 'Installed' && !q ? 'Nothing installed yet. Pick an app and it will show up here.' : q ? 'No apps match your search. Try “Add by package ID” for anything else in the catalog.' : 'Nothing here.')); return grid.append(e); }
    list.forEach((a) => grid.append(card(a)));
  }

  /* ---------- events ---------- */
  search.oninput = () => { q = search.value.toLowerCase().trim(); render(); };
  sortSel.onchange = () => { sort = sortSel.value; setPref('sort', sort); render(); };
  vg.onclick = () => { view = 'grid'; setPref('view', view); render(); }; vl.onclick = () => { view = 'list'; setPref('view', view); render(); };
  const onKey = (e) => { if (!document.body.contains(box)) return document.removeEventListener('keydown', onKey); if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); search.focus(); } };
  document.addEventListener('keydown', onKey);
  if (window.__storeQuery) { search.value = window.__storeQuery; q = search.value.toLowerCase(); window.__storeQuery = ''; }
  upAll.onclick = async () => {
    if (!updates || !updates.length) return; batch = { ids: updates.map((u) => u.id) };
    for (const u of updates) { try { await call('appStoreInstall', { id: u.id }); } catch (e) { toast(errText(e), true); } }
    toast('Updating ' + batch.ids.length + ' app' + (batch.ids.length === 1 ? '' : 's')); jobs = await call('appStoreJobs').catch(() => jobs); render(); poll();
  };
  chk.onclick = async () => {
    chk.disabled = true; chk.textContent = '🔄 Checking…';
    try {
      report = await call('appStoreUpdatesReport'); updates = report.updates;
      if (report.limited && !updates.length) toast(report.limited, true); else toast(updates.length ? updates.length + ' update(s) available' : (report.errors.length ? 'No updates found, but some apps could not be checked' : 'Everything is up to date')); if (updates.length) cat = 'Updates';
    } catch (e) { toast(errText(e), true); }
    chk.disabled = false; chk.textContent = '🔄 Check for updates'; render();
  };
  add.onclick = async () => {
    const id = await askText('Package ID from the Windows Package Manager catalog, for example Mozilla.Firefox'); if (!id) return;
    try { const a = await call('appStoreAdd', { id: id.trim() }); toast('Added ' + a.name); cat = 'Added by you'; await reload(); } catch (e) { toast(errText(e), true); }
  };

  render(); reload().then(() => { if (busy()) poll(); });
};
