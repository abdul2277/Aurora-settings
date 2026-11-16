// Updates Aurora itself. Two ways: pick a newer Aurora-Settings.exe you already have, or check a manifest URL you set
// (a small JSON file: { "version", "url", "sha256", "notes" }). Aurora never replaces itself without you pressing Apply.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const winget = require('./winget');
const { readStamp } = require('./buildstamp');

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const MIN = 20 * 1024 * 1024, MAX = 600 * 1024 * 1024;

function buildScript({ pids, src, dst, log }) {
  return `$ErrorActionPreference = 'Continue'
$log = ${q(log)}
function L($m) { try { Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + ' ' + $m) } catch {} }
L 'update started'
foreach ($id in @(${pids.map(Number).filter((n) => Number.isInteger(n) && n > 0).join(',')})) { try { Wait-Process -Id $id -Timeout 60 -ErrorAction SilentlyContinue } catch {} }
$src = ${q(src)}; $dst = ${q(dst)}; $ok = $false
for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
  try {
    if (Test-Path -LiteralPath $dst) { Copy-Item -LiteralPath $dst -Destination ($dst + '.old') -Force -ErrorAction Stop }
    Copy-Item -LiteralPath $src -Destination $dst -Force -ErrorAction Stop
    $ok = $true
  } catch { L ('retry ' + $i + ': ' + $_.Exception.Message); Start-Sleep -Milliseconds 500 }
}
if ($ok) { L 'replaced'; Remove-Item -LiteralPath $src -Force -ErrorAction SilentlyContinue } else { L 'FAILED: kept the old version' }
Start-Process -FilePath $dst
L 'restarted'`;
}

function createSelfUpdater({ exePath, isPortable, currentVersion, currentBuild = 0, dataDir, fetchFn = fetch, getUrl, quitApp, spawnFn = spawn, pids = () => [process.pid, process.ppid], shellPath = 'powershell.exe' }) {
  const dir = path.join(dataDir, 'update');
  const staged = path.join(dir, 'Aurora-Settings-new.exe');
  let status = { state: 'idle', percent: 0, message: '', info: null };
  const set = (s) => { status = { ...status, ...s }; };
  const busy = () => ['downloading', 'ready', 'applying'].includes(status.state); // a background check must not wipe a staged update

  const isExe = (file) => { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); return b[0] === 0x4d && b[1] === 0x5a; } finally { fs.closeSync(fd); } };
  const sha256File = (file) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (c) => h.update(c)).on('error', rej).on('end', () => res(h.digest('hex'))); });
  function validate(file) {
    const st = fs.statSync(file);
    if (!st.isFile()) throw new Error('That is not a file');
    if (st.size < MIN || st.size > MAX) throw new Error('That file is not the right size for Aurora Settings, so it was not used');
    if (!isExe(file)) throw new Error('That is not a Windows program, so it was not used');
    return st.size;
  }
  async function stage(file, extra = {}) {
    const size = validate(file);
    fs.mkdirSync(dir, { recursive: true });
    if (path.resolve(file) !== path.resolve(staged)) fs.copyFileSync(file, staged);
    const sha = await sha256File(staged);
    const tag = readStamp(staged);
    set({ state: 'ready', percent: 100, message: 'Ready to install', info: { ...extra, sha256: sha, sizeMB: Math.round(size / 1048576), verified: !!tag, buildVersion: tag ? tag.version : '', buildDate: tag ? tag.build * 60000 : 0 } });
    return status;
  }

  return {
    info: () => ({ version: currentVersion, portable: !!isPortable, url: getUrl() || '', status }),
    async check() {
      const url = getUrl();
      if (!url) throw new Error('Set an update address first, or use "Update from a file"');
      if (!/^https:\/\//i.test(url)) throw new Error('The update address must start with https://');
      if (!busy()) set({ state: 'checking', message: 'Checking...' });
      try {
        const res = await fetchFn(url, { headers: { 'user-agent': 'AuroraUpdater/1.0' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`The update address answered with HTTP ${res.status}`);
        const text = await res.text(); if (text.length > 100000) throw new Error('The update file is too big');
        let m; try { m = JSON.parse(text); } catch (_) { throw new Error('The update address did not return a valid update file'); }
        if (!m || typeof m.version !== 'string' || !/^\d+(\.\d+){1,3}$/.test(m.version)) throw new Error('The update file has no valid version');
        const newer = winget.compareVersions(m.version, currentVersion) > 0;
        const out = { latest: m.version, available: newer, notes: typeof m.notes === 'string' ? m.notes.slice(0, 1000) : '', url: typeof m.url === 'string' ? m.url : '', sha256: typeof m.sha256 === 'string' ? m.sha256 : '' };
        if (newer && (!/^https:\/\//i.test(out.url) || !/^[0-9a-f]{64}$/i.test(out.sha256))) throw new Error('The update file is missing a secure download link or its checksum, so Aurora will not use it');
        if (!busy()) set({ state: newer ? 'available' : 'idle', message: newer ? `Version ${m.version} is available` : 'You have the latest version', info: out });
        return out;
      } catch (e) { if (!busy()) set({ state: 'error', message: e.message }); throw e; }
    },
    async download() {
      if (status.state === 'downloading') throw new Error('A download is already running');
      const i = status.info; if (!i || !i.available) throw new Error('Check for an update first');
      set({ state: 'downloading', percent: 0, message: 'Downloading...' });
      try {
        fs.mkdirSync(dir, { recursive: true });
        await winget.download(i.url, staged, { fetchFn, expectedSha256: i.sha256, maxBytes: MAX, onProgress: (g, t) => set({ percent: t ? Math.round(g / t * 100) : 0, message: 'Downloading...' }) });
        return await stage(staged, { ...i });
      } catch (e) { set({ state: 'error', message: e.message }); throw e; }
    },
    async useFile(file) {
      try { return await stage(String(file), { latest: '', fromFile: path.basename(String(file)) }); } catch (e) { set({ state: 'error', message: e.message }); throw e; }
    },
    async apply() {
      if (status.state !== 'ready') throw new Error('Nothing is ready to install');
      if (!isPortable) throw new Error('Updating works in the portable Aurora-Settings.exe. Replace the program files by hand when you run from source.');
      validate(staged);
      const script = buildScript({ pids: pids(), src: staged, dst: exePath, log: path.join(dir, 'update.log') });
      const child = spawnFn(shellPath, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref(); set({ state: 'applying', message: 'Restarting...' });
      setTimeout(() => quitApp(), 400);
      return true;
    },
    // Looks for a newer Aurora-Settings*.exe you downloaded (compared by file date, since an .exe's version is not readable here).
    scanFolder(folder) {
      try {
        const self = path.resolve(exePath || ''); let best = null;
        for (const n of fs.readdirSync(folder)) {
          if (!/\.exe$/i.test(n)) continue; const f = path.join(folder, n); if (path.resolve(f) === self) continue;
          let st; try { st = fs.statSync(f); } catch (_) { continue; } if (!st.isFile() || st.size < MIN || st.size > MAX) continue;
          const tag = readStamp(f); if (!tag) continue; // only files that carry Aurora's own build tag are recognised
          const v = winget.compareVersions(tag.version, currentVersion);
          if (v < 0 || (v === 0 && tag.build <= currentBuild)) continue; // not newer than what is running
          if (!best || winget.compareVersions(tag.version, best.version) > 0 || (tag.version === best.version && tag.build > best.build)) best = { path: f, name: n, version: tag.version, build: tag.build, builtAt: tag.build * 60000, sizeMB: Math.round(st.size / 1048576) };
        }
        return best;
      } catch (_) { return null; }
    },
    discard() { try { fs.rmSync(staged, { force: true }); } catch (_) {} set({ state: 'idle', percent: 0, message: '', info: null }); return true; }
  };
}
module.exports = { createSelfUpdater, buildScript };
