/* Space Finder: read-only. Finds the biggest files and folders and duplicate files inside ONE folder you pick. It never changes or deletes anything. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function walk(root, { maxFiles = 200000, maxDepth = 12 } = {}) {
  const files = []; const dirs = new Map(); let truncated = false; let denied = 0;
  const stack = [[root, 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop(); let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { denied++; continue; }
    for (const e of ents) {
      if (e.isSymbolicLink()) continue; // never follow links
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < maxDepth) stack.push([full, depth + 1]); }
      else if (e.isFile()) {
        if (files.length >= maxFiles) { truncated = true; stack.length = 0; break; }
        let st; try { st = fs.statSync(full); } catch (_) { denied++; continue; }
        files.push({ path: full, size: st.size, mtime: Math.floor(st.mtimeMs) });
        // add the size to every folder between the root and this file
        let d = dir; for (;;) { dirs.set(d, (dirs.get(d) || 0) + st.size); if (d === root) break; const up = path.dirname(d); if (up === d) break; d = up; }
      }
    }
  }
  return { files, dirs, truncated, denied };
}

function topFolders(dirs, root, n = 25) {
  return [...dirs].filter(([d]) => d !== root).map(([p, size]) => ({ path: p, size })).sort((a, b) => b.size - a.size).slice(0, n);
}

function hashFile(p, limit = 1 << 30) { // SHA-256 streamed in chunks; refuses huge files
  const fd = fs.openSync(p, 'r'); const h = crypto.createHash('sha256'); const buf = Buffer.alloc(1 << 20); let total = 0;
  try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; total += n; if (total > limit) return null; h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

function findDuplicates(files, { minSize = 1 << 20, maxGroups = 200 } = {}) {
  const bySize = new Map(); for (const f of files) if (f.size >= minSize) { const a = bySize.get(f.size) || []; a.push(f); bySize.set(f.size, a); }
  const groups = [];
  for (const [size, list] of bySize) {
    if (list.length < 2) continue; const byHash = new Map();
    for (const f of list) { let h; try { h = hashFile(f.path); } catch (_) { continue; } if (!h) continue; const a = byHash.get(h) || []; a.push(f.path); byHash.set(h, a); }
    for (const paths of byHash.values()) if (paths.length > 1) groups.push({ size, paths: paths.sort(), wasted: size * (paths.length - 1) });
  }
  return groups.sort((a, b) => b.wasted - a.wasted).slice(0, maxGroups);
}

function scan(root, opts = {}) {
  if (typeof root !== 'string' || !root || root.length > 400) throw new Error('Pick a folder first');
  let st; try { st = fs.statSync(root); } catch (_) { throw new Error('That folder is not there any more'); } if (!st.isDirectory()) throw new Error('Pick a folder, not a file');
  const w = walk(root, opts); const biggest = [...w.files].sort((a, b) => b.size - a.size).slice(0, 50);
  const total = w.files.reduce((s, f) => s + f.size, 0);
  const dup = findDuplicates(w.files, { minSize: opts.minDup });
  return { root, fileCount: w.files.length, total, truncated: w.truncated, denied: w.denied, biggest, folders: topFolders(w.dirs, root), duplicates: dup, wasted: dup.reduce((s, g) => s + g.wasted, 0) };
}
module.exports = { scan, walk, findDuplicates, hashFile, topFolders };
