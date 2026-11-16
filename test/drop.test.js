const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto'); const http = require('http');
const { createDrop } = require('../lib/toolkit'); const E = require('../lib/e2ee');
const get = (url) => new Promise((resolve, reject) => http.get(url, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(c) })); }).on('error', reject));
const mk = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-d-')); const tmp = path.join(dir, 'tmp'); fs.mkdirSync(tmp); const secret = Buffer.concat([Buffer.from('TOP-SECRET-MARKER-'), crypto.randomBytes(300000)]); const file = path.join(dir, 'Résumé private.pdf'); fs.writeFileSync(file, secret);
  return { dir, tmp, file, secret, drop: createDrop({ addresses: () => [{ name: 'lo', address: '127.0.0.1' }], tmpDir: tmp }) }; };
const parse = (u) => { const x = new URL(u); const frag = Object.fromEntries(x.hash.slice(1).split('&').map((p) => p.split('='))); return { origin: x.origin, base: x.origin + x.pathname, frag }; };

test('encrypted Drop: nothing readable crosses the network, and the key never leaves the link fragment', async () => {
  const { drop, file, secret, tmp } = mk(); const s = await drop.start({ file, once: false }); assert.equal(s.encrypted, true); assert.match(s.fingerprint, /^\d{4}-\d{4}-\d{4}$/);
  const { base, frag } = parse(s.urls[0]); assert.ok(frag.k && frag.n, 'key and name are in the fragment');
  const page = await get(base); assert.equal(page.status, 200); assert.match(page.headers['content-type'], /text\/html/); const html = page.body.toString();
  assert.ok(!html.includes(frag.k) && !html.includes('Résumé') && !html.includes('private.pdf'), 'the page never contains the key or the file name');
  const blob = await get(base + 'f.aur'); assert.equal(blob.status, 200); assert.ok(!blob.body.includes(Buffer.from('TOP-SECRET-MARKER')), 'ciphertext only');
  assert.equal(blob.body.length, E.encryptedSize(secret.length)); assert.ok(E.decryptBuffer(blob.body, E.fromB64u(frag.k)).equals(secret), 'the key from the link decrypts it');
  assert.equal(Buffer.from(E.fromB64u(frag.n)).toString('utf8'), 'Résumé private.pdf');
  assert.ok(!fs.readFileSync(path.join(tmp, fs.readdirSync(tmp)[0])).includes(Buffer.from('TOP-SECRET-MARKER')), 'temp file on disk is ciphertext too');
  assert.equal((await get(base.replace(/\/[0-9a-f]{32}\//, '/' + '0'.repeat(32) + '/') + 'f.aur')).status, 404, 'wrong token'); assert.equal((await get(base + 'Résumé private.pdf')).status, 404, 'no plaintext path');
  assert.equal((await get(s.urls[0].split('/').slice(0, 3).join('/') + '/')).status, 404); drop.stop();
  assert.equal(fs.readdirSync(tmp).length, 0, 'temp ciphertext removed on stop');
});
test('encrypted Drop: stops after the first download and cleans up', async () => {
  const { drop, file, tmp } = mk(); const s = await drop.start({ file, once: true }); const { base } = parse(s.urls[0]); await get(base + 'f.aur'); await new Promise((r) => setTimeout(r, 700));
  assert.equal(drop.status().active, false); assert.equal(fs.readdirSync(tmp).length, 0);
});
test('encrypt: false keeps the old plain behaviour (for devices without a browser)', async () => {
  const { drop, file, secret } = mk(); const s = await drop.start({ file, once: false, encrypt: false }); assert.equal(s.encrypted, false); assert.ok(!s.urls[0].includes('#k='));
  const r = await get(s.urls[0]); assert.equal(r.status, 200); assert.ok(r.body.equals(secret)); drop.stop();
});
test('a failed start leaves no temp file and a folder is refused', async () => {
  const { drop, dir, tmp } = mk(); await assert.rejects(drop.start({ file: dir }), /not a folder/); assert.equal(fs.readdirSync(tmp).length, 0);
});
