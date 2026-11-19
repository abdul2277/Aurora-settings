const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawnSync } = require('child_process');
const D = require('../lib/doctor'); const find = (list, id) => list.find((x) => x.id === id);
test('clock drift: ok, warn, bad, with a safe fix', () => {
  assert.equal(find(D.evaluate({ timeOffsetSec: 0.4 }), 'timesync').level, 'ok'); assert.equal(find(D.evaluate({ timeOffsetSec: -12 }), 'timesync').level, 'warn'); const bad = find(D.evaluate({ timeOffsetSec: 400 }), 'timesync'); assert.equal(bad.level, 'bad'); assert.equal(bad.fix, 'timesync'); assert.ok(D.FIXES.timesync.admin); assert.equal(D.evaluate({}).length, 0, 'no facts, no findings');
});
test('update age, extra drives, boot security and risky settings', () => {
  assert.equal(find(D.evaluate({ lastUpdateDays: 10 }), 'updateage').level, 'ok'); assert.equal(find(D.evaluate({ lastUpdateDays: 90 }), 'updateage').level, 'warn'); assert.equal(find(D.evaluate({ lastUpdateDays: 200 }), 'updateage').level, 'bad');
  const dr = D.evaluate({ otherDrives: [{ name: 'D', freeGB: 1, totalGB: 500 }, { name: 'E', freeGB: 40, totalGB: 500 }, { name: 'F', freeGB: 300, totalGB: 500 }, { name: 'G', freeGB: 0, totalGB: 0 }] }); assert.equal(find(dr, 'disk2').level, 'bad'); assert.equal(find(dr, 'disk3').level, 'warn'); assert.equal(find(dr, 'disk4'), undefined); assert.match(find(dr, 'disk2').title, /Drive D/);
  assert.equal(find(D.evaluate({ secureBoot: false }), 'secureboot').level, 'warn'); assert.equal(find(D.evaluate({ secureBoot: true }), 'secureboot').level, 'ok'); assert.equal(find(D.evaluate({ secureBoot: undefined }), 'secureboot'), undefined);
  assert.equal(find(D.evaluate({ tpmPresent: false }), 'tpm').level, 'warn'); assert.equal(find(D.evaluate({ tpmPresent: true }), 'tpm'), undefined);
  assert.equal(find(D.evaluate({ uacOff: true }), 'uac').level, 'bad'); assert.equal(find(D.evaluate({ uacOff: false }), 'uac'), undefined); assert.equal(find(D.evaluate({ rdpOn: true }), 'rdp').level, 'warn'); assert.equal(find(D.evaluate({ rdpOn: false }), 'rdp'), undefined);
  assert.equal(find(D.evaluate({ recycleMB: 5000 }), 'recycle').level, 'warn'); assert.equal(find(D.evaluate({ recycleMB: 100 }), 'recycle'), undefined);
});
test('new findings land in the right step and affect the score sensibly', () => {
  assert.equal(D.stepOf('disk2'), 'drives'); assert.equal(D.stepOf('recycle'), 'drives'); assert.equal(D.stepOf('secureboot'), 'devices'); assert.equal(D.stepOf('uac'), 'windows');
  const list = D.evaluate({ uacOff: true, timeOffsetSec: 500, secureBoot: false }); assert.equal(D.score(list), 100 - 18 - 18 - 7);
});
test('every fix is a closed, well-formed whitelist entry', () => { for (const [id, f] of Object.entries(D.FIXES)) { assert.ok(/^[a-z]+$/.test(id), id); assert.ok(f.title && typeof f.script === 'string' && typeof f.admin === 'boolean', id); } });
test('the Windows probe and every fix script are valid PowerShell (parsed with the real parser)', { skip: !spawnSync('pwsh', ['-NoProfile', '-c', '1'], { encoding: 'utf8' }).stdout }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-ps-')); const items = { probe: D.WIN_PROBE, ...Object.fromEntries(Object.entries(D.FIXES).map(([k, v]) => ['fix-' + k, v.script])) }; fs.writeFileSync(path.join(dir, 'in.json'), JSON.stringify(items));
  const r = spawnSync('pwsh', ['-NoProfile', '-c', `$o = Get-Content '${path.join(dir, 'in.json')}' -Raw | ConvertFrom-Json; foreach ($p in $o.PSObject.Properties) { $e=$null; $t=$null; [void][System.Management.Automation.Language.Parser]::ParseInput($p.Value,[ref]$t,[ref]$e); if ($e.Count) { "$($p.Name): $($e[0].Message)" } }`], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), '', 'PowerShell parse errors:\n' + r.stdout);
});
