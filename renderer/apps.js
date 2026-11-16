/* Aurora Apps: your own Notepad, Calculator, Paint, Clock, Calendar, Voice recorder, Photo/Media viewer and Character map.
   Everything runs inside Aurora: no Windows apps are opened. Loaded after app.js (uses its el/toast/call helpers). */
{ // block scope: keeps these helper names from clashing with app.js
const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const mkBtn = (txt, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); if (fn) b.onclick = fn; return b; };
const row = (...kids) => { const r = el('div', 'savebar'); r.append(...kids); return r; };
const alive = (box) => document.body.contains(box);


/* tiny Markdown preview: builds DOM nodes only (never innerHTML), so pasted text can never run as code */
const mdInline = (text, parent) => {
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g; let last = 0, m;
  while ((m = re.exec(text))) { if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index))); let n; if (m[2]) { n = el('strong', '', m[2]); } else if (m[3]) { n = el('em', '', m[3]); } else if (m[4]) { n = el('code', '', m[4]); n.style.cssText = 'background:var(--track);padding:1px 5px;border-radius:4px'; } else { n = el('span', '', m[5]); n.style.cssText = 'color:var(--accent);text-decoration:underline'; n.title = m[6]; } parent.append(n); last = re.lastIndex; }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
};
const mdRender = (src) => {
  const root = el('div'); root.style.cssText = 'display:flex;flex-direction:column;gap:8px;line-height:1.55'; const lines = src.split('\n'); let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; const pre = el('pre', '', buf.join('\n')); pre.style.cssText = 'background:var(--track);padding:10px;border-radius:8px;overflow:auto;margin:0;font:13px Consolas,monospace'; root.append(pre); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(ln); if (h) { const n = el('div'); n.style.cssText = `font-weight:700;font-size:${[26, 22, 19, 17, 15, 14][h[1].length - 1]}px;margin-top:6px`; mdInline(h[2], n); root.append(n); i++; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(ln)) { const hr = el('div'); hr.style.cssText = 'height:1px;background:var(--border)'; root.append(hr); i++; continue; }
    if (/^\s*([-*]|\d+\.)\s+/.test(ln)) { const ord = /^\s*\d+\./.test(ln); const list = el(ord ? 'ol' : 'ul'); list.style.cssText = 'margin:0;padding-left:24px'; while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) { const li = el('li'); mdInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''), li); list.append(li); i++; } root.append(list); continue; }
    if (/^>\s?/.test(ln)) { const q = el('div'); q.style.cssText = 'border-left:3px solid var(--accent);padding-left:10px;color:var(--muted)'; const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); mdInline(buf.join(' '), q); root.append(q); continue; }
    if (!ln.trim()) { i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>\s?|\s*([-*]|\d+\.)\s+)/.test(lines[i])) buf.push(lines[i++]); const para = el('div'); mdInline(buf.join(' '), para); root.append(para);
  }
  return root;
};

/* ---------- Pad (Notepad) ---------- */
CUSTOM.pad = (box) => {
  box.style.gap = '8px';
  const ta = el('textarea', 'filter'); ta.rows = 16; ta.spellcheck = false; ta.style.cssText = 'margin:0;resize:vertical;font:14px/1.5 Consolas,monospace;width:100%;white-space:pre';
  let file = { path: '', name: 'Untitled' }, dirty = false;
  const title = el('div', 'label', 'Untitled'), stats = el('div', 'sub', '');
  const upd = () => { title.textContent = (dirty ? '● ' : '') + file.name; const t = ta.value; stats.textContent = `${t.length} characters · ${(t.trim() ? t.trim().split(/\s+/).length : 0)} words · ${t ? t.split('\n').length : 1} lines`; };
  ta.oninput = () => { dirty = true; upd(); };
  const okToLeave = () => !dirty || confirm('Discard your unsaved changes?');
  const save = async (as) => { try { const r = await call('padSave', { text: ta.value, path: as ? '' : file.path, name: file.name }); if (!r) return; file = r; dirty = false; upd(); toast('Saved ' + r.name); } catch (e) { toast(errText(e), true); } };
  const find = el('input', 'filter'); find.placeholder = 'Find'; const rep = el('input', 'filter'); rep.placeholder = 'Replace with';
  const info = el('div', 'sub', '');
  const doFind = () => { const i = ta.value.toLowerCase().indexOf(find.value.toLowerCase(), ta.selectionEnd); const j = i < 0 ? ta.value.toLowerCase().indexOf(find.value.toLowerCase()) : i; if (!find.value || j < 0) { info.textContent = 'Not found'; return; } ta.focus(); ta.setSelectionRange(j, j + find.value.length); info.textContent = ''; };
  const replaceAll = () => { if (!find.value) return; const re = new RegExp(find.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); let n = 0; ta.value = ta.value.replace(re, () => { n++; return rep.value; }); if (n) { dirty = true; upd(); } info.textContent = n + ' replaced'; };
  const size = el('select', 'filter'); size.style.width = 'auto'; ['12', '14', '16', '20', '26'].forEach((s) => { const o = el('option', '', s + ' px'); o.value = s; if (s === '14') o.selected = true; size.append(o); }); size.onchange = () => { ta.style.fontSize = size.value + 'px'; };
  const prev = el('div'); prev.style.cssText = 'display:none;padding:12px;border:1px solid var(--border);border-radius:10px;min-height:200px'; const pv = el('input'); pv.type = 'checkbox'; pv.onchange = () => { if (pv.checked) { prev.replaceChildren(mdRender(ta.value)); prev.style.display = ''; ta.style.display = 'none'; } else { prev.style.display = 'none'; ta.style.display = ''; } }; const pl = el('label', 'sub'); pl.append(pv, ' Markdown preview');
  ta.addEventListener('input', () => { if (pv.checked) prev.replaceChildren(mdRender(ta.value)); });
  const wrap = el('input'); wrap.type = 'checkbox'; wrap.onchange = () => { ta.style.whiteSpace = wrap.checked ? 'pre-wrap' : 'pre'; }; const wl = el('label', 'sub'); wl.append(wrap, ' Wrap');
  box.append(title, row(
    mkBtn('New', '', () => { if (!okToLeave()) return; ta.value = ''; file = { path: '', name: 'Untitled' }; dirty = false; upd(); }),
    mkBtn('Open...', '', async () => { if (!okToLeave()) return; try { const r = await call('padOpen'); if (!r) return; ta.value = r.text; file = { path: r.path, name: r.name }; dirty = false; upd(); } catch (e) { toast(errText(e), true); } }),
    mkBtn('Save', 'primary', () => save(false)), mkBtn('Save as...', '', () => save(true)), size, wl, pl),
  ta, prev, stats, row(find, rep, mkBtn('Find next', '', doFind), mkBtn('Replace all', '', replaceAll)), info);
  upd();
};

/* ---------- Calc (Calculator + converter) ---------- */
const calcEval = (src, deg) => {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').toLowerCase().replace(/\s+/g, '');
  let i = 0; const fail = () => { throw new Error('Not a valid expression'); };
  const toRad = (x) => (deg ? x * Math.PI / 180 : x), fromRad = (x) => (deg ? x * 180 / Math.PI : x);
  const FN = { sin: (x) => Math.sin(toRad(x)), cos: (x) => Math.cos(toRad(x)), tan: (x) => Math.tan(toRad(x)), asin: (x) => fromRad(Math.asin(x)), acos: (x) => fromRad(Math.acos(x)), atan: (x) => fromRad(Math.atan(x)), ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, cbrt: Math.cbrt, round: Math.round, floor: Math.floor, ceil: Math.ceil };
  const fact = (n) => { if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Factorial needs a whole number from 0 to 170'); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  function expr() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term() { let v = unary(); for (;;) { if (s[i] === '*') { i++; v *= unary(); } else if (s[i] === '/') { i++; const d = unary(); if (d === 0) throw new Error('Cannot divide by zero'); v /= d; } else if (s[i] === '(' || /[a-z]/.test(s[i] || '')) { v *= pow(); } else return v; } }
  function pow() { const b = post(); if (s[i] === '^') { i++; return Math.pow(b, unary()); } return b; }
  function unary() { if (s[i] === '-') { i++; return -unary(); } if (s[i] === '+') { i++; return unary(); } return pow(); }
  function post() { let v = atom(); for (;;) { if (s[i] === '!') { i++; v = fact(v); } else if (s[i] === '%') { i++; v /= 100; } else return v; } }
  function atom() {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') fail(); i++; return v; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)); if (num) { i += num[0].length; return parseFloat(num[0]); }
    const w = /^[a-z]+/.exec(s.slice(i)); if (!w) return fail(); i += w[0].length;
    if (w[0] === 'pi') return Math.PI; if (w[0] === 'e') return Math.E;
    if (FN[w[0]]) { if (s[i] !== '(') fail(); i++; const v = expr(); if (s[i] !== ')') fail(); i++; return FN[w[0]](v); }
    return fail();
  }
  if (!s) throw new Error('Type something first');
  const v = expr(); if (i < s.length) fail();
  if (!Number.isFinite(v)) throw new Error('The result is not a number'); return v;
};
const fmtNum = (v) => { if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(10).replace(/\.?0+e/, 'e'); return String(parseFloat(v.toPrecision(14))); };
const UNITS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mile: 1609.344, yard: 0.9144, foot: 0.3048, inch: 0.0254 },
  Weight: { kg: 1, g: 0.001, mg: 1e-6, tonne: 1000, pound: 0.45359237, ounce: 0.028349523125 },
  Data: { byte: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, bit: 0.125 },
  Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444 },
  Time: { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800 },
  Area: { 'm²': 1, 'km²': 1e6, hectare: 1e4, 'ft²': 0.09290304, acre: 4046.8564224 },
  Volume: { liter: 1, ml: 0.001, 'm³': 1000, gallon: 3.785411784, cup: 0.2365882365 },
  Temperature: { '°C': 1, '°F': 1, K: 1 }
};
const convertUnit = (cat, v, from, to) => {
  if (cat === 'Temperature') { const c = from === '°C' ? v : from === '°F' ? (v - 32) * 5 / 9 : v - 273.15; return to === '°C' ? c : to === '°F' ? c * 9 / 5 + 32 : c + 273.15; }
  return v * UNITS[cat][from] / UNITS[cat][to];
};
window.auroraCalc = { calcEval, fmtNum, UNITS, convertUnit };
CUSTOM.calc = (box) => {
  box.style.gap = '10px';
  let deg = true; const hist = [];
  const inp = el('input', 'filter'); inp.placeholder = 'Type a calculation, e.g. 2*(3+4)^2 or sin(30)'; inp.style.cssText = 'font-size:20px;margin:0'; const out = el('div', ''); out.style.cssText = 'font-size:28px;font-weight:600;min-height:36px'; const err = el('div', 'store-err', '');
  const run = () => { err.textContent = ''; try { const v = calcEval(inp.value, deg); out.textContent = '= ' + fmtNum(v); return v; } catch (e) { out.textContent = ''; err.textContent = e.message; return null; } };
  inp.oninput = () => { if (!inp.value) { out.textContent = ''; err.textContent = ''; return; } try { out.textContent = '= ' + fmtNum(calcEval(inp.value, deg)); err.textContent = ''; } catch (_) { out.textContent = ''; } };
  const enter = () => { const v = run(); if (v != null) { hist.unshift(inp.value + ' = ' + fmtNum(v)); hist.splice(12); drawHist(); inp.value = fmtNum(v); } };
  inp.onkeydown = (e) => { if (e.key === 'Enter') enter(); };
  const keys = [['C', 'clr'], ['(', '('], [')', ')'], ['÷', '/'], ['sin', 'sin('], ['7', '7'], ['8', '8'], ['9', '9'], ['×', '*'], ['cos', 'cos('], ['4', '4'], ['5', '5'], ['6', '6'], ['−', '-'], ['tan', 'tan('], ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+'], ['√', 'sqrt('], ['0', '0'], ['.', '.'], ['%', '%'], ['=', '='], ['xʸ', '^'], ['π', 'pi'], ['ln', 'ln('], ['log', 'log('], ['n!', '!'], ['⌫', 'bs']];
  const pad = el('div'); pad.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;max-width:420px';
  keys.forEach(([t, v]) => { const b = mkBtn(t, /^\d|\.$/.test(t) ? '' : (t === '=' ? 'primary' : ''), () => { if (v === 'clr') { inp.value = ''; out.textContent = ''; err.textContent = ''; } else if (v === 'bs') inp.value = inp.value.slice(0, -1); else if (v === '=') enter(); else inp.value += v; inp.focus(); inp.dispatchEvent(new Event('input')); }); b.style.padding = '12px 0'; pad.append(b); });
  const dg = mkBtn('Degrees', '', () => { deg = !deg; dg.textContent = deg ? 'Degrees' : 'Radians'; inp.dispatchEvent(new Event('input')); });
  const histBox = el('div'); const drawHist = () => { histBox.replaceChildren(); hist.forEach((h) => { const r = el('div', 'list-row'); r.append(el('div', 'sub', h)); const u = mkBtn('Use', '', () => { inp.value = h.split(' = ')[1]; inp.dispatchEvent(new Event('input')); }); r.append(u); histBox.append(r); }); };
  // converter
  const cv = el('div', 'card column'); cv.style.cssText = 'display:flex;flex-direction:column;gap:8px'; cv.append(el('div', 'label', 'Unit converter'));
  const cat = el('select', 'filter'), from = el('select', 'filter'), to = el('select', 'filter'), val = el('input', 'filter'), res = el('div', ''); val.value = '1'; val.type = 'number'; res.style.fontWeight = '600';
  Object.keys(UNITS).forEach((c) => cat.append(Object.assign(el('option', '', c), { value: c })));
  const fill = () => { [from, to].forEach((s) => s.replaceChildren()); Object.keys(UNITS[cat.value]).forEach((u) => { from.append(Object.assign(el('option', '', u), { value: u })); to.append(Object.assign(el('option', '', u), { value: u })); }); to.selectedIndex = Math.min(1, to.options.length - 1); calc(); };
  const calc = () => { const v = parseFloat(val.value); res.textContent = Number.isFinite(v) ? `${fmtNum(v)} ${from.value} = ${fmtNum(convertUnit(cat.value, v, from.value, to.value))} ${to.value}` : ''; };
  cat.onchange = fill; [from, to].forEach((s) => (s.onchange = calc)); val.oninput = calc; fill();
  cv.append(cat, row(val, from, el('span', 'sub', '→'), to), res);
  box.append(inp, out, err, pad, row(dg), histBox, cv);
};

/* ---------- Sketch (Paint) ---------- */
CUSTOM.sketch = (box) => {
  box.style.gap = '8px';
  const W = 900, H = 520; const cv = el('canvas'); cv.width = W; cv.height = H; cv.style.cssText = 'width:100%;max-width:900px;background:#fff;border-radius:10px;touch-action:none;cursor:crosshair;border:1px solid var(--border)';
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let tool = 'pen', color = '#1e90ff', size = 4, drawing = false, sx = 0, sy = 0, snap = null; const undo = [];
  const pushUndo = () => { undo.push(ctx.getImageData(0, 0, W, H)); if (undo.length > 25) undo.shift(); };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const shape = (x, y) => { ctx.putImageData(snap, 0, 0); ctx.beginPath(); if (tool === 'line') { ctx.moveTo(sx, sy); ctx.lineTo(x, y); } else if (tool === 'rect') ctx.rect(sx, sy, x - sx, y - sy); else if (tool === 'ellipse') ctx.ellipse((sx + x) / 2, (sy + y) / 2, Math.abs(x - sx) / 2, Math.abs(y - sy) / 2, 0, 0, Math.PI * 2); ctx.stroke(); };
  const fillAt = (x0, y0) => {
    const img = ctx.getImageData(0, 0, W, H), d = img.data, idx = (x, y) => (y * W + x) * 4; x0 = Math.floor(x0); y0 = Math.floor(y0);
    const t = [d[idx(x0, y0)], d[idx(x0, y0) + 1], d[idx(x0, y0) + 2]]; const c = parseInt(color.slice(1), 16), nr = c >> 16, ng = (c >> 8) & 255, nb = c & 255;
    if (t[0] === nr && t[1] === ng && t[2] === nb) return; const st = [[x0, y0]]; const same = (p) => Math.abs(d[p] - t[0]) < 24 && Math.abs(d[p + 1] - t[1]) < 24 && Math.abs(d[p + 2] - t[2]) < 24;
    while (st.length) { const [x, y] = st.pop(); if (x < 0 || y < 0 || x >= W || y >= H) continue; const p = idx(x, y); if (!same(p)) continue; d[p] = nr; d[p + 1] = ng; d[p + 2] = nb; d[p + 3] = 255; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
    ctx.putImageData(img, 0, 0);
  };
  cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); pushUndo(); if (tool === 'fill') { fillAt(x, y); return; } drawing = true; sx = x; sy = y; ctx.lineWidth = size; ctx.strokeStyle = tool === 'eraser' ? '#fff' : color; if (tool === 'pen' || tool === 'eraser') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y); ctx.stroke(); } else snap = ctx.getImageData(0, 0, W, H); };
  cv.onpointermove = (e) => { if (!drawing) return; const [x, y] = pos(e); if (tool === 'pen' || tool === 'eraser') { ctx.lineTo(x, y); ctx.stroke(); } else shape(x, y); };
  cv.onpointerup = () => { drawing = false; };
  const tools = el('div', 'store-chips'); const tb = {};
  [['pen', '✏️ Pen'], ['eraser', '🩹 Eraser'], ['line', '📏 Line'], ['rect', '⬜ Box'], ['ellipse', '⭕ Oval'], ['fill', '🪣 Fill']].forEach(([k, l]) => { const b = el('button', 'chip' + (k === tool ? ' on' : ''), l); b.onclick = () => { tool = k; Object.values(tb).forEach((x) => x.classList.remove('on')); b.classList.add('on'); }; tb[k] = b; tools.append(b); });
  const col = el('input'); col.type = 'color'; col.value = color; col.oninput = () => { color = col.value; }; const sz = el('input'); sz.type = 'range'; sz.min = 1; sz.max = 40; sz.value = size; sz.oninput = () => { size = Number(sz.value); };
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none'; file.onchange = () => { const f = file.files[0]; if (!f) return; const img = new Image(); img.onload = () => { pushUndo(); const k = Math.min(W / img.width, H / img.height, 1); ctx.drawImage(img, 0, 0, img.width * k, img.height * k); URL.revokeObjectURL(img.src); }; img.src = URL.createObjectURL(f); file.value = ''; };
  box.append(tools, row(el('span', 'sub', 'Colour'), col, el('span', 'sub', 'Size'), sz,
    mkBtn('Undo', '', () => { const u = undo.pop(); if (u) ctx.putImageData(u, 0, 0); }),
    mkBtn('Clear', '', () => { pushUndo(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }),
    mkBtn('Open image...', '', () => file.click()), mkBtn('Save PNG', 'primary', () => cv.toBlob((b) => dl(b, 'sketch.png'), 'image/png'))), cv, file);
};

/* ---------- Clock: timer + stopwatch ---------- */
const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.35, 0.7].forEach((t) => { const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.2); }); } catch (_) {} };
const fmtT = (ms, hund) => { const s = Math.max(0, ms) / 1000, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60); return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}${hund ? '.' + String(Math.floor(s * 100) % 100).padStart(2, '0') : ''}`; };
CUSTOM.timer = (box) => {
  box.style.gap = '12px';
  // timer
  const big = el('div', ''); big.style.cssText = 'font-size:44px;font-weight:600;font-variant-numeric:tabular-nums'; let left = 0, end = 0, tid = null, base = 0;
  const mins = el('input', 'filter'); mins.type = 'number'; mins.min = 0; mins.value = 5; mins.style.width = '90px'; const secs = el('input', 'filter'); secs.type = 'number'; secs.min = 0; secs.max = 59; secs.value = 0; secs.style.width = '90px';
  const show = () => { big.textContent = fmtT(tid ? end - Date.now() : left); };
  const stop = () => { clearInterval(tid); tid = null; };
  const start = () => { if (!tid) { if (!left) { left = (Math.max(0, Number(mins.value) || 0) * 60 + Math.min(59, Math.max(0, Number(secs.value) || 0))) * 1000; base = left; } if (!left) return toast('Set a time first', true); end = Date.now() + left; tid = setInterval(() => { if (!alive(box)) return stop(); if (end - Date.now() <= 0) { stop(); left = 0; big.textContent = '0:00'; beep(); toast('⏰ Timer finished'); try { new Notification('Aurora timer', { body: 'Time is up' }); } catch (_) {} } else show(); }, 100); show(); } };
  const pause = () => { if (tid) { left = end - Date.now(); stop(); show(); } };
  const reset = () => { stop(); left = 0; big.textContent = '0:00'; };
  const presets = el('div', 'store-chips'); [1, 5, 10, 15, 25, 45].forEach((m) => { const b = el('button', 'chip', m + ' min'); b.onclick = () => { reset(); mins.value = m; secs.value = 0; big.textContent = fmtT(m * 60000); }; presets.append(b); });
  box.append(el('div', 'label', 'Timer'), big, row(mins, el('span', 'sub', 'min'), secs, el('span', 'sub', 'sec')), presets, row(mkBtn('Start', 'primary', start), mkBtn('Pause', '', pause), mkBtn('Reset', '', reset)));
  big.textContent = '0:00'; void base;
  // stopwatch
  const sw = el('div', ''); sw.style.cssText = 'font-size:44px;font-weight:600;font-variant-numeric:tabular-nums'; sw.textContent = '0:00.00'; let acc = 0, t0 = 0, st = null; const laps = el('div');
  const cur = () => acc + (st ? Date.now() - t0 : 0);
  const swStart = () => { if (st) return; t0 = Date.now(); st = setInterval(() => { if (!alive(box)) { clearInterval(st); st = null; return; } sw.textContent = fmtT(cur(), true); }, 30); };
  const swPause = () => { if (!st) return; acc = cur(); clearInterval(st); st = null; sw.textContent = fmtT(acc, true); };
  box.append(el('div', 'label', 'Stopwatch'), sw, row(mkBtn('Start', 'primary', swStart), mkBtn('Pause', '', swPause), mkBtn('Lap', '', () => { if (!cur()) return; laps.prepend(el('div', 'list-row', `Lap ${laps.children.length + 1}   ${fmtT(cur(), true)}`)); }), mkBtn('Reset', '', () => { clearInterval(st); st = null; acc = 0; sw.textContent = '0:00.00'; laps.replaceChildren(); })), laps);
};


/* ---------- iCalendar (.ics) import and export for the Planner ---------- */
const icsEsc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = (line) => { const out = []; let cur = ''; let bytes = 0; for (const ch of line) { const n = new TextEncoder().encode(ch).length; if (bytes + n > 74) { out.push(cur); cur = ' '; bytes = 1; } cur += ch; bytes += n; } out.push(cur); return out.join('\r\n'); };
const icsDay = (iso) => iso.replace(/-/g, '');
const icsNext = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
window.auroraIcs = {
  build: (items) => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aurora Settings//Planner//EN', 'CALSCALE:GREGORIAN'];
    items.forEach((x) => { L.push('BEGIN:VEVENT', `UID:${x.id}@aurora.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDay(x.date)}`, `DTEND;VALUE=DATE:${icsNext(x.date)}`, `SUMMARY:${icsEsc((x.done ? '\u2713 ' : '') + x.text)}`, ...(x.done ? ['X-AURORA-DONE:TRUE'] : []), 'END:VEVENT'); });
    L.push('END:VCALENDAR'); return L.map(icsFold).join('\r\n') + '\r\n';
  },
  parse: (text) => {
    const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n'); const out = []; let ev = null;
    const unesc = (v) => v.replace(/\\n/gi, '\n').replace(/\\([;,\\])/g, '$1');
    for (const ln of lines) {
      if (/^BEGIN:VEVENT/i.test(ln)) { ev = {}; continue; } if (/^END:VEVENT/i.test(ln)) { if (ev && ev.date && ev.text) out.push(ev); ev = null; continue; } if (!ev) continue;
      const m = /^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/.exec(ln); if (!m) continue; const k = m[1].toUpperCase(), v = m[3];
      if (k === 'DTSTART') { const d = /^(\d{4})(\d{2})(\d{2})/.exec(v); if (d) ev.date = `${d[1]}-${d[2]}-${d[3]}`; } else if (k === 'SUMMARY') { let t = unesc(v).trim(); if (t.startsWith('\u2713 ')) { ev.done = true; t = t.slice(2); } ev.text = t.slice(0, 200); } else if (k === 'X-AURORA-DONE') ev.done = /true/i.test(v);
    }
    return out.slice(0, 500);
  }
};

/* ---------- Planner (Calendar + to-do) ---------- */
CUSTOM.planner = (box) => {
  box.style.gap = '10px';
  let view = new Date(); view.setDate(1); let sel = null; let items = [];
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const persist = async () => { try { await call('storeSet', { key: 'planner', value: items }); } catch (e) { toast(errText(e), true); } };
  const icsInput = el('input'); icsInput.type = 'file'; icsInput.accept = '.ics,text/calendar'; icsInput.style.display = 'none';
  icsInput.onchange = () => { const f = icsInput.files[0]; icsInput.value = ''; if (!f) return; if (f.size > 5 * 1048576) return toast('Pick a calendar file under 5 MB', true); const rd = new FileReader(); rd.onload = async () => { const got = window.auroraIcs.parse(String(rd.result)); if (!got.length) return toast('No events were found in that file', true); const have = new Set(items.map((x) => x.date + '|' + x.text)); const fresh = got.filter((x) => !have.has(x.date + '|' + x.text)); if (!fresh.length) return toast('Those events are already in your Planner', true); const next = [...items, ...fresh.map((x) => ({ id: 'p' + Math.random().toString(36).slice(2, 10), date: x.date, text: x.text, done: !!x.done }))].slice(0, 500); items = next; await persist(); toast(`Imported ${fresh.length} event${fresh.length === 1 ? '' : 's'}${got.length > fresh.length ? ` (${got.length - fresh.length} already there)` : ''}`); draw(); }; rd.readAsText(f); };
  const draw = () => {
    box.replaceChildren();
    const head = row(mkBtn('◀', '', () => { view.setMonth(view.getMonth() - 1); draw(); }), el('div', 'label', view.toLocaleDateString([], { month: 'long', year: 'numeric' })), mkBtn('▶', '', () => { view.setMonth(view.getMonth() + 1); draw(); }), mkBtn('Today', '', () => { view = new Date(); view.setDate(1); sel = key(new Date()); draw(); }), mkBtn('Export .ics', '', () => { if (!items.length) return toast('Nothing to export yet', true); dl(new Blob([window.auroraIcs.build(items)], { type: 'text/calendar' }), 'aurora-planner.ics'); }), mkBtn('Import .ics', '', () => icsInput.click()));
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px;max-width:640px';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => { const h = el('div', 'sub', d); h.style.textAlign = 'center'; grid.append(h); });
    for (let i = 0; i < view.getDay(); i++) grid.append(el('div'));
    const n = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate(), today = key(new Date());
    for (let d = 1; d <= n; d++) {
      const k = key(new Date(view.getFullYear(), view.getMonth(), d)); const cnt = items.filter((x) => x.date === k && !x.done).length;
      const c = el('button', 'btn' + (k === sel ? ' primary' : ''), String(d)); c.style.cssText = 'padding:10px 0;position:relative;' + (k === today ? 'outline:2px solid var(--accent);' : ''); if (cnt) c.append(Object.assign(el('span', '', ' •'), { title: cnt + ' to do' })); c.onclick = () => { sel = k; draw(); }; grid.append(c);
    }
    box.append(head, grid, icsInput);
    const day = sel || today; const add = el('input', 'filter'); add.placeholder = `Add to ${day} (press Enter)`;
    add.onkeydown = async (e) => { if (e.key === 'Enter' && add.value.trim()) { items = [...items, { id: 'p' + Math.random().toString(36).slice(2, 10), date: day, text: add.value.trim().slice(0, 200), done: false }]; await persist(); draw(); } };
    box.append(add);
    const list = items.filter((x) => x.date === day); if (!list.length) box.append(el('div', 'muted', 'Nothing planned for this day.'));
    list.forEach((x) => { const r = el('div', 'list-row'); const l = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = x.done; c.onchange = async () => { x.done = c.checked; await persist(); draw(); }; l.append(c, ' ' + x.text); if (x.done) l.style.textDecoration = 'line-through'; const del = mkBtn('Delete', 'danger', async () => { items = items.filter((y) => y.id !== x.id); await persist(); draw(); }); r.append(l, del); box.append(r); });
    const open = items.filter((x) => !x.done && x.date < today).length; if (open) box.append(el('div', 'sub', `${open} unfinished item${open === 1 ? '' : 's'} from earlier days`));
  };
  call('storeGet').then((st) => { items = st.planner || []; sel = key(new Date()); draw(); }).catch(() => fail(box));
};

/* ---------- Recorder (Voice recorder) ---------- */
CUSTOM.recorder = (box) => {
  box.style.gap = '10px';
  let rec = null, chunks = [], stream = null, t0 = 0, tm = null; const clock = el('div', ''); clock.style.cssText = 'font-size:34px;font-weight:600;font-variant-numeric:tabular-nums'; clock.textContent = '0:00'; const list = el('div'); const msg = el('div', 'sub', '');
  const startB = mkBtn('● Record', 'primary'), stopB = mkBtn('■ Stop', ''); stopB.disabled = true;
  startB.onclick = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { msg.textContent = 'Aurora could not use the microphone. Check that one is plugged in and that Microphone access is on in Privacy.'; return; }
    msg.textContent = ''; chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(tm); const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); const url = URL.createObjectURL(blob); const name = 'Recording ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const r = el('div', 'list-row'); const a = el('audio'); a.controls = true; a.src = url; const l = el('div'); l.append(el('div', '', name), a); const s = mkBtn('Save', '', () => dl(blob, name.replace(/[^\w ]/g, '') + '.webm')); const d = mkBtn('Delete', 'danger', () => { URL.revokeObjectURL(url); r.remove(); }); const b = el('div'); b.style.cssText = 'display:flex;gap:8px'; b.append(s, d); r.append(l, b); list.prepend(r); startB.disabled = false; stopB.disabled = true; };
    rec.start(); t0 = Date.now(); tm = setInterval(() => { if (!alive(box)) { clearInterval(tm); try { rec.stop(); } catch (_) {} return; } clock.textContent = fmtT(Date.now() - t0); }, 250); startB.disabled = true; stopB.disabled = false;
  };
  stopB.onclick = () => { try { rec.stop(); } catch (_) {} };
  box.append(clock, row(startB, stopB), msg, el('div', 'sub', 'Recordings stay in this window until you save them. Closing Aurora discards unsaved ones.'), list);
};

/* ---------- Viewer (Photos + media player) ---------- */
CUSTOM.viewer = (box) => {
  box.style.gap = '10px'; let files = [], idx = 0, urls = [];
  const stage = el('div'); stage.style.cssText = 'min-height:260px;display:grid;place-items:center;background:var(--track);border-radius:12px;overflow:hidden'; const cap = el('div', 'sub', 'Open pictures, music or videos to view them here.');
  const pick = el('input'); pick.type = 'file'; pick.multiple = true; pick.accept = 'image/*,audio/*,video/*'; pick.style.display = 'none';
  const show = () => {
    stage.replaceChildren(); if (!files.length) { cap.textContent = 'Open pictures, music or videos to view them here.'; return; } const f = files[idx], u = urls[idx]; let node;
    if (f.type.startsWith('image/')) { node = el('img'); node.style.cssText = 'max-width:100%;max-height:520px'; } else if (f.type.startsWith('video/')) { node = el('video'); node.controls = true; node.style.cssText = 'max-width:100%;max-height:520px'; } else { node = el('audio'); node.controls = true; node.style.margin = '60px 20px'; }
    node.src = u; node.onerror = () => { stage.replaceChildren(el('div', 'muted', 'This file type cannot be shown here.')); }; stage.append(node); cap.textContent = `${idx + 1} / ${files.length}  ·  ${f.name}  ·  ${(f.size / 1048576).toFixed(1)} MB`;
  };
  pick.onchange = () => { urls.forEach((u) => URL.revokeObjectURL(u)); files = [...pick.files].slice(0, 500); urls = files.map((f) => URL.createObjectURL(f)); idx = 0; show(); pick.value = ''; };
  const go = (d) => { if (!files.length) return; idx = (idx + d + files.length) % files.length; show(); };
  const slide = mkBtn('Slideshow', '', () => { if (slide._t) { clearInterval(slide._t); slide._t = null; slide.textContent = 'Slideshow'; return; } slide.textContent = 'Stop slideshow'; slide._t = setInterval(() => { if (!alive(box)) { clearInterval(slide._t); return; } go(1); }, 3000); });
  box.append(row(mkBtn('Open files...', 'primary', () => pick.click()), mkBtn('◀ Previous', '', () => go(-1)), mkBtn('Next ▶', '', () => go(1)), slide), stage, cap, pick);
};

/* ---------- Symbols (Character map) ---------- */
CUSTOM.symbols = (box) => {
  box.style.gap = '8px';
  const SETS = { 'Arrows': '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔➜➤➔↩↪⟲⟳', 'Math': '±×÷≠≈≤≥∞√∑∏∫∂∆∇∈∉∩∪⊂⊃∀∃¬∧∨°′″‰µπΩ', 'Currency': '$€£¥₹₽₩₺฿¢₪₫₦﷼', 'Greek': 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΘΛΞΠΣΦΨΩ', 'Marks': '©®™§¶†‡•…–—‘’“”«»‹›¿¡№', 'Shapes': '■□▲△▼▽◆◇○●★☆♠♣♥♦♪♫☀☁☂☃✓✔✗✘✚❤', 'Fractions': '½⅓⅔¼¾⅕⅛⅜⅝⅞⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉', 'Emoji': '😀😂😍😎🤔😢😡👍👎👏🙏💪🔥⭐✨🎉❤️💯✅❌⚡🌙☕🍕🎮🚀' };
  const out = el('input', 'filter'); out.placeholder = 'Click symbols to collect them here, then copy'; const g = el('div'); g.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
  const chips = el('div', 'store-chips'); let cur = 'Arrows';
  const draw = () => { chips.replaceChildren(); Object.keys(SETS).forEach((k) => { const b = el('button', 'chip' + (k === cur ? ' on' : ''), k); b.onclick = () => { cur = k; draw(); }; chips.append(b); }); g.replaceChildren(); [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(SETS[cur])].map((s) => s.segment).forEach((c) => { const b = el('button', 'btn', c); b.style.cssText = 'width:42px;height:42px;font-size:20px;padding:0'; b.onclick = () => { out.value += c; }; g.append(b); }); };
  draw();
  box.append(chips, g, row(out, mkBtn('Copy', 'primary', async () => { try { await navigator.clipboard.writeText(out.value); toast('Copied'); } catch (_) { out.select(); toast('Press Ctrl+C to copy', true); } }), mkBtn('Clear', '', () => { out.value = ''; })));
};
}
