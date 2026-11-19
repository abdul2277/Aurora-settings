// Time-of-day features: the day-part table, the live greeting + "Right now" card, and the optional auto theme (clock is faked).
const path = require('path'); const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
(async () => {
  const browser = await pw.chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }); const errors = [];
  await page.addInitScript(() => { try { localStorage.setItem('aiFirstRun', '1'); localStorage.setItem('aurora.tour', '1'); } catch (_) {} }); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html') + '?platform=win32'); await page.waitForFunction(() => window.auroraDaypart && typeof go === 'function' && window.__special); await page.waitForTimeout(1800);
  // 1. the table, for every hour
  const t = await page.evaluate(() => { const D = window.auroraDaypart; const exp = (h) => (h >= 22 || h < 5 ? 'night' : h < 8 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'); const bad = []; for (let h = 0; h < 24; h++) if (D.part(h) !== exp(h)) bad.push(h);
    return { bad, wrap: [D.part(24), D.part(-1), D.part(31)], greet: [7, 9, 15, 19, 23, 2].map(D.greeting), emoji: [3, 9].map(D.emoji), themes: [6, 9, 14, 20, 23].map(D.themeFor) }; });
  assert.deepStrictEqual(t.bad, []); assert.deepStrictEqual(t.wrap, ['night', 'night', 'dawn']); assert.deepStrictEqual(t.greet, ['Early start', 'Good morning', 'Good afternoon', 'Good evening', 'Good night', 'Working late']); assert.deepStrictEqual(t.emoji, ['🌙', '☀️']); assert.deepStrictEqual(t.themes, ['sunset', 'gold', 'ocean', 'violet', 'midnight']);
  // 2. every idea points at a page that exists on the Windows page list, rotation works, missing pages are skipped
  const ideas = await page.evaluate(() => { const D = window.auroraDaypart; const bad = []; for (const [p, list] of Object.entries(D.IDEAS)) for (const i of list) if (!window.auroraPageKnown(i[1][0])) bad.push(p + ':' + i[1][0]); const a = D.suggestion(9, 0), b = D.suggestion(9, 1), c = D.suggestion(9, 2);
    const saved = window.auroraPageKnown; window.auroraPageKnown = () => false; const none = D.suggestion(9, 0); window.auroraPageKnown = saved; return { bad, rot: [a.text !== b.text, a.text === c.text], none }; });
  assert.deepStrictEqual(ideas.bad, [], 'every idea points to a real page'); assert.deepStrictEqual(ideas.rot, [true, true]); assert.equal(ideas.none, null);
  // 3. Home shows the morning greeting and idea, then updates live to the evening
  const setTime = (h) => page.evaluate((hh) => { window.auroraDaypart.clock = () => new Date(2026, 2, 10, hh, 5, 0); window.auroraDaypart.refresh(); }, h);
  await page.evaluate(() => go('home')); await page.waitForSelector('#aur-hero'); await setTime(9); await page.waitForSelector('#aur-now');
  assert.match(await page.textContent('#aur-hero h2'), /☀️ Good morning, /); assert.equal(await page.getAttribute('#aur-now', 'data-part'), 'morning'); const morning = await page.textContent('#aur-now .now-t');
  await setTime(20); assert.match(await page.textContent('#aur-hero h2'), /🌆 Good evening, /); assert.equal(await page.getAttribute('#aur-now', 'data-part'), 'evening'); assert.notEqual(await page.textContent('#aur-now .now-t'), morning);
  if (process.env.SHOTS) { await page.waitForTimeout(500); await page.screenshot({ path: path.join(process.env.SHOTS, 'aurora-evening.png') }); }
  await page.click('#aur-now button'); await page.waitForTimeout(300); assert.ok(await page.evaluate(() => typeof currentPage === 'string' && currentPage !== 'home'), 'the button navigates');
  // 4. auto theme: off by default; on follows the clock and changes when the part changes
  await page.evaluate(() => go('looks')); await page.waitForSelector('#autotime'); assert.equal(await page.isChecked('#autotime'), false);
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());
  await setTime(9); await page.waitForTimeout(100); const before = await accent(); await page.check('#autotime'); await page.waitForTimeout(150); assert.equal(await accent(), '#fbbf24', 'morning = Gold'); assert.notEqual(before, '#fbbf24');
  await setTime(14); assert.equal(await accent(), '#2dd4bf', 'afternoon = Ocean'); await setTime(23); assert.equal(await accent(), '#7c8cff', 'night = Midnight'); assert.equal(await page.evaluate(() => localStorage.getItem('aurora.autotime')), '1');
  await page.uncheck('#autotime'); await setTime(9); const kept = await accent(); await setTime(20); assert.equal(await accent(), kept, 'off means the theme no longer follows the clock');
  await browser.close(); errors.forEach((e) => console.log('ERR', e)); console.log('daypart test: ' + (errors.length ? 'FAILED' : 'PASSED')); process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('DAYPART TEST FAILED:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
