/* Time-of-day awareness: greeting, a "Right now" suggestion on Home, and an optional theme that follows the clock. */
{
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } } };
  // night 22-04, dawn 05-07, morning 08-11, afternoon 12-17, evening 18-21. Hours outside 0-23 wrap.
  const part = (h) => { h = ((Math.floor(h) % 24) + 24) % 24; return h >= 22 || h < 5 ? 'night' : h < 8 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'; };
  const EMOJI = { night: '🌙', dawn: '🌅', morning: '☀️', afternoon: '🌤️', evening: '🌆' };
  const greeting = (h) => { const p = part(h); return p === 'night' ? (((Math.floor(h) % 24) + 24) % 24 >= 22 ? 'Good night' : 'Working late') : p === 'dawn' ? 'Early start' : p === 'morning' ? 'Good morning' : p === 'afternoon' ? 'Good afternoon' : 'Good evening'; };
  const THEME_FOR = { dawn: 'sunset', morning: 'gold', afternoon: 'ocean', evening: 'violet', night: 'midnight' };
  // Each idea points at a page; ideas whose page does not exist on this system are skipped. They rotate with the day of the year.
  const IDEAS = {
    dawn: [['Start the day by checking for app updates.', ['store', 'appstore'], 'Open the Store'], ['Plan your morning with the Planner.', ['aurora-plus'], 'Open Plus']],
    morning: [['Check that nothing Windows added is slowing you down.', ['ai'], 'Open De-AI'], ['Install what you need for today in one click.', ['store', 'appstore'], 'Open the Store']],
    afternoon: [['Find what is filling your drive.', ['space'], 'Open Space'], ['Take a break with a quick add-on.', ['addons'], 'Open Add-ons']],
    evening: [['Wind down: send a file to your phone, privately.', ['aurora-pro', 'drop'], 'Open Drop'], ['Try an evening theme for a softer look.', ['looks'], 'Open Looks']],
    night: [['Late? A darker theme is easier on the eyes.', ['looks'], 'Open Looks'], ['Work out a good bedtime with the sleep calculator add-on.', ['addons'], 'Open Add-ons']]
  };
  const pageExists = (id) => (window.auroraPageKnown ? window.auroraPageKnown(id) : !!(window.PAGES && window.PAGES.some((p) => p.id === id)));
  function suggestion(h, dayOfYear) { const list = (IDEAS[part(h)] || []).filter((i) => pageExists(i[1][0])); if (!list.length) return null; const i = list[((dayOfYear % list.length) + list.length) % list.length]; return { text: i[0], go: i[1], label: i[2], part: part(h) }; }
  const dayOfYear = (d) => Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const api = { part, greeting, emoji: (h) => EMOJI[part(h)], themeFor: (h) => THEME_FOR[part(h)], suggestion, clock: () => new Date(), IDEAS, THEME_FOR };
  window.auroraDaypart = api;

  function ensureNow() {
    const hero = document.getElementById('aur-hero'); if (!hero) return; const d = api.clock(), h = d.getHours();
    const h2 = hero.querySelector('h2'); if (h2 && h2.firstChild && h2.firstChild.nodeType === 3) { const t = `${api.emoji(h)} ${greeting(h)}, `; if (h2.firstChild.nodeValue !== t) h2.firstChild.nodeValue = t; }
    const s = suggestion(h, dayOfYear(d)); let card = document.getElementById('aur-now');
    if (!s) { if (card) card.remove(); return; }
    if (!card) { card = el('div', 'now-card'); card.id = 'aur-now'; hero.after(card); } const key = s.text + h; if (card.dataset.key === key) return; card.dataset.key = key; card.dataset.part = s.part; card.replaceChildren();
    const b = el('button', 'btn primary', s.label); b.onclick = () => { try { go(...s.go); } catch (_) { /* ignore */ } };
    const left = el('div', 'now-left'); left.append(el('div', 'now-h', `${api.emoji(h)} Right now`), el('div', 'now-t', s.text)); card.append(left, b);
  }
  // Optional: the theme follows the time of day.
  const autoOn = () => LS.get('aurora.autotime') === '1'; let lastPart = '';
  function autoTheme(force) {
    if (!autoOn()) return; const p = part(api.clock().getHours()); if (!force && p === lastPart) return; lastPart = p;
    try { if (window.__special && window.__special.applyTheme) window.__special.applyTheme(THEME_FOR[p], false); } catch (_) { /* ignore */ }
  }
  function tick() { ensureNow(); autoTheme(false); }
  api.refresh = tick; api.setAuto = (on) => { LS.set('aurora.autotime', on ? '1' : '0'); lastPart = ''; if (on) autoTheme(true); }; api.autoOn = autoOn;
  const page = document.getElementById('page'); if (page) new MutationObserver(() => setTimeout(ensureNow, 0)).observe(page, { childList: true });
  setInterval(tick, 30000); document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  // Looks page: add the switch under the themes
  if (typeof CUSTOM !== 'undefined' && CUSTOM.looks) {
    const orig = CUSTOM.looks; CUSTOM.looks = (box) => { orig(box); const card = el('div', 'card'); card.style.cssText = 'padding:14px;display:grid;gap:8px'; const row = el('label'); row.style.cssText = 'display:flex;gap:8px;align-items:center'; row.id = 'autotime-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'autotime'; cb.checked = autoOn(); cb.onchange = () => { api.setAuto(cb.checked); toast(cb.checked ? 'The theme will follow the time of day' : 'Automatic theme is off'); }; row.append(cb, el('span', null, 'Change the theme with the time of day'));
      card.append(row, el('div', 'sub', 'Dawn: Sunset · Morning: Gold · Afternoon: Ocean · Evening: Violet · Night: Midnight. It switches by itself as the day goes on.')); box.append(card); };
  }
  setTimeout(() => { tick(); autoTheme(true); }, 1200);
}
