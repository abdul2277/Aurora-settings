const path = require('path'); const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const browser = await pw.chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const errors = [];
  const url = 'file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?platform=win32';
  const open = async (pre) => { const p = await ctx.newPage(); if (pre) await p.addInitScript(pre); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); await p.waitForFunction(() => typeof go === 'function' && window.auroraTour); return p; };
  // 1. a brand-new user first answers the AI question; the tour waits for it and never stacks on top
  const first = await browser.newContext({ viewport: { width: 1280, height: 860 } }); // separate storage, so closing this page cannot touch the next one's
  let p = await first.newPage(); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); await p.waitForFunction(() => typeof go === 'function' && window.auroraTour); await p.waitForSelector('.tour-card, [style*="9999"]', { timeout: 15000 });
  assert.equal(await p.locator('.tour-card').count(), 0, 'tour does not appear on top of the first-run AI question'); await p.close(); await first.close();
  // 2. after that, the tour appears once, with the picture
  p = await open(() => { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} }); await p.waitForSelector('.tour-card', { timeout: 15000 });
  assert.ok(await p.evaluate(() => { const i = document.querySelector('.tour-art img'); return i && i.complete && i.naturalWidth > 0; }), 'the picture loads'); assert.equal(await p.locator('.tour-dots i').count(), 5);
  if (process.env.SHOTS) { await p.waitForTimeout(400); await p.screenshot({ path: path.join(process.env.SHOTS, 'aurora-tour.png') }); }
  await p.keyboard.press('ArrowRight'); assert.match(await p.textContent('.tour-title'), /Store/); await p.click('button:has-text("Back")'); assert.match(await p.textContent('.tour-title'), /Welcome/);
  await p.click('button:has-text("Next")'); await p.click('button:has-text("Next")'); await p.click('button:has-text("Next")'); await p.click('button:has-text("Next")'); assert.match(await p.textContent('.tour-title'), /Ctrl\+K/); assert.equal(await p.locator('button:has-text("Skip")').isHidden(), true, 'no Skip on the last step');
  await p.click('button:has-text("Get started")'); assert.equal(await p.locator('.tour-card').count(), 0); assert.equal(await p.evaluate(() => localStorage.getItem('aurora.tour')), '1');
  // 3. (persistence across launches is verified in the real app by test/e2e-tour.js)
  assert.ok(await p.evaluate(() => window.auroraCommands('tour').some((c) => /welcome tour/i.test(c.label))), 'Ctrl+K command'); await p.evaluate(() => window.auroraTour.start()); await p.waitForSelector('.tour-card');
  // 4. skip with Escape, and the go-to buttons really navigate
  await p.keyboard.press('Escape'); assert.equal(await p.locator('.tour-card').count(), 0); await p.evaluate(() => window.auroraTour.start()); await p.click('button:has-text("Next")'); await p.click('button:has-text("Open the Store")');
  await p.waitForSelector('.sx-card'); assert.equal(await p.locator('.tour-card').count(), 0); await p.close();
  await browser.close(); errors.forEach((e) => console.log('ERR', e)); console.log('tour test: ' + (errors.length ? 'FAILED' : 'PASSED')); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('TOUR TEST FAILED:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
