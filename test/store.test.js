const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const winget = require('../lib/winget'); const { createAppStore, swapFolder, githubSource } = require('../lib/appstore');
const { fakePackage, fakeRunner, sha } = require('./helpers');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-t-'));
const APP = { id: 'Test.App', name: 'Test App', category: 'Tools', icon: 'T', desc: 'x', match: '^Test App' };
const mk = (pkg, extra = {}) => { const dir = tmp(); return { dir, appsDir: path.join(dir, 'apps'), store: createAppStore({ source: pkg.source, fetchFn: pkg.fetchFn, dataDir: path.join(dir, 'data'), appsDir: path.join(dir, 'apps'), runner: fakeRunner(), catalog: [APP], ...extra }) }; };

test('compareVersions orders real-world versions', () => {
  const c = winget.compareVersions;
  assert.equal(c('1.2.10', '1.2.9'), 1); assert.equal(c('2.0', '2.0.0'), -1); assert.equal(c('3.0.20', '3.0.21'), -1); assert.equal(c('1.0', '1.0'), 0);
});

test('download: checksum mismatch deletes the file and refuses', async () => {
  const dest = path.join(tmp(), 'f.bin'); const body = Buffer.from('hello');
  await assert.rejects(winget.download('https://x.test/f', dest, { fetchFn: async () => new Response(body, { headers: { 'content-length': '5' } }), expectedSha256: sha(Buffer.from('other')) }), /checksum/);
  assert.equal(fs.existsSync(dest), false);
});

test('download: a file-system error is reported, never an unhandled crash', async () => {
  const dir = tmp(); const dest = path.join(dir, 'isadir'); fs.mkdirSync(dest); // writing to a directory path fails with EISDIR
  const body = Buffer.alloc(1024, 7); let uncaught = null; const h = (e) => { uncaught = e; }; process.once('uncaughtException', h);
  await assert.rejects(winget.download('https://x.test/f', dest, { fetchFn: async () => new Response(body), expectedSha256: sha(body) }), /Could not save the download/);
  await new Promise((r) => setTimeout(r, 50)); process.off('uncaughtException', h); assert.equal(uncaught, null);
});

test('download: refuses http and missing checksums', async () => {
  await assert.rejects(winget.download('http://x.test/f', path.join(tmp(), 'a'), { expectedSha256: 'a'.repeat(64) }), /https/);
  await assert.rejects(winget.download('https://x.test/f', path.join(tmp(), 'a'), { expectedSha256: '' }), /no checksum/);
});

test('portable install, then update replaces the app without leftovers', async () => {
  const v1 = Buffer.from('MZ-version-one'), v2 = Buffer.from('MZ-version-two-bigger');
  const pkg = fakePackage({ versions: { '1.0.0': v1 } }); const { store, appsDir } = mk(pkg);
  store.install('Test.App'); await store._idle();
  const rec = store._state().installed['Test.App']; assert.equal(rec.version, '1.0.0'); assert.deepEqual(fs.readFileSync(rec.exe), v1);
  const pkg2 = fakePackage({ versions: { '1.0.0': v1, '2.0.0': v2 } }); pkg.source.list = pkg2.source.list; pkg.source.read = pkg2.source.read; pkg2.urls.forEach((b, u) => pkg.urls.set(u, b));
  const stale = await store.updatesReport(); assert.equal(stale.updates.length, 0); // cached manifest
  const rep = await store.updatesReport({ force: true }); assert.equal(rep.updates.length, 1); assert.equal(rep.updates[0].latest, '2.0.0');
  store.install('Test.App'); await store._idle();
  const rec2 = store._state().installed['Test.App']; assert.equal(rec2.version, '2.0.0'); assert.deepEqual(fs.readFileSync(rec2.exe), v2);
  assert.deepEqual(fs.readdirSync(appsDir).sort(), ['Test.App']);
});

test('a failed update keeps the working old version', async () => {
  const v1 = Buffer.from('MZ-good-old'); const pkg = fakePackage({ versions: { '1.0.0': v1 } }); const { store } = mk(pkg);
  store.install('Test.App'); await store._idle(); const exe = store._state().installed['Test.App'].exe;
  const bad = fakePackage({ versions: { '1.0.0': v1, '2.0.0': Buffer.from('MZ-new') } }); pkg.source.list = bad.source.list; pkg.source.read = bad.source.read;
  pkg.fetchFn = null; // network down: the new download fails
  const s2 = createAppStore({ source: pkg.source, fetchFn: async () => new Response('x', { status: 500 }), dataDir: path.join(path.dirname(path.dirname(exe)), '..', 'data'), appsDir: path.dirname(path.dirname(exe)), runner: fakeRunner(), catalog: [APP] });
  s2.install('Test.App'); await s2._idle();
  assert.equal(s2.jobs()[0].status, 'error'); assert.deepEqual(fs.readFileSync(exe), v1);
});

test('swapFolder restores the old folder when the swap fails', () => {
  const root = tmp(); const target = path.join(root, 'app'); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'keep.txt'), 'old');
  assert.throws(() => swapFolder(path.join(root, 'does-not-exist'), target), /Close the app/);
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'old'); assert.equal(fs.existsSync(target + '.old'), false);
});

test('updates: a rate limit is reported, not shown as "everything is up to date"', async () => {
  const pkg = fakePackage({ versions: { '1.0.0': Buffer.from('MZ1') } }); const { store } = mk(pkg);
  store.install('Test.App'); await store._idle();
  const err = new Error('GitHub is limiting how often Vorynth can look up apps. Try again in about 12 minutes.'); err.rateLimited = true; pkg.source.failWith = err;
  const fresh = createAppStore({ source: pkg.source, fetchFn: pkg.fetchFn, dataDir: path.join(path.dirname(store._dirHint || os.tmpdir()), 'x'), appsDir: tmp(), runner: fakeRunner(), catalog: [APP] });
  fresh._state().installed['Test.App'] = { id: 'Test.App', version: '1.0.0' };
  await assert.rejects(fresh.updates(), /limiting/);
  const rep = await fresh.updatesReport(); assert.match(rep.limited, /limiting/); assert.equal(rep.updates.length, 0);
});

test('updates: one broken app does not hide the others', async () => {
  const good = fakePackage({ id: 'Good.App', versions: { '1.0.0': Buffer.from('a'), '2.0.0': Buffer.from('b') } }); const bad = fakePackage({ id: 'Bad.App', versions: {} });
  const source = { list: (d) => (d.includes('/b/') ? Promise.reject(new Error('boom')) : good.source.list(d)), read: good.source.read };
  const cat = [{ id: 'Good.App', name: 'Good', category: 'T', icon: 'g', desc: '', match: '' }, { id: 'Bad.App', name: 'Bad', category: 'T', icon: 'b', desc: '', match: '' }];
  const s = createAppStore({ source, fetchFn: good.fetchFn, dataDir: tmp(), appsDir: tmp(), runner: fakeRunner(), catalog: cat });
  s._state().installed['Good.App'] = { id: 'Good.App', version: '1.0.0' }; s._state().installed['Bad.App'] = { id: 'Bad.App', version: '1.0.0' };
  const rep = await s.updatesReport(); assert.deepEqual(rep.updates.map((u) => u.id), ['Good.App']); assert.equal(rep.errors.length, 1);
  const only = await s.updatesReport({ aurora: true }); assert.equal(only.checked, 2);
});

test('githubSource: rate-limit responses become friendly, flagged errors; token only goes to api.github.com', async () => {
  const seen = []; const fetchFn = async (url, o) => { seen.push([url, o.headers.authorization]); return url.includes('api.github.com') ? new Response('{}', { status: 403, headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) } }) : new Response('x'); };
  const src = githubSource({ fetchFn, token: 'tok' });
  await assert.rejects(src.list('manifests/t/Test'), (e) => e.rateLimited === true && /about \d+ minute/.test(e.message));
  await src.read('manifests/t/Test/a.yaml'); assert.equal(seen[0][1], 'Bearer tok'); assert.equal(seen[1][1], undefined);
});
