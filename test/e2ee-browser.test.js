const test = require('node:test'); const assert = require('node:assert/strict'); const vm = require('vm'); const crypto = require('crypto');
const E = require('../lib/e2ee'); const { DECRYPTOR_JS } = require('../lib/e2ee-browser');
const ctx = { globalThis: {}, atob, Uint8Array, Uint32Array, BigInt, Math, String, Error, RegExp }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(DECRYPTOR_JS, ctx);
const B = ctx.AuroraE2EE; const join = (r) => Buffer.concat(r.parts.map((p) => Buffer.from(p)));
const key = E.newKey();

test('the browser decryptor matches Node for every size around the chunk boundaries', () => {
  for (const [n, log2] of [[0, 10], [1, 10], [1023, 10], [1024, 10], [1025, 10], [4096, 10], [70000, 16], [200000, 16], [65536, 16]]) {
    const p = crypto.randomBytes(n); const ct = E.encryptBuffer(p, key, { chunkLog2: log2 }); const out = B.decrypt(new Uint8Array(key), new Uint8Array(ct));
    assert.equal(out.size, n); assert.ok(join(out).equals(p), 'size ' + n);
  }
});
test('and the other direction: data sealed by the format is only opened with the right key', () => {
  const ct = E.encryptBuffer(Buffer.from('top secret'), key); assert.throws(() => B.decrypt(new Uint8Array(E.newKey()), new Uint8Array(ct)), /Wrong key/);
});
test('tampering, truncation and reordering are detected in the browser too', () => {
  const p = crypto.randomBytes(3 * 1024 + 300); const ct = E.encryptBuffer(p, key, { chunkLog2: 10 }); const k = new Uint8Array(key); const full = 1024 + 16;
  for (const pos of [6, 40, 1100, 2500, ct.length - 3]) { const bad = Buffer.from(ct); bad[pos] ^= 4; assert.throws(() => B.decrypt(k, new Uint8Array(bad)), /Wrong key|damaged|password|Aurora/, 'bit ' + pos); }
  assert.throws(() => B.decrypt(k, new Uint8Array(ct.subarray(0, 32 + 3 * full))), /Wrong key/, 'final chunk removed');
  const h = ct.subarray(0, 32), c0 = ct.subarray(32, 32 + full), c1 = ct.subarray(32 + full, 32 + 2 * full), rest = ct.subarray(32 + 2 * full);
  assert.throws(() => B.decrypt(k, new Uint8Array(Buffer.concat([h, c1, c0, rest]))), /Wrong key/, 'chunks swapped');
  assert.throws(() => B.decrypt(k, new Uint8Array(Buffer.from('not an aurora file at all, nothing to see here'))), /not an Aurora/);
  assert.throws(() => B.decrypt(new Uint8Array(5), new Uint8Array(ct)), /key is not valid/);
});
test('password-mode files are refused by the link decryptor (they need a password)', () => {
  return E.encryptWithPassword(Buffer.from('x'), 'a long password', { logN: 14 }).then((ct) => assert.throws(() => B.decrypt(new Uint8Array(key), new Uint8Array(ct)), /password/));
});
test('key parsing', () => { const k = E.newKey(); assert.deepEqual(Buffer.from(B.b64uToBytes(E.b64u(k))), k); assert.throws(() => B.b64uToBytes('bad key!'), /not valid/); });
