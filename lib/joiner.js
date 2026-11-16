/* Joins split files (name.00.part, name.01.part, ...) back into one file. Never overwrites anything. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true });
function suggestName(first) { return path.basename(first).replace(/\.\d{1,4}\.part$/i, '').replace(/\.\d{3}$/, '').replace(/\.part$/i, '') || 'joined-file'; }
function join(parts, out, { onProgress } = {}) {
  if (!Array.isArray(parts) || parts.length < 2) throw new Error('Pick at least two parts');
  if (parts.length > 2000) throw new Error('Too many parts');
  const sorted = [...parts].sort((a, b) => natural(path.basename(a), path.basename(b)));
  const outR = path.resolve(out); if (fs.existsSync(outR)) throw new Error('That file already exists. Pick a new name.');
  if (sorted.some((p) => path.resolve(p) === outR)) throw new Error('The result cannot have the same name as a part');
  for (const p of sorted) { let st; try { st = fs.statSync(p); } catch (_) { throw new Error('A part is missing: ' + path.basename(p)); } if (!st.isFile()) throw new Error('Not a file: ' + path.basename(p)); if (st.size === 0) throw new Error('This part is empty (0 bytes), download it again: ' + path.basename(p)); }
  let grand = 0; for (const p of sorted) grand += fs.statSync(p).size;
  const h = crypto.createHash('sha256'); const fd = fs.openSync(outR, 'wx'); const buf = Buffer.alloc(4 << 20); let total = 0;
  try {
    for (const p of sorted) { const src = fs.openSync(p, 'r'); try { for (;;) { const n = fs.readSync(src, buf, 0, buf.length, null); if (!n) break; fs.writeSync(fd, buf, 0, n); h.update(buf.subarray(0, n)); total += n; if (onProgress && (total & 0xFFFFF) < n) onProgress(total, grand); } } finally { fs.closeSync(src); } }
  } catch (e) { fs.closeSync(fd); try { fs.unlinkSync(outR); } catch (_) { /* ignore */ } throw e; }
  fs.closeSync(fd); return { path: outR, size: total, sha256: h.digest('hex'), parts: sorted.length, iso: isIso(outR) };
}
function isIso(file) { // ISO 9660 images carry "CD001" at byte 32769
  try { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(5); const n = fs.readSync(fd, b, 0, 5, 32769); return n === 5 && b.toString('latin1') === 'CD001'; } finally { fs.closeSync(fd); } } catch (_) { return false; }
}
function hashOf(p) { const h = crypto.createHash('sha256'); const fd = fs.openSync(p, 'r'); const buf = Buffer.alloc(4 << 20); try { for (;;) { const n = fs.readSync(fd, buf, 0, buf.length, null); if (!n) break; h.update(buf.subarray(0, n)); } } finally { fs.closeSync(fd); } return h.digest('hex'); }
function parseSums(text) { const m = new Map(); for (const line of String(text).split(/\r?\n/)) { const x = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line); if (x) m.set(path.basename(x[2]), x[1].toLowerCase()); } return m; }
function verifyParts(parts, sums) { // compares each part with the list published with it
  const bad = [], missing = []; let ok = 0; const have = new Set(parts.map((p) => path.basename(p)));
  for (const name of sums.keys()) if (name.endsWith('.part') && !have.has(name)) missing.push(name);
  for (const p of parts) { const name = path.basename(p); const want = sums.get(name); if (!want) continue; let got = ''; try { got = hashOf(p); } catch (_) { /* unreadable */ } if (got === want) ok++; else bad.push(name); }
  return { ok, bad, missing };
}
module.exports = { hashOf, parseSums, verifyParts, isIso, join, suggestName, natural };
