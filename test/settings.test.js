const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.js'), pages = read('renderer/pages.js');
const block = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));
const toggleKeys = new Set([...block('const TOGGLES = {', 'const restartExplorer').matchAll(/^  (\w+): (?:\{|\w+Toggle\()/gm)].map((m) => m[1]));
const CUSTOM_HANDLED = new Set(['mute']); // switches with their own get/set handlers (muteSet) instead of a registry entry

test('every switch shown in the UI exists in the backend', () => {
  const used = new Set([...pages.matchAll(/\btoggle\('(\w+)'/g)].map((m) => m[1]));
  assert.ok(used.size > 40, 'found the page switches'); const missing = [...used].filter((id) => !toggleKeys.has(id) && !CUSTOM_HANDLED.has(id));
  assert.deepEqual(missing, []);
});
test('presets only reference real switches', () => {
  const presets = block('const PRESETS = {', 'async function applyPreset'); const ids = new Set([...presets.matchAll(/\b(\w+): (?:true|false)\b/g)].map((m) => m[1]));
  assert.deepEqual([...ids].filter((id) => !toggleKeys.has(id)), []);
});
test('the machine-wide AI switch is wired into the pages, presets and defaults', () => {
  assert.ok(toggleKeys.has('aiMachine')); assert.ok(/toggle\('aiMachine'/.test(pages));
  for (const p of ['aiAllOff', 'aiAllOn', 'msAllOff', 'msAllOn']) assert.match(block(`  ${p}:`, '\n'), /aiMachine: (true|false)/);
  assert.match(block('function defaultOn', 'async function toggleSet'), /'aiMachine'/);
});
test('every renderer backend call has a handler', () => {
  const fs2 = require('fs'); const src = ['main.js', ...fs2.readdirSync(path.join(__dirname, '..', 'lib')).filter((f) => f.endsWith('.js')).map((f) => 'lib/' + f)].map(read).join('\n');
  const calls = new Set(); for (const f of fs2.readdirSync(path.join(__dirname, '..', 'renderer')).filter((f) => f.endsWith('.js') && f !== 'mock-api.js')) for (const m of read('renderer/' + f).matchAll(/\bcall\('(\w+)'/g)) calls.add(m[1]);
  const missing = [...calls].filter((c) => !new RegExp('\\b' + c + '\\s*[:(]|handlers\\.' + c + '\\b').test(src)); assert.deepEqual(missing, []);
});
