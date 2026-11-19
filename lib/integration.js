// Connects the store, rules engine, guard, watchdog and tray to Vorynth's existing handlers.
const path = require('path');
const fs = require('fs');
const { createStore } = require('./store');
const { createEngine, guardTick, createWatchdog } = require('./automation');
const { createBackground } = require('./background');
const files = require('./files');
const { createClipboardHistory } = require('./clipboard');

const PLAN_GUIDS = { balanced: '381b4222-f694-41f0-9685-ff5bb260df2e', high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', saver: 'a1841308-3541-4fab-bc81-f71556f20b4a' };
const PLAN_NAMES = { balanced: /balanced|متوازن/i, high: /high|ultimate|عالي/i, saver: /saver|موفر|توفير/i };
const BUILTIN = [
  { name: 'Gaming', icon: '🎮', desc: 'High performance · Game Mode on · unmuted', actions: [{ type: 'plan', match: 'high' }, { type: 'toggle', id: 'gameMode', value: true }, { type: 'mute', value: false }] },
  { name: 'Focus', icon: '🎯', desc: 'Muted · dark mode', actions: [{ type: 'mute', value: true }, { type: 'darkMode', value: true }] },
  { name: 'Battery saver', icon: '🔋', desc: 'Power saver plan · dimmer screen', actions: [{ type: 'plan', match: 'saver' }, { type: 'brightness', value: 40 }] },
  { name: 'Presentation', icon: '📽️', desc: 'High performance · full brightness · muted', actions: [{ type: 'plan', match: 'high' }, { type: 'brightness', value: 100 }, { type: 'mute', value: true }] },
  { name: 'Night owl', icon: '🦉', desc: 'Dark mode · low brightness · quiet volume', actions: [{ type: 'darkMode', value: true }, { type: 'brightness', value: 25 }, { type: 'volume', value: 20 }] }
];
const DATA_GROUPS = ['notes', 'planner', 'journal', 'habits', 'ledger', 'snapshots', 'rules', 'profiles', 'guard'];
const FOLDER_KEYS = ['downloads', 'documents', 'desktop', 'pictures', 'videos', 'music'];
const BS = String.fromCharCode(92); // a backslash, spelled out so no editor/escaping step can ever swallow it
const esc = (t) => String(t).split(BS).join(BS + BS).replace(/[;,:"]/g, (c) => BS + c);
const wifiQrPayload = (ssid, password, secure) => {
  const name = /^[0-9a-f]+$/i.test(ssid) ? `"${ssid}"` : esc(ssid);
  return secure && password ? `WIFI:T:WPA;S:${name};P:${esc(password)};;` : `WIFI:T:nopass;S:${name};;`;
};

function createIntegration({ electron, handlers, TOGGLES, runFile, userDataDir, iconPath, exePath, showWindow, toggleWindow, summon, quitApp, qr, now = () => new Date() }) {
  const clip = createClipboardHistory({ clipboard: electron.clipboard || { readText: () => '', writeText() {} } });
  const guardable = Object.keys(TOGGLES).filter((id) => !TOGGLES[id].explorer); // Explorer-restarting toggles are never applied automatically
  const store = createStore(path.join(userDataDir, 'aurora-store.json'), guardable);
  const log = (t) => { try { store.log(t); } catch (_) {} };
  const notify = (text) => {
    if (!store.get().settings.notify) return;
    try { if (electron.Notification && (!electron.Notification.isSupported || electron.Notification.isSupported())) new electron.Notification({ title: 'Vorynth', body: text }).show(); } catch (_) {}
  };

  /* ----- actions ----- */
  async function setPlan(match) {
    try { return await handlers.powerSet({ guid: PLAN_GUIDS[match] }); }
    catch (e) { const plans = await handlers.powerPlans(); const hit = plans.find((p) => PLAN_NAMES[match].test(p.name)); if (!hit) throw e; return handlers.powerSet({ guid: hit.guid }); }
  }
  async function runAction(a) {
    switch (a.type) {
      case 'profile': return runProfile(a.name).then((r) => { if (r.ok === 0) throw new Error('no step could run'); });
      case 'volume': return handlers.volumeSet({ value: a.value });
      case 'mute': return handlers.muteSet({ value: a.value });
      case 'brightness': return handlers.brightnessSet({ value: a.value });
      case 'plan': return setPlan(a.match);
      case 'darkMode': return handlers.toggleSet({ id: 'darkMode', value: a.value });
      case 'toggle': return handlers.toggleSet({ id: a.id, value: a.value });
      case 'keepAwake': return handlers.keepAwakeSet({ mode: a.mode, minutes: a.minutes });
      case 'notify': notify(a.text); return true;
      case 'cleanTemp': return handlers.cleanTemp();
      case 'organizeDownloads': return handlers.organizeApply({});
      default: throw new Error('Unknown action');
    }
  }
  async function runList(actions) { let ok = 0; for (const a of actions) { try { await runAction(a); ok++; } catch (_) {} } return { ok, total: actions.length }; }
  function snapshotActions(p) {
    const a = [];
    Object.entries(p.toggles || {}).forEach(([id, value]) => a.push({ type: 'toggle', id, value }));
    if (p.volume != null) a.push({ type: 'volume', value: p.volume });
    if (p.muted != null) a.push({ type: 'mute', value: p.muted });
    if (p.brightness != null) a.push({ type: 'brightness', value: p.brightness });
    return a;
  }
  async function runProfile(name) {
    const b = BUILTIN.find((x) => x.name === name);
    if (b) return runList(b.actions);
    const c = store.get().profiles.find((x) => x.name === name);
    if (!c) throw new Error('Unknown profile');
    const r = await runList(snapshotActions(c));
    if (c.plan) { r.total++; try { await handlers.powerSet({ guid: c.plan }); r.ok++; } catch (_) {} }
    return r;
  }

  /* ----- Settings Time Machine: snapshots of your settings you can compare and roll back to ----- */
  async function captureNow() {
    const snap = { toggles: {} };
    try { const cur = await handlers.toggleGetMany({ ids: guardable }); for (const id of guardable) if (typeof cur[id] === 'boolean') snap.toggles[id] = cur[id]; } catch (_) {}
    try { const v = await handlers.volumeGet(); if (v && Number.isInteger(Math.round(v.volume))) { snap.volume = Math.round(v.volume); snap.muted = !!v.muted; } } catch (_) {}
    try { const b = await handlers.brightnessGet(); if (b != null && Number.isFinite(Number(b))) snap.brightness = Math.round(Number(b)); } catch (_) {}
    try { const pl = (await handlers.powerPlans()).find((x) => x.active); if (pl && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pl.guid)) snap.plan = pl.guid; } catch (_) {}
    return snap;
  }
  async function addSnapshot(name, auto) {
    const cap = await captureNow();
    const list = store.get().snapshots.slice(); list.push({ name: String(name).slice(0, 60) || 'Snapshot', t: Date.now(), auto: !!auto, ...cap });
    while (list.length > 40) { const i = list.findIndex((x) => x.auto); list.splice(i >= 0 ? i : 0, 1); } // trim automatic ones first
    store.set('snapshots', list); const last = store.get().snapshots[store.get().snapshots.length - 1]; return last;
  }
  async function snapDiff(id) {
    const s = store.get().snapshots.find((x) => x.id === id); if (!s) throw new Error('Unknown snapshot');
    const now = await captureNow(); const out = [];
    for (const [k, v] of Object.entries(s.toggles || {})) if (typeof now.toggles[k] === 'boolean' && now.toggles[k] !== v) out.push({ id: k, kind: 'toggle', was: v, now: now.toggles[k] });
    if (s.volume != null && now.volume != null && s.volume !== now.volume) out.push({ id: 'volume', kind: 'number', was: s.volume, now: now.volume });
    if (s.muted != null && now.muted != null && s.muted !== now.muted) out.push({ id: 'muted', kind: 'toggle', was: s.muted, now: now.muted });
    if (s.brightness != null && now.brightness != null && s.brightness !== now.brightness) out.push({ id: 'brightness', kind: 'number', was: s.brightness, now: now.brightness });
    if (s.plan && now.plan && s.plan.toLowerCase() !== now.plan.toLowerCase()) out.push({ id: 'plan', kind: 'plan', was: s.plan, now: now.plan });
    return out;
  }
  const profileNames = () => [...BUILTIN.map((b) => b.name), ...store.get().profiles.map((p) => p.name)];

  /* ----- samplers, engine, guard, watchdog ----- */
  const sampler = {
    power: async () => (electron.powerMonitor && typeof electron.powerMonitor.isOnBatteryPower === 'function' ? (electron.powerMonitor.isOnBatteryPower() ? 'battery' : 'ac') : undefined),
    battery: async () => { const b = await handlers.battery(); return b ? b.percent : null; },
    ssid: async () => (await handlers.wifiCurrent()).ssid,
    apps: async () => new Set([...(await runFile('tasklist.exe', ['/fo', 'csv', '/nh'])).matchAll(/^"([^"]+)"/gm)].map((m) => m[1].toLowerCase().replace(/\.exe$/, '')))
  };
  const engine = createEngine({ store, sampler, run: runAction, clock: now, log });
  const doGuard = () => guardTick({ store, getMany: (ids) => handlers.toggleGetMany({ ids }), set: (id, value) => handlers.toggleSet({ id, value }), log, notify });
  const watchdog = createWatchdog({ store, notify, log, ping: async () => { for (const h of ['1.1.1.1', '8.8.8.8']) { try { if (/\bTTL\b/i.test(await runFile('ping.exe', ['-n', '1', '-w', '1500', h], 5000))) return true; } catch (_) {} } return false; } });
  const setPaused = (v) => { store.set('settings', { ...store.get().settings, paused: v }); background.buildMenu(); log(v ? 'Automation paused' : 'Automation resumed'); };
  const background = createBackground({ electron, store, showWindow, toggleWindow, summon, runProfile, profileNames, handlers, setPaused, log, iconPath, exePath, onQuit: quitApp });

  let timers = [];
  function init() {
    store.load(); background.apply();
    const safe = (fn) => () => { Promise.resolve().then(fn).catch((e) => log('Background task error: ' + String(e.message || e).slice(0, 80))); };
    timers = [
      setTimeout(safe(() => engine.tick()), 4000), setInterval(safe(() => engine.tick()), 15000),
      setTimeout(safe(doGuard), 25000), setInterval(safe(doGuard), 600000),
      setTimeout(safe(async () => { const st = store.get(); const lastAuto = [...st.snapshots].reverse().find((x) => x.auto && !/^Before restoring/.test(x.name)); if (st.settings.autosnap && (!lastAuto || now().getTime() - lastAuto.t > 24 * 3600e3)) { await addSnapshot('Daily snapshot ' + now().toLocaleDateString(), true); log('Saved the daily settings snapshot'); } }), 45000),
      setInterval(safe(() => (store.get().settings.watchdog ? watchdog.tick() : null)), 20000),
      setInterval(() => { if (store.get().settings.clipboard) clip.poll(); }, 1000)
    ];
    try { electron.powerMonitor.on('resume', () => setTimeout(safe(() => { engine.tick(); return doGuard(); }), 8000)); } catch (_) {}
  }
  function dispose() { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = []; background.dispose(); }

  /* ----- calls the UI can make ----- */
  const folder = (key) => { if (!FOLDER_KEYS.includes(key)) throw new Error('Unknown folder'); return electron.app.getPath(key); };
  const api = {
    storeGet: async () => { const d = store.get(); return { snapshotsOn: !!d.settings.autosnap, rules: d.rules, profiles: d.profiles, guard: d.guard, notes: d.notes, planner: d.planner, journal: d.journal, habits: d.habits, ledger: d.ledger, plus: d.plus, vault: d.vault, addons: d.addons, settings: d.settings, guardable, hotkeys: background.hotkeys(), hasTray: background.hasTray() }; },
    storeSet: async (a) => {
      const v = store.set(a.key, a.value);
      if (a.key === 'settings') { background.apply(); if (!store.get().settings.clipboard) clip.wipe(); } else if (a.key === 'profiles') background.buildMenu();
      return v;
    },
    // Full backup of everything you made in Vorynth (notes, planner, journal, tools, rules, snapshots, encrypted vault).
    // Machine settings (tray, start with Windows) are left out on purpose.
    dataExport: async () => { const d = store.get(); const data = {}; DATA_GROUPS.forEach((k) => { data[k] = d[k]; }); data.plus = d.plus; data.vault = d.vault; return JSON.parse(JSON.stringify({ format: 'aurora-data', version: 1, exportedAt: now().getTime(), data })); },
    dataImport: async (a) => {
      const src = a && a.data && a.data.format === 'aurora-data' && a.data.data && typeof a.data.data === 'object' ? a.data.data : null; if (!src) throw new Error('That file is not an Vorynth backup');
      if (a.data.version !== 1) throw new Error('This backup comes from a different version of Vorynth');
      const want = Array.isArray(a.groups) ? new Set(a.groups) : null; const counts = {};
      try { fs.copyFileSync(path.join(userDataDir, 'aurora-store.json'), path.join(userDataDir, 'aurora-store.before-import.json')); } catch (_) { /* nothing to copy on a first run */ }
      for (const k of DATA_GROUPS) if (Array.isArray(src[k]) && (!want || want.has(k))) { counts[k] = store.set(k, src[k]).length; }
      if (src.plus && typeof src.plus === 'object' && (!want || want.has('plus'))) { let n = 0; for (const name of Object.keys(src.plus)) { if (!Array.isArray(src.plus[name])) continue; try { n += store.set('plus:' + name, src.plus[name]).length; } catch (_) { /* unknown tool list: skipped */ } } counts.plus = n; }
      if (src.vault && (!want || want.has('vault'))) { try { store.set('vault', src.vault); counts.vault = 1; } catch (_) { /* invalid vault blob: skipped */ } }
      background.buildMenu(); log('Imported an Vorynth backup'); return counts;
    },
    clipGet: async () => ({ enabled: !!store.get().settings.clipboard, items: store.get().settings.clipboard ? clip.list() : [] }),
    clipUse: async (a) => clip.use(Number(a.id)),
    clipPin: async (a) => clip.pin(Number(a.id), !!a.pinned),
    clipDelete: async (a) => clip.remove(Number(a.id)),
    clipClear: async () => clip.clear(),
    snapList: async () => store.get().snapshots.slice().reverse().map((x) => ({ id: x.id, name: x.name, t: x.t, auto: x.auto, toggles: Object.keys(x.toggles || {}).length, hasVolume: x.volume != null, hasBrightness: x.brightness != null, hasPlan: !!x.plan })),
    snapCapture: async (a) => { const s = await addSnapshot(String(a.name || '').trim() || 'Snapshot ' + new Date(now()).toLocaleString(), false); log('Saved settings snapshot "' + s.name + '"'); return { id: s.id, name: s.name }; },
    snapDiff: async (a) => snapDiff(String(a.id)),
    snapRestore: async (a) => {
      const s = store.get().snapshots.find((x) => x.id === String(a.id)); if (!s) throw new Error('Unknown snapshot');
      await addSnapshot('Before restoring "' + s.name + '"', true); // so every restore can itself be undone
      const only = Array.isArray(a.only) ? new Set(a.only.map(String)) : null; const p = { ...s, toggles: Object.fromEntries(Object.entries(s.toggles || {}).filter(([k]) => !only || only.has(k))) };
      if (only) { if (!only.has('volume')) delete p.volume; if (!only.has('muted')) delete p.muted; if (!only.has('brightness')) delete p.brightness; if (!only.has('plan')) delete p.plan; }
      const r = await runList(snapshotActions(p)); if (p.plan) { r.total++; try { await handlers.powerSet({ guid: p.plan }); r.ok++; } catch (_) {} }
      log(`Restored snapshot "${s.name}" (${r.ok} of ${r.total} settings)`); return r;
    },
    snapDelete: async (a) => { store.set('snapshots', store.get().snapshots.filter((x) => x.id !== String(a.id))); return true; },
    activityGet: async () => store.get().activity.slice(-40).reverse(),
    ruleTest: async (a) => { const r = store.get().rules.find((x) => x.id === a.id); if (!r) throw new Error('Unknown rule'); return { ok: await engine.execute(r), total: r.actions.length }; },
    profilesList: async () => [...BUILTIN.map((b) => ({ name: b.name, icon: b.icon, desc: b.desc, builtin: true })), ...store.get().profiles.map((p) => ({ name: p.name, icon: '⭐', desc: 'Your saved profile', builtin: false }))],
    profileRun: async (a) => runProfile(String(a.name)),
    guardCapture: async (a) => {
      const ids = (Array.isArray(a.ids) ? a.ids : []).filter((id) => guardable.includes(id));
      const cur = await handlers.toggleGetMany({ ids }); return ids.filter((id) => typeof cur[id] === 'boolean').map((id) => ({ id, value: cur[id] }));
    },
    guardRun: async () => doGuard(),
    watchdogGet: async () => (store.get().settings.watchdog ? { enabled: true, ...watchdog.status() } : { enabled: false }),
    organizePlan: async () => { const moves = await files.organizePlan(folder('downloads')); return { count: moves.length, moves: moves.slice(0, 200).map((m) => ({ name: path.basename(m.from), cat: m.cat, size: m.size })), undoable: store.get().organizeLog.length }; },
    organizeApply: async () => {
      const { done, skipped } = await files.organizeApply(folder('downloads'));
      if (done.length) { store.setOrganizeLog(done); log(`Organized ${done.length} file${done.length === 1 ? '' : 's'} in Downloads`); }
      return { moved: done.length, skipped: skipped.length };
    },
    organizeUndo: async () => { const r = await files.organizeUndo(store.get().organizeLog); store.setOrganizeLog([]); log(`Undo: put ${r.restored} file${r.restored === 1 ? '' : 's'} back in Downloads`); return r; },
    dupScan: async (a) => {
      const minMB = [1, 10, 50, 100].includes(Number(a.minMB)) ? Number(a.minMB) : 10;
      return files.findDuplicates(folder(a.key), { minBytes: minMB * 1048576 });
    },
    wifiQr: async (a) => {
      const ssid = String(a.ssid || ''); if (!ssid || ssid.length > 64 || /[\u0000-\u001f]/.test(ssid)) throw new Error('Bad network name');
      const payload = wifiQrPayload(ssid, String(a.password || ''), !!a.password);
      return qr.toString(payload, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
    }
  };
  return { addSnapshot, snapDiff, clip, store, engine, watchdog, background, handlers: api, init, dispose, runAction, runProfile, runList, doGuard, notify, wifiQrPayload, BUILTIN, guardable, PLAN_GUIDS };
}
module.exports = { createIntegration, wifiQrPayload, BUILTIN, PLAN_GUIDS };
