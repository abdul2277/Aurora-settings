// Clipboard history (alternative to Win+V). Text only, kept in memory only (never written to disk), opt-in.
function createClipboardHistory({ clipboard, now = Date.now, max = 50, maxChars = 20000 }) {
  let items = []; let seq = 0; let last = ''; let paused = false;
  function poll() {
    if (paused) return false;
    let t; try { t = clipboard.readText(); } catch (_) { return false; }
    if (typeof t !== 'string' || !t.trim() || t === last || t.length > maxChars) { if (t === last) return false; last = t; return false; }
    last = t;
    const dup = items.find((i) => i.text === t);
    if (dup) { dup.t = now(); items = [dup, ...items.filter((i) => i !== dup)]; return true; }
    items.unshift({ id: ++seq, text: t, pinned: false, t: now() });
    // keep every pinned item; trim only unpinned ones beyond the limit
    let unpinned = 0; items = items.filter((i) => i.pinned || ++unpinned <= max);
    return true;
  }
  const byId = (id) => items.find((i) => i.id === id);
  return {
    poll,
    list: () => [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.t - a.t).map((i) => ({ id: i.id, preview: i.text.length > 300 ? i.text.slice(0, 300) + '…' : i.text, length: i.text.length, pinned: i.pinned, t: i.t })),
    use(id) { const i = byId(id); if (!i) throw new Error('That item is gone'); clipboard.writeText(i.text); last = i.text; i.t = now(); return true; },
    pin(id, pinned) { const i = byId(id); if (!i) throw new Error('That item is gone'); i.pinned = !!pinned; return true; },
    remove(id) { items = items.filter((i) => i.id !== id); return true; },
    clear() { items = items.filter((i) => i.pinned); return true; },
    setPaused(v) { paused = !!v; },
    wipe() { items = []; last = ''; } // used when the feature is switched off
  };
}
module.exports = { createClipboardHistory };
