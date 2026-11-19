// Runs EVERY add-on in the library in headless Chromium (with a stub of the Vorynth SDK) and fails on any script error,
// then checks the maths of the newest batch.
const assert = require('assert'); let pw; try { pw = require('playwright'); } catch (_) { pw = require('/opt/node-tools/node_modules/playwright'); }
const A = require('../lib/addons');
const STUB = `(function(){var S={};var ok=function(v){return Promise.resolve(v)};window.aurora={toast:function(){return ok(true)},theme:function(){return ok({accent:'#4cc2ff',dark:true})},notify:function(){return ok(true)},copy:function(){return ok(true)},
storage:{get:function(k){return ok(k in S?S[k]:null)},set:function(k,v){S[k]=v;return ok(true)},remove:function(k){delete S[k];return ok(true)},keys:function(){return ok(Object.keys(S))}},system:{stats:function(){return ok({cpu:12,ramUsed:4e9,ramTotal:16e9})}},
screen:{overlay:ok,clear:ok,getBrightness:function(){return ok(50)},setBrightness:ok,warmth:ok,reset:ok}}})();`;
(async () => {
  const browser = await pw.chromium.launch(); const keys = Object.keys(A.SAMPLES); const failures = []; let n = 0;
  for (const k of keys) {
    const files = A.SAMPLES[k](); const html = files.get('index.html').toString('utf8'); const page = await browser.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.route('https://addon.test/**', (route) => { const u = new URL(route.request().url()); if (u.pathname === '/__aurora.js') return route.fulfill({ contentType: 'text/javascript', body: STUB }); if (u.pathname === '/index.html') return route.fulfill({ contentType: 'text/html', body: html }); return route.fulfill({ contentType: 'text/css', body: '' }); });
    try { await page.goto('https://addon.test/index.html'); await page.waitForTimeout(40); } catch (e) { errs.push('load: ' + e.message); }
    if (errs.length) failures.push(k + ': ' + [...new Set(errs)].join(' | ').slice(0, 160)); n++; await page.close();
  }
  console.log(`ran ${n} add-ons in a browser: ${failures.length} with errors`); failures.forEach((f) => console.log('  FAIL', f));
  // maths of the new batch
  const run = async (key, fn) => { const files = A.SAMPLES[key](); const page = await browser.newPage(); await page.route('https://addon.test/**', (route) => { const u = new URL(route.request().url()); return route.fulfill(u.pathname === '/__aurora.js' ? { contentType: 'text/javascript', body: STUB } : u.pathname === '/index.html' ? { contentType: 'text/html', body: files.get('index.html').toString('utf8') } : { contentType: 'text/css', body: '' }); }); await page.goto('https://addon.test/index.html'); try { return await page.evaluate(fn); } finally { await page.close(); } };
  const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, a + ' vs ' + b);
  let r = await run('x7_loan' in A.SAMPLES ? 'x7_loan' : 'x7_percent', () => window.__pct); // placeholder for shape
  const pct = await run('x7_percent', () => ({ a: window.__pct.pctOf(15, 200), b: window.__pct.whatPct(30, 120), c: window.__pct.change(80, 100), d: window.__pct.change(0, 5), e: window.__pct.whatPct(1, 0), f: window.__pct.change(-50, -25) }));
  assert.deepStrictEqual(pct, { a: 30, b: 25, c: 25, d: null, e: null, f: 50 });
  const as = await run('x7_audiosize', () => ({ mb: window.__as.mb(320, 3600), h: window.__as.hours(320, 1), ldac: window.__as.mb(990, 3600) })); near(as.mb, 137.33, 0.05); near(as.h, 7.45, 0.01); near(as.ldac, 424.9, 0.5);
  const bt = await run('x7_btcodecs', () => ({ a: window.__bt.best(['ldac', 'aac', 'sbc'], ['aac', 'sbc']).id, b: window.__bt.best(['ldac', 'sbc'], ['ldac', 'aptx', 'sbc']).id, c: window.__bt.best([], []).id, d: window.__bt.codecs[0].id, txt: document.getElementById('res').textContent })); assert.deepStrictEqual([bt.a, bt.b, bt.c, bt.d], ['aac', 'ldac', 'sbc', 'ldac']); assert.match(bt.txt, /SBC/);
  const ts = await run('x7_timestamps', () => ({ s: window.__ts.fromUnix(1700000000).iso, m: window.__ts.fromUnix('1700000000000').iso, u: window.__ts.toUnix('2023-11-14T22:13:20Z'), d: window.__ts.daysBetween('2024-02-28', '2024-03-01'), e: (() => { try { window.__ts.fromUnix(''); } catch (e) { return e.message; } })() }));
  assert.deepStrictEqual(ts, { s: '2023-11-14T22:13:20.000Z', m: '2023-11-14T22:13:20.000Z', u: 1700000000, d: 2, e: 'Type a number' });
  const pw_ = await run('x7_pwmeter', () => { const E = window.__pw.entropy; return { empty: E(''), weak: E('password'), common: E('Password123'), strong: E('k3#Vq9!zLw2$Rt8&Xm5'), long: E('correct horse battery staple'), rep: E('aaaaaaaaaaaa'), label: window.__pw.rate(E('k3#Vq9!zLw2$Rt8&Xm5'))[0], lw: window.__pw.rate(E('password'))[0] }; });
  assert.equal(pw_.empty, 0); assert.ok(pw_.weak < 28 && pw_.common < 40 && pw_.strong > 80 && pw_.long > 60 && pw_.rep < 28, JSON.stringify(pw_)); assert.equal(pw_.label, 'Very strong'); assert.equal(pw_.lw, 'Very weak');
  const tx = await run('x7_textstats', () => ({ en: window.__ts2.stats('Hello world. This is a test! Is it? Yes yes yes.'), ar: window.__ts2.stats('مرحبا بالعالم. هذا اختبار؟ نعم!'), empty: window.__ts2.stats('') }));
  assert.equal(tx.en.words, 11); assert.equal(tx.en.sentences, 4); assert.equal(tx.en.top[0], 'yes (3)'); assert.equal(tx.ar.words, 5); assert.equal(tx.ar.sentences, 3); assert.deepStrictEqual([tx.empty.words, tx.empty.sentences, tx.empty.lines], [0, 0, 0]);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); const tok = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: 'مرحبا', exp: 1700000000 }) + '.sig';
  const jw = await run('x7_jwt', (t) => ({ ok: (() => { const r = window.__jwt.decode(t); return [r.alg, r.payload.sub, r.info[0]]; })(), bad: (() => { try { window.__jwt.decode('a.b'); } catch (e) { return e.message; } })(), junk: (() => { try { window.__jwt.decode('x.y.z'); } catch (e) { return e.message; } })() }), tok).catch(async () => null);
  const jw2 = await (async () => { const files = A.SAMPLES.x7_jwt(); const page = await browser.newPage(); await page.route('https://addon.test/**', (route) => { const u = new URL(route.request().url()); return route.fulfill(u.pathname === '/__aurora.js' ? { contentType: 'text/javascript', body: STUB } : u.pathname === '/index.html' ? { contentType: 'text/html', body: files.get('index.html').toString('utf8') } : { contentType: 'text/css', body: '' }); }); await page.goto('https://addon.test/index.html'); const out = await page.evaluate((t) => ({ ok: (() => { const r = window.__jwt.decode(t); return [r.alg, r.payload.sub, r.info[0]]; })(), bad: (() => { try { window.__jwt.decode('a.b'); } catch (e) { return e.message; } })(), junk: (() => { try { window.__jwt.decode('x.y.z'); } catch (e) { return e.message; } })() }), tok); await page.close(); return out; })();
  assert.deepStrictEqual(jw2.ok, ['HS256', 'مرحبا', 'exp = 2023-11-14T22:13:20.000Z (EXPIRED)']); assert.match(jw2.bad, /three parts/); assert.match(jw2.junk, /valid token/); void jw; void r;
  await browser.close(); console.log('add-on maths: PASSED'); process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ADDON UI TEST FAILED:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
