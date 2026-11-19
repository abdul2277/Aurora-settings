/* Vorynth Utilities backend: file hash check, folder compare, empty folder finder. All read-only. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ALGOS = ['sha256', 'sha1', 'md5', 'sha512'];

function hashFile(p, algo = 'sha256') {
  if (!ALGOS.includes(algo)) throw new Error('Unknown hash type');
  let st; try { st = fs.statSync(p); } catch (_) { throw new Error('That file is not there any more'); } if (!st.isFile()) throw new Error('Pick a file, not a folder');
  const h = crypto.createHash(algo); const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(4 << 20);
  try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); }
  return { hash: h.digest('hex'), size: st.size, algo };
}
const sameHash = (a, b) => String(a).replace(/\s+/g, '').toLowerCase() === String(b).replace(/\s+/g, '').toLowerCase();

function listFiles(root, { maxFiles = 100000, maxDepth = 12 } = {}) {
  const out = new Map(); let truncated = false; const stack = [['', 0]];
  while (stack.length) {
    const [rel, d] = stack.pop(); let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { continue; }
    for (const e of ents) {
      if (e.isSymbolicLink()) continue; const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (d < maxDepth) stack.push([r, d + 1]); } else if (e.isFile()) { if (out.size >= maxFiles) { truncated = true; stack.length = 0; break; } try { const s = fs.statSync(path.join(root, r)); out.set(r, { size: s.size, mtime: Math.floor(s.mtimeMs) }); } catch (_) { /* skip */ } }
    }
  }
  return { files: out, truncated };
}
function compareFolders(a, b, opts) {
  for (const f of [a, b]) { let s; try { s = fs.statSync(f); } catch (_) { throw new Error('A folder is not there any more'); } if (!s.isDirectory()) throw new Error('Pick two folders'); }
  if (path.resolve(a) === path.resolve(b)) throw new Error('Pick two different folders');
  const A = listFiles(a, opts), B = listFiles(b, opts); const onlyA = [], onlyB = [], different = []; let same = 0;
  for (const [k, v] of A.files) { const w = B.files.get(k); if (!w) onlyA.push(k); else if (w.size !== v.size) different.push({ path: k, a: v.size, b: w.size }); else same++; }
  for (const k of B.files.keys()) if (!A.files.has(k)) onlyB.push(k);
  const cap = (x) => x.sort().slice(0, 300);
  return { same, onlyA: cap(onlyA), onlyB: cap(onlyB), different: different.sort((x, y) => x.path.localeCompare(y.path)).slice(0, 300), counts: { onlyA: onlyA.length, onlyB: onlyB.length, different: different.length }, truncated: A.truncated || B.truncated };
}
function findEmptyDirs(root, { maxDirs = 200000, maxDepth = 14 } = {}) {
  let s; try { s = fs.statSync(root); } catch (_) { throw new Error('That folder is not there any more'); } if (!s.isDirectory()) throw new Error('Pick a folder');
  const empty = []; let seen = 0;
  const walk = (dir, depth) => { // returns true when the folder holds nothing at all
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return false; } if (++seen > maxDirs) return false; let isEmpty = true;
    for (const e of ents) { if (e.isDirectory() && !e.isSymbolicLink()) { if (depth < maxDepth ? !walk(path.join(dir, e.name), depth + 1) : true) isEmpty = false; } else isEmpty = false; }
    if (isEmpty && dir !== root) empty.push(dir); return isEmpty;
  };
  walk(root, 0); return empty.sort().slice(0, 500);
}
/* Manifest: a list of checksums for every file in a folder, so you can prove later that nothing changed. */
function makeManifest(root, { maxFiles = 5000, maxBytes = 40 * 1024 ** 3 } = {}) {
  const l = listFiles(root, { maxFiles }); if (l.truncated) throw new Error('That folder has too many files for one manifest (limit ' + maxFiles + ')');
  let total = 0; for (const v of l.files.values()) total += v.size; if (total > maxBytes) throw new Error('That folder is too big to check in one go');
  const names = [...l.files.keys()].sort(); const lines = names.map((n) => utilsLine(root, n)); return { text: lines.join('\n') + '\n', count: names.length, bytes: total };
}
const utilsLine = (root, rel) => hashFile(path.join(root, ...rel.split('/')), 'sha256').hash + '  ' + rel;
function verifyManifest(root, text, { maxFiles = 5000 } = {}) {
  const want = new Map(); for (const line of String(text).split(/\r?\n/)) { const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line); if (m) want.set(m[2].replace(/\\/g, '/'), m[1].toLowerCase()); }
  if (!want.size) throw new Error('That file has no checksums in it'); const have = listFiles(root, { maxFiles }); const bad = [], missing = []; let ok = 0;
  for (const [rel, h] of want) { if (!have.files.has(rel)) { missing.push(rel); continue; } let got = ''; try { got = hashFile(path.join(root, ...rel.split('/')), 'sha256').hash; } catch (_) { /* unreadable */ } if (got === h) ok++; else bad.push(rel); }
  const extra = [...have.files.keys()].filter((k) => !want.has(k)).sort();
  return { ok, bad: bad.sort().slice(0, 300), missing: missing.sort().slice(0, 300), extra: extra.slice(0, 300), counts: { bad: bad.length, missing: missing.length, extra: extra.length } };
}
module.exports = { makeManifest, verifyManifest, hashFile, sameHash, compareFolders, findEmptyDirs, ALGOS };
