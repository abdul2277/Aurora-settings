const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const E = require('../lib/e2ee'); const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-e-'));
const CH = 1 << 10; // 1 KiB chunks keep the tests fast
const key = E.newKey();

test('round-trips at every chunk boundary', () => {
  for (const n of [0, 1, 15, 16, 1023, 1024, 1025, 2048, 5000, 65536]) {
    const p = crypto.randomBytes(n); const ct = E.encryptBuffer(p, key, { chunkLog2: 10 });
    assert.equal(ct.length, E.encryptedSize(n, 10), 'size formula for ' + n); assert.ok(E.decryptBuffer(ct, key).equals(p), 'roundtrip ' + n);
  }
});
test('ciphertext leaks nothing obvious and is different every time with the same key? (deterministic by design, one key per file)', () => {
  const p = Buffer.from('secret secret secret secret'); const ct = E.encryptBuffer(p, key); assert.equal(ct.includes(Buffer.from('secret')), false);
});
test('wrong key is rejected', () => { const ct = E.encryptBuffer(Buffer.from('hello'), key); assert.throws(() => E.decryptBuffer(ct, E.newKey()), /Wrong password or key/); });
test('any flipped bit is detected (header, every chunk, tag)', () => {
  const p = crypto.randomBytes(3000); const ct = E.encryptBuffer(p, key, { chunkLog2: 10 });
  for (const pos of [5, 6, 9, 31, 32, 100, 1040, 2100, ct.length - 1, ct.length - 17]) { const bad = Buffer.from(ct); bad[pos] ^= 1; assert.throws(() => E.decryptBuffer(bad, key), /Wrong password or key|not an Vorynth|settings Vorynth does not understand|damaged/, 'bit ' + pos); }
});
test('truncation, reordering and chunk duplication are detected', () => {
  const p = crypto.randomBytes(3 * CH + 500); const ct = E.encryptBuffer(p, key, { chunkLog2: 10 }); const full = CH + 16; const h = ct.subarray(0, 32);
  const c = [0, 1, 2].map((i) => ct.subarray(32 + i * full, 32 + (i + 1) * full)); const fin = ct.subarray(32 + 3 * full); assert.equal(fin.length, 500 + 16);
  assert.ok(E.decryptBuffer(Buffer.concat([h, c[0], c[1], c[2], fin]), key).equals(p), 'control: the untouched file decrypts');
  assert.throws(() => E.decryptBuffer(Buffer.concat([h, c[0], c[1], c[2]]), key), /Wrong password or key/, 'dropped final chunk');
  assert.throws(() => E.decryptBuffer(Buffer.concat([h, c[0], c[1], fin]), key), /Wrong password or key/, 'dropped middle chunk');
  assert.throws(() => E.decryptBuffer(Buffer.concat([h, c[1], c[0], c[2], fin]), key), /Wrong password or key/, 'swapped chunks');
  assert.throws(() => E.decryptBuffer(Buffer.concat([h, c[0], c[0], c[1], c[2], fin]), key), /Wrong password or key/, 'duplicated chunk');
  assert.throws(() => E.decryptBuffer(ct.subarray(0, ct.length - 5), key), /Wrong password or key|damaged/, 'cut inside the last chunk');
  assert.throws(() => E.decryptBuffer(ct.subarray(0, 40), key), /damaged|Wrong/, 'only a header');
});
test('rejects non-Vorynth data and bad headers', () => {
  assert.throws(() => E.decryptBuffer(Buffer.from('hello world, this is plain text. 0123456789'), key), /not an Vorynth-encrypted file/);
  assert.throws(() => E.makeHeader({ chunkLog2: 5 }), /Bad chunk size`?|Bad chunk size/);
});
test('password mode: roundtrip, wrong password, short password, tamper', async () => {
  const p = crypto.randomBytes(2500); const ct = await E.encryptWithPassword(p, 'correct horse battery', { logN: 14, chunkLog2: 10 });
  assert.ok((await E.decryptWithPassword(ct, 'correct horse battery')).equals(p));
  await assert.rejects(E.decryptWithPassword(ct, 'correct horse batterX'), /Wrong password or key/);
  await assert.rejects(E.encryptWithPassword(p, 'short'), /at least 8/);
  const ct2 = await E.encryptWithPassword(p, 'correct horse battery', { logN: 14 }); assert.notDeepEqual(ct.subarray(8, 24), ct2.subarray(8, 24), 'fresh salt each time');
  await assert.rejects(E.decryptWithPassword(E.encryptBuffer(p, key), 'whatever1'), /needs a key/);
});
test('files: streaming roundtrip, large file, wrong key leaves no partial output', async () => {
  const d = tmp(); const src = path.join(d, 'a.bin'); const big = crypto.randomBytes(3 * 1024 * 1024 + 123); fs.writeFileSync(src, big);
  const enc = path.join(d, 'a.aur'); assert.equal(E.encryptFileSync(src, enc, key).bytes, big.length); assert.equal(fs.statSync(enc).size, E.encryptedSize(big.length));
  const out = path.join(d, 'a.out'); E.decryptFileSync(enc, out, key); assert.ok(fs.readFileSync(out).equals(big));
  const out2 = path.join(d, 'b.out'); assert.throws(() => E.decryptFileSync(enc, out2, E.newKey()), /Wrong password or key/); assert.equal(fs.existsSync(out2), false);
  const empty = path.join(d, 'e.bin'); fs.writeFileSync(empty, ''); E.encryptFileSync(empty, path.join(d, 'e.aur'), key); E.decryptFileSync(path.join(d, 'e.aur'), path.join(d, 'e.out'), key); assert.equal(fs.statSync(path.join(d, 'e.out')).size, 0);
  assert.throws(() => E.encryptFileSync(src, enc, key), /EEXIST/, 'never overwrites');
  await E.encryptFileWithPassword(src, path.join(d, 'p.aur'), 'a long password!', { logN: 14 }); await E.decryptFileWithPassword(path.join(d, 'p.aur'), path.join(d, 'p.out'), 'a long password!'); assert.ok(fs.readFileSync(path.join(d, 'p.out')).equals(big));
  await assert.rejects(E.decryptFileWithPassword(path.join(d, 'p.aur'), path.join(d, 'q.out'), 'nope nope nope'), /Wrong password or key/); assert.equal(fs.existsSync(path.join(d, 'q.out')), false);
});
test('key encoding and fingerprint', () => {
  const k = E.newKey(); assert.ok(E.fromB64u(E.b64u(k)).equals(k)); assert.throws(() => E.fromB64u('not valid!'), /not valid/);
  assert.match(E.fingerprint(k), /^\d{4}-\d{4}-\d{4}$/); assert.equal(E.fingerprint(k), E.fingerprint(k)); assert.notEqual(E.fingerprint(k), E.fingerprint(E.newKey()));
});
