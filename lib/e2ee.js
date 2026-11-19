// Vorynth end-to-end encryption core. Used by Drop (encrypted LAN sharing), the Vault (password-protected files) and encrypted backups.
//
// Format ("AUR1"): a 32-byte header followed by chunks.
//   header = "AUR1" | chunkSizeLog2 (1) | kdf (1: 0 = raw key, 1 = scrypt) | scryptLogN (1) | reserved (1) | salt (16) | reserved (8)
//   chunk i = ChaCha20-Poly1305( plaintext chunk ), nonce = 4 zero bytes | counter i as 64-bit big-endian,
//             AAD = header | final-flag (1 byte: 1 for the last chunk, else 0)
// The final flag and the counter make truncation, reordering and chunk-swapping detectable, and the header is authenticated.
// A key is only ever used for one file: Drop makes a new random key per share, the Vault derives a new key from the password and a
// fresh random salt per file. ChaCha20-Poly1305 (RFC 8439) is used because it is in Node's crypto and can be re-implemented in plain
// JavaScript for browsers that load a Drop over http:// (where Web Crypto is not available).
const crypto = require('crypto');
const fs = require('fs');

const MAGIC = Buffer.from('AUR1'); const HEADER_LEN = 32; const TAG = 16; const DEFAULT_CHUNK_LOG2 = 16; // 64 KiB
const KDF = { RAW: 0, SCRYPT: 1 }; const SCRYPT_LOG_N = 15; // N = 32768, r = 8, p = 1 (about 32 MiB, ~100 ms)
const MAX_CHUNK_LOG2 = 22;

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => { if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('That key is not valid'); return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'); };
const newKey = () => crypto.randomBytes(32);

function makeHeader({ chunkLog2 = DEFAULT_CHUNK_LOG2, kdf = KDF.RAW, logN = 0, salt = Buffer.alloc(16) } = {}) {
  if (!(chunkLog2 >= 10 && chunkLog2 <= MAX_CHUNK_LOG2)) throw new Error('Bad chunk size');
  const h = Buffer.alloc(HEADER_LEN); MAGIC.copy(h, 0); h[4] = chunkLog2; h[5] = kdf; h[6] = logN; Buffer.from(salt).copy(h, 8, 0, 16); return h;
}
function parseHeader(buf) {
  if (!buf || buf.length < HEADER_LEN || !buf.subarray(0, 4).equals(MAGIC)) throw new Error('This is not an Vorynth-encrypted file');
  const chunkLog2 = buf[4], kdf = buf[5], logN = buf[6];
  if (!(chunkLog2 >= 10 && chunkLog2 <= MAX_CHUNK_LOG2) || (kdf !== KDF.RAW && kdf !== KDF.SCRYPT) || (kdf === KDF.SCRYPT && !(logN >= 14 && logN <= 20))) throw new Error('This file uses settings Vorynth does not understand');
  return { chunkSize: 1 << chunkLog2, chunkLog2, kdf, logN, salt: Buffer.from(buf.subarray(8, 24)), raw: Buffer.from(buf.subarray(0, HEADER_LEN)) };
}
const nonceFor = (i) => { const n = Buffer.alloc(12); n.writeBigUInt64BE(BigInt(i), 4); return n; };
const aadFor = (header, last) => Buffer.concat([header, Buffer.from([last ? 1 : 0])]);

function sealChunk(key, header, i, plain, last) {
  const c = crypto.createCipheriv('chacha20-poly1305', key, nonceFor(i), { authTagLength: TAG }); c.setAAD(aadFor(header, last), { plaintextLength: plain.length });
  const ct = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([ct, c.getAuthTag()]);
}
function openChunk(key, header, i, sealed, last) {
  if (sealed.length < TAG) throw new Error('The file is damaged or cut short');
  const d = crypto.createDecipheriv('chacha20-poly1305', key, nonceFor(i), { authTagLength: TAG }); d.setAAD(aadFor(header, last), { plaintextLength: sealed.length - TAG });
  d.setAuthTag(sealed.subarray(sealed.length - TAG));
  try { return Buffer.concat([d.update(sealed.subarray(0, sealed.length - TAG)), d.final()]); } catch (_) { throw new Error('Wrong password or key, or the file was changed'); }
}

/* ----- buffers (small data: settings backups, notes) ----- */
function encryptBuffer(plain, key, opts = {}) {
  const header = makeHeader(opts); const size = parseHeader(header).chunkSize; const parts = [header];
  let i = 0, off = 0; do { const end = Math.min(off + size, plain.length); const last = end >= plain.length; parts.push(sealChunk(key, header, i++, plain.subarray(off, end), last)); off = end; if (last) break; } while (true);
  return Buffer.concat(parts);
}
function decryptBuffer(data, key) {
  const h = parseHeader(data); const full = h.chunkSize + TAG; const parts = []; let off = HEADER_LEN, i = 0;
  if (data.length - off < TAG) throw new Error('The file is damaged or cut short');
  for (;;) { const remaining = data.length - off; const last = remaining <= full; const len = last ? remaining : full; parts.push(openChunk(key, h.raw, i++, data.subarray(off, off + len), last)); off += len; if (last) break; }
  return Buffer.concat(parts);
}

/* ----- password mode ----- */
const scryptKey = (password, salt, logN) => new Promise((resolve, reject) => crypto.scrypt(Buffer.from(String(password).normalize('NFKC'), 'utf8'), salt, 32, { N: 1 << logN, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));
async function encryptWithPassword(plain, password, { logN = SCRYPT_LOG_N, chunkLog2 } = {}) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Use a password of at least 8 characters');
  const salt = crypto.randomBytes(16); const key = await scryptKey(password, salt, logN); return encryptBuffer(plain, key, { kdf: KDF.SCRYPT, logN, salt, chunkLog2 });
}
async function decryptWithPassword(data, password) {
  const h = parseHeader(data); if (h.kdf !== KDF.SCRYPT) throw new Error('This file needs a key, not a password'); return decryptBuffer(data, await scryptKey(password, h.salt, h.logN));
}

/* ----- files (any size, never loads the whole file) ----- */
function encryptFileSync(inPath, outPath, key, opts = {}) {
  const header = makeHeader(opts); const size = parseHeader(header).chunkSize; const st = fs.statSync(inPath); if (!st.isFile()) throw new Error('Pick a file, not a folder');
  const rfd = fs.openSync(inPath, 'r'); const wfd = fs.openSync(outPath, 'wx'); let ok = false;
  try {
    fs.writeSync(wfd, header); const buf = Buffer.alloc(size); let pos = 0, i = 0;
    for (;;) { const n = fs.readSync(rfd, buf, 0, size, pos); pos += n; const last = pos >= st.size || n < size; fs.writeSync(wfd, sealChunk(key, header, i++, buf.subarray(0, n), last)); if (last) break; }
    ok = true;
  } finally { fs.closeSync(rfd); fs.closeSync(wfd); if (!ok) { try { fs.rmSync(outPath, { force: true }); } catch (_) {} } }
  return { bytes: st.size };
}
function decryptFileSync(inPath, outPath, key) {
  const rfd = fs.openSync(inPath, 'r'); let wfd = null; let ok = false;
  try {
    const hb = Buffer.alloc(HEADER_LEN); if (fs.readSync(rfd, hb, 0, HEADER_LEN, 0) < HEADER_LEN) throw new Error('This is not an Vorynth-encrypted file');
    const h = parseHeader(hb); const full = h.chunkSize + TAG; const total = fs.fstatSync(rfd).size; if (total - HEADER_LEN < TAG) throw new Error('The file is damaged or cut short');
    wfd = fs.openSync(outPath, 'wx'); const buf = Buffer.alloc(full); let pos = HEADER_LEN, i = 0, bytes = 0;
    for (;;) { const remaining = total - pos; const last = remaining <= full; const len = last ? remaining : full; fs.readSync(rfd, buf, 0, len, pos); pos += len; const plain = openChunk(key, h.raw, i++, buf.subarray(0, len), last); fs.writeSync(wfd, plain); bytes += plain.length; if (last) break; }
    ok = true; return { bytes };
  } finally { fs.closeSync(rfd); if (wfd !== null) fs.closeSync(wfd); if (!ok && wfd !== null) { try { fs.rmSync(outPath, { force: true }); } catch (_) {} } }
}
async function encryptFileWithPassword(inPath, outPath, password, opts = {}) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Use a password of at least 8 characters');
  const logN = opts.logN || SCRYPT_LOG_N; const salt = crypto.randomBytes(16); const key = await scryptKey(password, salt, logN);
  return encryptFileSync(inPath, outPath, key, { kdf: KDF.SCRYPT, logN, salt, chunkLog2: opts.chunkLog2 });
}
async function decryptFileWithPassword(inPath, outPath, password) {
  const hb = Buffer.alloc(HEADER_LEN); const fd = fs.openSync(inPath, 'r'); try { if (fs.readSync(fd, hb, 0, HEADER_LEN, 0) < HEADER_LEN) throw new Error('This is not an Vorynth-encrypted file'); } finally { fs.closeSync(fd); }
  const h = parseHeader(hb); if (h.kdf !== KDF.SCRYPT) throw new Error('This file needs a key, not a password'); return decryptFileSync(inPath, outPath, await scryptKey(password, h.salt, h.logN));
}

/* ----- helpers for Drop ----- */
const encryptedSize = (plainSize, chunkLog2 = DEFAULT_CHUNK_LOG2) => { const size = 1 << chunkLog2; return HEADER_LEN + plainSize + Math.max(1, Math.ceil(plainSize / size)) * TAG; };
// A short code both people can read out loud to confirm they hold the same key (guards against a swapped link).
const fingerprint = (key) => { const h = crypto.createHash('sha256').update('aurora-e2ee-fp').update(key).digest(); return [0, 2, 4].map((i) => String(h.readUInt16BE(i) % 10000).padStart(4, '0')).join('-'); };

module.exports = { HEADER_LEN, TAG, DEFAULT_CHUNK_LOG2, KDF, b64u, fromB64u, newKey, makeHeader, parseHeader, sealChunk, openChunk, encryptBuffer, decryptBuffer, encryptWithPassword, decryptWithPassword, encryptFileSync, decryptFileSync, encryptFileWithPassword, decryptFileWithPassword, encryptedSize, fingerprint };
