/* Aurora Apps, third batch: Journal, Habits, Ledger, Pix (image tools), Rename (bulk renamer) and Focus (pomodoro). */
{
  const B = (txt, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); if (fn) b.onclick = fn; return b; };
  const R = (...kids) => { const r = el('div', 'savebar'); r.append(...kids); return r; };
  const live = (box) => document.body.contains(box);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayIso = () => iso(new Date());
  const field = (ph, type) => { const i = el('input', 'filter'); i.placeholder = ph || ''; if (type) i.type = type; i.style.margin = '0'; return i; };
  const save = async (key, value) => { try { await call('storeSet', { key, value }); return true; } catch (e) { toast(errText(e), true); return false; } };
  const dlBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const newId = (p) => p + Math.random().toString(36).slice(2, 10);

  /* ---------- Journal ---------- */
  CUSTOM.journal = (box) => {
    box.style.gap = '8px'; let items = [], sel = todayIso(), q = '';
    const draw = () => {
      box.replaceChildren(); const date = field('', 'date'); date.value = sel; date.onchange = () => { if (date.value) { sel = date.value; draw(); } };
      const cur = items.find((x) => x.date === sel); const t = el('textarea', 'filter'); t.rows = 7; t.placeholder = 'How was your day?'; t.value = cur ? cur.text : ''; t.style.cssText = 'margin:0;resize:vertical;font:inherit;width:100%'; const cnt = el('div', 'sub', ''); const upd = () => { cnt.textContent = `${t.value.trim() ? t.value.trim().split(/\s+/).length : 0} words`; }; t.oninput = upd; upd();
      let mood = cur ? cur.mood : 0; const moods = el('div', 'store-chips'); ['😞', '🙁', '😐', '🙂', '😄'].forEach((m, k) => { const b = el('button', 'chip' + (mood === k + 1 ? ' on' : ''), m); b.onclick = () => { mood = mood === k + 1 ? 0 : k + 1; [...moods.children].forEach((c, j) => c.classList.toggle('on', mood === j + 1)); }; moods.append(b); });
      box.append(R(date, B('Today', '', () => { sel = todayIso(); draw(); })), moods, t, cnt, R(B(cur ? 'Update entry' : 'Save entry', 'primary', async () => { const text = t.value.trim(); if (!text) return toast('Write something first', true); const next = [...items.filter((x) => x.date !== sel), { id: cur ? cur.id : newId('j'), date: sel, text, mood }]; if (await save('journal', next)) { items = next; toast('Saved'); draw(); } }), cur ? B('Delete entry', 'danger', async () => { if (!confirm('Delete this entry?')) return; const next = items.filter((x) => x.date !== sel); if (await save('journal', next)) { items = next; draw(); } }) : '', B('Export all', '', () => { dlBlob(new Blob([[...items].sort((a, b) => a.date.localeCompare(b.date)).map((x) => `${x.date}\n${x.text}\n`).join('\n')], { type: 'text/plain' }), 'journal.txt'); })));
      const s = field('Search entries...'); s.value = q; s.oninput = () => { q = s.value.toLowerCase(); list(); }; const lb = el('div'); box.append(s, lb);
      const list = () => { lb.replaceChildren(); const shown = [...items].sort((a, b) => b.date.localeCompare(a.date)).filter((x) => !q || x.text.toLowerCase().includes(q)).slice(0, 60); if (!shown.length) lb.append(el('div', 'muted', items.length ? 'No entries match.' : 'No entries yet. Your first one will appear here.')); shown.forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', `${['', '😞', '🙁', '😐', '🙂', '😄'][x.mood]} ${new Date(x.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}`), el('div', 'sub', x.text.replace(/\s+/g, ' ').slice(0, 140))); r.append(l, B('Open', '', () => { sel = x.date; draw(); })); lb.append(r); }); };
      list();
    };
    call('storeGet').then((st) => { items = st.journal || []; draw(); }).catch(() => fail(box));
  };

  /* ---------- Habits ---------- */
  CUSTOM.habits = (box) => {
    box.style.gap = '8px'; let items = [];
    const streak = (h) => { const set = new Set(h.days); const d = new Date(); d.setHours(12, 0, 0, 0); if (!set.has(iso(d))) d.setDate(d.getDate() - 1); let n = 0; while (set.has(iso(d))) { n++; d.setDate(d.getDate() - 1); } return n; };
    const draw = () => {
      box.replaceChildren(); const name = field('New habit, for example Read 20 minutes'); const add = B('Add habit', 'primary', async () => { const n = name.value.trim(); if (!n) return; if (items.length >= 30) return toast('That is the limit of 30 habits', true); const next = [...items, { id: newId('h'), name: n.slice(0, 60), days: [] }]; if (await save('habits', next)) { items = next; draw(); } }); name.onkeydown = (e) => { if (e.key === 'Enter') add.click(); }; box.append(R(name, add));
      const days = [...Array(7)].map((_, k) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 6 + k); return d; });
      if (!items.length) return box.append(el('div', 'muted', 'No habits yet. Add one above, then tick the days you did it.'));
      const hd = el('div', 'list-row'); hd.append(el('div', 'sub', 'Habit')); const hr = el('div', 'sub', days.map((d) => d.toLocaleDateString([], { weekday: 'narrow' })).join('   ')); hd.append(hr); box.append(hd);
      items.forEach((h) => { const r = el('div', 'list-row'); const l = el('div'); const sk = streak(h); l.append(el('div', '', h.name), el('div', 'sub', sk ? `🔥 ${sk}-day streak · ${h.days.length} days in total` : `${h.days.length} days in total`)); const hm = el('div', 'heat'); const have = new Set(h.days); for (let k = 83; k >= 0; k--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - k); const c = el('i', have.has(iso(d)) ? 'on' : ''); c.title = d.toLocaleDateString(); hm.append(c); } l.append(hm); const c = el('div'); c.style.cssText = 'display:flex;gap:8px;align-items:center';
        days.forEach((d) => { const k = iso(d); const i = el('input'); i.type = 'checkbox'; i.checked = h.days.includes(k); i.title = d.toLocaleDateString(); i.onchange = async () => { const nd = i.checked ? [...new Set([...h.days, k])] : h.days.filter((x) => x !== k); const next = items.map((x) => (x.id === h.id ? { ...x, days: nd } : x)); if (await save('habits', next)) { items = next; draw(); } else i.checked = !i.checked; }; c.append(i); });
        c.append(B('✕', '', async () => { if (!confirm(`Delete "${h.name}" and its history?`)) return; const next = items.filter((x) => x.id !== h.id); if (await save('habits', next)) { items = next; draw(); } })); r.append(l, c); box.append(r); });
    };
    call('storeGet').then((st) => { items = st.habits || []; draw(); }).catch(() => fail(box));
  };

  /* ---------- Ledger (expense tracker) ---------- */
  const csvCell = (v) => { let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  CUSTOM.ledger = (box) => {
    box.style.gap = '8px'; let items = [], month = todayIso().slice(0, 7);
    const money = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const draw = () => {
      box.replaceChildren(); const kind = el('select', 'filter'); kind.style.width = 'auto'; [['out', 'Spent'], ['in', 'Received']].forEach(([v, l]) => kind.append(Object.assign(el('option', '', l), { value: v }))); const amt = field('Amount', 'number'); amt.step = '0.01'; amt.min = '0'; amt.style.maxWidth = '130px'; const cats = [...new Set(['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Salary', ...items.map((x) => x.cat).filter(Boolean)])]; const cat = field('Category'); cat.setAttribute('list', 'ledger-cats'); const dl = el('datalist'); dl.id = 'ledger-cats'; cats.forEach((c) => dl.append(Object.assign(el('option'), { value: c }))); const note = field('Note (optional)'); const date = field('', 'date'); date.value = todayIso();
      const addB = B('Add', 'primary', async () => { const a = Number(amt.value); if (!(a > 0) || a > 1e9) return toast('Enter an amount above zero', true); if (!date.value) return toast('Pick a date', true); const next = [...items, { id: newId('l'), date: date.value, kind: kind.value, amount: Math.round(a * 100) / 100, cat: cat.value.trim().slice(0, 30), note: note.value.trim().slice(0, 100) }]; if (items.length >= 5000) return toast('The ledger is full (5,000 entries)', true); if (await save('ledger', next)) { items = next; draw(); } }); [amt, note, cat].forEach((x) => { x.onkeydown = (e) => { if (e.key === 'Enter') addB.click(); }; });
      box.append(R(kind, amt, cat, dl, date), R(note, addB));
      const mi = field('', 'month'); mi.value = month; mi.onchange = () => { if (mi.value) { month = mi.value; draw(); } };
      const inM = items.filter((x) => x.date.startsWith(month)); const sum = (k) => inM.filter((x) => x.kind === k).reduce((a, x) => a + x.amount, 0); const spent = sum('out'), got = sum('in');
      box.append(R(mi, B('Export CSV', '', () => { const rows = [['Date', 'Type', 'Amount', 'Category', 'Note'], ...[...items].sort((a, b) => a.date.localeCompare(b.date)).map((x) => [x.date, x.kind === 'in' ? 'Received' : 'Spent', x.amount.toFixed(2), x.cat, x.note])]; dlBlob(new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }), 'ledger.csv'); })));
      box.append(el('div', 'label', `Spent ${money(spent)}   ·   Received ${money(got)}   ·   Net ${money(got - spent)}`));
      const by = {}; inM.filter((x) => x.kind === 'out').forEach((x) => { const k = x.cat || 'Uncategorised'; by[k] = (by[k] || 0) + x.amount; }); Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { const r = el('div'); r.append(el('div', 'sub', `${k}: ${money(v)} (${Math.round(v / spent * 100)}%)`)); const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = Math.max(2, v / spent * 100) + '%'; bar.append(i); r.append(bar); box.append(r); });
      if (!inM.length) box.append(el('div', 'muted', 'Nothing recorded this month.'));
      [...inM].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80).forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', `${x.kind === 'in' ? '+' : '−'}${money(x.amount)}  ${x.cat || ''}`), el('div', 'sub', `${x.date}${x.note ? ' · ' + x.note : ''}`)); r.append(l, B('Delete', 'danger', async () => { const next = items.filter((y) => y.id !== x.id); if (await save('ledger', next)) { items = next; draw(); } })); box.append(r); });
    };
    call('storeGet').then((st) => { items = st.ledger || []; draw(); }).catch(() => fail(box));
  };

  /* ---------- Pix (image resize / convert) ---------- */
  CUSTOM.pix = (box) => {
    box.style.gap = '8px'; let files = [];
    const pick = el('input'); pick.type = 'file'; pick.multiple = true; pick.accept = 'image/*'; pick.style.display = 'none';
    const mode = el('select', 'filter'); [['pct', 'Scale by percent'], ['w', 'Fit within width (px)'], ['wh', 'Fit within a box (px)']].forEach(([v, l]) => mode.append(Object.assign(el('option', '', l), { value: v }))); mode.style.width = 'auto';
    const a = field('', 'number'); a.value = 50; a.style.maxWidth = '100px'; const b2 = field('', 'number'); b2.value = 1080; b2.style.maxWidth = '100px'; b2.style.display = 'none';
    mode.onchange = () => { b2.style.display = mode.value === 'wh' ? '' : 'none'; a.value = mode.value === 'pct' ? 50 : 1920; };
    const fmt = el('select', 'filter'); fmt.style.width = 'auto'; [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']].forEach(([v, l]) => fmt.append(Object.assign(el('option', '', l), { value: v })));
    const qual = el('input'); qual.type = 'range'; qual.min = 30; qual.max = 100; qual.value = 85; const ql = el('span', 'sub', 'Quality 85');
    qual.oninput = () => { ql.textContent = 'Quality ' + qual.value; };
    const rot = el('select', 'filter'); rot.style.width = 'auto'; [[0, 'No rotation'], [90, 'Rotate 90° right'], [180, 'Rotate 180°'], [270, 'Rotate 90° left']].forEach(([v, l]) => rot.append(Object.assign(el('option', '', l), { value: v })));
    const flip = el('input'); flip.type = 'checkbox'; const fl = el('label', 'sub'); fl.append(flip, ' Flip'); const gray = el('input'); gray.type = 'checkbox'; const gl = el('label', 'sub'); gl.append(gray, ' Black & white');
    const list = el('div'); const status = el('div', 'sub', '');
    const loadImg = (f) => new Promise((ok, no) => { const u = URL.createObjectURL(f); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => { URL.revokeObjectURL(u); no(new Error(`"${f.name}" is not an image Aurora can read`)); }; i.src = u; });
    const render = async (f) => {
      const img = await loadImg(f); let w = img.width, h = img.height; const A = Number(a.value), Bv = Number(b2.value);
      if (mode.value === 'pct') { if (!(A > 0 && A <= 800)) throw new Error('Percent must be between 1 and 800'); w *= A / 100; h *= A / 100; } else if (mode.value === 'w') { if (!(A > 0)) throw new Error('Enter a width'); const k = Math.min(1, A / w); w *= k; h *= k; } else { if (!(A > 0 && Bv > 0)) throw new Error('Enter both sizes'); const k = Math.min(1, A / w, Bv / h); w *= k; h *= k; }
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (w * h > 100e6) throw new Error('The result would be too large');
      const r = Number(rot.value), swap = r === 90 || r === 270; const c = document.createElement('canvas'); c.width = swap ? h : w; c.height = swap ? w : h; const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(r * Math.PI / 180); if (flip.checked) x.scale(-1, 1); if (fmt.value === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(-c.width, -c.height, c.width * 2, c.height * 2); } if (gray.checked) x.filter = 'grayscale(1)'; x.drawImage(img, -w / 2, -h / 2, w, h);
      const dataUrl = c.toDataURL(fmt.value, Number(qual.value) / 100); if (!dataUrl.startsWith('data:' + fmt.value)) throw new Error('This format is not supported here'); const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[fmt.value];
      return { name: f.name.replace(/\.[^.]+$/, '') + (mode.value === 'pct' && Number(a.value) === 100 ? '' : '-resized') + '.' + ext, dataUrl, w: c.width, h: c.height, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) };
    };
    const drawList = () => { list.replaceChildren(); files.forEach((f, i) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', f.name), el('div', 'sub', `${(f.size / 1024).toFixed(0)} KB`)); r.append(l, B('✕', '', () => { files.splice(i, 1); drawList(); })); list.append(r); }); };
    const runAll = async () => {
      if (!files.length) return toast('Add some pictures first', true); status.textContent = 'Working...'; const out = []; try { for (let i = 0; i < files.length; i++) { status.textContent = `Converting ${i + 1} of ${files.length}...`; out.push(await render(files[i])); } } catch (e) { status.textContent = ''; return toast(errText(e), true); }
      const before = files.reduce((s, f) => s + f.size, 0), after = out.reduce((s, o) => s + o.bytes, 0); status.textContent = `${out.length} picture${out.length === 1 ? '' : 's'} ready: ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`;
      try { const r = await call('saveBatch', { files: out.map((o) => ({ name: o.name, dataUrl: o.dataUrl })) }); if (r) toast(`Saved ${r.saved} file${r.saved === 1 ? '' : 's'}`); } catch (e) { toast(errText(e), true); }
    };
    pick.onchange = () => { files = [...files, ...[...pick.files].filter((f) => f.type.startsWith('image/'))].slice(0, 200); pick.value = ''; drawList(); };
    box.append(R(B('Add pictures...', 'primary', () => pick.click()), B('Clear', '', () => { files = []; drawList(); status.textContent = ''; })), R(mode, a, b2, fmt), R(qual, ql, rot, fl, gl), list, R(B('Convert and save...', 'primary', runAll)), status, pick, el('div', 'sub', 'Originals are never changed. Results are saved as new files in the folder you choose, and nothing is overwritten.'));
  };

  /* ---------- Rename (bulk renamer) ---------- */
  CUSTOM.rename = (box) => {
    box.style.gap = '8px'; let files = [], last = null;
    const find = field('Find'), repl = field('Replace with'), pre = field('Add before name'), suf = field('Add after name (before .ext)'); const num = el('input'); num.type = 'checkbox'; const nl = el('label', 'sub'); nl.append(num, ' Number them 001, 002...'); const start = field('Start', 'number'); start.value = 1; start.style.maxWidth = '90px';
    const cas = el('select', 'filter'); cas.style.width = 'auto'; [['', 'Keep case'], ['lower', 'lowercase'], ['upper', 'UPPERCASE'], ['title', 'Title Case']].forEach(([v, l]) => cas.append(Object.assign(el('option', '', l), { value: v })));
    const ext = el('input'); ext.type = 'checkbox'; const el2 = el('label', 'sub'); el2.append(ext, ' Lowercase extensions'); const list = el('div'); const info = el('div', 'sub', '');
    const newName = (f, i) => { const dot = f.name.lastIndexOf('.'); let stem = dot > 0 ? f.name.slice(0, dot) : f.name, e = dot > 0 ? f.name.slice(dot) : ''; if (find.value) stem = stem.split(find.value).join(repl.value); stem = pre.value + stem + suf.value; if (num.checked) stem += ' ' + String((Number(start.value) || 1) + i).padStart(3, '0'); if (cas.value === 'lower') stem = stem.toLowerCase(); else if (cas.value === 'upper') stem = stem.toUpperCase(); else if (cas.value === 'title') stem = stem.toLowerCase().replace(/(^|[\s_-])\S/g, (c) => c.toUpperCase()); if (ext.checked) e = e.toLowerCase(); return stem + e; };
    const problems = () => { const names = files.map(newName); const bad = names.findIndex((n) => /[<>:"/\\|?*\u0000-\u001f]/.test(n) || /^\.{1,2}$/.test(n) || /[. ]$/.test(n) || !n); if (bad >= 0) return `"${names[bad]}" is not a valid file name`; const lower = names.map((n) => n.toLowerCase()); const d = lower.findIndex((n, i) => lower.indexOf(n) !== i); return d >= 0 ? `Two files would both be called "${names[d]}"` : ''; };
    const draw = () => { list.replaceChildren(); const pr = problems(); info.textContent = files.length ? (pr || `${files.filter((f, i) => newName(f, i) !== f.name).length} of ${files.length} files will change`) : 'Pick the files you want to rename.'; info.style.color = pr ? '#ff6b6b' : ''; files.slice(0, 200).forEach((f, i) => { const n = newName(f, i); const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', 'sub', f.name), el('div', n === f.name ? 'sub' : '', (n === f.name ? '(unchanged) ' : '→ ') + n)); r.append(l); list.append(r); }); };
    [find, repl, pre, suf, start].forEach((x) => { x.oninput = draw; }); [num, ext, cas].forEach((x) => { x.onchange = draw; });
    const undoB = B('Undo last rename', '', async () => { if (!last) return; try { await call('renameApply', { items: last.map((d) => ({ from: d.to, to: d.from.split(/[\\/]/).pop() })) }); files = files.map((f) => { const m = last.find((d) => d.to === f.path); return m ? { path: m.from, name: m.from.split(/[\\/]/).pop() } : f; }); last = null; undoB.disabled = true; toast('Names restored'); draw(); } catch (e) { toast(errText(e), true); } }); undoB.disabled = true;
    box.append(R(B('Pick files...', 'primary', async () => { try { const r = await call('renamePick'); if (r && r.length) { files = r; last = null; undoB.disabled = true; draw(); } } catch (e) { toast(errText(e), true); } }), undoB), R(find, repl), R(pre, suf), R(cas, el2, nl, start), info, list, R(B('Rename files', 'primary', async () => { const pr = problems(); if (!files.length) return toast('Pick files first', true); if (pr) return toast(pr, true); if (!confirm(`Rename ${files.length} file${files.length === 1 ? '' : 's'}? You can undo this right after.`)) return; try { const r = await call('renameApply', { items: files.map((f, i) => ({ from: f.path, to: newName(f, i) })) }); last = r.done; files = files.map((f) => { const m = r.done.find((d) => d.from === f.path); return m ? { path: m.to, name: m.name } : f; }); undoB.disabled = !last.length; toast(`Renamed ${r.done.length} file${r.done.length === 1 ? '' : 's'}`); draw(); } catch (e) { toast(errText(e), true); } })));
    draw();
  };

  /* ---------- Focus (pomodoro) ---------- */
  CUSTOM.focus = (box) => {
    box.style.gap = '10px'; const big = el('div', ''); big.style.cssText = 'font-size:44px;font-weight:600;font-variant-numeric:tabular-nums'; const phase = el('div', 'label', 'Ready'); const cnt = el('div', 'sub', 'Focus sessions finished today: 0');
    const work = field('', 'number'), rest = field('', 'number'), long = field('', 'number'); work.value = 25; rest.value = 5; long.value = 15; [work, rest, long].forEach((x) => { x.style.maxWidth = '90px'; x.min = '0.05'; x.step = 'any'; });
    let done = 0, mode = 'idle', end = 0, left = 0, tid = null;
    const cfg = () => ({ work: Number(work.value) * 60000, rest: Number(rest.value) * 60000, long: Number(long.value) * 60000 });
    const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const stop = () => { clearInterval(tid); tid = null; };
    const begin = (m, ms) => { mode = m; end = Date.now() + ms; left = ms; phase.textContent = m === 'work' ? '🎯 Focus' : m === 'rest' ? '☕ Short break' : '🌴 Long break'; stop(); tid = setInterval(tick, 200); big.textContent = fmt(ms); };
    const tick = () => { if (!live(box)) return stop(); const rem = end - Date.now(); if (rem > 0) { big.textContent = fmt(rem); return; } stop(); try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 660; o.start(); o.stop(a.currentTime + 0.4); } catch (_) {} const c = cfg();
      if (mode === 'work') { done++; cnt.textContent = 'Focus sessions finished today: ' + done; const lg = done % 4 === 0; toast(lg ? '🌴 Great work. Take a long break.' : '☕ Time for a short break'); begin(lg ? 'long' : 'rest', lg ? c.long : c.rest); } else { toast('🎯 Back to focus'); begin('work', c.work); } };
    const ok = () => { const c = cfg(); return Object.values(c).every((v) => Number.isFinite(v) && v >= 3000 && v <= 6 * 3600000); };
    box.append(phase, big, cnt, R(el('span', 'sub', 'Focus'), work, el('span', 'sub', 'Break'), rest, el('span', 'sub', 'Long break'), long, el('span', 'sub', 'minutes')),
      R(B('Start', 'primary', () => { if (!ok()) return toast('Times must be between 0.05 and 360 minutes', true); if (mode === 'idle') begin('work', cfg().work); else if (!tid) { end = Date.now() + left; tid = setInterval(tick, 200); } }), B('Pause', '', () => { if (tid) { left = end - Date.now(); stop(); } }), B('Skip', '', () => { if (mode === 'idle') return; end = Date.now(); tick(); }), B('Reset', '', () => { stop(); mode = 'idle'; done = 0; phase.textContent = 'Ready'; big.textContent = '0:00'; cnt.textContent = 'Focus sessions finished today: 0'; })));
    big.textContent = '0:00';
  };
}
