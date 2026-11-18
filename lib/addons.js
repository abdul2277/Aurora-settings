// Aurora add-ons: small tools anyone can add. An add-on is a .zip with a manifest.json and a few web files.
// It runs in a sandboxed frame with no access to Aurora or Windows except the few things its manifest asks for
// and the user approved. This file holds the safe parts: validating a package, installing it, and serving its files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PERMISSIONS = { storage: 'Remember small amounts of data for itself', clipboard: 'Put text on your clipboard', notify: 'Show a desktop notification', system: 'See CPU and memory use (read-only)', screen: 'Change how your screen looks: tint, dim, spotlight, brightness (Ctrl+Alt+Shift+O clears it)' };
const ALLOWED_EXT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2' };
const LIMITS = { files: 200, totalBytes: 5 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, installed: 200, zipBytes: 20 * 1024 * 1024 };
const ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const RESERVED = new Set(['sdk', 'aurora', 'system', 'api', 'null', 'undefined']);

class AddonError extends Error {}
const bad = (m) => { throw new AddonError(m); };

function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) bad('manifest.json must be an object');
  const id = String(m.id || ''); if (!ID_RE.test(id) || RESERVED.has(id)) bad('The add-on id must be 3-40 lowercase letters, numbers or dashes (for example "my-tool")');
  const name = typeof m.name === 'string' ? m.name.trim() : ''; if (!name || name.length > 40) bad('The add-on needs a name of up to 40 characters');
  const version = typeof m.version === 'string' ? m.version : '1.0.0'; if (!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(version)) bad('The version should look like 1.0.0');
  const description = typeof m.description === 'string' ? m.description.trim().slice(0, 200) : '';
  const author = typeof m.author === 'string' ? m.author.trim().slice(0, 60) : '';
  const icon = typeof m.icon === 'string' && m.icon.length >= 1 && [...m.icon].length <= 3 && !/[<>&"'\u0000-\u001f]/.test(m.icon) ? m.icon : '🧩';
  const perms = Array.isArray(m.permissions) ? m.permissions : []; if (perms.length > 8) bad('Too many permissions');
  for (const p of perms) if (typeof p !== 'string' || !Object.prototype.hasOwnProperty.call(PERMISSIONS, p)) bad(`Unknown permission "${String(p).slice(0, 30)}"`);
  const entry = typeof m.entry === 'string' ? m.entry : 'index.html'; if (!safeRel(entry) || path.extname(entry).toLowerCase() !== '.html') bad('The entry page must be an .html file inside the add-on');
  return { id, name, version, description, author, icon, permissions: [...new Set(perms)], entry };
}
function safeRel(p) {
  if (typeof p !== 'string' || !p || p.length > 200 || p.includes('\\') || p.includes('\0') || p.startsWith('/') || /^[a-z]:/i.test(p)) return null;
  const parts = p.split('/'); if (parts.some((x) => !x || x === '.' || x === '..')) return null; return parts.join('/');
}

// files: Map of relative name -> Buffer (already extracted, still untrusted)
function checkPackage(files) {
  if (!files.has('manifest.json')) bad('The package has no manifest.json');
  if (files.size > LIMITS.files) bad('The package has too many files');
  let total = 0;
  for (const [name, buf] of files) {
    if (!safeRel(name)) bad(`The package contains an unsafe file name: ${name.slice(0, 60)}`);
    if (name !== 'manifest.json' && !Object.prototype.hasOwnProperty.call(ALLOWED_EXT, path.extname(name).toLowerCase())) bad(`File type not allowed in an add-on: ${name.slice(0, 60)}`);
    if (buf.length > LIMITS.fileBytes) bad(`"${name.slice(0, 40)}" is too large (limit 2 MB per file)`); total += buf.length;
  }
  if (total > LIMITS.totalBytes) bad('The package is too large (limit 5 MB)');
  let m; try { m = JSON.parse(files.get('manifest.json').toString('utf8')); } catch (_) { bad('manifest.json is not valid JSON'); }
  const manifest = validateManifest(m);
  if (!files.has(manifest.entry)) bad(`The entry page "${manifest.entry}" is missing from the package`);
  return { manifest, files, bytes: total };
}

function readZip(file) {
  const AdmZip = require('adm-zip'); const st = fs.statSync(file); if (!st.isFile() || st.size > LIMITS.zipBytes) bad('That file is not an add-on package (or it is too large)');
  let z; try { z = new AdmZip(file); } catch (_) { bad('That file is not a valid zip'); }
  const entries = z.getEntries().filter((e) => !e.isDirectory); if (entries.length > LIMITS.files) bad('The package has too many files');
  let total = 0; const files = new Map();
  for (const e of entries) { total += e.header.size; if (e.header.size > LIMITS.fileBytes || total > LIMITS.totalBytes) bad('The package is too large (limit 5 MB, 2 MB per file)'); if (e.header.compressedSize > 0 && e.header.size / e.header.compressedSize > 200 && e.header.size > 1048576) bad('The package looks like a zip bomb'); files.set(e.entryName, e.getData()); }
  return files;
}

function packageToZip(files) { const AdmZip = require('adm-zip'); const z = new AdmZip(); for (const [n, b] of files) z.addFile(n, b); return z.toBuffer(); }

function createInstaller(rootDir) {
  const dirOf = (id) => path.join(rootDir, id);
  return {
    install(pkg) { // pkg = checkPackage() result
      const dir = dirOf(pkg.manifest.id); const tmp = dir + '.tmp-' + crypto.randomBytes(4).toString('hex');
      fs.mkdirSync(tmp, { recursive: true });
      try { for (const [n, b] of pkg.files) { const t = path.resolve(tmp, n); if (!t.startsWith(path.resolve(tmp) + path.sep)) bad('Unsafe path'); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, b); } fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir); }
      catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
      return pkg.manifest;
    },
    remove(id) { if (!ID_RE.test(id)) bad('Unknown add-on'); fs.rmSync(dirOf(id), { recursive: true, force: true }); },
    // Used by the aurora-addon:// protocol. Never returns anything outside the add-on's own folder.
    readFile(id, rel) {
      if (!ID_RE.test(id)) return null; const r = safeRel(rel === '' ? 'index.html' : String(rel)); if (!r) return null;
      const ext = path.extname(r).toLowerCase(); if (!Object.prototype.hasOwnProperty.call(ALLOWED_EXT, ext) && r !== 'manifest.json') return null;
      const root = path.resolve(dirOf(id)); const full = path.resolve(root, r); if (!full.startsWith(root + path.sep)) return null;
      try { const st = fs.lstatSync(full); if (!st.isFile() || st.isSymbolicLink()) return null; return { data: fs.readFileSync(full), type: ALLOWED_EXT[ext] || 'application/json; charset=utf-8' }; } catch (_) { return null; }
    },
    exists: (id) => ID_RE.test(id) && fs.existsSync(dirOf(id))
  };
}

/* ---------- the small library every add-on can load: <script src="/__aurora.js"></script> ---------- */
const SDK = `(function(){var n=0,p={};window.addEventListener('message',function(e){var d=e.data;if(!d||d.aurora!==1||!p[d.id])return;var h=p[d.id];delete p[d.id];d.ok?h.r(d.result):h.j(new Error(d.error||'failed'))});
function call(m,a){return new Promise(function(r,j){var id=++n;p[id]={r:r,j:j};parent.postMessage({aurora:1,id:id,method:m,args:a||[]},'*');setTimeout(function(){if(p[id]){delete p[id];j(new Error('Aurora did not answer'))}},15000)})}
window.aurora={toast:function(t){return call('toast',[t])},theme:function(){return call('theme')},notify:function(t){return call('notify',[t])},copy:function(t){return call('clipboard.write',[t])},
storage:{get:function(k){return call('storage.get',[k])},set:function(k,v){return call('storage.set',[k,v])},remove:function(k){return call('storage.remove',[k])},keys:function(){return call('storage.keys')}},
system:{stats:function(){return call('system.stats')}},
screen:{overlay:function(o){return call('screen.overlay',[o])},clear:function(){return call('screen.clear')},getBrightness:function(){return call('screen.brightness.get')},setBrightness:function(v){return call('screen.brightness.set',[v])},warmth:function(k){return call('screen.warmth',[k])},reset:function(){return call('screen.reset')}}};
call('theme').then(function(t){document.documentElement.style.setProperty('--accent',t.accent);document.documentElement.dataset.theme=t.dark?'dark':'light'}).catch(function(){})})();`;
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

/* ---------- sample add-ons, built in code and installed through the same checks as any other package ---------- */
const BASE_CSS = ':root{--accent:#4cc2ff;--fg:#e8eaf0;--muted:#9aa4b5;--card:rgba(255,255,255,.06);--line:rgba(255,255,255,.16)}[data-theme=light]{--fg:#15171c;--muted:#5a6475;--card:rgba(0,0,0,.04);--line:rgba(0,0,0,.14)}html{color-scheme:dark}html[data-theme=light]{color-scheme:light}body{font:14px/1.5 system-ui,"Segoe UI",sans-serif;margin:0;padding:18px;color:var(--fg);background:transparent;animation:in .35s ease both}@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}h3{margin:0 0 12px;font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px}h3::before{content:\'\';width:4px;height:18px;border-radius:2px;background:linear-gradient(var(--accent),#c77dff)}p{margin:8px 0}button{font:inherit;font-weight:600;border-radius:12px;border:1px solid var(--line);background:var(--card);color:inherit;padding:8px 14px;cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}button:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.25);border-color:var(--accent)}button:active{transform:none}button.p{background:linear-gradient(135deg,var(--accent),#7c8cff);color:#06121c;border-color:transparent}button:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}input,textarea,select{font:inherit;border-radius:12px;border:1px solid var(--line);background:var(--card);color:inherit;padding:8px 10px;box-sizing:border-box;max-width:100%}textarea{width:100%;resize:vertical}input:focus,textarea:focus,select:focus,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}input[type=range]{padding:0;accent-color:var(--accent)}input[type=checkbox],input[type=radio]{accent-color:var(--accent)}input[type=color]{padding:2px;height:34px;width:48px;cursor:pointer}select option{color:#15171c}.big{font-size:44px;font-weight:800;line-height:1.1;background:linear-gradient(135deg,var(--accent),#c77dff);-webkit-background-clip:text;background-clip:text;color:transparent}.muted{color:var(--muted)}code,pre{font-family:Consolas,ui-monospace,monospace;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:2px 6px}hr{border:0;border-top:1px solid var(--line);margin:16px 0}table{border-collapse:collapse}th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left}mark{background:rgba(255,214,102,.35);color:inherit;border-radius:4px;padding:0 2px}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px}canvas{max-width:100%}@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';
const pack = (manifest, html) => new Map([['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2))], ['index.html', Buffer.from(html)], ['style.css', Buffer.from(BASE_CSS)]]);
const page = (body, script) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"><script src="/__aurora.js"></script></head><body>${body}<script>${script}</script></body></html>`;
const SAMPLES = {
  tally: () => pack({ id: 'tally', name: 'Tally counter', version: '1.0.0', icon: '🔢', description: 'A counter that remembers its number.', author: 'Aurora', permissions: ['storage'] }, page('<h3>Tally counter</h3><div class="big" id="n">0</div><p><button class="p" id="plus">+1</button> <button id="minus">−1</button> <button id="reset">Reset</button></p>', "var n=0;function show(){document.getElementById('n').textContent=n}aurora.storage.get('n').then(function(v){n=Number(v)||0;show()});function save(){show();aurora.storage.set('n',n)}document.getElementById('plus').onclick=function(){n++;save()};document.getElementById('minus').onclick=function(){n--;save()};document.getElementById('reset').onclick=function(){n=0;save();aurora.toast('Reset')};")),
  cleanpaste: () => pack({ id: 'clean-paste', name: 'Clean paste', version: '1.0.0', icon: '🧽', description: 'Tidy text and copy it back to the clipboard.', author: 'Aurora', permissions: ['clipboard'] }, page('<h3>Clean paste</h3><textarea id="t" rows="6" placeholder="Paste messy text here"></textarea><p><button class="p" id="go">Tidy and copy</button></p>', "document.getElementById('go').onclick=function(){var t=document.getElementById('t').value.replace(/[\\u200B-\\u200D\\uFEFF]/g,'').replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();document.getElementById('t').value=t;aurora.copy(t).then(function(){aurora.toast('Copied the tidy text')})};")),
  glance: () => pack({ id: 'system-glance', name: 'System glance', version: '1.0.0', icon: '📈', description: 'Live processor and memory use.', author: 'Aurora', permissions: ['system'] }, page('<h3>System glance</h3><p>Processor <b id="c">-</b></p><p>Memory <b id="r">-</b></p>', "function t(){aurora.system.stats().then(function(s){document.getElementById('c').textContent=s.cpu+'%';document.getElementById('r').textContent=Math.round(s.ramUsed/s.ramTotal*100)+'%'}).catch(function(e){document.getElementById('c').textContent=e.message})}t();setInterval(t,2000);"))
};
const TEMPLATE = (name) => page(`<h3>${name.replace(/[<>&"]/g, '')}</h3><p>Edit this page to build your own tool.</p><button class="p" id="b">Say hello</button>`, "document.getElementById('b').onclick=function(){aurora.toast('Hello from my add-on')};");

module.exports = { PERMISSIONS, ALLOWED_EXT, LIMITS, ID_RE, AddonError, validateManifest, safeRel, checkPackage, readZip, packageToZip, createInstaller, SDK, CSP, SAMPLES, TEMPLATE, BASE_CSS, pack, page };
Object.assign(SAMPLES, require('./addon-samples').SAMPLES); // optional extras, defined in their own file
{ const libMod = require('./addon-library'); require('./addon-library2'); require('./addon-library3'); require('./addon-library4'); require('./addon-library5'); require('./addon-library6'); require('./addon-library7'); require('./addon-library8'); require('./addon-library9'); require('./addon-library10'); libMod.refresh(); Object.assign(SAMPLES, libMod.LIBRARY); } // the one-click library
