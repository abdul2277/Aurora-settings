// Reads Windows Package Manager community manifests and works out how to install an app. Pure logic: the data source,
// downloader and installer runner are injected, so everything here is testable with real manifests and local servers.
const YAML = require('yaml');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9+._-]{0,127}$/;
const baseDir = (id) => `manifests/${id[0].toLowerCase()}/${id.split('.').join('/')}`;
const manifestFile = (id, ver, suffix) => `${baseDir(id)}/${ver}/${id}${suffix}`;

function compareVersions(a, b) {
  const ta = String(a).split(/[^A-Za-z0-9]+/).filter(Boolean), tb = String(b).split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const x = ta[i], y = tb[i];
    if (x === undefined) return -1; if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { const d = Number(x) - Number(y); if (d) return d < 0 ? -1 : 1; }
    else if (nx !== ny) return nx ? 1 : -1; // numbers outrank words
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
const isPrerelease = (v) => /(alpha|beta|\brc|preview|nightly|canary|insider|snapshot|pre[-.]?release|\bdev\b)/i.test(v);

// `source` = { list(dirPath) -> [names], read(filePath) -> text | null }
async function latestVersion(source, id, { maxTries = 6 } = {}) {
  if (!ID_RE.test(id)) throw new Error('Bad package id');
  const names = (await source.list(baseDir(id))).filter((n) => /^\d/.test(n));
  if (!names.length) throw new Error('No versions found for ' + id);
  const stable = names.filter((n) => !isPrerelease(n)).sort(compareVersions).reverse();
  const order = stable.length ? stable : names.sort(compareVersions).reverse();
  let tries = 0;
  for (const v of order) { // a folder could be a sub-package that merely looks like a version: confirm it really holds an installer manifest
    if (tries++ >= maxTries) break;
    if (await source.read(manifestFile(id, v, '.installer.yaml'))) return v;
  }
  throw new Error('No installable version found for ' + id);
}

async function loadManifest(source, id, version) {
  const inst = await source.read(manifestFile(id, version, '.installer.yaml'));
  if (!inst) throw new Error('Manifest not found');
  const installer = YAML.parse(inst);
  let locale = null;
  try {
    const ver = YAML.parse((await source.read(manifestFile(id, version, '.yaml'))) || '{}');
    const loc = await source.read(manifestFile(id, version, `.locale.${ver.DefaultLocale || 'en-US'}.yaml`));
    if (loc) locale = YAML.parse(loc);
  } catch (_) { /* description is optional */ }
  return { installer, locale };
}

const SUPPORTED = ['msi', 'wix', 'nullsoft', 'inno', 'burn', 'exe', 'portable', 'msix', 'appx', 'zip'];
function mergeEntry(root, entry) {
  const m = { ...root, ...entry };
  delete m.Installers;
  m.InstallerSwitches = { ...(root.InstallerSwitches || {}), ...(entry.InstallerSwitches || {}) };
  return m;
}
// Choose the best installer entry for a 64-bit PC.
function pickInstaller(manifest, { arch = 'x64' } = {}) {
  const list = (manifest.Installers || []).map((e) => mergeEntry(manifest, e));
  const archRank = { [arch]: 0, neutral: 1, x86: 2 };
  let cand = list.filter((e) => (e.Architecture || 'neutral') in archRank);
  if (!cand.length) throw new Error('No installer for this PC (' + arch + ')');
  const locales = [...new Set(cand.map((e) => e.InstallerLocale).filter(Boolean))];
  if (locales.length > 1) { const pref = locales.find((l) => /^en-US$/i.test(l)) || locales.find((l) => /^en/i.test(l)); if (pref) cand = cand.filter((e) => !e.InstallerLocale || e.InstallerLocale === pref); }
  const typeOf = (e) => String(e.InstallerType || '').toLowerCase();
  const rank = (e) => archRank[e.Architecture || 'neutral'] * 100 + (e.Scope === 'user' ? 0 : e.Scope === 'machine' ? 10 : 5) + (SUPPORTED.includes(typeOf(e)) ? 0 : 50) + (e.ElevationRequirement === 'elevationProhibited' ? -1 : 0);
  cand.sort((a, b) => rank(a) - rank(b));
  return cand[0];
}

const splitArgs = (s) => (String(s).match(/"[^"]*"|\S+/g) || []);
const hasPlaceholder = (s) => /<[A-Z_]+>/.test(String(s));
// How to run the installer silently. Returns { kind, args } or { unsupported: reason }.
function installPlan(inst) {
  const type = String(inst.InstallerType || '').toLowerCase();
  const sw = inst.InstallerSwitches || {};
  const manifestSilent = sw.Silent || sw.SilentWithProgress;
  if (manifestSilent && hasPlaceholder(manifestSilent)) return { unsupported: 'needs an install folder choice' };
  const custom = sw.Custom && !hasPlaceholder(sw.Custom) ? splitArgs(sw.Custom) : [];
  switch (type) {
    case 'msi': case 'wix': return { kind: 'msi', args: manifestSilent ? splitArgs(manifestSilent) : ['/qn', '/norestart'], custom };
    case 'nullsoft': return { kind: 'exe', args: manifestSilent ? splitArgs(manifestSilent) : ['/S'], custom };
    case 'inno': return { kind: 'exe', args: manifestSilent ? splitArgs(manifestSilent) : ['/SP-', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], custom };
    case 'burn': return { kind: 'exe', args: manifestSilent ? splitArgs(manifestSilent) : ['/quiet', '/norestart'], custom };
    case 'exe': return manifestSilent ? { kind: 'exe', args: splitArgs(manifestSilent), custom } : { unsupported: 'has no silent install switch' };
    case 'msix': case 'appx': return { kind: 'msix', args: [], custom: [] };
    case 'portable': return { kind: 'portable', args: [], custom: [] };
    case 'zip': {
      const nt = String(inst.NestedInstallerType || '').toLowerCase();
      return nt === 'portable' ? { kind: 'zip-portable', args: [], custom: [] } : { unsupported: 'a zipped installer (not supported yet)' };
    }
    default: return { unsupported: 'an installer type Aurora cannot run yet (' + (type || 'unknown') + ')' };
  }
}
const needsAdmin = (inst) => {
  const t = String(inst.InstallerType || '').toLowerCase();
  if (['portable', 'zip', 'msix', 'appx'].includes(t)) return false;
  if (inst.ElevationRequirement === 'elevationRequired') return true;
  if (inst.ElevationRequirement === 'elevationProhibited' || inst.ElevationRequirement === 'elevatesSelf') return false;
  return inst.Scope === 'machine' || t === 'msi' || t === 'wix';
};
const successCodes = (inst) => [...new Set([0, 3010, 1641, ...((inst.InstallerSuccessCodes || []).filter(Number.isInteger))])];

/* ---------- download with SHA-256 verification ---------- */
async function download(url, dest, { fetchFn = fetch, expectedSha256, maxBytes = 3 * 1024 ** 3, onProgress = () => {}, signal } = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('Only secure (https) downloads are allowed');
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256 || '')) throw new Error('The package has no checksum, so Aurora will not install it');
  const res = await fetchFn(url, { redirect: 'follow', signal, headers: { 'user-agent': 'AuroraStore/1.0' } });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  if (res.url && !/^https:\/\//i.test(res.url)) throw new Error('The download was redirected to an insecure address');
  const total = Number(res.headers.get('content-length')) || 0;
  if (total > maxBytes) throw new Error('The download is larger than Aurora allows');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const hash = crypto.createHash('sha256'); const out = fs.createWriteStream(dest); let got = 0;
  let streamError = null; out.on('error', (e) => { streamError = e; }); // always listened to: an unhandled stream error would crash the whole app
  const drain = () => new Promise((resolve, reject) => { const ok = () => { out.off('error', bad); resolve(); }; const bad = (e) => { out.off('drain', ok); reject(e); }; out.once('drain', ok); out.once('error', bad); });
  try {
    for await (const chunk of res.body) {
      if (streamError) throw streamError;
      got += chunk.length; if (got > maxBytes) throw new Error('The download is larger than Aurora allows');
      hash.update(chunk); if (!out.write(chunk)) await drain(); onProgress(got, total);
    }
    await new Promise((resolve, reject) => { out.once('error', reject); out.end(() => resolve()); });
    if (streamError) throw streamError;
  } catch (e) { out.destroy(); try { fs.rmSync(dest, { force: true }); } catch (_) {} throw (e && e.code && !e.message.includes('Aurora') ? new Error('Could not save the download (' + e.code + '). Check free disk space.') : e); }
  const actual = hash.digest('hex');
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) { try { fs.rmSync(dest, { force: true }); } catch (_) {} throw new Error('The downloaded file does not match its official checksum, so it was deleted and NOT installed'); }
  return { bytes: got, sha256: actual };
}
const safeFileName = (u, fallback) => { try { const n = decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); const clean = n.replace(/[^\w.\- ()+]/g, '_').slice(0, 120); return clean || fallback; } catch (_) { return fallback; } };

module.exports = { ID_RE, baseDir, manifestFile, compareVersions, isPrerelease, latestVersion, loadManifest, pickInstaller, installPlan, needsAdmin, successCodes, download, safeFileName, SUPPORTED, splitArgs };
