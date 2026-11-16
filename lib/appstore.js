// Aurora Store engine: catalog + install queue + records. Everything that touches Windows or the network is injected
// (source, fetchFn, runner), so the whole flow is testable on any machine with real manifests and local servers.
const fs = require('fs');
const path = require('path');
const winget = require('./winget');
const { CATALOG, CATEGORIES } = require('./catalog');

const quoteArgs = (args) => args.map((a) => (/\s/.test(a) && !/^".*"$/.test(a) ? `"${a}"` : a)).join(' ');
const stripQuotes = (s) => String(s).replace(/^"(.*)"$/, '$1');
const inside = (root, p) => { const r = path.resolve(root), f = path.resolve(p); return f === r || f.startsWith(r + path.sep); };
const numericPrefix = (v) => (String(v).match(/^\d+(?:\.\d+)*/) || [''])[0];

/* ---------- production data source: the public winget community repository on GitHub ---------- */
function githubSource({ fetchFn = fetch, ttlMs = 6 * 3600e3, now = () => Date.now(), repo = 'microsoft/winget-pkgs', branch = 'master', token = '' } = {}) {
  const cache = new Map();
  const get = async (url, accept) => {
    const headers = { 'user-agent': 'AuroraStore/1.0', accept }; if (token && /^https:\/\/api\.github\.com\//.test(url)) headers.authorization = 'Bearer ' + token; // optional: lifts the 60-per-hour anonymous limit
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(20000) });
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
      const mins = reset ? Math.max(1, Math.ceil((reset - now()) / 60000)) : null;
      const err = new Error('GitHub is limiting how often Aurora can look up apps. ' + (mins ? `Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` : 'Try again later.')); err.rateLimited = true; throw err;
    }
    return res;
  };
  return {
    refresh() { cache.clear(); }, // a manual "Check for updates" must see versions published in the last few hours
    async list(dir) {
      const hit = cache.get(dir); if (hit && now() - hit.t < ttlMs) return hit.v;
      const res = await get(`https://api.github.com/repos/${repo}/contents/${dir.split('/').map(encodeURIComponent).join('/')}?ref=${branch}`, 'application/vnd.github+json');
      if (res.status === 404) return [];
      if (!res.ok) throw new Error('Could not reach the app catalog (HTTP ' + res.status + ')');
      const json = await res.json();
      const names = Array.isArray(json) ? json.filter((e) => e.type === 'dir' && /^[A-Za-z0-9][\w.+-]*$/.test(e.name)).map((e) => e.name) : [];
      cache.set(dir, { t: now(), v: names }); return names;
    },
    async read(file) {
      const hit = cache.get(file); if (hit && now() - hit.t < ttlMs) return hit.v;
      const res = await get(`https://raw.githubusercontent.com/${repo}/${branch}/${file.split('/').map(encodeURIComponent).join('/')}`, 'text/plain');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Could not reach the app catalog (HTTP ' + res.status + ')');
      const text = await res.text(); cache.set(file, { t: now(), v: text }); return text;
    }
  };
}

// Replaces `target` with the freshly built `work` folder. If anything goes wrong the old folder is put back.
function swapFolder(work, target) {
  const backup = target + '.old'; let moved = false;
  fs.rmSync(backup, { recursive: true, force: true });
  try { if (fs.existsSync(target)) { fs.renameSync(target, backup); moved = true; } fs.renameSync(work, target); }
  catch (e) {
    try { if (moved) { fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(backup, target); } } catch (_) { /* best effort */ }
    throw new Error('Could not replace the old version. Close the app if it is open, then try again.');
  }
  try { fs.rmSync(backup, { recursive: true, force: true }); } catch (_) { /* leftover is cleaned next time */ }
}

function createAppStore({ source, fetchFn = fetch, dataDir, appsDir, runner, catalog = CATALOG, now = () => Date.now(), arch = 'x64' }) {
  const stateFile = path.join(dataDir, 'appstore.json');
  const dlRoot = path.join(dataDir, 'downloads');
  let state = { installed: {}, custom: [] };
  try { const j = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (j && typeof j === 'object') state = { installed: (j.installed && typeof j.installed === 'object') ? j.installed : {}, custom: Array.isArray(j.custom) ? j.custom.filter((c) => c && winget.ID_RE.test(c.id)) : [] }; } catch (_) {}
  const save = () => { fs.mkdirSync(dataDir, { recursive: true }); const t = stateFile + '.tmp'; fs.writeFileSync(t, JSON.stringify(state, null, 1)); fs.renameSync(t, stateFile); };
  try { fs.rmSync(dlRoot, { recursive: true, force: true }); } catch (_) {} // leftovers from an interrupted install

  const apps = () => [...catalog, ...state.custom.filter((c) => !catalog.some((a) => a.id === c.id))];
  const findApp = (id) => apps().find((a) => a.id === id);
  const jobs = new Map(); let seq = 0; const queue = []; let running = false;
  const manifests = new Map();
  async function getManifest(id) {
    const hit = manifests.get(id); if (hit && now() - hit.t < 3600e3) return hit.v;
    const version = await winget.latestVersion(source, id);
    const m = await winget.loadManifest(source, id, version);
    const inst = winget.pickInstaller(m.installer, { arch });
    const v = { version, manifest: m, inst, plan: winget.installPlan(inst) };
    manifests.set(id, { t: now(), v }); return v;
  }

  /* ----- installed detection ----- */
  let scanCache = { t: 0, v: [] };
  async function scan(force) {
    if (!force && now() - scanCache.t < 20000) return scanCache.v;
    const v = await runner.listInstalled(); scanCache = { t: now(), v }; return v;
  }
  const detect = (app, list) => { try { const re = new RegExp(app.match || '^\\0', 'i'); return list.find((e) => re.test(e.name)); } catch (_) { return null; } };

  async function listApps() {
    let list = []; try { list = await scan(); } catch (_) {}
    return {
      categories: CATEGORIES,
      apps: apps().map((a) => {
        const rec = state.installed[a.id]; const hit = rec ? null : detect(a, list);
        const job = [...jobs.values()].reverse().find((j) => j.appId === a.id && ['queued', 'working'].includes(j.status));
        return { ...a, custom: !!a.custom, installed: !!(rec || hit), version: rec ? rec.version : (hit ? hit.version : ''), via: rec ? 'aurora' : (hit ? 'system' : ''), jobId: job ? job.id : null };
      })
    };
  }

  /* ----- jobs ----- */
  const publicJob = (j) => ({ id: j.id, appId: j.appId, name: j.name, action: j.action, status: j.status, step: j.step, percent: j.percent, error: j.error || '', note: j.note || '', cancellable: j.status === 'queued' || (j.status === 'working' && j.cancellable) });
  const setStep = (j, step, percent) => { j.step = step; if (percent != null) j.percent = percent; };
  function enqueue(appId, name, action, fn) {
    for (const j of jobs.values()) if (j.appId === appId && ['queued', 'working'].includes(j.status)) return j.id; // already in progress
    const j = { id: 'j' + (++seq), appId, name, action, status: 'queued', step: 'Waiting', percent: 0, ctrl: new AbortController(), cancellable: true, fn };
    jobs.set(j.id, j); queue.push(j); pump();
    if (jobs.size > 60) for (const [k, v] of jobs) { if (jobs.size <= 40) break; if (!['queued', 'working'].includes(v.status)) jobs.delete(k); }
    return j.id;
  }
  async function pump() {
    if (running) return; running = true;
    try {
      while (queue.length) {
        const j = queue.shift(); if (j.status !== 'queued') continue;
        j.status = 'working';
        try { await j.fn(j); if (j.status === 'working') { j.status = 'done'; j.percent = 100; } }
        catch (e) { if (j.ctrl.signal.aborted) { j.status = 'cancelled'; j.step = 'Cancelled'; } else { j.status = 'error'; j.error = String((e && e.message) || e).split('\n')[0].slice(0, 300); j.step = 'Failed'; } }
      }
    } finally { running = false; }
  }
  const cancel = (jobId) => {
    const j = jobs.get(jobId); if (!j) throw new Error('Unknown job');
    if (j.status === 'queued') { j.status = 'cancelled'; j.step = 'Cancelled'; return true; }
    if (j.status === 'working' && j.cancellable) { j.ctrl.abort(); return true; }
    throw new Error('Too late to cancel: the installer is already running');
  };

  /* ----- install ----- */
  async function runInstall(j, app) {
    setStep(j, 'Looking up the official package…', 3);
    const { version, manifest, inst, plan } = await getManifest(app.id);
    if (plan.unsupported) throw new Error(`${app.name} ${plan.unsupported}`);
    if (j.ctrl.signal.aborted) throw new Error('cancelled');
    const dir = path.join(dlRoot, app.id.replace(/[^\w.-]/g, '_') + '-' + version);
    const file = path.join(dir, winget.safeFileName(inst.InstallerUrl, 'installer.bin'));
    try {
      setStep(j, 'Downloading…', 5);
      await winget.download(inst.InstallerUrl, file, { fetchFn, expectedSha256: inst.InstallerSha256, signal: j.ctrl.signal, onProgress: (got, total) => { if (total) j.percent = 5 + Math.round((got / total) * 70); j.step = 'Downloading' + (total ? ` ${Math.round(got / 1048576)} / ${Math.round(total / 1048576)} MB` : ''); } });
      if (j.ctrl.signal.aborted) throw new Error('cancelled');
      j.cancellable = false; setStep(j, 'Checking the signature…', 78);
      let sig = null; if (['msi', 'exe', 'msix'].includes(plan.kind)) { try { sig = await runner.signature(file); } catch (_) {} }
      if (sig && sig.status === 'HashMismatch') throw new Error('The installer is damaged or was modified, so it was not run');
      if (sig && sig.signer) j.note = 'Signed by ' + sig.signer; else if (sig && sig.status === 'NotSigned') j.note = 'The publisher did not sign this installer (the checksum still matched)';
      const before = plan.kind === 'msi' || plan.kind === 'exe' ? await runner.listInstalled().catch(() => []) : [];
      const rec = { id: app.id, name: app.name, version, kind: plan.kind, type: String(inst.InstallerType || '').toLowerCase(), installedAt: new Date(now()).toISOString() };
      setStep(j, 'Installing…', 82);
      if (plan.kind === 'msi' || plan.kind === 'exe') {
        const admin = winget.needsAdmin(inst);
        const [exe, args] = plan.kind === 'msi' ? ['msiexec.exe', ['/i', file, ...plan.args, ...plan.custom]] : [file, [...plan.args, ...plan.custom]];
        if (admin) j.step = 'Waiting for your permission (Windows asks before installing)…';
        const code = await runner.run({ file: exe, args, admin });
        if (!winget.successCodes(inst).includes(code)) throw new Error(code === 1223 ? 'You declined the permission prompt' : `The installer stopped with code ${code}`);
        rec.admin = admin; rec.rebootNote = code === 3010 || code === 1641;
        const after = await runner.listInstalled().catch(() => []); scanCache = { t: 0, v: [] };
        const keys = new Set(before.map((e) => e.key));
        const fresh = after.filter((e) => !keys.has(e.key));
        const aft = (manifest.installer.AppsAndFeaturesEntries || inst.AppsAndFeaturesEntries || [])[0] || {};
        const pick = fresh.find((e) => e.name === aft.DisplayName) || fresh[0] || after.find((e) => e.name === aft.DisplayName) || detect(app, after);
        if (pick) { rec.key = pick.key; if (pick.version) rec.version = pick.version; }
        if (inst.ProductCode && /^\{[0-9A-Fa-f-]{36}\}$/.test(inst.ProductCode)) rec.productCode = inst.ProductCode;
      } else if (plan.kind === 'msix') {
        await runner.msixInstall(file); rec.pfn = inst.PackageFamilyName || '';
      } else {
        const target = path.join(appsDir, app.id.replace(/[^\w.-]/g, '_'));
        if (!inside(appsDir, target) || target === path.resolve(appsDir)) throw new Error('Bad install folder');
        // Build the new copy next to the old one and swap at the end, so a failed update never destroys a working app.
        const work = target + '.new';
        fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
        let built;
        try {
        if (plan.kind === 'portable') {
          const alias = (inst.Commands && inst.Commands[0]) || app.id.split('.').pop();
          const nm = /\.exe$/i.test(file) ? path.basename(file) : alias.replace(/[^\w.-]/g, '_') + '.exe';
          built = path.join(work, nm); fs.copyFileSync(file, built);
        } else {
          await runner.expand(file, work);
          const rel = ((inst.NestedInstallerFiles || [])[0] || {}).RelativeFilePath;
          if (!rel) throw new Error('The package does not say which file starts the app');
          built = path.resolve(work, String(rel).split('\\').join('/'));
          if (!inside(work, built) || !fs.existsSync(built)) throw new Error('The program file was not found inside the download');
        }
        swapFolder(work, target);
        } catch (e) { try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {} throw e; } // never leave a half-unpacked app behind
        const exePath = path.join(target, path.relative(work, built));
        rec.dir = target; rec.exe = exePath;
        try { rec.shortcut = await runner.shortcut(app.name, exePath); } catch (_) { rec.shortcut = ''; }
      }
      state.installed[app.id] = rec; save();
      setStep(j, rec.rebootNote ? 'Installed — restart your PC to finish' : 'Installed', 100);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  }
  function install(id) {
    const app = findApp(id); if (!app) throw new Error('Unknown app');
    return enqueue(id, app.name, state.installed[id] ? 'update' : 'install', (j) => runInstall(j, app));
  }

  /* ----- uninstall ----- */
  async function runUninstall(j, app) {
    const rec = state.installed[app.id];
    setStep(j, 'Removing…', 20);
    j.cancellable = false;
    if (rec && rec.dir) {
      if (!inside(appsDir, rec.dir) || path.resolve(rec.dir) === path.resolve(appsDir)) throw new Error('Refusing to remove a folder outside Aurora\'s apps');
      fs.rmSync(rec.dir, { recursive: true, force: true });
      if (rec.shortcut) try { await runner.removeShortcut(rec.shortcut); } catch (_) {}
    } else if (rec && rec.kind === 'msix') {
      if (!rec.pfn) throw new Error('Unknown package name'); await runner.msixRemove(rec.pfn);
    } else {
      const list = await scan(true);
      const e = (rec && rec.key && list.find((x) => x.key === rec.key)) || detect(app, list);
      if (!e) { if (rec) { delete state.installed[app.id]; save(); return; } throw new Error('This app does not look installed'); }
      const type = rec ? rec.type : '';
      let file, args = [];
      const guid = /\{[0-9A-Fa-f-]{36}\}/.exec(e.uninstall || '') || (rec && rec.productCode ? [rec.productCode] : null);
      if (/msiexec/i.test(e.uninstall || '') && guid) { file = 'msiexec.exe'; args = ['/x', guid[0], '/qn', '/norestart']; }
      else if (e.quiet) { const t = winget.splitArgs(e.quiet); file = stripQuotes(t[0]); args = t.slice(1); }
      else if (e.uninstall) {
        const t = winget.splitArgs(e.uninstall); file = stripQuotes(t[0]); args = t.slice(1);
        if (type === 'inno' || /unins\d*\.exe$/i.test(file)) args.push('/VERYSILENT', '/NORESTART'); else if (type === 'nullsoft') args.push('/S');
      } else throw new Error('This app has no uninstaller Aurora can run');
      setStep(j, 'Waiting for your permission (Windows asks before removing)…', 40);
      const code = await runner.run({ file, args, admin: !rec || rec.admin !== false });
      if (![0, 3010, 1641].includes(code)) throw new Error(code === 1223 ? 'You declined the permission prompt' : `The uninstaller stopped with code ${code}`);
    }
    delete state.installed[app.id]; save(); scanCache = { t: 0, v: [] };
    setStep(j, 'Removed', 100);
  }
  function uninstall(id) {
    const app = findApp(id); if (!app) throw new Error('Unknown app');
    return enqueue(id, app.name, 'uninstall', (j) => runUninstall(j, app));
  }

  /* ----- add any package id / details / updates ----- */
  async function add(id) {
    id = String(id || '').trim();
    if (!winget.ID_RE.test(id) || !id.includes('.')) throw new Error('A package id looks like Publisher.App (for example Mozilla.Firefox)');
    const hit = findApp(id); if (hit) return hit;
    const { manifest, plan, version } = await getManifest(id);
    if (plan.unsupported) throw new Error('That app ' + plan.unsupported);
    const loc = manifest.locale || {};
    const app = { id, name: String(loc.PackageName || id.split('.').pop()).slice(0, 60), category: 'Added by you', icon: '📦', desc: String(loc.ShortDescription || '').slice(0, 200), match: '', custom: true };
    state.custom.push(app); save(); void version; return app;
  }
  function removeCustom(id) {
    if (state.installed[id]) throw new Error('Uninstall it first');
    state.custom = state.custom.filter((c) => c.id !== id); save(); return true;
  }
  async function info(id) {
    const app = findApp(id); if (!app) throw new Error('Unknown app');
    const { version, manifest, inst, plan } = await getManifest(id);
    const loc = manifest.locale || {};
    return { id, name: app.name, latest: version, publisher: loc.Publisher || '', license: loc.License || '', homepage: /^https:\/\//.test(loc.PackageUrl || '') ? loc.PackageUrl : '', description: loc.ShortDescription || app.desc || '',
      installerType: String(inst.InstallerType || ''), needsAdmin: winget.needsAdmin(inst), supported: !plan.unsupported, reason: plan.unsupported || '', download: inst.InstallerUrl ? new URL(inst.InstallerUrl).host : '' };
  }
  // Checks every installed app (4 at a time). One app failing never hides the rest; a GitHub rate limit stops early and is reported.
  async function updatesReport({ aurora = false, force = false } = {}) {
    if (force) { manifests.clear(); if (source.refresh) source.refresh(); }
    const list = await scan(true).catch(() => []); const todo = [];
    for (const a of apps()) {
      const rec = state.installed[a.id]; if (aurora && !rec) continue; // background checks only cover apps Aurora installed (keeps GitHub lookups low)
      const hit = rec ? null : detect(a, list);
      const cur = rec ? rec.version : (hit && hit.version); if (cur) todo.push({ a, cur });
    }
    const out = [], errors = []; let limited = '', next = 0;
    const worker = async () => {
      while (next < todo.length && !limited) {
        const { a, cur } = todo[next++];
        try {
          const { version } = await getManifest(a.id); const x = numericPrefix(cur), y = numericPrefix(version);
          if (x && y && winget.compareVersions(x, y) < 0) out.push({ id: a.id, name: a.name, installed: cur, latest: version });
        } catch (e) { if (e && e.rateLimited) limited = e.message; else errors.push({ id: a.id, error: String((e && e.message) || e).slice(0, 200) }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
    out.sort((p, q) => p.name.localeCompare(q.name));
    return { updates: out, errors, limited, checked: todo.length, at: now() };
  }
  async function updates(o) { const r = await updatesReport(o); if (r.limited && !r.updates.length) throw new Error(r.limited); return r.updates; }

  return { listApps, install, uninstall, cancel, jobs: () => [...jobs.values()].map(publicJob), add, removeCustom, info, updates: (o) => updates(o), updatesReport: (o) => updatesReport(o), _state: () => state, _idle: async () => { while (running || queue.length) await new Promise((r) => setTimeout(r, 5)); } };
}

module.exports = { createAppStore, githubSource, quoteArgs, stripQuotes, inside, numericPrefix, swapFolder };
