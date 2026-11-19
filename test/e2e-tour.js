// Real Electron app, persistent profile: the tour shows on the first launch, and never again after it has been dismissed.
const path = require('path'); const fs = require('fs'); const os = require('os'); const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-tour-')); const exe = require(path.join(__dirname, '..', 'node_modules', 'electron'));
  const launch = async () => { const app = await pw._electron.launch({ executablePath: exe, args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + userData] }); const win = await app.firstWindow(); await win.waitForFunction(() => window.auroraTour && typeof go === 'function', null, { timeout: 30000 }); return { app, win }; };
  let { app, win } = await launch(); await win.waitForSelector('.tour-card', { timeout: 20000 });
  assert.ok(await win.evaluate(() => { const i = document.querySelector('.tour-art img'); return i && i.complete && i.naturalWidth > 0; }), 'the logo picture loads in the packaged app layout');
  await win.keyboard.press('Escape'); assert.equal(await win.locator('.tour-card').count(), 0); await win.waitForTimeout(500); await app.close();
  ({ app, win } = await launch()); await win.waitForTimeout(5000); assert.equal(await win.locator('.tour-card').count(), 0, 'the tour does not come back on the next launch');
  await win.evaluate(() => window.auroraTour.start()); await win.waitForSelector('.tour-card'); await app.close(); console.log('tour e2e: PASSED'); process.exit(0);
})().catch((e) => { console.error('TOUR E2E FAILED:', e.message.split('\n').slice(0, 6).join('\n')); process.exit(2); });
