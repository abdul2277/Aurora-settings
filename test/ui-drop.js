// Real-browser test: a receiver opens the Drop link over plain http://, decrypts in the page and downloads the original file.
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto'); const assert = require('assert');
let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
const { createDrop } = require('../lib/toolkit');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-ud-')); const data = crypto.randomBytes(900000); const file = path.join(dir, 'Résumé & مرحبا notes.bin'); fs.writeFileSync(file, data);
  const drop = createDrop({ addresses: () => [{ name: 'lo', address: '127.0.0.1' }], tmpDir: dir }); const s = await drop.start({ file, once: false });
  const browser = await pw.chromium.launch(); const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(s.urls[0]); // note: localhost counts as a secure context, a real LAN address does not; the page's own decryptor works in both
  assert.equal(await page.textContent('#name'), 'Résumé & مرحبا notes.bin', 'file name comes from the fragment');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#go')]); assert.equal(dl.suggestedFilename(), 'Résumé & مرحبا notes.bin');
  const out = path.join(dir, 'received.bin'); await dl.saveAs(out); assert.ok(fs.readFileSync(out).equals(data), 'decrypted file is byte-identical'); await page.waitForSelector('#msg:has-text("Done")');
  // a link without the key cannot decrypt anything
  const p2 = await ctx.newPage(); await p2.goto(s.urls[0].split('#')[0]); await p2.waitForSelector('#msg.err'); assert.ok(await p2.isDisabled('#go'));
  // a link with the wrong key reports an error and saves nothing
  const p3 = await ctx.newPage(); await p3.goto(s.urls[0].replace(/#k=[^&]+/, '#k=' + Buffer.alloc(32, 7).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))); await p3.click('#go'); await p3.waitForSelector('#msg.err:has-text("Wrong key")');
  drop.stop(); await browser.close(); assert.deepStrictEqual(errors, []); console.log('drop browser test: PASSED'); process.exit(0);
})().catch((e) => { console.error('DROP UI TEST FAILED:', e.message); process.exit(2); });
