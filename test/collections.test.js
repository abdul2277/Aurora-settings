const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path');
const { COLLECTIONS } = require('../lib/collections'); const { CATALOG } = require('../lib/catalog'); const { createAppStore } = require('../lib/appstore'); const { fakePackage, fakeRunner } = require('./helpers');
const APP = { id: 'Test.App', name: 'Test App', category: 'Tools', icon: 'T', desc: 'x', match: '^Test App' };
const mk = () => { const pkg = fakePackage({ versions: { '1.0.0': Buffer.from('MZ-x') } }); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-col-')); return { pkg, store: createAppStore({ source: pkg.source, fetchFn: pkg.fetchFn, dataDir: path.join(dir, 'd'), appsDir: path.join(dir, 'a'), runner: fakeRunner(), catalog: [APP, { ...APP, id: 'Other.App', name: 'Other' }] }) }; };
test('every collection app exists in the catalog, with no duplicates', () => {
  const ids = new Set(CATALOG.map((a) => a.id)); const names = new Set();
  for (const c of COLLECTIONS) { assert.ok(!names.has(c.id), 'unique collection id ' + c.id); names.add(c.id); assert.ok(c.apps.length >= 3); assert.equal(new Set(c.apps).size, c.apps.length); for (const a of c.apps) assert.ok(ids.has(a), c.id + ' references missing ' + a); }
});
test('installMany queues new apps, skips installed, reports unknown, dedupes', async () => {
  const { store } = mk(); const r1 = store.installMany(['Test.App', 'Test.App', 'Nope.Unknown', '']); assert.deepEqual(r1.queued.map((q) => q.id), ['Test.App']); assert.deepEqual(r1.unknown, ['Nope.Unknown']); await store._idle();
  const r2 = store.installMany(['Test.App', 'Other.App']); assert.deepEqual(r2.skipped, ['Test.App']); assert.deepEqual(r2.queued.map((q) => q.id), ['Other.App']); await store._idle();
  assert.throws(() => store.installMany('x'), /Choose some apps/); assert.equal(store.installMany(new Array(500).fill('Test.App')).queued.length, 0);
});
test('export then parse roundtrips, and bad lists are refused', async () => {
  const { store } = mk(); store.install('Test.App'); await store._idle(); const doc = store.exportList(); assert.equal(doc.format, 'aurora-store-list'); assert.deepEqual(doc.apps.map((a) => a.id), ['Test.App']); assert.deepEqual(store.parseList(JSON.parse(JSON.stringify(doc))), ['Test.App']);
  for (const bad of [null, {}, { format: 'x', v: 1, apps: [] }, { format: 'aurora-store-list', v: 2, apps: [] }, { format: 'aurora-store-list', v: 1, apps: 'x' }]) assert.throws(() => store.parseList(bad), /not an Aurora app list/);
  assert.throws(() => store.parseList({ format: 'aurora-store-list', v: 1, apps: new Array(201).fill({ id: 'A.B' }) }), /too long/);
  assert.deepEqual(store.parseList({ format: 'aurora-store-list', v: 1, apps: [{ id: 'Good.App' }, { id: '../../etc/passwd' }, { id: 'a b' }, {}, null, { id: 'x; rm -rf /' }] }), ['Good.App'], 'hostile ids are dropped');
  assert.throws(() => store.collectionApps('nope'), /Unknown collection/); assert.ok(store.collectionApps('developer').includes('Git.Git'));
});
