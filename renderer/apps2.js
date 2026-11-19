/* More Vorynth Apps: Snap (screenshots), Cam (camera), QR, Dev kit and Dates. Loaded after apps.js. */
{
  const apDl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const B = (txt, cls, fn) => { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); if (fn) b.onclick = fn; return b; };
  const R = (...kids) => { const r = el('div', 'savebar'); r.append(...kids); return r; };
  const live = (box) => document.body.contains(box);
  const ta = (rows, ph) => { const t = el('textarea', 'filter'); t.rows = rows; t.placeholder = ph || ''; t.spellcheck = false; t.style.cssText = 'margin:0;resize:vertical;font:13px/1.45 Consolas,monospace;width:100%'; return t; };
  const field = (ph, type) => { const i = el('input', 'filter'); i.placeholder = ph || ''; if (type) i.type = type; i.style.margin = '0'; return i; };
  const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (_) { toast('Select the text and press Ctrl+C', true); } };

  /* ---------- Snap (Snipping Tool) with markup tools ---------- */
  CUSTOM.snap = (box) => {
    box.style.gap = '8px';
    const cv = el('canvas'); cv.style.cssText = 'width:100%;max-width:900px;border-radius:10px;border:1px solid var(--border);cursor:crosshair;display:none;touch-action:none';
    const ctx = cv.getContext('2d'); let img = null, sel = null, ops = [], tool = 'crop', cur = null, color = '#ff3b30', lw = 4;
    const hint = el('div', 'muted', 'Take a screenshot, then crop it or mark it up with a pen, boxes, arrows, text and blur for private details.');
    const S = () => Math.max(1, cv.width / 900);
    const drawOp = (c, o) => {
      c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = o.c; c.fillStyle = o.c; c.lineWidth = (o.lw || 4) * S();
      if (o.t === 'pen') { c.beginPath(); o.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (o.pts.length === 1) c.lineTo(o.pts[0][0] + .01, o.pts[0][1]); c.stroke(); }
      else if (o.t === 'box') c.strokeRect(o.x, o.y, o.w, o.h);
      else if (o.t === 'arrow') { const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), hl = Math.max(14, (o.lw || 4) * 4) * S(); c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke(); c.beginPath(); c.moveTo(o.x2, o.y2); c.lineTo(o.x2 - hl * Math.cos(a - .45), o.y2 - hl * Math.sin(a - .45)); c.lineTo(o.x2 - hl * Math.cos(a + .45), o.y2 - hl * Math.sin(a + .45)); c.closePath(); c.fill(); }
      else if (o.t === 'blur') { const x = Math.max(0, Math.round(o.x)), y = Math.max(0, Math.round(o.y)), w = Math.min(img.width - x, Math.round(o.w)), h = Math.min(img.height - y, Math.round(o.h)); if (w > 1 && h > 1) { const bs = Math.max(6, Math.round(Math.min(w, h) / 6)), t = document.createElement('canvas'); t.width = Math.max(1, Math.round(w / bs)); t.height = Math.max(1, Math.round(h / bs)); t.getContext('2d').drawImage(img, x, y, w, h, 0, 0, t.width, t.height); c.imageSmoothingEnabled = false; c.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); } }
      else if (o.t === 'text') { c.font = `700 ${Math.round(o.size * S())}px sans-serif`; c.textBaseline = 'top'; c.lineWidth = Math.max(2, o.size / 6) * S(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.strokeText(o.text, o.x, o.y); c.fillText(o.text, o.x, o.y); }
      c.restore();
    };
    const draw = () => { if (!img) return; cv.width = img.width; cv.height = img.height; ctx.drawImage(img, 0, 0); ops.forEach((o) => drawOp(ctx, o)); if (cur) drawOp(ctx, cur); if (sel) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.save(); ctx.beginPath(); ctx.rect(sel.x, sel.y, sel.w, sel.h); ctx.clip(); ctx.drawImage(img, 0, 0); ops.forEach((o) => drawOp(ctx, o)); ctx.restore(); ctx.strokeStyle = '#1e90ff'; ctx.lineWidth = Math.max(2, cv.width / 600); ctx.strokeRect(sel.x, sel.y, sel.w, sel.h); } };
    const load = (url) => new Promise((ok, no) => { const i = new Image(); i.onload = () => { img = i; sel = null; ops = []; cur = null; cv.style.display = 'block'; hint.style.display = 'none'; draw(); ok(); }; i.onerror = () => no(new Error('The screenshot could not be shown')); i.src = url; });
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)), Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height))]; };
    let start = null;
    cv.onpointerdown = async (e) => {
      if (!img) return; const [x, y] = pos(e);
      if (tool === 'text') { const t = await askText('Text to write on the picture'); if (t && t.trim()) { ops.push({ t: 'text', x, y, text: t.slice(0, 80), c: color, size: Math.max(16, lw * 5) }); draw(); } return; }
      cv.setPointerCapture(e.pointerId); start = [x, y];
      if (tool === 'crop') sel = null; else if (tool === 'pen') cur = { t: 'pen', pts: [[x, y]], c: color, lw }; else cur = { t: tool, c: color, lw, x, y, w: 0, h: 0, x1: x, y1: y, x2: x, y2: y };
    };
    cv.onpointermove = (e) => {
      if (!start) return; const [x, y] = pos(e);
      if (tool === 'crop') sel = { x: Math.min(start[0], x), y: Math.min(start[1], y), w: Math.abs(x - start[0]), h: Math.abs(y - start[1]) };
      else if (tool === 'pen') cur.pts.push([x, y]); else if (tool === 'arrow') { cur.x2 = x; cur.y2 = y; } else { cur.x = Math.min(start[0], x); cur.y = Math.min(start[1], y); cur.w = Math.abs(x - start[0]); cur.h = Math.abs(y - start[1]); }
      draw();
    };
    cv.onpointerup = () => { if (!start) return; start = null; if (tool === 'crop') { if (sel && (sel.w < 4 || sel.h < 4)) sel = null; } else if (cur) { const tiny = (cur.t === 'box' || cur.t === 'blur') ? (cur.w < 3 || cur.h < 3) : cur.t === 'arrow' ? Math.hypot(cur.x2 - cur.x1, cur.y2 - cur.y1) < 5 : false; if (!tiny) ops.push(cur); cur = null; } draw(); };
    const out = () => { const c = document.createElement('canvas'); const r = sel || { x: 0, y: 0, w: img.width, h: img.height }; c.width = Math.round(r.w); c.height = Math.round(r.h); const x = c.getContext('2d'); x.translate(-r.x, -r.y); x.drawImage(img, 0, 0); ops.forEach((o) => drawOp(x, o)); return c; };
    const delay = el('select', 'filter'); delay.style.width = 'auto'; [0, 3, 5, 10].forEach((d) => delay.append(Object.assign(el('option', '', d ? `Wait ${d} seconds` : 'No delay'), { value: d })));
    const status = el('div', 'sub', '');
    const take = async () => { try { const d = Number(delay.value); if (d) { for (let k = d; k > 0; k--) { status.textContent = `Capturing in ${k}...`; await new Promise((r) => setTimeout(r, 1000)); } } status.textContent = 'Vorynth hides for a moment...'; const r = await call('screenSnap'); await load(r.dataUrl); status.textContent = `${r.w} x ${r.h} px. Pick a tool below, or drag with Crop to choose an area.`; } catch (e) { status.textContent = ''; toast(errText(e), true); } };
    const need = () => { if (!img) { toast('Take a screenshot first', true); return false; } return true; };
    const open = el('input'); open.type = 'file'; open.accept = 'image/*'; open.style.display = 'none'; open.onchange = () => { const f = open.files[0]; if (!f) return; const u = URL.createObjectURL(f); load(u).then(() => URL.revokeObjectURL(u)).catch((e) => toast(errText(e), true)); open.value = ''; };
    const tools = el('div', 'store-chips'); const tb = {}; [['crop', '✂ Crop'], ['pen', '✏ Pen'], ['box', '⬜ Box'], ['arrow', '➜ Arrow'], ['text', 'T Text'], ['blur', '▒ Blur']].forEach(([k, l]) => { const b = el('button', 'chip' + (k === tool ? ' on' : ''), l); b.dataset.tool = k; b.onclick = () => { tool = k; Object.values(tb).forEach((x) => x.classList.remove('on')); b.classList.add('on'); cv.style.cursor = k === 'text' ? 'text' : 'crosshair'; }; tb[k] = b; tools.append(b); });
    const col = el('input'); col.type = 'color'; col.value = color; col.oninput = () => { color = col.value; }; const sz = el('input'); sz.type = 'range'; sz.min = 2; sz.max = 14; sz.value = lw; sz.oninput = () => { lw = Number(sz.value); };
    box.append(R(B('📸 Take screenshot', 'primary', take), delay, B('Open image...', '', () => open.click()), B('Copy', '', async () => { if (!need()) return; try { await call('clipImage', { dataUrl: out().toDataURL('image/png') }); toast('Copied. Paste it anywhere.'); } catch (e) { toast(errText(e), true); } }), B('Save PNG', '', () => { if (!need()) return; out().toBlob((b) => apDl(b, 'screenshot-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png'), 'image/png'); })), R(tools, col, sz, B('Undo', '', () => { if (ops.length) { ops.pop(); draw(); } else if (sel) { sel = null; draw(); } }), B('Clear marks', '', () => { ops = []; sel = null; draw(); })), status, hint, cv, open);
    window.__snapTest = { get ops() { return ops; }, get sel() { return sel; }, load, out: () => out() };
  };

  /* ---------- Cam (Camera) ---------- */
  CUSTOM.cam = (box) => {
    box.style.gap = '8px';
    const vid = el('video'); vid.autoplay = true; vid.muted = true; vid.playsInline = true; vid.style.cssText = 'width:100%;max-width:720px;border-radius:12px;background:#000;display:none'; const msg = el('div', 'sub', ''); const shots = el('div'); shots.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    let stream = null, rec = null, chunks = [], mirror = true; const devs = el('select', 'filter'); devs.style.width = 'auto';
    const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; vid.srcObject = null; vid.style.display = 'none'; };
    const start = async () => {
      stop(); try { stream = await navigator.mediaDevices.getUserMedia({ video: devs.value ? { deviceId: { exact: devs.value } } : true, audio: false }); } catch (_) { msg.textContent = 'Vorynth could not open a camera. Check that one is connected and that Camera access is on in Privacy.'; return; }
      msg.textContent = ''; vid.srcObject = stream; vid.style.display = 'block'; vid.style.transform = mirror ? 'scaleX(-1)' : ''; await vid.play().catch(() => {});
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); const cur = stream.getVideoTracks()[0].getSettings().deviceId; devs.replaceChildren(); list.forEach((d, i) => { const o = Object.assign(el('option', '', d.label || 'Camera ' + (i + 1)), { value: d.deviceId }); if (d.deviceId === cur) o.selected = true; devs.append(o); });
    };
    devs.onchange = start;
    const photo = () => { if (!stream || !vid.videoWidth) return toast('Turn the camera on first', true); const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; const x = c.getContext('2d'); if (mirror) { x.translate(c.width, 0); x.scale(-1, 1); } x.drawImage(vid, 0, 0); c.toBlob((b) => { const u = URL.createObjectURL(b); const w = el('div'); const im = el('img'); im.src = u; im.style.cssText = 'height:90px;border-radius:8px;display:block'; const s = B('Save', '', () => apDl(b, 'photo-' + Date.now() + '.png')); const d = B('✕', '', () => { URL.revokeObjectURL(u); w.remove(); }); w.append(im, R(s, d)); shots.prepend(w); }, 'image/png'); };
    const recB = B('⏺ Record video', '', () => {
      if (rec) { rec.stop(); return; } if (!stream) return toast('Turn the camera on first', true); chunks = []; rec = new MediaRecorder(stream); rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => { const b = new Blob(chunks, { type: rec.mimeType || 'video/webm' }); rec = null; recB.textContent = '⏺ Record video'; const u = URL.createObjectURL(b); const w = el('div'); const v = el('video'); v.src = u; v.controls = true; v.style.cssText = 'height:120px;border-radius:8px;display:block'; w.append(v, R(B('Save', '', () => apDl(b, 'video-' + Date.now() + '.webm')), B('✕', '', () => { URL.revokeObjectURL(u); w.remove(); }))); shots.prepend(w); };
      rec.start(); recB.textContent = '■ Stop recording';
    });
    const mir = el('input'); mir.type = 'checkbox'; mir.checked = true; mir.onchange = () => { mirror = mir.checked; vid.style.transform = mirror ? 'scaleX(-1)' : ''; }; const ml = el('label', 'sub'); ml.append(mir, ' Mirror');
    box.append(R(B('Turn camera on', 'primary', start), B('Turn off', '', () => { if (rec) rec.stop(); stop(); }), devs, ml), msg, vid, R(B('📷 Take photo', '', photo), recB), shots);
    const t = setInterval(() => { if (!live(box)) { clearInterval(t); if (rec) try { rec.stop(); } catch (_) {} stop(); } }, 1000);
  };

  /* ---------- QR ---------- */
  CUSTOM.qr = (box) => {
    box.style.gap = '8px';
    const inp = ta(3, 'Type a link, text, phone number or anything else...'); const img = el('img'); img.style.cssText = 'width:240px;height:240px;background:#fff;border-radius:10px;padding:8px;display:none'; let svg = '';
    const err = el('div', 'store-err', ''); let t = null;
    const make = async () => { err.textContent = ''; if (!inp.value.trim()) { img.style.display = 'none'; svg = ''; return; } if (inp.value.length > 1000) { err.textContent = 'That is too long for a QR code (limit 1000 characters).'; return; } try { svg = await call('qrMake', { text: inp.value }); img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); img.style.display = 'block'; } catch (e) { err.textContent = errText(e); } };
    inp.oninput = () => { clearTimeout(t); t = setTimeout(make, 250); };
    const png = () => { if (!svg) return toast('Type something first', true); const i = new Image(); i.onerror = () => toast('Could not make the picture', true); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1024, 1024); x.imageSmoothingEnabled = false; x.drawImage(i, 0, 0, 1024, 1024); c.toBlob((b) => apDl(b, 'qr.png'), 'image/png'); }; i.src = img.src; };
    box.append(inp, err, img, R(B('Save PNG', 'primary', png), B('Save SVG', '', () => { if (!svg) return toast('Type something first', true); apDl(new Blob([svg], { type: 'image/svg+xml' }), 'qr.svg'); })));
  };

  /* ---------- Dev kit ---------- */
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64enc = (s) => { const by = new TextEncoder().encode(s); let bin = ''; by.forEach((x) => { bin += String.fromCharCode(x); }); return btoa(bin); };
  const b64dec = (s) => { const bin = atob(s.trim().replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
  const parseColor = (v) => { v = v.trim(); let m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v); if (m) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4), 16)]; } m = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i.exec(v); if (m && m.slice(1).every((n) => Number(n) <= 255)) return m.slice(1).map(Number); return null; };
  const toHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  CUSTOM.devkit = (box) => {
    box.style.gap = '8px'; const TABS = ['JSON', 'Base64', 'URL', 'Hash', 'UUID', 'Regex', 'Color', 'Time', 'Text', 'Diff']; let tab = 'JSON'; const chips = el('div', 'store-chips'); const body = el('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const IO = (btns) => { const i = ta(6, 'Input'), o = ta(6, 'Result'); o.readOnly = true; const err = el('div', 'store-err', ''); const run = (fn) => async () => { err.textContent = ''; try { o.value = await fn(i.value); } catch (e) { o.value = ''; err.textContent = e.message; } }; body.append(i, R(...btns.map(([l, fn, c]) => B(l, c || '', run(fn))), B('Copy result', '', () => copyText(o.value))), err, o); return i; };
    const tabs = {
      JSON: () => IO([['Format', (s) => JSON.stringify(JSON.parse(s), null, 2), 'primary'], ['Minify', (s) => JSON.stringify(JSON.parse(s))], ['Validate', (s) => { JSON.parse(s); return 'Valid JSON'; }]]),
      Base64: () => IO([['Encode', (s) => b64enc(s), 'primary'], ['Decode', (s) => { try { return b64dec(s); } catch (_) { throw new Error('That is not valid Base64 text'); } }]]),
      URL: () => IO([['Encode', (s) => encodeURIComponent(s), 'primary'], ['Decode', (s) => { try { return decodeURIComponent(s); } catch (_) { throw new Error('That is not a valid encoded URL'); } }]]),
      Hash: () => IO(['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].map((a, k) => [a, async (s) => hex(await crypto.subtle.digest(a, new TextEncoder().encode(s))), k === 1 ? 'primary' : ''])),
      UUID: () => { const o = ta(8, ''); o.readOnly = true; const gen = () => { o.value = Array.from({ length: 8 }, () => crypto.randomUUID()).join('\n'); }; body.append(R(B('Generate 8 new IDs', 'primary', gen), B('Copy', '', () => copyText(o.value))), o); gen(); },
      Regex: () => {
        const pat = field('Pattern, for example \\d+'), fl = field('Flags (gi)'); fl.value = 'g'; fl.style.maxWidth = '100px'; const txt = ta(6, 'Text to search'); const out = el('div'); const err = el('div', 'store-err', '');
        const go = () => { out.replaceChildren(); err.textContent = ''; if (!pat.value) return; if (txt.value.length > 20000) { err.textContent = 'Text is too long to test here (limit 20,000 characters).'; return; } try { const re = new RegExp(pat.value, fl.value.replace(/[^dgimsuy]/g, '')); const ms = []; if (re.global) { let m; while ((m = re.exec(txt.value)) && ms.length < 200) { ms.push(m); if (m[0] === '') re.lastIndex++; } } else { const m = re.exec(txt.value); if (m) ms.push(m); } out.append(el('div', 'sub', ms.length + ' match' + (ms.length === 1 ? '' : 'es'))); ms.forEach((m) => out.append(el('div', 'list-row', `"${m[0]}" at ${m.index}` + (m.length > 1 ? '  groups: ' + m.slice(1).map((g) => JSON.stringify(g)).join(', ') : '')))); } catch (e) { err.textContent = e.message; } };
        [pat, fl, txt].forEach((x) => { x.oninput = go; }); body.append(R(pat, fl), txt, err, out);
      },
      Color: () => {
        const inp = field('#1e90ff or rgb(30,144,255)'); inp.value = '#1e90ff'; const pk = el('input'); pk.type = 'color'; pk.value = '#1e90ff'; const out = el('div'); const sw = el('div'); sw.style.cssText = 'height:50px;border-radius:10px;border:1px solid var(--border)';
        const go = () => { out.replaceChildren(); const c = parseColor(inp.value); if (!c) { out.append(el('div', 'store-err', 'Not a colour. Try #1e90ff or rgb(30, 144, 255).')); return; } sw.style.background = `rgb(${c})`; const h = '#' + c.map((n) => n.toString(16).padStart(2, '0')).join(''); pk.value = h;
          [['HEX', h], ['RGB', `rgb(${c.join(', ')})`], ['HSL', toHsl(c)]].forEach(([k, v]) => { const r = el('div', 'list-row'); r.append(el('div', '', `${k}   ${v}`), B('Copy', '', () => copyText(v))); out.append(r); });
          [['white', [255, 255, 255]], ['black', [0, 0, 0]]].forEach(([n, b]) => { const r = contrast(c, b); out.append(el('div', 'sub', `Text contrast against ${n}: ${r.toFixed(2)}:1 ${r >= 7 ? '(excellent)' : r >= 4.5 ? '(good for normal text)' : r >= 3 ? '(large text only)' : '(too low)'}`)); }); };
        inp.oninput = go; pk.oninput = () => { inp.value = pk.value; go(); }; body.append(R(inp, pk), sw, out); go();
      },
      Time: () => {
        const u = field('Unix timestamp (seconds or milliseconds)', 'number'), d = field('', 'datetime-local'); const out = el('div', 'sub', ''); const now = B('Now', '', () => { u.value = Math.floor(Date.now() / 1000); go(); });
        const go = () => { const n = Number(u.value); if (u.value && Number.isFinite(n)) { const ms = Math.abs(n) > 1e11 ? n : n * 1000; const dt = new Date(ms); out.textContent = isNaN(dt) ? 'Out of range' : `${dt.toLocaleString()}  ·  UTC ${dt.toISOString()}`; } else out.textContent = ''; };
        u.oninput = go; d.onchange = () => { const t = new Date(d.value).getTime(); if (!isNaN(t)) { u.value = Math.floor(t / 1000); go(); } };
        body.append(R(u, now), el('div', 'sub', 'Or pick a date and time:'), d, out); u.value = Math.floor(Date.now() / 1000); go();
      },
      Diff: () => {
        const a = ta(7, 'Original text'), b = ta(7, 'Changed text'); const out = el('div'); out.style.cssText = 'font:13px/1.5 Consolas,monospace;white-space:pre-wrap;word-break:break-word'; const sum = el('div', 'sub', '');
        const go = () => {
          out.replaceChildren(); const x = a.value.split('\n'), y = b.value.split('\n'); if (x.length > 1500 || y.length > 1500) { sum.textContent = 'Too many lines to compare here (limit 1,500 each).'; return; }
          const n = x.length, m = y.length, L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
          let i = 0, j = 0, add = 0, del = 0; const row = (t, c, bg) => { const d = el('div', '', t + ' ' + c); if (bg) d.style.background = bg; out.append(d); };
          while (i < n || j < m) { if (i < n && j < m && x[i] === y[j]) { row(' ', x[i]); i++; j++; } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { row('+', y[j], 'rgba(76,217,100,.18)'); add++; j++; } else { row('−', x[i], 'rgba(255,107,107,.18)'); del++; i++; } }
          sum.textContent = add || del ? `${add} line${add === 1 ? '' : 's'} added, ${del} removed` : 'The two texts are identical';
        };
        a.oninput = go; b.oninput = go; body.append(a, b, sum, out);
      },
      Text: () => {
        const i = ta(8, 'Paste text here'); const st = el('div', 'sub', ''); const upd = () => { const t = i.value; st.textContent = `${t.length} characters · ${t.trim() ? t.trim().split(/\s+/).length : 0} words · ${t ? t.split('\n').length : 0} lines`; }; i.oninput = upd;
        const op = (fn) => () => { i.value = fn(i.value); upd(); };
        body.append(i, st, R(B('UPPERCASE', '', op((s) => s.toUpperCase())), B('lowercase', '', op((s) => s.toLowerCase())), B('Title Case', '', op((s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))), B('Sort lines', '', op((s) => s.split('\n').sort((a, b) => a.localeCompare(b)).join('\n'))), B('Remove duplicates', '', op((s) => [...new Set(s.split('\n'))].join('\n'))), B('Remove empty lines', '', op((s) => s.split('\n').filter((l) => l.trim()).join('\n'))), B('Trim spaces', '', op((s) => s.split('\n').map((l) => l.trim()).join('\n'))), B('Copy', 'primary', () => copyText(i.value))));
      }
    };
    const draw = () => { chips.replaceChildren(); TABS.forEach((t) => { const b = el('button', 'chip' + (t === tab ? ' on' : ''), t); b.onclick = () => { tab = t; draw(); }; chips.append(b); }); body.replaceChildren(); tabs[tab](); };
    box.append(chips, body); draw();
  };

  /* ---------- Dates ---------- */
  CUSTOM.dates = (box) => {
    box.style.gap = '10px'; const day = 86400000; const iso = (d) => d.toISOString().slice(0, 10); const today = new Date(); today.setHours(12, 0, 0, 0); const parse = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null; const d = new Date(v + 'T12:00:00'); return isNaN(d) ? null : d; };
    const card = (title) => { const c = el('div', 'card column'); c.style.cssText = 'display:flex;flex-direction:column;gap:8px'; c.append(el('div', 'label', title)); box.append(c); return c; };
    const dInput = (v) => { const i = field('', 'date'); i.value = v; return i; };
    // difference
    { const c = card('How many days between two dates'); const a = dInput(iso(today)), b = dInput(iso(new Date(today.getTime() + 30 * day))); const out = el('div'); const go = () => { const x = parse(a.value), y = parse(b.value); if (!x || !y) { out.textContent = 'Pick both dates'; return; } const n = Math.round((y - x) / day); const ab = Math.abs(n); let months = (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); const lo = n < 0 ? y : x; const hi = n < 0 ? x : y; months = Math.abs(months); const probe = new Date(lo); probe.setMonth(probe.getMonth() + months); if (probe > hi) months--; out.textContent = `${ab} day${ab === 1 ? '' : 's'} (${Math.floor(ab / 7)} weeks and ${ab % 7} days, about ${months} months)${n < 0 ? ' · the second date is earlier' : ''}`; }; [a, b].forEach((x) => { x.oninput = go; }); c.append(R(a, el('span', 'sub', 'to'), b), out); go(); }
    // add days
    { const c = card('Add or subtract days'); const a = dInput(iso(today)), n = field('Days', 'number'); n.value = 90; n.style.maxWidth = '100px'; const out = el('div'); const go = () => { const x = parse(a.value), k = parseInt(n.value, 10); if (!x || !Number.isFinite(k) || Math.abs(k) > 3650000) { out.textContent = 'Pick a date and a number of days (negative goes back)'; return; } const r = new Date(x.getTime() + k * day); out.textContent = `${r.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`; }; [a, n].forEach((x) => { x.oninput = go; }); c.append(R(a, el('span', 'sub', '+'), n, el('span', 'sub', 'days')), out); go(); }
    // age
    { const c = card('Age calculator'); const a = dInput('1995-06-15'); const out = el('div'); const go = () => { const x = parse(a.value); if (!x || x > today) { out.textContent = 'Pick a birth date in the past'; return; } let y = today.getFullYear() - x.getFullYear(), m = today.getMonth() - x.getMonth(), d = today.getDate() - x.getDate(); if (d < 0) { m--; d += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); } if (m < 0) { y--; m += 12; } const next = new Date(today.getFullYear(), x.getMonth(), x.getDate(), 12); if (next < today) next.setFullYear(next.getFullYear() + 1); out.textContent = `${y} years, ${m} months, ${d} days old · ${Math.round((today - x) / day).toLocaleString()} days alive · next birthday in ${Math.round((next - today) / day)} days`; }; a.oninput = go; c.append(a, out); go(); }
    // countdown
    { const c = card('Countdown to a date'); const a = dInput(iso(new Date(today.getTime() + 100 * day))); const out = el('div'); const go = () => { const x = parse(a.value); if (!x) { out.textContent = 'Pick a date'; return; } const n = Math.round((x - today) / day); out.textContent = n === 0 ? 'That is today' : n > 0 ? `${n} day${n === 1 ? '' : 's'} to go (${x.toLocaleDateString([], { weekday: 'long' })})` : `${-n} day${n === -1 ? '' : 's'} ago`; }; a.oninput = go; c.append(a, out); go(); }
  };
}
