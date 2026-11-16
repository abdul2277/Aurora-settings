/* Aurora OS: check a downloaded image (or its parts) against the official fingerprints, and download it with verification. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DATA = require('./osdata'); const winget = require('./winget'); const joiner = require('./joiner');
const SITES = { ventoy: 'https://www.ventoy.net/en/download.html', rufus: 'https://rufus.ie/' };
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function readAt(fd, off, len) { const b = Buffer.alloc(len); const n = fs.readSync(fd, b, 0, len, off); return b.subarray(0, n); }
function hashRange(fd, start, size, onBytes) { const h = crypto.createHash('sha256'); const buf = Buffer.alloc(4 << 20); let done = 0; while (done < size) { const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - done), start + done); if (!n) break; h.update(buf.subarray(0, n)); done += n; if (onBytes) onBytes(n); } return { sha: h.digest('hex'), bytes: done }; }
function findEntry(fd, lba, len, wanted) { // walk one ISO9660 directory
  const b = readAt(fd, lba * 2048, len); let o = 0;
  while (o < b.length) { const L = b[o]; if (!L) { o = (Math.floor(o / 2048) + 1) * 2048; continue; } const nl = b[o + 32]; let name = b.toString('latin1', o + 33, o + 33 + nl).replace(/;1$/, '').replace(/\.$/, '').toLowerCase(); if (name === wanted) return { lba: le32(b, o + 2), size: le32(b, o + 10) }; o += L; }
  return null;
}

/* Reads the whole file once. Returns a list of plain-English checks and an overall verdict. */
function verifyIso(file, { onProgress = () => {}, expected = DATA } = {}) {
  const checks = []; const add = (ok, text) => checks.push({ ok, text }); let st; try { st = fs.statSync(file); } catch (_) { throw new Error('That file is not there any more'); } if (!st.isFile()) throw new Error('Pick a file');
  const fd = fs.openSync(file, 'r');
  try {
    add(st.size === expected.iso.size, st.size === expected.iso.size ? 'The size is exactly right.' : `The size is ${st.size} bytes but it should be ${expected.iso.size}. ${st.size < expected.iso.size ? 'Part of the file is missing.' : 'Extra data was added.'}`);
    const pvd = readAt(fd, 16 * 2048, 2048);
    if (pvd.length < 2048 || pvd.toString('latin1', 1, 6) !== 'CD001') add(false, 'This is not an ISO image (the disc signature is missing).');
    else {
      add(true, 'It is a valid ISO image.'); const mbr = readAt(fd, 0, 512); add(mbr[510] === 0x55 && mbr[511] === 0xaa, mbr[510] === 0x55 && mbr[511] === 0xaa ? 'The USB boot record is present.' : 'The USB boot record is missing or damaged.');
      const cas = findEntry(fd, le32(pvd, 158), le32(pvd, 166), 'casper');
      if (!cas) add(false, 'The /casper folder is missing, so this image cannot start.');
      else for (const [key, label] of [['kernel', 'vmlinuz'], ['initrd', 'initrd']]) {
        const e = findEntry(fd, cas.lba, cas.size, label), want = expected[key];
        if (!e) { add(false, `The file /casper/${label} is missing.`); continue; } if (e.size !== want.size) { add(false, `/casper/${label} has the wrong size.`); continue; }
        const h = hashRange(fd, e.lba * 2048, e.size); if (key === 'kernel') { const hd = readAt(fd, e.lba * 2048, 520); const good = hd[510] === 0x55 && hd[511] === 0xaa && hd.toString('latin1', 514, 518) === 'HdrS'; add(good, good ? 'The kernel header is valid.' : 'The kernel header is invalid: this is what GRUB reports as "invalid magic number".'); }
        add(h.sha === want.sha, `${key === 'kernel' ? 'The kernel (/casper/vmlinuz)' : 'The start-up image (/casper/initrd)'} ${h.sha === want.sha ? 'is an exact copy.' : 'is DAMAGED.'}`);
      }
    }
    let done = 0; const full = hashRange(fd, 0, st.size, (n) => { done += n; onProgress(done, st.size); }); add(full.sha === expected.iso.sha, full.sha === expected.iso.sha ? 'The whole-file fingerprint matches the official image.' : `The whole-file fingerprint differs (${full.sha.slice(0, 16)}... instead of ${expected.iso.sha.slice(0, 16)}...).`);
    return { ok: checks.every((c) => c.ok), checks, sha256: full.sha, size: st.size };
  } finally { fs.closeSync(fd); }
}

const partsList = (data = DATA) => data.parts.map((p) => p[1] + '  ' + p[0]).join('\n') + '\n';
function checkParts(paths, data = DATA) { return joiner.verifyParts(paths, joiner.parseSums(partsList(data))); }
async function downloadIso(url, dest, { fetchFn, onProgress, signal, expected = DATA } = {}) {
  if (fs.existsSync(dest)) throw new Error('That file already exists. Pick a new name.');
  return winget.download(url, dest, { fetchFn: fetchFn || fetch, expectedSha256: expected.iso.sha, maxBytes: expected.iso.size + 1048576, onProgress, signal });
}
const info = () => ({ name: DATA.iso.name, size: DATA.iso.size, sha256: DATA.iso.sha, parts: DATA.parts.length, partSize: DATA.parts[0][2], sites: Object.keys(SITES) });
module.exports = { DATA, SITES, verifyIso, checkParts, downloadIso, partsList, info, findEntry };
