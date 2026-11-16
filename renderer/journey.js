/* Aurora Journey: levels, daily streaks, achievements, daily quests and unlockable accent colours. Everything stays on this PC. */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const level = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const levelStart = (lv) => 50 * (lv - 1) ** 2;
  const ACH = [
    ['first', '👋 First steps', 'Open Aurora Journey', (s) => !!s.pages.journey],
    ['explorer5', '🧭 Explorer', 'Visit 5 different pages', (s) => Object.keys(s.pages).length >= 5],
    ['explorer12', '🗺️ Cartographer', 'Visit 12 different pages', (s) => Object.keys(s.pages).length >= 12],
    ['hash', '🔐 Trust but verify', 'Check a file with the File checker', (s) => !!s.calls.utilsHash],
    ['space', '🔎 Space detective', 'Scan a folder with Space Finder', (s) => !!s.calls.spaceScan],
    ['compare', '⚖️ Side by side', 'Compare two folders', (s) => !!s.calls.utilsCompare],
    ['join', '🧩 Puzzle master', 'Join split files', (s) => !!s.calls.joinRun],
    ['streak3', '🔥 On a roll', 'Use Aurora 3 days in a row', (s) => s.best >= 3],
    ['streak7', '🌋 Unstoppable', 'Use Aurora 7 days in a row', (s) => s.best >= 7],
    ['owl', '🦉 Night owl', 'Open Aurora between midnight and 4 am', (s) => !!s.flags.owl],
    ['bird', '🐦 Early bird', 'Open Aurora between 5 and 7 am', (s) => !!s.flags.bird],
    ['busy', '⚡ Power user', 'Use 100 features', (s) => s.total >= 100],
    ['lv5', '⭐ Level 5', 'Reach level 5', (s) => level(s.xp) >= 5],
    ['lv10', '🌟 Level 10', 'Reach level 10', (s) => level(s.xp) >= 10]
  ];
  const QUESTS = [['spaceScan', 'Scan a folder with Space Finder'], ['utilsHash', 'Check a file with the File checker'], ['utilsCompare', 'Compare two folders'], ['utilsManifestCheck', 'Check a folder against a checksum list'], ['spaceReveal', 'Show a file in its folder from Space Finder or Utilities']];
  const REWARDS = [[2, '#00e5a8', 'Mint'], [3, '#ff7ad9', 'Bubblegum'], [4, '#ffb347', 'Amber'], [5, '#7df9ff', 'Ice'], [7, '#b388ff', 'Royal'], [10, '#ff5c5c', 'Ruby']];
  const fresh = () => ({ xp: 0, pages: {}, calls: {}, total: 0, days: [], best: 0, ach: {}, flags: {}, quest: { day: '', ids: [], done: [] } });
  const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const questsFor = (d) => { const idx = QUESTS.map((_, i) => i); let seed = hash(d); const out = []; while (out.length < 3) { seed = Math.imul(seed, 1664525) + 1013904223 >>> 0; out.push(idx.splice(seed % idx.length, 1)[0]); } return out.map((i) => QUESTS[i][0]); };
  /* pure engine: takes a state, returns { state, events } */
  const step = (s0, ev, now) => {
    const s = JSON.parse(JSON.stringify(s0)); const events = []; const add = (n, why) => { s.xp += n; };
    const d = day(now); const hr = new Date(now).getHours();
    if (!s.days.includes(d)) { // first activity of the day: streak and daily bonus
      const yest = day(now - 86400000); const prev = s.days[s.days.length - 1]; s.days.push(d); if (s.days.length > 400) s.days.shift();
      s.streak = prev === yest ? (s.streak || 0) + 1 : 1; s.best = Math.max(s.best || 0, s.streak); add(25 + Math.min(25, s.streak * 2)); events.push({ type: 'daily', streak: s.streak });
    }
    if (hr < 4) s.flags.owl = 1; if (hr >= 5 && hr < 7) s.flags.bird = 1;
    if (s.quest.day !== d) s.quest = { day: d, ids: questsFor(d), done: [] };
    if (ev.page && !s.pages[ev.page]) { s.pages[ev.page] = 1; add(15); }
    if (ev.call) { s.total++; if (!s.calls[ev.call]) { s.calls[ev.call] = 1; add(10); } else s.calls[ev.call]++; if (s.quest.ids.includes(ev.call) && !s.quest.done.includes(ev.call)) { s.quest.done.push(ev.call); add(30); events.push({ type: 'quest', id: ev.call }); } }
    for (const [id, , , test] of ACH) if (!s.ach[id] && test(s)) { s.ach[id] = now; add(40); events.push({ type: 'ach', id }); }
    const before = level(s0.xp); if (level(s.xp) > before) events.push({ type: 'level', level: level(s.xp) });
    return { state: s, events };
  };
  const load = () => { const v = prefs.get('journey'); return v && typeof v === 'object' && typeof v.xp === 'number' ? { ...fresh(), ...v } : fresh(); };
  let state = load();
  /* news about achievements never pops up over your work: a dot appears on the Journey item in the sidebar, and messages show only while you are on that page */
  let unseen = 0; const mark = () => { const b = document.querySelector('.nav-item[title="Aurora Journey"]'); if (b) b.classList.toggle('has-new', unseen > 0); };
  const announce = (events) => { const n = events.filter((e) => e.type !== 'daily').length; if (!n) return; if (currentPage === 'journey') { events.filter((e) => e.type !== 'daily').forEach((e, i) => setTimeout(() => toast(e.type === 'level' ? `🎉 Level ${e.level}!` : e.type === 'ach' ? '🏅 Achievement: ' + ACH.find((a) => a[0] === e.id)[1] : '✅ Daily quest done: +30 XP'), i * 2600)); } else { unseen += n; mark(); } };
  const apply = (ev) => { try { const r = step(state, ev, Date.now()); state = r.state; prefs.set('journey', state); announce(r.events); } catch (_) { /* a game must never break settings */ } };
  window.auroraOnCall = (name) => { if (window.auroraExtras && !window.auroraExtras.isOn('journey')) return; if (typeof name === 'string' && name !== 'toggleGet' && name !== 'volumeGet') apply({ call: name }); };
  const prevGo = window.auroraAfterGo; window.auroraAfterGo = (id) => { if (prevGo) prevGo(id); if (window.auroraExtras && !window.auroraExtras.isOn('journey')) return; if (id === 'journey') unseen = 0; apply({ page: id }); mark(); };
  window.auroraJourney = { step, level, levelStart, questsFor, ACH, REWARDS, fresh, day };
  setTimeout(() => { if (!window.auroraExtras || window.auroraExtras.isOn('journey')) apply({ page: 'start' }); }, 1500);

  CUSTOM.journey = (box) => {
    box.style.gap = '12px';
    const draw = () => {
      const s = state; const lv = level(s.xp); const from = levelStart(lv), to = levelStart(lv + 1); const pct = Math.round(((s.xp - from) / (to - from)) * 100);
      box.replaceChildren();
      const top = el('div', 'card jr-top'); top.append(el('div', 'jr-level', `Level ${lv}`), el('div', 'muted', `${s.xp} XP · ${to - s.xp} XP to level ${lv + 1} · 🔥 ${s.streak || 0} day streak (best ${s.best || 0})`)); const bar = el('div', 'jr-bar'); const fill = el('div', 'jr-fill'); fill.style.width = pct + '%'; bar.append(fill); top.append(bar); box.append(top);
      const q = el('div', 'card'); q.append(el('b', '', "Today's quests (+30 XP each)")); for (const id of s.quest.ids) { const done = s.quest.done.includes(id); const r = el('div', 'jr-row' + (done ? ' done' : '')); r.dataset.quest = id; r.append(el('span', '', done ? '✅' : '⬜'), el('span', '', (QUESTS.find((x) => x[0] === id) || [id, id])[1])); q.append(r); } box.append(q);
      const rw = el('div', 'card'); rw.append(el('b', '', 'Rewards: unlock new accent colours as you level up')); const sw = el('div', 'jr-sw');
      for (const [need, col, name] of REWARDS) { const ok = lv >= need; const b = el('button', 'jr-swatch' + (ok ? '' : ' locked'), ok ? '' : '🔒'); b.style.background = ok ? col : ''; b.title = ok ? name : `${name}: reach level ${need}`; b.dataset.color = col; b.disabled = !ok; b.onclick = () => { prefs.set('accent', col); applyAccent(col); toast(name + ' accent on'); }; sw.append(b); }
      rw.append(sw); box.append(rw);
      const ac = el('div', 'card'); ac.append(el('b', '', `Achievements ${Object.keys(s.ach).length}/${ACH.length}`)); for (const [id, title, desc] of ACH) { const got = s.ach[id]; const r = el('div', 'jr-row' + (got ? ' done' : '')); r.dataset.ach = id; r.append(el('span', '', got ? '🏅' : '🔒'), el('span', '', title), el('span', 'muted', desc)); ac.append(r); } box.append(ac);
      const rs = B('Start over', '', async () => { if (!(await askText('Reset your Journey (level, streak, achievements)? Type yes to confirm.')).trim().toLowerCase().startsWith('y')) return; state = fresh(); prefs.set('journey', state); draw(); }); box.append(rs);
    };
    draw();
  };
}
