/* My commands: build your own command-bar commands (macros) and your own add-ons by typing. Loaded after commands.js. */
{
  const KEY = 'aurora.mycmds';
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const save = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (_) {} };
  const RESERVED = /^(cmd|addon|go|say|copy|wait)$/;
  // ---- pure parsing ----
  const parseDef = (text) => { // "cmd add morning = dark; timer 25 focus"
    const m = /^cmd\s+add\s+([a-z0-9][a-z0-9_-]{0,23})\s*=\s*(.+)$/i.exec(text.trim()); if (!m) return null;
    const trigger = m[1].toLowerCase(); if (RESERVED.test(trigger)) return { error: '"' + trigger + '" is already used by Aurora' };
    const steps = m[2].split(';').map((s) => s.trim()).filter(Boolean).slice(0, 12); if (!steps.length) return { error: 'Add at least one step after the = sign' };
    return { trigger, steps };
  };
  const expand = (steps, args) => steps.map((s) => (s.includes('{}') ? s.split('{}').join(args) : s));
  const parseAddon = (text) => { // "addon new Hello [perms:storage,clipboard] = document.body.textContent='hi'"
    const m = /^addon\s+new\s+(.+?)\s*=\s*([\s\S]+)$/i.exec(text.trim()); const m2 = m || /^addon\s+new\s+(.+)$/i.exec(text.trim()); if (!m2) return null;
    let head = m2[1].trim(); const js = m ? m[2].trim() : ''; const pm = /\bperms?:([a-z,]+)/i.exec(head); const perms = pm ? pm[1].toLowerCase().split(',').filter((p) => ['storage', 'clipboard', 'notify', 'system', 'screen'].includes(p)) : []; if (pm) head = head.replace(pm[0], '').trim();
    const name = head.slice(0, 40); const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); if (!name || !id) return { error: 'Give the add-on a name' };
    return { name, id, perms, js };
  };
  const starterJs = (name) => "document.getElementById('app').textContent = 'Hello from " + name.replace(/[^\w ]/g, '') + "';";
  const addonRequest = (a) => ({ kind: 'create', id: a.id, name: a.name, icon: '🧩', description: 'Made from the command bar', permissions: a.perms, html: '<div id="app" style="padding:10px"></div>', css: 'body{font:14px system-ui;margin:0}', js: a.js || starterJs(a.name) });
  // ---- running ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function runStep(step) {
    let m;
    if ((m = /^go\s+(\S+)$/i.exec(step))) { go(m[1]); return 'Opened ' + m[1]; }
    if ((m = /^say\s+(.+)$/i.exec(step))) { toast(m[1]); return m[1]; }
    if ((m = /^copy\s+(.+)$/i.exec(step))) { try { await navigator.clipboard.writeText(m[1]); return 'Copied'; } catch (_) { return 'Clipboard blocked'; } }
    if ((m = /^wait\s+(\d+(?:\.\d+)?)$/i.exec(step))) { await sleep(Math.min(30, +m[1]) * 1000); return ''; }
    const found = (window.__baseCmds ? window.__baseCmds(step) : []).find((x) => x.act); if (!found) return 'Unknown step: ' + step; const r = await found.run(); return typeof r === 'string' ? r : '';
  }
  async function runMacro(c, args) { const out = []; for (const s of expand(c.steps, args)) { const r = await runStep(s); if (r) out.push(r); } return out.join(' · ') || 'Done'; }
  const act = (label, hint, run, icon) => ({ act: true, label, hint, run, icon: icon || '⚡' });
  function mine(qs) {
    const q = qs.trim(); const low = q.toLowerCase(); const out = []; if (!q) return out;
    if (low === 'cmd' || low === 'cmd help') out.push(act('My commands: type  cmd add name = step; step', 'Example: cmd add morning = dark; timer 25 focus; go todo', async () => 'cmd add <name> = <step>; <step> · cmd list · cmd remove <name> · {} inside a step is replaced by what you type after the name', '🛠️'));
    if (/^cmd\s+add\b/i.test(q)) { const d = parseDef(q); if (d && d.error) out.push(act(d.error, 'My commands', async () => d.error, '⚠️')); else if (d) out.push(act('Save command "' + d.trigger + '" (' + d.steps.length + ' steps)', 'My commands', async () => { const l = load().filter((x) => x.trigger !== d.trigger); l.push(d); save(l); return 'Saved. Type "' + d.trigger + '" to run it'; }, '💾')); else out.push(act('Use: cmd add name = step; step', 'Example: cmd add morning = dark; timer 25 focus', async () => 'Use: cmd add name = step; step', '🛠️')); }
    if (low === 'cmd list') out.push(act('You have ' + load().length + ' commands', load().map((c) => c.trigger).join(', ') || 'none yet', async () => load().map((c) => c.trigger + ' = ' + c.steps.join('; ')).join('  |  ') || 'No commands yet', '📋'));
    { const m = /^cmd\s+(?:remove|delete)\s+(\S+)$/i.exec(q); if (m) out.push(act('Remove command "' + m[1].toLowerCase() + '"', 'My commands', async () => { const l = load(); const n = l.filter((x) => x.trigger !== m[1].toLowerCase()); if (n.length === l.length) return 'No command with that name'; save(n); return 'Removed'; }, '🗑️')); }
    load().forEach((c) => { const m = new RegExp('^' + c.trigger.replace(/[-_]/g, '[-_]') + '(?:\\s+(.*))?$', 'i').exec(q); if (m) out.push(act('Run: ' + c.trigger, c.steps.join(' → '), () => runMacro(c, (m[1] || '').trim()), '▶️')); });
    if (/^addon\s+new\b/i.test(q)) { const a = parseAddon(q); if (a && a.error) out.push(act(a.error, 'Add-ons', async () => a.error, '⚠️')); else if (a) out.push(act('Create add-on "' + a.name + '"' + (a.perms.length ? ' (asks: ' + a.perms.join(', ') + ')' : ''), 'Add-ons', async () => { const s = await call('addonStage', addonRequest(a)); if (!s) throw new Error('Could not create it'); await call('addonInstall', { token: s.token }); go('addons'); return 'Created "' + a.name + '". Open it in Add-ons, edit it in the Studio'; }, '🧩')); else out.push(act('Use: addon new Name = javascript', 'Example: addon new Hello perms:storage = ...', async () => 'Use: addon new Name [perms:storage,clipboard] = javascript code', '🧩')); }
    if (low === 'addon' || low === 'addon help') out.push(act('Add-on commands', 'addon new Name = js · addon list · addon remove id · addon studio', async () => 'addon new Name [perms:storage,clipboard,notify,system] = javascript · addon list · addon remove id · addon studio', '🧩'));
    if (low === 'addon list') out.push(act('List my add-ons', 'Add-ons', async () => (await call('addonList')).filter((a) => a.id !== 'studio-draft').map((a) => a.id).join(', ') || 'No add-ons yet', '🧩'));
    { const m = /^addon\s+(?:remove|delete)\s+([a-z0-9-]+)$/i.exec(q); if (m) out.push(act('Remove add-on "' + m[1].toLowerCase() + '"', 'Add-ons', async () => { await call('addonRemove', { id: m[1].toLowerCase() }); return 'Removed'; }, '🗑️')); }
    if (low === 'addon studio' || low === 'addon edit') out.push(act('Open the Add-on Studio', 'Add-ons', async () => { go('addons'); return ''; }, '🧩'));
    return out;
  }
  const prev = window.auroraCommands; window.__baseCmds = (qs) => prev(qs);
  window.auroraCommands = (qs) => { const m = mine(qs); return [...m, ...prev(qs)]; };
  window.__mycmds = { parseDef, expand, parseAddon, addonRequest, load, save };

  // management page
  CUSTOM.mycmds = (box) => {
    box.style.gap = '12px'; const card = el('div', 'card'); card.style.cssText = 'padding:14px;display:grid;gap:8px';
    card.append(el('div', 'label', 'Make your own commands and add-ons by typing (Ctrl+K)'));
    ['cmd add morning = dark; timer 25 focus; go todo', 'cmd add t = timer {} tea   →   then type  t 10', 'cmd list · cmd remove morning', 'addon new Hello = document.getElementById("app").textContent = "Hi"', 'addon new Notes perms:storage,clipboard = ...', 'addon list · addon remove hello · addon studio'].forEach((t) => { const r = el('div', 'sub', t); r.style.fontFamily = 'Consolas,monospace'; card.append(r); });
    const list = el('div'); list.id = 'mc-list'; const draw = () => { list.replaceChildren(); const l = load(); if (!l.length) list.append(el('div', 'muted', 'No commands yet.')); l.forEach((c) => { const r = el('div', 'list-row'); r.dataset.trigger = c.trigger; r.append(el('div', 'label', c.trigger), el('div', 'sub', c.steps.join('  →  '))); const run = el('button', 'btn primary', 'Run'); run.onclick = async () => { try { toast(await runMacro(c, '')); } catch (e) { toast(errText(e), true); } }; const del = el('button', 'btn', 'Remove'); del.onclick = () => { save(load().filter((x) => x.trigger !== c.trigger)); draw(); }; r.append(run, del); list.append(r); }); };
    draw(); card.append(list); box.append(card);
  };
}
