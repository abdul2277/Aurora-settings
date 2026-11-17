// Right-to-left check: every page, in RTL, must not overflow sideways, and the layout must actually mirror.
const path = require('path'); const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); const errors = [];
  await page.addInitScript(() => { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} }); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?platform=win32'); await page.waitForFunction(() => typeof go === 'function' && window.auroraUi); await page.waitForTimeout(2300);
  const ltr = await page.evaluate(() => { go('home'); const s = document.querySelector('.sidebar').getBoundingClientRect(); return { sidebarLeft: s.left }; });
  await page.evaluate(() => auroraUi.set({ dir: 'rtl' })); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  const rtl = await page.evaluate(() => { const s = document.querySelector('.sidebar').getBoundingClientRect(); return { sidebarLeft: s.left, w: innerWidth, sw: s.width }; });
  assert.ok(ltr.sidebarLeft < 100 && rtl.sidebarLeft > rtl.w / 2, `sidebar moves to the right side (LTR ${ltr.sidebarLeft}, RTL ${rtl.sidebarLeft})`);
  const ids = await page.evaluate(() => window.PAGES.map((p) => p.id)); const bad = [];
  for (const id of ids) { await page.evaluate((i) => go(i), id); await page.waitForTimeout(120); const o = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, content: (() => { const c = document.querySelector('.content') || document.body; return c.scrollWidth - c.clientWidth; })() })); if (o.over > 1 || o.content > 1) bad.push(`${id}: page +${o.over}px, content +${o.content}px`); }
  await page.evaluate(() => go('store', 'appstore')); await page.waitForSelector('.sx-card'); await page.waitForTimeout(500); if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'store-rtl.png') });
  await browser.close(); console.log(`checked ${ids.length} pages in right-to-left mode`); bad.forEach((b) => console.log('  OVERFLOW', b)); errors.forEach((e) => console.log('  ERR', e));
  console.log('RTL test: ' + (bad.length || errors.length ? 'FAILED' : 'PASSED')); process.exit(bad.length || errors.length ? 1 : 0);
})().catch((e) => { console.error('RTL TEST FAILED:', e.message.split('\n').slice(0, 6).join('\n')); process.exit(2); });
