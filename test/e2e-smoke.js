// Launches the real app (Electron) and visits every page, failing on any page/console error.
// Run on Linux with:  xvfb-run -a node test/e2e-smoke.js   (needs `playwright` resolvable)
const path = require('path'); const fs = require('fs'); const os = require('os');
let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-e2e-'));
  const app = await pw._electron.launch({ executablePath: require(path.join(__dirname, '..', 'node_modules', 'electron')), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + userData], env: { ...process.env, AURORA_E2E: '1' } });
  const win = await app.firstWindow(); const errors = [];
  win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await win.waitForFunction(() => window.PAGES && window.PAGES.length && typeof go === 'function', null, { timeout: 30000 });
  const pages = await win.evaluate(() => window.PAGES.map((p) => p.id));
  for (const id of pages) { await win.evaluate((i) => go(i), id); await win.waitForTimeout(350); }
  await win.waitForTimeout(1500);
  const callErrors = await win.evaluate(() => (window.__callErrors || []).map((e) => e.call + ': ' + e.error));
  if (process.env.SHOT) await win.screenshot({ path: process.env.SHOT });
  await app.close();
  console.log('pages visited:', pages.length);
  const all = [...new Set(errors)]; all.forEach((e) => console.log('ERR', e.slice(0, 200)));
  console.log('backend call errors:'); [...new Set(callErrors)].forEach((e) => console.log('  CALL', e.slice(0, 160)));
  process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('E2E FAILED', e); process.exit(2); });
