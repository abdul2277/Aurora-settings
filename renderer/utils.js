/* Aurora Utilities: file checker, folder compare, empty folder finder and checksum lists. Nothing here changes or deletes your files. (Text and colour tools are optional add-ons now.) */
{
  const B = (t, c, f) => { const b = el('button', 'btn' + (c ? ' ' + c : ''), t); if (f) b.onclick = f; return b; };
  const err = (e) => toast(errText(e), true);
  const fmt = (n) => n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? Math.round(n / 1048576) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const card = (title, note) => { const c = el('div', 'card util-card'); c.append(el('b', '', title)); if (note) c.append(el('div', 'muted', note)); return c; };
  CUSTOM.utils = (box) => {
    box.style.gap = '12px';
    /* 1. file hash */
    { const c = card('File checker', 'Check a downloaded file against the checksum its publisher gave you. Catches damaged or tampered downloads.'); const out = el('div', 'util-out'); const exp = el('input', 'filter'); exp.placeholder = 'Paste the expected checksum (optional)'; exp.style.margin = '0';
      const algo = el('select', 'filter'); for (const a of ['sha256', 'sha1', 'md5', 'sha512']) algo.append(new Option(a.toUpperCase(), a)); algo.style.margin = '0'; let chosen = false;
      const run = B('Check it', 'primary', async () => { if (!chosen) return toast('Choose a file first', true); out.textContent = 'Checking…'; try { const r = await call('utilsHash', { algo: algo.value, expected: exp.value }); out.textContent = `${r.algo.toUpperCase()}: ${r.hash}\n${fmt(r.size)}` + (r.match === true ? '\n✅ It matches. The file is exactly what the publisher made.' : r.match === false ? '\n❌ It does NOT match. Do not use this file: download it again.' : ''); out.dataset.match = String(r.match); } catch (e) { out.textContent = errText(e); } });
      const pick = B('Choose file…', '', async () => { try { const r = await call('utilsPickFile'); if (!r) return; chosen = true; out.textContent = r.path + ' (' + fmt(r.size) + ')'; } catch (e) { err(e); } });
      const bar = el('div', 'savebar'); bar.append(pick, algo, run); c.append(bar, exp, out); box.append(c); }
    /* 2. folder compare */
    { const c = card('Folder compare', 'Pick two folders and see which files are only in one, or have different sizes. Good for backups and copies.'); const out = el('div', 'util-list'); const info = el('div', 'muted');
      const slot = (s) => B('Folder ' + s.toUpperCase() + '…', '', async () => { try { const p = await call('utilsPickFolder', { slot: s }); if (p) info.textContent = (info.textContent.includes('\n') || !info.textContent ? '' : info.textContent + '\n') + s.toUpperCase() + ': ' + p; } catch (e) { err(e); } });
      const go2 = B('Compare', 'primary', async () => { try { const r = await call('utilsCompare'); out.replaceChildren(); out.append(el('div', 'muted', `${r.same} files are the same. Only in A: ${r.counts.onlyA}. Only in B: ${r.counts.onlyB}. Different size: ${r.counts.different}.` + (r.truncated ? ' (very large folders were cut short)' : '')));
        const section = (t, rows) => { if (!rows.length) return; out.append(el('b', '', t)); for (const [p, label, base] of rows) { const row = el('div', 'util-row'); row.dataset.path = p; row.append(el('span', 'util-path', p), el('span', 'muted', label || ''), B('Show', '', async () => { try { await call('utilsReveal', { path: base + (base.includes('\\') ? '\\' : '/') + p }); } catch (e) { err(e); } })); out.append(row); } };
        section('Only in A', r.onlyA.slice(0, 50).map((p) => [p, '', r.a])); section('Only in B', r.onlyB.slice(0, 50).map((p) => [p, '', r.b])); section('Different size', r.different.slice(0, 50).map((d) => [d.path, `${fmt(d.a)} vs ${fmt(d.b)}`, r.a])); } catch (e) { err(e); } });
      const bar = el('div', 'savebar'); bar.append(slot('a'), slot('b'), go2); c.append(bar, info, out); box.append(c); }
    /* 3. empty folders */
    { const c = card('Empty folder finder', 'Finds folders with nothing inside. It only lists them: you decide what to do.'); const out = el('div', 'util-list');
      const pick = B('Choose folder…', '', async () => { try { const p = await call('utilsPickFolder', { slot: 'empty' }); if (p) out.textContent = p; } catch (e) { err(e); } });
      const scan = B('Find empty folders', 'primary', async () => { try { const r = await call('utilsEmptyScan'); out.replaceChildren(el('div', 'muted', r.empty.length ? `${r.empty.length} empty folders in ${r.root}` : 'No empty folders found.')); for (const p of r.empty.slice(0, 100)) { const row = el('div', 'util-row'); row.dataset.path = p; row.append(el('span', 'util-path', p), B('Show', '', async () => { try { await call('utilsReveal', { path: p }); } catch (e) { err(e); } })); out.append(row); } } catch (e) { err(e); } });
      const bar = el('div', 'savebar'); bar.append(pick, scan); c.append(bar, out); box.append(c); }
    /* 3b. checksum list for a folder */
    { const c = card('Folder checksum list', 'Make a list of checksums for every file in a folder, then check the folder against that list later. Proves nothing changed or got damaged (great for backups and big downloads).'); const out = el('div', 'util-list'); const info = el('div', 'muted');
      const pick = B('Choose folder…', '', async () => { try { const p = await call('utilsPickFolder', { slot: 'manifest' }); if (p) info.textContent = p; } catch (e) { err(e); } });
      const make = B('Make the list', 'primary', async () => { try { out.textContent = 'Working…'; const r = await call('utilsManifestMake'); out.textContent = r ? `Saved ${r.count} checksums (${fmt(r.bytes)} checked) to ${r.path}` : 'Cancelled'; } catch (e) { out.textContent = errText(e); } });
      const chk = B('Check against a list…', '', async () => { try { out.textContent = 'Checking…'; const r = await call('utilsManifestCheck'); if (!r) { out.textContent = 'Cancelled'; return; } const bad = r.counts.bad + r.counts.missing; out.replaceChildren(el('div', 'util-verdict ' + (bad ? 'bad' : 'good'), bad ? `❌ ${r.counts.bad} changed or damaged, ${r.counts.missing} missing. ${r.ok} files are fine.` : `✅ All ${r.ok} files match the list.`)); if (r.counts.extra) out.append(el('div', 'muted', `${r.counts.extra} extra files are not on the list.`)); for (const [t, a] of [['Changed or damaged', r.bad], ['Missing', r.missing]]) if (a.length) { out.append(el('b', '', t)); a.slice(0, 40).forEach((p) => out.append(el('div', 'util-path', p))); } } catch (e) { out.textContent = errText(e); } });
      const bar = el('div', 'savebar'); bar.append(pick, make, chk); c.append(bar, info, out); box.append(c); }
  };
}
