const test = require('node:test'); const assert = require('node:assert/strict'); const vm = require('vm');
const A = require('../lib/addons');
const keys = Object.keys(A.SAMPLES);
test('there are many add-ons and the new batch is registered', () => { assert.ok(keys.length >= 180, 'add-on count ' + keys.length); for (const k of ['x7_btcodecs', 'x7_audiosize', 'x7_timestamps', 'x7_pwmeter', 'x7_textstats', 'x7_jwt', 'x7_percent', 'x8_bandwidth', 'x8_cron', 'x8_tipsplit', 'x8_case', 'x8_sleep', 'x8_aspect']) assert.ok(A.SAMPLES[k], k); });
test('every add-on builds a valid, safe package', () => {
  const ids = new Map(); const bad = [];
  for (const k of keys) { try { const pkg = A.checkPackage(A.SAMPLES[k]()); const m = pkg.manifest; if (ids.has(m.id)) bad.push(`duplicate id ${m.id}: ${k} and ${ids.get(m.id)}`); ids.set(m.id, k); if (!m.description) bad.push(k + ': no description'); if (m.permissions.some((p) => !A.PERMISSIONS[p])) bad.push(k + ': bad permission'); } catch (e) { bad.push(k + ': ' + e.message); } }
  assert.deepEqual(bad, []);
});
test('every add-on script is valid JavaScript', () => {
  const bad = []; for (const k of keys) { const html = A.SAMPLES[k]().get('index.html').toString('utf8'); const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]); if (!scripts.length) bad.push(k + ': no script'); scripts.forEach((s) => { try { new vm.Script(s); } catch (e) { bad.push(k + ': ' + e.message); } }); }
  assert.deepEqual(bad, []);
});
test('add-ons never load remote resources (the sandbox forbids it)', () => {
  const bad = []; for (const k of keys) { const html = A.SAMPLES[k]().get('index.html').toString('utf8'); if (/\b(?:src|href)=["']https?:/i.test(html) || /\bfetch\(|XMLHttpRequest|WebSocket|importScripts/.test(html)) bad.push(k); } assert.deepEqual(bad, []);
});
test('retired duplicates are no longer offered, and installed ids stay unique', () => { for (const k of ['breathe', 'lava', 'gradmaker2']) assert.equal(A.SAMPLES[k], undefined, k); });
