/* Controller support: PS5 DualSense/DualShock, Xbox, Switch Pro, 8BitDo and generic pads. Live test page + gamepad navigation of this app. */
{
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const NAVK = 'aurora.pad.nav', DZK = 'aurora.pad.dz';
  if (!document.getElementById('padcss')) { const st = document.createElement('style'); st.id = 'padcss'; st.textContent = '.padrow{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid rgba(128,128,128,.2)}.padbtn{padding:6px 12px;border-radius:8px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;cursor:pointer}.padchips{display:flex;flex-wrap:wrap;gap:6px}.padchip{padding:3px 9px;border-radius:99px;background:rgba(128,128,128,.25);font-size:12px}.padchip.on{background:linear-gradient(135deg,#4aa3ff,#7c5cff);color:#fff}.padstick{width:70px;height:70px;border-radius:50%;border:2px solid rgba(128,128,128,.5);position:relative;display:inline-block}.padstick i{position:absolute;width:16px;height:16px;border-radius:50%;background:#4aa3ff;left:27px;top:27px}.padfocus{outline:3px solid #4aa3ff!important;outline-offset:2px}'; document.head.append(st); }

  // ---- pure logic ----
  const identify = (id) => {
    const s = String(id || '').toLowerCase(); const v = (s.match(/vendor:\s*([0-9a-f]{4})/) || s.match(/^([0-9a-f]{4})-/) || [])[1];
    if (/dualsense|0ce6|0df2/.test(s)) return { brand: 'ps', name: /edge|0df2/.test(s) ? 'PS5 DualSense Edge' : 'PS5 DualSense' };
    if (/dualshock|054c|sony|wireless controller/.test(s) || v === '054c') return { brand: 'ps', name: /09cc|05c4/.test(s) ? 'PS4 DualShock 4' : 'PlayStation controller' };
    if (/xbox|xinput|045e|microsoft/.test(s) || v === '045e') return { brand: 'xbox', name: 'Xbox controller' };
    if (/switch|pro controller|057e|nintendo/.test(s) || v === '057e') return { brand: 'switch', name: 'Nintendo Switch Pro' };
    if (/8bitdo|2dc8/.test(s)) return { brand: 'xbox', name: '8BitDo controller' };
    if (/stadia|18d1/.test(s)) return { brand: 'xbox', name: 'Stadia controller' };
    return { brand: 'generic', name: 'Generic gamepad' };
  };
  const LABELS = {
    ps: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'PS', 'Touchpad'],
    xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'],
    switch: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus', 'Plus', 'LS', 'RS', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home', 'Capture'],
    generic: [],
  };
  const buttonLabel = (brand, i) => (LABELS[brand] && LABELS[brand][i]) || 'Button ' + i;
  const deadzone = (v, dz) => { const a = Math.abs(v); const d = Math.min(Math.max(+dz || 0, 0), 0.9); return a < d ? 0 : Math.sign(v) * (a - d) / (1 - d); };
  // nearest focusable element in a direction (rects: [{x,y,w,h}])
  const nextFocus = (rects, cur, dir) => {
    if (!rects.length) return -1; if (cur < 0 || cur >= rects.length) return 0;
    const c = rects[cur], cx = c.x + c.w / 2, cy = c.y + c.h / 2; let best = -1, bs = Infinity;
    rects.forEach((r, i) => { if (i === cur) return; const x = r.x + r.w / 2, y = r.y + r.h / 2, dx = x - cx, dy = y - cy;
      const fwd = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx; if (fwd <= 1) return;
      const side = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy); const sc = fwd + side * 2; if (sc < bs) { bs = sc; best = i; } });
    return best < 0 ? cur : best;
  };
  const edges = (prev, now) => now.map((p, i) => p && !prev[i]);

  // ---- gamepad navigation of the app ----
  const focusables = () => Array.from(document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((e) => !e.disabled && e.offsetParent !== null);
  const move = (dir) => { const l = focusables(); const cur = l.indexOf(document.activeElement); const rects = l.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); const n = nextFocus(rects, cur, dir); if (n >= 0 && l[n]) { l[n].focus(); l[n].scrollIntoView({ block: 'nearest' }); } };
  const act = (a) => { if (a === 'A') { const e = document.activeElement; if (e && e !== document.body) e.click(); } else if (a === 'B') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); };
  const pageStep = (list, cur, d) => (list.length ? (cur + d + list.length) % list.length : -1);
  const page = (d) => { const l = Array.from(document.querySelectorAll('.nav-item')); const cur = l.findIndex((x) => x.classList.contains('active')); const n = pageStep(l, cur < 0 ? 0 : cur, d); if (n >= 0) l[n].click(); };
  const goHome = () => { const h = document.querySelector('.nav-item[data-page="home"]') || document.querySelector('.nav-item'); if (h) h.click(); };
  const hint = (on) => { let b = document.getElementById('padhint'); if (!on) { if (b) b.remove(); return; } if (b) return; b = mk('div', null, 'A Select · B Back · L1/R1 Pages · Create Home'); b.id = 'padhint'; b.style.cssText = 'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:99px;background:rgba(20,20,30,.85);color:#fff;font-size:12px;z-index:99999;pointer-events:none'; document.body.append(b); };
  const driftLevel = (samples) => { const m = Math.max(0, ...samples.map((a) => Math.abs(a))); return { max: Math.round(m * 1000) / 1000, status: m < 0.05 ? 'OK' : m < 0.15 ? 'Minor drift' : 'Drift: needs calibration or repair' }; };
  let prevB = [], prevDir = {}, started = false;
  const navTick = () => {
    const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(Boolean);
    if (pads.length && ld(NAVK, true)) { const g = pads[0]; const now = g.buttons.map((b) => b.pressed || b.value > 0.5); const e = edges(prevB, now); prevB = now;
      const ax = deadzone(g.axes[0] || 0, 0.5), ay = deadzone(g.axes[1] || 0, 0.5);
      const dirs = { up: e[12] || ay < 0, down: e[13] || ay > 0, left: e[14] || ax < 0, right: e[15] || ax > 0 };
      Object.keys(dirs).forEach((d) => { const isEdge = (d === 'up' && e[12]) || (d === 'down' && e[13]) || (d === 'left' && e[14]) || (d === 'right' && e[15]); const held = dirs[d] && !isEdge; const t = Date.now();
        if (isEdge || (dirs[d] && (!prevDir[d] || t - prevDir[d] > 220))) { if (!isEdge && held && prevDir[d] && t - prevDir[d] < 220) return; prevDir[d] = t; move(d); } else if (!dirs[d]) prevDir[d] = 0; });
      if (e[0]) act('A'); if (e[1]) act('B'); if (e[4]) page(-1); if (e[5]) page(1); if (e[8]) goHome(); hint(true); } else hint(false);
    requestAnimationFrame(navTick);
  };
  const start = () => { if (started) return; started = true; requestAnimationFrame(navTick); };
  window.addEventListener('gamepadconnected', start); if (navigator.getGamepads && Array.from(navigator.getGamepads()).some(Boolean)) start();

  // ---- UI ----
  CUSTOM.controllers = (box) => {
    box.style.gap = '14px'; const card = mk('div', 'card'); card.style.cssText = 'padding:14px;display:grid;gap:10px';
    const head = mk('div', 'label', 'Connected controllers'); const list = mk('div'); list.id = 'pad-list';
    const nav = document.createElement('input'); nav.type = 'checkbox'; nav.id = 'pad-nav'; nav.checked = ld(NAVK, true); nav.onchange = () => sv(NAVK, nav.checked);
    const lab = mk('label'); lab.style.cssText = 'display:flex;gap:8px;align-items:center'; lab.append(nav, mk('span', null, 'Navigate Vorynth with the controller (D-pad / left stick, A = select, B = back)'));
    const dz = document.createElement('input'); dz.type = 'range'; dz.id = 'pad-dz'; dz.min = 0; dz.max = 40; dz.value = Math.round(ld(DZK, 0.1) * 100); const dzl = mk('span', null, 'Stick deadzone ' + dz.value + '%'); dz.oninput = () => { sv(DZK, dz.value / 100); dzl.textContent = 'Stick deadzone ' + dz.value + '%'; };
    const dr = mk('button', 'padbtn', 'Test stick drift (leave sticks untouched)'); dr.id = 'pad-drift'; const drOut = mk('div', 'sub'); drOut.id = 'pad-drift-out'; dr.onclick = () => { const smp = []; const t0 = Date.now(); drOut.textContent = 'Measuring...'; const tk = () => { const p = (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean)[0] : null); if (p) p.axes.slice(0, 4).forEach((a) => smp.push(a)); if (Date.now() - t0 < 1000) requestAnimationFrame(tk); else { const r = driftLevel(smp); drOut.textContent = p ? 'Max idle offset ' + r.max + ' → ' + r.status : 'No controller'; } }; tk(); };
    card.append(head, list, lab, dzl, dz, dr, drOut, mk('div', 'sub', 'Works with PS5 DualSense / DualShock 4, Xbox, Switch Pro, 8BitDo and most USB/Bluetooth pads. Press any button once so the system reports the pad.')); box.append(card);
    const draw = () => { const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(Boolean); const sig = pads.map((g) => g.index + g.id).join('|');
      if (list.dataset.sig !== sig) { list.dataset.sig = sig; list.textContent = ''; if (!pads.length) list.append(mk('div', 'sub', 'No controller detected. Connect one and press any button.'));
        pads.forEach((g) => { const id = identify(g.id), c = mk('div'); c.style.cssText = 'display:grid;gap:6px;padding:8px 0'; c.dataset.idx = g.index; const t = mk('div', 'padrow'); t.append(mk('b', null, id.name), mk('span', null, g.buttons.length + ' buttons · ' + g.axes.length + ' axes · ' + (g.mapping || 'non-standard')));
          const chips = mk('div', 'padchips'); g.buttons.forEach((b, i) => { const ch = mk('span', 'padchip', buttonLabel(id.brand, i)); ch.dataset.b = i; chips.append(ch); });
          const sticks = mk('div'); sticks.style.cssText = 'display:flex;gap:16px'; [0, 2].forEach((a) => { const s = mk('span', 'padstick'); s.dataset.a = a; s.append(document.createElement('i')); sticks.append(s); });
          const vib = mk('button', 'padbtn', 'Vibrate test'); vib.className += ' pad-vib'; vib.onclick = () => { const p = navigator.getGamepads()[g.index]; const a = p && (p.vibrationActuator || (p.hapticActuators && p.hapticActuators[0])); if (a && a.playEffect) a.playEffect('dual-rumble', { duration: 400, strongMagnitude: 0.8, weakMagnitude: 0.5 }).catch(() => {}); else if (a && a.pulse) a.pulse(0.8, 400); else vib.textContent = 'No rumble support'; };
          c.append(t, chips, sticks, vib); list.append(c); }); }
      pads.forEach((g) => { const c = list.querySelector('[data-idx="' + g.index + '"]'); if (!c) return; c.querySelectorAll('.padchip').forEach((ch) => { const b = g.buttons[+ch.dataset.b]; ch.classList.toggle('on', !!b && (b.pressed || b.value > 0.5)); });
        c.querySelectorAll('.padstick').forEach((s) => { const a = +s.dataset.a, dzv = dz.value / 100, x = deadzone(g.axes[a] || 0, dzv), y = deadzone(g.axes[a + 1] || 0, dzv), i = s.firstChild; i.style.left = 27 + x * 26 + 'px'; i.style.top = 27 + y * 26 + 'px'; }); });
      if (document.body.contains(box)) requestAnimationFrame(draw); };
    window.addEventListener('gamepadconnected', () => {}); requestAnimationFrame(draw);
  };

  window.__pad = { pageStep, driftLevel, identify, buttonLabel, deadzone, nextFocus, edges };
}
