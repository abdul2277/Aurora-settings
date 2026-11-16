// File tools: Downloads organizer (with undo) and duplicate finder. Pure Node, no shell.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const CATS = {
  Images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.tiff'],
  Videos: ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv'],
  Audio: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus'],
  Documents: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.epub'],
  Archives: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'],
  Installers: ['.exe', '.msi', '.msix', '.appx', '.iso', '.dmg']
};
const PARTIAL = /\.(crdownload|part|tmp|download|opdownload|partial)$/i;
const categoryOf = (name) => { const e = path.extname(name).toLowerCase(); return Object.keys(CATS).find((c) => CATS[c].includes(e)) || null; };

function uniqueTarget(target, taken) {
  const { dir, name, ext } = path.parse(target);
  let candidate = target, i = 1;
  while (taken.has(candidate.toLowerCase()) || fs.existsSync(candidate)) candidate = path.join(dir, `${name} (${i++})${ext}`);
  taken.add(candidate.toLowerCase());
  return candidate;
}
async function organizePlan(dir, { now = Date.now(), minAgeMs = 120000 } = {}) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const taken = new Set(); const moves = [];
  for (const e of entries) {
    if (!e.isFile() || PARTIAL.test(e.name)) continue;
    const cat = categoryOf(e.name); if (!cat) continue;
    const full = path.join(dir, e.name); const st = await fsp.stat(full);
    if (now - st.mtimeMs < minAgeMs) continue; // probably still downloading
    moves.push({ from: full, to: uniqueTarget(path.join(dir, cat, e.name), taken), cat, size: st.size });
  }
  return moves;
}
async function organizeApply(dir, opts) {
  const plan = await organizePlan(dir, opts); const done = []; const skipped = [];
  for (const m of plan) {
    try { await fsp.mkdir(path.dirname(m.to), { recursive: true }); await fsp.rename(m.from, m.to); done.push({ from: m.from, to: m.to }); }
    catch (e) { skipped.push({ from: m.from, error: e.code || e.message }); }
  }
  return { done, skipped };
}
async function organizeUndo(log) {
  let restored = 0, missing = 0, blocked = 0;
  for (const m of [...log].reverse()) {
    try {
      if (!fs.existsSync(m.to)) { missing++; continue; }
      if (fs.existsSync(m.from)) { blocked++; continue; } // never overwrite something that is there now
      await fsp.rename(m.to, m.from); restored++;
      const d = path.dirname(m.to); try { if (!(await fsp.readdir(d)).length) await fsp.rmdir(d); } catch (_) {}
    } catch (_) { blocked++; }
  }
  return { restored, missing, blocked };
}

const hashFile = (file, bytes) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256'); const opts = bytes ? { start: 0, end: bytes - 1 } : {};
  fs.createReadStream(file, opts).on('error', reject).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex')));
});
async function findDuplicates(root, { minBytes = 1048576, maxFiles = 50000, maxMs = 300000, now = Date.now } = {}) {
  const t0 = now(); const bySize = new Map(); let count = 0, truncated = false; const stack = [root];
  while (stack.length) {
    if (now() - t0 > maxMs || count >= maxFiles) { truncated = true; break; }
    const dir = stack.pop(); let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue; // never follow links/junctions (loops, double counting)
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (!e.isFile()) continue;
      let st; try { st = await fsp.stat(full); } catch (_) { continue; }
      if (st.size < minBytes) continue;
      count++; if (!bySize.has(st.size)) bySize.set(st.size, []); bySize.get(st.size).push({ path: full, mtime: st.mtimeMs });
    }
  }
  const groups = [];
  for (const [size, files] of bySize) {
    if (files.length < 2) continue;
    const byHead = new Map();
    for (const f of files) { try { const k = await hashFile(f.path, 65536); (byHead.get(k) || byHead.set(k, []).get(k)).push(f); } catch (_) {} }
    for (const same of byHead.values()) {
      if (same.length < 2) continue;
      const full = new Map();
      for (const f of same) { try { const k = await hashFile(f.path); (full.get(k) || full.set(k, []).get(k)).push(f); } catch (_) {} }
      for (const g of full.values()) if (g.length > 1) groups.push({ size, count: g.length, wasted: size * (g.length - 1), files: g.sort((a, b) => a.mtime - b.mtime) });
    }
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return { groups: groups.slice(0, 100), scanned: count, truncated, totalWasted: groups.reduce((a, g) => a + g.wasted, 0) };
}
module.exports = { categoryOf, organizePlan, organizeApply, organizeUndo, findDuplicates, CATS };
