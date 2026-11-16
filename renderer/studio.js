/* Aurora Studio: theme packs, live background effects, hover spotlight and the start-up intro. Loaded after app.js. */
{
  const PACKS = {
    borealis: { name: 'Borealis', note: 'The original northern lights', accent: '#4cc2ff', fx: ['#4cc2ff', '#c77dff', '#38d9a9', '#ff6fb5'], mode: 'ribbons' },
    neon: { name: 'Neon Tokyo', note: 'Magenta and cyan after dark', accent: '#ff2bd6', fx: ['#ff2bd6', '#00e5ff', '#7c4dff', '#ff6f91'], mode: 'stars' },
    gold: { name: 'Obsidian Gold', note: 'Black glass, warm gold', accent: '#e0b341', fx: ['#e0b341', '#8a5a00', '#ffdf8a', '#5c3b00'], mode: 'embers' },
    dusk: { name: 'Desert Dusk', note: 'Sunset oranges over teal dunes', accent: '#ff8a3d', fx: ['#ff8a3d', '#ff4d6d', '#00b4a6', '#ffd166'], mode: 'ribbons' },
    emerald: { name: 'Emerald Night', note: 'Deep forest glow', accent: '#2ee59d', fx: ['#2ee59d', '#00a3a3', '#a3ff6b', '#0b7a5a'], mode: 'stars' },
    glacier: { name: 'Glacier', note: 'Ice blue, calm and clean', accent: '#7dd3fc', fx: ['#7dd3fc', '#a5b4fc', '#e0f2fe', '#67e8f9'], mode: 'ribbons' },
    sakura: { name: 'Sakura Haze', note: 'Soft pink petals drifting down', accent: '#ff8fc7', fx: ['#ff8fc7', '#ffb3d9', '#c77dff', '#ffd1e8'], mode: 'petals' },
    synthwave: { name: 'Synthwave', note: 'Retro sunset and a glowing grid', accent: '#ff3cac', fx: ['#ff3cac', '#784ba0', '#2b86c5', '#ffcc33'], mode: 'grid' },
    cyber: { name: 'Cyber Rain', note: 'Neon rain on a dark street', accent: '#00ffa6', fx: ['#00ffa6', '#00b3ff', '#ff2bd6', '#3a3a8c'], mode: 'rain' },
    frost: { name: 'Winter Night', note: 'Quiet snow, cold blue light', accent: '#bcd4ff', fx: ['#bcd4ff', '#8aa4ff', '#e8f0ff', '#6f8bd6'], mode: 'snow' },
    meadow: { name: 'Midnight Meadow', note: 'Fireflies over dark grass', accent: '#b9f15d', fx: ['#b9f15d', '#45d6a0', '#2f9e5b', '#ffe66d'], mode: 'fireflies' },
    ocean: { name: 'Deep Ocean', note: 'Cool teal currents', accent: '#22d3ee', fx: ['#22d3ee', '#0ea5e9', '#1d4ed8', '#34d399'], mode: 'ribbons' },
    graphite: { name: 'Graphite', note: 'Calm grey, no colour noise', accent: '#e5e7eb', fx: ['#e5e7eb', '#9ca3af', '#6b7280', '#d1d5db'], mode: 'off' },
    custom: { name: 'Your own', note: 'Pick four colours', accent: '#4cc2ff', fx: ['#4cc2ff', '#c77dff', '#38d9a9', '#ff6fb5'], mode: 'ribbons' }
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  const applyCustom = () => { const c = (prefs.get('studio') || {}).customColors; if (Array.isArray(c) && c.length === 4 && c.every((x) => HEX.test(x))) { PACKS.custom.fx = c.slice(); PACKS.custom.accent = c[0]; } };
  applyCustom();
  const MODES = { off: 'Off (fastest)', ribbons: 'Aurora ribbons', stars: 'Starfield', embers: 'Embers', rain: 'Neon rain', snow: 'Snow', petals: 'Petals', fireflies: 'Fireflies', grid: 'Synthwave grid' };
  const DEFAULTS = { pack: 'borealis', mode: 'auto', intensity: 60, spotlight: true, intro: true };
  const cfg = () => { const s = prefs.get('studio') || {}; return { ...DEFAULTS, ...s }; };
  const save = (patch) => prefs.set('studio', { ...cfg(), ...patch });
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hexRgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

  /* ----- canvas effects ----- */
  const cv = document.createElement('canvas'); cv.id = 'fx'; cv.setAttribute('aria-hidden', 'true'); document.body.prepend(cv); const ctx = cv.getContext('2d');
  let raf = 0, last = 0, t0 = performance.now(), parts = [], mode = 'off', cols = PACKS.borealis.fx.map(hexRgb), inten = 0.6;
  const size = () => { const s = 0.5; cv.width = Math.max(2, Math.round(innerWidth * s)); cv.height = Math.max(2, Math.round(innerHeight * s)); initParts(); }; // half-resolution: soft effects, low CPU
  function initParts() {
    parts = [];
    if (mode === 'stars') for (let i = 0; i < Math.round(110 * inten + 20); i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.3 + .3, p: Math.random() * 6.28, s: Math.random() * 1.5 + .5, c: cols[i % cols.length] });
    if (mode === 'embers') for (let i = 0; i < Math.round(60 * inten + 15); i++) parts.push(ember(true));
    if (mode === 'rain') for (let i = 0; i < Math.round(90 * inten + 20); i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, l: Math.random() * 12 + 6, v: Math.random() * 260 + 220, c: cols[i % 3] });
    if (mode === 'snow') for (let i = 0; i < Math.round(90 * inten + 20); i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.8 + .6, v: Math.random() * 18 + 10, p: Math.random() * 6.28 });
    if (mode === 'petals') for (let i = 0; i < Math.round(34 * inten + 8); i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 4 + 3, v: Math.random() * 20 + 14, p: Math.random() * 6.28, rot: Math.random() * 6.28, c: cols[i % cols.length] });
    if (mode === 'fireflies') for (let i = 0; i < Math.round(36 * inten + 8); i++) parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 1.6 + 1, p: Math.random() * 6.28, s: Math.random() * 1.5 + .6, c: cols[i % cols.length] });
  }
  const ember = (init) => ({ x: Math.random() * cv.width, y: init ? Math.random() * cv.height : cv.height + 10, r: Math.random() * 2 + .6, vy: Math.random() * 14 + 8, dx: Math.random() * 6.28, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * .6 + .3 });
  let shoot = null;
  function frame(now) {
    raf = requestAnimationFrame(frame); if (now - last < 33) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; const t = (now - t0) / 1000, W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    if (mode === 'ribbons') {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) { const c = cols[k % cols.length]; const base = H * (0.25 + k * 0.17); const g = ctx.createLinearGradient(0, base - H * .2, 0, base + H * .25); g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(.5, `rgba(${c},${0.20 * inten + 0.04})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 12) { const y = base + Math.sin(x * 0.006 + t * 0.35 + k * 1.7) * H * 0.09 + Math.sin(x * 0.013 - t * 0.22 + k) * H * 0.04; ctx.lineTo(x, y); } ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    } else if (mode === 'stars') {
      for (const p of parts) { const a = (0.35 + 0.65 * Math.abs(Math.sin(t * p.s + p.p))) * (0.4 + inten * 0.6); ctx.fillStyle = `rgba(${p.c},${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
      if (!shoot && Math.random() < 0.006 * inten) shoot = { x: Math.random() * W * .7, y: Math.random() * H * .4, l: 0 };
      if (shoot) { shoot.l += dt * 420; const x2 = shoot.x + shoot.l, y2 = shoot.y + shoot.l * .45; const g = ctx.createLinearGradient(shoot.x + shoot.l - 90, y2 - 40, x2, y2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(${cols[0]},.9)`); ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x2 - 90, y2 - 40); ctx.lineTo(x2, y2); ctx.stroke(); if (shoot.l > 420) shoot = null; }
    } else if (mode === 'embers') {
      for (let i = 0; i < parts.length; i++) { const p = parts[i]; p.y -= p.vy * dt; p.x += Math.sin(t + p.dx) * 6 * dt; if (p.y < -10) parts[i] = ember(false); const a = p.a * (0.5 + inten * 0.5) * Math.min(1, p.y / (H * .4)); ctx.fillStyle = `rgba(${p.c},${Math.max(0, a)})`; ctx.shadowColor = `rgba(${p.c},.8)`; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
      ctx.shadowBlur = 0;
    } else if (mode === 'rain') {
      ctx.lineWidth = 1; for (const p of parts) { p.y += p.v * dt; p.x -= p.v * dt * .12; if (p.y > H + 10) { p.y = -10; p.x = Math.random() * (W + 40); } ctx.strokeStyle = `rgba(${p.c},${0.25 + inten * 0.4})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.l * .12, p.y - p.l); ctx.stroke(); }
    } else if (mode === 'snow') {
      for (const p of parts) { p.y += p.v * dt; p.x += Math.sin(t * .7 + p.p) * 10 * dt; if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; } ctx.fillStyle = `rgba(235,242,255,${0.35 + inten * 0.5})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill(); }
    } else if (mode === 'petals') {
      for (const p of parts) { p.y += p.v * dt; p.x += Math.sin(t * .6 + p.p) * 22 * dt + 6 * dt; p.rot += dt * 1.4; if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; } ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `rgba(${p.c},${0.35 + inten * 0.45})`; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
    } else if (mode === 'fireflies') {
      ctx.globalCompositeOperation = 'lighter'; for (const p of parts) { p.x += Math.sin(t * .5 * p.s + p.p) * 14 * dt; p.y += Math.cos(t * .4 * p.s + p.p * 2) * 10 * dt; const a = (0.2 + 0.8 * Math.abs(Math.sin(t * p.s + p.p))) * (0.4 + inten * 0.6); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7); g.addColorStop(0, `rgba(${p.c},${a})`); g.addColorStop(1, `rgba(${p.c},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 7, 0, 6.28); ctx.fill(); } ctx.globalCompositeOperation = 'source-over';
    } else if (mode === 'grid') {
      const hz = H * .58, sunG = ctx.createLinearGradient(0, hz - H * .3, 0, hz); sunG.addColorStop(0, `rgba(${cols[3]},${0.55 * (0.4 + inten)})`); sunG.addColorStop(1, `rgba(${cols[0]},${0.45 * (0.4 + inten)})`); ctx.fillStyle = sunG; ctx.beginPath(); ctx.arc(W / 2, hz, H * .26, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = `rgba(${cols[0]},${0.25 + inten * 0.35})`; ctx.lineWidth = 1; for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 14, hz); ctx.lineTo(W / 2 + i * W * .12, H); ctx.stroke(); }
      for (let k = 0; k < 10; k++) { const u = ((k + (t * .35) % 1) / 10), y = hz + (H - hz) * u * u; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
  }
  const stop = () => { cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, cv.width, cv.height); };
  const start = () => { if (!raf && mode !== 'off' && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); }); // nothing is drawn while the window is hidden or minimised
  addEventListener('resize', () => { size(); });

  /* ----- applying settings ----- */
  function apply() {
    applyCustom();
    const c = cfg(), pk = PACKS[c.pack] || PACKS.borealis; const root = document.documentElement;
    root.dataset.pack = c.pack in PACKS ? c.pack : 'borealis';
    const f = pk.fx.map(hexRgb); root.style.setProperty('--fx1', `rgba(${f[0]},.42)`); root.style.setProperty('--fx2', `rgba(${f[1]},.30)`); root.style.setProperty('--fx3', `rgba(${f[2]},.24)`); root.style.setProperty('--fx4', `rgba(${f[3]},.18)`);
    root.dataset.spot = c.spotlight ? '1' : '0';
    cols = f; inten = Math.max(0.05, Math.min(1, c.intensity / 100)); const want = c.mode === 'auto' ? pk.mode : c.mode; mode = reduced() && c.mode === 'auto' ? 'off' : (want in MODES ? want : 'off');
    stop(); size(); start();
  }
  apply();
  window.auroraStudio = { PACKS, MODES, cfg, save: (p) => { save(p); applyCustom(); if (p.pack && !prefs.get('packAccentLock') && PACKS[p.pack]) { prefs.set('accent', PACKS[p.pack].accent); applyAccent(PACKS[p.pack].accent); } apply(); }, apply };

  /* ----- hover spotlight on cards ----- */
  document.addEventListener('pointermove', (e) => { if (document.documentElement.dataset.spot !== '1') return; const c = e.target.closest && e.target.closest('.card, .tile, .store-card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }, { passive: true });

  /* ----- intro splash ----- */
  if (cfg().intro && !reduced() && !navigator.webdriver) { // (not shown under automated tests)
    const s = document.createElement('div'); s.id = 'splash'; const logo = document.createElement('div'); logo.className = 'splash-logo'; logo.textContent = 'AURORA'; const sub = document.createElement('div'); sub.className = 'splash-sub'; sub.textContent = 'settings, reimagined'; s.append(logo, sub); document.body.append(s);
    setTimeout(() => s.classList.add('out'), 1100); setTimeout(() => s.remove(), 1700);
  }

  /* ----- Studio panel ----- */
  CUSTOM.studio = (box) => {
    box.style.gap = '14px'; const draw = () => {
      box.replaceChildren(); const c = cfg();
      const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px';
      Object.entries(PACKS).forEach(([id, p]) => { const b = el('button', 'pack' + (c.pack === id ? ' on' : '')); b.dataset.pack = id; const sw = el('div', 'pack-sw'); sw.style.background = `radial-gradient(60% 80% at 20% 20%, ${p.fx[0]}, transparent 70%), radial-gradient(60% 80% at 85% 25%, ${p.fx[1]}, transparent 70%), radial-gradient(70% 80% at 60% 100%, ${p.fx[2]}, transparent 70%), #0b0d14`; b.append(sw, el('div', 'store-name', p.name), el('div', 'sub', p.note)); b.onclick = () => { prefs.set('packAccentLock', false); window.auroraStudio.save({ pack: id }); draw(); toast(p.name + ' theme applied'); }; grid.append(b); });
      let wrap; { const cc = (prefs.get('studio') || {}).customColors || PACKS.custom.fx; wrap = el('div'); wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap'; wrap.append(el('span', 'sub', 'Your own colours:')); cc.forEach((v, i) => { const inp = el('input'); inp.type = 'color'; inp.value = v; inp.dataset.i = i; inp.onchange = () => { const arr = ((prefs.get('studio') || {}).customColors || PACKS.custom.fx).slice(); arr[i] = inp.value; prefs.set('packAccentLock', false); window.auroraStudio.save({ customColors: arr, pack: 'custom' }); draw(); }; wrap.append(inp); }); }
      const row = (label, ctl) => { const r = el('div', 'list-row'); r.append(el('div', '', label), ctl); return r; };
      const mode = el('select', 'filter'); mode.style.width = 'auto'; mode.append(Object.assign(el('option', '', 'Match the theme'), { value: 'auto' })); Object.entries(MODES).forEach(([k, v]) => mode.append(Object.assign(el('option', '', v), { value: k }))); mode.value = c.mode; mode.onchange = () => { window.auroraStudio.save({ mode: mode.value }); };
      const inten = el('input'); inten.type = 'range'; inten.min = 5; inten.max = 100; inten.value = c.intensity; inten.oninput = () => { inten.style.setProperty('--fill', inten.value + '%'); }; inten.onchange = () => window.auroraStudio.save({ intensity: Number(inten.value) }); inten.style.setProperty('--fill', inten.value + '%');
      const sw = (k, label) => { const l = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = !!c[k]; i.onchange = () => window.auroraStudio.save({ [k]: i.checked }); l.append(i, el('span', 'track'), el('span', 'thumb')); return row(label, l); };
      const keep = el('label', 'sub'); const kc = el('input'); kc.type = 'checkbox'; kc.checked = !!prefs.get('packAccentLock'); kc.onchange = () => { prefs.set('packAccentLock', kc.checked); }; keep.append(kc, ' Keep my own accent colour when I change theme');
      box.append(grid, wrap, row('Background effect', mode), row('Effect strength', inten), sw('spotlight', 'Card spotlight that follows your pointer'), sw('intro', 'Intro animation when Aurora starts'), keep, el('div', 'sub', 'Effects pause when the window is hidden, and turn off by themselves if Windows is set to reduce motion. Choose "Off" for the lightest possible Aurora.'));
    }; draw();
  };
}
