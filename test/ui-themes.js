// Every theme must be unique, well-formed, readable (WCAG contrast of the auto-chosen ink on the accent) and actually apply.
const path = require('path'); const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); const errors = [];
  await page.addInitScript(() => { try { localStorage.setItem('aiFirstRun', '1'); } catch (_) {} }); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?platform=win32'); await page.waitForFunction(() => window.__special && typeof go === 'function'); await page.waitForTimeout(2300);
  const r = await page.evaluate(() => {
    const lumOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); };
    const T = window.__special.THEMES; const ids = new Set(), accents = new Set(), problems = [], ratios = {};
    for (const t of T) {
      if (ids.has(t.id)) problems.push('duplicate id ' + t.id); ids.add(t.id); if (accents.has(t.accent)) problems.push('duplicate accent ' + t.id); accents.add(t.accent);
      if (!/^#[0-9a-f]{6}$/i.test(t.accent)) problems.push('bad accent ' + t.id); if (!Array.isArray(t.hues) || t.hues.length !== 3 || t.hues.some((h) => !(h >= 0 && h <= 360))) problems.push('bad hues ' + t.id);
      window.__special.applyTheme(t.id, false); const cs = getComputedStyle(document.documentElement); const acc = cs.getPropertyValue('--accent').trim(), ink = cs.getPropertyValue('--accent-ink').trim();
      if (acc.toLowerCase() !== t.accent.toLowerCase()) problems.push('did not apply ' + t.id); const a = lumOf(t.accent), b = lumOf(ink), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); ratios[t.id] = Math.round(ratio * 10) / 10; if (ratio < 3) problems.push(`low contrast ${t.id} ${ratio.toFixed(2)}`);
      if (localStorage.getItem('aurora.themeid') !== t.id) problems.push('not remembered ' + t.id);
    }
    return { n: T.length, problems, ratios };
  });
  await page.evaluate(() => go('looks')); await page.waitForSelector('.tcard'); const cards = await page.locator('.tcard').count(); assert.equal(cards, r.n, 'gallery shows every theme');
  await page.click('.tcard[data-theme="neon"]'); assert.equal((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent'))).trim(), '#22d3ee');
  await page.fill('#cmdInput, input[type="search"]', '').catch(() => {}); if (process.env.SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOTS, 'themes.png') }); }
  await browser.close(); console.log(`${r.n} themes; lowest contrast ${Math.min(...Object.values(r.ratios))}:1`); r.problems.forEach((p) => console.log('  PROBLEM', p)); errors.forEach((e) => console.log('  ERR', e));
  console.log('themes test: ' + (r.problems.length || errors.length || r.n < 16 ? 'FAILED' : 'PASSED')); process.exit(r.problems.length || errors.length || r.n < 16 ? 1 : 0);
})().catch((e) => { console.error('THEMES TEST FAILED:', e.message.split('\n').slice(0, 6).join('\n')); process.exit(2); });
