// Store UI test: runs the real renderer in headless Chromium against renderer/mock-api.js (Windows-only pages need ?platform=win32).
// Run:  node test/ui-store.js        (SHOTS=/some/dir to save screenshots)
const path = require('path'); const assert = require('assert');
let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = [];
  await page.addInitScript(() => { try { localStorage.setItem('aiFirstRun', '1'); localStorage.setItem('aurora.tour', '1'); } catch (_) {} }); // skip the one-time first-run AI prompt
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?platform=win32'); await page.waitForFunction(() => typeof go === 'function' && window.PAGES);
  await page.waitForTimeout(2500); await page.evaluate(() => go('store', 'appstore')); await page.waitForSelector('.sx-card'); const shot = async (n) => { if (process.env.SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(process.env.SHOTS, n) }); } };
  assert.equal(await page.locator('.sx-card').count(), 4); assert.equal(await page.locator('.sx-stat').count(), 3);
  assert.equal(await page.locator('.sx-stat b').nth(1).textContent(), '1', 'one app installed (VLC)'); await shot('store-grid.png');
  // search + empty state
  await page.fill('.sx-search', 'fire'); assert.equal(await page.locator('.sx-card').count(), 1); await page.fill('.sx-search', 'zzzz'); assert.equal(await page.locator('.sx-empty').count(), 1); await page.fill('.sx-search', '');
  // views + sort (remembered)
  await page.click('.sx-vbtn >> nth=1'); assert.equal(await page.locator('.sx-grid.list').count(), 1); await shot('store-list.png'); await page.click('.sx-vbtn >> nth=0');
  await page.selectOption('.sx-sort', 'status'); assert.match(await page.locator('.sx-card').first().textContent(), /VLC/, 'installed first');
  await page.selectOption('.sx-sort', 'name'); assert.match(await page.locator('.sx-card').first().textContent(), /Firefox/);
  // details
  await page.locator('.sx-card', { hasText: 'Firefox' }).getByText('Details').click(); await page.waitForSelector('.store-info:has-text("Latest version")');
  // install flow
  await page.locator('.sx-card', { hasText: 'Git' }).getByText('Install').click(); await page.waitForSelector('.sx-card:has-text("Git") .sx-bar'); await shot('store-installing.png');
  await page.waitForSelector('.sx-card:has-text("Git") .sx-badge.ok', { timeout: 12000 });
  // update check -> badge + Update all -> the update disappears once done (regression: stale "update available")
  await page.click('text=Check for updates'); await page.waitForSelector('.sx-card:has-text("VLC") .sx-badge.warn'); assert.equal(await page.locator('.sx-stat b').nth(2).textContent(), '1'); await shot('store-updates.png');
  assert.match(await page.locator('button:has-text("Update all")').textContent(), /\(1\)/);
  await page.click('button:has-text("Update all")'); await page.waitForSelector('.sx-card:has-text("VLC") .sx-bar');
  await page.waitForFunction(() => !document.querySelector('.sx-card[data-app="VideoLAN.VLC"] .sx-badge.warn') && document.querySelectorAll('.sx-stat b')[2].textContent === '0', null, { timeout: 12000 });
  assert.equal(await page.locator('button:has-text("Update all")').isVisible(), false, 'Update all hidden after updating');
  // collections, export and import
  await page.click('.chip >> nth=0'); await page.waitForSelector('.sx-ccard'); assert.equal(await page.locator('.sx-ccard').count(), 2); assert.match(await page.locator('.sx-ccard').first().textContent(), /1 of 3 installed/); await shot('store-collections.png');
  await page.click('.sx-ccard[data-coll="creator"] button'); await page.waitForSelector('.sx-card:has-text("Rufus") .sx-bar');
  await page.click('button:has-text("Export my apps")'); await page.waitForSelector('text=Saved 2 apps'); await page.click('button:has-text("Import a list")'); await page.waitForSelector('text=1 already installed');
  // add by id
  assert.ok(await page.locator('.sx-hero-btns button').count() >= 4); await page.keyboard.press('/'); assert.ok(await page.evaluate(() => document.activeElement.classList.contains('sx-search')));
  await browser.close(); const all = [...new Set(errors)]; all.forEach((e) => console.log('ERR', e.slice(0, 200)));
  console.log('store UI test: ' + (all.length ? 'FAILED' : 'PASSED')); process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('UI TEST FAILED:', e.message.split('\n').slice(0, 25).join('\n')); process.exit(2); });
