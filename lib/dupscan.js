// Read-only duplicate finder: groups by size, then by SHA-1 of the content. Never deletes anything.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const SKIP = new Set(['/proc', '/sys', '/dev', '/run', '/snap', 'node_modules', '$Recycle.Bin', 'Windows']);
const hash = (p) => new Promise((res, rej) => { const h = crypto.createHash('sha1'); const s = fs.createReadStream(p); s.on('data', (d) => h.update(d)); s.on('end', () => res(h.digest('hex'))); s.on('error', rej); });
async function scan(root, opt = {}) {
  const min = opt.minSize || 1048576, budget = opt.ms || 60000, t0 = Date.now(); let partial = false, seen = 0;
  const st = await fs.promises.stat(root); if (!st.isDirectory()) throw new Error('Not a folder');
  const bySize = new Map();
  async function walk(d) {
    if (Date.now() - t0 > budget) { partial = true; return; }
    let ents; try { ents = await fs.promises.readdir(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      if (e.isSymbolicLink() || SKIP.has(e.name)) continue; const p = path.join(d, e.name); if (SKIP.has(p)) continue;
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) { let s; try { s = (await fs.promises.stat(p)).size; } catch (_) { continue; } if (s < min) continue; seen++; (bySize.get(s) || bySize.set(s, []).get(s)).push(p); }
    }
  }
  await walk(root);
  const groups = [];
  for (const [size, list] of bySize) {
    if (list.length < 2) continue; const byHash = new Map();
    for (const p of list) { if (Date.now() - t0 > budget * 2) { partial = true; break; } try { const h = await hash(p); (byHash.get(h) || byHash.set(h, []).get(h)).push(p); } catch (_) {} }
    for (const files of byHash.values()) if (files.length > 1) groups.push({ size, files, wasted: size * (files.length - 1) });
  }
  groups.sort((a, b) => b.wasted - a.wasted);
  return { root, groups: groups.slice(0, 100), wasted: groups.reduce((a, g) => a + g.wasted, 0), checked: seen, partial, ms: Date.now() - t0 };
}
module.exports = { scan };
