/* Vorynth Toolkit: PC Doctor, Drop, network kit, PDF and ZIP tools, QR scanner, disk speed and an encrypted Vault. */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const R = (...k) => { const r = el('div', 'savebar'); r.append(...k); return r; };
  const F = (ph, type) => { const i = el('input', 'filter'); i.placeholder = ph || ''; if (type) i.type = type; i.style.margin = '0'; return i; };
  const sel = (opts, val) => { const s = el('select', 'filter'); s.style.width = 'auto'; opts.forEach(([v, l]) => s.append(Object.assign(el('option', '', l), { value: v }))); if (val != null) s.value = val; return s; };
  const live = (box) => { if (box.isConnected) { box._seen = true; return true; } if (!box._t0) box._t0 = Date.now(); return !box._seen && Date.now() - box._t0 < 3000; };
  const cp = async (t) => { try { await navigator.clipboard.writeText(String(t)); toast('Copied'); } catch (_) { toast('Select the text and press Ctrl+C', true); } };
  const bytes = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(0) + ' MB' : (n / 1024).toFixed(0) + ' KB');
  const err = (e) => toast(errText(e), true);
  const P = (window.auroraPro = {});

  /* ---------- PC Doctor ---------- */
  // pure scoring so it can be tested: input = readings, output = findings + score
  P.diagnose = (d) => {
    const f = []; const add = (level, title, detail, fix) => f.push({ level, title, detail, fix }); let score = 100; const hit = (n) => { score -= n; };
    if (d.ramTotal) { const p = d.ramUsed / d.ramTotal * 100; if (p >= 90) { hit(15); add('bad', 'Memory is almost full', `${Math.round(p)}% of RAM is in use. Close heavy apps or restart.`, ['toolbox', 'processes']); } else if (p >= 80) { hit(7); add('warn', 'Memory use is high', `${Math.round(p)}% of RAM is in use.`, ['toolbox', 'processes']); } else add('ok', 'Memory is fine', `${Math.round(p)}% of RAM in use.`); }
    if (Number.isFinite(d.cpu)) { if (d.cpu >= 90) { hit(10); add('bad', 'The processor is busy', `${d.cpu}% right now. Look for the app using it.`, ['toolbox', 'processes']); } else if (d.cpu >= 75) { hit(4); add('warn', 'The processor is fairly busy', `${d.cpu}% right now.`, ['toolbox', 'processes']); } else add('ok', 'Processor load is normal', `${d.cpu}% right now.`); }
    (d.drives || []).forEach((v) => { const total = v.used + v.free; if (!total) return; const free = v.free / total * 100; if (free < 10) { hit(20); add('bad', `Drive ${v.name}: is nearly full`, `Only ${Math.round(free)}% free (${bytes(v.free)}). Windows slows down when a drive is this full.`, ['toolbox', 'diskanalyzer']); } else if (free < 15) { hit(8); add('warn', `Drive ${v.name}: is getting full`, `${Math.round(free)}% free (${bytes(v.free)}).`, ['toolbox', 'diskanalyzer']); } else add('ok', `Drive ${v.name}: has room`, `${Math.round(free)}% free (${bytes(v.free)}).`); });
    if (d.temp >= 2 * 1073741824) { hit(6); add('warn', 'Lots of temporary files', `${bytes(d.temp)} can be cleaned safely.`, ['toolbox', 'cleanup']); } else if (d.temp >= 1073741824) { hit(3); add('warn', 'Some temporary files to clean', `${bytes(d.temp)}.`, ['toolbox', 'cleanup']); } else if (d.temp != null) add('ok', 'Temporary files are small', bytes(d.temp) + '.');
    if (d.recycle >= 2 * 1073741824) { hit(2); add('warn', 'The Recycle Bin is large', `${bytes(d.recycle)} is waiting to be emptied.`, ['toolbox', 'cleanup']); }
    if (d.startupOn != null) { if (d.startupOn > 20) { hit(15); add('bad', 'Too many startup apps', `${d.startupOn} apps start with Windows. This slows every boot.`, ['apps', 'startupmgr']); } else if (d.startupOn > 12) { hit(8); add('warn', 'Many startup apps', `${d.startupOn} apps start with Windows.`, ['apps', 'startupmgr']); } else add('ok', 'Startup list is lean', `${d.startupOn} apps start with Windows.`); }
    if (d.problems > 0) { hit(Math.min(15, d.problems * 5)); add('bad', `${d.problems} device problem${d.problems === 1 ? '' : 's'}`, 'Windows reports devices with errors.', ['devices', 'deviceproblems']); } else if (d.problems === 0) add('ok', 'No device problems', 'Every device reports healthy.');
    if (d.reboot) { hit(5); add('warn', 'A restart is waiting', 'Updates need a restart to finish.', ['update', 'wuinstall']); }
    if (d.uptimeDays >= 14) { hit(4); add('warn', 'Your PC has not restarted for a while', `${Math.floor(d.uptimeDays)} days. A restart clears memory leaks.`, null); } else if (d.uptimeDays != null) add('ok', 'Restarted recently', `Up for ${d.uptimeDays < 1 ? 'less than a day' : Math.floor(d.uptimeDays) + ' day(s)'}.`);
    score = Math.max(0, Math.min(100, score)); const rank = { bad: 0, warn: 1, ok: 2 }; f.sort((a, b) => rank[a.level] - rank[b.level]);
    return { score, grade: score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs attention' : 'Needs help', findings: f };
  };
  CUSTOM.doctor = (box) => {
    box.style.gap = '8px'; const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const run = async (btn) => {
      btn.disabled = true; btn.textContent = 'Checking...'; out.replaceChildren(el('div', 'sub', 'Looking at memory, drives, startup apps, devices and updates...'));
      const g = async (n, a) => { try { return await call(n, a); } catch (_) { return undefined; } };
      const [st, dr, tmp, rec, su, dp, wu] = await Promise.all([g('stats'), g('drives'), g('tempSize'), g('recycleSize'), g('startupList'), g('deviceProblems'), g('wuInfo')]);
      const d = { cpu: st && st.cpu, ramUsed: st && st.ramUsed, ramTotal: st && st.ramTotal, uptimeDays: st && st.uptime != null ? st.uptime / 86400 : undefined, drives: dr || [], temp: typeof tmp === 'number' ? tmp : undefined, recycle: typeof rec === 'number' ? rec : undefined, startupOn: Array.isArray(su) ? su.filter((x) => x.enabled).length : undefined, problems: Array.isArray(dp) ? dp.length : undefined, reboot: wu && wu.reboot };
      const r = P.diagnose(d); out.replaceChildren();
      const hd = el('div', 'doc-score'); hd.append(el('div', 'doc-num', String(r.score)), el('div', '', r.grade)); hd.dataset.level = r.score >= 75 ? 'ok' : r.score >= 55 ? 'warn' : 'bad'; out.append(hd);
      r.findings.forEach((x) => { const row = el('div', 'list-row doc-' + x.level); const l = el('div'); l.append(el('div', '', ({ ok: '✅ ', warn: '⚠️ ', bad: '❌ ' })[x.level] + x.title), el('div', 'sub', x.detail)); row.append(l); if (x.fix) row.append(B('Fix it', '', () => go(x.fix[0], x.fix[1]))); out.append(row); });
      if (!r.findings.length) out.append(el('div', 'muted', 'No readings were available on this PC.')); btn.disabled = false; btn.textContent = 'Check again';
    };
    const b = B('🩺 Check my PC', 'primary'); b.onclick = () => run(b); box.append(el('div', 'muted', 'A quick health check with plain-language advice and a button to fix each problem. Nothing is changed until you press "Fix it" and act.'), R(b), out);
  };

  /* ---------- Drop ---------- */
  CUSTOM.drop = (box) => {
    box.style.gap = '10px'; let timer = null, lastKey = null, countdown = null; const once = el('input'); once.type = 'checkbox'; once.checked = true; const ol = el('label', 'sub'); ol.append(once, ' Stop after the first download');
    const enc = el('input'); enc.type = 'checkbox'; enc.checked = true; const el2 = el('label', 'sub'); el2.append(enc, ' 🔒 End-to-end encrypt the file (recommended)');
    const left = (s) => { const mins = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 60000)); return `${s.downloads} download${s.downloads === 1 ? '' : 's'} so far · stops in about ${mins} min${s.once ? ' or after the first download' : ''}`; };
    const draw = async (force) => {
      let s; try { s = await call('dropStatus'); } catch (_) { return fail(box); }
      const key = JSON.stringify(s.active ? [s.name, s.size, s.downloads, s.urls, s.once, s.encrypted] : 'idle');
      if (!force && key === lastKey) { if (countdown && s.active) countdown.textContent = left(s); return; } // nothing changed: keep the page still so buttons never move under your pointer
      const act = document.activeElement; if (!force && act && box.contains(act) && act.tagName === 'INPUT' && act.type !== 'checkbox') return; lastKey = key; countdown = null;
      box.replaceChildren(); box.append(el('div', 'muted', 'Send a file to your phone or another PC on the same Wi-Fi without cables, accounts or the internet. Vorynth makes a private link and a QR code. Scan it and the file downloads.'));
      if (!s.active) { box.append(R(B('📤 Choose a file and share', 'primary', async () => { try { const r = await call('dropStart', { once: once.checked, encrypt: enc.checked }); if (r) toast('Sharing ' + r.name); } catch (e) { err(e); } draw(true); }), ol, el2), el('div', 'sub', 'Only that one file is shared, and the link stops working when sharing stops (15 minutes at most). With encryption on, the file is scrambled on this PC with a one-time key that lives only inside the link, so anyone watching your network sees unreadable data. Share the link or QR code only with the person you mean to. Turn encryption off only for devices that cannot open the link in a browser.')); return; }
      box.append(el('div', 'label', `${s.encrypted ? '🔒 ' : ''}Sharing ${s.name} (${bytes(s.size)})`)); countdown = el('div', 'sub', left(s)); box.append(countdown);
      box.append(el('div', s.encrypted ? 'store-ok' : 'store-err', s.encrypted ? `End-to-end encrypted. Both of you can check the code ${s.fingerprint} matches. The key is part of the link after the # sign, so send the whole link.` : 'Not encrypted: anyone on this network who sees the link or the traffic can read the file.'));
      const row = el('div'); row.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap'; for (const u of s.urls.slice(0, 3)) { const c = el('div'); c.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-width:260px'; const img = el('img'); img.style.cssText = 'width:200px;height:200px;background:#fff;border-radius:10px;padding:6px'; call('qrMake', { text: u }).then((svg) => { img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }).catch(() => {}); const t = el('div', 'sub', u); t.style.wordBreak = 'break-all'; c.append(img, t, B('Copy link', '', () => cp(u))); row.append(c); } box.append(row);
      box.append(R(B('■ Stop sharing', 'danger', async () => { await call('dropStop'); draw(true); })));
    };
    timer = setInterval(() => { if (!live(box)) clearInterval(timer); else draw(false); }, 2000); draw(true);
  };

  /* ---------- Bluetooth audio and LDAC (lib/btaudio.js) ---------- */
  CUSTOM.btaudio = (box) => {
    box.style.gap = '10px'; let busy = false;
    const draw = async () => {
      let d; try { d = await call('btAudioInfo'); } catch (e) { return box.replaceChildren(el('div', 'store-err', errText(e))); }
      box.replaceChildren();
      if (d.platform === 'linux') {
        if (!d.supported) return box.append(el('div', 'muted', d.reason || 'Bluetooth audio is not available.'));
        if (d.help) box.append(el('div', d.cards.length ? 'store-err' : 'muted', d.help));
        d.cards.forEach((c) => {
          const card = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', '🎧 ' + c.name), el('div', 'sub', c.address + ' · now using: ' + (c.activeCodec ? c.activeCodec.toUpperCase().replace('_', ' ') : c.active)));
          const acts = el('div'); acts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
          c.profiles.filter((p) => /^a2dp-sink/.test(p.id)).forEach((p) => { const on = p.id === c.active; const name = p.codec && p.codec !== 'sbc_or_default' ? p.codec.toUpperCase().replace('_', ' ') : 'Standard (SBC/AAC)'; const b = el('button', 'btn' + (on ? ' primary' : ''), (p.codec === 'ldac' ? '💎 ' : '') + name + (on ? ' ✓' : '')); b.disabled = on || !p.available; b.title = p.available ? p.label : 'Not available right now'; b.onclick = async () => { if (busy) return; busy = true; b.disabled = true; try { await call('btAudioSetProfile', { card: c.card, profile: p.id }); toast('Switched to ' + name); } catch (e) { toast(errText(e), true); } busy = false; draw(); }; acts.append(b); });
          card.append(l, acts); box.append(card);
        });
        box.append(el('div', 'sub', 'LDAC needs headphones that support it and the LDAC module for your audio system. Higher quality uses more bandwidth, so if audio stutters, switch to a lower mode.'));
        const re = el('button', 'btn', '🔄 Refresh'); re.onclick = draw; box.append(re); return;
      }
      const g = d.guide || {}; box.append(el('div', 'store-err', '⚠️ ' + (g.summary || 'Codec control is not available here.')));
      if (d.radio) box.append(el('div', 'sub', 'Bluetooth adapter: ' + d.radio));
      if (d.devices && d.devices.length) { box.append(el('div', 'label', 'Bluetooth audio devices Windows can see')); d.devices.forEach((x) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', '🎧 ' + x.name), el('div', 'sub', x.likelyLdac ? 'This model supports LDAC, but Windows will use SBC or AAC with it.' : 'Codec in use is not reported by Windows.')); r.append(l); box.append(r); }); } else box.append(el('div', 'muted', 'No Bluetooth audio device was found. Connect your headphones first.'));
      box.append(el('div', 'label', 'How to get high-quality Bluetooth audio'));
      (g.options || []).forEach((o) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', o.title), el('div', 'sub', o.body)); r.append(l); box.append(r); });
      (g.tips || []).forEach((t) => box.append(el('div', 'sub', '💡 ' + t)));
      const row = el('div', 'savebar'); const b1 = el('button', 'btn primary', 'Bluetooth settings'), b2 = el('button', 'btn', 'Sound settings'), b3 = el('button', 'btn', '🔄 Refresh');
      b1.onclick = () => call('btAudioOpenSettings', { which: 'bluetooth' }).catch((e) => toast(errText(e), true)); b2.onclick = () => call('btAudioOpenSettings', { which: 'sound' }).catch((e) => toast(errText(e), true)); b3.onclick = draw; row.append(b1, b2, b3); box.append(row);
    };
    draw();
  };

  /* ---------- File lock: password-protect any file (lib/e2ee.js) ---------- */
  CUSTOM.filelock = (box) => {
    box.style.gap = '10px';
    const note = el('div', 'sub', 'Locks one file with a password using strong modern encryption (scrypt + ChaCha20-Poly1305). The original file is not changed or deleted. There is no recovery: if you forget the password, the file cannot be opened by anyone, including Vorynth.');
    const out = el('div', 'store-ok'); out.hidden = true;
    const run = (btn, fn) => async () => { btn.disabled = true; out.hidden = true; try { await fn(); } catch (e) { out.hidden = false; out.className = 'store-err'; out.textContent = errText(e); } btn.disabled = false; };
    const enc = B('🔒 Lock a file…', 'primary', null), dec = B('🔓 Unlock a file…', '', null);
    enc.onclick = run(enc, async () => {
      const p1 = await askText('Choose a password for this file (at least 8 characters)', { password: true }); if (!p1) return; if (p1.length < 8) throw new Error('Use a password of at least 8 characters');
      const p2 = await askText('Type the password again to confirm', { password: true }); if (p2 !== p1) throw new Error('The two passwords did not match, so nothing was locked');
      const r = await call('fileLockEncrypt', { password: p1 }); if (r) { out.hidden = false; out.className = 'store-ok'; out.textContent = 'Locked copy saved: ' + r.out; toast('File locked'); }
    });
    dec.onclick = run(dec, async () => {
      const p = await askText('Enter the password for this file', { password: true }); if (!p) return;
      const r = await call('fileLockDecrypt', { password: p }); if (r) { out.hidden = false; out.className = 'store-ok'; out.textContent = 'Unlocked copy saved: ' + r.out; toast('File unlocked'); }
    });
    box.append(note, R(enc, dec), out);
  };

  /* ---------- Net kit ---------- */
  CUSTOM.netkit = (box) => {
    box.style.gap = '8px'; const TABS = ['DNS', 'Port', 'SSL', 'Web headers', 'My IP', 'Wake-on-LAN']; let tab = 'DNS'; const chips = el('div', 'store-chips'); const body = el('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:8px'; const out = el('div'); out.style.cssText = 'display:flex;flex-direction:column;gap:4px';
    const line = (k, v, cls) => { const r = el('div', 'list-row'); r.append(el('div', 'sub', k), el('div', cls || '', v)); out.append(r); };
    const task = (btn, fn) => async () => { btn.disabled = true; out.replaceChildren(el('div', 'sub', 'Working...')); try { out.replaceChildren(); await fn(); } catch (e) { out.replaceChildren(el('div', 'store-err', errText(e))); } btn.disabled = false; };
    const tabs = {
      DNS: () => { const h = F('Website or server, for example example.com'), t = sel(['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'].map((x) => [x, x])); const b = B('Look up', 'primary'); b.onclick = task(b, async () => { const r = await call('netDns', { host: h.value, type: t.value }); line('Lookup', `${r.host} · ${r.type} · ${r.ms} ms`); if (!r.records.length) line('Result', r.note || 'No records', 'sub'); r.records.forEach((x) => line(r.type, x)); }); body.append(R(h, t, b)); },
      Port: () => { const h = F('Server or IP'), p = F('Port', 'number'); p.style.maxWidth = '100px'; const b = B('Check port', 'primary'); b.onclick = task(b, async () => { const r = await call('netPort', { host: h.value, port: Number(p.value) }); line(`${r.host}:${r.port}`, r.open ? '✅ Open' : '❌ Closed', r.open ? 'store-ok' : 'store-err'); line('Detail', `${r.why} · ${r.ms} ms`); }); body.append(R(h, p, b), el('div', 'sub', 'Checks one port at a time, so it is for testing your own servers and devices.')); },
      SSL: () => { const h = F('Website, for example example.com'), p = F('Port', 'number'); p.value = 443; p.style.maxWidth = '100px'; const b = B('Check certificate', 'primary'); b.onclick = task(b, async () => { const r = await call('netSsl', { host: h.value, port: Number(p.value) }); line('Issued to', r.subject || r.host); line('Issued by', r.issuer || 'unknown'); line('Valid until', new Date(r.validTo).toLocaleDateString([], { dateStyle: 'long' })); line('Days left', String(r.daysLeft), r.daysLeft < 0 ? 'store-err' : r.daysLeft < 14 ? 'store-err' : 'store-ok'); line('Trusted by this PC', r.authorized ? '✅ Yes' : '❌ No: ' + (r.problem || 'unknown'), r.authorized ? 'store-ok' : 'store-err'); if (r.san.length) line('Also covers', r.san.join(', ').replace(/DNS:/g, '').slice(0, 300), 'sub'); }); body.append(R(h, p, b)); },
      'Web headers': () => { const h = F('Web address, for example example.com'); const b = B('Check', 'primary'); b.onclick = task(b, async () => { const r = await call('netHeaders', { url: h.value }); r.chain.forEach((c, i) => { line(`Step ${i + 1}`, `${c.status} · ${c.ms} ms · ${c.url}`, c.status >= 400 ? 'store-err' : ''); }); const last = r.chain[r.chain.length - 1].headers; ['server', 'content-type', 'strict-transport-security', 'content-security-policy', 'x-frame-options', 'cache-control'].forEach((k) => { if (last[k]) line(k, last[k], 'sub'); }); if (r.chain.length >= 6) line('Note', 'Stopped after 6 redirects (possible loop)', 'store-err'); }); body.append(R(h, b), el('div', 'sub', 'Shows the redirect chain and the main headers the server sends back.')); },
      'My IP': () => { const b = B('Show my public IP', 'primary'); b.onclick = task(b, async () => { const r = await call('netPublicIp'); line('Public IP', r.ip); out.append(B('Copy', '', () => cp(r.ip))); }); body.append(R(b), el('div', 'sub', 'This contacts api.ipify.org to ask what address the internet sees. It is the only tool here that does.')); },
      'Wake-on-LAN': () => { const m = F('MAC address, for example AA:BB:CC:DD:EE:FF'); const b = B('Send wake-up', 'primary'); b.onclick = task(b, async () => { const r = await call('netWol', { mac: m.value }); line('Sent', `${r.sent}-byte wake-up packet on your network. The PC must be off or asleep with Wake-on-LAN enabled in its settings.`); }); body.append(R(m, b)); }
    };
    const draw = () => { chips.replaceChildren(); TABS.forEach((t) => { const c = el('button', 'chip' + (t === tab ? ' on' : ''), t); c.onclick = () => { tab = t; draw(); }; chips.append(c); }); body.replaceChildren(); out.replaceChildren(); tabs[tab](); };
    box.append(chips, body, out); draw();
  };

  /* ---------- PDF toolkit ---------- */
  CUSTOM.pdf = (box) => {
    box.style.gap = '8px'; let files = [];
    const draw = () => {
      box.replaceChildren(); const pickM = B('Add PDFs...', 'primary', async () => { try { const r = await call('pdfPick', { multi: true }); r.forEach((f) => { if (f.error) toast(f.name + ': ' + f.error, true); else if (!files.some((x) => x.path === f.path)) files.push(f); }); } catch (e) { err(e); } draw(); }); box.append(R(pickM, B('Clear', '', () => { files = []; draw(); })));
      if (!files.length) return box.append(el('div', 'muted', 'Add one or more PDFs. Everything happens on this PC and the originals are never changed.'));
      files.forEach((f, i) => { const r = el('div', 'list-row'); const l = el('div'); l.append(el('div', '', f.name), el('div', 'sub', `${f.pages} page${f.pages === 1 ? '' : 's'} · ${bytes(f.size)}`)); const a = el('div'); a.style.cssText = 'display:flex;gap:6px'; a.append(B('↑', '', () => { if (i > 0) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); } }), B('↓', '', () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); } }), B('✕', '', () => { files.splice(i, 1); draw(); })); r.append(l, a); box.append(r); });
      const done = (r, what) => { if (r) toast(`${what}: ${r.path || r.dir}`); };
      box.append(R(B('Join in this order', 'primary', async () => { if (files.length < 2) return toast('Add at least 2 PDFs to join', true); try { done(await call('pdfMerge', { paths: files.map((f) => f.path) }), 'Saved'); } catch (e) { err(e); } })));
      const one = files[0]; const pg = F('Pages, for example 1-3,5'), rot = sel([[90, 'Rotate 90° right'], [180, 'Rotate 180°'], [270, 'Rotate 90° left']]);
      box.append(el('div', 'label', 'Work on the first PDF: ' + one.name), R(pg, B('Extract these pages', '', async () => { try { done(await call('pdfExtract', { path: one.path, pages: pg.value }), 'Saved'); } catch (e) { err(e); } }), rot, B('Rotate (these pages, or all if empty)', '', async () => { try { done(await call('pdfRotate', { path: one.path, degrees: Number(rot.value), pages: pg.value.trim() || undefined }), 'Saved'); } catch (e) { err(e); } }), B('Split into single pages', '', async () => { try { const r = await call('pdfSplitAll', { path: one.path }); if (r) toast(`Saved ${r.files} files to ${r.dir}`); } catch (e) { err(e); } })));
    }; draw();
  };

  /* ---------- Archive (ZIP) ---------- */
  CUSTOM.zip = (box) => {
    box.style.gap = '8px'; let items = [], opened = null;
    const draw = () => {
      box.replaceChildren(); box.append(el('div', 'label', 'Make a zip'), R(B('Add files...', 'primary', async () => { try { items.push(...(await call('zipPick', { folder: false })).filter((x) => !items.some((y) => y.path === x.path))); } catch (e) { err(e); } draw(); }), B('Add a folder...', '', async () => { try { items.push(...(await call('zipPick', { folder: true })).filter((x) => !items.some((y) => y.path === x.path))); } catch (e) { err(e); } draw(); }), B('Clear', '', () => { items = []; draw(); })));
      items.forEach((f, i) => { const r = el('div', 'list-row'); r.append(el('div', '', (f.dir ? '📁 ' : '📄 ') + f.name), B('✕', '', () => { items.splice(i, 1); draw(); })); box.append(r); });
      if (items.length) box.append(R(B('Create zip...', 'primary', async () => { try { const r = await call('zipMake', { paths: items.map((x) => x.path) }); if (r) toast(`Zipped ${r.files} file${r.files === 1 ? '' : 's'} (${bytes(r.bytes)} before compressing)`); } catch (e) { err(e); } })));
      box.append(el('div', 'label', 'Open a zip'), R(B('Open zip...', '', async () => { try { const r = await call('zipOpen'); if (r) opened = r; } catch (e) { err(e); } draw(); })));
      if (opened) { box.append(el('div', 'sub', `${opened.name}: ${opened.count} item${opened.count === 1 ? '' : 's'} · ${bytes(opened.total)} when unpacked`)); opened.entries.slice(0, 60).forEach((e) => box.append(el('div', 'list-row', (e.dir ? '📁 ' : '📄 ') + e.name + (e.dir ? '' : '   ' + bytes(e.size))))); if (opened.truncated) box.append(el('div', 'sub', 'Showing the first part of the list.')); box.append(R(B('Unpack...', 'primary', async () => { try { const r = await call('zipUnpack', { path: opened.path }); if (r) toast(`Unpacked ${r.files} files to ${r.dir}`); } catch (e) { err(e); } }))); box.append(el('div', 'sub', 'Vorynth refuses zips with unsafe paths, absurd sizes or zip-bomb ratios, and never overwrites existing files.')); }
    }; draw();
  };

  /* ---------- QR scanner ---------- */
  CUSTOM.qrscan = (box) => {
    box.style.gap = '8px'; const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.style.display = 'none'; const out = el('div'); const cv = document.createElement('canvas');
    const decode = (img) => { const k = Math.min(1, 1400 / Math.max(img.width, img.height)); cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k)); const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, cv.width, cv.height); const d = x.getImageData(0, 0, cv.width, cv.height); const r = window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' }); out.replaceChildren(); if (!r) { out.append(el('div', 'store-err', 'No QR code was found in that picture. Try a sharper or larger image.')); return; } out.append(el('div', 'label', 'Found a QR code:')); const t = el('div', 'list-row', r.data.slice(0, 2000)); t.style.wordBreak = 'break-all'; out.append(t, R(B('Copy text', 'primary', () => cp(r.data)))); if (/^https?:\/\//i.test(r.data)) out.append(el('div', 'sub', 'This is a web link. Vorynth does not open links for you, so check where it goes before you visit it.')); if (/^WIFI:/i.test(r.data)) { const m = /S:((?:\\.|[^;])*);/.exec(r.data); out.append(el('div', 'sub', 'This is a Wi-Fi code' + (m ? ' for the network "' + m[1].replace(/\\(.)/g, '$1') + '"' : '') + '.')); } };
    const load = (src, revoke) => { const im = new Image(); im.onload = () => { if (revoke) URL.revokeObjectURL(src); decode(im); }; im.onerror = () => { if (revoke) URL.revokeObjectURL(src); out.replaceChildren(el('div', 'store-err', 'That is not a picture Vorynth can read.')); }; im.src = src; };
    f.onchange = () => { const file = f.files[0]; f.value = ''; if (!file) return; if (file.size > 20 * 1048576) return toast('Pick a picture under 20 MB', true); load(URL.createObjectURL(file), true); };
    box.append(R(B('Open a picture...', 'primary', () => f.click()), B('Scan my screen', '', async () => { try { const r = await call('screenSnap'); load(r.dataUrl, false); } catch (e) { err(e); } })), out, f, el('div', 'sub', 'Reads QR codes from a photo, a screenshot or your screen (Vorynth hides for a moment). Decoding happens on this PC.'));
    window.__qrscan = { decode: (url) => load(url, false) };
  };

  /* ---------- Disk speed ---------- */
  CUSTOM.diskspeed = (box) => {
    box.style.gap = '8px'; const sz = sel([[64, '64 MB (quick)'], [256, '256 MB'], [1024, '1 GB (thorough)']], 256); const out = el('div'); const b = B('⚡ Test the disk', 'primary');
    b.onclick = async () => { b.disabled = true; out.replaceChildren(el('div', 'sub', 'Writing and reading a temporary file...')); try { const r = await call('diskSpeed', { sizeMB: Number(sz.value) }); out.replaceChildren(); [['Write', r.writeMBps], ['Read', r.readMBps]].forEach(([k, v]) => { const row = el('div'); row.append(el('div', 'label', `${k}: ${v} MB/s`)); const bar = el('div', 'bar'); const i = document.createElement('i'); i.style.width = Math.min(100, v / 35) + '%'; bar.append(i); row.append(bar); out.append(row); }); out.append(el('div', 'sub', `Tested with ${r.sizeMB} MB in your temporary folder, which is deleted afterwards. ${r.note} For reference: a hard disk is about 80-160 MB/s, a SATA SSD about 500, a modern NVMe SSD 2000 or more.`)); } catch (e) { out.replaceChildren(el('div', 'store-err', errText(e))); } b.disabled = false; };
    box.append(R(sz, b), out);
  };

  /* ---------- Vault (encrypted notes) ---------- */
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (u8) => { let s = ''; u8.forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const AAD = enc.encode('aurora-vault-v1');
  P.vaultKey = async (password, salt, iter) => crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  P.vaultSeal = async (key, salt, iter, notes) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, enc.encode(JSON.stringify(notes)))); return { v: 1, iter, salt: b64(salt), iv: b64(iv), data: b64(ct) }; };
  P.vaultOpen = async (blob, password) => { const salt = unb64(blob.salt); const key = await P.vaultKey(password, salt, blob.iter); try { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), additionalData: AAD }, key, unb64(blob.data)); const notes = JSON.parse(dec.decode(pt)); if (!Array.isArray(notes)) throw new Error('bad'); return { key, salt, notes }; } catch (_) { throw new Error('Wrong password, or the vault data was changed'); } };
  CUSTOM.vault = (box) => {
    box.style.gap = '8px'; let blob = null, session = null, cur = null, idle = null; const ITER = 600000;
    const lock = () => { session = null; cur = null; clearTimeout(idle); };
    const bump = () => { clearTimeout(idle); idle = setTimeout(() => { if (session) { lock(); toast('Vault locked after 5 minutes without use'); if (live(box)) draw(); } }, 5 * 60000); };
    const watch = setInterval(() => { if (!live(box)) { clearInterval(watch); lock(); } }, 1000);
    const persist = async () => { const sealed = await P.vaultSeal(session.key, session.salt, blob ? blob.iter : ITER, session.notes); await call('storeSet', { key: 'vault', value: sealed }); blob = sealed; };
    const draw = async () => {
      box.replaceChildren(); if (blob === undefined) { try { blob = (await call('storeGet')).vault || null; } catch (_) { return fail(box); } }
      if (!blob) { const p1 = F('Choose a password (at least 10 characters)'), p2 = F('Type it again'); p1.type = 'password'; p2.type = 'password'; const e = el('div', 'store-err', ''); const make = B('Create vault', 'primary', async () => { e.textContent = ''; if (p1.value.length < 10) return (e.textContent = 'Use at least 10 characters.'); if (p1.value !== p2.value) return (e.textContent = 'The two passwords are different.'); make.disabled = true; make.textContent = 'Creating...'; try { const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await P.vaultKey(p1.value, salt, ITER); session = { key, salt, notes: [] }; blob = { iter: ITER }; await persist(); toast('Vault created and unlocked'); bump(); } catch (x) { blob = null; session = null; e.textContent = errText(x); } draw(); });
        box.append(el('div', 'muted', 'A vault keeps private notes (passwords, codes, plans) encrypted on this PC with AES-256 and a key made from your password. Vorynth cannot read it without the password.'), el('div', 'store-err', 'There is no way to recover a forgotten password. Not even Vorynth can open the vault without it.'), p1, p2, e, R(make)); return; }
      if (!session) { const p = F('Vault password'); p.type = 'password'; const e = el('div', 'store-err', ''); const go2 = B('Unlock', 'primary', async () => { e.textContent = ''; go2.disabled = true; go2.textContent = 'Unlocking...'; try { session = await P.vaultOpen(blob, p.value); bump(); draw(); } catch (x) { e.textContent = errText(x); go2.disabled = false; go2.textContent = 'Unlock'; } }); p.onkeydown = (ev) => { if (ev.key === 'Enter') go2.click(); }; box.append(el('div', 'label', '🔒 The vault is locked'), p, e, R(go2)); return; }
      bump(); box.append(el('div', 'label', '🔓 Unlocked. It locks again after 5 idle minutes or when you leave this page.'));
      const title = F('Title'), body = el('textarea', 'filter'); body.rows = 6; body.style.cssText = 'margin:0;resize:vertical;font:inherit;width:100%'; body.placeholder = 'Private text...'; if (cur) { const n = session.notes.find((x) => x.id === cur); if (n) { title.value = n.title; body.value = n.text; } }
      const saveNote = B(cur ? 'Update note' : 'Save note', 'primary', async () => { if (!title.value.trim() && !body.value.trim()) return toast('Write something first', true); const id = cur || 'v' + Math.random().toString(36).slice(2, 10); const note = { id, title: title.value.trim().slice(0, 80) || 'Untitled', text: body.value.slice(0, 20000), t: Date.now() }; const prev = session.notes; session.notes = cur ? prev.map((x) => (x.id === cur ? note : x)) : [...prev, note]; try { await persist(); cur = id; toast('Saved (encrypted)'); } catch (x) { session.notes = prev; err(x); } draw(); });
      box.append(title, body, R(saveNote, cur ? B('New note', '', () => { cur = null; draw(); }) : '', cur ? B('Delete note', 'danger', async () => { if (!confirm('Delete this note for good?')) return; const prev = session.notes; session.notes = prev.filter((x) => x.id !== cur); try { await persist(); cur = null; } catch (x) { session.notes = prev; err(x); } draw(); }) : ''));
      [...session.notes].sort((a, b) => b.t - a.t).forEach((n) => { const r = el('div', 'list-row'); const l = el('div'); l.style.minWidth = 0; l.append(el('div', '', n.title), el('div', 'sub', n.text.replace(/\s+/g, ' ').slice(0, 60) + (n.text.length > 60 ? '…' : ''))); r.append(l, B('Open', '', () => { cur = n.id; draw(); }), B('Copy', '', () => cp(n.text))); box.append(r); });
      const np = F('New password (10+ characters)'); np.type = 'password'; box.append(R(B('Lock now', '', () => { lock(); draw(); }), np, B('Change password', '', async () => { if (np.value.length < 10) return toast('Use at least 10 characters', true); try { const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await P.vaultKey(np.value, salt, ITER); const old = session; session = { key, salt, notes: old.notes }; blob = { iter: ITER }; await persist(); toast('Password changed'); np.value = ''; } catch (x) { err(x); } draw(); }), B('Delete the whole vault', 'danger', async () => { if (!confirm('Delete the vault and ALL its notes? This cannot be undone.')) return; try { await call('storeSet', { key: 'vault', value: null }); blob = null; lock(); toast('Vault deleted'); } catch (x) { err(x); } draw(); })));
    };
    blob = undefined; draw();
  };

  /* ---------- Full backup of your Vorynth data (optionally password-protected) ---------- */
  const BAD = enc.encode('aurora-backup-v1');
  P.encText = async (password, text) => { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const key = await P.vaultKey(password, salt, 600000); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: BAD }, key, enc.encode(text))); return { format: 'aurora-data-enc', v: 1, iter: 600000, salt: b64(salt), iv: b64(iv), data: b64(ct) }; };
  P.decText = async (blob, password) => { if (!blob || blob.format !== 'aurora-data-enc' || blob.v !== 1 || !(blob.iter >= 100000 && blob.iter <= 5000000)) throw new Error('That is not a protected Vorynth backup'); try { const key = await P.vaultKey(password, unb64(blob.salt), blob.iter); return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), additionalData: BAD }, key, unb64(blob.data))); } catch (_) { throw new Error('Wrong password, or the backup file was changed'); } };
  const GROUP_LABELS = { notes: 'Quick notes', planner: 'Planner', journal: 'Journal', habits: 'Habits', ledger: 'Ledger', snapshots: 'Settings snapshots', rules: 'Automation rules', profiles: 'Profiles', guard: 'Settings guard', plus: 'Vorynth Plus data (boards, goals, cards...)', vault: 'Encrypted vault' };
  CUSTOM.databackup = (box) => {
    box.style.gap = '8px'; const pw = F('Optional password to protect the backup file'); pw.type = 'password'; const pick = el('div');
    box.append(el('div', 'muted', 'Saves everything you made in Vorynth (notes, planner, journal, habits, ledger, Plus tools, automation rules, snapshots, the encrypted vault, theme and favourites) into one file you can keep or move to another PC. Start-with-Windows and tray settings are not included on purpose.'), pw,
      R(B('Export everything...', 'primary', async () => { try { const d = await call('dataExport'); d.prefs = prefs.all(); let out = d; if (pw.value) { if (pw.value.length < 8) return toast('Use at least 8 characters for the password', true); out = await P.encText(pw.value, JSON.stringify(d)); } const f = await call('exportSettings', { data: out }); toast(f ? 'Saved to ' + f : 'Cancelled'); } catch (e) { err(e); } }),
        B('Import a backup...', '', async () => {
          try { let d = await call('importSettings'); if (!d) return; if (d.format === 'aurora-data-enc') { const w = await askText('This backup is password-protected. Enter its password:', { password: true }); if (!w) return; d = JSON.parse(await P.decText(d, w)); } if (d.format !== 'aurora-data' || !d.data) throw new Error('That file is not an Vorynth data backup'); showImport(d); } catch (e) { err(e); }
        })), pick);
    function showImport(d) {
      pick.replaceChildren(el('div', 'label', 'Choose what to restore (this replaces the same kind of data you have now; a safety copy of your current data is kept):')); const boxes = {};
      Object.keys(GROUP_LABELS).forEach((k) => { const v = d.data[k]; const n = k === 'plus' ? Object.values(v || {}).reduce((a, x) => a + (Array.isArray(x) ? x.length : 0), 0) : k === 'vault' ? (v ? 1 : 0) : Array.isArray(v) ? v.length : 0; if (!n) return; const l = el('label', 'list-row'); const c = el('input'); c.type = 'checkbox'; c.checked = true; boxes[k] = c; const w = el('div'); w.style.cssText = 'display:flex;gap:8px;align-items:center'; w.append(c, el('span', '', GROUP_LABELS[k])); l.append(w, el('div', 'sub', k === 'vault' ? 'encrypted' : n + ' item' + (n === 1 ? '' : 's'))); pick.append(l); });
      let pc = null; if (d.prefs && typeof d.prefs === 'object' && ['accent', 'favs', 'studio', 'recent', 'ui'].some((k) => d.prefs[k] !== undefined)) { const l = el('label', 'list-row'); pc = el('input'); pc.type = 'checkbox'; pc.checked = true; const w = el('div'); w.style.cssText = 'display:flex;gap:8px;align-items:center'; w.append(pc, el('span', '', 'Theme, accent colour and favourites')); l.append(w); pick.append(l); }
      if (!Object.keys(boxes).length && !pc) { pick.append(el('div', 'muted', 'That backup is empty.')); return; }
      pick.append(R(B('Restore selected', 'primary', async () => { const groups = Object.keys(boxes).filter((k) => boxes[k].checked); if (!groups.length && !(pc && pc.checked)) return toast('Tick something to restore', true); if (!confirm('Restore the selected data now?')) return; try { const r = groups.length ? await call('dataImport', { data: d, groups }) : {}; if (pc && pc.checked) { ['accent', 'favs', 'studio', 'recent', 'ui'].forEach((k) => { if (d.prefs[k] !== undefined) prefs.set(k, d.prefs[k]); }); if (/^#[0-9a-f]{6}$/i.test(d.prefs.accent || '')) applyAccent(d.prefs.accent); if (window.auroraStudio) window.auroraStudio.apply(); } toast('Restored: ' + (Object.entries(r).map(([k, v]) => `${GROUP_LABELS[k] ? GROUP_LABELS[k].split(' (')[0] : k} ${v}`).join(', ') || 'appearance')); pick.replaceChildren(); } catch (e) { err(e); } }), B('Cancel', '', () => pick.replaceChildren())));
    }
  };
}
