/* Daily life tools: prayer times and Hijri date, zakat, world clock, colour picker, exchange rates. Everything runs on this PC, nothing is sent anywhere. */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const card = (title, note) => { const c = el('div', 'card'); c.style.cssText = 'display:grid;gap:8px'; c.append(el('b', '', title)); if (note) c.append(el('div', 'muted', note)); return c; };
  const inp = (ph, val, type) => { const i = el('input', 'filter'); i.placeholder = ph; if (val != null) i.value = val; if (type) i.type = type; i.style.margin = '0'; return i; };
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem('aurora.life.' + k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem('aurora.life.' + k, JSON.stringify(v)); } catch (e) { /* storage can be unavailable */ } };
  const copy = async (t) => { try { await navigator.clipboard.writeText(String(t)); toast('Copied'); } catch (e) { toast('Could not copy', true); } };
  const row = (...n) => { const r = el('div'); r.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; r.append(...n); return r; };

  /* ---------- prayer times (Umm al-Qura: Fajr 18.5 degrees, Isha 90 minutes after Maghrib) ---------- */
  const CITIES = { 'Riyadh': [24.7136, 46.6753, 3], 'Makkah': [21.3891, 39.8579, 3], 'Madinah': [24.4686, 39.6142, 3], 'Jeddah': [21.4858, 39.1925, 3], 'Dammam': [26.4207, 50.0888, 3], 'Abha': [18.2164, 42.5053, 3], 'Tabuk': [28.3835, 36.5662, 3], 'Dubai': [25.2048, 55.2708, 4], 'Sharjah': [25.3463, 55.4209, 4] };
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI, sin = (d) => Math.sin(rad(d)), cos = (d) => Math.cos(rad(d)), tan = (d) => Math.tan(rad(d));
  const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };
  const julian = (y, m, d) => { if (m <= 2) { y -= 1; m += 12; } const A = Math.floor(y / 100), Bq = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + Bq - 1524.5; };
  const sunPos = (jd) => { const D = jd - 2451545, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360), L = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D; const RA = fix(deg(Math.atan2(cos(e) * sin(L), cos(L))) / 15, 24); return { decl: deg(Math.asin(sin(e) * sin(L))), eqt: q / 15 - RA }; };
  function prayerTimes(date, lat, lng, tz, ramadan) {
    const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / 360;
    const mid = (t) => fix(12 - sunPos(jd + t).eqt, 24);
    const angleTime = (a, t, ccw) => { const d = sunPos(jd + t).decl; const v = (-sin(a) - sin(d) * sin(lat)) / (cos(d) * cos(lat)); if (v < -1 || v > 1) return NaN; const h = deg(Math.acos(v)) / 15; return mid(t) + (ccw ? -h : h); };
    const asrTime = (t) => { const d = sunPos(jd + t).decl; const a = -deg(Math.atan(1 / (1 + tan(Math.abs(lat - d))))); return angleTime(a, t, false); };
    let T = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 };
    for (let i = 0; i < 2; i++) { const p = {}; for (const k of Object.keys(T)) p[k] = T[k] / 24; T = { fajr: angleTime(18.5, p.fajr, true), sunrise: angleTime(0.833, p.sunrise, true), dhuhr: mid(p.dhuhr), asr: asrTime(p.asr), maghrib: angleTime(0.833, p.maghrib, false) }; }
    T.isha = T.maghrib + (ramadan ? 120 : 90) / 60;
    const adj = tz - lng / 15; const out = {};
    for (const k of Object.keys(T)) out[k] = T[k] + adj + (k === 'dhuhr' ? 1 / 60 : 0);
    return out;
  }
  const hm = (h) => { if (!Number.isFinite(h)) return '--:--'; h = fix(h + 0.5 / 60, 24); const H = Math.floor(h), M = Math.floor((h - H) * 60); return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0'); };
  const ampm = (s) => { if (s === '--:--') return s; const [H, M] = s.split(':').map(Number); return ((H % 12) || 12) + ':' + String(M).padStart(2, '0') + (H < 12 ? ' AM' : ' PM'); };
  const hijri = (d, lang) => { try { return new Intl.DateTimeFormat(lang + '-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) { return ''; } };
  const isRamadan = (d) => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(d) === '9'; } catch (e) { return false; } };
  const NAMES = [['fajr', 'Fajr', 'الفجر'], ['sunrise', 'Sunrise', 'الشروق'], ['dhuhr', 'Dhuhr', 'الظهر'], ['asr', 'Asr', 'العصر'], ['maghrib', 'Maghrib', 'المغرب'], ['isha', 'Isha', 'العشاء']];
  CUSTOM.salah = (box) => {
    box.style.gap = '12px';
    const c = card('Prayer times and Hijri date', 'Calculated on this PC with the Umm al-Qura method. Dhuhr is shown one minute after midday. Check your local mosque timetable for the final say.');
    const city = el('select', 'filter'); city.style.margin = '0'; for (const k of Object.keys(CITIES)) city.append(new Option(k, k)); city.value = lsGet('city', 'Riyadh');
    const date = el('div'); date.style.cssText = 'font-size:20px;font-weight:700'; const next = el('div'); next.style.cssText = 'font-size:15px;color:var(--accent)';
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px';
    c.append(row(el('span', 'muted', 'City'), city), date, next, grid); box.append(c);
    let timer = null;
    const draw = () => {
      const [lat, lng, tz] = CITIES[city.value]; lsSet('city', city.value);
      const now = new Date(); const t = prayerTimes(now, lat, lng, tz, isRamadan(now));
      date.textContent = hijri(now, 'ar') + '  ·  ' + hijri(now, 'en');
      grid.textContent = '';
      const mins = (h) => Math.round(fix(h, 24) * 60); const cur = (now.getUTCHours() + tz) % 24 * 60 + now.getUTCMinutes(); let nx = null;
      for (const [k, en, ar] of NAMES) { const m = mins(t[k]); if (nx === null && m > cur && k !== 'sunrise') nx = [en, m - cur]; const d = el('div', 'card'); d.dataset.prayer = k; d.style.textAlign = 'center'; d.append(el('div', 'muted', ar + ' · ' + en)); const v = el('b', '', ampm(hm(t[k]))); v.style.fontSize = '18px'; d.append(v); grid.append(d); }
      if (!nx) { const [lat2, lng2, tz2] = CITIES[city.value]; const tm = new Date(now.getTime() + 864e5); const f = prayerTimes(tm, lat2, lng2, tz2, false); nx = ['Fajr', 1440 - cur + mins(f.fajr)]; }
      next.textContent = 'Next: ' + nx[0] + ' in ' + Math.floor(nx[1] / 60) + 'h ' + (nx[1] % 60) + 'm';
    };
    city.onchange = draw; draw(); timer = setInterval(() => { if (!box.isConnected) return clearInterval(timer); draw(); }, 30000);
  };
  window.auroraLife = Object.assign(window.auroraLife || {}, { prayerTimes, hm, CITIES, hijri });

  /* ---------- zakat ---------- */
  CUSTOM.zakat = (box) => {
    box.style.gap = '12px';
    const c = card('Zakat calculator', 'Zakat is 2.5% of your zakatable wealth when it reaches the nisab and a full Hijri year has passed. Enter the current gold price yourself, because it changes every day.');
    const f = {}; const add = (k, label, v) => { f[k] = inp(label, lsGet('z.' + k, v), 'number'); f[k].min = 0; c.append(row(el('span', 'muted', label), f[k])); };
    add('gold', 'Gold price per gram (SAR)', 380); add('cash', 'Cash and bank balances (SAR)', 0); add('goldg', 'Gold you own in grams (savings, not worn jewellery)', 0); add('silverg', 'Silver you own in grams', 0); add('silverp', 'Silver price per gram (SAR)', 4.5); add('stock', 'Shop stock at cost (SAR)', 0); add('owed', 'Money people owe you and will pay (SAR)', 0); add('debts', 'Debts you must pay soon (SAR)', 0);
    const out = el('div', 'card'); out.style.cssText = 'display:grid;gap:4px'; c.append(out); box.append(c);
    const calc = () => { const n = (k) => Math.max(0, Number(f[k].value) || 0); for (const k of Object.keys(f)) lsSet('z.' + k, f[k].value);
      const nisab = 85 * n('gold'); const wealth = n('cash') + n('goldg') * n('gold') + n('silverg') * n('silverp') + n('stock') + n('owed') - n('debts'); const due = wealth >= nisab && nisab > 0 ? wealth * 0.025 : 0;
      out.textContent = ''; const L = (a, b) => { const r = el('div'); r.style.cssText = 'display:flex;justify-content:space-between;gap:12px'; r.append(el('span', 'muted', a), el('b', '', b)); out.append(r); };
      const fm = (x) => x.toLocaleString('en', { maximumFractionDigits: 2 }) + ' SAR';
      L('Nisab (85 g of gold)', fm(nisab)); L('Your zakatable wealth', fm(wealth)); L(wealth >= nisab && nisab > 0 ? 'Zakat due (2.5%)' : 'Below the nisab', wealth >= nisab && nisab > 0 ? fm(due) : 'No zakat due'); out.dataset.due = due; };
    for (const k of Object.keys(f)) f[k].oninput = calc; calc();
    c.append(row(B('Copy the amount', '', () => copy((Number(out.dataset.due) || 0).toFixed(2)))), el('div', 'muted', 'This is a calculator, not a religious ruling. Ask a scholar about jewellery, shares and special cases.'));
  };

  /* ---------- world clock ---------- */
  const ZONES = [['Riyadh', 'Asia/Riyadh'], ['Dubai / Sharjah', 'Asia/Dubai'], ['Cairo', 'Africa/Cairo'], ['Istanbul', 'Europe/Istanbul'], ['London', 'Europe/London'], ['Shenzhen / Guangzhou', 'Asia/Shanghai'], ['Hong Kong', 'Asia/Hong_Kong'], ['Seoul', 'Asia/Seoul'], ['Delhi', 'Asia/Kolkata'], ['New York', 'America/New_York']];
  const fmtZone = (tz, d) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).format(d);
  const hourIn = (tz, d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)) % 24;
  CUSTOM.worldclock = (box) => {
    box.style.gap = '12px';
    const c = card('World clock for suppliers', 'Shows who is awake. Green means business hours (9:00 to 18:00), amber means early or late, grey means night. Drag the slider to plan a call.');
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px';
    const sl = el('input'); sl.type = 'range'; sl.min = -12; sl.max = 24; sl.value = 0; const lab = el('div', 'muted');
    c.append(row(el('span', 'muted', 'Move time (hours from now)'), sl, lab), grid); box.append(c);
    const draw = () => { const d = new Date(Date.now() + Number(sl.value) * 3600e3); lab.textContent = sl.value === '0' ? 'Now' : (sl.value > 0 ? '+' : '') + sl.value + ' h'; grid.textContent = '';
      for (const [n, tz] of ZONES) { const h = hourIn(tz, d); const day = h >= 9 && h < 18, edge = (h >= 7 && h < 9) || (h >= 18 && h < 22); const k = el('div', 'card'); k.dataset.zone = tz; k.style.borderLeft = '4px solid ' + (day ? '#3fb950' : edge ? '#d29922' : '#6e7681'); k.append(el('div', 'muted', n), (() => { const b = el('b', '', fmtZone(tz, d)); b.style.fontSize = '18px'; return b; })(), el('div', 'muted', day ? 'Business hours' : edge ? 'Early or late' : 'Night')); grid.append(k); } };
    sl.oninput = draw; draw(); const iv = setInterval(() => { if (!box.isConnected) return clearInterval(iv); if (sl.value === '0') draw(); }, 20000);
  };

  /* ---------- colour picker ---------- */
  const toHex = (r, g, b) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  const parseHex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]; };
  window.auroraLife.color = { toHex, parseHex, toHsl };
  CUSTOM.picker = (box) => {
    box.style.gap = '12px';
    const c = card('Colour picker', 'Pick any colour from anywhere on your screen, then copy it as HEX, RGB or HSL. Your saved colours stay here.');
    const sw = el('div'); sw.style.cssText = 'height:70px;border-radius:12px;border:1px solid var(--border,#444);background:#7C3AED'; const hex = inp('#RRGGBB', '#7C3AED', 'text'); const info = el('div', 'muted'); const pal = el('div'); pal.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    let saved = lsGet('pal', []);
    const set = (h) => { const rgb = parseHex(h); if (!rgb) return; const H = toHex(...rgb); hex.value = H; sw.style.background = H; info.textContent = `RGB ${rgb.join(', ')}  ·  HSL ${toHsl(rgb)[0]}, ${toHsl(rgb)[1]}%, ${toHsl(rgb)[2]}%`; };
    const drawPal = () => { pal.textContent = ''; for (const h of saved) { const b = el('button', 'btn'); b.style.cssText = 'width:34px;height:34px;padding:0;border-radius:8px;background:' + h; b.title = h; b.dataset.color = h; b.onclick = () => set(h); pal.append(b); } };
    hex.oninput = () => set(hex.value);
    const pick = B('Pick from screen', 'primary', async () => { if (!window.EyeDropper) return toast('Screen picker is not available here. Type a HEX code instead.', true); try { const r = await new EyeDropper().open(); set(r.sRGBHex); } catch (e) { /* cancelled */ } });
    const save = B('Save colour', '', () => { const rgb = parseHex(hex.value); if (!rgb) return toast('Not a valid colour', true); const H = toHex(...rgb); saved = [H, ...saved.filter((x) => x !== H)].slice(0, 24); lsSet('pal', saved); drawPal(); });
    c.append(sw, row(pick, hex, save), info, row(B('Copy HEX', '', () => copy(hex.value)), B('Copy RGB', '', () => { const r = parseHex(hex.value); if (r) copy(`rgb(${r.join(', ')})`); }), B('Copy HSL', '', () => { const r = parseHex(hex.value); if (r) { const h = toHsl(r); copy(`hsl(${h[0]}, ${h[1]}%, ${h[2]}%)`); } })), pal); box.append(c); set('#7C3AED'); drawPal();
  };

  /* ---------- exchange rates (you type the rates, so they are never stale or wrong) ---------- */
  CUSTOM.fx = (box) => {
    box.style.gap = '12px';
    const c = card('Quick exchange', 'Rates are yours to set (units per 1 US dollar), so you always use the rate your supplier or bank gave you today. SAR and AED are pegged to the dollar.');
    const CUR = [['USD', 1], ['SAR', 3.75], ['AED', 3.6725], ['CNY', 7.2], ['EUR', 0.92], ['GBP', 0.78], ['EGP', 48], ['TRY', 34], ['HKD', 7.8]];
    const rates = Object.assign(Object.fromEntries(CUR), lsGet('fx', {}));
    const amount = inp('Amount', 1000, 'number'); const from = el('select', 'filter'); from.style.margin = '0'; for (const [k] of CUR) from.append(new Option(k, k)); from.value = 'CNY';
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px';
    c.append(row(amount, from), grid); box.append(c);
    const draw = () => { const usd = (Number(amount.value) || 0) / rates[from.value]; grid.textContent = ''; for (const [k] of CUR) { const d = el('div', 'card'); d.dataset.cur = k; const v = el('b', '', (usd * rates[k]).toLocaleString('en', { maximumFractionDigits: 2 })); v.style.fontSize = '17px'; const r = inp('rate', rates[k], 'number'); r.step = 'any'; r.style.cssText = 'margin:0;width:100%'; r.title = 'Units per 1 USD'; r.onchange = () => { const x = Number(r.value); if (x > 0) { rates[k] = x; lsSet('fx', rates); draw(); } }; d.append(el('div', 'muted', k), v, r); grid.append(d); } };
    amount.oninput = draw; from.onchange = draw; draw();
    c.append(B('Reset rates', '', () => { for (const [k, v] of CUR) rates[k] = v; lsSet('fx', {}); draw(); }));
  };

  /* ---------- mouse pointer fix ---------- */
  CUSTOM.cursorfix = (box) => {
    box.style.gap = '12px';
    const c = card('Pointer vanishing? Fix it here', 'Most disappearing-pointer problems come from a Windows setting or a driver. This turns off the setting causes and reloads the pointer images. You can undo nothing harmful: these are all the normal Windows defaults.');
    const st = el('div', 'card'); st.id = 'cur-state'; st.style.cssText = 'display:grid;gap:4px';
    const draw = (s) => { st.textContent = ''; const L = (a, b, bad) => { const r = el('div'); r.style.cssText = 'display:flex;justify-content:space-between;gap:12px'; r.append(el('span', 'muted', a), el('b', '', b)); if (bad) r.lastChild.style.color = '#d29922'; st.append(r); };
      L('Hide pointer while typing', s.vanish ? 'ON (can make it vanish)' : 'Off', s.vanish); L('Pointer trails', s.trails > 1 ? 'ON' : 'Off', s.trails > 1); L('Find my pointer with Ctrl', s.sonar ? 'On' : 'Off'); };
    const load = async () => { try { draw(await call('cursorState')); } catch (e) { st.textContent = errText(e); } };
    const fixb = B('Fix my pointer now', 'primary', async () => { try { draw(await call('cursorFix')); toast('Pointer settings fixed. Press Ctrl to find it.'); } catch (e) { toast(errText(e), true); } });
    const tips = el('div', 'card'); tips.style.cssText = 'display:grid;gap:6px'; tips.append(el('b', '', 'If it still vanishes, try these in order'));
    for (const t of ['Unplug the mouse or its USB receiver and plug it into another port. Avoid hubs.', 'Press Ctrl: the pointer shows a ring around itself if it is only hidden.', 'Update the mouse and graphics drivers: open Vorynth Doctor and press "Fix everything" with driver updates on.', 'Turn off USB power saving: Device Manager, Universal Serial Bus controllers, USB Root Hub, Power Management, untick "Allow the computer to turn off this device".', 'Turn off Windows Ink and touch feedback if you have a touch screen or a pen tablet connected.', 'If it only vanishes in games or on a second screen, turn off "Enhance pointer precision" and lower the display scaling on that screen.', 'Wireless mouse: change the battery. A weak battery makes the pointer freeze and flicker.']) tips.append(el('div', 'muted', '• ' + t));
    c.append(st, row(fixb, B('Refresh', '', load))); box.append(c, tips); load();
  };

  /* ---------- diagnostics ---------- */
  CUSTOM.diag = (box) => {
    box.style.gap = '12px';
    const c = card('Diagnostics', 'Checks this PC (Windows version, permissions, whether registry changes work, every switch) and lists the errors the app has hit. Nothing is sent anywhere. You choose whether to share the file. Your user name and computer name are left out.');
    const out = el('textarea', 'filter'); out.readOnly = true; out.style.cssText = 'width:100%;min-height:340px;font-family:monospace;font-size:12px;margin:0;white-space:pre'; out.placeholder = 'Press "Run checks".';
    const status = el('div', 'muted');
    const run = B('Run checks', 'primary', async () => { status.textContent = 'Checking… this can take up to a minute.'; run.disabled = true; try { out.value = await call('diagReport', { errors: window.__callErrors || [], ui: { page: document.title, w: innerWidth, h: innerHeight } }); status.textContent = 'Done. Save the file or copy the text and send it.'; } catch (e) { out.value = 'The report itself failed:\n' + errText(e); status.textContent = ''; } run.disabled = false; });
    const save = B('Save to Desktop', '', async () => { if (!out.value) return toast('Run the checks first', true); try { const r = await call('diagSave', { text: out.value }); toast('Saved: ' + r); } catch (e) { toast(errText(e), true); } });
    c.append(row(run, save, B('Copy', '', () => { if (out.value) copy(out.value); })), status, out); box.append(c);
  };
}
