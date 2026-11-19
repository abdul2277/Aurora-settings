const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path');
const C = require('../lib/crashlog'); const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-cl-'));
test('redact removes Windows, macOS, Linux home folders and the user name', () => {
  assert.equal(C.redact('at C:\\Users\\alice\\AppData\\x.js:1', 'alice'), 'at C:\\Users\\<user>\\AppData\\x.js:1'); assert.equal(C.redact('D:/users/Bob/f', ''), 'D:/users/<user>/f');
  assert.equal(C.redact('/home/carol/app and /Users/dave/x', ''), '/home/<user>/app and /Users/<user>/x'); assert.equal(C.redact('hello alice', 'alice'), 'hello <user>'); assert.equal(C.redact(null), ''); assert.equal(C.redact('ab and ab', 'ab'), 'ab and ab', 'too-short names are left alone');
});
test('buildReport has the facts, redaction and a length cap', () => {
  const e = new Error('boom at C:\\Users\\erin\\x'); const r = C.buildReport({ err: e, version: '1.41.0', platform: 'win32', release: '10.0', electron: '33', page: 'store', now: new Date('2026-05-01T09:30:00Z'), userName: 'erin' });
  assert.match(r, /Version: 1\.41\.0/); assert.match(r, /Page: store/); assert.match(r, /2026-05-01T09:30:00/); assert.ok(!r.includes('erin') && r.includes('<user>'));
  assert.ok(C.buildReport({ err: 'x'.repeat(20000) }).length < 7000); assert.match(C.buildReport({ err: undefined }), /undefined/);
});
test('save writes a file, never overwrites, keeps only the newest 20, and never throws', () => {
  const dir = tmp(); const files = new Set(); for (let i = 0; i < 25; i++) files.add(C.save(dir, 'r' + i, new Date(Date.UTC(2026, 0, 1, 0, 0, i)))); assert.equal(files.size, 25); assert.equal(fs.readdirSync(dir).filter((f) => f.startsWith('crash-')).length, 20);
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'x'); C.trim(dir, 5); assert.ok(fs.existsSync(path.join(dir, 'keep.txt'))); const blocker = path.join(dir, 'afile'); fs.writeFileSync(blocker, 'x'); assert.equal(C.save(path.join(blocker, 'sub'), 'x'), null);
});
test('the reporter shows one message per cooldown, always saves, and survives a failing dialog', () => {
  const dir = tmp(); let t = 1000000; const shown = []; const rep = C.createReporter({ dir, version: '1', show: (text, file) => shown.push(file), now: () => new Date(t), cooldownMs: 5000 });
  const f1 = rep(new Error('a')); t += 1000; const f2 = rep(new Error('b')); t += 1000; rep(new Error('c')); assert.equal(shown.length, 1); assert.ok(f1 && f2 && f1 !== f2); assert.equal(fs.readdirSync(dir).length, 3, 'every error is still saved');
  t += 6000; rep(new Error('d')); assert.equal(shown.length, 2);
  const bad = C.createReporter({ dir: tmp(), version: '1', show: () => { throw new Error('dialog failed'); } }); assert.doesNotThrow(() => bad(new Error('x')));
  const nodir = C.createReporter({ dir: path.join(dir, 'afile'), version: '1', show: (text) => shown.push(text) }); fs.writeFileSync(path.join(dir, 'afile'), 'x'); assert.doesNotThrow(() => nodir(new Error('y')));
});
