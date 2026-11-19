/* First-run tour: five short, skippable steps. Shown once (remembered in localStorage), and again any time with the "tour" command in Ctrl+K. */
{
  const KEY = 'aurora.tour'; const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } } };
  const STEPS = [
    { icon: null, title: 'Welcome to Aurora Settings', text: 'Windows settings, with the extras Microsoft left out. This takes 20 seconds, and you can skip it any time.' },
    { icon: '🛍️', title: 'The Store installs apps safely', text: 'Pick a collection like "Everyday essentials" or "Developer kit". Every download is checked against its official fingerprint before it runs.', go: ['store', 'appstore'], goLabel: 'Open the Store' },
    { icon: '🧠', title: 'De-AI Windows in one click', text: 'Switch off Copilot, Recall, Click to Do and AI in Paint and Notepad, and switch them back on whenever you like.', go: ['ai'], goLabel: 'Open De-AI' },
    { icon: '🔒', title: 'Share files privately', text: 'Drop sends files to a phone or another PC over Wi-Fi, encrypted end to end. It can also send whole folders and receive files.', go: ['aurora-pro', 'drop'], goLabel: 'Open Drop' },
    { icon: '⌨', title: 'Ctrl+K finds anything', text: 'Press Ctrl+K and type a word like "theme", "ping" or "drop". There are 16 themes and a right-to-left layout in Personalization.' }
  ];
  let open = null, index = 0;
  const done = () => LS.set(KEY, '1');
  function close(markDone) { if (open) { open.remove(); open = null; document.removeEventListener('keydown', onKey, true); } if (markDone) done(); }
  function onKey(e) { if (!open) return; if (e.key === 'Escape') { e.stopPropagation(); close(true); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && e.key === 'Enter') return; e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } }
  function step(d) { const n = index + d; if (n < 0) return; if (n >= STEPS.length) return close(true); index = n; draw(); }
  function draw() {
    const s = STEPS[index], card = open.querySelector('.tour-card'); card.replaceChildren();
    const art = document.createElement('div'); art.className = 'tour-art';
    if (!s.icon) { const img = document.createElement('img'); img.src = 'aurora-icon.png'; img.alt = 'Aurora Settings logo'; img.width = 96; img.height = 96; art.append(img); } else art.textContent = s.icon;
    const h = el('div', 'tour-title', s.title), p = el('div', 'tour-text', s.text); const dots = el('div', 'tour-dots'); STEPS.forEach((_, i) => dots.append(el('i', i === index ? 'on' : '')));
    const bar = el('div', 'tour-bar'); const skip = el('button', 'btn', index === STEPS.length - 1 ? '' : 'Skip'); skip.onclick = () => close(true); if (index === STEPS.length - 1) skip.hidden = true;
    const back = el('button', 'btn', 'Back'); back.onclick = () => step(-1); back.hidden = index === 0;
    bar.append(skip, back);
    if (s.go) { const g = el('button', 'btn', s.goLabel); g.onclick = () => { close(true); try { go(...s.go); } catch (_) { /* page not on this system */ } }; bar.append(g); }
    const next = el('button', 'btn primary', index === STEPS.length - 1 ? 'Get started' : 'Next'); next.onclick = () => step(1); bar.append(next);
    card.append(art, h, p, dots, bar); next.focus();
  }
  function start() {
    if (open) return; index = 0; open = el('div', 'tour-back'); open.setAttribute('role', 'dialog'); open.setAttribute('aria-modal', 'true'); open.setAttribute('aria-label', 'Welcome tour'); open.append(el('div', 'tour-card'));
    open.onclick = (e) => { if (e.target === open) close(true); }; document.body.append(open); document.addEventListener('keydown', onKey, true); draw();
  }
  // Wait until the first-run AI question (if there is one) has been answered, so two pop-ups never stack.
  function maybeStart(tries) {
    if (LS.get(KEY) === '1' || open) return; const platform = window.api && window.api.platform; const aiDone = LS.get('aiFirstRun') === '1' || platform !== 'win32';
    const modal = document.querySelector('.ask-back'); if ((!aiDone || modal) && tries < 20) return setTimeout(() => maybeStart(tries + 1), 1500); start();
  }
  window.auroraTour = { start, close, STEPS };
  { const prev = window.auroraCommands; window.auroraCommands = (qs) => { const out = prev ? prev(qs) : []; if (/^(tour|welcome|intro)$/i.test(qs.trim())) out.unshift({ act: true, icon: '👋', label: 'Show the welcome tour', hint: 'Aurora', run: async () => { start(); return 'Tour'; } }); return out; }; }
  setTimeout(() => maybeStart(0), 2600);
}
