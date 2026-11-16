'use strict';
/* Aurora Launcher: the Electron side of the Raycast-style command bar (window, hotkey, running things). Works on Windows and Linux.
   The logic that decides what to show lives in launcher-core.js (pure Node, tested separately). */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const core = require('./launcher-core');
const { createClipboardHistory } = require('./clipboard');
const { createExpander } = require('./expander');

function createLauncher({ electron, app, log = () => {}, openAuroraPage = () => {}, runSpeed = null }) {
  const { BrowserWindow, globalShortcut, screen, shell, clipboard, ipcMain, Notification } = electron;
  const isWin = process.platform === 'win32';
  const dataFile = path.join(app.getPath('userData'), 'launcher.json');
  const scriptsDir = path.join(app.getPath('userData'), 'launcher-scripts');
  const data = core.createData(dataFile);
  const cb = createClipboardHistory({ clipboard, max: 60 });
  let win = null; let apps = []; let appsAt = 0; let scanning = false; let cbTimer = null; let hotkey = ''; let blurGuard = 0; let visible = false;
  const timers = new Map(); let tseq = 0; const rateCache = new Map(); let aiCache = { at: 0, ok: false, models: [] };
  const AURORA_PAGES = []; let awakeId = null; let clicker = null;
  const expander = createExpander({ appDir: __dirname, getSnippets: () => data.get().snippets, expandText: (t) => core.expandSnippet(t, { clipboard: clipboard.readText() }), clipboard, log });

  const notify = (title, body) => { try { new Notification({ title, body: String(body).slice(0, 240) }).show(); } catch (_) { /* ignore */ } };
  const defaultHotkey = () => (isWin ? 'Alt+Space' : 'Control+Shift+Space');
  const configuredHotkey = () => { const h = data.get().hotkey; return typeof h === 'string' && /^[A-Za-z0-9+]{3,40}$/.test(h) ? h : defaultHotkey(); };

  /* ---------- apps ---------- */
  async function scanApps() {
    if (scanning) return; scanning = true;
    try {
      let list = isWin ? core.scanWindowsLnks(process.env) : core.scanLinuxApps();
      if (isWin) { // Store apps (Calculator, Settings, Photos...) through PowerShell, with a time limit
        await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ForEach-Object { $_.Name + "|" + $_.AppID }'], { timeout: 8000, windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => {
          if (!err && out) { const have = new Set(list.map((a) => a.title.toLowerCase())); for (const line of String(out).split(/\r?\n/)) { const i = line.lastIndexOf('|'); if (i < 1) continue; const name = line.slice(0, i).trim(); const id = line.slice(i + 1).trim(); if (name && id && !have.has(name.toLowerCase())) { list.push({ id: 'app:' + name.toLowerCase(), title: name, sub: 'App', keywords: '', aumid: id, kind: 'app' }); have.add(name.toLowerCase()); } } }
          res();
        }));
      }
      apps = list; appsAt = Date.now();
    } catch (e) { log('Launcher: app scan failed: ' + e.message); } finally { scanning = false; }
  }
  function loadScripts() {
    const out = []; try { for (const f of fs.readdirSync(scriptsDir)) { const p = path.join(scriptsDir, f); if (!fs.statSync(p).isFile() || /\.(md|txt|json)$/i.test(f)) continue; let title = f.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '); try { const head = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(0, 12).join('\n'); const m = head.match(/@aurora\.title\s+(.+)/); if (m) title = m[1].trim(); } catch (_) { /* binary */ } out.push({ file: p, title }); } } catch (_) { /* no folder yet */ }
    return out;
  }
  function ensureScriptsDir() {
    try { fs.mkdirSync(scriptsDir, { recursive: true }); const sample = path.join(scriptsDir, isWin ? 'hello.bat' : 'hello.sh'); if (!fs.existsSync(sample)) fs.writeFileSync(sample, isWin ? '@echo off\r\nREM @aurora.title Say hello (sample script)\r\necho Hello from your own script command!\r\n' : '#!/bin/sh\n# @aurora.title Say hello (sample script)\necho "Hello from your own script command!"\n', { mode: 0o755 }); } catch (_) { /* ignore */ }
  }
  const ctx = () => ({ platform: process.platform, apps, data, clipboardItems: data.get().clipboard === false ? [] : cb.list(), timers: [...timers.values()], scripts: loadScripts(), hasAI: aiCache.ok, auroraPages: AURORA_PAGES, expander: { ...expander.status(), blocked: expander._matcher.blocked || [] }, clipText: (() => { try { return clipboard.readText().slice(0, 20000); } catch (_) { return ''; } })(), awake: awakeId !== null, clicking: !!clicker });

  /* ---------- window ---------- */
  function create() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({ width: 760, height: 120, show: false, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, title: 'Aurora Launcher', webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    win.setMenuBarVisibility(false);
    try { win.setAlwaysOnTop(true, 'pop-up-menu'); } catch (_) { /* ignore */ }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.loadFile(path.join(__dirname, '..', 'renderer', 'launcher.html'));
    win.on('blur', () => { if (Date.now() < blurGuard) return; hide(); });
    win.on('closed', () => { win = null; visible = false; });
    return win;
  }
  function place() {
    const p = screen.getCursorScreenPoint(); const d = screen.getDisplayNearestPoint(p); const wa = d.workArea; const [w] = win.getSize();
    win.setPosition(Math.round(wa.x + (wa.width - w) / 2), Math.round(wa.y + wa.height * 0.18));
  }
  function show() {
    create(); if (!apps.length || Date.now() - appsAt > 300000) scanApps();
    const go = () => { if (!win || win.isDestroyed()) return; place(); blurGuard = Date.now() + 400; win.show(); win.focus(); visible = true; try { win.webContents.send('launcher:show'); } catch (_) { /* ignore */ } };
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', go); else go();
  }
  function hide() { if (win && !win.isDestroyed() && visible) { visible = false; try { win.webContents.send('launcher:hide'); } catch (_) { /* ignore */ } win.hide(); } }
  const toggle = () => (visible ? hide() : show());

  /* ---------- running things ---------- */
  const run = (cmd, args = [], opt = {}) => { try { const c = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...opt }); c.on('error', () => {}); c.unref(); return true; } catch (_) { return false; } };
  const tryRun = (list) => { for (const [c, ...a] of list) { try { const r = require('child_process').spawnSync(c, ['--version'], { timeout: 1500, stdio: 'ignore' }); if (!r.error) { run(c, a); return true; } } catch (_) { /* next */ } } return false; };
  function launchApp(a) {
    if (isWin) { if (a.aumid) return run('explorer.exe', ['shell:AppsFolder\\' + a.aumid]); if (a.file) return shell.openPath(a.file).then((e) => { if (e) notify('Could not open ' + a.title, e); }); return false; }
    if (a.file) { const id = path.basename(a.file); return run('gtk-launch', [id.replace(/\.desktop$/, '')]) || run('gio', ['launch', a.file]); }
    return false;
  }
  const pasteKey = () => new Promise((res) => {
    setTimeout(() => {
      if (isWin) execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys("^v")'], { timeout: 5000, windowsHide: true }, () => res());
      else execFile('xdotool', ['key', '--clearmodifiers', 'ctrl+v'], { timeout: 4000 }, () => res());
    }, 220);
  });
  async function pasteText(text) { const prev = clipboard.readText(); clipboard.writeText(String(text)); hide(); await pasteKey(); setTimeout(() => { try { if (clipboard.readText() === String(text)) clipboard.writeText(prev); } catch (_) { /* ignore */ } }, 1500); }
  function sysCmd(id) {
    switch (id) {
      case 'sys:lock': return isWin ? run('rundll32.exe', ['user32.dll,LockWorkStation']) : (tryRun([['loginctl', 'lock-session'], ['xflock4'], ['gnome-screensaver-command', '-l']]));
      case 'sys:sleep': return isWin ? run('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']) : run('systemctl', ['suspend']);
      case 'sys:restart': return isWin ? run('shutdown', ['/r', '/t', '0']) : run('systemctl', ['reboot']);
      case 'sys:shutdown': return isWin ? run('shutdown', ['/s', '/t', '0']) : run('systemctl', ['poweroff']);
      case 'sys:signout': return isWin ? run('shutdown', ['/l']) : run('loginctl', ['terminate-user', os.userInfo().username]);
      case 'sys:trash': return isWin ? run('powershell.exe', ['-NoProfile', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue']) : run('gio', ['trash', '--empty']);
      case 'sys:taskmgr': return isWin ? run('taskmgr.exe') : tryRun([['xfce4-taskmanager'], ['gnome-system-monitor'], ['mate-system-monitor'], ['xterm', '-e', 'htop']]);
      case 'sys:screenshot': return isWin ? run('explorer.exe', ['ms-screenclip:']) : tryRun([['aurora-shot', 'area'], ['flameshot', 'gui'], ['xfce4-screenshooter'], ['gnome-screenshot', '-a']]);
      case 'sys:emoji': return isWin ? run('powershell.exe', ['-NoProfile', '-Command', '(New-Object -ComObject WScript.Shell).SendKeys("#.")']) : tryRun([['aurora-emoji']]);
      case 'sys:calc': return isWin ? run('calc.exe') : tryRun([['gnome-calculator'], ['xfce4-calculator'], ['galculator']]);
      case 'sys:terminal': return isWin ? (run('wt.exe') || run('cmd.exe', ['/k'], { detached: true })) : tryRun([['x-terminal-emulator'], ['xfce4-terminal'], ['gnome-terminal']]);
      case 'sys:update': return isWin ? run('explorer.exe', ['ms-settings:windowsupdate']) : tryRun([['aurora-update']]);
      case 'sys:settings': return isWin ? run('explorer.exe', ['ms-settings:']) : tryRun([['aurora-control'], ['xfce4-settings-manager'], ['gnome-control-center']]);
      default: return false;
    }
  }
  function moveWindow(act) {
    hide();
    const p = screen.getCursorScreenPoint(); let disp = screen.getDisplayNearestPoint(p);
    if (act === 'win:next') { const all = screen.getAllDisplays(); const i = all.findIndex((d) => d.id === disp.id); disp = all[(i + 1) % all.length]; act = 'win:max'; }
    const r = core.windowRect(act, disp.workArea); if (!r) return false;
    let phys = r; try { if (isWin && screen.dipToScreenRect) phys = screen.dipToScreenRect(null, r); } catch (_) { /* keep */ }
    setTimeout(() => {
      if (isWin) {
        const ps = `Add-Type @"\nusing System; using System.Runtime.InteropServices;\npublic class W { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r); }\n"@\n[W]::SetProcessDPIAware() | Out-Null; $h=[W]::GetForegroundWindow(); [W]::ShowWindow($h,9) | Out-Null; [W]::MoveWindow($h,${Math.round(phys.x)},${Math.round(phys.y)},${Math.round(phys.width)},${Math.round(phys.height)},$true) | Out-Null`;
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: 8000, windowsHide: true }, () => {});
      } else {
        const sh = `id=$(xdotool getactivewindow) || exit 1; wmctrl -ir "$id" -b remove,maximized_vert,maximized_horz 2>/dev/null; xdotool windowmove "$id" ${Math.round(phys.x)} ${Math.round(phys.y)}; xdotool windowsize "$id" ${Math.round(phys.width)} ${Math.round(phys.height)}`;
        execFile('sh', ['-c', sh], { timeout: 6000 }, () => {});
      }
    }, 260);
    return true;
  }
  async function fetchJson(url, ms = 6000, opt = {}) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms); try { const r = await fetch(url, { signal: ac.signal, ...opt }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(t); } }
  async function currency({ amount, from, to }) {
    const key = from + to; const c = rateCache.get(key); let rate;
    if (c && Date.now() - c.at < 3600000) rate = c.rate; else { const j = await fetchJson(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); rate = j && j.rates && j.rates[to]; if (!Number.isFinite(rate)) throw new Error('No rate'); rateCache.set(key, { rate, at: Date.now() }); }
    const v = amount * rate; return { text: `${core.fmtNum(amount)} ${from} = ${core.fmtNum(parseFloat(v.toFixed(4)))} ${to}`, copy: String(parseFloat(v.toFixed(4))), sub: `1 ${from} = ${rate} ${to}  (European Central Bank rates)` };
  }
  async function aiStatus() { if (Date.now() - aiCache.at < 15000) return aiCache; try { const j = await fetchJson('http://127.0.0.1:11434/api/tags', 700); aiCache = { at: Date.now(), ok: true, models: ((j && j.models) || []).map((m) => m.name) }; } catch (_) { aiCache = { at: Date.now(), ok: false, models: [] }; } return aiCache; }
  async function ai(prompt) {
    const st = await aiStatus(); if (!st.ok || !st.models.length) return { ok: false, text: 'Local AI is not running. It is free: install Ollama from ollama.com, then run  ollama pull llama3.2  once. After that, "ai your question" answers privately on this PC. (For now you can use the quicklinks  chatgpt  claude  perplexity  to ask on the web.)' };
    const model = data.get().ollamaModel && st.models.includes(data.get().ollamaModel) ? data.get().ollamaModel : st.models[0];
    const j = await fetchJson('http://127.0.0.1:11434/api/chat', 120000, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, stream: false, messages: [{ role: 'system', content: 'You are a fast helper inside a desktop launcher. Answer briefly and clearly.' }, { role: 'user', content: String(prompt).slice(0, 4000) }] }) });
    return { ok: true, text: String((j && j.message && j.message.content) || '').trim() || '(no answer)', model };
  }
  function searchFiles(q, limit = 8, ms = 1200) {
    const home = os.homedir(); const roots = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Projects', 'dev'].map((d) => path.join(home, d)); const t0 = Date.now(); const needle = q.toLowerCase(); const hits = []; let seen = 0;
    const walk = (d, depth) => { if (Date.now() - t0 > ms || hits.length >= 40 || seen > 20000) return; let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of ents) { if (e.name[0] === '.' || e.name === 'node_modules') continue; seen++; const p = path.join(d, e.name); if (e.name.toLowerCase().includes(needle)) { let m = 0; try { m = fs.statSync(p).mtimeMs; } catch (_) { /* ignore */ } hits.push({ path: p, name: e.name, dir: e.isDirectory(), m }); } if (e.isDirectory() && depth < 4) walk(p, depth + 1); } };
    for (const r of roots) walk(r, 0);
    return hits.sort((a, b) => (b.name.toLowerCase().startsWith(needle) - a.name.toLowerCase().startsWith(needle)) || b.m - a.m).slice(0, limit).map((h) => ({ id: 'file:' + h.path, title: h.name, sub: h.path.replace(home, '~'), group: 'Files', icon: h.dir ? '📁' : '📄', kind: 'file', path: h.path, score: 30 }));
  }


  /* ---------- system lookups (kill, port, ip, saved Wi-Fi passwords) ---------- */
  const sh = (cmd, args, ms = 6000) => new Promise((res) => execFile(cmd, args, { timeout: ms, windowsHide: true, maxBuffer: 4 << 20 }, (e, out) => res(e && !out ? '' : String(out || ''))));
  const SAFE_NAME = /^[\w .\-]{1,40}$/;
  async function findProcs(name) {
    if (!SAFE_NAME.test(name)) return [];
    const n = name.toLowerCase(); const mine = process.pid; const list = [];
    if (isWin) { const out = await sh('tasklist', ['/fo', 'csv', '/nh']); for (const line of out.split(/\r?\n/)) { const m = line.match(/^"([^"]+)","(\d+)"/); if (m && m[1].toLowerCase().includes(n) && Number(m[2]) !== mine) list.push({ pid: Number(m[2]), name: m[1] }); } }
    else { const out = await sh('ps', ['-eo', 'pid=,stat=,comm=']); for (const line of out.split('\n')) { const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/); if (m && !m[2].startsWith('Z') && m[3].toLowerCase().includes(n) && Number(m[1]) !== mine) list.push({ pid: Number(m[1]), name: m[3] }); } }
    const byName = new Map(); for (const p of list) { if (!byName.has(p.name)) byName.set(p.name, { ...p, count: 0 }); byName.get(p.name).count++; }
    return [...byName.values()].slice(0, 8);
  }
  function parsePort(out, port, win) {
    const hits = [];
    for (const line of out.split(/\r?\n/)) {
      if (win) { const m = line.match(/^\s*(TCP|UDP)\s+\S+:(\d+)\s+\S+\s+(?:(LISTENING)\s+)?(\d+)\s*$/i); if (m && m[2] === port && (m[3] || m[1].toUpperCase() === 'UDP')) hits.push({ pid: Number(m[4]) }); }
      else { const m = line.match(/:(\d+)\s+\S+\s+users:\(\("([^"]+)",pid=(\d+)/); if (m && m[1] === port) hits.push({ pid: Number(m[3]), name: m[2] }); }
    }
    return hits;
  }
  async function portInfo(port) {
    if (!/^\d{1,5}$/.test(port)) return [];
    const out = isWin ? await sh('netstat', ['-ano']) : await sh('ss', ['-ltnupH']);
    const hits = parsePort(out, port, isWin); const seen = new Set(); const res = [];
    for (const h of hits) { if (seen.has(h.pid)) continue; seen.add(h.pid); let name = h.name; if (!name && isWin) { const t = await sh('tasklist', ['/fi', 'PID eq ' + h.pid, '/fo', 'csv', '/nh']); const m = t.match(/^"([^"]+)"/); name = m ? m[1] : 'unknown'; } res.push({ pid: h.pid, name: name || 'unknown' }); }
    return res;
  }
  function localIps() { const r = []; const ifs = os.networkInterfaces(); for (const k of Object.keys(ifs)) for (const a of ifs[k]) if (!a.internal && (a.family === 'IPv4' || a.family === 4)) r.push({ name: k, ip: a.address }); return r; }
  function parseWifiWin(profilesOut, detail) { return { names: [...profilesOut.matchAll(/All User Profile\s*:\s*(.+)/g)].map((m) => m[1].trim()), key: (detail.match(/Key Content\s*:\s*(.+)/) || [])[1] }; }
  async function wifiPasswords() {
    const res = [];
    if (isWin) { const out = await sh('netsh', ['wlan', 'show', 'profiles']); const names = parseWifiWin(out, '').names.slice(0, 25); for (const n of names) { const d = await sh('netsh', ['wlan', 'show', 'profile', 'name=' + n, 'key=clear']); const k = parseWifiWin('', d).key; res.push({ name: n, pass: k ? k.trim() : '(open or no password)' }); } }
    else { const list = (await sh('nmcli', ['-t', '-f', 'NAME,TYPE', 'connection', 'show'])).split('\n').filter((l) => /802-11-wireless|wifi/.test(l)).map((l) => l.replace(/:[^:]*$/, '').replace(/\\:/g, ':')).slice(0, 25); for (const n of list) { const pw = (await sh('nmcli', ['-s', '-g', '802-11-wireless-security.psk', 'connection', 'show', n])).trim(); res.push({ name: n, pass: pw || '(open, or needs administrator)' }); } }
    return res;
  }
  function startClicker(cps, secs) {
    stopClicker(); const total = Math.max(1, Math.round(cps * secs)); const delay = Math.round(1000 / cps);
    const t = setTimeout(() => {
      if (isWin) { const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int d,int e);' -Name M -Namespace A; $end=(Get-Date).AddSeconds(${secs}); while((Get-Date) -lt $end){[A.M]::mouse_event(2,0,0,0,0);[A.M]::mouse_event(4,0,0,0,0);Start-Sleep -Milliseconds ${delay}}`; clicker = { p: spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', windowsHide: true }) }; }
      else clicker = { p: spawn('xdotool', ['click', '--repeat', String(total), '--delay', String(delay), '1'], { stdio: 'ignore' }) };
      clicker.p.on('exit', () => { clicker = null; }); clicker.p.on('error', () => { clicker = null; });
    }, 4000); clicker = { timer: t };
  }
  function stopClicker() { if (clicker) { try { if (clicker.timer) clearTimeout(clicker.timer); if (clicker.p) clicker.p.kill(); } catch (_) { /* ignore */ } clicker = null; } }

  /* ---------- the calls the launcher window can make ---------- */
  const L = {
    query: async ({ q }) => core.search(String(q || '').slice(0, 300), ctx()),
    files: async ({ q }) => { if (data.get().files === false || String(q || '').trim().length < 3) return []; return searchFiles(String(q).trim().replace(/^(f|file|files)\s+/i, '')); },
    currency: async ({ cur }) => { try { return { ok: true, ...(await currency({ amount: Number(cur.amount), from: String(cur.from).slice(0, 3), to: String(cur.to).slice(0, 3) })) }; } catch (e) { return { ok: false, text: 'No internet, or no rate for that pair.' }; } },
    ai: async ({ prompt }) => { try { return await ai(prompt); } catch (e) { return { ok: false, text: 'The local AI did not answer: ' + e.message }; } },
    aiState: async () => { const s = await aiStatus(); return { ok: s.ok, models: s.models }; },
    dyn: async ({ kind, q }) => {
      const arg = String(q || '').trim();
      if (kind === 'kill') { if (!arg) return [{ id: 'dyn:k0', title: 'Type part of a program name, like  kill chrome', sub: '', group: 'System', icon: '🛠️', kind: 'noop', score: 185 }]; const l = await findProcs(arg); return l.length ? l.map((p) => ({ id: 'kill:' + p.name, title: `Close ${p.name}` + (p.count > 1 ? ` (${p.count} processes)` : ''), sub: 'Enter ends it right away. Unsaved work in it is lost', group: 'Force quit', icon: '💀', kind: 'killproc', procName: p.name, pid: p.pid, confirm: true, score: 185 })) : [{ id: 'dyn:k1', title: `Nothing running matches "${arg}"`, sub: '', group: 'System', icon: '🛠️', kind: 'noop', score: 185 }]; }
      if (kind === 'port') { const l = await portInfo(arg.replace(/^:/, '')); return l.length ? l.map((p) => ({ id: 'port:' + p.pid, title: `Port ${arg.replace(/^:/, '')} is used by ${p.name} (PID ${p.pid})`, sub: 'Enter ends that program', group: 'Port', icon: '🔌', kind: 'killproc', procName: p.name, pid: p.pid, confirm: true, score: 185 })) : [{ id: 'dyn:p1', title: /^\d{1,5}$/.test(arg.replace(/^:/, '')) ? `Nothing is listening on port ${arg}` : 'Type a port number, like  port 3000', sub: '', group: 'Port', icon: '🔌', kind: 'noop', score: 185 }]; }
      if (kind === 'ip') { const out = localIps().map((a2) => ({ id: 'ip:' + a2.ip, title: a2.ip, sub: a2.name + '. Enter copies', group: 'Your IP addresses', icon: '🌐', kind: 'copy', copy: a2.ip, score: 185 })); try { const j = await fetchJson('https://api.ipify.org?format=json', 3000); if (j && j.ip) out.unshift({ id: 'ip:pub', title: j.ip, sub: 'Public address (what websites see). Enter copies', group: 'Your IP addresses', icon: '🌍', kind: 'copy', copy: j.ip, score: 186 }); } catch (_) { /* offline */ } return out.length ? out : [{ id: 'dyn:i0', title: 'No network address found', sub: '', group: 'System', icon: '🌐', kind: 'noop', score: 185 }]; }
      if (kind === 'wifipass') { const l = await wifiPasswords(); return l.length ? l.map((w) => ({ id: 'wp:' + w.name, title: `${w.name}:  ${w.pass}`, sub: 'Saved on this PC. Enter copies the password', group: 'Saved Wi-Fi passwords', icon: '📶', kind: 'copy', copy: w.pass, score: 185 })) : [{ id: 'dyn:w0', title: 'No saved Wi-Fi networks found', sub: '', group: 'System', icon: '📶', kind: 'noop', score: 185 }]; }
      return [];
    },
    hide: async () => { hide(); return true; },
    setPages: async ({ pages }) => { if (Array.isArray(pages)) { AURORA_PAGES.length = 0; pages.slice(0, 80).forEach((p) => { if (p && typeof p.id === 'string' && typeof p.title === 'string') AURORA_PAGES.push({ id: p.id.slice(0, 40), title: p.title.slice(0, 60), kw: String(p.kw || '').slice(0, 200) }); }); } return true; },
    resize: async ({ h }) => { if (win && !win.isDestroyed()) { const [w] = win.getSize(); win.setSize(w, Math.max(80, Math.min(640, Math.round(Number(h) || 120)))); } return true; },
    icon: async ({ file }) => { if (!isWin || typeof file !== 'string') return null; try { const img = await app.getFileIcon(file, { size: 'normal' }); return img.isEmpty() ? null : img.toDataURL(); } catch (_) { return null; } },
    run: async (r) => {
      const it = r && r.item; if (!it || typeof it !== 'object') return { ok: false };
      const alt = !!r.alt; const act = alt && it.alt ? it.alt : it; const kind = act.kind; const id = it.id;
      if (id && !String(id).startsWith('ans:') && kind !== 'noop') data.bump(id);
      switch (kind) {
        case 'app': { hide(); launchApp(it.app || it); return { ok: true }; }
        case 'url': { if (!/^https?:\/\//i.test(act.url || '')) return { ok: false }; hide(); shell.openExternal(act.url); return { ok: true }; }
        case 'uri': { if (!/^(ms-settings:|windowsdefender:)/i.test(act.uri || '')) return { ok: false }; hide(); shell.openExternal(act.uri); return { ok: true }; }
        case 'copy': clipboard.writeText(String(act.copy || '')); hide(); notify('Copied', String(act.copy || '').slice(0, 100)); return { ok: true };
        case 'file': { hide(); if (alt) shell.showItemInFolder(act.path); else shell.openPath(act.path); return { ok: true }; }
        case 'sys': hide(); return { ok: sysCmd(id) !== false };
        case 'win': return { ok: moveWindow(id) };
        case 'snippaste': await pasteText(core.expandSnippet(act.text, { clipboard: clipboard.readText() })); return { ok: true };
        case 'killproc': { const pid = Number(act.pid); const nm = String(act.procName || ''); if (!Number.isInteger(pid) || pid < 2 || pid === process.pid || !SAFE_NAME.test(nm)) return { ok: false }; const all = await findProcs(nm); const target = all.find((p) => p.name === nm); if (!target) return { ok: true, stay: true, refresh: true, msg: 'It already closed.' }; hide(); if (isWin) execFile('taskkill', ['/F', '/IM', nm], { windowsHide: true }, () => notify('Closed', nm)); else execFile('pkill', ['-x', nm.slice(0, 15)], () => notify('Closed', nm)); return { ok: true }; }
        case 'awake': { const { powerSaveBlocker } = electron; if (act.value && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep'); else if (!act.value && awakeId !== null) { powerSaveBlocker.stop(awakeId); awakeId = null; } return { ok: true, stay: true, refresh: true, msg: act.value ? 'Staying awake until you switch it off.' : 'The PC can sleep again.' }; }
        case 'autoclick': if (act.stop) { stopClicker(); return { ok: true, stay: true, refresh: true, msg: 'Auto-clicker stopped.' }; } hide(); startClicker(act.cps, act.secs); notify('Auto-clicker', `Starts in 4 seconds: ${act.cps}/s for ${act.secs}s. Type "autoclick stop" to end.`); return { ok: true };
        case 'expset': { const v = !!act.value; data.get().expander = v; data.save(); if (v) { if (!expander.start()) return { ok: false, stay: true, msg: 'Could not start. On Linux install xdotool and python3.' }; } else expander.stop(); return { ok: true, stay: true, refresh: true, msg: v ? 'Text expansion is ON. Try typing a snippet like ;sig' : 'Text expansion is OFF.' }; }
        case 'typeclip': { const txt = clipboard.readText().slice(0, 4000); hide(); setTimeout(() => { if (isWin) { const esc = txt.replace(/[+^%~(){}\[\]]/g, (c) => '{' + c + '}').replace(/\r?\n/g, '{ENTER}'); execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Sleep 4; (New-Object -ComObject WScript.Shell).SendKeys('${esc.replace(/'/g, "''")}')`], { timeout: 30000, windowsHide: true }, () => {}); } else execFile('sh', ['-c', 'sleep 4; xdotool type --clearmodifiers --delay 25 -- "$1"', 'sh', txt], { timeout: 60000 }, () => {}); }, 100); return { ok: true }; }
        case 'snipadd': data.addSnippet(act.name, act.text); expander.refresh(); return { ok: true, stay: true, msg: 'Snippet saved. Type  snip  to see it.' };
        case 'snipdel': data.delSnippet(act.trigger); expander.refresh(); return { ok: true, stay: true, msg: 'Snippet deleted.' };
        case 'cbpaste': { const found = cb.list().find((i) => i.id === act.cid); if (found) { cb.use(act.cid); await pasteText(clipboard.readText()); } return { ok: true }; }
        case 'cbpin': cb.pin(act.cid, act.pinned); return { ok: true, stay: true, msg: act.pinned ? 'Pinned.' : 'Unpinned.' };
        case 'emojipaste': if (alt) { clipboard.writeText(act.copy); hide(); notify('Copied', act.copy); } else await pasteText(act.copy); return { ok: true };
        case 'noteadd': data.addNote(act.text); return { ok: true, stay: true, msg: 'Note saved. Type  notes  to see them.' };
        case 'notedel': data.delNote(act.nid); return { ok: true, stay: true, msg: 'Note deleted.' };
        case 'todoadd': data.addTodo(act.text); return { ok: true, stay: true, msg: 'Added. Type  todos  to see your list.' };
        case 'todotoggle': data.toggleTodo(act.tid); return { ok: true, stay: true, refresh: true };
        case 'tododel': data.delTodo(act.tid); return { ok: true, stay: true, refresh: true, msg: 'Deleted.' };
        case 'qladd': try { data.addQuicklink(act.key, act.key, act.url); return { ok: true, stay: true, msg: `Quicklink "${act.key}" saved.` }; } catch (e) { return { ok: false, msg: e.message }; }
        case 'timer': { const tid = ++tseq; const at = Date.now() + act.ms; const label = String(act.label || '').slice(0, 60); const t = setTimeout(() => { timers.delete(tid); notify('⏱ Timer finished', label || 'Time is up'); try { shell.beep(); } catch (_) { /* ignore */ } }, act.ms); timers.set(tid, { id: tid, at, label, t }); hide(); notify('Timer started', label || 'I will tell you when it ends'); return { ok: true }; }
        case 'timercancel': { const t = timers.get(act.tid); if (t) { clearTimeout(t.t); timers.delete(act.tid); } return { ok: true, stay: true, refresh: true, msg: 'Timer cancelled.' }; }
        case 'script': { const f = String(act.file || ''); if (!f.startsWith(scriptsDir + path.sep)) return { ok: false }; hide(); const exe = /\.ps1$/i.test(f) ? ['powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f]] : /\.py$/i.test(f) ? [isWin ? 'python' : 'python3', [f]] : /\.(bat|cmd)$/i.test(f) ? ['cmd.exe', ['/c', f]] : /\.sh$/i.test(f) ? ['sh', [f]] : [f, []]; execFile(exe[0], exe[1], { timeout: 15000, windowsHide: true, maxBuffer: 1 << 20 }, (err, out, serr) => notify(path.basename(f), String(err ? (serr || err.message) : out || 'Done').trim().slice(0, 220))); return { ok: true }; }
        case 'aurora': hide(); openAuroraPage(act.page); return { ok: true };
        case 'meta': hide(); if (act.which === 'scripts') { ensureScriptsDir(); shell.openPath(scriptsDir); } else { data.flush(); shell.openPath(dataFile); } return { ok: true };
        case 'ai': return { ok: true, stay: true, ai: true };
        default: return { ok: false };
      }
    }
  };

  function registerHotkey() {
    try { if (hotkey) globalShortcut.unregister(hotkey); } catch (_) { /* ignore */ }
    hotkey = configuredHotkey(); let ok = false; try { ok = globalShortcut.register(hotkey, toggle); } catch (_) { ok = false; }
    if (!ok) { const fb = isWin ? 'Control+Alt+Space' : 'Control+Alt+Space'; try { ok = globalShortcut.register(fb, toggle); if (ok) hotkey = fb; } catch (_) { ok = false; } }
    if (!ok) log('Launcher: no hotkey could be registered (another program uses them)');
    return ok ? hotkey : '';
  }
  function init() {
    ensureScriptsDir(); scanApps();
    ipcMain.handle('launcher', async (_e, name, args) => { const h = Object.prototype.hasOwnProperty.call(L, name) ? L[name] : null; if (typeof h !== 'function') throw new Error('Unknown call'); return h(args || {}); });
    registerHotkey();
    if (data.get().expander === true) expander.start();
    cbTimer = setInterval(() => { try { if (data.get().clipboard !== false) cb.poll(); } catch (_) { /* ignore */ } }, 1200);
    setInterval(() => { if (Date.now() - appsAt > 600000) scanApps(); }, 120000).unref();
    app.on('will-quit', () => { expander.stop(); stopClicker(); try { globalShortcut.unregister(hotkey); } catch (_) { /* ignore */ } clearInterval(cbTimer); data.flush(); });
  }
  return { init, toggle, show, hide, registerHotkey, hotkey: () => hotkey, handlers: L, _t: { findProcs, parsePort, parseWifiWin, localIps, portInfo }, core, setPages: (p) => { AURORA_PAGES.length = 0; AURORA_PAGES.push(...p); }, scanApps, _data: data };
}
module.exports = { createLauncher };
