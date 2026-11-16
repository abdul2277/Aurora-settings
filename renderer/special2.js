/* Amazing extras: amount in words (Arabic/English), password generator, what's-new spotlight, confetti, page transitions. */
{
  // ---------- pure: amount in words ----------
  const UM = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const UF = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثماني', 'تسع', 'عشر', 'إحدى عشرة', 'اثنتا عشرة', 'ثلاث عشرة', 'أربع عشرة', 'خمس عشرة', 'ست عشرة', 'سبع عشرة', 'ثماني عشرة', 'تسع عشرة'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUND = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  function under1000(n, fem) { // 1..999 as Arabic words
    const parts = []; const h = Math.floor(n / 100), r = n % 100; if (h) parts.push(HUND[h]);
    if (r) { const U = fem ? UF : UM; if (r < 20) parts.push(U[r]); else { const o = r % 10, t = Math.floor(r / 10); if (o) parts.push(U[o] + ' و' + TENS[t].replace(/^/, '')); else parts.push(TENS[t]); } }
    return parts.join(' و');
  }
  const scale = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? few : many);
  function arWords(n, fem) { // integer 0..999,999,999,999
    n = Math.floor(+n || 0); if (n === 0) return 'صفر'; const out = [];
    const b = Math.floor(n / 1e9), m = Math.floor(n / 1e6) % 1000, t = Math.floor(n / 1e3) % 1000, r = n % 1000;
    if (b) out.push(b === 1 ? 'مليار' : b === 2 ? 'ملياران' : under1000(b) + ' ' + (b <= 10 ? 'مليارات' : 'ملياراً'));
    if (m) out.push(m === 1 ? 'مليون' : m === 2 ? 'مليونان' : under1000(m) + ' ' + (m <= 10 ? 'ملايين' : 'مليوناً'));
    if (t) out.push(t === 1 ? 'ألف' : t === 2 ? 'ألفان' : under1000(t) + ' ' + (t <= 10 ? 'آلاف' : 'ألفاً'));
    if (r) out.push(under1000(r, fem)); return out.join(' و');
  }
  const noun = (n, one, two, few, many, hundred) => (n % 100 === 0 && n >= 100 ? hundred : n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? few : n % 100 === 1 || n % 100 === 2 ? hundred : n % 100 >= 11 ? many : hundred);
  function tafqeet(amount) { // Saudi riyals + halalas
    const v = Math.round((+amount || 0) * 100) / 100; if (v < 0 || v >= 1e12) return ''; const ri = Math.floor(v), ha = Math.round((v - ri) * 100); const parts = [];
    if (ri || !ha) parts.push((ri === 1 ? 'ريال سعودي واحد' : ri === 2 ? 'ريالان سعوديان' : arWords(ri) + ' ' + noun(ri, '', '', 'ريالات سعودية', 'ريالاً سعودياً', 'ريال سعودي')));
    if (ha) parts.push(ha === 1 ? 'هللة واحدة' : ha === 2 ? 'هللتان' : arWords(ha, true) + ' ' + (ha <= 10 ? 'هللات' : 'هللة')); return 'فقط ' + parts.join(' و') + ' لا غير';
  }
  const E1 = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], ET = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const e3 = (n) => { const p = []; if (n >= 100) { p.push(E1[Math.floor(n / 100)] + ' hundred'); n %= 100; } if (n) { p.push(n < 20 ? E1[n] : ET[Math.floor(n / 10)] + (n % 10 ? '-' + E1[n % 10] : '')); } return p.join(' and '); };
  function enWords(n) { n = Math.floor(+n || 0); if (n === 0) return 'zero'; const p = []; [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']].forEach(([s, w]) => { const k = Math.floor(n / s) % 1000; if (k) p.push(e3(k) + ' ' + w); }); const r = n % 1000; if (r) p.push(e3(r)); return p.join(' '); }
  const enAmount = (a) => { const v = Math.round((+a || 0) * 100) / 100; const ri = Math.floor(v), ha = Math.round((v - ri) * 100); return 'Only ' + enWords(ri) + ' Saudi riyal' + (ri === 1 ? '' : 's') + (ha ? ' and ' + enWords(ha) + ' halala' + (ha === 1 ? '' : 's') : '') + ' only'; };
  // ---------- pure: passwords ----------
  const SETS = { lower: 'abcdefghijkmnopqrstuvwxyz', upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ', digits: '23456789', symbols: '!@#$%^&*-_=+?' };
  const poolOf = (o) => Object.keys(SETS).filter((k) => o[k]).map((k) => SETS[k]).join('');
  const entropy = (len, pool) => Math.round(len * Math.log2(Math.max(2, pool)) * 10) / 10;
  const rating = (bits) => (bits < 40 ? 'Weak' : bits < 60 ? 'OK' : bits < 80 ? 'Strong' : 'Excellent');
  function genPass(len, o, rnd) { const pool = poolOf(o); if (!pool) return ''; const r = rnd || ((n) => { const a = new Uint32Array(1); const lim = Math.floor(4294967296 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim); return x % n; }); const need = Object.keys(SETS).filter((k) => o[k]); const out = need.map((k) => SETS[k][r(SETS[k].length)]); while (out.length < len) out.push(pool[r(pool.length)]); for (let i = out.length - 1; i > 0; i--) { const j = r(i + 1); [out[i], out[j]] = [out[j], out[i]]; } return out.slice(0, Math.max(len, need.length)).join(''); }
  // ---------- UI ----------
  const mkb = (t, f) => { const b = el('button', 'btn', t); b.onclick = f; return b; };
  const inp = (id, ph, type) => { const i = document.createElement('input'); i.id = id; i.placeholder = ph || ''; i.type = type || 'text'; i.style.cssText = 'padding:8px;border-radius:8px;border:1px solid var(--border);background:transparent;color:inherit'; return i; };
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (_) { toast('Clipboard blocked', true); } };
  CUSTOM.tafqeet = (box) => { box.style.gap = '14px'; const c = el('div', 'card'); c.style.cssText = 'padding:14px;display:grid;gap:10px'; const a = inp('w-amt', 'Amount in SAR, e.g. 1250.50', 'number'); const ar = el('div'); ar.id = 'w-ar'; ar.dir = 'rtl'; ar.style.cssText = 'font-size:17px;line-height:1.7'; const en = el('div', 'sub'); en.id = 'w-en'; const row = el('div'); row.style.cssText = 'display:flex;gap:8px'; row.append(mkb('Copy Arabic', () => copy(ar.textContent)), mkb('Copy English', () => copy(en.textContent)));
    a.oninput = () => { ar.textContent = a.value ? tafqeet(a.value) : ''; en.textContent = a.value ? enAmount(a.value) : ''; }; c.append(el('div', 'label', 'Amount in words (for invoices and receipts)'), a, ar, en, row); box.append(c); };
  // ---------- confetti ----------
  window.__confetti = () => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; const cv = document.createElement('canvas'); cv.id = 'aur-confetti'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9998'; cv.width = innerWidth; cv.height = innerHeight; document.body.append(cv); const x = cv.getContext('2d'); const cols = ['#4cc2ff', '#9be7a3', '#b79cff', '#fbbf24', '#f472b6']; const ps = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 3, s: 4 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)], r: Math.random() * 6 })); const t0 = Date.now(); const tick = () => { x.clearRect(0, 0, cv.width, cv.height); ps.forEach((p) => { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += 0.2; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); x.restore(); }); if (Date.now() - t0 < 2000) requestAnimationFrame(tick); else cv.remove(); }; tick(); };
  // ---------- what's new ----------
  const NEWS = ['🌌 Living aurora background and six themes', '🏆 Milestones with confetti when you unlock one', '✍️ Amount in words (Arabic and English) for invoices', '💽 Disk space map, 🗂️ duplicate finder, 🧮 shop calculators', '⌨️ Your own commands and add-ons from the command bar'];
  window.__showWhatsNew = (ver) => { if (document.getElementById('aur-news')) return; const b = el('div'); b.id = 'aur-news'; b.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)'; const c = el('div', 'sheet'); c.style.cssText = 'max-width:440px;padding:22px;border-radius:16px;display:grid;gap:10px;background:var(--bg);border:1px solid var(--border);backdrop-filter:blur(24px)'; const h = el('h2', '', "What's new in Aurora " + ver); h.style.margin = '0'; c.append(h); NEWS.forEach((n) => c.append(el('div', '', n))); const ok = mkb('Let’s go', () => b.remove()); ok.id = 'news-ok'; ok.className = 'btn primary'; c.append(ok); b.append(c); document.body.append(b); };
  setTimeout(async () => { try { const v = await window.api.call('appVersion'); const seen = localStorage.getItem('aurora.seenver'); if (v && seen !== String(v)) { localStorage.setItem('aurora.seenver', String(v)); if (seen) window.__showWhatsNew(v); } } catch (_) {} }, 2200);
  // ---------- page transition ----------
  { const st = document.createElement('style'); st.textContent = '@keyframes aurIn{from{opacity:.0;transform:translateY(8px)}to{opacity:1;transform:none}}#page.pg-in>*{animation:aurIn .24s ease both}@media (prefers-reduced-motion:reduce){#page.pg-in>*{animation:none}}'; document.head.append(st); const pg = document.getElementById('page'); const prev = window.auroraAfterGo; window.auroraAfterGo = (id) => { if (prev) prev(id); if (pg) { pg.classList.remove('pg-in'); void pg.offsetWidth; pg.classList.add('pg-in'); } }; }
  window.__special2 = { tafqeet, arWords, enWords, enAmount, genPass, entropy, rating, poolOf };
}
