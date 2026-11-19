/* Desktop Look page: only shown on Vorynth OS (Linux). It calls /usr/local/bin/aurora-look through main.js. */
(() => {
  const ACCENTS = { blue: '#0a84ff', purple: '#bf5af2', pink: '#ff375f', red: '#ff453a', orange: '#ff9f0a', yellow: '#ffd60a', green: '#30d158', grey: '#8e8e93' };
  const CORNERS = [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']];
  const ACTIONS = [['none', 'Nothing'], ['overview', 'Mission Control'], ['desktop', 'Show desktop'], ['lock', 'Lock screen'], ['spotlight', 'Spotlight'], ['screensaver', 'Screen saver']];
  CUSTOM.desklook = (box) => {
    box.style.gap = '12px';
    const set = async (cmd, ...args) => { try { await window.api.call('lookSet', { cmd, args }); toast('Applied'); } catch (e) { toast(e.message || 'Could not apply'); } };
    const row = (title, desc) => { const r = el('div', 'card'); r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px'; const t = el('div'); t.append(el('b', '', title)); if (desc) t.append(el('div', 'muted', desc)); r.append(t); return r; };
    const select = (opts, cur, fn) => { const s = el('select'); opts.forEach(([v, l]) => { const o = el('option', '', l); o.value = v; if (v === cur) o.selected = true; s.append(o); }); s.onchange = () => fn(s.value); return s; };
    const sw = (on, fn) => { const l = el('label', 'switch'); const i = el('input'); i.type = 'checkbox'; i.checked = !!on; i.onchange = () => fn(i.checked); l.append(i, el('span', 'track'), el('span', 'thumb')); return l; };
    const btn = (text, fn, cls) => { const b = el('button', cls || '', text); b.onclick = fn; return b; };
    window.api.call('lookGet').then((st) => {
      box.replaceChildren();
      if (!st || !st.available) { box.append(el('div', 'muted', 'This page works inside Vorynth OS. It changes the dock, menu bar, theme and more of the Vorynth OS desktop.')); return; }
      const intro = el('div', 'muted', 'Pick a style for the whole desktop, or change single parts below. Spotlight is on Super+Space. Everything changes right away.'); box.append(intro); { const ub = el('div', 'card'); ub.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px'; const ut = el('div'); ut.append(el('b', '', 'Update everything'), el('div', 'muted', 'System packages, apps and firmware in one go. Needs internet.')); const ubtn = el('button', 'primary', 'Update now'); ubtn.onclick = () => window.api.call('lookApp', { what: 'update' }).catch((e) => toast(e.message)); ub.append(ut, ubtn); box.append(ub); }
      let r = row('Style (whole desktop)', 'Switch the whole look: Vorynth Glass (default), macOS, Windows 11/10/7/XP/98, Zorin, Ubuntu, Pop!_OS, Bazzite, CachyOS, Nobara and more. Close approximations, not exact copies.'); r.append(select((st.styles && st.styles.length ? st.styles : [['aurora', 'Vorynth Glass (default)']]).map(([v, l]) => [v, l]), st.style, (v) => set('style', v))); box.append(r);
      r = row('Desktop layout', 'Mac: menu bar on top and a dock. Windows: taskbar at the bottom with a Start menu (like Zorin OS)'); r.append(select([['mac', 'Mac (menu bar and dock)'], ['windows', 'Windows (taskbar)'], ['chromeos', 'ChromeOS (shelf)'], ['ubuntu', 'Ubuntu (top bar, dock on the left)']], st.layout, (v) => set('layout', v))); box.append(r);
      r = row('Appearance', 'Light or dark windows, menus and icons'); r.append(select([['light', 'Light'], ['dark', 'Dark']], st.mode, (v) => set('theme', v))); box.append(r);
      r = row('Accent colour', 'Buttons, selections and highlights'); const sw8 = el('div'); sw8.style.cssText = 'display:flex;gap:8px';
      Object.entries(ACCENTS).forEach(([k, c]) => { const b = el('button'); b.title = k; b.style.cssText = 'width:26px;height:26px;border-radius:50%;border:3px solid ' + (k === st.accent ? '#fff' : 'transparent') + ';outline:1px solid #8884;background:' + c + ';padding:0;cursor:pointer'; b.onclick = () => { sw8.querySelectorAll('button').forEach((x) => { x.style.borderColor = 'transparent'; }); b.style.borderColor = '#fff'; set('accent', k); }; sw8.append(b); }); r.append(sw8); box.append(r);
      r = row('Mouse pointer', 'Choose how the mouse cursor looks and how big it is'); { const cs = (st.cursors && st.cursors.length ? st.cursors : [st.cursor || 'WhiteSur-cursors']).map((c) => [c, c.replace(/-cursors?$/i, '')]); r.append(select(cs, st.cursor, (v) => set('cursor', v, st.cursorSize || 24)), select([['16', 'Small'], ['24', 'Normal'], ['32', 'Large'], ['48', 'Extra large'], ['64', 'Huge']], String(st.cursorSize || 24), (v) => set('cursor', st.cursor || 'WhiteSur-cursors', v))); } box.append(r);
      r = row('Wallpaper', 'Pick a picture for your desktop'); r.append(select((st.wallpapers || []).map((w) => [w, w]), st.wallpaper, (v) => set('wallpaper', v))); box.append(r);
      r = row('Dock position'); r.append(select([['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']], st.dockPosition, (v) => set('dock-position', v))); box.append(r);
      r = row('Dock size', 'Icon size in pixels'); const rg = el('input'); rg.type = 'range'; rg.min = 32; rg.max = 96; rg.value = st.dockSize; const lab = el('span', 'muted', st.dockSize + ''); let tm; rg.oninput = () => { lab.textContent = rg.value; clearTimeout(tm); tm = setTimeout(() => set('dock-size', rg.value), 350); }; r.append(lab, rg); box.append(r);
      r = row('Magnify icons', 'Icons grow when the mouse goes over them'); r.append(sw(st.dockZoom, (v) => set('dock-zoom', v ? 'on' : 'off'))); box.append(r);
      r = row('Dock hiding'); r.append(select([['none', 'Always show'], ['intelligent', 'Hide when a window covers it'], ['auto', 'Always hide until you move the mouse down'], ['dodge-active', 'Hide when the active window covers it']], st.dockHide, (v) => set('dock-hide', v))); box.append(r);
      r = row('Menu bar', 'Glass looks see-through like macOS'); r.append(select([['glass', 'Glass'], ['solid', 'Solid']], st.menubar, (v) => set('menubar', v))); box.append(r);
      r = row('Window buttons', 'Mac puts the red, yellow and green buttons on the left'); r.append(select([['mac', 'Mac (left)'], ['windows', 'Windows (right)']], st.buttons, (v) => set('buttons', v))); box.append(r);
      r = row('Blur and rounded windows', 'Frosted glass and round corners. Needs a graphics driver that supports it; turn it off if the screen flickers'); r.append(sw(st.blur, (v) => set('blur', v ? 'on' : 'off'))); box.append(r);
      r = row('Night Shift', 'Warmer screen colours for the evening'); r.append(sw(st.nightshift, (v) => set('nightshift', v ? 'on' : 'off'))); box.append(r);
      r = row('Hot corners', 'Move the mouse into a corner to do something'); r.append(sw(st.hotcorners, (v) => set('hotcorners', v ? 'on' : 'off'))); box.append(r);
      CORNERS.forEach(([k, name]) => { const c = row(name + ' corner'); c.style.marginLeft = '18px'; c.append(select(ACTIONS, (st.corners || {})[k], (v) => set('corner', k, v))); box.append(c); });
      window.api.call('displayGet').then((ds) => {
        if (!ds || !ds.available || !ds.monitors || !ds.monitors.length) return;
        const head = el('div', 'muted', 'Screen refresh rate. Vorynth OS sets every monitor to its fastest mode at start (120, 144, 165, 240 Hz or whatever your monitor supports). You can pick another one here.'); box.insertBefore(head, box.querySelector('.deskTools'));
        ds.monitors.forEach((mo) => {
          const c = row('Monitor ' + mo.name, 'Resolution and refresh rate'); const seen = new Set(); const opts = [];
          mo.modes.slice().sort((a, b) => (parseInt(b.res, 10) - parseInt(a.res, 10)) || (b.rate - a.rate)).forEach((x) => { const v = x.res + '@' + x.rate; if (!seen.has(v)) { seen.add(v); opts.push([v, x.res.replace('x', ' x ') + '  ' + Math.round(x.rate) + ' Hz']); } });
          const cur = mo.current ? mo.current.res + '@' + mo.current.rate : '';
          c.append(select(opts, cur, async (v) => { const [res, rate] = v.split('@'); try { await window.api.call('displaySet', { output: mo.name, res, rate }); toast('Applied'); } catch (e) { toast(e.message); } }), btn('Fastest', async () => { try { await window.api.call('displayBest'); toast('Set to the fastest mode'); } catch (e) { toast(e.message); } }));
          box.insertBefore(c, box.querySelector('.deskTools'));
        });
      }).catch(() => {});
      window.api.call('audioStatus').then((au) => {
        if (!au || !au.available) return;
        const c = el('div', 'card'); c.style.cssText = 'padding:12px 16px;display:flex;flex-direction:column;gap:8px'; c.append(el('b', '', 'Vorynth Sound: modes, Bluetooth codec, noise cancelling mic, effects'));
        const info = el('div', 'muted', au.text); info.style.whiteSpace = 'pre-line'; c.append(info);
        const run = async (cmd, v) => { try { toast(await window.api.call('audioSet', { cmd, value: v })); const s = await window.api.call('audioStatus'); info.textContent = s.text; } catch (e) { toast(e.message); } };
        const line = (label, items) => { const r = el('div'); r.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center'; r.append(el('span', 'muted', label)); items.forEach(([t, cmd, v]) => r.append(btn(t, () => run(cmd, v)))); c.append(r); };
        line('Modes', [['Music', 'mode', 'music'], ['Movie', 'mode', 'movie'], ['Call', 'mode', 'call'], ['Gaming', 'mode', 'gaming'], ['Night', 'mode', 'night']]);
        line('Bluetooth codec', [['LDAC', 'codec', 'ldac'], ['aptX HD', 'codec', 'aptx_hd'], ['AAC', 'codec', 'aac'], ['SBC', 'codec', 'sbc']]);
        line('Sound effects', [['Bass boost', 'eq', 'bass'], ['Vocal', 'eq', 'vocal'], ['Treble', 'eq', 'treble'], ['Off', 'eq', 'off']]);
        line('Noise cancelling microphone', [['On', 'mic-cancel', 'on'], ['Off', 'mic-cancel', 'off']]);
        c.append(el('div', 'muted', 'LDAC works only if your headphones support it. Noise cancelling here works on your microphone and works with any headset (software). The ANC inside headphones is done by the headphones themselves and stays as you set it on them; there is no standard way for a computer to switch it.'));
        box.insertBefore(c, box.querySelector('.deskTools'));
      }).catch(() => {});
      const tools = el('div', 'card deskTools'); tools.style.cssText = 'padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center'; tools.append(el('b', '', 'Try it'));
      [['Spotlight', 'spotlight'], ['Launchpad', 'launchpad'], ['Control Center', 'control'], ['Mission Control', 'missioncontrol'], ['Time Machine backup', 'backup'], ['Check / install drivers', 'drivers'], ['Software Update', 'update'], ['About This PC', 'about'], ['Phone Desktop (DeX style)', 'dex'], ['Download a link', 'download'], ['App Store', 'store'], ['Games', 'games'], ['Quick Share', 'quickshare'], ['Eye Comfort', 'eyes'], ['Do Not Disturb', 'dnd'], ['Wi-Fi / Ethernet / Bluetooth', 'network'], ['Google Play Store', 'playstore'], ['Headphones (Huawei)', 'buds'], ['Power tools', 'tools'], ['Security Center', 'security'], ['Extra tools', 'brand'], ['Game Boost', 'gameboost'], ['Deep Focus (25 min)', 'zen'], ['Quick Sidebar', 'sidebar'], ['Copy text from screen', 'ocr'], ['Screen recorder', 'record'], ['Memory cleaner', 'clean'], ['Routines (bedtime, work, play)', 'routine'], ['Pop-up window (on top)', 'popup'], ['Quick Look (preview a file)', 'quicklook'], ['Usage today', 'usage'], ['NVIDIA settings', 'nvidia'], ['AMD Ryzen tuning', 'ryzen'], ['Hardware info', 'hwinfo'], ['Get Apps (app catalog, safe store)', 'appstore'], ['Game Store (Roblox, Minecraft, Where Winds Meet...)', 'gamestore'], ['Style Studio (fonts, icons, glass, vibes)', 'cosmetics'], ['Repair Center (fix or take control)', 'repair'], ['Safe look (panic button: effects off)', 'safelook'], ['Emoji picker', 'emoji'], ['Update everything (system, apps, firmware)', 'updateall'], ['Quick tour: what can I do here?', 'tour'], ['Show off my PC', 'fetch'], ['Greeting and my name', 'greetname'], ['Prayer times and Ramadan', 'prayer'], ['Epic mode (theme + live wallpaper + HUD)', 'epic'], ['Live wallpaper', 'livewall'], ['Desktop HUD (clock + system)', 'hud'], ['Hacker Lab', 'hacker'], ['Drop-down terminal (F12)', 'dropterm'], ['Auto noise cancelling mic: on', 'autonoise'], ['Auto noise cancelling mic: off', 'autonoiseoff'], ['Wi-Fi hotspot with QR', 'hotspot'], ['QR code from clipboard', 'qr'], ['Weather', 'weather'], ['Auto clicker (F8)', 'autoclick'], ['Linux games (free)', 'linuxgames'], ['Android games (Google Play)', 'androidgames'], ['Tune Android for games', 'androidtune'], ['PC Pulse (health at a glance)', 'pulse'], ['Awake mode on/off', 'awake'], ['Clipboard history (Super+V)', 'clip'], ['Emoji picker (Super+;)', 'emoji'], ['Timer', 'timer'], ['Daily wallpaper (internet)', 'dailywall'], ['App Stores (Flathub, Fedora, apt)', 'stores'], ['Search all app stores', 'storesearch'], ['Mods (Windhawk-style)', 'mods']].forEach(([l, w]) => tools.append(btn(l, () => window.api.call('lookApp', { what: w }).catch((e) => toast(e.message)))));
      box.append(tools);
      const keys = el('div', 'card'); keys.style.cssText = 'padding:12px 16px'; keys.append(el('b', '', 'Keyboard shortcuts'));
      [['Super + Space', 'Spotlight (apps, windows, maths like 12*7)'], ['Super + Tab', 'Mission Control'], ['Super + C', 'Control Center'], ['Super + A', 'Launchpad (all apps)'], ['Super + B', 'Time Machine backups'], ['Super + Shift + 3 / 4 / 5', 'Screenshot: screen / area / window'], ['Super + Q', 'Close window'], ['Super + M or H', 'Hide window'], ['Super + , ', 'Vorynth Settings'], ['Super + Left / Right', 'Tile window'], ['Ctrl + Super + F', 'Full screen'], ['Ctrl + Super + Q', 'Lock screen']].forEach(([k, d]) => { const l = el('div', 'muted'); l.textContent = k + '  -  ' + d; keys.append(l); });
      box.append(keys);
    }).catch(() => { box.replaceChildren(el('div', 'muted', 'Could not read the desktop settings.')); });
  };
})();

/* Customize everything: lists every setting from /usr/local/bin/aurora-tweak, grouped, with a Reset button on each. */
(() => {
  const GROUPS = { fonts: ['🔤', 'Fonts and text'], look: ['🎨', 'Look and windows style'], desktop: ['🖥️', 'Desktop and menu bar'], windows: ['🪟', 'Window behaviour'], files: ['📁', 'Files'], input: ['⌨️', 'Keyboard and mouse'], sound: ['🔊', 'Sounds'], power: ['🔋', 'Power'], notifications: ['🔔', 'Notifications'] };
  CUSTOM.oscustomize = (box) => {
    box.style.gap = '12px';
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const load = () => window.api.call('tweakList').then((st) => {
      box.replaceChildren();
      if (!st || !st.available) { box.append(mk('div', 'muted', 'This page works inside Vorynth OS. It can change fonts, windows, the desktop, files, keyboard, power and notifications.')); return; }
      const top = mk('div', 'card'); top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px';
      const tt = mk('div'); tt.append(mk('b', '', 'Everything is yours to change'), mk('div', 'muted', 'Each setting applies right away. "Reset" puts one setting back to normal. "Reset all" puts every setting on this page back.'));
      const all = mk('button', 'btn', 'Reset all'); all.onclick = async () => { try { await window.api.call('tweakReset', { id: 'all' }); toast('Everything is back to normal'); load(); } catch (e) { toast(e.message); } };
      top.append(tt, all); box.append(top);
      const search = mk('input'); search.type = 'search'; search.placeholder = 'Search settings'; search.style.cssText = 'padding:8px 12px;border-radius:10px'; box.append(search);
      const rows = [];
      Object.keys(GROUPS).forEach((g) => {
        const items = st.items.filter((x) => x.group === g); if (!items.length) return;
        const h = mk('h3', '', GROUPS[g][0] + ' ' + GROUPS[g][1]); h.style.margin = '14px 0 4px'; box.append(h);
        items.forEach((it) => {
          const r = mk('div', 'card'); r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 16px';
          const t = mk('div'); t.append(mk('b', '', it.label)); if (it.help) t.append(mk('div', 'muted', it.help));
          const ctl = mk('div'); ctl.style.cssText = 'display:flex;align-items:center;gap:8px';
          const apply = async (v) => { try { await window.api.call('tweakSet', { id: it.id, value: v }); toast('Applied'); } catch (e) { toast(e.message || 'Could not apply'); } };
          let input; const cur = it.value;
          if (it.kind === 'bool') { input = mk('label', 'switch'); const i = mk('input'); i.type = 'checkbox'; i.checked = cur === 'true'; i.onchange = () => apply(i.checked ? 'true' : 'false'); input.append(i, mk('span', 'track'), mk('span', 'thumb')); }
          else if (it.kind === 'int' || it.kind === 'float') { input = mk('input'); input.type = 'number'; input.min = it.min; input.max = it.max; if (it.kind === 'float') input.step = '0.1'; input.value = cur == null ? '' : cur; input.style.width = '90px'; input.onchange = () => apply(input.value); }
          else { input = mk('select'); const opts = it.kind === 'enum' ? it.options : (it.options || []).map((o) => [o, o]); if (cur != null && !opts.some(([v]) => v === cur)) opts.unshift([cur, cur]); if (cur == null) { const o = mk('option', '', 'Default'); o.value = ''; input.append(o); } opts.forEach(([v, l]) => { const o = mk('option', '', l); o.value = v; if (v === cur) o.selected = true; input.append(o); }); input.onchange = () => { if (input.value !== '') apply(input.value); }; }
          const rs = mk('button', 'btn', 'Reset'); rs.onclick = async () => { try { await window.api.call('tweakReset', { id: it.id }); toast('Back to normal'); load(); } catch (e) { toast(e.message); } };
          ctl.append(input, rs); r.append(t, ctl); box.append(r); rows.push([r, (it.label + ' ' + (it.help || '') + ' ' + g).toLowerCase(), h]);
        });
      });
      search.oninput = () => { const q = search.value.trim().toLowerCase(); const seen = new Set(); rows.forEach(([r, txt, h]) => { const m = !q || txt.includes(q); r.style.display = m ? '' : 'none'; if (m) seen.add(h); h.style.display = 'none'; }); seen.forEach((h) => { h.style.display = ''; }); };
    });
    load();
  };
})();
