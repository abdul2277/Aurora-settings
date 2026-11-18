// Crash safety net. Reports are saved under the user data folder, the Windows user name is removed from paths, only the newest 20 are kept,
// and the person sees at most one message every few seconds, with a button to copy the report. Nothing here ever throws.
const fs = require('fs'); const path = require('path'); const os = require('os');

function redact(text, userName) {
  let t = String(text == null ? '' : text);
  t = t.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n:*?"<>|]+/gi, '$1<user>').replace(/(\/(?:home|Users)\/)[^/\r\n]+/g, '$1<user>');
  let name = userName; if (name === undefined) { try { name = os.userInfo().username; } catch (_) { name = ''; } }
  if (name && name.length > 2) t = t.split(name).join('<user>');
  return t;
}
function buildReport({ err, version = '', platform = process.platform, release = '', electron = '', page = '', now = new Date(), userName } = {}) {
  const msg = (err && (err.stack || err.message)) || String(err);
  const lines = ['AURORA SETTINGS CRASH REPORT', 'Version: ' + version, 'Time: ' + now.toISOString(), 'System: ' + platform + ' ' + release, 'Electron: ' + electron, 'Page: ' + (page || '(unknown)'), '', msg.length > 6000 ? msg.slice(0, 6000) + ' ...' : msg, '',
    'No personal files or settings are included. Your Windows user name was removed from paths.'];
  return redact(lines.join('\r\n'), userName);
}
function trim(dir, keep = 20) { try { const files = fs.readdirSync(dir).filter((f) => /^crash-.*\.txt$/.test(f)).sort().reverse(); for (const f of files.slice(keep)) { try { fs.rmSync(path.join(dir, f), { force: true }); } catch (_) {} } } catch (_) {} }
let seq = 0;
function save(dir, report, now = new Date()) {
  try { fs.mkdirSync(dir, { recursive: true }); const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-'); const file = path.join(dir, `crash-${stamp}-${String(++seq).padStart(4, '0')}.txt`); fs.writeFileSync(file, report, { flag: 'wx' }); trim(dir, 20); return file; } catch (_) { return null; }
}
// show(text, file) is supplied by the app (a dialog with a Copy button). Returns the handler to attach to process 'uncaughtException' / 'unhandledRejection'.
function createReporter({ dir, version, electron, release, show, now = () => new Date(), cooldownMs = 5000, getPage = () => '' }) {
  let last = 0, showing = false;
  return function report(err) {
    let file = null;
    try { file = save(dir, buildReport({ err, version, electron, release, page: getPage(), now: now() }), now()); } catch (_) { /* never throw from a crash handler */ }
    const t = now().getTime(); if (showing || t - last < cooldownMs) return file; last = t; showing = true;
    try { show(`Aurora Settings hit an unexpected problem but is still running.\n\n${file ? 'A report was saved (your user name is removed from it):\n' + file : 'The report could not be saved.'}`, file); } catch (_) { /* ignore */ } finally { showing = false; }
    return file;
  };
}
module.exports = { redact, buildReport, save, trim, createReporter };
