// Read-only disk usage scanner (original code). Walks a folder, sums sizes, keeps the biggest children per folder and the biggest files.
const fs = require('fs'); const path = require('path');
const SKIP = new Set(['/proc', '/sys', '/dev', '/run', '/snap']);
async function scan(root, opt = {}) {
  const maxDepth = opt.maxDepth || 8, keep = opt.keep || 60, topN = opt.top || 25, budget = opt.ms || 45000, t0 = Date.now();
  const st = await fs.promises.stat(root); if (!st.isDirectory()) throw new Error('Not a folder');
  let files = 0, partial = false; const big = [], types = {};
  const addBig = (p, s) => { if (big.length < topN || s > big[big.length - 1].size) { big.push({ path: p, size: s }); big.sort((a, b) => b.size - a.size); if (big.length > topN) big.pop(); } };
  async function walk(dir, depth) {
    const node = { name: path.basename(dir) || dir, path: dir, size: 0, dir: true, children: [] };
    if (SKIP.has(dir)) return node;
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (_) { return node; }
    const kids = []; const dirs = [], fl = [];
    for (const e of ents) { if (e.isSymbolicLink()) continue; if (e.isDirectory()) dirs.push(e); else if (e.isFile()) fl.push(e); }
    if (Date.now() - t0 > budget) { partial = true; return node; }
    // files: parallel lstat in chunks (much faster than one at a time)
    for (let i = 0; i < fl.length; i += 64) {
      await Promise.all(fl.slice(i, i + 64).map(async (e) => {
        const p = path.join(dir, e.name); let s = 0; try { s = (await fs.promises.lstat(p)).size; } catch (_) { return; }
        files++; node.size += s; addBig(p, s); const x = path.extname(e.name).toLowerCase() || '(none)'; const t = types[x] || (types[x] = { size: 0, count: 0 }); t.size += s; t.count++;
        kids.push({ name: e.name, path: p, size: s, dir: false, ext: x });
      }));
    }
    // sub-folders: a few at a time in parallel
    for (let i = 0; i < dirs.length; i += 8) {
      const cs = await Promise.all(dirs.slice(i, i + 8).map((e) => walk(path.join(dir, e.name), depth + 1)));
      for (const c of cs) { node.size += c.size; kids.push(depth + 1 < maxDepth ? c : { name: c.name, path: c.path, size: c.size, dir: true, children: [] }); }
    }
    kids.sort((a, b) => b.size - a.size);
    if (kids.length > keep) { const rest = kids.slice(keep); node.children = kids.slice(0, keep).concat([{ name: '(' + rest.length + ' smaller items)', path: dir, size: rest.reduce((a, k) => a + k.size, 0), dir: false, other: true }]); }
    else node.children = kids;
    return node;
  }
  const tree = await walk(root, 0);
  return { root, tree, topFiles: big, files, partial, ms: Date.now() - t0, types: Object.entries(types).map(([ext, v]) => ({ ext, size: v.size, count: v.count })).sort((a, b) => b.size - a.size).slice(0, 40) };
}
module.exports = { scan };
