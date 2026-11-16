/* GPU monitor page: live tiles, history sparklines, VRAM-by-app table and local AI model memory. */
{
    const tone = (p) => (p >= 90 ? '#e5484d' : p >= 70 ? '#e8a317' : '#2fb344');
  CUSTOM.gpumon = (box) => {
    box.style.gap = '12px';
    const out = el('div'); out.style.cssText = 'display:grid;gap:12px'; out.id = 'gm-out';
    const bar = el('div', 'savebar'); const pause = el('button', 'btn', '⏸ Pause'); const note = el('span', 'sub', 'Updates every 2 seconds.'); bar.append(pause, note);
    box.append(bar, out);
    const hist = {}; let paused = false, timer = null;
    const push = (k, v) => { (hist[k] = hist[k] || []).push(v); hist[k] = hist[k].slice(-40); };
    const tile = (label, val, pct, key) => {
      const t = el('div', 'card'); t.style.cssText = 'padding:12px;display:grid;gap:4px'; t.dataset.k = key;
      const v = el('div', '', val); v.style.cssText = `font-size:20px;font-weight:700;color:${pct == null ? 'inherit' : tone(pct)}`;
      const s = el('div'); s.className = 'gm-spark'; s.style.cssText = 'display:flex;align-items:flex-end;gap:1px;height:22px;overflow:hidden';
      const h = (hist[key] || []).filter((x) => x != null), hi = Math.max(...h, 1);
      h.forEach((x) => { const b = document.createElement('i'); b.style.cssText = `flex:1;min-width:2px;max-width:6px;border-radius:1px;background:${tone(key.endsWith('v') || key.endsWith('u') ? x : 0)};opacity:.8;height:${Math.max(2, Math.round(x / hi * 22))}px`; s.append(b); });
      t.append(el('div', 'label', label), v, s); return t;
    };
    const draw = (d) => {
      out.replaceChildren();
      if (!d.gpus.length) { out.append(el('div', 'card', 'No NVIDIA GPU was found (nvidia-smi is missing or the driver is not loaded). AMD and Intel GPUs are shown by the Aurora OS "GPU Monitor" tool.')); }
      d.gpus.forEach((g, i) => {
        const vp = g.vramTotalMB ? 100 * g.vramUsedMB / g.vramTotalMB : null;
        push(i + 'u', g.util); push(i + 'v', vp); push(i + 't', g.tempC); push(i + 'p', g.powerW);
        out.append(el('div', 'label', `GPU ${i}: ${g.name}`));
        const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px';
        grid.append(tile('Busy', g.util == null ? 'n/a' : g.util + '%', g.util, i + 'u'),
          tile('VRAM', vp == null ? 'n/a' : `${Math.round(g.vramUsedMB)} / ${Math.round(g.vramTotalMB)} MB`, vp, i + 'v'),
          tile('Temperature', g.tempC == null ? 'n/a' : g.tempC + ' °C', g.tempC, i + 't'),
          tile('Power', g.powerW == null ? 'n/a' : Math.round(g.powerW) + ' W' + (g.powerLimitW ? ` of ${Math.round(g.powerLimitW)}` : ''), g.powerLimitW ? 100 * g.powerW / g.powerLimitW : null, i + 'p'));
        out.append(grid);
      });
      if (d.processes.length) {
        const c = el('div', 'card'); c.style.padding = '12px'; c.append(el('div', 'label', 'Apps using GPU memory'));
        d.processes.slice(0, 12).forEach((p) => { const r = el('div', 'sub', `${String(p.vramMB).padStart(6)} MB   ${p.name}  (PID ${p.pid})`); r.style.fontFamily = 'monospace'; r.dataset.pid = p.pid; c.append(r); });
        out.append(c);
      }
      if (d.llm.length) {
        const c = el('div', 'card'); c.style.padding = '12px'; c.append(el('div', 'label', 'Local AI models'));
        d.llm.forEach((m) => c.append(el('div', 'sub', `${m.server}: ${m.model}` + (m.sizeMB ? ` — ${m.vramMB} of ${m.sizeMB} MB on the GPU` + (m.context ? `, context ${m.context}` : '') : ''))));
        out.append(c);
      }
    };
    const tick = async () => { if (paused || !box.isConnected) return; try { draw(await call('gpuMon')); } catch (e) { out.replaceChildren(el('div', 'card', 'Could not read the GPU: ' + e.message)); } };
    pause.onclick = () => { paused = !paused; pause.textContent = paused ? '▶ Resume' : '⏸ Pause'; };
    tick(); timer = setInterval(() => { if (!box.isConnected) clearInterval(timer); else tick(); }, 2000);
  };
}
