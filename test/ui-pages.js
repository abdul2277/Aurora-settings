// UI tests for the Bluetooth/LDAC page, the file lock and the Drop encryption panel (renderer + mock API, headless Chromium).
const path = require('path'); const assert = require('assert');
let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
const URL_ = (q) => 'file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?' + q;
const prompt = async (page, text, answer) => { await page.waitForSelector('.ask-back'); assert.ok((await page.textContent('.ask-back .label')).includes(text), 'prompt: ' + text); await page.fill('.ask-back input', answer); await page.click('.ask-back button.primary'); };
(async () => {
  const browser = await pw.chromium.launch(); const errors = [];
  const open = async (q, pageId, focus) => { const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); await page.addInitScript(() => { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); }); await page.goto(URL_(q)); await page.waitForFunction(() => typeof go === 'function' && window.PAGES); await page.waitForTimeout(2300); await page.evaluate(([p, f]) => go(p, f), [pageId, focus]); return page; };

  // Windows: honest about LDAC
  let p = await open('platform=win32', 'btaudio'); await p.waitForSelector('text=Windows does not support LDAC'); assert.ok(await p.isVisible('text=WH-1000XM5 Stereo')); assert.ok(await p.isVisible('text=Windows will use SBC or AAC')); assert.equal(await p.locator('#page button:has-text("LDAC")').count(), 0, 'no fake LDAC switch on Windows');
  assert.ok(await p.isVisible('button:has-text("Bluetooth settings")')); if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'bt-win.png') }); await p.close();

  // Linux: real codec switching
  p = await open('platform=linux&bt=linux', 'btaudio'); await p.waitForSelector('text=WH-1000XM5'); assert.ok(await p.isVisible('button:has-text("SBC ✓")') || (await p.textContent('#page')).includes('SBC'));
  assert.ok(await p.locator('button:has-text("APTX")').isDisabled(), 'unavailable codec is disabled'); await p.click('#page button:has-text("LDAC")'); await p.waitForSelector('#page button:has-text("LDAC ✓")'); assert.ok(await p.isVisible('text=now using: LDAC'));
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'bt-linux.png') }); await p.close();

  // File lock
  p = await open('platform=win32', 'aurora-pro');
  const hasLock = await p.locator('button:has-text("Lock a file")').count(); assert.ok(hasLock, 'file lock button found on some page');
  await p.click('button:has-text("Lock a file")'); await prompt(p, 'Choose a password', 'short'); await p.waitForSelector('.store-err:has-text("at least 8")');
  await p.click('button:has-text("Lock a file")'); await prompt(p, 'Choose a password', 'long enough password'); await prompt(p, 'again', 'different password'); await p.waitForSelector('.store-err:has-text("did not match")');
  await p.click('button:has-text("Lock a file")'); await prompt(p, 'Choose a password', 'long enough password'); await prompt(p, 'again', 'long enough password'); await p.waitForSelector('.store-ok:has-text("report.pdf.aur")');
  await p.click('button:has-text("Unlock a file")'); await prompt(p, 'Enter the password', 'wrong-pass-1'); await p.waitForSelector('.store-err:has-text("Wrong password")');
  await p.click('button:has-text("Unlock a file")'); await prompt(p, 'Enter the password', 'long enough password'); await p.waitForSelector('.store-ok:has-text("Unlocked copy saved")');
  // Drop shows encryption status
  assert.ok(await p.locator('text=End-to-end encrypt the file').count(), 'drop encryption toggle'); await p.click('button:has-text("Choose a file and share")'); await p.waitForSelector('text=End-to-end encrypted'); assert.ok(await p.isVisible('text=4821-0937-5512'));
  if (process.env.SHOTS) await p.screenshot({ path: path.join(process.env.SHOTS, 'drop-e2ee.png') }); await p.close();
  await browser.close(); const all = [...new Set(errors)]; all.forEach((e) => console.log('ERR', e.slice(0, 200))); console.log('page UI tests: ' + (all.length ? 'FAILED' : 'PASSED')); process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('UI TEST FAILED:', e.message.split('\n').slice(0, 12).join('\n')); process.exit(2); });
