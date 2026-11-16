'use strict';
const $ = (id) => document.getElementById(id);
const q = $('q'), list = $('list'), msg = $('msg');
let items = [], sel = 0, seq = 0, tm = null, pendingConfirm = null, icons = {};
const call = (n, a) => window.api.launcher(n, a || {});
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function flash(t) { msg.textContent = t || ''; if (t) setTimeout(() => { if (msg.textContent === t) msg.textContent = ''; }, 2500); }
function resize() { call('resize', { h: document.getElementById('box').offsetHeight + 14 }); }
function render() {
  let g = '', html = '';
  items.forEach((it, i) => {
    if (it.group !== g) { g = it.group; html += `<div class="g">${esc(g)}</div>`; }
    const ic = it.swatch ? `<span class="sw" style="background:${esc(it.swatch)}"></span>` : (icons[it.id] ? `<img src="${icons[it.id]}">` : esc(it.icon || '▫️'));
    html += `<div class="r${i === sel ? ' sel' : ''}${it.big ? ' big' : ''}" data-i="${i}"><span class="ic">${ic}</span><span class="t"><b>${esc(it.title)}</b><i>${esc(it.sub || '')}</i></span></div>`;
  });
  list.innerHTML = html;
  const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  setTimeout(resize, 0);
  items.forEach((it) => { if (it.kind === 'app' && it.app && it.app.file && !(it.id in icons) && navigator.platform.startsWith('Win')) { icons[it.id] = null; call('icon', { file: it.app.file }).then((d) => { if (d) { icons[it.id] = d; render(); } }); } });
}
async function search() {
  const my = ++seq; const text = q.value;
  const res = await call('query', { q: text }); if (my !== seq) return;
  items = res; sel = 0; render();
  const cur = items.find((i) => i.kind === 'currency');
  if (cur) call('currency', { cur: cur.cur }).then((r) => { if (my !== seq) return; const k = items.find((i) => i.id === 'ans:cur'); if (k) { if (r.ok) { k.title = r.text; k.sub = r.sub + '. Enter copies'; k.kind = 'copy'; k.copy = r.copy; } else k.sub = r.text; render(); } });
  const dy = items.find((i) => i.id === 'dyn:hint');
  if (dy) { const rest = text.trim().split(/\s+/).slice(1).join(' ').replace(/^pass(word)?s?\s*/i, ''); call('dyn', { kind: dy.dyn, q: rest }).then((r) => { if (my !== seq) return; items = items.filter((i) => i.id !== 'dyn:hint').concat(r); items.sort((a, b) => (b.score || 0) - (a.score || 0)); sel = 0; render(); }); }
  if (text.trim().length >= 3 && !/^(ai|ask|\?)\s/i.test(text)) call('files', { q: text }).then((f) => { if (my !== seq || !f.length) return; items = items.concat(f).slice(0, 18); render(); });
}
async function act(alt) {
  const it = items[sel]; if (!it) return;
  if (it.kind === 'noop' || it.kind === 'currency') return;
  if (it.confirm && !alt && pendingConfirm !== it.id) { pendingConfirm = it.id; flash('Press Enter again to confirm: ' + it.title); return; }
  pendingConfirm = null;
  if (it.kind === 'ai') { const box = document.createElement('div'); box.id = 'ai'; box.textContent = 'Thinking...'; list.innerHTML = ''; list.appendChild(box); setTimeout(resize, 0); const r = await call('ai', { prompt: it.prompt }); box.textContent = (r.model ? '[' + r.model + ']\n' : '') + r.text; setTimeout(resize, 0); return; }
  const r = await call('run', { item: it, alt: !!alt });
  if (r && r.msg) flash(r.msg);
  if (r && (r.stay || r.refresh)) { if (r.refresh || r.stay) search(); }
}
q.addEventListener('input', () => { pendingConfirm = null; clearTimeout(tm); tm = setTimeout(search, 60); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { call('hide'); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { sel = (sel + 1) % items.length; render(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel - 1 + items.length) % items.length; render(); } }
  else if (e.key === 'Enter') { e.preventDefault(); act(e.ctrlKey || e.metaKey || e.shiftKey); }
  else if (e.key === 'Tab') { e.preventDefault(); const it = items[sel]; if (it && it.kind === 'app') { q.value = it.title + ' '; search(); } }
  else if (e.ctrlKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); sel = Math.min(items.length - 1, Number(e.key) - 1); act(false); }
});
list.addEventListener('click', (e) => { const r = e.target.closest('.r'); if (r) { sel = Number(r.dataset.i); act(false); } });
window.api.onLauncher((ev) => { if (ev === 'show') { q.value = ''; pendingConfirm = null; q.focus(); search(); } else if (ev === 'hide') { q.value = ''; } });
search();
