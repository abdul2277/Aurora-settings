// Tray icon, "start with Windows", and global hotkeys. Electron is injected so this can be tested with fakes.
function createBackground({ electron, store, showWindow, toggleWindow, summon = () => {}, runProfile, profileNames, handlers, setPaused, log = () => {}, iconPath, exePath, onQuit }) {
  let tray = null; let hotkeyReport = { ok: [], failed: [] };

  function applyLoginItem(autostart) {
    try { electron.app.setLoginItemSettings({ openAtLogin: !!autostart, path: exePath, args: ['--hidden'] }); }
    catch (e) { log('Could not change start-with-Windows: ' + e.message); }
  }
  function buildMenu() {
    if (!tray) return;
    const s = store.get().settings;
    const profiles = profileNames().map((n) => ({ label: n, click: () => runProfile(n).catch(() => {}) }));
    const keep = (label, mode, minutes) => ({ label, click: () => handlers.keepAwakeSet({ mode, minutes }).catch(() => {}) });
    tray.setContextMenu(electron.Menu.buildFromTemplate([
      { label: 'Open Aurora', click: showWindow },
      { type: 'separator' },
      { label: 'Profiles', submenu: profiles.length ? profiles : [{ label: 'No profiles', enabled: false }] },
      { label: 'Keep awake', submenu: [keep('Off', 'off', 0), keep('Screen on for 1 hour', 'display', 60), keep('Screen on until I turn it off', 'display', 0), keep('PC awake for 1 hour', 'system', 60)] },
      { label: 'Pause automation', type: 'checkbox', checked: !!s.paused, click: (item) => setPaused(!!item.checked) },
      { type: 'separator' },
      { label: 'Quit Aurora', click: onQuit }
    ]));
  }
  function ensureTray() {
    if (tray) return;
    try {
      const img = electron.nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      tray = new electron.Tray(img); tray.setToolTip('Aurora Settings'); tray.on('click', showWindow);
    } catch (e) { tray = null; log('Tray icon unavailable: ' + e.message); }
  }
  function destroyTray() { if (tray) { try { tray.destroy(); } catch (_) {} tray = null; } }

  const toggles = {
    mute: async () => { const v = await handlers.volumeGet(); await handlers.muteSet({ value: !v.muted }); },
    dark: async () => { const cur = await handlers.toggleGet({ id: 'darkMode' }); await handlers.toggleSet({ id: 'darkMode', value: !cur }); },
    awake: async () => { const k = await handlers.keepAwakeGet(); await handlers.keepAwakeSet(k.mode === 'off' ? { mode: 'display', minutes: 0 } : { mode: 'off', minutes: 0 }); }
  };
  const HOTKEYS = [['CommandOrControl+Alt+A', toggleWindow], ['CommandOrControl+Alt+M', toggles.mute], ['CommandOrControl+Alt+D', toggles.dark], ['CommandOrControl+Alt+K', toggles.awake], ['CommandOrControl+Alt+Space', summon]];
  function unregisterHotkeys() { try { electron.globalShortcut.unregisterAll(); } catch (_) {} hotkeyReport = { ok: [], failed: [] }; }
  function registerHotkeys() {
    unregisterHotkeys(); if (!store.get().settings.hotkeys) return hotkeyReport;
    for (const [acc, fn] of HOTKEYS) {
      try { const ok = electron.globalShortcut.register(acc, () => { Promise.resolve(fn()).catch(() => {}); }); (ok ? hotkeyReport.ok : hotkeyReport.failed).push(acc); }
      catch (_) { hotkeyReport.failed.push(acc); }
    }
    if (hotkeyReport.failed.length) log('Hotkeys already used by another app: ' + hotkeyReport.failed.join(', '));
    return hotkeyReport;
  }
  function apply() {
    const s = store.get().settings;
    applyLoginItem(s.autostart);
    if (s.background) { ensureTray(); buildMenu(); } else destroyTray();
    return registerHotkeys();
  }
  return { apply, buildMenu, dispose() { destroyTray(); unregisterHotkeys(); }, hotkeys: () => hotkeyReport, hasTray: () => !!tray, HOTKEYS: HOTKEYS.map(([a]) => a) };
}
module.exports = { createBackground };
