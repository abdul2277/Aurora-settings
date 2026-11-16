/* Space Finder: shows what takes up room in a folder you choose. Read-only: it can only show items in Explorer, never change or delete them. */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const fmt = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  window.auroraFmtSize = fmt;
  /* slice-and-dice treemap: sizes (largest first) become boxes that fill w x h; area is proportional to size */
  window.auroraTreemap = (sizes, W, H) => {
    const total = sizes.reduce((a, b) => a + b, 0); const out = []; if (!total) return out; const idx = sizes.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const res = new Array(sizes.length);
    const lay = (list, x, y, w, h) => { if (!list.length) return; if (list.length === 1) { res[list[0][1]] = { x, y, w, h }; return; } const sum = list.reduce((a, b) => a + b[0], 0); let acc = 0, k = 0; while (k < list.length - 1 && acc + list[k][0] <= sum / 2) { acc += list[k][0]; k++; } if (k === 0) { acc = list[0][0]; k = 1; } const a = list.slice(0, k), b = list.slice(k); if (w >= h) { const wa = (w * acc) / sum; lay(a, x, y, wa, h); lay(b, x + wa, y, w - wa, h); } else { const ha = (h * acc) / sum; lay(a, x, y, w, ha); lay(b, x, y + ha, w, h - ha); } };
    lay(idx, 0, 0, W, H); return res;
  };
  CUSTOM.space = (box) => {
    box.style.gap = '10px'; let root = '', res = null, busy = false;
    const row = (p, size, extra) => { const r = el('div', 'space-row'); r.dataset.path = p; r.append(el('span', 'space-size', fmt(size)), el('span', 'space-path', p), ...(extra || []), B('Show in folder', '', async () => { try { await call('spaceReveal', { path: p }); } catch (e) { toast(errText(e), true); } })); return r; };
    const draw = () => {
      box.replaceChildren(); box.append(el('div', 'muted', 'Pick a folder and Space Finder shows its biggest files, biggest folders and duplicate files. It only reads: it never deletes, moves or changes anything. You decide what to do in File Explorer.'));
      const bar = el('div', 'savebar'); bar.append(B(busy ? 'Scanning…' : 'Choose folder and scan', 'primary', async () => {
        if (busy) return; try { const p = await call('spacePick'); if (!p) return; root = p; busy = true; draw(); res = await call('spaceScan', { root }); } catch (e) { toast(errText(e), true); } busy = false; draw(); }), el('span', 'muted', root ? '📁 ' + root : '')); box.append(bar);
      if (!res) return;
      box.append(el('div', 'card space-sum', `${res.fileCount.toLocaleString()} files, ${fmt(res.total)} in total` + (res.denied ? `. ${res.denied} items could not be read.` : '') + (res.truncated ? ' Stopped early because the folder is very large.' : '')));
      const sec = (title, kids) => { const c = el('div', 'card space-sec'); c.append(el('b', '', title)); if (!kids.length) c.append(el('div', 'muted', 'Nothing found.')); else c.append(...kids); box.append(c); };
      const tm = el('div', 'card'); tm.append(el('b', '', 'Map of the biggest folders (bigger box = more space)')); const map = el('div', 'tm'); map.dataset.treemap = '1';
      const items = res.folders.slice(0, 16).filter((f) => f.size > 0); const cells = window.auroraTreemap(items.map((f) => f.size), 100, 100);
      cells.forEach((c, i) => { const d = el('div', 'tm-cell'); d.style.cssText = `left:${c.x}%;top:${c.y}%;width:${c.w}%;height:${c.h}%;background:hsl(${(i * 47) % 360} 55% 38%)`; d.title = `${items[i].path} (${fmt(items[i].size)})`; d.textContent = items[i].path.split(/[\\/]/).pop() + ' ' + fmt(items[i].size); map.append(d); }); tm.append(map); if (items.length) box.append(tm);
      sec('Biggest files', res.biggest.slice(0, 25).map((f) => row(f.path, f.size)));
      sec('Biggest folders', res.folders.slice(0, 15).map((f) => row(f.path, f.size)));
      const dups = res.duplicates.map((g) => { const c = el('div', 'space-dup'); c.append(el('div', 'muted', `${g.paths.length} identical copies, ${fmt(g.size)} each. Keeping one would free ${fmt(g.wasted)}.`), ...g.paths.map((p) => row(p, g.size))); return c; });
      sec(`Duplicate files (over 1 MB)${res.wasted ? ' — ' + fmt(res.wasted) + ' wasted' : ''}`, dups);
    };
    draw();
  };
  /* Join split files: pick the parts, then Aurora joins them and checks the result */
  const origSpace = CUSTOM.space;
  CUSTOM.space = (box) => {
    origSpace(box); const card = el('div', 'card join-card'); card.dataset.join = '1'; const info = el('div', 'muted', 'Downloaded a big file in parts (like aurora-os.iso.00.part)? Choose all the parts here and Aurora joins them into one file. It never overwrites anything.');
    const out = el('div', 'join-out'); const pick = B('Choose the parts…', 'primary', async () => { try { const r = await call('joinPick'); if (!r) return; const c = r.check; const bad = c ? c.bad.length + c.missing.length : 0; out.textContent = `${r.parts.length} parts, ${fmt(r.parts.reduce((s, p) => s + p.size, 0))} in total. First: ${r.parts[0].name}.` + (c ? (bad ? ` PROBLEM: ${c.bad.length ? 'damaged (download again): ' + c.bad.join(', ') + '. ' : ''}${c.missing.length ? 'missing: ' + c.missing.join(', ') + '.' : ''}` : ` All ${c.ok} parts checked and fine.`) : ' Tip: also choose the .sha256 file to check every part first.'); go2.disabled = bad > 0; go2._name = r.suggest; } catch (e) { toast(errText(e), true); } });
    const go2 = B('Join them', '', async () => { try { go2.disabled = true; out.textContent = 'Joining…'; const r = await call('joinRun', { name: go2._name }); if (!r) { out.textContent = 'Cancelled'; go2.disabled = false; return; } out.textContent = `Done: ${r.path} (${fmt(r.size)}). SHA-256 starts with ${r.sha256.slice(0, 16)}. ` + (r.iso ? 'This is a valid ISO image, so Rufus will accept it (choose GPT, UEFI, DD Image mode).' : 'This file is not an ISO image, so Rufus will not use it.'); if (!bar.querySelector('[data-reveal]')) { const rv = B('Show in folder', '', async () => { try { await call('joinReveal'); } catch (e) { toast(errText(e), true); } }); rv.dataset.reveal = '1'; bar.append(rv); } toast('Joined'); } catch (e) { out.textContent = errText(e); go2.disabled = false; toast(errText(e), true); } }); go2.disabled = true;
    const bar = el('div', 'savebar'); bar.append(pick, go2); card.append(el('b', '', 'Join split files'), info, bar, out); box.append(card);
  };
}
