/* Aurora Command: a command bar that runs things (not just finds settings), Settings Time Machine, quick timer,
   recent pages, keyboard shortcuts, always-on-top and zoom. Loaded after app.js and apps.js. */
{
  const B = (txt, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); if (fn) b.onclick = fn; return b; };
  const copy = async (t) => { try { await navigator.clipboard.writeText(String(t)); return true; } catch (_) { return false; } };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const newId = (p) => p + Math.random().toString(36).slice(2, 10);
  const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };

  /* ---------- quick timer (shown in the title bar) ---------- */
  const qt = { end: 0, tid: null, label: '' };
  const pill = document.createElement('button'); pill.id = 'qtimer'; pill.hidden = true; pill.title = 'Click to cancel the timer'; document.querySelector('.titlebar').append(pill);
  const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, .3, .6].forEach((t) => { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .2; o.start(a.currentTime + t); o.stop(a.currentTime + t + .18); }); } catch (_) {} };
  const fmtT = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
  function timerStop() { clearInterval(qt.tid); qt.tid = null; pill.hidden = true; }
  function timerStart(ms, label) {
    if (!(ms >= 1000 && ms <= 24 * 3600e3)) throw new Error('A timer can be from 1 second to 24 hours');
    timerStop(); qt.end = Date.now() + ms; qt.label = label || ''; pill.hidden = false;
    const tick = () => { const left = qt.end - Date.now(); if (left <= 0) { timerStop(); beep(); toast('⏰ ' + (qt.label ? qt.label + ': ' : '') + 'time is up'); try { new Notification('Aurora timer', { body: (qt.label || 'Your timer') + ' finished' }); } catch (_) {} return; } pill.textContent = '⏱ ' + fmtT(left); };
    qt.tid = setInterval(tick, 250); tick();
  }
  pill.onclick = () => { timerStop(); toast('Timer cancelled'); };
  window.auroraTimer = { start: timerStart, stop: timerStop, running: () => !!qt.tid };

  /* ---------- the command bar ---------- */
  const A = window.auroraCalc;
  const ALIAS = { m: ['Length', 'm'], meter: ['Length', 'm'], meters: ['Length', 'm'], km: ['Length', 'km'], cm: ['Length', 'cm'], mm: ['Length', 'mm'], mile: ['Length', 'mile'], miles: ['Length', 'mile'], mi: ['Length', 'mile'], yard: ['Length', 'yard'], yards: ['Length', 'yard'], ft: ['Length', 'foot'], foot: ['Length', 'foot'], feet: ['Length', 'foot'], inch: ['Length', 'inch'], inches: ['Length', 'inch'], in: ['Length', 'inch'],
    kg: ['Weight', 'kg'], g: ['Weight', 'g'], mg: ['Weight', 'mg'], lb: ['Weight', 'pound'], lbs: ['Weight', 'pound'], pound: ['Weight', 'pound'], pounds: ['Weight', 'pound'], oz: ['Weight', 'ounce'], ounce: ['Weight', 'ounce'], tonne: ['Weight', 'tonne'],
    kb: ['Data', 'KB'], mb: ['Data', 'MB'], gb: ['Data', 'GB'], tb: ['Data', 'TB'], byte: ['Data', 'byte'], bytes: ['Data', 'byte'], bit: ['Data', 'bit'], bits: ['Data', 'bit'],
    'km/h': ['Speed', 'km/h'], kmh: ['Speed', 'km/h'], mph: ['Speed', 'mph'], 'm/s': ['Speed', 'm/s'], knot: ['Speed', 'knot'], knots: ['Speed', 'knot'],
    c: ['Temperature', '°C'], '°c': ['Temperature', '°C'], f: ['Temperature', '°F'], '°f': ['Temperature', '°F'], k: ['Temperature', 'K'],
    l: ['Volume', 'liter'], liter: ['Volume', 'liter'], liters: ['Volume', 'liter'], ml: ['Volume', 'ml'], gallon: ['Volume', 'gallon'], gallons: ['Volume', 'gallon'], cup: ['Volume', 'cup'], cups: ['Volume', 'cup'],
    second: ['Time', 'second'], seconds: ['Time', 'second'], sec: ['Time', 'second'], minute: ['Time', 'minute'], minutes: ['Time', 'minute'], hour: ['Time', 'hour'], hours: ['Time', 'hour'], day: ['Time', 'day'], days: ['Time', 'day'], week: ['Time', 'week'], weeks: ['Time', 'week'] };
  const THEME_IDS = () => Object.keys(window.auroraStudio ? window.auroraStudio.PACKS : {});
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const genPass = (n = 20) => { const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+'; let o = ''; for (let i = 0; i < n; i++) o += set[rnd(set.length)]; return o; };
  const act = (label, hint, run, icon = '⚡') => ({ act: true, label, hint, run, icon, changes: ['Sound', 'Display', 'Appearance', 'Power', 'Keep awake'].includes(hint) });

  function commands(qs) {
    const q = qs.trim(); if (!q) return []; const low = q.toLowerCase(); const out = [];
    // math
    if (A && /^[\d\s+\-*/^().%!,]+$|^(sin|cos|tan|asin|acos|atan|sqrt|ln|log|abs|exp|pi|round|floor|ceil)\b/i.test(q) && /[\d]|pi/i.test(q)) { try { const v = A.calcEval(q.replace(/,/g, ''), true); const s = A.fmtNum(v); out.push(act('= ' + s, 'Enter copies the answer', async () => ((await copy(s)) ? 'Copied ' + s : 'Answer: ' + s), '🧮')); } catch (_) { /* not a calculation */ } }
    // unit conversion
    { const m = /^(?:convert\s+)?(-?[\d.]+)\s*([a-z°/²³]+)\s+(?:to|in|into|as)\s+([a-z°/²³]+)$/i.exec(q); if (A && m) { const a = ALIAS[m[2].toLowerCase()], b = ALIAS[m[3].toLowerCase()]; if (a && b && a[0] === b[0] && Number.isFinite(Number(m[1]))) { const r = A.convertUnit(a[0], Number(m[1]), a[1], b[1]); const s = `${A.fmtNum(Number(m[1]))} ${a[1]} = ${A.fmtNum(r)} ${b[1]}`; out.push(act(s, 'Enter copies the result', async () => ((await copy(A.fmtNum(r))) ? 'Copied ' + A.fmtNum(r) : s), '📐')); } } }
    { const m = /^vol(?:ume)?\s+(\d{1,3})$/.exec(low); if (m && Number(m[1]) <= 100) out.push(act(`Set volume to ${m[1]}%`, 'Sound', async () => { await call('volumeSet', { value: Number(m[1]) }); return 'Volume ' + m[1] + '%'; }, '🔊')); }
    if (/^(mute|unmute)$/.test(low)) out.push(act(low === 'mute' ? 'Mute the sound' : 'Unmute the sound', 'Sound', async () => { await call('muteSet', { value: low === 'mute' }); return low === 'mute' ? 'Muted' : 'Unmuted'; }, low === 'mute' ? '🔇' : '🔊'));
    { const m = /^bright(?:ness)?\s+(\d{1,3})$/.exec(low); if (m && Number(m[1]) <= 100) out.push(act(`Set brightness to ${m[1]}%`, 'Display', async () => { await call('brightnessSet', { value: Number(m[1]) }); return 'Brightness ' + m[1] + '%'; }, '🔆')); }
    { const m = /^(dark|light)(?:\s*mode)?$/.exec(low); if (m) out.push(act(`Switch to ${m[1]} mode`, 'Appearance', async () => { await call('toggleSet', { id: 'darkMode', value: m[1] === 'dark' }); applyTheme(m[1] === 'dark'); return m[1] === 'dark' ? 'Dark mode' : 'Light mode'; }, m[1] === 'dark' ? '🌙' : '☀️')); }
    { const m = /^(?:power|plan)\s+(high|balanced|saver)$/.exec(low); if (m) out.push(act(`Power plan: ${m[1]}`, 'Power', async () => { const re = { high: /high|ultimate|عالي/i, balanced: /balanced|متوازن/i, saver: /saver|موفر|توفير/i }[m[1]]; const pl = (await call('powerPlans')).find((x) => re.test(x.name)); if (!pl) throw new Error('That power plan is not on this PC'); await call('powerSet', { guid: pl.guid }); return 'Power plan: ' + pl.name; }, '⚡')); }
    { const m = /^(?:awake|keep awake)(?:\s+(off|\d+))?$/.exec(low); if (m) out.push(act(m[1] === 'off' ? 'Stop keeping the PC awake' : `Keep the screen on${m[1] ? ' for ' + m[1] + ' minutes' : ''}`, 'Keep awake', async () => { await call('keepAwakeSet', m[1] === 'off' ? { mode: 'off', minutes: 0 } : { mode: 'display', minutes: Number(m[1] || 0) }); return m[1] === 'off' ? 'Normal sleep again' : 'Screen will stay on'; }, '☕')); }
    if (/^clean(?: temp)?$/.test(low)) out.push(act('Clean temporary files', 'Frees space. Asks first.', async () => { if (!confirm('Delete temporary files now?')) return 'Cancelled'; const n = await call('cleanTemp'); return 'Freed ' + fmtBytes(n); }, '🧹'));
    { const m = /^timer\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hours?)?(?:\s+(.+))?$/.exec(low); if (m) { const u = (m[2] || 'm')[0]; const ms = Number(m[1]) * (u === 's' ? 1000 : u === 'h' ? 3600000 : 60000); out.push(act(`Start a ${fmtT(ms)} timer`, 'Shows in the title bar', async () => { timerStart(ms, m[3] ? m[3].slice(0, 40) : ''); return 'Timer started'; }, '⏱')); } }
    { const m = /^note[:\s]+(.+)$/i.exec(q); if (m) out.push(act('Save note: ' + m[1].slice(0, 50), 'Quick notes', async () => { const st = await loadStore(); await saveGroup('notes', [{ text: m[1].slice(0, 5000), t: Date.now(), pinned: false }, ...st.notes]); return 'Note saved'; }, '📝')); }
    { const m = /^(?:todo|task|remind)[:\s]+(.+)$/i.exec(q); if (m) out.push(act('Add to today: ' + m[1].slice(0, 50), 'Planner', async () => { const st = await call('storeGet'); await call('storeSet', { key: 'planner', value: [...(st.planner || []), { id: newId('p'), date: iso(new Date()), text: m[1].slice(0, 200), done: false }] }); return 'Added to today'; }, '✅')); }
    if (/^(?:snapshot|snap settings|checkpoint)(?:\s+(.+))?$/i.test(q)) { const nm = (/^\S+(?:\s+settings)?\s+(.+)$/i.exec(q) || [])[1] || ''; out.push(act('Save a settings snapshot' + (nm ? ': ' + nm : ''), 'Time Machine', async () => { await call('snapCapture', { name: nm }); return 'Snapshot saved'; }, '🕰')); }
    { const m = /^theme\s+(\w+)$/.exec(low); if (m && THEME_IDS().includes(m[1])) out.push(act('Theme: ' + window.auroraStudio.PACKS[m[1]].name, 'Aurora Studio', async () => { prefs.set('packAccentLock', false); window.auroraStudio.save({ pack: m[1] }); return window.auroraStudio.PACKS[m[1]].name + ' theme'; }, '🎨')); }
    { const m = /^zoom\s+(\d{2,3})$/.exec(low); if (m && Number(m[1]) >= 60 && Number(m[1]) <= 180) out.push(act(`Zoom ${m[1]}%`, 'Window', async () => { await setZoom(Number(m[1]) / 100); return 'Zoom ' + m[1] + '%'; }, '🔎')); }
    if (/^(?:pin|on top|always on top)$/.test(low)) out.push(act('Toggle always on top', 'Window', async () => { const on = await togglePin(); return on ? 'Aurora stays on top' : 'Back to normal'; }, '📌'));
    if (/^(?:uuid|guid)$/.test(low)) out.push(act('Make a new UUID', 'Enter copies it', async () => { const u = crypto.randomUUID(); await copy(u); return 'Copied ' + u; }, '🆔'));
    if (/^(?:pass|password|pw)(?:\s+(\d{1,2}))?$/.test(low)) { const n = Number((/(\d+)/.exec(low) || [])[1] || 20); if (n >= 8 && n <= 64) out.push(act(`Make a strong ${n}-character password`, 'Created here, copied, never stored', async () => { await copy(genPass(n)); return 'Password copied to the clipboard'; }, '🔑')); }
    if (/^(?:coin|flip|flip a coin|heads or tails)$/.test(low)) out.push(act('Flip a coin', '', async () => (rnd(2) ? '🪙 Heads' : '🪙 Tails'), '🪙'));
    { const m = /^(?:roll\s*)?d(\d{1,4})$/.exec(low); if (m && Number(m[1]) >= 2) out.push(act(`Roll a d${m[1]}`, '', async () => '🎲 ' + (rnd(Number(m[1])) + 1), '🎲')); }
    { const m = /^(?:random|rand)\s+(-?\d+)\s*[-–to ]+\s*(-?\d+)$/.exec(low); if (m) { const lo = Math.min(Number(m[1]), Number(m[2])), hi = Math.max(Number(m[1]), Number(m[2])); if (hi - lo < 4e9) out.push(act(`Random number from ${lo} to ${hi}`, '', async () => { const v = lo + rnd(hi - lo + 1); await copy(v); return '🎯 ' + v + ' (copied)'; }, '🎯')); } }
    { const m = /^days?\s+(?:until|to)\s+(\d{4}-\d{2}-\d{2})$/.exec(low); if (m) { const d = new Date(m[1] + 'T12:00:00'); if (!isNaN(d)) { const t = new Date(); t.setHours(12, 0, 0, 0); const n = Math.round((d - t) / 86400000); out.push(act(n === 0 ? 'That is today' : n > 0 ? `${n} days until ${m[1]}` : `${-n} days since ${m[1]}`, '', async () => `${Math.abs(n)} days`, '📅')); } } }
    { const m = /^(?:install|get)\s+(.+)$/.exec(low); if (m) out.push(act('Find "' + m[1] + '" in Aurora Store', 'Aurora Store', async () => { window.__storeQuery = m[1]; go('store', 'appstore'); return ''; }, '🛍️')); }
    // profiles
    PROFILE_NAMES.forEach((n) => { if (low === n.toLowerCase() || low === 'profile ' + n.toLowerCase() || low === 'scene ' + n.toLowerCase()) out.push(act('Run profile: ' + n, 'Profiles', async () => { const r = await call('profileRun', { name: n }); return `${n}: ${r.ok} of ${r.total} steps applied`; }, '⚡')); });
    return out;
  }
  let PROFILE_NAMES = []; const refreshProfiles = () => call('profilesList').then((l) => { PROFILE_NAMES = l.map((p) => p.name); }).catch(() => {});
  refreshProfiles(); setInterval(refreshProfiles, 120000);
  window.auroraCommands = commands;

  /* ---------- window conveniences ---------- */
  let pinned = false, zoom = Number(prefs.get('zoom')) || 1;
  async function togglePin() { pinned = await call('windowPin', { on: !pinned }); pinBtn.classList.toggle('on', pinned); pinBtn.title = pinned ? 'Always on top: on' : 'Keep Aurora on top of other windows'; return pinned; }
  async function setZoom(f) { f = Math.max(0.6, Math.min(1.8, Math.round(f * 100) / 100)); zoom = await call('windowZoom', { factor: f }); prefs.set('zoom', zoom); return zoom; }
  const tb = document.querySelector('.titlebar'); const pinBtn = document.createElement('button'); pinBtn.className = 'tb-btn'; pinBtn.textContent = '📌'; pinBtn.title = 'Keep Aurora on top of other windows'; pinBtn.onclick = () => togglePin().catch((e) => toast(errText(e), true));
  const keyBtn = document.createElement('button'); keyBtn.className = 'tb-btn'; keyBtn.textContent = '⌨'; keyBtn.title = 'Keyboard shortcuts (?)'; keyBtn.onclick = () => sheet(true);
  tb.append(pinBtn, keyBtn);
  if (zoom !== 1) setZoom(zoom).catch(() => {});
  if (window.api && window.api.onSummon) window.api.onSummon(() => { paletteOpen(true); });
  if (window.api && window.api.onGoto) window.api.onGoto((pg) => { try { go(pg); } catch (_) { /* ignore */ } });
  try { if (window.api && window.api.launcher && typeof PAGES !== 'undefined') window.api.launcher('setPages', { pages: PAGES.map((p) => ({ id: p.id, title: p.title, kw: String(p.keywords || p.desc || '') })) }).catch(() => {}); } catch (_) { /* ignore */ }

  /* ---------- keyboard shortcuts + cheat sheet ---------- */
  const SHORTS = [['Ctrl K', 'Command bar: search settings or type a command'], ['Ctrl Alt Space', 'Summon Aurora from anywhere, command bar ready'], ['Alt 1 to 9', 'Jump to a page in the sidebar'], ['Alt ← / Alt →', 'Back and forward between pages'], ['Ctrl + / Ctrl −  /  Ctrl 0', 'Zoom in, out, reset'], ['Ctrl Shift P', 'Keep Aurora on top'], ['?', 'Show this list'], ['Esc', 'Close the command bar or this list']];
  const sh = document.createElement('div'); sh.id = 'shortcuts'; sh.hidden = true; const card = document.createElement('div'); card.className = 'sheet'; card.append(el('div', 'label', 'Keyboard shortcuts'));
  SHORTS.forEach(([k, d]) => { const r = el('div', 'list-row'); r.append(el('kbd', '', k), el('div', 'sub', d)); card.append(r); });
  const cmdHelp = el('div', 'sub', 'Command bar examples: 2*(3+4)^2 · 5 km to miles · volume 30 · dark · timer 10 tea · note buy milk · todo call Sara · snapshot before update · theme neon · install firefox · pass 24 · roll d20 · days until 2027-01-01'); cmdHelp.style.marginTop = '8px'; card.append(cmdHelp); sh.append(card); document.body.append(sh);
  const sheet = (v) => { sh.hidden = !v; }; sh.onclick = (e) => { if (e.target === sh) sheet(false); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sh.hidden) { sheet(false); return; }
    if (e.altKey && /^[1-9]$/.test(e.key)) { const p = PAGES[Number(e.key) - 1]; if (p) { e.preventDefault(); go(p.id); } return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); histMove(-1); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); histMove(1); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoom + 0.1).then((z) => toast('Zoom ' + Math.round(z * 100) + '%')).catch(() => {}); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setZoom(zoom - 0.1).then((z) => toast('Zoom ' + Math.round(z * 100) + '%')).catch(() => {}); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); setZoom(1).then(() => toast('Zoom 100%')).catch(() => {}); return; }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePin().catch(() => {}); return; }
    if (e.key === '?' && !typing() && !pal.open) { e.preventDefault(); sheet(sh.hidden); }
  });

  /* ---------- recent pages + back/forward ---------- */
  const hist = []; let hi = -1, navigating = false; const recent = () => (Array.isArray(prefs.get('recent')) ? prefs.get('recent') : []);
  window.auroraAfterGo = (pageId) => {
    prefs.set('lastPage', pageId);
    if (!navigating && PAGES.some((p) => p.id === pageId) && hist[hi] !== pageId) { hist.splice(hi + 1); hist.push(pageId); hi = hist.length - 1; if (hist.length > 60) { hist.shift(); hi--; } }
    if (pageId !== 'home') prefs.set('recent', [pageId, ...recent().filter((x) => x !== pageId)].slice(0, 6));
    if (pageId === 'home') jump();
  };
  function histMove(d) { const n = hi + d; if (n < 0 || n >= hist.length) return; hi = n; navigating = true; try { go(hist[hi]); } finally { navigating = false; } }
  function jump() {
    const r = recent().filter((id) => PAGES.some((p) => p.id === id)); const page = document.getElementById('page'); if (!r.length || !page) return;
    const row = el('div', 'jump'); row.append(el('span', 'sub', 'Jump back in')); r.slice(0, 5).forEach((id) => { const p = PAGES.find((x) => x.id === id); const c = el('button', 'chip', p.icon + ' ' + p.title); c.onclick = () => go(id); row.append(c); }); const sub = page.querySelector('.page-sub'); if (sub) sub.after(row);
  }
  hist.push('home'); hi = 0; jump();


  /* ---------- search your own data from the command bar ---------- */
  const DATA = { t: 0, busy: false, notes: [], planner: [], journal: [], plus: {} };
  function refreshData() {
    if (DATA.busy || Date.now() - DATA.t < 20000) return; DATA.busy = true;
    call('storeGet').then((st) => { DATA.notes = st.notes || []; DATA.planner = st.planner || []; DATA.journal = st.journal || []; DATA.plus = st.plus || {}; DATA.t = Date.now(); }).catch(() => {}).finally(() => { DATA.busy = false; });
  }
  const snip = (text, q) => { const t = String(text).replace(/\s+/g, ' '); const i = t.toLowerCase().indexOf(q); const a = Math.max(0, i - 25); return (a ? '…' : '') + t.slice(a, a + 70) + (t.length > a + 70 ? '…' : ''); };
  function dataResults(qs) {
    const q = qs.trim().toLowerCase(); if (q.length < 2) return []; refreshData(); const out = []; const hit = (t) => String(t).toLowerCase().includes(q);
    const add = (icon, label, hint, run) => { if (out.length < 8) out.push({ act: true, data: true, icon, label, hint, run }); };
    DATA.notes.filter((n) => hit(n.text)).slice(0, 3).forEach((n) => add('📝', snip(n.text, q), 'Your note · Enter opens Quick notes', async () => { go('wintools', 'notes'); return ''; }));
    DATA.planner.filter((x) => hit(x.text)).slice(0, 3).forEach((x) => add(x.done ? '✅' : '🗓', `${x.text} (${x.date})`, 'Your planner · Enter opens Planner', async () => { go('aurora-apps', 'planner'); return ''; }));
    DATA.journal.filter((x) => hit(x.text)).slice(0, 2).forEach((x) => add('📔', `${x.date}: ${snip(x.text, q)}`, 'Your journal · Enter opens it', async () => { go('aurora-apps', 'journal'); return ''; }));
    (DATA.plus.snippets || []).filter((x) => hit(x.title) || hit(x.text)).slice(0, 3).forEach((x) => add('✂️', x.title, 'Your snippet · Enter copies it', async () => ((await copy(x.text)) ? 'Copied snippet "' + x.title + '"' : 'Clipboard blocked')));
    (DATA.plus.cards || []).filter((x) => hit(x.front) || hit(x.back)).slice(0, 2).forEach((x) => add('🃏', `${x.front} → ${x.back}`, 'Your flashcard · Enter opens Flashcards', async () => { go('aurora-plus', 'cards'); return ''; }));
    (DATA.plus.goals || []).filter((x) => hit(x.name)).slice(0, 2).forEach((x) => add('🎯', x.name, 'Your goal', async () => { go('aurora-plus', 'goals'); return ''; }));
    (DATA.plus.lists || []).filter((x) => hit(x.title) || hit(x.note)).slice(0, 2).forEach((x) => add('📚', x.title, 'Your list', async () => { go('aurora-plus', 'lists'); return ''; }));
    (DATA.plus.kanban || []).filter((x) => hit(x.title)).slice(0, 2).forEach((x) => add('🗂', x.title, 'Your board', async () => { go('aurora-plus', 'kanban'); return ''; }));
    return out;
  }
  const baseCommands = commands;
  window.auroraCommands = (qs) => [...baseCommands(qs), ...dataResults(qs)];
  refreshData();

  /* ---------- quick capture (Ctrl+Shift+N) ---------- */
  const qc = document.createElement('div'); qc.id = 'qcapture'; qc.hidden = true; const qcard = document.createElement('div'); qcard.className = 'sheet'; qc.append(qcard); document.body.append(qc);
  const qkind = document.createElement('select'); qkind.className = 'filter'; [['note', 'Quick note'], ['todo', 'To-do for today'], ['journal', 'Add to today’s journal'], ['snippet', 'Snippet (first line is the title)']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; qkind.append(o); });
  const qtext = document.createElement('textarea'); qtext.className = 'filter'; qtext.rows = 5; qtext.placeholder = 'Type it here. Ctrl+Enter saves.'; qtext.style.cssText = 'margin:8px 0;width:100%;resize:vertical;font:inherit';
  const qsave = B('Save', 'primary', async () => { try { await quickSave(qkind.value, qtext.value); qtext.value = ''; quick(false); } catch (e) { toast(errText(e), true); } });
  qcard.append(el('div', 'label', 'Quick capture'), qkind, qtext, (() => { const r = el('div', 'savebar'); r.append(qsave, B('Cancel', '', () => quick(false))); return r; })());
  const quick = (v) => { qc.hidden = !v; if (v) { qtext.focus(); } }; qc.onclick = (e) => { if (e.target === qc) quick(false); };
  async function quickSave(kind, raw) {
    const text = raw.trim(); if (!text) throw new Error('Type something first');
    if (kind === 'note') { const st = await loadStore(); await saveGroup('notes', [{ text: text.slice(0, 5000), t: Date.now(), pinned: false }, ...st.notes]); toast('Note saved'); }
    else if (kind === 'todo') { const st = await call('storeGet'); await call('storeSet', { key: 'planner', value: [...(st.planner || []), { id: newId('p'), date: iso(new Date()), text: text.slice(0, 200), done: false }] }); toast('Added to today'); }
    else if (kind === 'journal') { const st = await call('storeGet'); const d = iso(new Date()); const cur = (st.journal || []).find((x) => x.date === d); const next = [...(st.journal || []).filter((x) => x.date !== d), cur ? { ...cur, text: (cur.text + '\n' + text).slice(0, 20000) } : { id: newId('j'), date: d, text: text.slice(0, 20000), mood: 0 }]; await call('storeSet', { key: 'journal', value: next }); toast('Added to today’s journal'); }
    else { const lines = text.split('\n'); const st = await call('storeGet'); await call('storeSet', { key: 'plus:snippets', value: [...((st.plus || {}).snippets || []), { id: newId('s'), title: lines[0].slice(0, 60), text: text.slice(0, 5000) }] }); toast('Snippet saved'); }
    DATA.t = 0;
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); quick(qc.hidden); return; }
    if (!qc.hidden) { if (e.key === 'Escape') quick(false); else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); qsave.click(); } }
  });
  window.auroraQuick = { open: () => quick(true), save: quickSave };

  /* ---------- Today overview on Home ---------- */
  CUSTOM.today = (box) => {
    box.style.gap = '10px';
    let lastKey = '';
    const draw = async (auto) => {
      let st; try { st = await call('storeGet'); } catch (_) { return fail(box); } const act = document.activeElement; if (act && box.contains(act) && act.tagName === 'INPUT' && act.type !== 'checkbox') return;
      const key = JSON.stringify([iso(new Date()), new Date().getHours(), st.planner, st.habits, (st.plus || {}).water, (st.plus || {}).countdowns, (st.plus || {}).timelog, (st.plus || {}).cards]); if (auto === true && key === lastKey) return; lastKey = key;
      const today = iso(new Date()), plus = st.plus || {}; box.replaceChildren(); const h = new Date().getHours(); const hello = h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
      box.append(el('div', 'label', `${hello}. ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}`));
      const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px'; box.append(grid); const tile = (title, go2) => { const c = el('div', 'today-tile'); const hd = el('div', 'label', title); hd.style.cursor = 'pointer'; hd.onclick = go2; c.append(hd); grid.append(c); return c; };
      const todos = (st.planner || []).filter((x) => x.date === today); const t1 = tile(`🗓 Today (${todos.filter((x) => !x.done).length} to do)`, () => go('aurora-apps', 'planner'));
      if (!todos.length) t1.append(el('div', 'sub', 'Nothing planned. Press Ctrl+Shift+N to add something.')); todos.slice(0, 6).forEach((x) => { const r = el('label', 'today-row'); const c = el('input'); c.type = 'checkbox'; c.checked = x.done; c.onchange = async () => { try { await call('storeSet', { key: 'planner', value: (st.planner || []).map((y) => (y.id === x.id ? { ...y, done: c.checked } : y)) }); } catch (e) { toast(errText(e), true); } draw(); }; r.append(c, ' ' + x.text); if (x.done) r.style.textDecoration = 'line-through'; t1.append(r); });
      const goal = (plus.water || []).find((x) => x.date === '1970-01-01'); const drunk = (plus.water || []).filter((x) => x.date === today).reduce((a, x) => a + x.ml, 0); const gml = goal ? goal.ml : 2500; const t2 = tile(`💧 Water ${Math.min(100, Math.round(drunk / gml * 100))}%`, () => go('aurora-plus', 'water')); const bar = el('div', 'bar'); const bi = document.createElement('i'); bi.style.width = Math.max(2, Math.min(100, drunk / gml * 100)) + '%'; bar.append(bi); t2.append(bar, el('div', 'sub', `${drunk} of ${gml} ml`)); const add = B('+250 ml', '', async () => { try { await call('storeSet', { key: 'plus:water', value: [...(plus.water || []), { id: newId('w'), date: today, ml: 250 }] }); } catch (e) { toast(errText(e), true); } draw(); }); t2.append(add);
      const habits = st.habits || []; const left = habits.filter((x) => !x.days.includes(today)); const t3 = tile(`🔥 Habits (${left.length} left)`, () => go('aurora-apps', 'habits')); if (!habits.length) t3.append(el('div', 'sub', 'No habits yet.')); habits.slice(0, 6).forEach((x) => { const r = el('label', 'today-row'); const c = el('input'); c.type = 'checkbox'; c.checked = x.days.includes(today); c.onchange = async () => { const nd = c.checked ? [...new Set([...x.days, today])] : x.days.filter((d) => d !== today); try { await call('storeSet', { key: 'habits', value: habits.map((y) => (y.id === x.id ? { ...y, days: nd } : y)) }); } catch (e) { toast(errText(e), true); } draw(); }; r.append(c, ' ' + x.name); t3.append(r); });
      const cds = (plus.countdowns || []).map((x) => ({ ...x, d: Math.round((new Date(x.date + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000) })).filter((x) => x.d >= 0).sort((a, b) => a.d - b.d); if (cds.length) { const t4 = tile('⏳ Coming up', () => go('aurora-plus', 'countdowns')); cds.slice(0, 3).forEach((x) => t4.append(el('div', 'today-row', `${x.name}: ${x.d === 0 ? 'today' : x.d + ' day' + (x.d === 1 ? '' : 's')}`))); }
      const run = (plus.timelog || []).find((x) => !x.end); if (run) { const t5 = tile('⏱ Tracking time', () => go('aurora-plus', 'timelog')); t5.append(el('div', '', run.task), el('div', 'sub', 'since ' + new Date(run.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))); }
      const due = (plus.cards || []).filter((c) => !c.due || c.due <= today).length; if (due) { const t6 = tile('🃏 Flashcards', () => go('aurora-plus', 'cards')); t6.append(el('div', '', `${due} card${due === 1 ? '' : 's'} due for review`)); }
    };
    const tm = setInterval(() => { if (!document.body.contains(box)) clearInterval(tm); else draw(true); }, 5000); draw();
  };
  { const home = PAGES.find((x) => x.id === 'home'); if (home && home.sections[0]) home.sections[0].items.unshift({ type: 'custom', id: 'today', label: 'Today overview planner water habits countdowns what is next', kw: 'today dashboard overview agenda', render: 'today' }); if (typeof currentPage !== 'undefined' && currentPage === 'home') go('home'); } // Home was drawn before this file loaded: draw it again with the new card

  /* ---------- Settings Time Machine ---------- */
  const labelOf = (id) => { const x = INDEX.find((i) => i.it.id === id && i.it.type === 'toggle'); return x ? x.it.label : ({ volume: 'Volume', muted: 'Muted', brightness: 'Brightness', plan: 'Power plan' }[id] || id); };
  const showVal = (kind, v) => (kind === 'toggle' ? (v ? 'On' : 'Off') : kind === 'plan' ? String(v).slice(0, 8) + '…' : String(v) + '%');
  CUSTOM.timemachine = (box) => {
    box.style.gap = '10px'; let diffFor = null, diffRows = [], picked = new Set();
    const draw = async () => {
      let list, st; try { [list, st] = await Promise.all([call('snapList'), call('storeGet')]); } catch (_) { return fail(box); }
      box.replaceChildren(); box.append(el('div', 'muted', 'Aurora keeps a history of how your settings looked, so you can see what changed and roll back one setting or all of them. A "Before restoring" copy is saved automatically, so even a restore can be undone.'));
      const nm = el('input', 'filter'); nm.placeholder = 'Name this moment (optional)'; const take = B('📸 Save snapshot now', 'primary', async () => { take.disabled = true; try { await call('snapCapture', { name: nm.value.trim() }); toast('Snapshot saved'); nm.value = ''; } catch (e) { toast(errText(e), true); } diffFor = null; draw(); }); const r1 = el('div', 'savebar'); r1.append(nm, take); box.append(r1);
      const lab = el('label', 'sub'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!st.snapshotsOn; cb.onchange = async () => { try { await saveGroup('settings', { ...storeCache.settings, autosnap: cb.checked }); toast(cb.checked ? 'A snapshot will be saved once a day' : 'Daily snapshots are off'); } catch (e) { toast(errText(e), true); cb.checked = !cb.checked; } }; lab.append(cb, ' Save a snapshot automatically once a day'); box.append(lab);
      if (!list.length) return box.append(el('div', 'muted', 'No snapshots yet. Save one before you try something risky.'));
      list.forEach((s) => {
        const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', (s.auto ? '🤖 ' : '📸 ') + s.name), el('div', 'sub', `${new Date(s.t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · ${s.toggles} settings${s.hasVolume ? ' · sound' : ''}${s.hasBrightness ? ' · brightness' : ''}${s.hasPlan ? ' · power plan' : ''}`));
        const b = el('div'); b.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; b.append(B(diffFor === s.id ? 'Hide changes' : 'What changed?', '', async () => { if (diffFor === s.id) { diffFor = null; return draw(); } try { diffRows = await call('snapDiff', { id: s.id }); } catch (e) { return toast(errText(e), true); } diffFor = s.id; picked = new Set(diffRows.map((x) => x.id)); draw(); }), B('Restore all', '', async () => { if (!confirm(`Put all settings back to "${s.name}"? A safety snapshot is saved first.`)) return; try { const r = await call('snapRestore', { id: s.id }); toast(`Restored ${r.ok} of ${r.total} settings`); } catch (e) { toast(errText(e), true); } diffFor = null; draw(); }), B('Delete', 'danger', async () => { if (!confirm('Delete this snapshot?')) return; await call('snapDelete', { id: s.id }); diffFor = null; draw(); })); r.append(l, b); box.append(r);
        if (diffFor === s.id) {
          const d = el('div', 'store-info'); if (!diffRows.length) d.append(el('div', 'store-ok', 'Nothing has changed since this snapshot.'));
          else { d.append(el('div', 'sub', `${diffRows.length} difference${diffRows.length === 1 ? '' : 's'} between then and now. Tick the ones to roll back:`)); diffRows.forEach((x) => { const row = el('label', 'list-row'); const c = el('input'); c.type = 'checkbox'; c.checked = picked.has(x.id); c.onchange = () => { c.checked ? picked.add(x.id) : picked.delete(x.id); rb.disabled = !picked.size; rb.textContent = `Roll back ${picked.size} selected`; }; const t = el('div', '', ` ${labelOf(x.id)}: ${showVal(x.kind, x.now)} now, was ${showVal(x.kind, x.was)}`); const w = el('div'); w.style.cssText = 'display:flex;gap:6px;align-items:center'; w.append(c, t); row.append(w); d.append(row); }); }
          const rb = B(`Roll back ${picked.size} selected`, 'primary', async () => { try { const r = await call('snapRestore', { id: s.id, only: [...picked] }); toast(`Rolled back ${r.ok} of ${r.total}`); } catch (e) { toast(errText(e), true); } diffFor = null; draw(); }); if (diffRows.length) d.append(rb); box.append(d);
        }
      });
    };
    draw();
  };
}
