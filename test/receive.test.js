const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto'); const http = require('http'); const net = require('net');
const { createReceive, safeUploadName, createDrop } = require('../lib/toolkit'); const E = require('../lib/e2ee'); const AdmZip = require('adm-zip');
const lo = () => [{ name: 'lo', address: '127.0.0.1' }]; const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-r-'));
const req = (url, { method = 'GET', body } = {}) => new Promise((resolve, reject) => { const r = http.request(url, { method, headers: body ? { 'content-length': body.length } : {} }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(c).toString() })); }); r.on('error', reject); r.end(body); });
const up = (s, name, body) => req(s.urls[0] + 'up?name=' + encodeURIComponent(name), { method: 'POST', body });

test('safeUploadName blocks traversal, reserved and odd names', () => {
  assert.equal(safeUploadName('../../etc/passwd'), 'passwd'); assert.equal(safeUploadName('..\\..\\evil.exe'), 'evil.exe'); assert.equal(safeUploadName('CON'), '_CON'); assert.equal(safeUploadName('nul.txt'), '_nul.txt');
  assert.equal(safeUploadName(''), 'file'); assert.equal(safeUploadName('...'), 'file'); assert.equal(safeUploadName('a<b>:c?.txt'), 'a_b__c_.txt'); assert.equal(safeUploadName('مرحبا.pdf'), 'مرحبا.pdf'); assert.equal(safeUploadName('x'.repeat(400)).length, 150);
});
test('receives files into the folder, never overwrites, never escapes it', async () => {
  const dir = path.join(tmp(), 'in'); const r = createReceive({ addresses: lo }); const s = await r.start({ dir }); const page = await req(s.urls[0]); assert.equal(page.status, 200); assert.match(page.text, /not encrypted/);
  const data = crypto.randomBytes(100000); assert.equal((await up(s, 'photo.jpg', data)).status, 200); assert.equal((await up(s, 'photo.jpg', Buffer.from('second'))).status, 200);
  assert.ok(fs.readFileSync(path.join(dir, 'photo.jpg')).equals(data)); assert.equal(fs.readFileSync(path.join(dir, 'photo (1).jpg'), 'utf8'), 'second');
  assert.equal((await up(s, '../../escape.txt', Buffer.from('x'))).status, 200); assert.ok(fs.existsSync(path.join(dir, 'escape.txt'))); assert.ok(!fs.existsSync(path.join(dir, '..', '..', 'escape.txt')));
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.part')), [], 'no leftover partial files'); const st = r.status(); assert.equal(st.received.length, 3); assert.equal(st.totalBytes, 100000 + 6 + 1);
  assert.equal((await req(s.urls[0].replace(/\/[0-9a-f]{32}\//, '/' + '0'.repeat(32) + '/'))).status, 404); assert.equal((await req(s.urls[0] + 'other', { method: 'POST', body: Buffer.from('x') })).status, 404); assert.equal((await req(s.urls[0] + 'up', { method: 'GET' })).status, 404);
  r.stop(); assert.equal(r.status().active, false);
});
test('limits: file size, total size and file count', async () => {
  const dir = path.join(tmp(), 'in'); const r = createReceive({ addresses: lo, maxFileBytes: 1000, maxTotalBytes: 1500, maxFiles: 3 }); const s = await r.start({ dir });
  assert.equal((await up(s, 'big.bin', Buffer.alloc(1001))).status, 413); assert.ok(!fs.existsSync(path.join(dir, 'big.bin')));
  assert.equal((await up(s, 'a', Buffer.alloc(900))).status, 200); assert.equal((await up(s, 'b', Buffer.alloc(900))).status, 413, 'total cap'); assert.equal((await up(s, 'c', Buffer.alloc(100))).status, 200); assert.equal((await up(s, 'd', Buffer.alloc(1))).status, 200); assert.equal((await up(s, 'e', Buffer.alloc(1))).status, 429, 'file count cap');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a', 'c', 'd']); r.stop();
});
test('an interrupted upload leaves nothing behind', async () => {
  const dir = path.join(tmp(), 'in'); const r = createReceive({ addresses: lo }); const s = await r.start({ dir }); const u = new URL(s.urls[0]);
  await new Promise((resolve) => { const sock = net.connect(Number(u.port), '127.0.0.1', () => { sock.write(`POST ${u.pathname}up?name=cut.bin HTTP/1.1\r\nHost: x\r\ncontent-length: 5000\r\n\r\nabc`); setTimeout(() => { sock.destroy(); resolve(); }, 100); }); });
  await new Promise((r2) => setTimeout(r2, 200)); assert.deepEqual(fs.readdirSync(dir), []); assert.equal(r.status().received.length, 0); r.stop();
});
test('Drop can send several files and folders as one encrypted zip, and cleans up', async () => {
  const d = tmp(); fs.writeFileSync(path.join(d, 'a.txt'), 'AAA'); fs.mkdirSync(path.join(d, 'sub')); fs.writeFileSync(path.join(d, 'sub', 'b.txt'), 'BBB'); const t = path.join(d, 'tmp'); fs.mkdirSync(t);
  const drop = createDrop({ addresses: lo, tmpDir: t }); const s = await drop.start({ paths: [path.join(d, 'a.txt'), path.join(d, 'sub')], once: false }); assert.equal(s.encrypted, true); assert.match(s.name, /Aurora-Drop-2-items\.zip/);
  const u = new URL(s.urls[0]); const key = E.fromB64u(new URLSearchParams(u.hash.slice(1)).get('k')); const blob = await new Promise((res) => http.get(u.origin + u.pathname + 'f.aur', (r) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => res(Buffer.concat(c))); }));
  const zip = new AdmZip(E.decryptBuffer(blob, key)); assert.deepEqual(zip.getEntries().filter((e) => !e.isDirectory).map((e) => e.entryName).sort(), ['a.txt', 'sub/b.txt']); drop.stop(); assert.deepEqual(fs.readdirSync(t), [], 'temp zip and ciphertext removed');
  await assert.rejects(drop.start({ paths: [path.join(d, 'missing')] }), /ENOENT|nothing/); assert.deepEqual(fs.readdirSync(t), []);
});
