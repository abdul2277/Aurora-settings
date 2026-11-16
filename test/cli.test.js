const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto'); const { spawnSync } = require('child_process');
const E = require('../lib/e2ee'); const { createDrop } = require('../lib/toolkit'); const http = require('http');
const CLI = path.join(__dirname, '..', 'tools', 'aurora-decrypt.js'); const run = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-c-'));
test('CLI decrypts a Drop download using the full link, keeping the original file name', async () => {
  const d = tmp(); const data = crypto.randomBytes(200000); const f = path.join(d, 'Quarterly plan.xlsx'); fs.writeFileSync(f, data);
  const drop = createDrop({ addresses: () => [{ name: 'lo', address: '127.0.0.1' }], tmpDir: d }); const s = await drop.start({ file: f, once: false });
  const blob = await new Promise((res) => http.get(s.urls[0].split('#')[0] + 'f.aur', (r) => { const c = []; r.on('data', (x) => c.push(x)); r.on('end', () => res(Buffer.concat(c))); })); drop.stop();
  const dl = path.join(d, 'dl'); fs.mkdirSync(dl); const enc = path.join(dl, 'f.aur'); fs.writeFileSync(enc, blob);
  const r = run([enc, '--link', s.urls[0]]); assert.equal(r.status, 0, r.stderr); assert.ok(fs.readFileSync(path.join(dl, 'Quarterly plan.xlsx')).equals(data));
  assert.equal(fs.readdirSync(process.cwd()).includes('Quarterly plan.xlsx'), false, 'nothing is written to the current folder'); const again = run([enc, '--link', s.urls[0]]); assert.equal(again.status, 1); assert.match(again.stderr, /already exists/);
  const bad = run([enc, '--key', E.b64u(E.newKey()), '--out', path.join(dl, 'x.out')]); assert.equal(bad.status, 1); assert.match(bad.stderr, /Wrong password or key/); assert.equal(fs.existsSync(path.join(dl, 'x.out')), false);
  assert.match(run([enc]).stderr, /needs its key/);
});
test('CLI unlocks a password-locked file, and wrong or missing passwords fail cleanly', async () => {
  const d = tmp(); const data = crypto.randomBytes(5000); const f = path.join(d, 'report.pdf'); fs.writeFileSync(f, data); await E.encryptFileWithPassword(f, f + '.aur', 'a decent password');
  assert.equal(run([f + '.aur', '--out', path.join(d, 'a.pdf')], { AURORA_PASSWORD: 'nope nope nope' }).status, 1);
  fs.rmSync(f); assert.match(run([f + '.aur']).stderr, /password-locked/);
  const ok = run([f + '.aur', '--out', path.join(d, 'b.pdf')], { AURORA_PASSWORD: 'a decent password' }); assert.equal(ok.status, 0, ok.stderr); assert.ok(fs.readFileSync(path.join(d, 'b.pdf')).equals(data));
  fs.writeFileSync(path.join(d, 'pw.txt'), 'a decent password\n'); assert.equal(run([f + '.aur', '--out', path.join(d, 'c.pdf'), '--password-file', path.join(d, 'pw.txt')]).status, 0);
  assert.match(run([path.join(d, 'nothing.aur')]).stderr, /not found/); fs.writeFileSync(path.join(d, 'plain.txt'), 'hello hello hello hello hello hello hello'); assert.match(run([path.join(d, 'plain.txt')]).stderr, /not an Aurora/);
});
