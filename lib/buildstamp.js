// A small identity tag written into the unused "reserved" area of the .exe's DOS header (bytes 0x1C-0x3B).
// Windows ignores those bytes, so the program runs exactly the same; Vorynth reads the tag to recognise a genuine
// Vorynth build and tell which version/build it is, without ever running the file.
const fs = require('fs');
const OFFSET = 0x1c, MAGIC = Buffer.from('AURORA'), LEN = 32;

function crc32(buf) { let c, crc = 0xffffffff; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
const parseVersion = (v) => { const m = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(String(v)); if (!m) throw new Error('Version must look like 1.2.3'); return m.slice(1).map(Number); };

function makeTag(version, build) {
  const [a, b, c] = parseVersion(version); const t = Buffer.alloc(LEN);
  MAGIC.copy(t, 0); t[6] = 1; t.writeUInt16LE(a, 7); t.writeUInt16LE(b, 9); t.writeUInt16LE(c, 11); t.writeUInt32LE(build >>> 0, 13);
  t.writeUInt32LE(crc32(t.subarray(0, 17)), 17); return t;
}
function parseTag(t) {
  if (!t || t.length < 21 || !t.subarray(0, 6).equals(MAGIC) || t[6] !== 1) return null;
  if (crc32(t.subarray(0, 17)) !== t.readUInt32LE(17)) return null;
  return { version: `${t.readUInt16LE(7)}.${t.readUInt16LE(9)}.${t.readUInt16LE(11)}`, build: t.readUInt32LE(13) };
}
function stamp(file, version, build) {
  const fd = fs.openSync(file, 'r+');
  try { const head = Buffer.alloc(2); fs.readSync(fd, head, 0, 2, 0); if (head[0] !== 0x4d || head[1] !== 0x5a) throw new Error('Not a Windows program'); fs.writeSync(fd, makeTag(version, build), 0, LEN, OFFSET); } finally { fs.closeSync(fd); }
}
function readStamp(file) {
  try { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(0x40); if (fs.readSync(fd, b, 0, 0x40, 0) < 0x40 || b[0] !== 0x4d || b[1] !== 0x5a) return null; return parseTag(b.subarray(OFFSET, OFFSET + LEN)); } finally { fs.closeSync(fd); } } catch (_) { return null; }
}
module.exports = { stamp, readStamp, makeTag, parseTag, crc32 };
