/* Vorynth "special" layer: living aurora background, theme presets, personal home hero, milestones, launch splash. */
{
  const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
  const JS = (k, d) => { try { return JSON.parse(LS.get(k, '')) ?? d; } catch (_) { return d; } };
  const THEMES = [
    { id: 'borealis', name: 'Northern lights', accent: '#4cc2ff', hues: [190, 150, 270] },
    { id: 'sunset', name: 'Sunset', accent: '#ff7a59', hues: [15, 340, 40] },
    { id: 'ocean', name: 'Ocean', accent: '#2dd4bf', hues: [175, 200, 220] },
    { id: 'rose', name: 'Rose', accent: '#f472b6', hues: [330, 300, 350] },
    { id: 'violet', name: 'Violet', accent: '#a78bfa', hues: [260, 290, 230] },
    { id: 'gold', name: 'Gold', accent: '#fbbf24', hues: [45, 30, 60] }
  ];
  const MS = [ // milestones; s = state
    { id: 'explorer10', icon: '🧭', name: 'Explorer', desc: 'Open 10 different pages', need: 10, val: (s) => s.visited.length },
    { id: 'explorer30', icon: '🗺️', name: 'Cartographer', desc: 'Open 30 different pages', need: 30, val: (s) => s.visited.length },
    { id: 'tinkerer', icon: '🛠️', name: 'Tinkerer', desc: 'Make your own command', need: 1, val: (s) => s.cmds },
    { id: 'disk', icon: '💽', name: 'Disk detective', desc: 'Open the Disk space map', need: 1, val: (s) => (s.visited.includes('diskmap') ? 1 : 0) },
    { id: 'gamer', icon: '🎮', name: 'Player one', desc: 'Open the Controllers page', need: 1, val: (s) => (s.visited.includes('controllers') ? 1 : 0) },
    { id: 'streak3', icon: '🔥', name: 'On a roll', desc: 'Use Vorynth 3 days in a row', need: 3, val: (s) => s.streak },
    { id: 'streak7', icon: '⚡', name: 'Regular', desc: 'Use Vorynth 7 days in a row', need: 7, val: (s) => s.streak },
    { id: 'night', icon: '🌙', name: 'Night owl', desc: 'Open Vorynth after 11 pm', need: 1, val: (s) => (s.night ? 1 : 0) },
    { id: 'styled', icon: '🎨', name: 'Stylist', desc: 'Pick a theme preset', need: 1, val: (s) => (s.styled ? 1 : 0) }
  ];
  // ---- pure helpers ----
  const greeting = (h) => (h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night');
  const nextStreak = (last, streak, today) => { // dates as YYYY-MM-DD
    if (last === today) return { last, streak: streak || 1 };
    const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); const y = d.toISOString().slice(0, 10);
    return { last: today, streak: last === y ? (streak || 0) + 1 : 1 };
  };
  const evaluate = (s) => MS.map((m) => { const v = Math.min(m.need, m.val(s)); return { id: m.id, icon: m.icon, name: m.name, desc: m.desc, value: v, need: m.need, done: v >= m.need }; });
  const theme = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const stateNow = () => ({ visited: JS('aurora.visited', []), streak: +LS.get('aurora.streak', 0) || 0, night: LS.get('aurora.night', '') === '1', styled: LS.get('aurora.styled', '') === '1', cmds: (JS('aurora.mycmds', []) || []).length });

  // ---- achievements tracking + toast ----
  const unlockedKey = 'aurora.unlocked';
  function checkUnlocks() { const have = JS(unlockedKey, []); const now = evaluate(stateNow()).filter((m) => m.done && !have.includes(m.id)); if (now.length) { LS.set(unlockedKey, JSON.stringify(have.concat(now.map((m) => m.id)))); try { toast('🏆 Milestone unlocked: ' + now.map((m) => m.name).join(', ')); if (window.__confetti) window.__confetti(); } catch (_) {} } return now; }
  function track(pageId) { const v = JS('aurora.visited', []); if (pageId && !v.includes(pageId)) { v.push(pageId); LS.set('aurora.visited', JSON.stringify(v)); } if (new Date().getHours() >= 23 || new Date().getHours() < 4) LS.set('aurora.night', '1'); checkUnlocks(); }
  { const t = dayKey(new Date()); const r = nextStreak(LS.get('aurora.lastday', ''), +LS.get('aurora.streak', 0), t); LS.set('aurora.lastday', r.last); LS.set('aurora.streak', String(r.streak)); }

  // ---- theme ----
  const css = document.createElement('style'); css.id = 'special-css';
  css.textContent = '#aur-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;mix-blend-mode:screen;opacity:.55}[data-theme=light] #aur-fx{mix-blend-mode:multiply;opacity:.18}.titlebar .app-name{background:linear-gradient(90deg,var(--accent),#9be7a3,#b79cff);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:700;letter-spacing:.3px}.card{transition:box-shadow .25s,transform .25s}.card:hover{box-shadow:0 0 0 1px var(--accent),0 8px 28px -12px var(--accent)}#aur-hero{position:relative;overflow:hidden;border-radius:16px;padding:20px 22px;margin:0 0 16px;border:1px solid var(--border);background:linear-gradient(120deg,color-mix(in srgb,var(--accent) 28%,transparent),color-mix(in srgb,#9be7a3 14%,transparent) 60%,color-mix(in srgb,#b79cff 20%,transparent))}#aur-hero h2{margin:0 0 4px;font-size:24px}#aur-hero .sub2{opacity:.8;font-size:13px}#aur-hero .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#aur-hero .chip{padding:5px 11px;border-radius:999px;background:var(--surface);border:1px solid var(--border);font-size:12px}#aur-hero .nm{cursor:pointer;border-bottom:1px dashed var(--accent)}#aur-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none;background:radial-gradient(ellipse at 30% 20%,#0b3b57,#07121f 70%);color:#fff;font:700 38px var(--font);letter-spacing:6px;animation:aursp 1.3s ease forwards}#aur-splash span{background:linear-gradient(90deg,#4cc2ff,#9be7a3,#b79cff);-webkit-background-clip:text;background-clip:text;color:transparent}@keyframes aursp{0%{opacity:1}70%{opacity:1}100%{opacity:0;visibility:hidden}}.tcard{padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:flex;gap:10px;align-items:center}.tcard.on{outline:2px solid var(--accent)}.tdot{width:26px;height:26px;border-radius:50%}.mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.mcard{padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);display:grid;gap:6px}.mcard.done{border-color:var(--accent)}.mbar{height:6px;border-radius:3px;background:var(--track);overflow:hidden}.mbar i{display:block;height:100%;background:var(--accent)}.mcard:not(.done) .micon{filter:grayscale(1);opacity:.55}@media (prefers-reduced-motion:reduce){#aur-splash{display:none}}';
  document.head.append(css);
  function applyTheme(id, persist) { const t = theme(id); if (typeof applyAccent === 'function') applyAccent(t.accent); try { prefs.set('accent', t.accent); } catch (_) {} LS.set('aurora.themeid', t.id); if (persist) { LS.set('aurora.styled', '1'); checkUnlocks(); } fx.hues = t.hues; return t; }
  // ---- living background ----
  const fx = { on: LS.get('aurora.fx', '1') !== '0' && !matchMedia('(prefers-reduced-motion: reduce)').matches, hues: theme(LS.get('aurora.themeid', 'borealis')).hues, raf: 0, t: 0 };
  let cv = null, ctx = null;
  function frame() { if (!fx.on || document.hidden) { fx.raf = 0; return; } const w = cv.width = cv.clientWidth >> 1, h = cv.height = cv.clientHeight >> 1; ctx.clearRect(0, 0, w, h); fx.t += 0.004; for (let i = 0; i < 3; i++) { const g = ctx.createLinearGradient(0, 0, 0, h * 0.8); const hue = fx.hues[i]; g.addColorStop(0, 'hsla(' + hue + ',90%,60%,0)'); g.addColorStop(0.5, 'hsla(' + hue + ',90%,60%,.45)'); g.addColorStop(1, 'hsla(' + hue + ',90%,60%,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, h * 0.5); for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * (0.32 + i * 0.09) + Math.sin(x / (110 + i * 40) + fx.t * (1 + i * 0.4) + i * 2) * h * 0.09); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill(); } fx.raf = requestAnimationFrame(frame); }
  function setFx(on) { fx.on = on; LS.set('aurora.fx', on ? '1' : '0'); if (on) { if (!cv) { cv = document.createElement('canvas'); cv.id = 'aur-fx'; ctx = cv.getContext('2d'); document.body.prepend(cv); } cv.style.display = ''; if (!fx.raf) fx.raf = requestAnimationFrame(frame); } else if (cv) cv.style.display = 'none'; }
  document.addEventListener('visibilitychange', () => { if (fx.on && !document.hidden && !fx.raf) fx.raf = requestAnimationFrame(frame); });
  applyTheme(LS.get('aurora.themeid', 'borealis'), false); if (LS.get('aurora.themeid', '')) { /* keep user's saved accent */ }
  setFx(fx.on);
  // ---- splash ----
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { const sp = document.createElement('div'); sp.id = 'aur-splash'; sp.innerHTML = '<span>AURORA</span>'; document.body.append(sp); setTimeout(() => sp.remove(), 1500); }
  // ---- home hero ----
  let current = 'home';
  const todayCounts = () => { const rep = []; const todo = JS('aurora.todo.list', []); return { ready: (rep || []).filter((t) => t.status === 'ready').length, todos: (todo || []).filter((t) => !t.done).length }; };
  function heroNode() {
    const d = new Date(); const box = document.createElement('div'); box.id = 'aur-hero'; const nm = LS.get('aurora.name', ''); const h2 = document.createElement('h2'); h2.append(greeting(d.getHours()) + ', '); const n = document.createElement('span'); n.className = 'nm'; n.id = 'aur-name'; n.textContent = nm || 'friend'; n.title = 'Click to set your name'; n.onclick = async () => { const v = await askText('What should Vorynth call you?', { placeholder: 'Your name' }); if (v != null && String(v).trim()) { LS.set('aurora.name', String(v).trim().slice(0, 30)); n.textContent = String(v).trim().slice(0, 30); } }; h2.append(n);
    const sub = document.createElement('div'); sub.className = 'sub2'; sub.textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }); const ch = document.createElement('div'); ch.className = 'chips'; const c = todayCounts(); const st = stateNow();
    [['🔥 ' + st.streak + '-day streak'], ['🔧 ' + c.ready + ' repairs ready'], ['✅ ' + c.todos + ' open to-dos'], ['🏆 ' + evaluate(st).filter((m) => m.done).length + '/' + MS.length + ' milestones']].forEach((x, i) => { const e = document.createElement('span'); e.className = 'chip'; e.textContent = x[0]; if (i === 3) { e.style.cursor = 'pointer'; e.onclick = () => go('milestones'); } ch.append(e); });
    box.append(h2, sub, ch); return box;
  }
  const page = document.getElementById('page'); let busy = false;
  const ensureHero = () => { if (busy || current !== 'home' || !page || document.getElementById('aur-hero')) return; busy = true; page.prepend(heroNode()); busy = false; };
  if (page) new MutationObserver(ensureHero).observe(page, { childList: true });
  const prevGo = window.auroraAfterGo; window.auroraAfterGo = (id) => { if (prevGo) prevGo(id); current = id; track(id); setTimeout(ensureHero, 30); };
  setTimeout(() => { track('home'); ensureHero(); }, 400);

  // ---- pages ----
  CUSTOM.looks = (box) => {
    box.style.gap = '14px'; const card = el('div', 'card'); card.style.cssText = 'padding:14px;display:grid;gap:12px'; card.append(el('div', 'label', 'Themes'));
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px'; const cur = LS.get('aurora.themeid', 'borealis');
    THEMES.forEach((t) => { const c = el('div', 'tcard' + (t.id === cur ? ' on' : '')); c.dataset.theme = t.id; const dot = el('div', 'tdot'); dot.style.background = 'linear-gradient(135deg,' + t.accent + ',hsl(' + t.hues[1] + ',80%,60%))'; c.append(dot, el('div', null, t.name)); c.onclick = () => { applyTheme(t.id, true); grid.querySelectorAll('.tcard').forEach((x) => x.classList.toggle('on', x === c)); }; grid.append(c); });
    const row = el('label'); row.style.cssText = 'display:flex;gap:8px;align-items:center'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'fx-toggle'; cb.checked = fx.on; cb.onchange = () => setFx(cb.checked); row.append(cb, el('span', null, 'Living aurora background (animated)'));
    const nmRow = el('div', 'sub', 'Your name on the Home page: click it in the greeting to change it.'); card.append(grid, row, nmRow); box.append(card);
  };
  CUSTOM.milestones = (box) => {
    box.style.gap = '14px'; const list = evaluate(stateNow()); const card = el('div', 'card'); card.style.cssText = 'padding:14px;display:grid;gap:10px'; card.append(el('div', 'label', list.filter((m) => m.done).length + ' of ' + list.length + ' unlocked'));
    const g = el('div', 'mgrid'); g.id = 'ms-grid'; list.forEach((m) => { const c = el('div', 'mcard' + (m.done ? ' done' : '')); c.dataset.ms = m.id; const t = el('div'); t.style.cssText = 'display:flex;gap:8px;align-items:center'; t.append(el('span', 'micon', m.icon), el('b', null, m.name)); const bar = el('div', 'mbar'); const i = el('i'); i.style.width = (m.value / m.need * 100) + '%'; bar.append(i); c.append(t, el('div', 'sub', m.desc), bar, el('div', 'sub', m.done ? 'Unlocked' : m.value + ' / ' + m.need)); g.append(c); }); card.append(g); box.append(card);
  };
  // ---- commands: theme <name>, aurora bg on/off ----
  { const prev = window.auroraCommands; window.auroraCommands = (qs) => { const out = prev ? prev(qs) : []; const q = qs.trim().toLowerCase(); let m;
      if ((m = /^theme\s+(\w+)$/.exec(q))) { const t = THEMES.find((x) => x.id === m[1] || x.name.toLowerCase().startsWith(m[1])); if (t) out.unshift({ act: true, icon: '🎨', label: 'Theme: ' + t.name, hint: 'Vorynth looks', run: async () => { applyTheme(t.id, true); return t.name; } }); }
      if ((m = /^aurora\s+bg\s+(on|off)$/.exec(q))) out.unshift({ act: true, icon: '🌌', label: 'Vorynth background ' + m[1], hint: 'Vorynth looks', run: async () => { setFx(m[1] === 'on'); return 'Background ' + m[1]; } });
      return out; }; }
  window.__special = { greeting, nextStreak, evaluate, theme, THEMES, MS, stateNow, setFx, applyTheme };
}
