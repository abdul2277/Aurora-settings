/* Aurora Doctor 2.0 UI: hero card per part, orb scan with animated steps, findings, restore point + auto-fix, gaming readiness (reversible), history. */
{
  const LV = { bad: 3, warn: 2, ok: 1 };
  const ICON = { bad: '🔴', warn: '🟠', ok: '🟢', none: '⚪' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const style = document.createElement('style'); style.id = 'doctor-css';
  style.textContent = [
    '.dr-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(170px,290px) 1fr;gap:20px;align-items:center;padding:20px 22px;border-radius:18px;border:1px solid var(--border);background:radial-gradient(120% 150% at 0% 0%,color-mix(in srgb,var(--accent) 30%,transparent),transparent 62%),var(--surface)}',
    '.dr-art{display:grid;place-items:center}.dr-art svg{width:100%;max-height:170px;filter:drop-shadow(0 8px 22px color-mix(in srgb,var(--accent) 55%,transparent));animation:drfloat 4.2s ease-in-out infinite}',
    '@keyframes drfloat{50%{transform:translateY(-6px)}}@keyframes drspin{to{transform:rotate(360deg)}}@keyframes drpulse{50%{opacity:.45}}',
    '.dr-art .s{stroke:var(--accent);fill:none;stroke-width:2}.dr-art .f{fill:color-mix(in srgb,var(--accent) 20%,#14112a)}.dr-art .g{fill:var(--accent)}.dr-art .d{fill:#0c0a18}.dr-art .t{fill:#d8ccff;font:700 15px sans-serif}.dr-art .p{fill:#e6c46a}',
    '.dr-spin{transform-box:fill-box;transform-origin:center;animation:drspin 2.6s linear infinite}',
    '.dr-kick{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}.dr-hero h3{margin:4px 0 8px;font-size:22px;line-height:1.2}',
    '.dr-hl{font-size:13px;opacity:.86;line-height:1.5}.dr-hl.bad{color:#ff8a8a;opacity:1}.dr-hl.warn{color:#ffc766;opacity:1}',
    '.dr-wait{animation:drpulse 1.2s ease-in-out infinite}',
    '.dr-steps{display:flex;gap:4px;padding:12px 8px 6px}.dr-step{flex:1;min-width:64px;text-align:center;font-size:11px;opacity:.55;transition:opacity .2s}.dr-step i{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;margin:0 auto 4px;border:2px solid var(--border);font-style:normal;font-size:12px;background:var(--surface)}',
    '.dr-step.act{opacity:1}.dr-step.act i{border-color:var(--accent);box-shadow:0 0 14px var(--accent)}.dr-step.ok,.dr-step.warn,.dr-step.bad{opacity:1}.dr-step.ok i{background:#22c55e;border-color:#22c55e;color:#fff}.dr-step.warn i{background:#f59e0b;border-color:#f59e0b;color:#fff}.dr-step.bad i{background:#ef4444;border-color:#ef4444;color:#fff}',
    '.dr-sbar{height:4px;border-radius:2px;background:var(--track);margin:0 8px 6px;overflow:hidden}.dr-sbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),#9be7a3);transition:width .3s}',
    '.dr-ctl{display:flex;gap:22px;align-items:center;flex-wrap:wrap;padding:18px 22px}',
    '.dr-orb{position:relative;flex:none;width:116px;height:116px;border-radius:50%;border:0;cursor:pointer;color:var(--accent-ink,#fff);font:700 15px var(--font);background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--accent) 65%,#fff),var(--accent) 55%,color-mix(in srgb,var(--accent) 45%,#000));box-shadow:0 0 0 6px color-mix(in srgb,var(--accent) 22%,transparent),0 10px 36px -8px var(--accent);transition:transform .15s}',
    '.dr-orb:hover:not(:disabled){transform:scale(1.05)}.dr-orb::before{content:"";position:absolute;inset:-13px;border-radius:50%;border:2px dashed color-mix(in srgb,var(--accent) 65%,transparent);animation:drspin 16s linear infinite}.dr-orb.on::before{animation-duration:1.3s;border-style:solid;border-color:var(--accent) transparent}.dr-orb:disabled{cursor:progress}',
    '.dr-ring{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font:700 26px var(--font);background:conic-gradient(var(--c) calc(var(--p)*1%),var(--track) 0)}.dr-ring span{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:var(--bg)}',
    '.dr-parts{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}.dr-part{padding:11px 12px;border-radius:12px;border:1px solid var(--border);background:var(--surface);display:grid;gap:3px;cursor:pointer;transition:border-color .15s,transform .15s}.dr-part:hover{transform:translateY(-2px)}.dr-part.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.dr-part b{display:flex;gap:6px;align-items:center}.dr-part small{opacity:.75;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dr-f{padding:10px 12px;border-radius:10px;border:1px solid var(--border);display:grid;gap:4px;background:var(--surface)}.dr-f.bad{border-color:#ef4444}.dr-f.warn{border-color:#f59e0b}.dr-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
    '.dr-bar{height:8px;border-radius:4px;background:var(--track);overflow:hidden}.dr-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),#9be7a3);transition:width .35s}',
    '.dr-gi{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:9px 11px;border-radius:10px;border:1px solid var(--border);background:var(--surface)}.dr-gi.on{border-color:#22c55e}',
    '.dr-opts{display:flex;gap:14px;flex-wrap:wrap;font-size:13px}.dr-opts label{display:flex;gap:6px;align-items:center}',
    '#dr-prog,#dr-game,#dr-log,#dr-stepsCard{grid-template-columns:minmax(0,1fr)!important}',
    '#dr-prog[hidden],#dr-game[hidden],#dr-log[hidden],#dr-stepsCard[hidden]{display:none!important}',
    '@media (max-width:760px){.dr-hero{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){.dr-art svg,.dr-spin,.dr-orb::before,.dr-wait{animation:none}}'
  ].join('');
  document.head.append(style);

  // ---------- original part illustrations (inline SVG, themed by the accent colour) ----------
  const svg = (inner) => '<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '</svg>';
  const fan = (cx, cy, r) => '<circle class="d s" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/><g class="dr-spin">' + [0, 72, 144, 216, 288].map((a) => '<path class="g" opacity=".85" d="M' + cx + ' ' + cy + ' L' + cx + ' ' + (cy - r + 3) + ' A' + (r - 3) + ' ' + (r - 3) + ' 0 0 1 ' + (cx + (r - 3) * 0.6) + ' ' + (cy - (r - 3) * 0.8) + ' Z" transform="rotate(' + a + ' ' + cx + ' ' + cy + ')"/>').join('') + '</g><circle class="d" cx="' + cx + '" cy="' + cy + '" r="5"/>';
  const pins = (n, x0, y, w, gap, h) => Array.from({ length: n }, (_, i) => '<rect class="p" x="' + (x0 + i * gap) + '" y="' + y + '" width="' + w + '" height="' + h + '"/>').join('');
  const ART = {
    gpu: svg('<rect class="f s" x="14" y="26" width="206" height="86" rx="12"/><rect class="f s" x="4" y="20" width="10" height="98" rx="2"/><rect class="d" x="14" y="112" width="206" height="9" rx="3"/>' + pins(14, 44, 121, 8, 11, 9) + fan(62, 69, 25) + fan(119, 69, 25) + fan(176, 69, 25) + '<rect class="g" x="196" y="30" width="18" height="5" rx="2" opacity=".8"/>'),
    cpu: svg('<rect class="f s" x="62" y="22" width="116" height="106" rx="12"/>' + Array.from({ length: 9 }, (_, i) => '<rect class="p" x="' + (72 + i * 11) + '" y="12" width="5" height="10"/><rect class="p" x="' + (72 + i * 11) + '" y="128" width="5" height="10"/>').join('') + Array.from({ length: 8 }, (_, i) => '<rect class="p" x="52" y="' + (32 + i * 12) + '" width="10" height="5"/><rect class="p" x="178" y="' + (32 + i * 12) + '" width="10" height="5"/>').join('') + '<rect class="d s" x="82" y="42" width="76" height="66" rx="8"/><text class="t" x="120" y="82" text-anchor="middle">CPU</text>'),
    ram: svg('<rect class="f s" x="16" y="34" width="208" height="66" rx="7"/>' + Array.from({ length: 6 }, (_, i) => '<rect class="d s" x="' + (28 + i * 32) + '" y="46" width="26" height="40" rx="3"/>').join('') + pins(26, 22, 100, 5, 8, 14) + '<rect class="d" x="112" y="100" width="12" height="14"/><rect class="g" x="16" y="34" width="208" height="5" rx="2" opacity=".8"/>'),
    drive: svg('<rect class="f s" x="14" y="46" width="196" height="58" rx="8"/><rect class="d s" x="30" y="56" width="52" height="38" rx="4"/><rect class="d s" x="94" y="56" width="52" height="38" rx="4"/><circle class="g" cx="170" cy="75" r="5"/><rect class="f s" x="210" y="52" width="18" height="46" rx="3"/>' + Array.from({ length: 6 }, (_, i) => '<rect class="p" x="214" y="' + (57 + i * 7) + '" width="12" height="3"/>').join('')),
    board: svg('<rect class="f s" x="22" y="12" width="196" height="126" rx="10"/><rect class="d s" x="48" y="30" width="48" height="48" rx="4"/><rect class="g" x="58" y="40" width="28" height="28" rx="3" opacity=".7"/>' + Array.from({ length: 4 }, (_, i) => '<rect class="d s" x="' + (130 + i * 15) + '" y="24" width="8" height="58" rx="2"/>').join('') + '<rect class="d s" x="48" y="108" width="120" height="9" rx="3"/><rect class="d s" x="48" y="90" width="120" height="9" rx="3"/><rect class="d s" x="182" y="96" width="24" height="26" rx="3"/><circle class="g" cx="196" cy="34" r="5"/>'),
    net: svg('<circle class="f s" cx="120" cy="78" r="48"/><ellipse class="s" cx="120" cy="78" rx="48" ry="19"/><ellipse class="s" cx="120" cy="78" rx="19" ry="48"/><path class="s" d="M72 78h96"/><path class="s" d="M82 30c20 12 56 12 76 0" opacity=".5"/><circle class="g" cx="120" cy="78" r="6"/><path class="s" d="M186 50a50 50 0 0 1 0 56" opacity=".7"/><path class="s" d="M54 50a50 50 0 0 0 0 56" opacity=".7"/>'),
    display: svg('<rect class="f s" x="26" y="16" width="188" height="108" rx="9"/><rect class="d" x="36" y="26" width="168" height="84" rx="4"/><path class="s" d="M52 94 80 66l22 20 24-34 36 42" opacity=".9"/><rect class="f s" x="104" y="124" width="32" height="12"/><rect class="f s" x="82" y="136" width="76" height="6" rx="3"/>'),
    audio: svg('<path class="f s" d="M56 58h28l36-28v90l-36-28H56z"/><path class="s" d="M140 54a34 34 0 0 1 0 42"/><path class="s" d="M154 40a58 58 0 0 1 0 70" opacity=".7"/><path class="s" d="M168 28a82 82 0 0 1 0 94" opacity=".45"/>'),
    windows: svg('<rect class="f s" x="22" y="18" width="196" height="116" rx="10"/><rect class="d" x="22" y="18" width="196" height="20" rx="10"/><circle class="g" cx="38" cy="28" r="4"/><circle class="g" cx="52" cy="28" r="4" opacity=".6"/><circle class="g" cx="66" cy="28" r="4" opacity=".3"/><rect class="d s" x="34" y="48" width="48" height="76" rx="5"/><rect class="d s" x="92" y="48" width="114" height="34" rx="5"/><rect class="g" x="92" y="92" width="52" height="32" rx="5" opacity=".7"/><rect class="d s" x="152" y="92" width="54" height="32" rx="5"/>'),
    generic: svg('<rect class="f s" x="60" y="26" width="120" height="98" rx="14"/><rect class="d s" x="82" y="48" width="76" height="54" rx="8"/><path class="g" d="M120 56v38M101 75h38" stroke="var(--accent)" stroke-width="4" opacity=".8"/>' + Array.from({ length: 5 }, (_, i) => '<rect class="p" x="' + (74 + i * 22) + '" y="14" width="6" height="12"/><rect class="p" x="' + (74 + i * 22) + '" y="124" width="6" height="12"/>').join(''))
  };
  const PART_ART = { cpu: 'cpu', gpu: 'gpu', ram: 'ram', board: 'board', drives: 'drive', network: 'net', audio: 'audio', display: 'display' };

  // ---------- pure helpers ----------
  const worst = (list) => list.reduce((w, f) => (LV[f.level] > (LV[w] || 0) ? f.level : w), null);
  const PART_IDS = { cpu: /^(cputemp|cpuload)$/, gpu: /^(gpu\d*|gputemp)$/, ram: /^(ram|ramchan|ramspeed|mem|whea)$/, board: /^(bios|crashes)$/, drives: /^(disk|diskhealth|drive\d+)$/, network: /^(net|dns|nic|nicspeed\d+)$/, audio: /^audio$/, bluetooth: /^bt$/, system: /^(temp|drivers|services|events|reboot|uptime|defender|firewall|startup|pnp|battery)$/ };
  const partLevel = (part, findings) => (PART_IDS[part] ? worst(findings.filter((f) => PART_IDS[part].test(f.id))) : null) || null;
  const scoreColor = (s) => (s >= 85 ? '#22c55e' : s >= 60 ? '#f59e0b' : '#ef4444');
  const partCards = (hw, findings) => {
    hw = hw || {}; const cards = []; const mk = (key, icon, title, lines) => cards.push({ key, icon, title, lines: lines.filter(Boolean), level: partLevel(key, findings) });
    const c = hw.cpu || {}; if (c.name) mk('cpu', '🧠', 'Processor', [c.name, (c.cores ? c.cores + ' cores / ' + c.threads + ' threads' : ''), c.maxMHz ? (c.maxMHz / 1000).toFixed(1) + ' GHz' : '']);
    (hw.gpus || []).forEach((g, i) => cards.push({ key: 'gpu', icon: '🎮', title: 'Graphics' + ((hw.gpus || []).length > 1 ? ' ' + (i + 1) : ''), lines: [g.name, g.vramMB > 0 ? Math.round(g.vramMB / 1024 * 10) / 10 + ' GB VRAM' : '', g.driverDate ? 'Driver ' + g.driver + ' (' + g.driverDate + ')' : ''].filter(Boolean), level: (findings.find((f) => f.id === 'gpu' + i) || {}).level || partLevel('gpu', findings) }));
    const r = hw.ram; if (r) mk('ram', '🧩', 'Memory', [r.totalGB + ' GB total', (r.modules || []).map((m) => m.sizeGB + ' GB' + (m.speed ? ' @ ' + m.speed : '')).join(' + ')]);
    const b = hw.board; if (b && (b.product || b.maker)) mk('board', '🧱', 'Motherboard', [(b.maker || '') + ' ' + (b.product || ''), b.bios ? 'BIOS ' + b.bios + (b.biosDate ? ' (' + b.biosDate + ')' : '') : '']);
    (hw.disks || []).forEach((d) => cards.push({ key: 'drives', icon: '💾', title: 'Drive', lines: [d.name, [d.type, d.bus, d.sizeGB ? d.sizeGB + ' GB' : ''].filter(Boolean).join(' · '), d.tempC != null ? d.tempC + ' C' + (d.wearPct != null ? ' · worn ' + d.wearPct + '%' : '') : '', d.hours != null ? d.hours + ' power-on hours' : ''].filter(Boolean), level: d.health && d.health !== 'Healthy' ? 'bad' : partLevel('drives', findings) }));
    (hw.nics || []).forEach((n) => cards.push({ key: 'network', icon: n.wifi ? '📶' : '🌐', title: n.wifi ? 'Wi-Fi' : 'Network', lines: [n.desc || n.name, n.status + (n.speed ? ' · ' + n.speed : '')], level: n.status === 'Up' ? partLevel('network', findings) || 'ok' : null }));
    (hw.audio || []).forEach((a) => cards.push({ key: 'audio', icon: '🔊', title: 'Audio', lines: [a.name, a.status], level: a.status === 'OK' ? 'ok' : 'warn' }));
    if ((hw.monitors || []).length || hw.display) mk('display', '🖥️', 'Display', [(hw.monitors || []).join(', '), hw.display ? hw.display.w + 'x' + hw.display.h + ' @ ' + hw.display.hz + ' Hz' : '']);
    (hw.bluetooth || []).forEach((b2) => cards.push({ key: 'bluetooth', icon: '🔵', title: 'Bluetooth', lines: [b2.name, b2.status], level: b2.status === 'OK' ? 'ok' : 'warn' }));
    (hw.cameras || []).forEach((cm) => cards.push({ key: 'camera', icon: '📷', title: 'Camera', lines: [cm.name, cm.status], level: cm.status === 'OK' ? 'ok' : 'warn' }));
    return cards;
  };
  const report = (res) => ['Aurora Doctor report', 'Score: ' + res.score + '/100', ''].concat(res.findings.map((f) => (f.level === 'ok' ? '[OK]   ' : f.level === 'warn' ? '[WARN] ' : '[BAD]  ') + f.title + ' - ' + f.detail)).join('\n');
  const DEEP = [['sfc', '🛠️', 'Repair Windows system files (sfc)', 'Checks and repairs damaged Windows files. Takes 10-30 minutes. Runs in its own window.'], ['dism', '🧰', 'Repair the Windows image (DISM)', 'Fixes the component store that sfc relies on. Needs internet. Takes a while.'], ['wureset', '🔄', 'Reset Windows Update', 'Clears the update download cache when updates are stuck or failing.'], ['memdiag', '🧪', 'Test the RAM', 'Opens Windows Memory Diagnostic. It restarts the PC to run the test.'], ['chkdsk', '💽', 'Scan the system drive', 'Online read-only scan for file system errors.'], ['resetnet', '📡', 'Reset the network stack', 'Fixes broken network settings. Needs a restart afterwards.']];
  const FIX_TITLE = { restorepoint: 'Create a restore point first', cleantemp: 'Clean temporary files', driverupdate: 'Install newer drivers (Windows Update)', appupdate: 'Update all installed apps (winget)', flushdns: 'Flush the DNS cache', startservices: 'Start stopped Windows services', pnpscan: 'Rescan hardware for broken devices', resetnet: 'Reset the network stack', chkdsk: 'Scan the drive for errors', sfc: 'Repair Windows system files (sfc)', dism: 'Repair the Windows image (DISM)', memdiag: 'Test the RAM', wureset: 'Reset Windows Update' };
  const SAFE = ['flushdns', 'cleantemp', 'startservices', 'pnpscan', 'resetnet'];
  // Which fixes can run on their own: only quick, safe ones. resetnet only when the internet is really down. Deep repairs are opt-in.
  const autoPlan = (findings, opts) => { const o = typeof opts === 'object' && opts ? opts : { deep: !!opts }; const deep = o.deep, upd = o.update; const seen = new Set(); const plan = []; findings.filter((f) => f.level !== 'ok' && f.fix && SAFE.includes(f.fix)).forEach((f) => { if (f.fix === 'resetnet' && !(f.id === 'net' && f.level === 'bad')) return; if (seen.has(f.fix)) return; seen.add(f.fix); plan.push({ fix: f.fix, title: FIX_TITLE[f.fix], why: f.title }); }); if (upd) ['driverupdate', 'appupdate'].forEach((id) => plan.push({ fix: id, title: FIX_TITLE[id], why: 'Replace old versions with newer ones' })); if (deep) ['sfc', 'dism'].forEach((id) => plan.push({ fix: id, title: FIX_TITLE[id], why: 'Deep repair' })); return plan; };
  const manualItems = (findings, plan) => { const done = new Set(plan.map((p) => p.fix)); return findings.filter((f) => f.level !== 'ok' && !(f.fix && done.has(f.fix))); };
  // A restore point is worth it before anything that changes drivers, apps, services, the network stack or system files. Temp cleanup and a DNS flush are harmless.
  const needsRestore = (plan) => plan.some((p) => !['flushdns', 'cleantemp'].includes(p.fix));
  // Scan steps (the same split lib/doctor.js uses)
  const STEPS = [{ k: 'windows', title: 'Windows', art: 'windows', test: null }, { k: 'drives', title: 'Drives', art: 'drive', test: PART_IDS.drives }, { k: 'memory', title: 'Memory', art: 'ram', test: PART_IDS.ram }, { k: 'cpu', title: 'Processor', art: 'cpu', test: PART_IDS.cpu }, { k: 'gpu', title: 'Graphics', art: 'gpu', test: PART_IDS.gpu }, { k: 'network', title: 'Network', art: 'net', test: PART_IDS.network }, { k: 'devices', title: 'Board & devices', art: 'board', test: /^(bios|crashes|audio|bt|pnp)$/ }];
  const stepOf = (id) => { const s = STEPS.find((x) => x.test && x.test.test(id)); return s ? s.k : 'windows'; };
  const stepResults = (findings) => STEPS.map((s) => { const list = findings.filter((f) => stepOf(f.id) === s.k); return { k: s.k, title: s.title, art: s.art, level: worst(list) || 'ok', findings: list }; });
  const gameScore = (items) => { const t = (items || []).filter((i) => !i.info); return t.length ? Math.round(t.filter((i) => i.on).length / t.length * 100) : null; };
  // score history (kept on this PC only)
  const HK = 'aurora.doctor.hist', LK = 'aurora.doctor.log';
  const loadJ = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const saveJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const histPush = (hist, score, at) => { const h = hist.slice(); const last = h[h.length - 1]; if (last && at - last.t < 60000) h[h.length - 1] = { t: at, s: score }; else h.push({ t: at, s: score }); return h.slice(-12); };
  const deltaText = (hist) => { if (hist.length < 2) return 'First scan saved. Run it again later to see your trend.'; const d = hist[hist.length - 1].s - hist[hist.length - 2].s; return d > 0 ? '▲ +' + d + ' since your last scan' : d < 0 ? '▼ ' + d + ' since your last scan' : 'Same as your last scan'; };
  const spark = (hist, w, h) => { if (hist.length < 2) return ''; const xs = (i) => 4 + i * ((w - 8) / (hist.length - 1)); const ys = (s) => h - 4 - (Math.max(0, Math.min(100, s)) / 100) * (h - 8); const pts = hist.map((p, i) => xs(i).toFixed(1) + ',' + ys(p.s).toFixed(1)).join(' '); const lp = hist[hist.length - 1]; return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="' + pts + '"/><circle cx="' + xs(hist.length - 1).toFixed(1) + '" cy="' + ys(lp.s).toFixed(1) + '" r="3.5" fill="var(--accent)"/></svg>'; };

  CUSTOM.autodoc = (box) => {
    box.style.gap = '14px';
    // hero
    const stepsCard = el('div', 'card'); stepsCard.id = 'dr-stepsCard'; stepsCard.hidden = true; const stepsRow = el('div', 'dr-steps'); stepsRow.id = 'dr-steps'; STEPS.forEach((s) => { const d = el('div', 'dr-step'); d.dataset.step = s.k; const i = el('i', null, '·'); d.append(i, el('div', null, s.title)); stepsRow.append(d); }); const sbar = el('div', 'dr-sbar'); const sbi = el('i'); sbar.append(sbi); const skip = el('button', 'btn'); skip.id = 'dr-skip'; skip.textContent = 'Skip animation'; skip.style.cssText = 'margin:0 8px 8px;justify-self:end;font-size:12px'; skip.hidden = true; stepsCard.style.display = 'grid'; stepsCard.style.gridTemplateColumns = '1fr'; stepsCard.append(stepsRow, sbar, skip);
    const hero = el('div', 'dr-hero'); hero.id = 'dr-hero'; const art = el('div', 'dr-art'); art.id = 'dr-art'; const hb = el('div'); const kick = el('div', 'dr-kick'); const hName = el('h3'); const hLines = el('div'); hLines.style.cssText = 'display:grid;gap:2px'; hb.append(kick, hName, hLines); hero.append(art, hb);
    const heroSet = (o) => { art.innerHTML = ART[o.art] || ART.generic; kick.textContent = o.kicker || ''; hName.textContent = o.name || ''; hLines.replaceChildren(...(o.lines || []).map((l) => { const d = el('div', 'dr-hl ' + (l.level || '') + (l.wait ? ' dr-wait' : ''), (l.level ? ICON[l.level] + ' ' : '') + l.text); return d; })); };
    const parts = el('div', 'dr-parts'); parts.id = 'dr-parts';
    // control row: orb + score
    const ctl = el('div', 'card dr-ctl'); const orb = el('button', 'dr-orb'); orb.id = 'dr-go'; const orbT = el('span', null, 'Scan'); orb.append(orbT); const ring = el('div', 'dr-ring'); ring.id = 'dr-ring'; ring.style.setProperty('--p', 0); ring.style.setProperty('--c', '#888'); const rs = el('span', null, '-'); ring.append(rs);
    const txt = el('div'); txt.style.cssText = 'display:grid;gap:6px;flex:1;min-width:220px'; const head = el('b', null, 'Check every part of your PC'); const sub = el('div', 'sub', 'Reads your CPU, graphics, RAM, motherboard, drives, network, audio and Windows. Scanning only reads. Fixes ask first and start with a restore point.'); sub.id = 'dr-sub'; const trend = el('div', 'sub'); trend.id = 'dr-trend'; const sp = el('div'); sp.id = 'dr-hist';
    const auto = el('button', 'btn primary', 'Fix everything automatically'); auto.id = 'dr-auto'; auto.hidden = true; const opts = el('div', 'dr-opts'); opts.hidden = true;
    const mkOpt = (id, label) => { const l = el('label'); const c = document.createElement('input'); c.type = 'checkbox'; c.id = id; l.append(c, el('span', null, label)); opts.append(l); return c; };
    const updCb = mkOpt('dr-upd', 'Also install newer drivers and update apps'); const deepCb = mkOpt('dr-deep', 'Also run deep repair (sfc + DISM, slow)');
    const cp = el('button', 'btn', 'Copy report'); cp.id = 'dr-copy'; cp.hidden = true; const btns = el('div'); btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; btns.append(auto, cp);
    txt.append(head, sub, trend, sp, opts, btns); ctl.append(orb, ring, txt);
    const prog = el('div', 'card'); prog.id = 'dr-prog'; prog.hidden = true; prog.style.cssText = 'padding:14px;display:grid;gap:6px';
    const gm = el('div', 'card'); gm.id = 'dr-game'; gm.hidden = true; gm.style.cssText = 'padding:14px;display:grid;gap:10px';
    const list = el('div'); list.id = 'dr-list'; list.style.cssText = 'display:grid;gap:8px';
    const logc = el('div', 'card'); logc.id = 'dr-log'; logc.hidden = true; logc.style.cssText = 'padding:14px;display:grid;gap:4px';
    const deep = el('div', 'card'); deep.style.cssText = 'padding:14px;display:grid;gap:10px'; deep.append(el('div', 'label', 'Deep repairs (use when something is really broken)')); DEEP.forEach(([id, ic, t, d]) => { const r = el('div', 'dr-row'); r.dataset.fix = id; const l = el('div'); l.append(el('b', null, ic + ' ' + t), el('div', 'sub', d)); const b = el('button', 'btn', 'Run'); b.onclick = () => runFix(id, t); r.append(l, b); deep.append(r); });
    box.append(stepsCard, hero, parts, ctl, prog, gm, list, logc, deep);
    heroSet({ art: 'generic', kicker: 'Aurora Doctor', name: 'Ready to check your whole PC', lines: [{ text: 'Processor, graphics, memory, motherboard, drives, network, audio and Windows.' }, { text: 'Read-only scan. Every fix asks first.' }] });

    let last = null, hist = loadJ(HK), skipAnim = false; const undoable = new Set();
    const log = (text) => { const l = loadJ(LK); l.unshift({ t: Date.now(), text }); saveJ(LK, l.slice(0, 30)); renderLog(); };
    function renderLog() { const l = loadJ(LK); logc.hidden = !l.length; if (!l.length) return; logc.replaceChildren(el('div', 'label', 'What Doctor did on this PC')); l.slice(0, 8).forEach((e) => logc.append(el('div', 'sub', new Date(e.t).toLocaleString() + ' · ' + e.text))); }
    renderLog();
    async function runFix(id, title) {
      if (!confirm('Run: ' + title + '?\nWindows may ask for permission.')) return;
      try { const r = await window.api.call('doctorFix', { id }); toast(r && r.started ? 'Started in a new window' : 'Done: ' + title); log(title); } catch (e) { toast(errText(e), true); }
    }
    const countUp = (to) => { const t0 = performance.now(); const col = scoreColor(to); ring.style.setProperty('--c', col); const tick = (now) => { const k = Math.min(1, (now - t0) / 700); const v = Math.round(to * (1 - Math.pow(1 - k, 3))); ring.style.setProperty('--p', v); rs.textContent = v; if (k < 1) requestAnimationFrame(tick); }; if (matchMedia('(prefers-reduced-motion: reduce)').matches) { ring.style.setProperty('--p', to); rs.textContent = to; } else requestAnimationFrame(tick); };
    function selectPart(card, node) { parts.querySelectorAll('.dr-part.sel').forEach((n) => n.classList.remove('sel')); if (node) node.classList.add('sel'); const fs = last ? last.findings.filter((f) => f.level !== 'ok' && PART_IDS[card.key] && PART_IDS[card.key].test(f.id)) : []; heroSet({ art: PART_ART[card.key] || 'generic', kicker: card.title + (card.level ? ' · ' + (card.level === 'ok' ? 'healthy' : card.level === 'warn' ? 'needs a look' : 'problem') : ''), name: card.lines[0] || card.title, lines: card.lines.slice(1).map((t) => ({ text: t })).concat(fs.map((f) => ({ level: f.level, text: f.title }))) }); }
    function drawGame() {
      const g = last && last.gaming; gm.replaceChildren(); if (!g || !g.items || !g.items.length) { gm.hidden = true; return; } gm.hidden = false; const sc = gameScore(g.items);
      const top = el('div', 'dr-row'); top.append(el('b', null, '🎮 Gaming readiness' + (sc != null ? ': ' + sc + '%' : ''))); const bar = el('div', 'dr-bar'); const bi = el('i'); bi.style.width = (sc || 0) + '%'; bar.append(bi);
      gm.append(top, bar, el('div', 'sub', 'Safe, per-user switches. Each one can be undone from here. Nothing here touches system files.'));
      g.items.forEach((it) => { const r = el('div', 'dr-gi' + (it.on ? ' on' : '')); r.dataset.id = it.id; const l = el('div'); l.append(el('b', null, (it.on ? '✅ ' : '⚪ ') + it.title), el('div', 'sub', it.detail)); r.append(l); if (!it.info && !it.on) { const b = el('button', 'btn', 'Apply'); b.onclick = () => tweak(it.id, false); r.append(b); } else if (!it.info && it.on && undoable.has(it.id)) { const b = el('button', 'btn', 'Undo'); b.onclick = () => tweak(it.id, true); r.append(b); } gm.append(r); });
      const act = el('div'); act.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; if (g.items.some((i) => !i.info && !i.on)) { const b = el('button', 'btn primary', 'Boost for gaming'); b.id = 'dr-boost'; b.onclick = async () => { if (!confirm('Apply these gaming settings?\n\n' + g.items.filter((i) => !i.info && !i.on).map((i) => '- ' + i.title).join('\n') + '\n\nYou can undo each one here.')) return; for (const it of g.items.filter((i) => !i.info && !i.on)) await tweak(it.id, false, true); toast('Gaming boost applied'); drawGame(); }; act.append(b); } if (g.items.some((i) => !i.info && undoable.has(i.id))) { const b = el('button', 'btn', 'Undo my gaming changes'); b.id = 'dr-undo'; b.onclick = async () => { for (const it of g.items.filter((i) => undoable.has(i.id))) await tweak(it.id, true, true); toast('Back to how it was'); drawGame(); }; act.append(b); } if (act.children.length) gm.append(act);
    }
    async function tweak(id, undo, quiet) {
      const it = last.gaming.items.find((i) => i.id === id); try { await window.api.call('doctorTweak', { name: id, undo: !!undo }); it.on = !undo; if (undo) undoable.delete(id); else undoable.add(id); log((undo ? 'Undid: ' : 'Applied: ') + it.title); if (!quiet) { toast((undo ? 'Undone: ' : 'Done: ') + it.title); drawGame(); } } catch (e) { toast(errText(e), true); }
    }
    function draw(res, fromAuto) {
      last = res; undoable.clear(); (res.undoable || []).forEach((n) => undoable.add(n));
      const plan = autoPlan(res.findings, false); auto.hidden = !plan.length; opts.hidden = !res.findings.some((f) => f.level !== 'ok'); auto.textContent = plan.length ? 'Fix everything automatically (' + plan.length + ' fixes)' : 'Fix everything automatically'; countUp(res.score); sub.textContent = res.score >= 85 ? 'Your PC looks healthy.' : res.score >= 60 ? 'A few things need attention.' : 'Problems found. Start with the red items.'; cp.hidden = false; orbT.textContent = 'Scan again';
      hist = histPush(loadJ(HK), res.score, res.at || Date.now()); saveJ(HK, hist); trend.textContent = deltaText(hist); sp.innerHTML = spark(hist, 180, 34);
      parts.replaceChildren(); const cards = partCards(res.hw, res.findings); cards.forEach((c) => { const d = el('div', 'dr-part'); d.dataset.part = c.key; d.tabIndex = 0; const b = el('b'); b.append(el('span', null, c.icon), el('span', null, c.title), el('span', null, ICON[c.level || 'none'])); d.append(b); c.lines.forEach((t) => d.append(el('small', null, t))); d.onclick = () => selectPart(c, d); d.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPart(c, d); } }; parts.append(d); });
      const first = cards.find((c) => c.key === 'gpu') || cards[0]; if (first) selectPart(first, parts.children[cards.indexOf(first)]); else heroSet({ art: 'generic', kicker: 'Scan finished', name: res.platform === 'win32' ? 'No hardware details came back' : 'Basic checks only on this system', lines: [{ text: 'The full hardware scan runs on Windows.' }] });
      list.replaceChildren(); const sorted = res.findings.slice().sort((a, b) => LV[b.level] - LV[a.level]); sorted.filter((f) => f.level !== 'ok').forEach((f) => { const d = el('div', 'dr-f ' + f.level); d.dataset.id = f.id; const r = el('div', 'dr-row'); r.append(el('b', null, ICON[f.level] + ' ' + f.title)); if (f.fix) { const b = el('button', 'btn primary', 'Fix'); b.onclick = () => runFix(f.fix, f.title); r.append(b); } d.append(r, el('div', 'sub', f.detail)); list.append(d); });
      const okc = res.findings.filter((f) => f.level === 'ok').length; if (okc) list.append(el('div', 'sub', '🟢 ' + okc + ' checks passed'));
      if (!sorted.some((f) => f.level !== 'ok')) list.prepend(el('div', 'dr-f', '✅ Nothing is wrong.'));
      drawGame();
    }
    // animated scan: the real probe is ONE read-only pass; once it returns, each step reveals its own results
    function stepState(i, st) { const n = stepsRow.children[i]; if (!n) return; n.className = 'dr-step ' + st; n.firstChild.textContent = st === 'ok' ? '✓' : st === 'warn' ? '!' : st === 'bad' ? '✕' : st === 'act' ? '…' : '·'; }
    async function replay(res) {
      const sr = stepResults(res.findings); const cards = partCards(res.hw, res.findings);
      for (let i = 0; i < sr.length; i++) {
        if (skipAnim) break; stepState(i, 'act'); sbi.style.width = Math.round((i / sr.length) * 100) + '%'; const s = sr[i]; const lines = []; heroSet({ art: s.art, kicker: 'Checking · ' + (i + 1) + '/' + sr.length, name: s.title, lines });
        const shown = s.findings.slice(0, 4).map((f) => ({ level: f.level, text: f.title })); if (!shown.length) shown.push({ level: 'ok', text: 'No problems found' });
        for (const l of shown) { if (skipAnim) break; await sleep(130); lines.push(l); heroSet({ art: s.art, kicker: 'Checking · ' + (i + 1) + '/' + sr.length, name: s.title, lines }); }
        await sleep(skipAnim ? 0 : 240); stepState(i, s.level);
      }
      sr.forEach((s, i) => stepState(i, s.level)); sbi.style.width = '100%'; void cards;
    }
    async function scan() {
      orb.disabled = true; orb.classList.add('on'); orbT.textContent = 'Scanning'; stepsCard.hidden = false; skip.hidden = true; skipAnim = false; sbi.style.width = '4%'; for (let i = 0; i < STEPS.length; i++) stepState(i, ''); stepState(0, 'act');
      sub.textContent = 'Reading your hardware and Windows in one read-only pass (up to a minute)...'; const t0 = Date.now(); const tick = () => heroSet({ art: 'windows', kicker: 'Reading your PC', name: 'Hardware and Windows', lines: [{ wait: true, text: 'Looking at every part… ' + Math.round((Date.now() - t0) / 1000) + ' s' }] }); tick(); const timer = setInterval(tick, 1000);
      let res = null, err = null; try { res = await window.api.call('doctorScan', {}); } catch (e) { err = e; } clearInterval(timer);
      if (err || !res) { sub.textContent = 'Scan failed: ' + errText(err || new Error('no data')); orbT.textContent = last ? 'Scan again' : 'Scan'; heroSet({ art: 'generic', kicker: 'Scan failed', name: 'Could not read this PC', lines: [{ level: 'bad', text: errText(err || new Error('no data')) }] }); orb.disabled = false; orb.classList.remove('on'); return; }
      skip.hidden = false; await replay(res); skip.hidden = true; draw(res); orb.disabled = false; orb.classList.remove('on');
    }
    skip.onclick = () => { skipAnim = true; };
    orb.onclick = scan;
    auto.onclick = async () => {
      if (!last) return; const before = last; const plan = autoPlan(before.findings, { deep: deepCb.checked, update: updCb.checked }); if (!plan.length) { toast('Nothing Aurora can fix by itself. Tick the update box to also install newer drivers and apps.'); return; }
      const rp = before.platform === 'win32' && needsRestore(plan);
      if (!confirm('Aurora will run these fixes one by one:\n\n' + (rp ? '- Create a restore point first (so you can roll back from Windows)\n' : '') + plan.map((p) => '- ' + p.title).join('\n') + '\n\nWindows may ask for permission. Continue?')) return;
      auto.disabled = orb.disabled = true; prog.hidden = false; prog.replaceChildren(el('b', null, 'Fixing...')); const bar = el('div', 'dr-bar'); const bi = el('i'); bar.append(bi); prog.append(bar);
      const steps = (rp ? [{ fix: 'restorepoint', title: FIX_TITLE.restorepoint }] : []).concat(plan); const rows = steps.map((p) => { const r = el('div', 'sub', '⏳ ' + p.title); r.dataset.fix = 'auto-' + p.fix; prog.append(r); return r; });
      let okc = 0, failc = 0, aborted = false;
      for (let i = 0; i < steps.length; i++) {
        const p = steps[i]; rows[i].textContent = '⚙️ ' + p.title + '...'; bi.style.width = Math.round((i / steps.length) * 100) + '%';
        try {
          const r = await window.api.call('doctorFix', { id: p.fix });
          if (p.fix === 'restorepoint') { rows[i].textContent = r && r.verified === false ? '❌ ' + p.title + ' (Windows did not create it)' : r && r.verified === null ? '🟡 ' + p.title + ' (requested, could not confirm)' : '✅ Restore point created'; if (r && r.verified === false && !confirm('Windows could not create a restore point.\nContinue without one?')) { aborted = true; rows[i].textContent += ' - stopped'; break; } if (!(r && r.verified === false)) log('Created a restore point'); }
          else { okc++; rows[i].textContent = (r && r.started ? '🟡 Started (running in its own window): ' : '✅ ') + p.title; log(p.title); }
        } catch (e) { rows[i].textContent = '❌ ' + p.title + ' - ' + errText(e); if (p.fix === 'restorepoint') { if (!confirm('Could not create a restore point (' + errText(e) + ').\nContinue without one?')) { aborted = true; rows[i].textContent += ' - stopped'; break; } } else failc++; }
      }
      bi.style.width = '100%'; if (aborted) { prog.append(el('div', 'sub', 'Stopped before changing anything else.')); auto.disabled = orb.disabled = false; return; }
      prog.append(el('div', 'sub', 'Re-checking your PC...')); let after = null; try { after = await window.api.call('doctorScan', {}); } catch (_) {}
      if (after) { draw(after, true); const left = manualItems(after.findings, []); const sum = el('div'); sum.id = 'dr-summary'; sum.style.cssText = 'display:grid;gap:4px;margin-top:6px'; sum.append(el('b', null, 'Score: ' + before.score + ' → ' + after.score + '  (' + okc + ' fixes done' + (failc ? ', ' + failc + ' failed' : '') + ')')); if (left.length) sum.append(el('div', 'sub', left.length + ' item(s) still need you (hardware, restart or a manual step). See the list below.')); else sum.append(el('div', 'sub', 'Everything that could be checked is healthy.')); prog.append(sum); if (after.score >= 90 && after.score > before.score && window.__confetti) { try { window.__confetti(); } catch (_) {} } }
      auto.disabled = orb.disabled = false;
    };
    cp.onclick = async () => { if (!last) return; try { await navigator.clipboard.writeText(report(last)); toast('Report copied'); } catch (_) { toast('Clipboard blocked', true); } };
  };
  window.__doctor = { worst, partLevel, partCards, scoreColor, report, autoPlan, manualItems, FIX_TITLE, needsRestore, stepResults, stepOf, gameScore, histPush, deltaText, spark, ART, STEPS };
}
