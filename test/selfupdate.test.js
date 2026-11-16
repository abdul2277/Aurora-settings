const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createSelfUpdater } = require('../lib/selfupdate');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-su-'));
const bigExe = (dir) => { const f = path.join(dir, 'Aurora-Settings-new.exe'); const b = Buffer.alloc(21 * 1024 * 1024, 1); b[0] = 0x4d; b[1] = 0x5a; fs.writeFileSync(f, b); return f; };
const manifestFetch = (version) => async () => new Response(JSON.stringify({ version, url: 'https://example.test/a.exe', sha256: 'a'.repeat(64), notes: 'n' }));
const mk = (dir, fetchFn) => createSelfUpdater({ exePath: path.join(dir, 'Aurora.exe'), isPortable: true, currentVersion: '1.0.0', dataDir: dir, fetchFn, getUrl: () => 'https://example.test/u.json', quitApp() {}, spawnFn: () => ({ unref() {} }) });

test('a background check never wipes a staged update', async () => {
  const dir = tmp(); const u = mk(dir, manifestFetch('1.0.0'));
  await u.useFile(bigExe(dir)); assert.equal(u.info().status.state, 'ready');
  await u.check(); // "up to date" answer arrives while an update is staged
  assert.equal(u.info().status.state, 'ready'); assert.ok(u.info().status.info.sha256);
  const bad = mk(dir, async () => { throw new Error('offline'); }); await u.check();
  await assert.rejects(bad.check(), /offline/);
});

test('a failing check keeps a staged update ready', async () => {
  const dir = tmp(); let fail = false; const u = mk(dir, async (...a) => { if (fail) throw new Error('offline'); return manifestFetch('1.0.0')(...a); });
  await u.useFile(bigExe(dir)); fail = true;
  await assert.rejects(u.check(), /offline/); assert.equal(u.info().status.state, 'ready');
});

test('check reports a newer version and rejects unsafe manifests', async () => {
  const dir = tmp(); const u = mk(dir, manifestFetch('2.0.0')); const r = await u.check();
  assert.equal(r.available, true); assert.equal(u.info().status.state, 'available');
  const unsafe = mk(dir, async () => new Response(JSON.stringify({ version: '2.0.0', url: 'http://x.test/a.exe', sha256: 'zz' })));
  await assert.rejects(unsafe.check(), /secure download link/);
});

test('apply refuses when nothing is staged or not portable', async () => {
  const dir = tmp(); const u = mk(dir, manifestFetch('1.0.0')); await assert.rejects(u.apply(), /Nothing is ready/);
});

test('a second download request while downloading is refused', async () => {
  const dir = tmp(); let release; const slow = new Promise((r) => { release = r; });
  const u = createSelfUpdater({ exePath: path.join(dir, 'A.exe'), isPortable: true, currentVersion: '1.0.0', dataDir: dir, getUrl: () => 'https://example.test/u.json', quitApp() {},
    fetchFn: async (url) => (url.endsWith('u.json') ? manifestFetch('2.0.0')() : (await slow, new Response('x', { status: 500 }))) });
  await u.check(); const first = u.download().catch(() => {}); await new Promise((r) => setTimeout(r, 10));
  await assert.rejects(u.download(), /already running/); release(); await first;
});
