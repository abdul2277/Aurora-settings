/* PC rating page: timed tests of processor, memory, disk and graphics, scored 1.0-9.9; base score = the weakest part (like the old Windows Experience Index). */
{
  const KEY = 'pcrating.history';
  const load = () => { try { return JSON.parse(localStorage.getItem('aurora.' + KEY) || '[]'); } catch (_) { return []; } };
  const save = (h) => { try { localStorage.setItem('aurora.' + KEY, JSON.stringify(h.slice(-20))); } catch (_) {} };
  const tone = (s) => (s == null ? 'var(--muted, #888)' : s >= 7.5 ? '#2fb344' : s >= 5 ? '#e8a317' : s >= 3 ? '#f08a24' : '#e5484d');
  const word = (s) => (s >= 8.5 ? 'Excellent' : s >= 7 ? 'Great' : s >= 5.5 ? 'Good' : s >= 4 ? 'Fine for everyday use' : s >= 2.5 ? 'Slow' : 'Very slow');

  CUSTOM.pcrating = (box) => {
    box.style.gap = '12px';
    const out = el('div'); out.style.display = 'grid'; out.style.gap = '12px';
    const go = el('button', 'btn primary', '🏆 Rate this PC'); const quick = el('label', 'sub'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'pcr-quick'; quick.append(cb, ' Quick test (about 5 seconds, less exact)');
    const bar = el('div', 'savebar'); bar.append(go, quick);

    const tile = (name, icon, s, lines) => {
      const t = el('div', 'card'); t.style.cssText = 'display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;align-items:center;padding:14px';
      const ic = el('div', '', icon); ic.style.fontSize = '26px';
      const mid = el('div'); mid.append(el('div', 'label', name)); lines.forEach((l) => { const d = el('div', 'sub', l); mid.append(d); });
      const num = el('div', '', s == null ? 'n/a' : s.toFixed(1)); num.style.cssText = `font-size:30px;font-weight:700;color:${tone(s)};min-width:64px;text-align:right`;
      const meter = el('div', 'bar'); meter.style.gridColumn = '1 / -1'; const i = document.createElement('i'); i.style.width = (s == null ? 0 : s / 9.9 * 100) + '%'; i.style.background = tone(s); meter.append(i);
      t.append(ic, mid, num, meter); t.dataset.part = name; return t;
    };

    const show = (r, prev) => {
      out.replaceChildren();
      const hero = el('div', 'card'); hero.style.cssText = 'padding:20px;display:flex;align-items:center;gap:22px;flex-wrap:wrap';
      const big = el('div', '', r.base.toFixed(1)); big.id = 'pcr-base'; big.style.cssText = `font-size:64px;font-weight:800;line-height:1;color:${tone(r.base)}`;
      const txt = el('div'); txt.append(el('div', 'label', 'Base score (out of 9.9)'), el('div', 'sub', `${word(r.base)}. Your weakest part is the ${r.weakest}: ${r.tip}`));
      if (prev) { const d = +(r.base - prev.base).toFixed(1); txt.append(el('div', 'sub', d === 0 ? `Same as the last test (${prev.base.toFixed(1)}).` : `${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} since the last test (${prev.base.toFixed(1)}).`)); }
      hero.append(big, txt); out.append(hero);
      out.append(
        tile('Processor', '🧠', r.cpu.score, [`${r.cpu.model || 'Unknown CPU'} (${r.cpu.threads} threads)`, `One core ${r.cpu.singleMBs} MB/s, all cores ${r.cpu.multiMBs} MB/s`]),
        tile('Memory', '🧮', r.memory.score, [`${r.memory.totalGB} GB, ${r.memory.bandwidthGBs} GB/s`, r.memory.cappedBySize ? 'The score is held down by the small amount of RAM.' : 'Speed and size both fine for this score.']),
        tile('Disk', '💾', r.disk.score, [r.disk.score == null ? r.disk.note : `${r.disk.writeMBs} MB/s write`, r.disk.score == null ? '' : 'Timed by writing a temporary file (deleted afterwards).'].filter(Boolean)),
        tile('Graphics', '🎮', r.graphics.score, [r.graphics.renderer || 'No graphics device reported', r.graphics.note || '']));
      const hist = load(); if (hist.length > 1) { const h = el('div', 'sub', 'Earlier ratings on this PC: ' + hist.slice(-6, -1).map((e) => `${e.base.toFixed(1)} (${new Date(e.when).toLocaleDateString()})`).join(', ')); out.append(h); }
      out.append(el('div', 'sub', 'These scores compare with other Vorynth ratings only, not with Microsoft\'s. The graphics number is estimated from the model name; the other three are timed tests. Close other apps for the fairest result.'));
    };

    go.onclick = async () => {
      go.disabled = true; out.replaceChildren(el('div', 'sub', 'Testing your PC… processor, then memory, then disk. Please do not use the PC for a few seconds.'));
      try {
        const r = await call('pcRate', { quick: cb.checked }); const h = load(); const prev = h.length ? h[h.length - 1] : null;
        h.push({ base: r.base, when: r.when, parts: r.parts }); save(h); show(r, prev);
      } catch (e) { out.replaceChildren(el('div', 'sub', 'The test could not finish: ' + String(e.message || e).slice(0, 140))); }
      go.disabled = false;
    };
    const h = load(); const first = el('div', 'sub', h.length ? `Last rating on this PC: ${h[h.length - 1].base.toFixed(1)} (${new Date(h[h.length - 1].when).toLocaleDateString()}). Press the button to test again.` : 'Press the button to rate this PC. It takes about 10 seconds and changes nothing on your system.');
    out.append(first); box.append(bar, out);
  };
}
