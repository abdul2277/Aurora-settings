/* Desktop widgets: shown inside the Add-ons page. */
{
  window.auroraWidgetsUI = (box) => {
    box.style.gap = '12px';
    const intro = el('div', 'muted', 'Little floating cards that stay on your desktop. Drag them anywhere, they remember where you put them and come back when Aurora starts. Hover a widget to close it.');
    const grid = el('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px';
    box.append(intro, grid);
    const draw = (list) => {
      grid.textContent = '';
      for (const w of list) {
        const c = el('div', 'card'); c.dataset.widget = w.kind;
        const head = el('div'); head.style.cssText = 'display:flex;align-items:center;gap:8px'; head.append(el('b', '', w.name));
        const btn = el('button', 'btn' + (w.open ? '' : ' primary'), w.open ? 'Hide' : 'Show'); btn.style.marginLeft = 'auto';
        btn.onclick = async () => { try { draw(await call(w.open ? 'widgetClose' : 'widgetOpen', { kind: w.kind })); } catch (e) { toast(errText(e), true); } };
        head.append(btn);
        const op = el('input'); op.type = 'range'; op.min = 30; op.max = 100; op.value = Math.round(w.opacity * 100); op.title = 'Opacity';
        op.onchange = async () => { try { await call('widgetSet', { kind: w.kind, opacity: op.value / 100 }); } catch (e) { toast(errText(e), true); } };
        const lk = el('label', 'sub'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = w.locked; cb.onchange = async () => { try { await call('widgetSet', { kind: w.kind, locked: cb.checked }); if (cb.checked) toast('Locked: clicks go through it. Untick here to move it again'); } catch (e) { toast(errText(e), true); } };
        lk.append(cb, document.createTextNode(' Lock in place (clicks pass through)'));
        c.append(head, el('div', 'muted', w.note), op, lk); grid.append(c);
      }
    };
    call('widgetList').then(draw).catch((e) => grid.append(el('div', 'muted', errText(e))));
  };
}
