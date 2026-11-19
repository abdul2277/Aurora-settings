/* Vorynth Settings renderer */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.textContent = html; return e; };

/* ---------- prefs (accent, pinned) ---------- */
const prefs = (() => {
  let data = { accent: ACCENTS[0], favs: [] };
  try { Object.assign(data, JSON.parse(localStorage.getItem('aurora') || '{}')); } catch (_) {}
  return {
    get: (k) => data[k],
    set: (k, v) => { data[k] = v; try { localStorage.setItem('aurora', JSON.stringify(data)); } catch (_) {} },
    all: () => ({ ...data })
  };
})();

function applyAccent(c) {
  document.documentElement.style.setProperty('--accent', c);
  // choose readable ink for the accent
  const n = parseInt(c.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  document.documentElement.style.setProperty('--accent-ink', lum > 0.55 ? '#10131a' : '#ffffff');
}
function applyTheme(dark) { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }
applyAccent(prefs.get('accent'));


// Electron does not support window.prompt(), so questions are asked with this small in-app dialog.
function askText(message, { password = false, placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div'); back.className = 'ask-back'; const card = document.createElement('div'); card.className = 'sheet';
    const inp = el('input', 'filter'); inp.type = password ? 'password' : 'text'; inp.placeholder = placeholder; inp.style.margin = '10px 0';
    const done = (v) => { back.remove(); resolve(v); };
    const ok = el('button', 'btn primary', 'OK'); ok.onclick = () => done(inp.value); const no = el('button', 'btn', 'Cancel'); no.onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); else if (e.key === 'Escape') no.click(); }; back.onclick = (e) => { if (e.target === back) no.click(); };
    const bar = el('div', 'savebar'); bar.append(ok, no); card.append(el('div', 'label', message), inp, bar); back.append(card); document.body.append(back); inp.focus();
  });
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  const secs = Number((prefs.get('ui') || {}).toastSeconds) || 2.4; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), isErr ? Math.max(5000, secs * 1000) : secs * 1000);
}
const guard = async (fn, okMsg) => {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method 'call': (Error: )?/, ''), true); throw e; }
};

/* ---------- item index ---------- */
const INDEX = [];
PAGES.forEach((p) => p.sections.forEach((s) => s.items.forEach((it) => INDEX.push({ it, page: p, section: s }))));
const findItem = (id) => INDEX.find((x) => x.it.id === id);

/* ---------- control builders ---------- */
function card(it, withStar = true) {
  const c = el('div', 'card'); c.dataset.id = it.id;
  const text = el('div', 'text');
  text.append(el('div', 'label', it.label));
  if (it.desc) text.append(el('div', 'desc', it.desc));
  const ctl = el('div', 'control');
  c.append(text, ctl);
  if (withStar && it.type !== 'custom') ctl.append(starBtn(it.id));
  return { c, ctl, text };
}
function starBtn(id) {
  const b = el('button', 'star', prefs.get('favs').includes(id) ? '★' : '☆');
  b.title = 'Pin to Home';
  b.classList.toggle('on', prefs.get('favs').includes(id));
  b.onclick = (e) => {
    e.stopPropagation();
    const f = prefs.get('favs');
    const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
    prefs.set('favs', next);
    b.textContent = next.includes(id) ? '★' : '☆'; b.classList.toggle('on', next.includes(id));
    toast(next.includes(id) ? 'Pinned to Home' : 'Unpinned');
  };
  return b;
}

function buildToggle(it) {
  const { c, ctl } = card(it);
  const sw = el('label', 'switch');
  const input = el('input'); input.type = 'checkbox'; input.disabled = true;
  sw.append(input, el('span', 'track'), el('span', 'thumb'));
  ctl.append(sw);
  (it.load ? it.load() : call('toggleGet', { id: it.id }))
    .then((v) => { input.checked = !!v; input.disabled = false; if (it.id === 'darkMode') applyTheme(!!v); })
    .catch(() => { c.querySelector('.desc')?.remove(); c.querySelector('.text').append(el('div', 'desc', 'Not available on this PC')); });
  input.onchange = async () => {
    const v = input.checked; input.disabled = true;
    try {
      await guard(() => (it.save ? it.save(v) : call('toggleSet', { id: it.id, value: v })), 'Saved');
      if (it.id === 'darkMode') applyTheme(v);
    } catch (_) { input.checked = !v; }
    input.disabled = false;
  };
  return c;
}

function buildSlider(it) {
  const { c, ctl } = card(it);
  const lo = it.min ?? 0, hi = it.max ?? 100, unit = it.unit ?? '%';
  const r = el('input'); r.type = 'range'; r.min = lo; r.max = hi; r.disabled = true;
  const val = el('span', 'value', '–');
  ctl.append(r, val);
  const fill = () => r.style.setProperty('--fill', ((r.value - lo) / (hi - lo)) * 100 + '%');
  it.load().then((v) => { r.value = v; fill(); val.textContent = v + unit; r.disabled = false; })
    .catch(() => { r.disabled = true; val.textContent = 'n/a'; c.querySelector('.text').append(el('div', 'desc', 'Not supported on this device')); });
  let t;
  r.oninput = () => { fill(); val.textContent = r.value + unit; clearTimeout(t); t = setTimeout(() => guard(() => it.save(Number(r.value))).catch(() => {}), 250); };
  return c;
}

function buildButton(it) {
  const { c, ctl } = card(it);
  const b = el('button', 'btn', it.btn || 'Run');
  b.onclick = async () => {
    b.disabled = true;
    try {
      let msg;
      if (it.run === 'export') msg = await exportPrefs();
      else if (it.run === 'import') msg = await importPrefs();
      else msg = await it.run();
      toast(typeof msg === 'string' ? msg : 'Done');
    } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method 'call': (Error: )?/, ''), true); }
    b.disabled = false;
  };
  ctl.append(b);
  return c;
}

function buildSeg(it) {
  const { c, ctl } = card(it);
  const seg = el('div', 'seg'); const btns = {};
  it.options.forEach(([v, name]) => {
    const b = el('button', '', name); btns[v] = b;
    b.onclick = async () => {
      try { await guard(() => it.save(v), 'Applied'); seg.querySelectorAll('button').forEach((x) => x.classList.remove('active')); b.classList.add('active'); } catch (_) {}
    };
    seg.append(b);
  });
  if (it.load) it.load().then((v) => btns[String(v).trim()]?.classList.add('active')).catch(() => {});
  ctl.append(seg);
  return c;
}

function buildAccent(it) {
  const { c, ctl } = card(it, true);
  const w = el('div', 'swatches');
  ACCENTS.forEach((col) => {
    const s = el('div', 'swatch'); s.style.background = col; s.title = col;
    s.classList.toggle('active', prefs.get('accent') === col);
    s.onclick = () => { prefs.set('accent', col); applyAccent(col); w.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active')); s.classList.add('active'); };
    w.append(s);
  });
  ctl.prepend(w);
  return c;
}

function buildItem(it) {
  switch (it.type) {
    case 'toggle': return buildToggle(it);
    case 'slider': return buildSlider(it);
    case 'button': return buildButton(it);
    case 'seg': return buildSeg(it);
    case 'accent': return buildAccent(it);
    case 'custom': return buildCustom(it);
  }
}

/* ---------- custom blocks ---------- */
function rows(container, data, mk) {
  container.replaceChildren();
  if (!data.length) { container.append(el('div', 'muted', 'Nothing to show.')); return; }
  data.forEach((d) => container.append(mk(d)));
}
const row = (main, sub, right) => {
  const r = el('div', 'list-row');
  const l = el('div'); l.append(el('div', '', main)); if (sub) l.append(el('div', 'sub', sub));
  r.append(l); if (right != null) r.append(el('div', 'muted', right));
  return r;
};
const fail = (box, msg = 'Not available on this PC') => box.replaceChildren(el('div', 'muted', msg));

const CUSTOM = {
  displays(box) {
    call('display').then((d) => rows(box, d, (x) => row(x.name, `${x.w} × ${x.h}`, `${x.hz} Hz`))).catch(() => fail(box));
  },
  battery(box) {
    call('battery').then((b) => {
      if (!b) return box.replaceChildren(el('div', 'muted', 'No battery detected (desktop PC).'));
      const bar = el('div', 'bar'); const i = el('i'); i.style.width = b.percent + '%'; if (b.percent < 20) i.className = 'crit'; bar.append(i);
      box.replaceChildren(row(`Battery ${b.percent}%`, b.charging ? 'Charging' : 'On battery'), bar);
    }).catch(() => fail(box));
  },
  powerplans(box) {
    const load = () => call('powerPlans').then((plans) => {
      const seg = el('div', 'seg');
      plans.forEach((p) => {
        const b = el('button', p.active ? 'active' : '', p.name);
        b.onclick = () => guard(() => call('powerSet', { guid: p.guid }), 'Power plan: ' + p.name).then(load).catch(() => {});
        seg.append(b);
      });
      box.replaceChildren(el('div', 'muted', 'Power plan'), seg); box.style.gap = '8px';
    }).catch(() => fail(box));
    load();
  },
  drives(box) {
    call('drives').then((ds) => {
      box.replaceChildren();
      ds.forEach((d) => {
        const total = d.used + d.free, pct = Math.round((d.used / total) * 100);
        const bar = el('div', 'bar'); const i = el('i'); i.style.width = pct + '%'; if (pct > 90) i.className = 'crit'; else if (pct > 75) i.className = 'warn'; bar.append(i);
        box.append(row(`Local disk (${d.name}:)`, `${fmtBytes(d.used)} used of ${fmtBytes(total)}`, fmtBytes(d.free) + ' free'), bar);
      });
    }).catch(() => fail(box));
  },
  about(box) {
    call('sysinfo').then((s) => {
      const copy = el('button', 'btn', 'Copy specs');
      const text = `${s.device}\n${s.os} (build ${s.build})\n${s.cpu} (${s.cores}C/${s.threads}T)\n${s.gpu}\n${s.ramGB} GB RAM\n${s.maker} ${s.model}`;
      copy.onclick = () => navigator.clipboard.writeText(text).then(() => toast('Specs copied'), () => toast('Clipboard blocked', true));
      box.replaceChildren(
        row('Device name', null, s.device), row('Processor', null, `${s.cpu}`), row('Cores / threads', null, `${s.cores} / ${s.threads}`),
        row('Graphics', null, s.gpu), row('Installed RAM', null, s.ramGB + ' GB'), row('Manufacturer / model', null, `${s.maker} ${s.model}`),
        row('Windows', null, `${s.os}`), row('Version / build', null, `${s.version} (${s.arch})`), row('BIOS', null, s.bios), copy
      );
    }).catch(() => fail(box));
  },
  adapters(box) {
    call('network').then((a) => rows(box, a, (x) => row(x.name, `${x.mac} · ${x.speed}`, x.status === 'Up' ? (x.ip || 'Connected') : x.status))).catch(() => fail(box));
  },
  applist(box) {
    call('apps').then((list) => {
      const f = el('input', 'filter'); f.placeholder = `Filter ${list.length} apps...`;
      const body = el('div'); body.style.cssText = 'max-height:420px;overflow-y:auto;padding-right:6px';
      const draw = () => rows(body, list.filter((a) => a.name.toLowerCase().includes(f.value.toLowerCase())).slice(0, 200), (a) => { const r = row(a.name, a.publisher || '', a.version || ''); const u = el('button', 'btn danger', 'Uninstall'); u.style.marginLeft = '10px'; u.onclick = async () => { if (!confirm(`Uninstall "${a.name}"? Its own uninstaller will open.`)) return; try { await guard(() => call('appUninstall', { name: a.name }), 'Started the uninstaller for ' + a.name); } catch (_) {} }; r.append(u); return r; });
      f.oninput = draw; draw(); box.replaceChildren(f, body);
    }).catch(() => fail(box));
  },
  startuplist(box) {
    call('startup').then((s) => rows(box, s, (x) => row(x.name, x.command, x.location))).catch(() => fail(box));
  },
  dashboard(box) { buildDashboard(box); }
};

function buildCustom(it) {
  const c = el('div', 'card column'); c.dataset.id = it.id;
  const box = el('div'); box.style.display = 'flex'; box.style.flexDirection = 'column';
  c.append(box);
  if (it.render === 'dashboard') { c.className = ''; c.style.marginBottom = '0'; }
  CUSTOM[it.render](box);
  return c;
}

/* ---------- dashboard ---------- */
let statsTimer;
const SVGNS = 'http://www.w3.org/2000/svg';
const RING_C = 2 * Math.PI * 34;
function ring() {
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 80 80'); svg.setAttribute('class', 'ring');
  const bg = document.createElementNS(SVGNS, 'circle'); const fg = document.createElementNS(SVGNS, 'circle');
  [bg, fg].forEach((c) => { c.setAttribute('cx', 40); c.setAttribute('cy', 40); c.setAttribute('r', 34); c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', 7); c.setAttribute('stroke-linecap', 'round'); });
  bg.setAttribute('class', 'ring-bg'); fg.setAttribute('class', 'ring-fg'); fg.setAttribute('stroke-dasharray', RING_C); fg.setAttribute('stroke-dashoffset', RING_C);
  fg.setAttribute('transform', 'rotate(-90 40 40)');
  svg.append(bg, fg); return { svg, set: (p) => { fg.setAttribute('stroke-dashoffset', RING_C * (1 - Math.max(0, Math.min(100, p)) / 100)); fg.setAttribute('class', 'ring-fg' + (p > 90 ? ' crit' : p > 75 ? ' warn' : '')); } };
}
function buildDashboard(box) {
  box.replaceChildren();

  // hero
  const hero = el('div', 'hero');
  const h = new Date().getHours();
  const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const hl = el('div'); const title = el('div', 'hero-title', greet); const sub = el('div', 'hero-sub', 'Your PC is running smoothly');
  hl.append(title, sub);
  const clock = el('div', 'hero-clock');
  const tickClock = () => { const d = new Date(); clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tickClock();
  hero.append(hl, clock);
  call('sysinfo').then((s) => { sub.textContent = `${s.device} · ${s.os.replace('Microsoft ', '')}`; }).catch(() => {});

  // quick actions
  const quick = el('div', 'quick');
  [['🌙 Dark / light', async () => { const cur = document.documentElement.dataset.theme === 'dark'; await guard(() => call('toggleSet', { id: 'darkMode', value: !cur })); applyTheme(!cur); }],
   ['🔇 Mute', async () => { const v = await call('volumeGet'); await guard(() => call('muteSet', { value: !v.muted }), v.muted ? 'Unmuted' : 'Muted'); }],
   ['🧹 Clean temp', async () => { toast('Freed ' + fmtBytes(await guard(() => call('cleanTemp')))); }],
   ['🔄 Updates', async () => go('update')]
  ].forEach(([name, fn]) => { const b = el('button', 'btn', name); b.onclick = () => fn().catch(() => {}); quick.append(b); });

  // gauges
  const mkTile = (label) => {
    const t = el('div', 'tile'); const r = ring();
    const wrap = el('div', 'ring-wrap'); const pct = el('div', 'ring-pct', '–'); wrap.append(r.svg, pct);
    const info = el('div', 'tile-info'); const v = el('div', 't-value', '–'); info.append(el('div', 't-label', label), v);
    t.append(wrap, info); return { t, v, pct, r, info };
  };
  const cpu = mkTile('CPU'), ram = mkTile('Memory'), disk = mkTile('System drive');
  const spark = document.createElementNS(SVGNS, 'svg'); spark.setAttribute('class', 'spark'); spark.setAttribute('viewBox', '0 0 100 30'); spark.setAttribute('preserveAspectRatio', 'none');
  const area = document.createElementNS(SVGNS, 'polygon'); area.setAttribute('class', 'spark-area');
  const line = document.createElementNS(SVGNS, 'polyline'); line.setAttribute('class', 'spark-line');
  spark.append(area, line); cpu.info.append(spark);
  const grid = el('div', 'grid'); grid.append(cpu.t, ram.t, disk.t);

  call('drives').then((ds) => { const d = ds.find((x) => x.name === 'C') || ds[0]; const p = Math.round((d.used / (d.used + d.free)) * 100); disk.v.textContent = fmtBytes(d.free) + ' free'; disk.pct.textContent = p + '%'; disk.r.set(p); }).catch(() => (disk.v.textContent = 'n/a'));
  const hist = [];
  const tick = async () => {
    if (!document.body.contains(grid)) return clearInterval(statsTimer);
    tickClock();
    try {
      const s = await call('stats');
      cpu.v.textContent = 'Processor load'; cpu.pct.textContent = s.cpu + '%'; cpu.r.set(s.cpu);
      const rp = Math.round((s.ramUsed / s.ramTotal) * 100);
      ram.v.textContent = `${(s.ramUsed / GB).toFixed(1)} of ${(s.ramTotal / GB).toFixed(0)} GB`; ram.pct.textContent = rp + '%'; ram.r.set(rp);
      hist.push(s.cpu); if (hist.length > 40) hist.shift();
      const pts = hist.map((v, i) => `${(i / Math.max(hist.length - 1, 1)) * 100},${29 - (v / 100) * 27}`);
      line.setAttribute('points', pts.join(' ')); area.setAttribute('points', `0,30 ${pts.join(' ')} 100,30`);
    } catch (_) {}
  };
  clearInterval(statsTimer); setTimeout(tick, 0); statsTimer = setInterval(tick, 1500); // first refresh runs once the card is on the page

  box.append(hero, quick, el('div', 'section-title', 'Performance'), grid);
  const favs = prefs.get('favs').map(findItem).filter(Boolean);
  if (favs.length) {
    box.append(el('div', 'section-title', 'Pinned'));
    favs.forEach(({ it }) => box.append(buildItem(it)));
  }
}

/* ---------- extra features ---------- */
const safe = async (fn) => { try { await fn(); return 1; } catch (_) { return 0; } };
const aliveIn = (node) => document.body.contains(node);

/* Profiles: snapshot of the current setup (the backend runs profiles) */
const PROFILE_TOGGLES = ['darkMode', 'transparency', 'adId', 'tailored', 'suggestions', 'clipboardHistory', 'gameMode', 'gameBar'];
async function snapshotProfile(name) {
  const snap = { name, toggles: {} };
  for (const id of PROFILE_TOGGLES) { try { snap.toggles[id] = await call('toggleGet', { id }); } catch (_) {} }
  try { const v = await call('volumeGet'); snap.volume = v.volume; snap.muted = v.muted; } catch (_) {}
  try { snap.brightness = await call('brightnessGet'); } catch (_) {}
  try { const a = (await call('powerPlans')).find((x) => x.active); if (a) snap.plan = a.guid; } catch (_) {}
  return snap;
}

/* Focus timer */
const focusSession = { end: 0, timer: null, wasMuted: false };
CUSTOM.focustimer = (box) => {
  const mins = el('input', 'filter'); mins.type = 'number'; mins.min = 1; mins.max = 180; mins.value = 25; mins.style.cssText = 'width:90px;min-width:90px;flex:none;margin:0';
  const label = el('div', 'focus-time', '25:00');
  const btn = el('button', 'btn primary', 'Start');
  const note = el('div', 'muted', 'Mutes your PC while the timer runs, then restores your sound when it ends.');
  const row1 = el('div', 'savebar'); row1.append(el('span', 'muted', 'Minutes'), mins, btn);
  box.append(label, row1, note);
  const paint = () => {
    if (!aliveIn(label)) return;
    const left = Math.max(0, focusSession.end - Date.now());
    label.textContent = focusSession.timer ? `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : `${String(mins.value).padStart(2, '0')}:00`;
    btn.textContent = focusSession.timer ? 'Stop' : 'Start';
  };
  const stop = async (done) => {
    clearInterval(focusSession.timer); focusSession.timer = null;
    await safe(() => call('muteSet', { value: focusSession.wasMuted }));
    if (done) { toast('Focus session complete 🎉'); try { new Notification('Focus session complete', { body: 'Time for a break.' }); } catch (_) {} }
    paint();
  };
  btn.onclick = async () => {
    if (focusSession.timer) return stop(false);
    focusSession.wasMuted = await call('volumeGet').then((v) => v.muted).catch(() => false);
    await safe(() => call('muteSet', { value: true }));
    focusSession.end = Date.now() + Math.max(1, Math.min(180, Number(mins.value) || 25)) * 60000;
    focusSession.timer = setInterval(() => { if (Date.now() >= focusSession.end) stop(true); else paint(); }, 500); paint();
  };
  mins.oninput = paint; paint();
  if (focusSession.timer) { clearInterval(focusSession.timer); focusSession.timer = setInterval(() => { if (Date.now() >= focusSession.end) stop(true); else paint(); }, 500); }
};

/* Privacy score */
const PRIVACY_CHECKS = [['adId', 'Advertising ID is off'], ['tailored', 'Tailored experiences are off'], ['suggestions', 'Start menu ads and silent installs are off']];
CUSTOM.privacyscore = (box) => {
  box.replaceChildren(el('div', 'muted', 'Checking...'));
  Promise.all(PRIVACY_CHECKS.map(([id]) => call('toggleGet', { id }))).then((vals) => {
    const good = vals.filter((v) => !v).length, pct = Math.round((good / PRIVACY_CHECKS.length) * 100);
    const r = ring(); const wrap = el('div', 'ring-wrap'); const num = el('div', 'ring-pct', pct); wrap.append(r.svg, num);
    const list = el('div'); list.style.flex = 1;
    PRIVACY_CHECKS.forEach(([, name], i) => list.append(row((vals[i] ? '⚠️ ' : '✅ ') + name)));
    const fix = el('button', 'btn primary', 'Harden everything');
    fix.disabled = good === PRIVACY_CHECKS.length;
    fix.onclick = async () => { fix.disabled = true; for (const [id] of PRIVACY_CHECKS) await safe(() => call('toggleSet', { id, value: false })); toast('Privacy hardened'); go('privacy'); };
    const wrapRow = el('div', 'tile'); wrapRow.style.cssText = 'border:0;background:none;box-shadow:none;padding:0;backdrop-filter:none;animation:none'; wrapRow.append(wrap, list, fix);
    box.replaceChildren(wrapRow); setTimeout(() => r.set(pct), 50);
  }).catch(() => fail(box));
};

/* AI status banner: tells the person plainly where they stand */
CUSTOM.aibanner = (box) => {
  const card = el('div', 'list-row'); card.style.cssText = 'display:block;padding:18px;line-height:1.5';
  const head = el('div', '', ''); head.style.cssText = 'font-size:18px;font-weight:700;margin-bottom:6px';
  const body = el('div', 'muted', 'Vorynth never turns an AI feature on for you. Windows may already allow some of them. When a switch is ON, that Windows feature is allowed to run, and some of them send what you type or see to an online service. Our recommended default is OFF: use the button below, or switch each one yourself at any time.');
  const state = el('div', ''); state.style.cssText = 'margin-top:10px;font-weight:600';
  const off = el('button', 'btn', 'Turn all AI features off'); off.style.cssText = 'margin-top:12px;display:none'; off.onclick = async () => { off.disabled = true; try { await call('applyPreset', { name: 'aiAllOff' }); toast('All AI features are off'); go(currentPage); } catch (e) { toast(String(e.message || e), true); } off.disabled = false; };
  const onb = el('button', 'btn', 'Turn them back on'); onb.id = 'ai-banner-on'; onb.style.cssText = 'margin-top:12px;display:none'; onb.onclick = async () => { if (!confirm('Allow all Windows AI features again?')) return; onb.disabled = true; try { await call('applyPreset', { name: 'aiAllOn' }); toast('All AI features are allowed again'); go(currentPage); } catch (e) { toast(String(e.message || e), true); } onb.disabled = false; };
  card.append(head, body, state, off, onb); box.append(card);
  const ids = ['aiCopilot', 'copilotButton', 'aiRecall', 'aiEdge', 'aiClickToDo', 'webSearch'];
  const refresh = () => call('toggleGetMany', { ids }).then((r) => { const on = ids.filter((id) => r[id]).length; head.textContent = on === 0 ? '🔒 AI features are OFF' : `⚠️ ${on} of ${ids.length} AI features are currently allowed on this PC`; off.style.display = on === 0 ? 'none' : 'inline-block'; onb.style.display = on === 0 ? 'inline-block' : 'none'; state.textContent = on === 0 ? 'Good: no AI feature on this list is allowed to run.' : 'Allowed now: ' + ids.filter((id) => r[id]).map((id) => ({ aiCopilot: 'Copilot', copilotButton: 'Copilot button', aiRecall: 'Recall', aiEdge: 'Edge AI sidebar', aiClickToDo: 'Click to Do', webSearch: 'Web search results' }[id])).join(', ') + '.'; }).catch(() => { head.textContent = 'AI status unavailable'; });
  refresh(); const t = setInterval(() => { if (!box.isConnected) return clearInterval(t); refresh(); }, 2500);
};

/* Process manager */
CUSTOM.processes = (box) => {
  const body = el('div'); const bar = el('div', 'savebar'); const hint = el('span', 'muted', 'Top 15 by memory. Auto-refreshes every 4 seconds.');
  const refresh = el('button', 'btn', 'Refresh'); bar.append(hint, refresh); box.append(bar, body);
  const load = () => call('processes').then((list) => {
    body.replaceChildren();
    const max = Math.max(...list.map((p) => p.mem), 1);
    list.forEach((p) => {
      const r = el('div', 'list-row proc'); const l = el('div'); l.style.flex = 1;
      l.append(el('div', '', p.name + (p.count > 1 ? `  ×${p.count}` : '')));
      const b = el('div', 'bar'); const i = el('i'); i.style.width = (p.mem / max) * 100 + '%'; b.append(i); b.style.marginTop = '6px'; l.append(b);
      const mem = el('div', 'muted', fmtBytes(p.mem)); mem.style.minWidth = '80px'; mem.style.textAlign = 'right';
      const kill = el('button', 'btn danger', 'End task');
      kill.onclick = async () => { if (!confirm(`End all "${p.name}" processes? Unsaved work in them will be lost.`)) return; await guard(() => call('killProcess', { name: p.name }), p.name + ' ended').catch(() => {}); load(); };
      r.append(l, mem, kill); body.append(r);
    });
  }).catch(() => fail(body));
  refresh.onclick = load; load();
  const t = setInterval(() => (aliveIn(body) ? load() : clearInterval(t)), 4000);
};

/* Ping monitor */
CUSTOM.pingmon = (box) => {
  const bar = el('div', 'savebar'); bar.append(el('div', 'label', 'Ping monitor'));
  const host = el('input', 'filter'); host.value = '1.1.1.1'; host.style.cssText = 'width:180px;margin:0';
  const btn = el('button', 'btn primary', 'Start');
  const stats = el('div', 'muted', 'Press Start to measure latency.');
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('class', 'chart'); svg.setAttribute('viewBox', '0 0 200 50'); svg.setAttribute('preserveAspectRatio', 'none');
  const area = document.createElementNS(SVGNS, 'polygon'); area.setAttribute('class', 'spark-area'); const line = document.createElementNS(SVGNS, 'polyline'); line.setAttribute('class', 'spark-line');
  svg.append(area, line); bar.append(host, btn);
  box.append(bar, svg, stats);
  let timer = null; const hist = [];
  const stop = () => { clearInterval(timer); timer = null; btn.textContent = 'Start'; };
  const tick = async () => {
    if (!aliveIn(svg)) return stop();
    const ms = await call('ping', { host: host.value.trim() }).catch((e) => { stop(); toast(String(e.message).replace(/^Error invoking remote method 'call': (Error: )?/, ''), true); return undefined; });
    if (ms === undefined) return;
    hist.push(ms); if (hist.length > 60) hist.shift();
    const ok = hist.filter((v) => v != null); const max = Math.max(50, ...ok);
    const pts = hist.map((v, i) => `${(i / 59) * 200},${v == null ? 49 : 48 - (v / max) * 44}`);
    line.setAttribute('points', pts.join(' ')); area.setAttribute('points', `0,50 ${pts.join(' ')} ${((hist.length - 1) / 59) * 200},50`);
    const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : 0;
    const jitter = ok.length > 1 ? Math.round(ok.slice(1).reduce((a, v, i) => a + Math.abs(v - ok[i]), 0) / (ok.length - 1)) : 0;
    stats.textContent = `Now ${ms == null ? 'timeout' : ms + ' ms'} · avg ${avg} ms · min ${ok.length ? Math.min(...ok) : 0} · max ${ok.length ? Math.max(...ok) : 0} · jitter ${jitter} ms · loss ${Math.round(((hist.length - ok.length) / hist.length) * 100)}%`;
  };
  btn.onclick = () => { if (timer) return stop(); hist.length = 0; btn.textContent = 'Stop'; tick(); timer = setInterval(tick, 1000); };
};

/* DNS benchmark */
CUSTOM.dnsbench = (box) => {
  const btn = el('button', 'btn primary', 'Run benchmark'); const out = el('div'); out.style.marginTop = '10px';
  box.append(el('div', 'label', 'DNS speed test'), el('div', 'muted', 'Times 5 popular lookups against each provider. System default may look fast because of caching.'), btn, out); btn.style.alignSelf = 'flex-start'; btn.style.marginTop = '10px';
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Testing...'; out.replaceChildren(el('div', 'muted', 'This takes about 10 seconds.'));
    try {
      const res = (await call('dnsBench')).filter((r) => r.ms != null).sort((a, b) => a.ms - b.ms);
      if (!res.length) throw new Error('No DNS server answered');
      const max = Math.max(...res.map((r) => r.ms), 1); out.replaceChildren();
      res.forEach((r, i) => {
        const rw = el('div', 'list-row'); const l = el('div'); l.style.flex = 1; l.append(el('div', '', (i === 0 ? '🏆 ' : '') + r.name));
        const b = el('div', 'bar'); const f = el('i'); f.style.width = (r.ms / max) * 100 + '%'; b.append(f); b.style.marginTop = '6px'; l.append(b);
        const t = el('div', 'muted', r.ms + ' ms'); t.style.minWidth = '60px'; t.style.textAlign = 'right'; rw.append(l, t); out.append(rw);
      });
      const best = res.find((r) => r.preset !== 'auto');
      if (best) { const use = el('button', 'btn', `Use ${best.name}`); use.style.marginTop = '10px'; use.onclick = () => guard(() => call('dnsSet', { preset: best.preset }), best.name + ' DNS applied').catch(() => {}); out.append(use); }
    } catch (e) { out.replaceChildren(el('div', 'muted', 'Benchmark failed: ' + String(e.message).replace(/^Error invoking remote method 'call': (Error: )?/, ''))); }
    btn.disabled = false; btn.textContent = 'Run benchmark';
  };
};

/* Cleanup center */
CUSTOM.cleanup = (box) => {
  const draw = async () => {
    const [tmp, bin] = await Promise.all([call('tempSize').catch(() => null), call('recycleSize').catch(() => null)]);
    box.replaceChildren();
    const line = (name, size, label, fn) => {
      const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', name), el('div', 'sub', size == null ? 'Unavailable' : fmtBytes(size)));
      const b = el('button', 'btn', label); b.disabled = size == null || size === 0;
      b.onclick = async () => { b.disabled = true; await guard(fn, name + ' cleaned').catch(() => {}); draw(); };
      r.append(l, b); return r;
    };
    box.append(line('Temporary files', tmp, 'Clean', () => call('cleanTemp')), line('Recycle Bin', bin, 'Empty', () => call('emptyBin')));
    const total = (tmp || 0) + (bin || 0); box.append(el('div', 'muted', 'Reclaimable now: ' + fmtBytes(total)));
  };
  draw();
};

/* Disk health */
CUSTOM.diskhealth = (box) => {
  call('diskHealth').then((d) => rows(box, d, (x) => {
    const r = row(x.name, `${x.type} · ${fmtBytes(x.size)}`); const ok = x.health === 'Healthy';
    const pill = el('span', 'pill', (ok ? '✅ ' : '⚠️ ') + x.health); r.append(pill); return r;
  })).catch(() => fail(box, 'Disk health needs Windows 10 or 11 with Storage Spaces support'));
};

/* Auto dark mode schedule (Windows Task Scheduler, works when the app is closed) */
CUSTOM.autotheme = (box) => {
  box.style.gap = '8px';
  call('autoThemeGet').then((cur) => {
    const sw = el('label', 'switch'); const input = el('input'); input.type = 'checkbox'; input.checked = cur.enabled; sw.append(input, el('span', 'track'), el('span', 'thumb'));
    const top = el('div', 'savebar'); top.style.justifyContent = 'space-between'; top.append(el('div', '', 'Auto dark mode schedule'), sw);
    const t = (v) => { const i = el('input', 'filter'); i.type = 'time'; i.value = v; i.style.cssText = 'width:130px;margin:0'; return i; };
    const light = t(cur.lightAt || '07:00'), dark = t(cur.darkAt || '19:00');
    const times = el('div', 'savebar'); times.append(el('span', 'muted', '☀️ Light at'), light, el('span', 'muted', '🌙 Dark at'), dark);
    const apply = async (enabled) => { try { await guard(() => call('autoThemeSet', { enabled, lightAt: light.value, darkAt: dark.value }), enabled ? 'Schedule saved' : 'Schedule removed'); } catch (_) { input.checked = !enabled; } };
    input.onchange = () => apply(input.checked); light.onchange = dark.onchange = () => input.checked && apply(true);
    box.replaceChildren(top, times, el('div', 'muted', 'Uses Windows Task Scheduler, so it keeps working after you close this app.'));
  }).catch(() => fail(box));
};

/* ---------- Windows Update ---------- */
const fmtWhen = (v) => { if (!v) return 'Unknown'; const d = new Date(String(v).replace(' ', 'T')); return isNaN(d) ? String(v) : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
CUSTOM.wuinfo = (box) => {
  call('wuInfo').then((u) => {
    const kids = [];
    if (u.reboot) {
      const banner = el('div', 'banner'); banner.append(el('div', '', '⚠️ A restart is needed to finish installing updates.'));
      const rb = el('button', 'btn primary', 'Restart now'); rb.onclick = async () => { if (confirm('Restart your PC now? Save your work first.')) await guard(() => call('powerAction', { action: 'restart', minutes: 0 })).catch(() => {}); };
      banner.append(rb); kids.push(banner);
    }
    kids.push(row(u.product, `Version ${u.display || '?'} · build ${u.build}.${u.ubr}`), row('Windows Update service', null, `${u.service} (${u.startType})`), row('Last successful check', null, fmtWhen(u.lastCheck)));
    box.replaceChildren(...kids);
  }).catch(() => fail(box));
};
CUSTOM.wuhistory = (box) => {
  const names = { 1: '⏳ In progress', 2: '✅ Installed', 3: '⚠️ Installed with errors', 4: '❌ Failed', 5: '⛔ Cancelled' };
  call('wuHistory').then((h) => rows(box, h, (x) => { const r = row(x.title, x.date); r.append(el('span', 'pill', names[x.result] || '—')); return r; })).catch(() => fail(box));
};

/* ---------- Devices ---------- */
CUSTOM.devicelist = (box) => {
  const labels = { Mouse: '🖱️ Mouse', Keyboard: '⌨️ Keyboard', Monitor: '🖥️ Monitors', Camera: '📷 Cameras', Image: '📷 Cameras & scanners', Bluetooth: '🎧 Bluetooth', AudioEndpoint: '🔊 Audio', PrintQueue: '🖨️ Printers' };
  call('devices').then((d) => {
    if (!d.length) return box.replaceChildren(el('div', 'muted', 'No devices found.'));
    box.replaceChildren();
    const groups = {}; d.forEach((x) => (groups[x.cls] ||= []).push(x.name));
    Object.entries(groups).forEach(([cls, names]) => { box.append(el('div', 'label', labels[cls] || cls)); names.forEach((n) => box.append(row(n))); });
  }).catch(() => fail(box));
};

/* ---------- Startup manager ---------- */
CUSTOM.startupmgr = (box) => {
  call('startupList').then((list) => {
    if (!list.length) return box.replaceChildren(el('div', 'muted', 'No startup apps registered.'));
    box.replaceChildren(el('div', 'muted', 'Turn off what you do not need to speed up sign-in. Apps keep working, they just will not start by themselves.'));
    list.sort((a, b) => (a.scope === b.scope ? a.name.localeCompare(b.name) : a.scope === 'user' ? -1 : 1));
    list.forEach((x) => {
      const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0;
      l.append(el('div', '', x.name)); const cmd = el('div', 'sub', x.command); cmd.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px'; cmd.title = x.command; l.append(cmd);
      const sw = el('label', 'switch'); const input = el('input'); input.type = 'checkbox'; input.checked = x.enabled; sw.append(input, el('span', 'track'), el('span', 'thumb'));
      if (x.scope === 'machine') { input.disabled = true; sw.title = 'Installed for all users. Change it in Task Manager as administrator.'; const tag = el('span', 'pill', 'All users'); const rt = el('div'); rt.style.cssText = 'display:flex;gap:10px;align-items:center'; rt.append(tag, sw); r.append(l, rt); }
      else r.append(l, sw);
      input.onchange = async () => { const v = input.checked; input.disabled = true; try { await guard(() => call('startupSet', { name: x.name, enabled: v }), v ? x.name + ' will start with Windows' : x.name + ' turned off at startup'); } catch (_) { input.checked = !v; } input.disabled = false; };
      box.append(r);
    });
  }).catch(() => fail(box));
};

/* ---------- Time & language ---------- */
CUSTOM.timeinfo = (box) => {
  call('timeInfo').then((t) => box.replaceChildren(row('Time zone', t.tzName), row('Region format', null, t.culture), row('Windows display language', null, t.ui), row('Keyboard / input languages', null, t.langs || '—'), row('Local time', null, t.now))).catch(() => fail(box));
};
CUSTOM.timezone = (box) => {
  Promise.all([call('timeZones'), call('timeInfo')]).then(([zones, cur]) => {
    const sel = el('select', 'filter'); sel.style.margin = 0;
    zones.forEach((z) => { const o = el('option', '', z.name); o.value = z.id; if (z.id === cur.tz) o.selected = true; sel.append(o); });
    const btn = el('button', 'btn', 'Apply time zone');
    btn.onclick = async () => { btn.disabled = true; try { await guard(() => call('timeZoneSet', { id: sel.value }), 'Time zone changed'); } catch (_) {} btn.disabled = false; };
    const bar = el('div', 'savebar'); bar.append(sel, btn);
    box.replaceChildren(el('div', 'label', 'Change time zone'), el('div', 'muted', 'Windows will ask for administrator permission.'), bar);
  }).catch(() => fail(box));
};

/* ---------- Accounts & power ---------- */
CUSTOM.accountinfo = (box) => {
  call('accountInfo').then((a) => box.replaceChildren(row('User name', null, a.user), row('Computer name', null, a.computer), row('Domain / workgroup', null, a.domain), row('Account type', null, a.admin ? 'Administrator' : 'Standard user'), row('Profile folder', null, a.profile))).catch(() => fail(box));
};
CUSTOM.poweractions = (box) => {
  box.style.gap = '12px';
  const minutes = el('input', 'filter'); minutes.type = 'number'; minutes.min = 0; minutes.max = 1440; minutes.value = 0; minutes.style.cssText = 'width:90px;min-width:90px;flex:none;margin:0';
  const actions = [
    ['🔒', 'Lock', 'Lock this PC now', 'lock', false, false], ['🚪', 'Sign out', 'Close your session', 'signout', true, false], ['😴', 'Sleep', 'Low power, instant wake', 'sleep', false, false],
    ['🧊', 'Hibernate', 'Save to disk and power off', 'hibernate', true, false], ['🔄', 'Restart', 'Can run after a delay', 'restart', true, true], ['⏻', 'Shut down', 'Can run after a delay', 'shutdown', true, true]
  ];
  const grid = el('div', 'pgrid');
  actions.forEach(([icon, name, desc, action, ask, delay]) => {
    const b = el('button', 'pcard'); b.append(el('div', 'picon', icon), el('div', 'pname', name), el('div', 'pdesc', desc));
    b.onclick = async () => {
      const m = delay ? Math.max(0, Number(minutes.value) || 0) : 0;
      if (ask && !confirm(m > 0 ? `${name} in ${m} minute${m > 1 ? 's' : ''}?` : `${name} now? Save your work first.`)) return;
      try { await guard(() => call('powerAction', { action, minutes: m }), m > 0 ? `${name} scheduled in ${m} min` : null); } catch (_) {}
    };
    grid.append(b);
  });
  const bar = el('div', 'savebar'); const cancel = el('button', 'btn', 'Cancel scheduled restart / shutdown');
  cancel.onclick = async () => { try { const r = await call('powerAction', { action: 'cancel' }); toast(r ? 'Scheduled action cancelled' : 'Nothing was scheduled'); } catch (e) { toast('Could not cancel', true); } };
  bar.append(el('span', 'muted', 'Delay for Restart and Shut down, in minutes (0 = now)'), minutes, cancel);
  box.append(grid, bar);
};

/* ---------- Labs: features Windows does not have ---------- */
const errText = (e) => String((e && e.message) || e).replace(/^Error invoking remote method 'call': (Error: )?/, '');
const small = (node) => { node.style.alignSelf = 'flex-start'; return node; };

/* Keep awake */
CUSTOM.keepawake = (box) => {
  box.style.gap = '10px';
  const status = el('div', '', 'Checking...'); const seg = el('div', 'seg'); const minsSel = el('select', 'filter'); minsSel.style.cssText = 'width:200px;margin:0';
  [[0, 'Until I turn it off'], [30, 'For 30 minutes'], [60, 'For 1 hour'], [120, 'For 2 hours'], [480, 'For 8 hours']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; minsSel.append(o); });
  const modes = [['off', 'Off'], ['display', 'Keep screen on'], ['system', 'Keep PC awake']]; const btns = {};
  let state = { mode: 'off', endsAt: 0 };
  const paint = () => {
    if (!document.body.contains(status)) return clearInterval(timer);
    Object.entries(btns).forEach(([m, b]) => b.classList.toggle('active', m === state.mode));
    if (state.mode === 'off') status.textContent = 'Off. Your PC follows its normal sleep settings.';
    else if (!state.endsAt) status.textContent = (state.mode === 'display' ? 'Screen will stay on' : 'PC will stay awake') + ' until you turn this off.';
    else { const left = Math.max(0, state.endsAt - Date.now()); status.textContent = `${state.mode === 'display' ? 'Screen stays on' : 'PC stays awake'} for another ${Math.floor(left / 3600000)}h ${String(Math.floor(left / 60000) % 60).padStart(2, '0')}m.`; if (left === 0) { state = { mode: 'off', endsAt: 0 }; } }
  };
  modes.forEach(([m, n]) => { const b = el('button', '', n); btns[m] = b; b.onclick = async () => { try { state = await guard(() => call('keepAwakeSet', { mode: m, minutes: Number(minsSel.value) }), m === 'off' ? 'Keep awake is off' : 'Keep awake is on'); } catch (_) {} paint(); }; seg.append(b); });
  const row1 = el('div', 'savebar'); row1.append(seg, minsSel);
  box.append(row1, status, el('div', 'muted', 'Works while Vorynth is running. You can minimize it, but closing it ends keep awake.'));
  call('keepAwakeGet').then((st) => { state = st; paint(); }).catch(() => fail(box)); const timer = setInterval(paint, 1000);
};

/* Internet speed test */
CUSTOM.speedtest = (box) => {
  const btn = small(el('button', 'btn primary', 'Run speed test')); const out = el('div'); out.style.marginTop = '10px'; const hist = el('div'); hist.style.marginTop = '10px';
  box.append(el('div', 'muted', 'Measures latency, download and upload using Cloudflare’s public speed servers. Uses about 40 MB of data.'), btn, out, hist);
  const showHist = () => { const h = prefs.get('speedHistory') || []; hist.replaceChildren(); if (h.length) { hist.append(el('div', 'label', 'Recent tests')); h.slice().reverse().forEach((r) => hist.append(row(new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), `ping ${r.latency} ms · jitter ${r.jitter} ms`, `↓ ${r.downMbps}  ↑ ${r.upMbps} Mbps`))); } };
  const tile = (label, value, unit) => { const t = el('div', 'tile'); t.style.display = 'block'; t.append(el('div', 't-label', label), el('div', 't-value', value), el('div', 'muted', unit)); t.querySelector('.t-value').style.cssText = 'font-size:28px;margin:4px 0'; return t; };
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Testing... (about 30 seconds)'; out.replaceChildren(el('div', 'muted', 'Measuring latency, then download, then upload...'));
    try {
      const r = await call('speedTest'); const g = el('div', 'grid'); g.append(tile('Download', r.downMbps, 'Mbps'), tile('Upload', r.upMbps, 'Mbps'), tile('Latency', r.latency, 'ms'), tile('Jitter', r.jitter, 'ms'));
      out.replaceChildren(g); prefs.set('speedHistory', [...(prefs.get('speedHistory') || []), r].slice(-5)); showHist();
    } catch (e) { out.replaceChildren(el('div', 'muted', "Speed test failed: " + errText(e) + '. Check your internet connection.')); }
    btn.disabled = false; btn.textContent = 'Run speed test';
  };
  showHist();
};

/* Which apps use the network */
CUSTOM.netactivity = (box) => {
  const btn = small(el('button', 'btn', 'Refresh')); const out = el('div'); box.append(el('div', 'muted', 'Apps talking to the internet right now, and which local ports are open (handy when a dev server says "port already in use").'), btn, out);
  const load = async () => {
    out.replaceChildren(el('div', 'muted', 'Looking...'));
    try {
      const d = await call('netActivity'); out.replaceChildren(); out.style.marginTop = '10px';
      out.append(el('div', 'label', `Active connections (${d.talkers.length} apps)`));
      if (!d.talkers.length) out.append(el('div', 'muted', 'No app has an outgoing connection right now.'));
      d.talkers.forEach((t) => out.append(row(t.proc || 'System', `${t.remotes} remote address${t.remotes === 1 ? '' : 'es'}`, t.connections + ' connections')));
      out.append(el('div', 'label', `Open ports (${d.listening.length})`));
      const lan = (a) => a === '0.0.0.0' || a === '::';
      d.listening.slice(0, 60).forEach((x) => { const r = row('Port ' + x.port, x.proc || 'System', lan(x.addr) ? 'Reachable from other devices' : 'This PC only'); out.append(r); });
      if (d.listening.length > 60) out.append(el('div', 'muted', `...and ${d.listening.length - 60} more.`));
    } catch (e) { out.replaceChildren(el('div', 'muted', errText(e))); }
  };
  btn.onclick = load; load();
};

/* Saved Wi-Fi passwords */
CUSTOM.wifipasswords = (box) => {
  const btn = small(el('button', 'btn', 'Reveal saved passwords')); const out = el('div'); out.style.marginTop = '10px'; let hideTimer;
  box.append(el('div', 'muted', 'Shows the passwords of Wi-Fi networks this PC has joined. Windows will ask for administrator permission. They hide again after one minute.'), btn, out);
  btn.onclick = async () => {
    btn.disabled = true; out.replaceChildren(el('div', 'muted', 'Waiting for permission...'));
    try {
      const list = await call('wifiPasswords'); out.replaceChildren();
      if (!list.length) out.append(el('div', 'muted', 'No saved Wi-Fi networks found.'));
      list.forEach((w) => {
        const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', w.name), el('div', 'sub', w.security || ''));
        const right = el('div'); right.style.cssText = 'display:flex;gap:10px;align-items:center';
        const qrBtn = el('button', 'btn', 'QR'); qrBtn.title = 'Show a QR code a phone can scan to join'; const qrBox = el('div'); qrBox.style.cssText = 'flex-basis:100%;display:none;padding:8px 0';
        qrBtn.onclick = async () => { if (qrBox.style.display === 'block') { qrBox.style.display = 'none'; return; } try { const svg = await call('wifiQr', { ssid: w.name, password: w.password || '' }); qrBox.replaceChildren(); const img = el('img'); img.alt = 'Wi-Fi QR code for ' + w.name; img.width = img.height = 200; img.style.cssText = 'background:#fff;padding:6px;border-radius:10px'; img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); qrBox.append(img, el('div', 'muted', 'Point a phone camera at this to join ' + w.name)); qrBox.style.display = 'block'; } catch (e) { toast(errText(e), true); } };
        if (w.password == null) right.append(el('span', 'muted', 'No password'), qrBtn);
        else { const code = el('code', '', w.password); code.style.cssText = 'user-select:all;padding:3px 8px;border-radius:6px;background:var(--track)'; const cp = el('button', 'btn', 'Copy'); cp.onclick = () => navigator.clipboard.writeText(w.password).then(() => toast('Password copied'), () => toast('Clipboard blocked', true)); right.append(code, cp, qrBtn); }
        r.style.flexWrap = 'wrap'; r.append(l, right, qrBox); out.append(r);
      });
      clearTimeout(hideTimer); hideTimer = setTimeout(() => out.replaceChildren(el('div', 'muted', 'Hidden again for safety.')), 60000);
    } catch (e) { out.replaceChildren(el('div', 'muted', "Couldn't read them: " + errText(e))); }
    btn.disabled = false;
  };
};

/* Disk analyzer */
CUSTOM.diskanalyzer = (box) => {
  const folders = [['downloads', 'Downloads'], ['documents', 'Documents'], ['desktop', 'Desktop'], ['videos', 'Videos'], ['pictures', 'Pictures'], ['music', 'Music'], ['localappdata', 'App data (Local)'], ['profile', 'Whole user folder (slow)']];
  const sel = el('select', 'filter'); sel.style.cssText = 'width:230px;margin:0'; folders.forEach(([v, n]) => { const o = el('option', '', n); o.value = v; sel.append(o); });
  const min = el('select', 'filter'); min.style.cssText = 'width:150px;margin:0'; [[100, 'Over 100 MB'], [500, 'Over 500 MB'], [1000, 'Over 1 GB'], [50, 'Over 50 MB']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; min.append(o); });
  const b1 = el('button', 'btn primary', 'Biggest folders'), b2 = el('button', 'btn primary', 'Find big files');
  const bar = el('div', 'savebar'); bar.append(sel, b1, min, b2); const out = el('div'); out.style.marginTop = '10px';
  box.append(el('div', 'muted', 'Find what is eating your disk. Deleting sends files to the Recycle Bin, so you can restore them.'), bar, out);
  const busy = (on, msg) => { [b1, b2].forEach((b) => (b.disabled = on)); if (msg) out.replaceChildren(el('div', 'muted', msg)); };
  b1.onclick = async () => {
    busy(true, 'Scanning... large folders can take a few minutes.');
    try {
      const list = await call('folderSizes', { key: sel.value }); out.replaceChildren(); const max = Math.max(...list.map((x) => x.size), 1);
      if (!list.length) out.append(el('div', 'muted', 'Nothing found.'));
      list.forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.style.flex = 1; l.append(el('div', '', x.name)); const b = el('div', 'bar'); const i = el('i'); i.style.width = (x.size / max) * 100 + '%'; b.append(i); b.style.marginTop = '6px'; l.append(b);
        const sz = el('div', 'muted', fmtBytes(x.size)); sz.style.cssText = 'min-width:80px;text-align:right'; const openBtn = el('button', 'btn', 'Open'); openBtn.onclick = () => guard(() => call('openPath', { path: x.path })).catch(() => {}); r.append(l, sz, openBtn); out.append(r); });
    } catch (e) { out.replaceChildren(el('div', 'muted', 'Scan failed: ' + errText(e))); }
    busy(false);
  };
  b2.onclick = async () => {
    busy(true, 'Searching for big files...');
    try {
      const list = await call('bigFiles', { key: sel.value, minMB: Number(min.value) }); out.replaceChildren();
      if (!list.length) out.append(el('div', 'muted', 'No files that big in here. 🎉'));
      list.forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', x.name)); const sub = el('div', 'sub', `${x.path} · ${x.date}`); sub.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:430px'; sub.title = x.path; l.append(sub);
        const sz = el('div', 'muted', fmtBytes(x.size)); sz.style.cssText = 'min-width:80px;text-align:right'; const show = el('button', 'btn', 'Show'); show.onclick = () => guard(() => call('revealFile', { path: x.path })).catch(() => {});
        const del = el('button', 'btn danger', 'Recycle'); del.onclick = async () => { if (!confirm(`Move "${x.name}" (${fmtBytes(x.size)}) to the Recycle Bin?`)) return; try { await guard(() => call('trashFile', { path: x.path }), 'Moved to the Recycle Bin'); r.remove(); } catch (_) {} };
        const act = el('div'); act.style.cssText = 'display:flex;gap:8px'; act.append(show, del); r.append(l, sz, act); out.append(r); });
    } catch (e) { out.replaceChildren(el('div', 'muted', 'Search failed: ' + errText(e))); }
    busy(false);
  };
};

/* Environment variables (user scope) */
CUSTOM.envvars = (box) => {
  const draw = async () => {
    let list; try { list = await call('envList'); } catch (_) { return fail(box); }
    box.replaceChildren(el('div', 'muted', 'Your own variables (not system-wide). New programs pick them up after they restart. PATH is left alone on purpose.'));
    list.forEach((v) => {
      const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', v.name)); const val = el('div', 'sub', v.value); val.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:480px'; val.title = v.value; l.append(val);
      const act = el('div'); act.style.cssText = 'display:flex;gap:8px'; const protectedName = /^(path|pathext|windir|systemroot|comspec|username|userprofile)$/i.test(v.name);
      const edit = el('button', 'btn', 'Edit'); const del = el('button', 'btn danger', 'Delete'); if (protectedName) { edit.disabled = del.disabled = true; }
      edit.onclick = () => { nameIn.value = v.name; valIn.value = v.value; valIn.focus(); }; del.onclick = async () => { if (!confirm(`Delete ${v.name}?`)) return; try { await guard(() => call('envDelete', { name: v.name }), 'Deleted'); draw(); } catch (_) {} };
      act.append(edit, del); r.append(l, act); box.append(r);
    });
    const form = el('div', 'savebar'); form.style.marginTop = '10px'; const nameIn = el('input', 'filter'); nameIn.placeholder = 'NAME'; nameIn.style.cssText = 'max-width:200px;margin:0'; const valIn = el('input', 'filter'); valIn.placeholder = 'value'; valIn.style.margin = 0;
    const save = el('button', 'btn primary', 'Save variable'); save.onclick = async () => { try { await guard(() => call('envSet', { name: nameIn.value.trim(), value: valIn.value }), 'Saved'); draw(); } catch (_) {} };
    form.append(nameIn, valIn, save); box.append(form);
  };
  draw();
};

/* Password generator */
CUSTOM.passgen = (box) => {
  const sets = { Lowercase: 'abcdefghijkmnopqrstuvwxyz', Uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ', Digits: '23456789', Symbols: '!@#$%^&*-_=+?' };
  const len = el('input'); len.type = 'range'; len.min = 8; len.max = 64; len.value = 20; const lenLabel = el('span', 'value', '20');
  const out = el('code', '', ''); out.style.cssText = 'display:block;padding:12px;border-radius:10px;background:var(--track);font-size:16px;word-break:break-all;user-select:all'; const info = el('div', 'muted', '');
  const checks = {}; const opts = el('div', 'savebar'); Object.keys(sets).forEach((k) => { const l = el('label'); l.style.cssText = 'display:flex;gap:6px;align-items:center'; const c = el('input'); c.type = 'checkbox'; c.checked = true; checks[k] = c; l.append(c, el('span', '', k)); opts.append(l); });
  const rnd = (n) => { const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; }; // unbiased
  const gen = () => {
    const chosen = Object.keys(sets).filter((k) => checks[k].checked); if (!chosen.length) { checks.Lowercase.checked = true; return gen(); }
    const pool = chosen.map((k) => sets[k]).join(''); const n = Number(len.value); const chars = chosen.map((k) => sets[k][rnd(sets[k].length)]); // one of each chosen kind
    while (chars.length < n) chars.push(pool[rnd(pool.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    out.textContent = chars.join(''); const bits = Math.round(n * Math.log2(pool.length)); info.textContent = `About ${bits} bits of strength (${bits >= 100 ? 'excellent' : bits >= 70 ? 'strong' : 'okay'}). Generated on this PC, never sent anywhere.`;
  };
  const gb = el('button', 'btn primary', 'Generate'); gb.onclick = gen; const cb = el('button', 'btn', 'Copy'); cb.onclick = () => navigator.clipboard.writeText(out.textContent).then(() => toast('Copied'), () => toast('Clipboard blocked', true));
  len.oninput = () => { lenLabel.textContent = len.value; gen(); }; Object.values(checks).forEach((c) => (c.onchange = gen));
  const r1 = el('div', 'savebar'); r1.append(el('span', 'muted', 'Length'), len, lenLabel, gb, cb); box.style.gap = '10px'; box.append(r1, opts, out, info); gen();
};

/* Battery health */
CUSTOM.batteryhealth = (box) => {
  call('batteryHealth').then((list) => {
    if (!list.length) return box.replaceChildren(el('div', 'muted', 'No battery found, so there is nothing to measure on this PC.'));
    box.replaceChildren(); list.forEach((b) => {
      const r = ring(); const wrap = el('div', 'ring-wrap'); wrap.append(r.svg, el('div', 'ring-pct', Math.round(b.health) + '%'));
      const info = el('div'); info.style.flex = 1; const verdict = b.health >= 80 ? '✅ Healthy' : b.health >= 60 ? '⚠️ Worn, still usable' : '❌ Heavily worn, consider a replacement';
      info.append(el('div', 'label', verdict), row('Capacity now vs new', null, `${(b.full / 1000).toFixed(1)} of ${(b.design / 1000).toFixed(1)} Wh`), row('Wear', null, (100 - b.health).toFixed(1) + '%'), row('Charge cycles', null, b.cycles == null ? 'Not reported' : String(b.cycles)), row('Battery', null, [b.maker, b.chemistry].filter(Boolean).join(' · ') || b.name));
      const t = el('div', 'tile'); t.style.cssText = 'border:0;background:none;box-shadow:none;padding:0;backdrop-filter:none;animation:none'; t.append(wrap, info); box.append(t); setTimeout(() => r.set(b.health), 50);
    });
  }).catch(() => box.replaceChildren(el('div', 'muted', 'No battery found, so there is nothing to measure on this PC.')));
};

/* Windows Spotlight wallpapers */
CUSTOM.spotlight = (box) => {
  const btn = small(el('button', 'btn primary', 'Save Spotlight pictures')); const out = el('div'); out.style.marginTop = '8px';
  box.append(el('div', 'label', 'Save Windows Spotlight wallpapers'), el('div', 'muted', 'Windows downloads beautiful lock-screen photos but hides them. This copies the full-size ones to Pictures\\Aurora Spotlight.'), btn, out);
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const r = await call('spotlightSave'); out.replaceChildren();
      if (r.missing) out.append(el('div', 'muted', 'Windows Spotlight is not set up on this PC (Settings > Personalization > Lock screen).'));
      else { out.append(el('div', '', r.saved ? `✅ Saved ${r.saved} new picture${r.saved > 1 ? 's' : ''} (${r.total} found).` : `Nothing new. ${r.total} picture${r.total === 1 ? ' is' : 's are'} already saved.`)); const o = small(el('button', 'btn', 'Open folder')); o.style.marginTop = '8px'; o.onclick = () => guard(() => call('openPath', { path: r.folder })).catch(() => {}); out.append(o); }
    } catch (e) { out.replaceChildren(el('div', 'muted', errText(e))); }
    btn.disabled = false;
  };
};

/* Automatic weekly cleanup (Task Scheduler) */
CUSTOM.autoclean = (box) => {
  box.style.gap = '8px';
  call('autoCleanGet').then((cur) => {
    const sw = el('label', 'switch'); const input = el('input'); input.type = 'checkbox'; input.checked = cur.enabled; sw.append(input, el('span', 'track'), el('span', 'thumb'));
    const top = el('div', 'savebar'); top.style.justifyContent = 'space-between'; top.append(el('div', '', 'Automatic weekly cleanup'), sw);
    const day = el('select', 'filter'); day.style.cssText = 'width:150px;margin:0'; const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const asName = (d) => (/^\d+$/.test(String(d)) ? ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Math.log2(Number(d)) + 1] : String(d));
    days.forEach((d) => { const o = el('option', '', d); o.value = d; if (cur.enabled && asName(cur.day) === d) o.selected = true; day.append(o); });
    const time = el('input', 'filter'); time.type = 'time'; time.value = cur.time || '03:00'; time.style.cssText = 'width:130px;margin:0';
    const row2 = el('div', 'savebar'); row2.append(el('span', 'muted', 'Every'), day, el('span', 'muted', 'at'), time);
    const apply = async (enabled) => { try { await guard(() => call('autoCleanSet', { enabled, day: day.value, time: time.value }), enabled ? 'Weekly cleanup scheduled' : 'Weekly cleanup removed'); } catch (_) { input.checked = !enabled; } };
    input.onchange = () => apply(input.checked); day.onchange = time.onchange = () => input.checked && apply(true);
    box.replaceChildren(top, row2, el('div', 'muted', 'Deletes temp files older than 3 days using Windows Task Scheduler. Runs even when this app is closed.'));
  }).catch(() => fail(box));
};

/* Labs launchpad */
CUSTOM.labsgrid = (box) => {
  const tiles = [
    ['🚀', 'Internet speed test', 'Download, upload, latency and jitter', 'network', 'speedtest'],
    ['🔋', 'Battery health', 'How worn is your laptop battery?', 'system', 'batteryhealth'],
    ['🗂️', 'Disk analyzer', 'Find the folders and files eating your space', 'toolbox', 'diskanalyzer'],
    ['🛰️', 'Network activity', 'Which apps use the internet, which ports are open', 'network', 'netactivity'],
    ['🔑', 'Saved Wi-Fi passwords', 'Recover a password you forgot', 'network', 'wifipasswords'],
    ['🖼️', 'Spotlight wallpapers', 'Save the lock-screen photos Windows hides', 'personalization', 'spotlight'],
    ['🧹', 'Weekly auto cleanup', 'Scheduled temp-file cleaning', 'toolbox', 'autoclean'],
    ['🧬', 'Environment variables', 'Edit your own variables safely', 'toolbox', 'envvars'],
    ['🎲', 'Password generator', 'Strong random passwords, made on this PC', 'toolbox', 'passgen'],
    ['🛟', 'Restore point', 'A safety net before big changes', 'backup', 'restorepoint'],
    ['🤖', 'Automation rules', 'When you unplug, join a Wi-Fi, launch a game...', 'automation', 'rules'],
    ['🛡️', 'Settings guard', 'Stop Windows undoing your settings', 'automation', 'guard'],
    ['👯', 'Duplicate finder', 'Same file, different names, wasted space', 'toolbox', 'dupes'],
    ['📂', 'Downloads organizer', 'Sort the mess, with undo', 'toolbox', 'organizer'],
    ['📡', 'Internet watchdog', 'Know when your internet drops', 'network', 'watchdog'],
    ['🌍', 'World clocks', 'Dubai, London, New York at a glance', 'home', 'worldclocks'],
    ['⚙️', 'Services manager', 'Start, stop and tune background services', 'wintools', 'services'],
    ['📜', 'Event log', 'Why did Windows crash or restart?', 'wintools', 'events'],
    ['📋', 'Clipboard history', 'Win+V, rebuilt', 'wintools', 'clipboard'],
    ['📝', 'Quick notes', 'Sticky notes inside Vorynth', 'wintools', 'notes'],
    ['🧾', 'PC report', 'Save a full system report as a web page', 'wintools', 'report']
  ];
  const grid = el('div', 'pgrid');
  tiles.forEach(([icon, name, desc, page, id]) => { const b = el('button', 'pcard'); b.append(el('div', 'picon', icon), el('div', 'pname', name), el('div', 'pdesc', desc)); b.onclick = () => go(page, id); grid.append(b); });
  box.append(grid);
};

/* ---------- Windows Update: install inside Vorynth ---------- */
const WU_ACTIVE = ['starting', 'searching', 'downloading', 'installing'];
CUSTOM.wuinstall = (box) => {
  box.style.gap = '10px';
  const drivers = el('input'); drivers.type = 'checkbox'; const dl = el('label'); dl.style.cssText = 'display:flex;gap:6px;align-items:center'; dl.append(drivers, el('span', '', 'Include driver updates'));
  const checkBtn = el('button', 'btn primary', 'Check for updates'); const top = el('div', 'savebar'); top.append(checkBtn, dl);
  const found = el('div'); const prog = el('div');
  box.append(el('div', 'muted', 'Vorynth talks to the Windows Update engine directly. Installing needs administrator permission, which Windows asks for once.'), top, found, prog);
  let poll = null, items = [];

  const stopPoll = () => { clearInterval(poll); poll = null; };
  const renderFound = () => {
    found.replaceChildren();
    if (!items.length) { found.append(el('div', '', "✅ You're up to date.")); return; }
    found.append(el('div', 'label', `${items.length} update${items.length > 1 ? 's' : ''} available`));
    const boxes = [];
    items.forEach((u) => {
      const r = el('div', 'list-row'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !u.needsInput; cb.disabled = !!u.needsInput; boxes.push([u, cb]); cb.style.cssText = 'margin-right:10px;flex:none';
      const l = el('div'); l.style.flex = 1; l.append(el('div', '', (u.driver ? '🔧 ' : '') + u.title), el('div', 'sub', u.needsInput ? 'Needs your input: install it from Windows Update' : (u.kb ? 'KB' + u.kb : '')));
      const sz = el('div', 'muted', u.sizeMB ? u.sizeMB + ' MB' : ''); r.append(cb, l, sz); found.append(r);
    });
    const bar = el('div', 'savebar'); bar.style.marginTop = '10px'; const inst = el('button', 'btn primary', ''); const sum = el('span', 'muted', '');
    const refresh = () => { const sel = boxes.filter(([, c]) => c.checked); inst.textContent = `Install ${sel.length} update${sel.length === 1 ? '' : 's'}`; inst.disabled = sel.length === 0; sum.textContent = `${Math.round(sel.reduce((a, [u]) => a + (u.sizeMB || 0), 0))} MB to download`; };
    boxes.forEach(([, c]) => (c.onchange = refresh)); refresh();
    inst.onclick = () => start(boxes.filter(([, c]) => c.checked).map(([u]) => u.id));
    bar.append(inst, sum); found.append(bar);
  };
  const check = async () => {
    checkBtn.disabled = true; checkBtn.textContent = 'Checking...'; found.replaceChildren(el('div', 'muted', 'Contacting Microsoft (up to a minute)...'));
    try { items = await call('wuSearch', { drivers: drivers.checked }); renderFound(); }
    catch (e) { found.replaceChildren(el('div', 'muted', "Couldn't check: " + errText(e))); }
    checkBtn.disabled = false; checkBtn.textContent = 'Check for updates';
  };
  checkBtn.onclick = check;

  const finishedView = (st) => {
    const kids = [];
    const ok = st.results.filter((r) => r.ok).length;
    const head = st.phase === 'error' ? '❌ ' + (st.error || 'Something went wrong') : st.phase === 'cancelled' ? `⏹️ Stopped. ${ok} installed before cancelling.` : st.total === 0 ? "✅ You're up to date." : (ok === st.results.length ? `✅ All ${ok} update${ok === 1 ? '' : 's'} installed.` : `${ok} of ${st.results.length} installed. Some failed, see below.`);
    kids.push(el('div', 'label', head));
    st.results.forEach((r) => { kids.push(row((r.ok ? '✅ ' : '❌ ') + r.title, r.note || (r.ok ? (r.reboot ? 'Restart needed to finish' : 'Installed') : (r.code ? 'Windows reported code ' + r.code : '')), null)); });
    if (st.reboot) {
      const banner = el('div', 'banner'); banner.append(el('div', '', '⚠️ Restart your PC to finish installing updates.'));
      const b = el('button', 'btn primary', 'Restart now'); b.onclick = async () => { if (confirm('Restart your PC now? Save your work first.')) await guard(() => call('powerAction', { action: 'restart', minutes: 0 })).catch(() => {}); };
      const later = el('button', 'btn', 'Schedule in 30 min'); later.onclick = () => guard(() => call('powerAction', { action: 'restart', minutes: 30 }), 'Restart scheduled in 30 minutes').catch(() => {});
      const grp = el('div'); grp.style.cssText = 'display:flex;gap:8px'; grp.append(b, later); banner.append(grp); kids.push(banner);
    }
    return kids;
  };
  const render = ({ state: st, ageSec }) => {
    if (!document.body.contains(prog)) return stopPoll();
    prog.replaceChildren(); prog.style.marginTop = '10px';
    if (st.phase === 'idle') return stopPoll();
    if (WU_ACTIVE.includes(st.phase) && ageSec > 2400) { prog.append(el('div', 'muted', 'A previous install seems to have stopped. You can check for updates again.')); return stopPoll(); }
    if (WU_ACTIVE.includes(st.phase)) {
      const txt = { starting: 'Waiting for administrator permission...', searching: 'Searching for updates...', downloading: `Downloading ${st.current} of ${st.total}`, installing: `Installing ${st.current} of ${st.total}` }[st.phase];
      prog.append(el('div', 'label', txt)); if (st.title) prog.append(el('div', 'muted', st.title));
      const frac = st.total ? Math.min(1, (st.current - 1 + (st.phase === 'installing' ? 0.6 : 0.2)) / st.total) : 0.05; const bar = el('div', 'bar'); const i = el('i'); i.style.width = Math.round(frac * 100) + '%'; bar.append(i); bar.style.margin = '8px 0'; prog.append(bar);
      if (st.phase === 'starting' && ageSec > 45) prog.append(el('div', 'muted', 'Still waiting. Check for a Windows permission prompt (it may be behind other windows).'));
      prog.append(el('div', 'muted', 'You can leave this page or close Vorynth. The install keeps running.'));
      const c = el('button', 'btn', 'Cancel after this update'); c.style.marginTop = '8px'; c.onclick = () => guard(() => call('wuCancel'), 'Will stop after the current update').catch(() => {}); prog.append(c);
      return;
    }
    stopPoll(); prog.append(...finishedView(st));
    const dismiss = el('button', 'btn', 'Clear'); dismiss.style.marginTop = '8px'; dismiss.onclick = () => { prog.replaceChildren(); items = []; found.replaceChildren(); check(); }; prog.append(dismiss);
  };
  const startPoll = () => { stopPoll(); const tick = () => call('wuProgress').then(render).catch(() => {}); tick(); poll = setInterval(tick, 1500); };
  const start = async (ids) => {
    if (!ids.length) return;
    if (!confirm(`Install ${ids.length} update${ids.length === 1 ? '' : 's'} now? Windows will ask for administrator permission. Your PC may need a restart afterwards.`)) return;
    try { await guard(() => call('wuInstall', { ids, drivers: drivers.checked })); found.replaceChildren(); startPoll(); } catch (_) {}
  };
  // pick up an install that is already running (or just finished) from before
  call('wuProgress').then((r) => { if (r.state.phase !== 'idle' && r.ageSec < 6 * 3600) { render(r); if (WU_ACTIVE.includes(r.state.phase) && r.ageSec <= 2400) startPoll(); } }).catch(() => {});
};

CUSTOM.wupause = (box) => {
  box.style.gap = '8px'; const status = el('div', '', 'Checking...'); const sel = el('select', 'filter'); sel.style.cssText = 'width:170px;margin:0';
  [[7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [28, '4 weeks'], [35, '5 weeks']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; sel.append(o); });
  const pause = el('button', 'btn', 'Pause updates'), resume = el('button', 'btn primary', 'Resume updates'); const bar = el('div', 'savebar'); bar.append(sel, pause, resume);
  box.append(status, bar, el('div', 'muted', 'Windows asks for administrator permission to change this.'));
  const paint = async () => { try { const p = await call('wuPauseGet'); status.textContent = p.paused ? `Updates are paused until ${new Date(p.until).toLocaleDateString([], { dateStyle: 'long' })}.` : 'Updates are not paused.'; resume.disabled = !p.paused; } catch (_) { fail(box); } };
  pause.onclick = async () => { try { await guard(() => call('wuPauseSet', { days: Number(sel.value) }), 'Updates paused'); } catch (_) {} paint(); };
  resume.onclick = async () => { try { await guard(() => call('wuPauseSet', { days: 0 }), 'Updates resumed'); } catch (_) {} paint(); };
  paint();
};

/* ---------- Wi-Fi, natively ---------- */
CUSTOM.wifinative = (box) => {
  box.style.gap = '8px';
  const bars = (n) => (n >= 75 ? '▂▄▆█' : n >= 50 ? '▂▄▆' : n >= 25 ? '▂▄' : '▂');
  const draw = async () => {
    const [cur, known] = await Promise.all([call('wifiCurrent').catch(() => ({ ssid: null })), call('wifiProfilesList').catch(() => null)]);
    if (known === null) return fail(box, 'No Wi-Fi adapter found on this PC');
    const scanBox = el('div'); scanBox.append(el('div', 'muted', 'Scanning...'));
    const top = el('div', 'savebar'); top.style.justifyContent = 'space-between'; top.append(el('div', 'label', cur.ssid ? `📶 Connected to ${cur.ssid}` : '📵 Not connected'));
    const acts = el('div'); acts.style.cssText = 'display:flex;gap:8px';
    if (cur.ssid) { const d = el('button', 'btn', 'Disconnect'); d.onclick = async () => { try { await guard(() => call('wifiDisconnect'), 'Disconnected'); } catch (_) {} setTimeout(draw, 800); }; acts.append(d); }
    const rs = el('button', 'btn', 'Rescan'); rs.onclick = draw; acts.append(rs); top.append(acts);
    const knownBox = el('div'); knownBox.append(el('div', 'label', `Saved networks (${known.length})`));
    known.forEach((n) => { const r = el('div', 'list-row'); r.append(el('div', '', n)); const a = el('div'); a.style.cssText = 'display:flex;gap:8px';
      const c = el('button', 'btn', n === cur.ssid ? 'Connected' : 'Connect'); c.disabled = n === cur.ssid; c.onclick = async () => { c.disabled = true; try { await guard(() => call('wifiConnect', { name: n }), 'Connecting to ' + n + '...'); } catch (_) {} setTimeout(draw, 3000); };
      const f = el('button', 'btn danger', 'Forget'); f.onclick = async () => { if (!confirm(`Forget "${n}"? You will need the password to join it again.`)) return; try { await guard(() => call('wifiForget', { name: n }), 'Forgot ' + n); } catch (_) {} draw(); };
      a.append(c, f); r.append(a); knownBox.append(r); });
    box.replaceChildren(top, scanBox, knownBox);
    try {
      const nets = await call('wifiScan'); scanBox.replaceChildren(el('div', 'label', `Nearby networks (${nets.length})`));
      if (!nets.length) scanBox.append(el('div', 'muted', 'No networks found.'));
      nets.forEach((n) => {
        const isKnown = known.includes(n.ssid), isCur = n.ssid === cur.ssid; const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', `${n.secure ? '🔒 ' : ''}${n.ssid}`), el('div', 'sub', `${bars(n.signal)} ${n.signal}%${isKnown ? ' · saved' : ''}`));
        const right = el('div'); right.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end';
        if (isCur) right.append(el('span', 'pill', 'Connected'));
        else if (isKnown) { const c = el('button', 'btn', 'Connect'); c.onclick = async () => { c.disabled = true; try { await guard(() => call('wifiConnect', { name: n.ssid }), 'Connecting...'); } catch (_) {} setTimeout(draw, 3000); }; right.append(c); }
        else {
          const pw = el('input', 'filter'); pw.type = 'password'; pw.placeholder = n.secure ? 'Wi-Fi password' : 'Open network'; pw.disabled = !n.secure; pw.style.cssText = 'width:170px;margin:0'; const j = el('button', 'btn primary', 'Join');
          j.onclick = async () => { j.disabled = true; try { await guard(() => call('wifiJoin', { ssid: n.ssid, password: n.secure ? pw.value : '', wpa3only: n.wpa3only }), 'Joining ' + n.ssid + '...'); } catch (_) { j.disabled = false; return; } setTimeout(draw, 3500); };
          pw.onkeydown = (e) => { if (e.key === 'Enter') j.click(); }; right.append(pw, j);
        }
        r.append(l, right); scanBox.append(r);
      });
    } catch (e) { scanBox.replaceChildren(el('div', 'muted', "Couldn't scan: " + errText(e) + '. If Windows says location is needed, turn on Location in Privacy.')); }
  };
  draw();
};

/* ---------- VPN and proxy ---------- */
CUSTOM.proxy = (box) => {
  box.style.gap = '8px';
  call('proxyGet').then((p) => {
    const sw = el('label', 'switch'); const input = el('input'); input.type = 'checkbox'; input.checked = p.enabled; sw.append(input, el('span', 'track'), el('span', 'thumb'));
    const top = el('div', 'savebar'); top.style.justifyContent = 'space-between'; top.append(el('div', '', 'Use a proxy server'), sw);
    const server = el('input', 'filter'); server.placeholder = 'address:port, for example 192.168.1.5:8080'; server.value = p.server || ''; server.style.margin = 0;
    const bypass = el('input', 'filter'); bypass.placeholder = 'Do not use the proxy for (separate with ;)'; bypass.value = p.bypass || '<local>'; bypass.style.margin = 0;
    const save = el('button', 'btn primary', 'Save proxy'); save.style.alignSelf = 'flex-start';
    const apply = async (enabled) => { try { await guard(() => call('proxySet', { enabled, server: server.value.trim(), bypass: bypass.value.trim() }), enabled ? 'Proxy turned on' : 'Proxy turned off'); } catch (_) { input.checked = !enabled; } };
    input.onchange = () => apply(input.checked); save.onclick = () => apply(input.checked);
    box.replaceChildren(top, server, bypass, save);
  }).catch(() => fail(box));
};

/* ---------- Mouse and printers ---------- */
CUSTOM.mouse = (box) => {
  box.style.gap = '12px';
  call('mouseGet').then((m) => {
    const slider = (label, min, max, val, what) => { const r = el('div', 'savebar'); r.style.justifyContent = 'space-between'; const t = el('div', '', label); const c = el('div'); c.style.cssText = 'display:flex;gap:10px;align-items:center'; const s = el('input'); s.type = 'range'; s.min = min; s.max = max; s.value = val; const v = el('span', 'value', String(val)); const fill = () => s.style.setProperty('--fill', ((s.value - min) / (max - min)) * 100 + '%'); fill(); let tm;
      s.oninput = () => { fill(); v.textContent = s.value; clearTimeout(tm); tm = setTimeout(() => guard(() => call('mouseSet', { what, value: Number(s.value) })).catch(() => {}), 200); }; c.append(s, v); r.append(t, c); return r; };
    const sw = el('label', 'switch'); const input = el('input'); input.type = 'checkbox'; input.checked = m.swapped; sw.append(input, el('span', 'track'), el('span', 'thumb'));
    input.onchange = async () => { try { await guard(() => call('mouseSet', { what: 'swap', value: input.checked ? 1 : 0 }), 'Saved'); } catch (_) { input.checked = !input.checked; } };
    const swr = el('div', 'savebar'); swr.style.justifyContent = 'space-between'; swr.append(el('div', '', 'Swap left and right buttons'), sw);
    box.replaceChildren(slider('Pointer speed', 1, 20, m.speed, 'speed'), slider('Lines to scroll per wheel click', 1, 20, Math.min(m.scroll, 20), 'scroll'), swr);
  }).catch(() => fail(box));
};
CUSTOM.printers = (box) => {
  const draw = () => call('printerList').then((list) => {
    if (!list.length) return box.replaceChildren(el('div', 'muted', 'No printers are installed.'));
    box.replaceChildren();
    list.forEach((p) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', '🖨️ ' + p.name), el('div', 'sub', `${p.driver || ''}${p.status ? ' · ' + p.status : ''}`)); const right = el('div'); right.style.cssText = 'display:flex;gap:10px;align-items:center';
      if (p.isDefault) right.append(el('span', 'pill', '✅ Default')); else { const b = el('button', 'btn', 'Make default'); b.onclick = async () => { try { await guard(() => call('printerDefault', { name: p.name }), p.name + ' is now the default'); } catch (_) {} draw(); }; right.append(b); }
      r.append(l, right); box.append(r); });
  }).catch(() => fail(box));
  draw();
};

/* ---------- Screen-off / sleep timers ---------- */
CUSTOM.powertimeouts = (box) => {
  box.style.gap = '10px'; const choices = [[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [3, '3 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [25, '25 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [300, '5 hours']];
  Promise.all([call('powerTimeoutsGet'), call('battery').catch(() => null)]).then(([t, bat]) => {
    box.replaceChildren(); const mk = (label, which, value) => { const r = el('div', 'savebar'); r.style.justifyContent = 'space-between'; r.append(el('div', '', label)); const sel = el('select', 'filter'); sel.style.cssText = 'width:170px;margin:0';
      let v = value; if (!choices.some(([n]) => n === v)) { const o = el('option', '', v + ' minutes'); o.value = v; sel.append(o); } choices.forEach(([n, name]) => { const o = el('option', '', name); o.value = n; sel.append(o); }); sel.value = v;
      sel.onchange = async () => { try { await guard(() => call('powerTimeoutsSet', { which, minutes: Number(sel.value) }), 'Saved'); v = sel.value; } catch (_) { sel.value = v; } }; r.append(sel); return r; };
    if (!t.monitor || !t.sleep) return fail(box);
    box.append(el('div', 'label', 'Turn off the screen after'), mk('Plugged in', 'monitorAc', t.monitor.ac)); if (bat) box.append(mk('On battery', 'monitorDc', t.monitor.dc));
    box.append(el('div', 'label', 'Put the PC to sleep after'), mk('Plugged in', 'sleepAc', t.sleep.ac)); if (bat) box.append(mk('On battery', 'sleepDc', t.sleep.dc));
  }).catch(() => fail(box));
};

/* ---------- Screen resolution and refresh rate (auto-reverts if you do not confirm) ---------- */
const displayRevert = { timer: null, prev: null, left: 0, banner: null };
CUSTOM.displaymodes = (box) => {
  box.style.gap = '10px';
  const paintBanner = (banner) => {
    banner.replaceChildren(); if (!displayRevert.timer) return;
    banner.className = 'banner'; const t = el('div', '', `Keep these display settings? Going back in ${displayRevert.left} s...`); const keep = el('button', 'btn primary', 'Keep'); const back = el('button', 'btn', 'Go back now');
    keep.onclick = () => { clearInterval(displayRevert.timer); displayRevert.timer = null; paintBanner(banner); toast('Display settings kept'); };
    back.onclick = () => doRevert(); const g = el('div'); g.style.cssText = 'display:flex;gap:8px'; g.append(keep, back); banner.append(t, g);
  };
  const doRevert = async () => { clearInterval(displayRevert.timer); displayRevert.timer = null; const p = displayRevert.prev; try { await call('displaySet', p); toast('Went back to ' + p.w + ' × ' + p.h); } catch (e) { toast("Couldn't go back automatically: " + errText(e), true); } const b = displayRevert.banner; if (b) { b.replaceChildren(); b.className = ''; } draw(); };
  const draw = () => call('displayGet').then(({ current, modes }) => {
    const banner = el('div'); displayRevert.banner = banner; paintBanner(banner);
    const resolutions = [...new Set(modes.map((m) => `${m.w}x${m.h}`))]; const resSel = el('select', 'filter'); const hzSel = el('select', 'filter'); resSel.style.cssText = hzSel.style.cssText = 'width:170px;margin:0';
    resolutions.forEach((r) => { const o = el('option', '', r.replace('x', ' × ')); o.value = r; resSel.append(o); }); resSel.value = `${current.w}x${current.h}`;
    const fillHz = () => { hzSel.replaceChildren(); const [w, h] = resSel.value.split('x').map(Number); const hzs = [...new Set(modes.filter((m) => m.w === w && m.h === h).map((m) => m.hz))].sort((a, b) => b - a); hzs.forEach((hz) => { const o = el('option', '', hz + ' Hz'); o.value = hz; hzSel.append(o); }); hzSel.value = hzs.includes(current.hz) && resSel.value === `${current.w}x${current.h}` ? current.hz : hzs[0]; };
    resSel.onchange = fillHz; fillHz();
    const apply = el('button', 'btn primary', 'Apply');
    apply.onclick = async () => {
      const [w, h] = resSel.value.split('x').map(Number), hz = Number(hzSel.value); if (w === current.w && h === current.h && hz === current.hz) return toast('That is already the current mode');
      apply.disabled = true; try { await guard(() => call('displaySet', { w, h, hz })); } catch (_) { apply.disabled = false; return; }
      displayRevert.prev = { w: current.w, h: current.h, hz: current.hz }; displayRevert.left = 15; clearInterval(displayRevert.timer);
      displayRevert.timer = setInterval(() => { displayRevert.left--; const b = displayRevert.banner; if (displayRevert.left <= 0) { doRevert(); } else if (b && document.body.contains(b)) paintBanner(b); }, 1000);
      paintBanner(banner); // show the countdown immediately: the 15 s safety window has already started
      setTimeout(draw, 1500);
    };
    const bar = el('div', 'savebar'); bar.append(resSel, hzSel, apply);
    box.replaceChildren(el('div', 'muted', `Current: ${current.w} × ${current.h} at ${current.hz} Hz (main display). If the new mode looks wrong, do nothing and Vorynth switches back after 15 seconds.`), bar, banner);
  }).catch(() => fail(box));
  draw();
};

/* ---------- Profiles (run by the backend, so the tray and rules use the exact same steps) ---------- */
CUSTOM.profiles = (box) => {
  box.style.gap = '10px';
  const draw = async () => {
    let list, st;
    try { [list, st] = await Promise.all([call('profilesList'), call('storeGet')]); } catch (_) { return fail(box); }
    const legacy = prefs.get('profiles'); // older versions kept your own profiles in the page; move them to the backend once
    if (legacy && legacy.length && !st.profiles.length) { await call('storeSet', { key: 'profiles', value: legacy }).catch(() => {}); prefs.set('profiles', []); return draw(); }
    box.replaceChildren(); const grid = el('div', 'pgrid');
    list.forEach((p) => {
      const b = el('button', 'pcard'); b.append(el('div', 'picon', p.icon), el('div', 'pname', p.name), el('div', 'pdesc', p.desc));
      b.onclick = async () => {
        try { const r = await call('profileRun', { name: p.name }); try { applyTheme(await call('toggleGet', { id: 'darkMode' })); } catch (_) {}
          if (r.ok === 0) toast(`Couldn't apply ${p.name}: none of its steps are supported on this PC`, true); else toast(r.ok === r.total ? `${p.name} applied` : `${p.name} applied (${r.ok} of ${r.total} steps, the rest aren't supported on this PC)`); }
        catch (e) { toast(errText(e), true); }
      };
      if (!p.builtin) { const x = el('span', 'pdel', '✕'); x.title = 'Delete'; x.onclick = async (ev) => { ev.stopPropagation(); await call('storeSet', { key: 'profiles', value: st.profiles.filter((q) => q.name !== p.name) }).catch(() => {}); draw(); }; b.append(x); }
      grid.append(b);
    });
    const save = el('div', 'savebar'); const input = el('input', 'filter'); input.placeholder = 'Name your current setup (for example: Work desk)'; input.style.margin = 0; const btn = el('button', 'btn primary', 'Save current as profile');
    btn.onclick = async () => {
      const name = input.value.trim(); if (!name) return toast('Give the profile a name first', true); if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('A profile with that name already exists', true);
      btn.disabled = true; const snap = await snapshotProfile(name); btn.disabled = false;
      try { await call('storeSet', { key: 'profiles', value: [...st.profiles, snap] }); toast('Profile saved'); } catch (e) { toast(errText(e), true); } draw();
    };
    save.append(input, btn); box.append(grid, save);
  };
  draw();
};

/* ---------- Automation: background, rules, guard, activity ---------- */
const TRIGGERS = { startup: 'Vorynth starts', power: 'Power source changes', battery: 'Battery level', time: 'Time of day', wifi: 'Wi-Fi network', app: 'An app starts running' };
const ACTIONS = { profile: 'Run a profile', volume: 'Set volume', mute: 'Mute or unmute', brightness: 'Set brightness', plan: 'Power plan', darkMode: 'Dark or light mode', keepAwake: 'Keep awake', notify: 'Show me a notification', cleanTemp: 'Clean temp files', organizeDownloads: 'Organize Downloads' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const describeWhen = (w) => ({ startup: () => 'Vorynth starts', power: () => (w.value === 'battery' ? 'you unplug the charger' : 'you plug in the charger'), battery: () => `battery is ${w.op === '<' ? 'below' : 'at or above'} ${w.value}%`, time: () => `it is ${w.at} on ${w.days.length === 7 ? 'every day' : w.days.map((d) => DAYS[d]).join(', ')}`, wifi: () => `you connect to "${w.ssid}"`, app: () => `${w.name} starts` }[w.type])();
const describeAction = (a) => ({ profile: () => `run the ${a.name} profile`, volume: () => `set volume to ${a.value}%`, mute: () => (a.value ? 'mute' : 'unmute'), brightness: () => `set brightness to ${a.value}%`, plan: () => `use the ${{ saver: 'power saver', balanced: 'balanced', high: 'high performance' }[a.match]} power plan`, darkMode: () => (a.value ? 'switch to dark mode' : 'switch to light mode'), keepAwake: () => (a.mode === 'off' ? 'stop keeping awake' : `keep the ${a.mode === 'display' ? 'screen' : 'PC'} awake${a.minutes ? ' for ' + a.minutes + ' min' : ''}`), notify: () => `notify me: "${a.text}"`, cleanTemp: () => 'clean temp files', organizeDownloads: () => 'organize Downloads' }[a.type])();
const TEMPLATES = [
  ['🔋 On battery → Battery saver', { name: 'On battery, save power', when: { type: 'power', value: 'battery' }, actions: [{ type: 'profile', name: 'Battery saver' }] }],
  ['🔌 Plugged in → Balanced power', { name: 'Plugged in, balanced power', when: { type: 'power', value: 'ac' }, actions: [{ type: 'plan', match: 'balanced' }] }],
  ['🪫 Battery under 20% → Battery saver + alert', { name: 'Low battery', when: { type: 'battery', op: '<', value: 20 }, actions: [{ type: 'profile', name: 'Battery saver' }, { type: 'notify', text: 'Battery is low. Plug in soon.' }] }],
  ['🔔 Battery at 80% → remind me to unplug', { name: 'Unplug at 80%', when: { type: 'battery', op: '>=', value: 80 }, actions: [{ type: 'notify', text: 'Battery is at 80%. Unplug to keep it healthy.' }] }],
  ['🎮 When Steam starts → Gaming profile', { name: 'Gaming when Steam runs', when: { type: 'app', name: 'steam' }, actions: [{ type: 'profile', name: 'Gaming' }] }],
  ['🌙 11 PM → Night owl', { name: 'Night mode at 11 PM', when: { type: 'time', at: '23:00', days: [0, 1, 2, 3, 4, 5, 6] }, actions: [{ type: 'profile', name: 'Night owl' }] }],
  ['📂 Every morning → Organize Downloads', { name: 'Tidy Downloads', when: { type: 'time', at: '09:00', days: [0, 1, 2, 3, 4, 5, 6] }, actions: [{ type: 'organizeDownloads' }] }]
];
let storeCache = null;
const loadStore = async () => (storeCache = await call('storeGet'));
const saveGroup = async (key, value) => { const v = await call('storeSet', { key, value }); await loadStore(); return v; };

CUSTOM.bgsettings = (box) => {
  box.style.gap = '4px';
  loadStore().then((st) => {
    box.replaceChildren(); const s = st.settings;
    const sw = (label, desc, key) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', label), el('div', 'sub', desc)); const w = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = !!s[key]; w.append(i, el('span', 'track'), el('span', 'thumb'));
      i.onchange = async () => { try { await guard(() => saveGroup('settings', { ...storeCache.settings, [key]: i.checked }), 'Saved'); } catch (_) { i.checked = !i.checked; } setTimeout(() => CUSTOM.bgsettings(box), 300); }; r.append(l, w); box.append(r); };
    sw('Keep running in the tray when I close the window', st.hasTray ? 'Rules, hotkeys and the settings guard keep working. Right-click the tray icon to quit.' : 'Needs the Windows tray, which is not available right now.', 'background');
    sw('Start with Windows', 'Vorynth starts quietly in the tray when you sign in.', 'autostart');
    sw('Global hotkeys', 'Ctrl+Alt+A show or hide · M mute · D dark mode · K keep awake · Space command bar' + (st.hotkeys.failed.length ? `  (in use by another app: ${st.hotkeys.failed.join(', ').replace(/CommandOrControl/g, 'Ctrl')})` : ''), 'hotkeys');
    sw('Internet watchdog', 'Notifies you when the internet drops and comes back, and keeps an outage log.', 'watchdog');
    sw('Clipboard history', 'Remember copied text so you can paste it again (memory only, never saved). Manage it in Windows tools.', 'clipboard');
    sw('Show notifications', 'For rules, the settings guard and the watchdog.', 'notify');
    sw('Pause all automation', 'Rules stop running until you turn this off. Hotkeys still work.', 'paused');
  }).catch(() => fail(box));
};

CUSTOM.rules = (box) => {
  box.style.gap = '12px';
  const draw = async () => {
    let st; try { st = await loadStore(); } catch (_) { return fail(box); }
    box.replaceChildren();
    if (!st.rules.length) box.append(el('div', 'muted', 'No rules yet. Pick a ready-made one below, or build your own.'));
    st.rules.forEach((r) => {
      const row1 = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', r.name), el('div', 'sub', `When ${describeWhen(r.when)}: ${r.actions.map(describeAction).join(', then ')}`));
      const right = el('div'); right.style.cssText = 'display:flex;gap:8px;align-items:center'; const w = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = r.enabled; w.append(i, el('span', 'track'), el('span', 'thumb'));
      i.onchange = async () => { try { await guard(() => saveGroup('rules', st.rules.map((x) => (x.id === r.id ? { ...x, enabled: i.checked } : x)))); } catch (_) { i.checked = !i.checked; } };
      const t = el('button', 'btn', 'Test'); t.title = 'Run the actions now'; t.onclick = async () => { try { const o = await call('ruleTest', { id: r.id }); toast(`Ran ${o.ok} of ${o.total} action${o.total === 1 ? '' : 's'}`, o.ok === 0); } catch (e) { toast(errText(e), true); } };
      const d = el('button', 'btn danger', 'Delete'); d.onclick = async () => { if (!confirm(`Delete the rule "${r.name}"?`)) return; try { await saveGroup('rules', st.rules.filter((x) => x.id !== r.id)); } catch (e) { toast(errText(e), true); } draw(); };
      right.append(w, t, d); row1.append(l, right); box.append(row1);
    });
    box.append(el('div', 'label', 'Ready-made rules'));
    const tpl = el('div', 'quick'); TEMPLATES.forEach(([label, t]) => { const b = el('button', 'btn', label); b.onclick = () => { builder.load(t); builderBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); }; tpl.append(b); }); box.append(tpl);
    box.append(builderBox);
  };
  /* builder */
  const builderBox = el('div'); builderBox.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding-top:6px;border-top:1px solid var(--border)'; builderBox.dataset.role = 'builder';
  const name = el('input', 'filter'); name.placeholder = 'Rule name'; name.style.margin = 0;
  const trig = el('select', 'filter'); trig.style.cssText = 'width:230px;margin:0'; Object.entries(TRIGGERS).forEach(([k, v]) => { const o = el('option', '', v); o.value = k; trig.append(o); });
  const tp = el('div', 'savebar'); const act = el('select', 'filter'); act.style.cssText = 'width:230px;margin:0'; Object.entries(ACTIONS).forEach(([k, v]) => { const o = el('option', '', v); o.value = k; act.append(o); });
  const ap = el('div', 'savebar'); const chips = el('div'); const addAct = el('button', 'btn', 'Add this action'); const save = el('button', 'btn primary', 'Save rule'); let actions = [];
  const num = (v, lo, hi, w = 90) => { const i = el('input', 'filter'); i.type = 'number'; i.min = lo; i.max = hi; i.value = v; i.style.cssText = `width:${w}px;min-width:${w}px;flex:none;margin:0`; return i; };
  const sel = (opts, v) => { const s2 = el('select', 'filter'); s2.style.cssText = 'width:170px;margin:0'; opts.forEach(([val, n]) => { const o = el('option', '', n); o.value = val; s2.append(o); }); if (v != null) s2.value = v; return s2; };
  let readWhen = () => ({ type: 'startup' }), readAction = () => null;
  const buildTrig = (w) => {
    tp.replaceChildren(); const t = trig.value;
    if (t === 'power') { const s2 = sel([['battery', 'I unplug the charger'], ['ac', 'I plug in the charger']], w?.value); tp.append(el('span', 'muted', 'When'), s2); readWhen = () => ({ type: 'power', value: s2.value }); }
    else if (t === 'battery') { const o = sel([['<', 'drops below'], ['>=', 'reaches or exceeds']], w?.op); const n = num(w?.value ?? 20, 1, 100, 80); tp.append(el('span', 'muted', 'When battery'), o, n, el('span', 'muted', '%')); readWhen = () => ({ type: 'battery', op: o.value, value: Number(n.value) }); }
    else if (t === 'time') { const tm = el('input', 'filter'); tm.type = 'time'; tm.value = w?.at ?? '23:00'; tm.style.cssText = 'width:130px;margin:0'; const days = DAYS.map((d, i) => { const l = el('label'); l.style.cssText = 'display:flex;gap:3px;align-items:center'; const c = el('input'); c.type = 'checkbox'; c.checked = w ? w.days.includes(i) : true; l.append(c, el('span', '', d)); return [c, l]; }); tp.append(el('span', 'muted', 'At'), tm, ...days.map(([, l]) => l)); readWhen = () => ({ type: 'time', at: tm.value, days: days.map(([c], i) => (c.checked ? i : -1)).filter((i) => i >= 0) }); }
    else if (t === 'wifi') { const i = el('input', 'filter'); i.placeholder = 'Network name (SSID)'; i.value = w?.ssid ?? ''; i.style.cssText = 'width:230px;margin:0'; tp.append(el('span', 'muted', 'When I connect to'), i); readWhen = () => ({ type: 'wifi', ssid: i.value.trim() }); }
    else if (t === 'app') { const i = el('input', 'filter'); i.placeholder = 'Program name, for example steam'; i.value = w?.name ?? ''; i.style.cssText = 'width:230px;margin:0'; tp.append(el('span', 'muted', 'When'), i, el('span', 'muted', 'starts running')); readWhen = () => ({ type: 'app', name: i.value.trim() }); }
    else { tp.append(el('span', 'muted', 'Runs once each time Vorynth starts (including at sign-in).')); readWhen = () => ({ type: 'startup' }); }
  };
  const buildAct = () => {
    ap.replaceChildren(); const t = act.value; const profiles = (storeCache?.profiles || []).map((p) => p.name);
    if (t === 'profile') { const s2 = sel(['Gaming', 'Focus', 'Battery saver', 'Presentation', 'Night owl', ...profiles].map((n) => [n, n])); ap.append(s2); readAction = () => ({ type: 'profile', name: s2.value }); }
    else if (t === 'volume' || t === 'brightness') { const n = num(t === 'volume' ? 30 : 50, 0, 100, 80); ap.append(n, el('span', 'muted', '%')); readAction = () => ({ type: t, value: Number(n.value) }); }
    else if (t === 'mute') { const s2 = sel([['true', 'Mute'], ['false', 'Unmute']]); ap.append(s2); readAction = () => ({ type: 'mute', value: s2.value === 'true' }); }
    else if (t === 'darkMode') { const s2 = sel([['true', 'Dark mode'], ['false', 'Light mode']]); ap.append(s2); readAction = () => ({ type: 'darkMode', value: s2.value === 'true' }); }
    else if (t === 'plan') { const s2 = sel([['saver', 'Power saver'], ['balanced', 'Balanced'], ['high', 'High performance']]); ap.append(s2); readAction = () => ({ type: 'plan', match: s2.value }); }
    else if (t === 'keepAwake') { const m = sel([['display', 'Keep screen on'], ['system', 'Keep PC awake'], ['off', 'Stop keeping awake']]); const n = num(0, 0, 1440, 90); ap.append(m, n, el('span', 'muted', 'minutes (0 = until stopped)')); readAction = () => ({ type: 'keepAwake', mode: m.value, minutes: Number(n.value) }); }
    else if (t === 'notify') { const i = el('input', 'filter'); i.placeholder = 'Message'; i.style.cssText = 'width:300px;margin:0'; i.value = 'Hello from Vorynth'; ap.append(i); readAction = () => ({ type: 'notify', text: i.value.trim() }); }
    else { ap.append(el('span', 'muted', 'No options.')); readAction = () => ({ type: t }); }
  };
  const drawChips = () => { chips.replaceChildren(); if (!actions.length) chips.append(el('div', 'muted', 'No actions added yet.')); actions.forEach((a, i) => { const c = el('div', 'list-row'); c.append(el('div', '', `${i + 1}. ${describeAction(a)}`)); const x = el('button', 'btn', 'Remove'); x.onclick = () => { actions.splice(i, 1); drawChips(); }; c.append(x); chips.append(c); }); };
  trig.onchange = () => buildTrig(); act.onchange = buildAct;
  addAct.onclick = () => { const a = readAction(); if (actions.length >= 6) return toast('A rule can have up to 6 actions', true); actions.push(a); drawChips(); };
  save.onclick = async () => {
    if (!name.value.trim()) return toast('Give the rule a name', true); if (!actions.length) return toast('Add at least one action first', true);
    try { await guard(() => saveGroup('rules', [...storeCache.rules, { name: name.value.trim(), enabled: true, when: readWhen(), actions }]), 'Rule saved'); actions = []; name.value = ''; draw(); } catch (_) {}
  };
  builderBox.append(el('div', 'label', 'Build your own rule'), name, (() => { const r = el('div', 'savebar'); r.append(el('span', 'muted', 'Trigger'), trig); return r; })(), tp, (() => { const r = el('div', 'savebar'); r.append(el('span', 'muted', 'Then do'), act, addAct); return r; })(), ap, chips, save);
  builder = { load(t) { name.value = t.name; trig.value = t.when.type; buildTrig(t.when); actions = t.actions.map((a) => ({ ...a })); drawChips(); } };
  buildTrig(); buildAct(); drawChips(); draw();
};
let builder = { load() {} };

CUSTOM.guard = (box) => {
  box.style.gap = '6px';
  const draw = async () => {
    let st; try { st = await loadStore(); } catch (_) { return fail(box); }
    box.replaceChildren(el('div', 'muted', 'Windows updates sometimes switch your privacy and comfort settings back. Tick a setting to protect it: Vorynth remembers how it is set now and puts it back if Windows changes it (checked every 10 minutes and after sleep).'));
    const guarded = new Map(st.guard.map((g) => [g.id, g.value]));
    const labelOf = (id) => { const f = typeof findItem === 'function' ? findItem(id) : null; return f ? f.it.label : id; };
    st.guardable.forEach((id) => {
      const r = el('div', 'list-row'); const c = el('input'); c.type = 'checkbox'; c.checked = guarded.has(id); c.style.cssText = 'margin-right:10px;flex:none'; const l = el('div'); l.style.flex = 1; l.append(el('div', '', labelOf(id)));
      if (guarded.has(id)) l.append(el('div', 'sub', `Keeping it ${guarded.get(id) ? 'ON' : 'OFF'}`));
      c.onchange = async () => {
        try {
          if (c.checked) { const cap = await call('guardCapture', { ids: [id] }); if (!cap.length) throw new Error('Could not read that setting'); await saveGroup('guard', [...st.guard.filter((g) => g.id !== id), cap[0]]); }
          else await saveGroup('guard', st.guard.filter((g) => g.id !== id));
        } catch (e) { toast(errText(e), true); }
        draw();
      };
      r.append(c, l); box.append(r);
    });
    const now = el('button', 'btn primary', 'Check now'); now.style.cssText = 'align-self:flex-start;margin-top:8px'; now.onclick = async () => { try { const r = await call('guardRun'); toast(r.fixed.length ? `Put ${r.fixed.length} setting${r.fixed.length === 1 ? '' : 's'} back` : 'Everything is as you set it'); } catch (e) { toast(errText(e), true); } }; box.append(now);
  };
  draw();
};

CUSTOM.activity = (box) => {
  const draw = () => { call('activityGet').then((list) => { box.replaceChildren(); if (!list.length) return box.append(el('div', 'muted', 'Nothing yet. Rules, the guard and the watchdog will report here.')); list.forEach((a) => box.append(row(a.text, new Date(a.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })))); }).catch(() => fail(box)); };
  const t = setInterval(() => (document.body.contains(box) ? draw() : clearInterval(t)), 5000); draw();
};

/* ---------- Internet watchdog ---------- */
CUSTOM.watchdog = (box) => {
  const draw = () => { call('watchdogGet').then((w) => {
    box.replaceChildren();
    if (!w.enabled) { const b = el('button', 'btn primary', 'Turn on the watchdog'); b.style.alignSelf = 'flex-start'; b.onclick = async () => { await loadStore(); try { await guard(() => saveGroup('settings', { ...storeCache.settings, watchdog: true }), 'Watchdog is on'); } catch (_) {} draw(); }; return box.append(el('div', 'muted', 'Checks your connection every 20 seconds, tells you when the internet drops and returns, and logs every outage. Runs while Vorynth is in the tray.'), b); }
    box.append(el('div', 'label', w.online ? '🟢 Online' : '🔴 Offline right now'), row('Uptime (last 24 hours)', `Watching for ${Math.round(w.watchedMs / 60000)} min`, w.uptimePct + '%'));
    if (!w.outages.length) box.append(el('div', 'muted', 'No outages recorded.')); else { box.append(el('div', 'label', 'Recent outages')); w.outages.forEach((o) => box.append(row(new Date(o.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }), o.end ? 'Back after ' + (Math.round((o.end - o.start) / 1000) < 90 ? Math.round((o.end - o.start) / 1000) + ' s' : Math.round((o.end - o.start) / 60000) + ' min') : 'Still down', o.end ? '' : '⚠️'))); }
  }).catch(() => fail(box)); };
  const tm = setInterval(() => (document.body.contains(box) ? draw() : clearInterval(tm)), 10000); draw();
};

/* ---------- Downloads organizer and duplicate finder ---------- */
CUSTOM.organizer = (box) => {
  box.style.gap = '8px'; const out = el('div'); const bar = el('div', 'savebar'); const prev = el('button', 'btn', 'Preview'); const go2 = el('button', 'btn primary', 'Organize now'); const undo = el('button', 'btn', 'Undo last'); bar.append(prev, go2, undo);
  box.append(el('div', 'muted', 'Sorts loose files in Downloads into Images, Videos, Audio, Documents, Archives and Installers. Never overwrites, skips files still downloading, and can be undone.'), bar, out);
  const show = async () => { try { const p = await call('organizePlan'); out.replaceChildren(); undo.disabled = !p.undoable; if (!p.count) return out.append(el('div', 'muted', 'Nothing to organize. Downloads is already tidy.')); const by = {}; p.moves.forEach((m) => (by[m.cat] = (by[m.cat] || 0) + 1)); out.append(el('div', 'label', `${p.count} file${p.count === 1 ? '' : 's'} would be moved`)); Object.entries(by).forEach(([c, n]) => out.append(row(c, null, n + ' file' + (n === 1 ? '' : 's')))); p.moves.slice(0, 8).forEach((m) => out.append(row(m.name, '→ ' + m.cat, fmtBytes(m.size)))); } catch (e) { out.replaceChildren(el('div', 'muted', errText(e))); } };
  prev.onclick = show; go2.onclick = async () => { if (!confirm('Move loose files in Downloads into folders? You can undo this.')) return; try { const r = await call('organizeApply'); toast(`Moved ${r.moved} file${r.moved === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} skipped)` : ''}`); } catch (e) { toast(errText(e), true); } show(); };
  undo.onclick = async () => { try { const r = await call('organizeUndo'); toast(`Put ${r.restored} file${r.restored === 1 ? '' : 's'} back${r.blocked ? ` (${r.blocked} left because the name is taken)` : ''}`); } catch (e) { toast(errText(e), true); } show(); };
  show();
};
CUSTOM.dupes = (box) => {
  box.style.gap = '8px'; const sel = el('select', 'filter'); sel.style.cssText = 'width:170px;margin:0'; [['downloads', 'Downloads'], ['documents', 'Documents'], ['pictures', 'Pictures'], ['videos', 'Videos'], ['music', 'Music'], ['desktop', 'Desktop']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; sel.append(o); });
  const min = el('select', 'filter'); min.style.cssText = 'width:150px;margin:0'; [[10, 'Over 10 MB'], [1, 'Over 1 MB'], [50, 'Over 50 MB'], [100, 'Over 100 MB']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; min.append(o); });
  const go2 = el('button', 'btn primary', 'Find duplicates'); const bar = el('div', 'savebar'); bar.append(sel, min, go2); const out = el('div');
  box.append(el('div', 'muted', 'Finds files with exactly the same content, even under different names. Files are compared by their contents, never by name. Deleting sends them to the Recycle Bin.'), bar, out);
  go2.onclick = async () => {
    go2.disabled = true; out.replaceChildren(el('div', 'muted', 'Scanning... this can take a few minutes for big folders.'));
    try {
      const r = await call('dupScan', { key: sel.value, minMB: Number(min.value) }); out.replaceChildren();
      if (!r.groups.length) out.append(el('div', '', `✅ No duplicates found (${r.scanned} files checked${r.truncated ? ', stopped early' : ''}).`));
      else {
        out.append(el('div', 'label', `${r.groups.length} duplicate set${r.groups.length === 1 ? '' : 's'} · ${fmtBytes(r.totalWasted)} wasted${r.truncated ? ' (scan stopped early)' : ''}`));
        r.groups.forEach((g) => {
          const card1 = el('div'); card1.style.cssText = 'padding:8px 0;border-bottom:1px solid var(--border)'; const head = el('div', 'savebar'); head.style.justifyContent = 'space-between'; head.append(el('div', '', `${g.count} copies · ${fmtBytes(g.size)} each · ${fmtBytes(g.wasted)} wasted`));
          const keep = el('button', 'btn', 'Keep the oldest, recycle the rest'); head.append(keep); card1.append(head);
          const rowsEls = g.files.map((f, i) => { const r1 = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; const p = el('div', 'sub', f.path); p.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:520px'; p.title = f.path; l.append(el('div', '', (i === 0 ? '⭐ ' : '') + f.path.split(/[\\/]/).pop()), p);
            const show = el('button', 'btn', 'Show'); show.onclick = () => guard(() => call('revealFile', { path: f.path })).catch(() => {}); const del = el('button', 'btn danger', 'Recycle'); del.onclick = async () => { if (!confirm(`Move this copy to the Recycle Bin?\n${f.path}`)) return; try { await guard(() => call('trashFile', { path: f.path }), 'Moved to the Recycle Bin'); r1.remove(); } catch (_) {} };
            const a = el('div'); a.style.cssText = 'display:flex;gap:8px'; a.append(show, del); r1.append(l, a); card1.append(r1); return [f, r1]; });
          keep.onclick = async () => { if (!confirm(`Keep the oldest copy and move the other ${g.count - 1} to the Recycle Bin?`)) return; let n = 0; for (const [f, r1] of rowsEls.slice(1)) { try { await call('trashFile', { path: f.path }); r1.remove(); n++; } catch (_) {} } toast(`Moved ${n} to the Recycle Bin`); keep.disabled = true; };
          out.append(card1);
        });
      }
    } catch (e) { out.replaceChildren(el('div', 'muted', 'Scan failed: ' + errText(e))); }
    go2.disabled = false;
  };
};

/* ---------- World clocks (Home) ---------- */
const CITIES = [['Riyadh', 'Asia/Riyadh'], ['Dubai', 'Asia/Dubai'], ['Sharjah', 'Asia/Dubai'], ['Mecca', 'Asia/Riyadh'], ['Cairo', 'Africa/Cairo'], ['Istanbul', 'Europe/Istanbul'], ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Edinburgh', 'Europe/London'], ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Toronto', 'America/Toronto'], ['Karachi', 'Asia/Karachi'], ['Mumbai', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney']];
CUSTOM.worldclocks = (box) => {
  box.style.gap = '4px'; const picked = () => { const p = prefs.get('clocks'); return Array.isArray(p) && p.length ? p : ['Riyadh', 'Dubai', 'London', 'New York']; };
  const offset = (tz) => { const now = new Date(); const f = (z) => new Date(now.toLocaleString('en-US', { timeZone: z })); const d = Math.round((f(tz) - f(Intl.DateTimeFormat().resolvedOptions().timeZone)) / 60000); return d === 0 ? 'same time as you' : `${d > 0 ? '+' : '-'}${Math.floor(Math.abs(d) / 60)}${Math.abs(d) % 60 ? ':' + String(Math.abs(d) % 60).padStart(2, '0') : ''} h from you`; };
  const draw = () => {
    box.replaceChildren(); const list = el('div'); list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px';
    picked().forEach((name) => { const c = CITIES.find((x) => x[0] === name); if (!c) return; const t = el('div', 'tile'); t.style.cssText = 'display:block;padding:14px'; const when = new Date(); const time = el('div', 't-value', when.toLocaleTimeString([], { timeZone: c[1], hour: '2-digit', minute: '2-digit' })); time.style.cssText = 'font-size:26px;margin:2px 0'; const x = el('span', 'pdel', '✕'); x.style.cssText = 'float:right;cursor:pointer;color:var(--muted)'; x.title = 'Remove'; x.onclick = () => { prefs.set('clocks', picked().filter((n) => n !== name)); draw(); };
      t.append(x, el('div', 't-label', name), time, el('div', 'muted', when.toLocaleDateString([], { timeZone: c[1], weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + offset(c[1]))); list.append(t); });
    const add = el('select', 'filter'); add.style.cssText = 'width:200px;margin:8px 0 0'; const ph = el('option', '', '+ Add a city'); ph.value = ''; add.append(ph); CITIES.filter((c) => !picked().includes(c[0])).forEach((c) => { const o = el('option', '', c[0]); o.value = c[0]; add.append(o); });
    add.onchange = () => { if (add.value) { prefs.set('clocks', [...picked(), add.value].slice(0, 8)); draw(); } }; box.append(list, add);
  };
  const tm = setInterval(() => { if (document.body.contains(box)) { const keep = box.querySelector('select'); if (!keep || keep.value === '') draw(); } else clearInterval(tm); }, 20000); draw();
};

/* ---------- VPN: connect, add and remove natively ---------- */
CUSTOM.vpn = (box) => {
  box.style.gap = '8px';
  const draw = async () => {
    let list; try { list = await call('vpnList'); } catch (_) { return fail(box); }
    box.replaceChildren();
    if (!list.length) box.append(el('div', 'muted', 'No VPN connections are set up on this PC yet.'));
    list.forEach((v) => { const on = /connected/i.test(v.status) && !/dis/i.test(v.status); const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', '🛡️ ' + v.name), el('div', 'sub', v.server || ''));
      const right = el('div'); right.style.cssText = 'display:flex;gap:8px;align-items:center'; right.append(el('span', 'pill', on ? 'Connected' : 'Disconnected'));
      const b = el('button', on ? 'btn' : 'btn primary', on ? 'Disconnect' : 'Connect'); b.onclick = async () => { b.disabled = true; try { await guard(() => call(on ? 'vpnDisconnect' : 'vpnConnect', { name: v.name }), on ? 'Disconnected' : 'Connected to ' + v.name); } catch (_) {} draw(); };
      const rm = el('button', 'btn danger', 'Remove'); rm.onclick = async () => { if (!confirm(`Remove the VPN "${v.name}"?`)) return; try { await guard(() => call('vpnRemove', { name: v.name }), 'Removed'); } catch (_) {} draw(); };
      right.append(b, rm); r.append(l, right); box.append(r); });
    box.append(el('div', 'label', 'Add a VPN'));
    const name = el('input', 'filter'); name.placeholder = 'Name, for example Work VPN'; name.style.cssText = 'width:230px;margin:0'; const server = el('input', 'filter'); server.placeholder = 'Server address, for example vpn.company.com'; server.style.margin = 0;
    const tun = el('select', 'filter'); tun.style.cssText = 'width:170px;margin:0'; [['Automatic', 'Automatic'], ['IKEv2', 'IKEv2'], ['Sstp', 'SSTP'], ['L2tp', 'L2TP'], ['Pptp', 'PPTP (old)']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; tun.append(o); });
    const rem = el('label'); rem.style.cssText = 'display:flex;gap:6px;align-items:center'; const remc = el('input'); remc.type = 'checkbox'; remc.checked = true; rem.append(remc, el('span', '', 'Remember my sign-in'));
    const add = el('button', 'btn primary', 'Add VPN'); add.onclick = async () => { try { await guard(() => call('vpnAdd', { name: name.value.trim(), server: server.value.trim(), tunnel: tun.value, remember: remc.checked }), 'VPN added'); draw(); } catch (_) {} };
    const bar = el('div', 'savebar'); bar.append(name, server); const bar2 = el('div', 'savebar'); bar2.append(tun, rem, add); box.append(bar, bar2);
  };
  draw();
};

/* ---------- Bluetooth / Wi-Fi radios ---------- */
CUSTOM.radios = (box) => {
  const draw = () => call('radiosGet').then((list) => {
    const rs = list.filter((r) => ['Bluetooth', 'WiFi'].includes(r.kind)); box.replaceChildren();
    if (!rs.length) return box.append(el('div', 'muted', 'No Bluetooth or Wi-Fi adapter found.'));
    rs.forEach((r) => { const row1 = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', (r.kind === 'WiFi' ? '📶 Wi-Fi' : '🔵 Bluetooth')), el('div', 'sub', r.name || ''));
      const w = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = r.state === 'On'; w.append(i, el('span', 'track'), el('span', 'thumb'));
      i.onchange = async () => { i.disabled = true; try { await guard(() => call('radioSet', { kind: r.kind, on: i.checked }), (r.kind === 'WiFi' ? 'Wi-Fi' : 'Bluetooth') + (i.checked ? ' on' : ' off')); } catch (_) { i.checked = !i.checked; } i.disabled = false; };
      row1.append(l, w); box.append(row1); });
  }).catch((e) => box.replaceChildren(el('div', 'muted', 'Radio control is not available here: ' + errText(e))));
  draw();
};
CUSTOM.deviceproblems = (box) => {
  call('deviceProblems').then((list) => { box.replaceChildren(); if (!list.length) return box.append(el('div', '', '✅ No devices are reporting problems.')); list.forEach((d) => { const r = row('⚠️ ' + (d.name || 'Unknown device'), d.class, d.status); box.append(r); }); box.append(el('div', 'muted', 'A device with an error usually needs a driver. Check Windows Update > Install updates with "Include driver updates".')); }).catch(() => fail(box));
};

/* ---------- Recovery ---------- */
CUSTOM.recovery = (box) => {
  box.style.gap = '8px'; const b = el('button', 'btn', 'Restart to recovery options'); b.style.alignSelf = 'flex-start';
  box.append(el('div', 'muted', 'Restarts into the Windows recovery menu, where you can start in safe mode, repair startup, use System Restore or reset this PC. Save your work first.'), b);
  b.onclick = async () => { if (!confirm('Restart to the recovery menu in 5 seconds? Save your work first.')) return; try { await guard(() => call('advancedStartup'), 'Restarting to recovery options...'); } catch (_) {} };
};

/* ---------- Services manager ---------- */
CUSTOM.services = (box) => {
  box.style.gap = '8px'; const filter = el('input', 'filter'); filter.placeholder = 'Search services'; filter.style.margin = 0; const only = el('select', 'filter'); only.style.cssText = 'width:170px;margin:0'; [['all', 'All'], ['Running', 'Running'], ['Stopped', 'Stopped']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; only.append(o); });
  const bar = el('div', 'savebar'); bar.append(filter, only); const body = el('div'); body.style.cssText = 'max-height:460px;overflow-y:auto;padding-right:6px'; let all = [];
  box.append(el('div', 'muted', 'Start, stop or change how a background service starts. Windows asks for administrator permission, and core services are protected.'), bar, body);
  const draw = () => {
    const q = filter.value.toLowerCase(); body.replaceChildren(); const list = all.filter((s) => (only.value === 'all' || s.status === only.value) && (s.display.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))).slice(0, 150);
    if (!list.length) return body.append(el('div', 'muted', 'No services match.'));
    list.forEach((s) => {
      const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', (s.core ? '🔒 ' : '') + s.display), el('div', 'sub', `${s.name} · starts: ${s.start}`));
      const right = el('div'); right.style.cssText = 'display:flex;gap:8px;align-items:center'; const pill = el('span', 'pill', s.status); right.append(pill);
      const act = (label, action, danger) => { const b = el('button', danger ? 'btn danger' : 'btn', label); b.onclick = async () => { if (danger && !confirm(`${label} "${s.display}"?`)) return; b.disabled = true; try { const n = await guard(() => call('serviceAction', { name: s.name, action }), `${s.display}: done`); Object.assign(s, n); } catch (_) {} draw(); }; return b; };
      if (s.status === 'Running') { right.append(act('Restart', 'restart')); if (!s.core) right.append(act('Stop', 'stop', true)); } else right.append(act('Start', 'start'));
      if (!s.core) { const sel = el('select', 'filter'); sel.style.cssText = 'width:120px;margin:0'; [['', 'Startup...'], ['auto', 'Automatic'], ['manual', 'Manual'], ['disabled', 'Disabled']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; sel.append(o); }); sel.onchange = async () => { if (!sel.value) return; if (sel.value === 'disabled' && !confirm(`Disable "${s.display}"? It will not start until you enable it again.`)) { sel.value = ''; return; } try { const n = await guard(() => call('serviceAction', { name: s.name, action: sel.value }), 'Startup type changed'); Object.assign(s, n); } catch (_) {} draw(); }; right.append(sel); }
      r.append(l, right); body.append(r);
    });
  };
  filter.oninput = draw; only.onchange = draw;
  call('servicesList').then((l) => { all = l; draw(); }).catch(() => fail(box));
};

/* ---------- Event log ---------- */
CUSTOM.events = (box) => {
  box.style.gap = '8px'; const hours = el('select', 'filter'); hours.style.cssText = 'width:150px;margin:0'; [[24, 'Last 24 hours'], [1, 'Last hour'], [6, 'Last 6 hours'], [72, 'Last 3 days'], [168, 'Last week']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; hours.append(o); });
  const level = el('select', 'filter'); level.style.cssText = 'width:150px;margin:0'; [['errors', 'Errors'], ['warnings', 'Warnings'], ['both', 'Both']].forEach(([v, n]) => { const o = el('option', '', n); o.value = v; level.append(o); });
  const go2 = el('button', 'btn primary', 'Show events'); const bar = el('div', 'savebar'); bar.append(hours, level, go2); const out = el('div'); out.style.cssText = 'max-height:460px;overflow-y:auto;padding-right:6px';
  box.append(el('div', 'muted', 'The most recent problems from the System and Application logs. Handy when something crashed or Windows restarted by itself.'), bar, out);
  go2.onclick = async () => { go2.disabled = true; out.replaceChildren(el('div', 'muted', 'Reading the event logs...')); try { const list = await call('eventsRecent', { hours: Number(hours.value), level: level.value }); out.replaceChildren(); if (!list.length) out.append(el('div', '', '✅ Nothing found in that period.')); list.forEach((e) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', `${e.level <= 2 ? '❌' : '⚠️'} ${e.source} (event ${e.id})`)); const m = el('div', 'sub', e.message.replace(/\s+/g, ' ')); m.style.cssText = 'white-space:normal;max-width:600px'; l.append(m); r.append(l, el('div', 'muted', e.time + ' · ' + e.log)); out.append(r); }); } catch (e) { out.replaceChildren(el('div', 'muted', 'Could not read the logs: ' + errText(e))); } go2.disabled = false; };
};

/* ---------- Clipboard history (Win+V alternative) ---------- */
CUSTOM.clipboard = (box) => {
  box.style.gap = '8px';
  const draw = async () => {
    let d; try { d = await call('clipGet'); } catch (_) { return fail(box); }
    if (document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    box.replaceChildren();
    if (!d.enabled) { const b = el('button', 'btn primary', 'Turn on clipboard history'); b.style.alignSelf = 'flex-start'; b.onclick = async () => { await loadStore(); try { await guard(() => saveGroup('settings', { ...storeCache.settings, clipboard: true }), 'Clipboard history is on'); } catch (_) {} draw(); };
      return box.append(el('div', 'muted', 'Remembers the text you copy so you can paste it again later (like Win+V). It is kept in memory only, never saved to disk, and cleared when Vorynth closes. It does not know which items are passwords, so turn it off if you copy sensitive text often.'), b); }
    const bar = el('div', 'savebar'); const clr = el('button', 'btn', 'Clear (keeps pinned)'); clr.onclick = async () => { await call('clipClear'); draw(); }; const off = el('button', 'btn', 'Turn off'); off.onclick = async () => { await loadStore(); await saveGroup('settings', { ...storeCache.settings, clipboard: false }); draw(); }; bar.append(clr, off); box.append(bar);
    if (!d.items.length) box.append(el('div', 'muted', 'Nothing yet. Copy some text and it will show up here.'));
    d.items.forEach((i) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; const pv = el('div', '', (i.pinned ? '📌 ' : '') + i.preview.replace(/\s+/g, ' ').slice(0, 140)); l.append(pv, el('div', 'sub', `${i.length} characters · ${new Date(i.t).toLocaleTimeString()}`));
      const a = el('div'); a.style.cssText = 'display:flex;gap:8px'; const use = el('button', 'btn primary', 'Copy'); use.onclick = async () => { try { await call('clipUse', { id: i.id }); toast('Copied. Paste it anywhere.'); } catch (e) { toast(errText(e), true); } draw(); };
      const pin = el('button', 'btn', i.pinned ? 'Unpin' : 'Pin'); pin.onclick = async () => { await call('clipPin', { id: i.id, pinned: !i.pinned }); draw(); }; const del = el('button', 'btn danger', 'Delete'); del.onclick = async () => { await call('clipDelete', { id: i.id }); draw(); }; a.append(use, pin, del); r.append(l, a); box.append(r); });
  };
  const tm = setInterval(() => (document.body.contains(box) ? draw() : clearInterval(tm)), 3000); draw();
};



/* ---------- Update Vorynth + automatic update detection ---------- */
CUSTOM.selfupdate = (box) => {
  box.style.gap = '10px'; let timer = null;
  let lastKey = '';
  const draw = async (auto) => {
    let d; try { d = await call('updateInfo'); } catch (_) { return fail(box); }
    const act = document.activeElement; if (act && box.contains(act) && act.tagName === 'INPUT' && act.type !== 'checkbox') return;
    const key = JSON.stringify([d.version, d.url, d.auto, d.portable, d.status, d.detected]); if (auto === true && key === lastKey) return; lastKey = key; // the timer only redraws when something changed, so buttons never move while you click
    box.replaceChildren(); const st = d.status, det = d.detected || {};
    box.append(el('div', '', `You have Vorynth ${d.version}.` + (det.lastCheck ? ` Last checked ${new Date(det.lastCheck).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : '')));
    if (!d.portable) box.append(el('div', 'muted', 'You are running Vorynth from its source folder. Installing updates works in the portable Vorynth-Settings.exe.'));
    const info = (txt) => box.append(el('div', 'store-ok', txt));
    if (det.online) info(`Version ${det.online.version} is available online.` + (det.online.notes ? ' ' + det.online.notes : ''));
    if (det.file) info(`Verified: a newer Vorynth build ${det.file.version} (built ${new Date(det.file.builtAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}) was found in Downloads: ${det.file.name} (${det.file.sizeMB} MB).`);
    if (st.state === 'downloading') { const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = Math.max(3, st.percent) + '%'; bar.append(i); box.append(el('div', 'sub', 'Downloading ' + st.percent + '%'), bar); }
    if (st.state === 'ready') {
      const i = st.info || {}; box.append(el('div', 'store-ok', `Ready to install${i.buildVersion ? ' Vorynth ' + i.buildVersion : (i.latest ? ' version ' + i.latest : '')}${i.fromFile ? ' from ' + i.fromFile : ''} (${i.sizeMB} MB).`), el('div', i.fromFile && !i.verified ? 'store-err' : 'sub', i.verified ? 'Verified as an Vorynth build. SHA-256: ' + i.sha256 : (i.fromFile ? 'This file has no Vorynth build tag, so Vorynth cannot confirm what it is. Only continue if you trust where it came from. SHA-256: ' + i.sha256 : 'SHA-256: ' + i.sha256)));
      const go2 = el('button', 'btn primary', 'Install and restart'); go2.onclick = async () => { if (!confirm('Vorynth will close and reopen as the new version. Continue?')) return; try { await call('updateApply'); toast('Restarting...'); } catch (e) { toast(errText(e), true); } }; const no = el('button', 'btn', 'Discard'); no.onclick = async () => { await call('updateDiscard'); draw(); }; const r = el('div', 'savebar'); r.append(go2, no); box.append(r);
    }
    if (st.state === 'error') box.append(el('div', 'store-err', st.message));
    if (st.state === 'applying') box.append(el('div', 'sub', 'Restarting...'));
    const bar = el('div', 'savebar');
    const chk = el('button', 'btn' + (st.state === 'ready' ? '' : ' primary'), 'Check for updates'); chk.onclick = async () => { chk.disabled = true; chk.textContent = 'Checking...'; try { const r = await call('updateCheck'); const n = [r.online, r.file].filter(Boolean).length + (r.apps.length ? 1 : 0); toast(n ? 'Updates found' : (r.errors.length ? r.errors[0] : 'Everything is up to date'), !n && r.errors.length > 0); } catch (e) { toast(errText(e), true); } refreshUpdateBar(); draw(); };
    bar.append(chk);
    if (det.online && st.state !== 'ready' && st.state !== 'downloading') { const b = el('button', 'btn primary', 'Download ' + det.online.version); b.onclick = async () => { b.disabled = true; const t = setInterval(draw, 700); try { await call('updateDownload'); } catch (e) { toast(errText(e), true); } finally { clearInterval(t); } draw(); }; bar.append(b); }
    if (det.file && st.state !== 'ready') { const b = el('button', 'btn primary', 'Use ' + det.file.name); b.onclick = async () => { try { await call('updateUseFound'); } catch (e) { toast(errText(e), true); } draw(); }; bar.append(b); }
    const pick = el('button', 'btn', 'Update from a file...'); pick.onclick = async () => { try { await call('updatePickFile'); } catch (e) { toast(errText(e), true); } draw(); }; bar.append(pick); box.append(bar);
    const lab = el('label', 'sub'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = d.auto; cb.onchange = async () => { try { await call('updateSettings', { auto: cb.checked }); toast(cb.checked ? 'Vorynth will look for updates by itself' : 'Automatic checks are off'); } catch (e) { toast(errText(e), true); cb.checked = !cb.checked; } }; lab.append(cb, ' Look for updates automatically (a few seconds after start, then every 6 hours)'); box.append(lab);
    const u = el('input', 'filter'); u.placeholder = 'Optional: update address (https://.../vorynth-update.json)'; u.value = d.url; const sv = el('button', 'btn', 'Save address'); sv.onclick = async () => { try { await call('updateSettings', { url: u.value }); toast('Saved'); } catch (e) { toast(errText(e), true); } }; const r2 = el('div', 'savebar'); r2.append(u, sv); box.append(r2, el('div', 'sub', 'The update address is a small JSON file you host yourself: {"version":"1.3.0","url":"https://.../Vorynth-Settings.exe","sha256":"...","notes":"..."}. Vorynth only installs a download whose SHA-256 matches. Vorynth also notices newer Vorynth-Settings files in your Downloads folder.'));
  };
  timer = setInterval(() => { if (!document.body.contains(box)) clearInterval(timer); else draw(true); }, 2500); draw();
};
async function refreshUpdateBar() {
  const bar = document.getElementById('updateBar'); if (!bar) return;
  let s; try { s = await call('updateStatus'); } catch (_) { bar.hidden = true; return; }
  const parts = []; if (s.online) parts.push(`Vorynth ${s.online.version} is available`); if (s.file) parts.push(`a newer Vorynth build ${s.file.version} is in your Downloads`); if (s.apps) parts.push(`${s.apps} app update${s.apps === 1 ? '' : 's'} in Vorynth Store`);
  if (!parts.length || s.state === 'applying') { bar.hidden = true; return; }
  bar.replaceChildren(); const t = el('div', 'grow', '🔔 ' + parts.join(' · ').replace(/^./, (c) => c.toUpperCase()));
  const b = el('button', 'btn primary', (s.online || s.file) ? 'Update Vorynth' : 'Open Store'); b.onclick = () => ((s.online || s.file) ? go('backup', 'selfupdate') : go('store', 'appstore')); const x = el('button', 'btn', 'Later'); x.onclick = () => { bar.hidden = true; };
  bar.append(t, b); if ((s.online || s.file) && s.apps) { const b2 = el('button', 'btn', 'Open Store'); b2.onclick = () => go('store', 'appstore'); bar.append(b2); } bar.append(x); bar.hidden = false;
}
setTimeout(refreshUpdateBar, 1500); setInterval(refreshUpdateBar, 60000);

/* ---------- Vorynth Store ---------- */
/* Vorynth Store UI lives in store-ui.js */

/* ---------- Quick notes ---------- */
CUSTOM.notes = (box) => {
  box.style.gap = '8px';
  const draw = async () => {
    let st; try { st = await loadStore(); } catch (_) { return fail(box); }
    box.replaceChildren(); const ta = el('textarea', 'filter'); ta.placeholder = 'Write a note...'; ta.rows = 3; ta.style.cssText = 'margin:0;resize:vertical;font:inherit'; const add = el('button', 'btn primary', 'Save note'); add.style.alignSelf = 'flex-start';
    add.onclick = async () => { const t = ta.value.trim(); if (!t) return toast('Write something first', true); try { await guard(() => saveGroup('notes', [{ text: t, t: Date.now(), pinned: false }, ...st.notes]), 'Note saved'); } catch (_) {} draw(); };
    box.append(ta, add);
    [...st.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.t - a.t).forEach((n) => {
      const r = el('div', 'list-row'); const l = el('div'); l.style.cssText = 'min-width:0;white-space:pre-wrap'; l.append(el('div', '', (n.pinned ? '📌 ' : '') + n.text), el('div', 'sub', new Date(n.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })));
      const a = el('div'); a.style.cssText = 'display:flex;gap:8px'; const pin = el('button', 'btn', n.pinned ? 'Unpin' : 'Pin'); pin.onclick = async () => { await saveGroup('notes', st.notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x))); draw(); };
      const cp = el('button', 'btn', 'Copy'); cp.onclick = () => navigator.clipboard.writeText(n.text).then(() => toast('Copied'), () => toast('Clipboard blocked', true)); const del = el('button', 'btn danger', 'Delete'); del.onclick = async () => { if (!confirm('Delete this note?')) return; await saveGroup('notes', st.notes.filter((x) => x.id !== n.id)); draw(); };
      a.append(pin, cp, del); r.append(l, a); box.append(r);
    });
  };
  draw();
};

/* ---------- Disks and partitions (Disk Management, read-only) ---------- */
CUSTOM.disks = (box) => {
  box.style.gap = '10px';
  call('disksList').then((d) => {
    box.replaceChildren(el('div', 'muted', 'A clear view of every disk, its partitions and volumes. It is read-only on purpose: formatting and repartitioning can destroy data, so Vorynth does not do it.'));
    if (!d.disks.length) return box.append(el('div', 'muted', 'No disks found.'));
    d.disks.forEach((k) => {
      const head = el('div', 'list-row'); const l = el('div'); l.append(el('div', 'label', `💽 Disk ${k.number}: ${k.name}`), el('div', 'sub', `${fmtBytes(k.size)} · ${k.style} · ${k.bus}`)); const pill = el('span', 'pill', (/healthy/i.test(k.health) ? '✅ ' : '⚠️ ') + k.health); head.append(l, pill); box.append(head);
      const parts = d.partitions.filter((p) => p.disk === k.number); const total = Math.max(k.size, 1); const barWrap = el('div'); barWrap.style.cssText = 'display:flex;height:26px;border-radius:8px;overflow:hidden;gap:2px;margin:4px 0 6px';
      parts.forEach((p, i) => { const seg = el('div', '', p.letter ? p.letter + ':' : ''); seg.style.cssText = `flex:${Math.max(p.size / total, 0.04)};background:color-mix(in srgb, var(--accent) ${30 + (i % 4) * 15}%, transparent);display:grid;place-items:center;font-size:11px;min-width:18px`; seg.title = `${p.type} · ${fmtBytes(p.size)}`; barWrap.append(seg); });
      box.append(barWrap);
      parts.forEach((p) => { const v = d.volumes.find((x) => x.letter === p.letter); const sub = v ? `${v.fs || ''}${v.label ? ' · ' + v.label : ''} · ${fmtBytes(v.free)} free of ${fmtBytes(v.size)}` : p.type; box.append(row(`Partition ${p.number}${p.letter ? ' (' + p.letter + ':)' : ''}`, sub, fmtBytes(p.size))); });
    });
  }).catch(() => fail(box));
};

/* ---------- Read aloud (native text to speech, replaces Narrator) ---------- */
CUSTOM.readaloud = (box) => {
  box.style.gap = '8px';
  const ta = el('textarea', 'filter'); ta.rows = 4; ta.placeholder = 'Type or paste text to hear it read aloud...'; ta.style.cssText = 'margin:0;resize:vertical;font:inherit';
  const voice = el('select', 'filter'); voice.style.cssText = 'width:260px;margin:0'; const rate = el('input'); rate.type = 'range'; rate.min = 0.5; rate.max = 2; rate.step = 0.1; rate.value = 1; const rv = el('span', 'value', '1.0x');
  const play = el('button', 'btn primary', 'Read aloud'), stop = el('button', 'btn', 'Stop'), clip = el('button', 'btn', 'Read my clipboard');
  const bar = el('div', 'savebar'); bar.append(play, stop, clip); const bar2 = el('div', 'savebar'); bar2.append(voice, el('span', 'muted', 'Speed'), rate, rv);
  const note = el('div', 'muted', ''); box.append(el('div', 'muted', 'Vorynth reads text aloud with the voices installed on this PC. Works offline.'), ta, bar, bar2, note);
  const synth = window.speechSynthesis;
  if (!synth) { note.textContent = 'Text to speech is not available here.'; play.disabled = stop.disabled = clip.disabled = true; return; }
  const fillVoices = () => { const vs = synth.getVoices(); const keep = voice.value; voice.replaceChildren(); vs.forEach((v, i) => { const o = el('option', '', `${v.name} (${v.lang})`); o.value = i; voice.append(o); }); const ar = vs.findIndex((v) => /^ar/i.test(v.lang)); if (keep) voice.value = keep; else if (ar >= 0 && /[؀-ۿ]/.test(ta.value)) voice.value = ar; if (!vs.length) note.textContent = 'No voices are installed. Add a language voice in Windows to use this.'; };
  fillVoices(); synth.onvoiceschanged = fillVoices;
  const speak = (text) => { if (!text.trim()) return toast('There is nothing to read', true); synth.cancel(); const u = new SpeechSynthesisUtterance(text); const vs = synth.getVoices(); let v = vs[Number(voice.value)]; if (/[\u0600-\u06ff]/.test(text) && !(v && /^ar/i.test(v.lang))) v = vs.find((x) => /^ar/i.test(x.lang)) || v; /* Arabic text -> an Arabic voice when one is installed */ if (v) { u.voice = v; u.lang = v.lang; } u.rate = Number(rate.value); u.onend = () => (note.textContent = ''); u.onerror = () => (note.textContent = ''); note.textContent = 'Reading...'; synth.speak(u); };
  rate.oninput = () => (rv.textContent = Number(rate.value).toFixed(1) + 'x');
  play.onclick = () => speak(ta.value); stop.onclick = () => { synth.cancel(); note.textContent = ''; };
  clip.onclick = async () => { try { const t = await navigator.clipboard.readText(); ta.value = t; speak(t); } catch (_) { toast('Vorynth could not read the clipboard. Paste the text above instead.', true); } };
};

/* ---------- navigation ---------- */
let currentPage = 'home';
function renderNav() {
  const nav = $('#nav'); nav.replaceChildren();
  const hidden = new Set(((prefs.get('ui') || {}).hiddenPages) || []);
  PAGES.forEach((p) => {
    if (hidden.has(p.id) && p.id !== currentPage && !['home', 'personalization'].includes(p.id)) return; // hidden pages stay reachable from the command bar
    const b = el('button', 'nav-item' + (p.id === currentPage ? ' active' : '')); b.title = p.title; b.dataset.page = p.id;
    b.append(el('span', 'ico', p.icon), el('span', '', p.title));
    b.onclick = () => go(p.id);
    nav.append(b);
  });
}
function go(pageId, focusId) { goBase(pageId, focusId); if (window.auroraAfterGo) window.auroraAfterGo(pageId); }
function goBase(pageId, focusId) {
  currentPage = pageId; renderNav();
  const p = PAGES.find((x) => x.id === pageId);
  const page = $('#page'); page.replaceChildren();
  page.append(el('h1', 'page-title', p.title), el('p', 'page-sub', p.sub));
  p.sections.forEach((s) => {
    if (p.id !== 'home') page.append(el('div', 'section-title', s.title));
    s.items.forEach((it) => page.append(buildItem(it)));
  });
  page.querySelectorAll('.card,.tile,.hero').forEach((n, i) => n.style.setProperty('--i', i));
  $('.content').scrollTop = 0;
  if (focusId) setTimeout(() => {
    const t = page.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
    if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1800); }
  }, 120);
}

/* ---------- command palette ---------- */
const pal = { open: false, sel: 0, results: [] };
function paletteOpen(v) {
  pal.open = v; $('#paletteBackdrop').hidden = !v;
  if (v) { $('#paletteInput').value = ''; paletteSearch(''); $('#paletteInput').focus(); }
}
function paletteSearch(qs) {
  const words = qs.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = INDEX.map((x) => {
    const hay = `${x.it.label} ${x.it.desc || ''} ${x.it.kw || ''} ${x.page.title}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) return null;
    const s = words.reduce((a, w) => a + (x.it.label.toLowerCase().includes(w) ? 3 : 1), 0);
    return { ...x, s };
  }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 12);
  const acts = window.auroraCommands ? window.auroraCommands(qs) : [];
  pal.results = [...acts, ...scored]; pal.sel = 0; drawResults();
}
function drawResults() {
  const box = $('#paletteResults'); box.replaceChildren();
  if (!pal.results.length) { box.append(el('div', 'result', 'No matching settings. Try a command like "volume 30" or "5 km to miles".')); return; }
  pal.results.forEach((r, i) => {
    const d = el('div', 'result' + (i === pal.sel ? ' sel' : '') + (r.act ? ' act' : ''));
    if (r.act) d.append(el('span', '', `${r.icon} ${r.label}`), el('span', 'where', 'Run · ' + r.hint)); else d.append(el('span', '', r.it.label), el('span', 'where', `${r.page.title} › ${r.section.title}`));
    d.onclick = () => pick(i); box.append(d);
  });
}
function pick(i) { const r = pal.results[i]; if (!r) return; paletteOpen(false); if (r.act) { if (r.changes && (prefs.get('ui') || {}).confirmCommands && !confirm('Run this command?\n\n' + r.label)) return; Promise.resolve().then(() => r.run()).then((m) => { if (m) toast(m); }, (e) => toast(errText(e), true)); return; } go(r.page.id, r.it.id); }

$('#openPalette').onclick = () => paletteOpen(true);
$('#paletteBackdrop').onclick = (e) => { if (e.target.id === 'paletteBackdrop') paletteOpen(false); };
$('#paletteInput').oninput = (e) => paletteSearch(e.target.value);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen(!pal.open); return; }
  if (!pal.open) return;
  if (e.key === 'Escape') paletteOpen(false);
  else if (e.key === 'ArrowDown') { pal.sel = Math.min(pal.sel + 1, pal.results.length - 1); drawResults(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { pal.sel = Math.max(pal.sel - 1, 0); drawResults(); e.preventDefault(); }
  else if (e.key === 'Enter') pick(pal.sel);
});

/* ---------- backup / restore ---------- */
const registryToggles = () => INDEX.filter((x) => x.it.type === 'toggle' && !x.it.load).map((x) => x.it.id);
async function exportPrefs() {
  const toggles = {};
  for (const id of registryToggles()) { try { toggles[id] = await call('toggleGet', { id }); } catch (_) {} }
  const res = await call('exportSettings', { data: { app: 'aurora-settings', version: 1, prefs: prefs.all(), toggles } });
  return res ? 'Saved to ' + res : 'Cancelled';
}
const EXPLORER_IDS = ['taskbarCenter', 'taskView', 'widgets', 'searchBox', 'showSeconds', 'fileExt', 'hiddenFiles', 'classicMenu'];
const validProfile = (p) => p && typeof p.name === 'string' && p.name.length <= 60 && p.toggles && typeof p.toggles === 'object';
async function importPrefs() {
  const data = await call('importSettings');
  if (!data) return 'Cancelled';
  if (data.app !== 'aurora-settings') throw new Error('Not an Vorynth Settings backup');
  if (data.prefs && typeof data.prefs === 'object') {
    if (/^#[0-9a-f]{6}$/i.test(data.prefs.accent)) { prefs.set('accent', data.prefs.accent); applyAccent(data.prefs.accent); }
    if (Array.isArray(data.prefs.favs)) prefs.set('favs', data.prefs.favs.filter((f) => typeof f === 'string' && findItem(f)));
    if (Array.isArray(data.prefs.profiles)) prefs.set('profiles', data.prefs.profiles.filter(validProfile).slice(0, 50));
  }
  const allowed = registryToggles(); let n = 0, needRestart = false;
  for (const [id, value] of Object.entries(data.toggles || {})) {
    if (!allowed.includes(id)) continue; // ignore unknown ids
    try { await call('toggleSet', { id, value: !!value, defer: true }); n++; if (EXPLORER_IDS.includes(id)) needRestart = true; } catch (_) {}
  }
  if (needRestart) await safe(() => call('restartExplorer'));
  try { applyTheme(await call('toggleGet', { id: 'darkMode' })); } catch (_) {}
  go(currentPage);
  return `Restored ${n} settings`;
}

call('toggleGet', { id: 'darkMode' }).then(applyTheme).catch(() => {}); // match the Windows theme at startup
go('home');

/* version badge in the sidebar */
call('appVersion').then((v) => { const e = document.getElementById('ver'); if (e && v) e.textContent = 'v' + v; }).catch(() => {});


/* First run: Vorynth's default for AI features is OFF. Ask once, never change anything without a click. */
(() => {
  const ids = ['aiCopilot', 'copilotButton', 'aiRecall', 'aiEdge', 'aiClickToDo', 'webSearch'];
  let seen = false; try { seen = localStorage.getItem('aiFirstRun') === '1'; } catch (_) {}
  if (seen || !(window.api && (window.api.platform === 'win32' || /aiask=1/.test(location.search)))) return;
  setTimeout(() => call('toggleGetMany', { ids }).then((r) => {
    const on = ids.filter((id) => r[id]).length; if (!on) { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} return; }
    const ov = el('div'); ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999';
    const card = el('div', 'list-row'); card.style.cssText = 'display:block;max-width:480px;padding:22px;line-height:1.5;background:var(--card,#fff);border-radius:16px';
    const h = el('div', '', '🔒 AI features: your choice'); h.style.cssText = 'font-size:20px;font-weight:700;margin-bottom:8px';
    const t = el('div', 'muted', `Windows currently allows ${on} of ${ids.length} AI features on this PC (Copilot, Recall, the Edge AI sidebar and online search suggestions). Vorynth's recommended default is OFF. Nothing changes unless you press a button, and you can change your mind any time in "De-AI Windows".`);
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px;margin-top:16px;flex-wrap:wrap';
    const yes = el('button', 'btn', 'Turn them all off'); const no = el('button', 'btn', 'Leave them as they are');
    const done = () => { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} ov.remove(); };
    yes.onclick = async () => { yes.disabled = true; try { await call('applyPreset', { name: 'aiAllOff' }); toast('All AI features are off'); } catch (e) { toast(String(e.message || e), true); } done(); };
    no.onclick = done; row.append(yes, no); card.append(h, t, row); ov.append(card); document.body.append(ov);
  }).catch(() => {}), 1500);
})();
