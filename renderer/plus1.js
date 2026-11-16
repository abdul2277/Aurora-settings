/* Aurora Plus, part 1: organisation tools (saved in Aurora's own store) and calculators. */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const R = (...k) => { const r = el('div', 'savebar'); r.append(...k); return r; };
  const F = (ph, type) => { const i = el('input', 'filter'); i.placeholder = ph || ''; if (type) i.type = type; i.style.margin = '0'; return i; };
  const nid = (p) => p + Math.random().toString(36).slice(2, 10);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = () => iso(new Date());
  // alive until it has been on screen and then removed (a card is not attached yet on its very first draw)
  const live = (box) => { if (box.isConnected) { box._seen = true; return true; } if (!box._t0) box._t0 = Date.now(); return !box._seen && Date.now() - box._t0 < 3000; };
  const num = (v) => { const n = Number(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : NaN; };
  const money = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const card = (box, title) => { const c = el('div', 'card column'); c.style.cssText = 'display:flex;flex-direction:column;gap:8px'; if (title) c.append(el('div', 'label', title)); box.append(c); return c; };
  const sel = (opts, val) => { const s = el('select', 'filter'); s.style.width = 'auto'; opts.forEach(([v, l]) => s.append(Object.assign(el('option', '', l), { value: v }))); if (val != null) s.value = val; return s; };
  // generic store-backed list: load once, save whole list
  const useList = (name, box, draw) => {
    let items = []; const api = { get items() { return items; }, async save(next) { try { await call('storeSet', { key: 'plus:' + name, value: next }); items = next; return true; } catch (e) { toast(errText(e), true); return false; } }, redraw() { draw(api); } };
    call('storeGet').then((st) => { items = (st.plus && st.plus[name]) || []; draw(api); }).catch(() => fail(box)); return api;
  };

  /* 1. Boards (kanban) */
  CUSTOM.kanban = (box) => {
    box.style.gap = '10px'; const COLS = ['To do', 'Doing', 'Done'];
    useList('kanban', box, (L) => {
      box.replaceChildren(); const inp = F('New card (press Enter)'); inp.onkeydown = async (e) => { if (e.key === 'Enter' && inp.value.trim()) { if (await L.save([...L.items, { id: nid('k'), title: inp.value.trim().slice(0, 120), col: 0, t: Date.now() }])) L.redraw(); } }; box.append(inp);
      const g = el('div'); g.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px'; box.append(g);
      COLS.forEach((c, ci) => { const col = el('div', 'kcol'); col.dataset.col = ci; col.append(el('div', 'label', `${c} (${L.items.filter((x) => x.col === ci).length})`));
        L.items.filter((x) => x.col === ci).forEach((x) => { const k = el('div', 'kcard'); k.append(el('div', '', x.title)); const a = el('div'); a.style.cssText = 'display:flex;gap:4px;margin-top:6px'; if (ci > 0) a.append(B('◀', '', async () => { if (await L.save(L.items.map((y) => (y.id === x.id ? { ...y, col: ci - 1 } : y)))) L.redraw(); })); if (ci < 2) a.append(B('▶', '', async () => { if (await L.save(L.items.map((y) => (y.id === x.id ? { ...y, col: ci + 1 } : y)))) L.redraw(); })); a.append(B('✕', '', async () => { if (await L.save(L.items.filter((y) => y.id !== x.id))) L.redraw(); })); k.append(a); col.append(k); }); g.append(col); });
    });
  };

  /* 2. Snippets */
  CUSTOM.snippets = (box) => {
    box.style.gap = '8px'; let q = '';
    useList('snippets', box, (L) => {
      box.replaceChildren(); const t = F('Title'), body = el('textarea', 'filter'); body.rows = 3; body.placeholder = 'Text to keep (an email reply, an address, a command...)'; body.style.cssText = 'margin:0;resize:vertical;font:inherit;width:100%';
      box.append(t, body, R(B('Save snippet', 'primary', async () => { if (!t.value.trim() || !body.value.trim()) return toast('Add a title and some text', true); if (await L.save([...L.items, { id: nid('s'), title: t.value.trim().slice(0, 60), text: body.value.slice(0, 5000) }])) L.redraw(); })));
      const s = F('Search snippets...'); s.value = q; s.oninput = () => { q = s.value.toLowerCase(); lst(); }; const lb = el('div'); box.append(s, lb);
      const lst = () => { lb.replaceChildren(); const sh = L.items.filter((x) => !q || (x.title + x.text).toLowerCase().includes(q)); if (!sh.length) lb.append(el('div', 'muted', L.items.length ? 'No match.' : 'No snippets yet.')); sh.forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', x.title), el('div', 'sub', x.text.replace(/\s+/g, ' ').slice(0, 90))); const a = el('div'); a.style.cssText = 'display:flex;gap:6px'; a.append(B('Copy', 'primary', async () => { try { await navigator.clipboard.writeText(x.text); toast('Copied'); } catch (_) { toast('Clipboard blocked', true); } }), B('Delete', 'danger', async () => { if (await L.save(L.items.filter((y) => y.id !== x.id))) L.redraw(); })); r.append(l, a); lb.append(r); }); }; lst();
    });
  };

  /* 3. Countdowns */
  CUSTOM.countdowns = (box) => {
    box.style.gap = '8px';
    useList('countdowns', box, (L) => {
      box.replaceChildren(); const n = F('Event name'), d = F('', 'date'); box.append(R(n, d, B('Add', 'primary', async () => { if (!n.value.trim() || !d.value) return toast('Add a name and a date', true); if (await L.save([...L.items, { id: nid('c'), name: n.value.trim().slice(0, 60), date: d.value }])) L.redraw(); })));
      const today = new Date(); today.setHours(12, 0, 0, 0); [...L.items].sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => { const days = Math.round((new Date(x.date + 'T12:00:00') - today) / 86400000); const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', x.name), el('div', 'sub', x.date)); const big = el('div', 'cd-days', days === 0 ? 'Today' : days > 0 ? `${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`); r.append(l, big, B('✕', '', async () => { if (await L.save(L.items.filter((y) => y.id !== x.id))) L.redraw(); })); box.append(r); });
      if (!L.items.length) box.append(el('div', 'muted', 'Add a trip, an exam or a birthday and watch the days count down.'));
    });
  };

  /* 4. Goals */
  CUSTOM.goals = (box) => {
    box.style.gap = '8px';
    useList('goals', box, (L) => {
      box.replaceChildren(); const n = F('Goal (for example Save for a laptop)'), tg = F('Target', 'number'), un = F('Unit (SAR, kg, books...)'); tg.style.maxWidth = '120px'; un.style.maxWidth = '140px';
      box.append(R(n, tg, un, B('Add goal', 'primary', async () => { const t = num(tg.value); if (!n.value.trim() || !(t > 0)) return toast('Add a name and a target above zero', true); if (await L.save([...L.items, { id: nid('g'), name: n.value.trim().slice(0, 80), target: t, current: 0, unit: un.value.trim().slice(0, 20) }])) L.redraw(); })));
      L.items.forEach((g) => { const pct = g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0; const r = el('div'); r.append(el('div', 'label', `${g.name}: ${money(g.current)} / ${money(g.target)} ${g.unit} (${pct}%)${pct >= 100 ? ' 🎉' : ''}`)); const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = Math.max(2, pct) + '%'; bar.append(i); const add = F('Add progress', 'number'); add.style.maxWidth = '140px'; const row = R(add, B('Add', '', async () => { const v = num(add.value); if (!Number.isFinite(v) || v === 0) return toast('Enter a number', true); if (await L.save(L.items.map((y) => (y.id === g.id ? { ...y, current: Math.max(0, y.current + v) } : y)))) L.redraw(); }), B('Delete', 'danger', async () => { if (await L.save(L.items.filter((y) => y.id !== g.id))) L.redraw(); })); r.append(bar, row); box.append(r); });
      if (!L.items.length) box.append(el('div', 'muted', 'Set a goal with a target, then add progress as you go.'));
    });
  };

  /* 5. Time tracker */
  CUSTOM.timelog = (box) => {
    box.style.gap = '8px'; let tick = null; const dur = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`; };
    useList('timelog', box, (L) => {
      box.replaceChildren(); clearInterval(tick); const run = L.items.find((x) => !x.end); const n = F(run ? 'Running: ' + run.task : 'What are you working on?'); n.disabled = !!run;
      const go2 = B(run ? '■ Stop' : '▶ Start', 'primary', async () => { if (run) { if (await L.save(L.items.map((y) => (y.id === run.id ? { ...y, end: Date.now() } : y)))) L.redraw(); } else { if (!n.value.trim()) return toast('Name the task first', true); if (await L.save([...L.items, { id: nid('t'), task: n.value.trim().slice(0, 80), start: Date.now(), end: 0 }])) L.redraw(); } });
      const live2 = el('div', 'label', ''); box.append(R(n, go2), live2); if (run) { const u = () => { live2.textContent = '⏱ ' + dur(Date.now() - run.start); }; u(); tick = setInterval(() => { if (!live(box)) clearInterval(tick); else u(); }, 1000); }
      const day = {}; L.items.filter((x) => x.end).forEach((x) => { const k = iso(new Date(x.start)); (day[k] ||= []).push(x); });
      Object.keys(day).sort().reverse().slice(0, 14).forEach((k) => { const tot = day[k].reduce((a, x) => a + (x.end - x.start), 0); box.append(el('div', 'label', `${k}   total ${dur(tot)}`)); day[k].forEach((x) => { const r = el('div', 'list-row'); r.append(el('div', 'sub', `${x.task} · ${dur(x.end - x.start)}`), B('✕', '', async () => { if (await L.save(L.items.filter((y) => y.id !== x.id))) L.redraw(); })); box.append(r); }); });
      const done = L.items.filter((x) => x.end); if (done.length) box.append(B('Export CSV', '', () => { const rows = [['Task', 'Start', 'End', 'Minutes'], ...done.map((x) => [x.task, new Date(x.start).toISOString(), new Date(x.end).toISOString(), ((x.end - x.start) / 60000).toFixed(1)])]; const csv = rows.map((r) => r.map((v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = 'time-log.csv'; document.body.append(a); a.click(); a.remove(); }));
    });
  };

  /* 6. Lists (reading / watching / games) */
  CUSTOM.lists = (box) => {
    box.style.gap = '8px'; let kind = 'All';
    useList('lists', box, (L) => {
      box.replaceChildren(); const t = F('Title'), k = sel([['Book', 'Book'], ['Movie', 'Movie'], ['Series', 'Series'], ['Game', 'Game'], ['Other', 'Other']]), note = F('Note (optional)');
      box.append(R(t, k, note, B('Add', 'primary', async () => { if (!t.value.trim()) return toast('Type a title', true); if (await L.save([...L.items, { id: nid('l'), title: t.value.trim().slice(0, 120), kind: k.value, status: 'want', note: note.value.trim().slice(0, 200) }])) L.redraw(); })));
      const chips = el('div', 'store-chips'); ['All', 'Book', 'Movie', 'Series', 'Game', 'Other'].forEach((c) => { const b = el('button', 'chip' + (c === kind ? ' on' : ''), c); b.onclick = () => { kind = c; L.redraw(); }; chips.append(b); }); box.append(chips);
      const ST = [['want', '📌 Want'], ['doing', '▶ In progress'], ['done', '✅ Done']];
      L.items.filter((x) => kind === 'All' || x.kind === kind).forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', x.title), el('div', 'sub', x.kind + (x.note ? ' · ' + x.note : ''))); const s = sel(ST, x.status); s.onchange = async () => { if (await L.save(L.items.map((y) => (y.id === x.id ? { ...y, status: s.value } : y)))) L.redraw(); }; const a = el('div'); a.style.cssText = 'display:flex;gap:6px'; a.append(s, B('✕', '', async () => { if (await L.save(L.items.filter((y) => y.id !== x.id))) L.redraw(); })); r.append(l, a); box.append(r); });
      if (!L.items.length) box.append(el('div', 'muted', 'Keep track of books, films, series and games.'));
    });
  };

  /* 7. Reminders (daily, run by Aurora in the background through automation rules) */
  CUSTOM.reminders = (box) => {
    box.style.gap = '8px';
    const draw = async () => {
      let st; try { st = await call('storeGet'); } catch (_) { return fail(box); }
      box.replaceChildren(); box.append(el('div', 'muted', 'Reminders show a desktop notification at the time you choose, even when the Aurora window is closed (Aurora keeps running in the tray). They are saved as Automation rules, so you can also see them there.'));
      const txt = F('Remind me to...'), at = F('', 'time'); at.value = '09:00'; const days = el('div', 'store-chips'); const on = new Set([0, 1, 2, 3, 4, 5, 6]); ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d, i) => { const c = el('button', 'chip on', d); c.onclick = () => { on.has(i) ? on.delete(i) : on.add(i); c.classList.toggle('on', on.has(i)); }; days.append(c); });
      box.append(R(txt, at), days, R(B('Add reminder', 'primary', async () => { if (!txt.value.trim()) return toast('Say what to remind you about', true); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at.value)) return toast('Pick a time', true); if (!on.size) return toast('Pick at least one day', true); const rules = [...st.rules, { id: nid('rm'), name: 'Reminder: ' + txt.value.trim().slice(0, 60), enabled: true, when: { type: 'time', at: at.value, days: [...on].sort() }, actions: [{ type: 'notify', text: txt.value.trim().slice(0, 120) }] }]; try { await call('storeSet', { key: 'rules', value: rules }); toast('Reminder added'); draw(); } catch (e) { toast(errText(e), true); } })));
      const mine = st.rules.filter((r) => /^Reminder: /.test(r.name)); mine.forEach((r) => { const row = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', r.name.replace(/^Reminder: /, '')), el('div', 'sub', `${r.when.at} · ${r.when.days.length === 7 ? 'every day' : r.when.days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}`)); row.append(l, B('Delete', 'danger', async () => { try { await call('storeSet', { key: 'rules', value: st.rules.filter((x) => x.id !== r.id) }); draw(); } catch (e) { toast(errText(e), true); } })); box.append(row); });
      if (!mine.length) box.append(el('div', 'muted', 'No reminders yet.'));
    }; draw();
  };

  /* 8. Sticky wall */
  CUSTOM.stickies = (box) => {
    box.style.gap = '8px'; const COLORS = ['#ffe97a', '#ff9ec7', '#9de3ff', '#b6f59a', '#d5b7ff'];
    useList('stickies', box, (L) => {
      box.replaceChildren(); box.append(R(B('+ New sticky', 'primary', async () => { if (L.items.length >= 100) return toast('The wall is full (100 notes)', true); if (await L.save([...L.items, { id: nid('n'), text: '', color: COLORS[L.items.length % COLORS.length], x: 20 + (L.items.length % 6) * 40, y: 20 + (L.items.length % 6) * 30 }])) L.redraw(); })));
      const wall = el('div', 'wall'); box.append(wall);
      L.items.forEach((n) => { const s = el('div', 'sticky'); s.style.cssText = `left:${n.x}px;top:${n.y}px;background:${n.color || COLORS[0]}`; const bar = el('div', 'sticky-bar'); bar.append(el('span', '', '⋮⋮'), B('✕', '', async () => { if (await L.save(L.items.filter((y) => y.id !== n.id))) L.redraw(); })); const t = el('textarea'); t.value = n.text; t.placeholder = 'Write...'; t.onchange = async () => { await L.save(L.items.map((y) => (y.id === n.id ? { ...y, text: t.value.slice(0, 500) } : y))); };
        let d = null; bar.onpointerdown = (e) => { if (e.target.tagName === 'BUTTON') return; bar.setPointerCapture(e.pointerId); d = { dx: e.clientX - s.offsetLeft, dy: e.clientY - s.offsetTop }; }; bar.onpointermove = (e) => { if (!d) return; s.style.left = Math.max(0, Math.min(wall.clientWidth - 150, e.clientX - d.dx)) + 'px'; s.style.top = Math.max(0, Math.min(wall.clientHeight - 60, e.clientY - d.dy)) + 'px'; }; bar.onpointerup = async () => { if (!d) return; d = null; await L.save(L.items.map((y) => (y.id === n.id ? { ...y, x: Math.round(s.offsetLeft), y: Math.round(s.offsetTop) } : y))); };
        s.append(bar, t); wall.append(s); });
    });
  };

  /* 9. Water tracker */
  CUSTOM.water = (box) => {
    box.style.gap = '8px';
    useList('water', box, (L) => {
      box.replaceChildren(); const today = todayIso(); const goalRow = L.items.find((x) => x.date === '1970-01-01'); const goal = goalRow ? goalRow.ml : 2500; const drunk = L.items.filter((x) => x.date === today).reduce((a, x) => a + x.ml, 0); const pct = Math.min(100, Math.round(drunk / goal * 100));
      box.append(el('div', 'label', `Today: ${drunk} ml of ${goal} ml (${pct}%)${pct >= 100 ? ' 🎉' : ''}`)); const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = Math.max(2, pct) + '%'; bar.append(i); box.append(bar);
      const add = (ml) => B('+' + ml + ' ml', '', async () => { if (await L.save([...L.items, { id: nid('w'), date: today, ml }])) L.redraw(); }); box.append(R(add(150), add(250), add(330), add(500), B('Undo last', '', async () => { const last = [...L.items].reverse().find((x) => x.date === today); if (!last) return; if (await L.save(L.items.filter((y) => y.id !== last.id))) L.redraw(); })));
      const g = F('Daily goal (ml)', 'number'); g.value = goal; g.style.maxWidth = '140px'; box.append(R(g, B('Set goal', '', async () => { const v = Math.round(num(g.value)); if (!(v >= 500 && v <= 10000)) return toast('Goal must be 500 to 10,000 ml', true); const rest = L.items.filter((x) => x.date !== '1970-01-01'); if (await L.save([...rest, { id: nid('w'), date: '1970-01-01', ml: v }])) L.redraw(); })));
      const days = {}; L.items.filter((x) => x.date !== '1970-01-01').forEach((x) => { days[x.date] = (days[x.date] || 0) + x.ml; }); const last7 = [...Array(7)].map((_, k) => { const d = new Date(); d.setDate(d.getDate() - 6 + k); return iso(d); }); const wk = el('div'); wk.style.cssText = 'display:flex;gap:6px;align-items:flex-end;height:80px'; last7.forEach((d) => { const h = Math.min(100, (days[d] || 0) / goal * 100); const c = el('div'); c.style.cssText = `flex:1;height:${Math.max(3, h)}%;background:var(--accent);border-radius:6px;opacity:${days[d] ? 1 : .25}`; c.title = `${d}: ${days[d] || 0} ml`; wk.append(c); }); box.append(el('div', 'sub', 'Last 7 days'), wk);
    });
  };

  /* 10. Flashcards (Leitner boxes) */
  CUSTOM.cards = (box) => {
    box.style.gap = '8px'; let deck = 'All', showBack = false, cur = null;
    useList('cards', box, (L) => {
      box.replaceChildren(); const decks = ['All', ...new Set(L.items.map((c) => c.deck))]; const ds = sel(decks.map((d) => [d, d]), deck); ds.onchange = () => { deck = ds.value; showBack = false; cur = null; L.redraw(); };
      const dn = F('Deck'), fr = F('Front (question)'), bk = F('Back (answer)'); dn.value = deck === 'All' ? 'General' : deck; box.append(R(ds, el('span', 'sub', `${L.items.length} cards`)), R(dn, fr, bk, B('Add card', 'primary', async () => { if (!dn.value.trim() || !fr.value.trim() || !bk.value.trim()) return toast('Fill in deck, front and back', true); if (await L.save([...L.items, { id: nid('c'), deck: dn.value.trim().slice(0, 40), front: fr.value.trim().slice(0, 500), back: bk.value.trim().slice(0, 500), box: 1, due: todayIso() }])) { toast('Card added'); L.redraw(); } })));
      const due = L.items.filter((c) => (deck === 'All' || c.deck === deck) && (!c.due || c.due <= todayIso())); const c = cur && due.find((x) => x.id === cur) || due[0]; cur = c ? c.id : null;
      const area = el('div', 'fcard'); box.append(el('div', 'label', `Due today: ${due.length}`), area);
      if (!c) area.append(el('div', 'muted', L.items.length ? 'All caught up for now. 🎉' : 'Add some cards to start studying.'));
      else { area.append(el('div', 'flash-q', c.front)); if (showBack) { area.append(el('div', 'flash-a', c.back)); const mk = (label, ok) => B(label, ok ? 'primary' : '', async () => { const nb = ok ? Math.min(5, c.box + 1) : 1; const gap = [0, 1, 2, 4, 8, 16][nb]; const d = new Date(); d.setDate(d.getDate() + gap); showBack = false; if (await L.save(L.items.map((y) => (y.id === c.id ? { ...y, box: nb, due: iso(d) } : y)))) L.redraw(); }); area.append(R(mk('✗ Missed it', false), mk('✓ Got it', true))); } else area.append(B('Show answer', 'primary', () => { showBack = true; L.redraw(); })); }
      if (c) box.append(B('Delete this card', 'danger', async () => { if (await L.save(L.items.filter((y) => y.id !== c.id))) { showBack = false; L.redraw(); } }));
    });
  };

  /* 11. Loan calculator */
  CUSTOM.loan = (box) => {
    box.style.gap = '8px'; const a = F('Amount', 'number'), r = F('Yearly interest %', 'number'), y = F('Years', 'number'); a.value = 100000; r.value = 5; y.value = 5; const out = el('div'); const tbl = el('div');
    const go2 = () => { out.replaceChildren(); tbl.replaceChildren(); const P = num(a.value), ap = num(r.value), yr = num(y.value); if (!(P > 0) || !(ap >= 0 && ap <= 100) || !(yr > 0 && yr <= 50)) { out.append(el('div', 'muted', 'Enter an amount, a rate from 0 to 100 and 1 to 50 years.')); return; } const n = Math.round(yr * 12), i = ap / 1200; const pay = i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n)); const total = pay * n; out.append(el('div', 'label', `Monthly payment: ${money(pay)}`), el('div', 'sub', `Total paid: ${money(total)} · Interest: ${money(total - P)} (${Math.round((total - P) / P * 100)}% of the loan)`));
      let bal = P; const rows = []; for (let k = 1; k <= n; k++) { const int = bal * i; const pr = pay - int; bal = Math.max(0, bal - pr); if (k <= 12 || k === n) rows.push([k, pay, pr, int, bal]); } tbl.append(el('div', 'sub', 'First 12 months and the last payment:')); rows.forEach((x) => tbl.append(el('div', 'list-row', `#${x[0]}   pay ${money(x[1])}   principal ${money(x[2])}   interest ${money(x[3])}   left ${money(x[4])}`))); };
    [a, r, y].forEach((x) => { x.oninput = go2; }); box.append(R(a, r, y), out, tbl); go2();
  };

  /* 12. Compound interest / savings */
  CUSTOM.compound = (box) => {
    box.style.gap = '8px'; const p = F('Starting amount', 'number'), m = F('Monthly deposit', 'number'), r = F('Yearly return %', 'number'), y = F('Years', 'number'); p.value = 10000; m.value = 500; r.value = 7; y.value = 10; const out = el('div'), tb = el('div');
    const go2 = () => { out.replaceChildren(); tb.replaceChildren(); const P = num(p.value), M = num(m.value), ap = num(r.value), yr = num(y.value); if (!(P >= 0) || !(M >= 0) || !(ap >= 0 && ap <= 100) || !(yr > 0 && yr <= 60)) { out.append(el('div', 'muted', 'Enter amounts of zero or more, a return from 0 to 100 and 1 to 60 years.')); return; } const i = ap / 1200; let bal = P, dep = P; for (let k = 1; k <= Math.round(yr * 12); k++) { bal = bal * (1 + i) + M; dep += M; if (k % 12 === 0 && k / 12 <= 30) tb.append(el('div', 'list-row', `Year ${k / 12}:   ${money(bal)}`)); } out.append(el('div', 'label', `After ${yr} years: ${money(bal)}`), el('div', 'sub', `You put in ${money(dep)}; growth added ${money(bal - dep)}.`)); };
    [p, m, r, y].forEach((x) => { x.oninput = go2; }); box.append(R(p, m), R(r, y), out, tb, el('div', 'sub', 'This is a simple projection with a steady return. Real returns go up and down.')); go2();
  };

  /* 13. Tip & split */
  CUSTOM.tip = (box) => {
    box.style.gap = '8px'; const b = F('Bill total', 'number'), t = F('Tip %', 'number'), n = F('People', 'number'); b.value = 120; t.value = 15; n.value = 4; const out = el('div'); const go2 = () => { out.replaceChildren(); const B2 = num(b.value), T = num(t.value), N = Math.round(num(n.value)); if (!(B2 > 0) || !(T >= 0 && T <= 100) || !(N >= 1 && N <= 100)) { out.append(el('div', 'muted', 'Enter a bill, a tip from 0 to 100 and 1 to 100 people.')); return; } const tip = B2 * T / 100; out.append(el('div', 'label', `Tip: ${money(tip)} · Total: ${money(B2 + tip)}`), el('div', 'label', `Each person pays: ${money((B2 + tip) / N)}`)); }; [b, t, n].forEach((x) => { x.oninput = go2; }); const chips = el('div', 'store-chips'); [0, 10, 15, 20].forEach((v) => { const c = el('button', 'chip', v + '%'); c.onclick = () => { t.value = v; go2(); }; chips.append(c); }); box.append(R(b, t, n), chips, out); go2();
  };

  /* 14. Percent & discount */
  CUSTOM.percent = (box) => {
    box.style.gap = '10px'; const rows = [['What is', 'x', '% of', 'y', (x, y) => x * y / 100], ['', 'x', 'is what % of', 'y', (x, y) => x / y * 100, '%'], ['Change from', 'x', 'to', 'y', (x, y) => (y - x) / x * 100, '%'], ['Price', 'x', 'with a discount of', 'y', (x, y) => x * (1 - y / 100)], ['Price', 'x', 'plus VAT/tax of', 'y', (x, y) => x * (1 + y / 100)]];
    rows.forEach(([a, , c, , f, suf], k) => { const x = F('number', 'number'), y = F('number', 'number'); x.style.maxWidth = '120px'; y.style.maxWidth = '120px'; x.value = [20, 50, 80, 200, 100][k]; y.value = [150, 200, 100, 25, 15][k]; const o = el('div', 'label', ''); const go2 = () => { const X = num(x.value), Y = num(y.value); if (!Number.isFinite(X) || !Number.isFinite(Y) || ((k === 1 || k === 2) && (k === 1 ? Y : X) === 0)) { o.textContent = '—'; return; } const v = f(X, Y); o.textContent = '= ' + (Number.isFinite(v) ? money(v) + (suf || '') : '—'); }; [x, y].forEach((i) => { i.oninput = go2; }); const r = el('div', 'list-row'); const l = el('div'); l.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'; l.append(el('span', 'sub', a), x, el('span', 'sub', c), y); r.append(l, o); box.append(r); go2(); });
  };

  /* 15. Health calculators */
  CUSTOM.health = (box) => {
    box.style.gap = '8px'; const w = F('Weight (kg)', 'number'), h = F('Height (cm)', 'number'), a = F('Age', 'number'), g = sel([['m', 'Male'], ['f', 'Female']]), act = sel([[1.2, 'Mostly sitting'], [1.375, 'Light exercise 1-3 days'], [1.55, 'Moderate 3-5 days'], [1.725, 'Hard 6-7 days']], 1.375); w.value = 75; h.value = 175; a.value = 30; const out = el('div');
    const go2 = () => { out.replaceChildren(); const W = num(w.value), H = num(h.value), A = num(a.value); if (!(W >= 20 && W <= 400) || !(H >= 80 && H <= 250) || !(A >= 10 && A <= 120)) { out.append(el('div', 'muted', 'Enter a weight of 20-400 kg, a height of 80-250 cm and an age of 10-120.')); return; } const bmi = W / ((H / 100) ** 2); const cat = bmi < 18.5 ? 'under the usual range' : bmi < 25 ? 'in the usual range' : bmi < 30 ? 'above the usual range' : 'well above the usual range'; const bmr = 10 * W + 6.25 * H - 5 * A + (g.value === 'm' ? 5 : -161); out.append(el('div', 'label', `BMI ${bmi.toFixed(1)} (${cat})`), el('div', 'label', `Resting energy (BMR): ${Math.round(bmr)} kcal/day`), el('div', 'label', `Typical daily need: ${Math.round(bmr * Number(act.value))} kcal`), el('div', 'label', `Water, a common guide: about ${Math.round(W * 33)} ml/day`), el('div', 'sub', 'These are general estimates (Mifflin-St Jeor), not medical advice. Talk to a doctor or dietitian about your own health.')); };
    [w, h, a, g, act].forEach((x) => { x.oninput = go2; x.onchange = go2; }); box.append(R(w, h, a), R(g, act), out); go2();
  };

  /* 16. Number bases */
  CUSTOM.bases = (box) => {
    box.style.gap = '8px'; const fields = { 2: F('Binary'), 8: F('Octal'), 10: F('Decimal'), 16: F('Hexadecimal') }; const err = el('div', 'store-err', ''); const ok = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };
    Object.entries(fields).forEach(([base, f]) => { f.oninput = () => { err.textContent = ''; const v = f.value.trim().replace(/^0[xb]/i, ''); if (!v) { Object.values(fields).forEach((x) => { if (x !== f) x.value = ''; }); return; } if (!ok[base].test(v)) { err.textContent = `Not a valid base-${base} number`; return; } if (v.length > 60) { err.textContent = 'Too long'; return; } const n = BigInt(base === '10' ? v : (base === '16' ? '0x' : base === '2' ? '0b' : '0o') + v); Object.entries(fields).forEach(([b2, x]) => { if (x !== f) x.value = n.toString(Number(b2)).toUpperCase(); }); }; box.append(R(el('span', 'sub', 'Base ' + base), f)); });
    box.append(err, el('div', 'sub', 'Type in any box and the others update. Works for very large numbers too.'));
  };

  /* 17. Roman numerals + number to words */
  CUSTOM.words = (box) => {
    box.style.gap = '8px'; const n = F('A whole number', 'number'); n.value = 2026; const out = el('div'); const rom = (x) => { const m = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (x >= v) { s += r; x -= v; } return s; };
    const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']; const words = (x) => { if (x < 20) return ones[x]; if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? '-' + ones[x % 10] : ''); if (x < 1000) return ones[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' and ' + words(x % 100) : ''); const sc = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]; for (const [v, nm] of sc) if (x >= v) return words(Math.floor(x / v)) + ' ' + nm + (x % v ? (x % v < 100 ? ' and ' : ' ') + words(x % v) : ''); return ''; };
    const ea = (s) => s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
    const go2 = () => { out.replaceChildren(); const v = Math.floor(num(n.value)); if (!Number.isFinite(v) || v < 0 || v > 999999999999999) { out.append(el('div', 'muted', 'Enter a whole number from 0 to 999 trillion.')); return; } out.append(el('div', 'label', words(v)), el('div', 'label', v >= 1 && v <= 3999 ? 'Roman: ' + rom(v) : 'Roman numerals cover 1 to 3999'), el('div', 'label', 'Eastern Arabic digits: ' + ea(String(v))), el('div', 'sub', 'With commas: ' + v.toLocaleString('en-US'))); }; n.oninput = go2; box.append(n, out); go2();
  };

  /* 18. Hijri converter */
  CUSTOM.hijri = (box) => {
    box.style.gap = '10px'; const fmt = (d, cal, loc) => new Intl.DateTimeFormat(loc, { calendar: cal, day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(d);
    const g = F('', 'date'); g.value = todayIso(); const out = el('div'); const parts = (d) => { const o = {}; new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d).forEach((p) => { o[p.type] = Number(p.value); }); return o; };
    const go2 = () => { out.replaceChildren(); if (!g.value) return; const d = new Date(g.value + 'T12:00:00'); if (isNaN(d)) return; const h = parts(d); out.append(el('div', 'label', fmt(d, 'islamic-umalqura', 'ar-SA')), el('div', 'label', fmt(d, 'islamic-umalqura', 'en')), el('div', 'sub', `Numeric: ${h.day}/${h.month}/${h.year} AH (Umm al-Qura calendar)`)); };
    g.oninput = go2; const hd = F('Day', 'number'), hm = F('Month', 'number'), hy = F('Year', 'number'); hd.style.maxWidth = '90px'; hm.style.maxWidth = '90px'; hy.style.maxWidth = '110px'; const out2 = el('div');
    const back = () => { out2.replaceChildren(); const D = Math.round(num(hd.value)), M = Math.round(num(hm.value)), Y = Math.round(num(hy.value)); if (!(D >= 1 && D <= 30 && M >= 1 && M <= 12 && Y >= 1300 && Y <= 1600)) { out2.append(el('div', 'muted', 'Enter a day (1-30), month (1-12) and year (1300-1600).')); return; }
      const approx = Date.UTC(622, 6, 19) + ((Y - 1) * 354.367 + (M - 1) * 29.53 + (D - 1)) * 86400000; let found = null;
      for (let off = -45; off <= 45 && !found; off++) { const t = new Date(approx + off * 86400000); t.setHours(12, 0, 0, 0); const p = parts(t); if (p.year === Y && p.month === M && p.day === D) found = t; }
      if (!found) { out2.append(el('div', 'muted', 'That Hijri date does not exist in the Umm al-Qura calendar.')); return; } out2.append(el('div', 'label', 'Gregorian: ' + fmt(found, 'gregory', 'en') + `  (${iso(found)})`)); };
    [hd, hm, hy].forEach((x) => { x.oninput = back; });
    box.append(el('div', 'label', 'Gregorian → Hijri'), g, out, el('div', 'label', 'Hijri → Gregorian'), R(hd, hm, hy), out2, el('div', 'sub', 'Uses the Umm al-Qura calendar built into your system. The actual start of a month can differ by a day when the moon is sighted.')); go2();
  };

  /* 19. Meeting planner (time zones) */
  CUSTOM.meeting = (box) => {
    box.style.gap = '8px'; const ZONES = [['Riyadh', 'Asia/Riyadh'], ['Dubai', 'Asia/Dubai'], ['Cairo', 'Africa/Cairo'], ['Istanbul', 'Europe/Istanbul'], ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Mumbai', 'Asia/Kolkata'], ['Singapore', 'Asia/Singapore'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney']];
    const mk = (v) => sel(ZONES.map(([n, z]) => [z, n]), v); const a = mk('Asia/Riyadh'), b = mk('Europe/London'), c = mk('America/New_York'); const d = F('', 'date'); d.value = todayIso(); const out = el('div');
    const hourIn = (zone, date, h) => { const ref = new Date(`${date}T${String(h).padStart(2, '0')}:00:00Z`); return ref; };
    const offsetMin = (zone, at) => { const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at); const o = {}; f.forEach((p) => { o[p.type] = Number(p.value); }); return (Date.UTC(o.year, o.month - 1, o.day, o.hour, o.minute) - at.getTime()) / 60000; };
    const go2 = () => { out.replaceChildren(); if (!d.value) return; const zs = [a, b, c].map((s) => s.value); const head = el('div', 'list-row'); head.append(el('div', 'sub', 'UTC hour'), ...zs.map((z) => el('div', 'sub', ZONES.find((x) => x[1] === z)[0]))); out.append(head); let good = 0;
      for (let h = 0; h < 24; h++) { const t = hourIn(null, d.value, h); const hrs = zs.map((z) => { const m = (h * 60 + offsetMin(z, t)) % 1440; return ((m + 1440) % 1440) / 60; }); const okAll = hrs.every((x) => x >= 8 && x < 20); if (okAll) good++; const r = el('div', 'list-row' + (okAll ? ' good' : '')); r.append(el('div', 'sub', String(h).padStart(2, '0') + ':00'), ...hrs.map((x) => { const e = el('div', '', `${String(Math.floor(x)).padStart(2, '0')}:00`); if (x < 8 || x >= 20) e.style.opacity = .45; return e; })); out.append(r); }
      out.prepend(el('div', 'label', good ? `${good} hour${good === 1 ? '' : 's'} work for everyone (08:00-20:00 in all three places)` : 'No hour is between 08:00 and 20:00 for all three places')); };
    [a, b, c, d].forEach((x) => { x.onchange = go2; }); box.append(R(a, b, c, d), out, el('div', 'sub', 'Green rows are comfortable for everybody. Daylight saving time is handled by your system for the date you pick.')); go2();
  };

  /* 20. Trip & fuel cost */
  CUSTOM.fuel = (box) => {
    box.style.gap = '8px'; const d = F('Distance (km)', 'number'), e = F('Car uses (litres per 100 km)', 'number'), p = F('Fuel price per litre', 'number'), n = F('People', 'number'), rt = el('input'); rt.type = 'checkbox'; const rl = el('label', 'sub'); rl.append(rt, ' Round trip'); d.value = 300; e.value = 8; p.value = 2.33; n.value = 1; const out = el('div');
    const go2 = () => { out.replaceChildren(); const D = num(d.value) * (rt.checked ? 2 : 1), E = num(e.value), P = num(p.value), N = Math.round(num(n.value)); if (!(D > 0) || !(E > 0 && E < 100) || !(P > 0) || !(N >= 1 && N <= 50)) { out.append(el('div', 'muted', 'Enter distance, consumption (0-100 L/100 km), a fuel price and 1-50 people.')); return; } const L = D * E / 100, cost = L * P; out.append(el('div', 'label', `Fuel: ${L.toFixed(1)} litres`), el('div', 'label', `Cost: ${money(cost)}${N > 1 ? ` (${money(cost / N)} each)` : ''}`), el('div', 'sub', `${money(cost / D)} per km`)); };
    [d, e, p, n].forEach((x) => { x.oninput = go2; }); rt.onchange = go2; box.append(R(d, e), R(p, n, rl), out); go2();
  };
}
